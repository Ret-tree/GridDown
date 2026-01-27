/**
 * RF Line-of-Sight Analysis Module for GridDown
 * Analyzes radio propagation paths between two points
 */

const RFLOSModule = (function() {
    'use strict';

    // ==================== CONSTANTS ====================
    
    const EARTH_RADIUS_M = 6371000;
    const K_FACTOR = 4/3;  // Standard atmospheric refraction
    const EFFECTIVE_RADIUS = EARTH_RADIUS_M * K_FACTOR;
    const SPEED_OF_LIGHT = 299.792458;  // m/μs
    
    const FREQUENCY_PRESETS = {
        meshtastic_us: { freq: 915, name: 'Meshtastic US (915 MHz)' },
        meshtastic_eu: { freq: 868, name: 'Meshtastic EU (868 MHz)' },
        vhf_2m: { freq: 146, name: '2m Amateur (146 MHz)' },
        uhf_70cm: { freq: 446, name: '70cm Amateur (446 MHz)' },
        gmrs: { freq: 462, name: 'GMRS (462 MHz)' },
        frs: { freq: 467, name: 'FRS (467 MHz)' },
        murs: { freq: 151, name: 'MURS (151 MHz)' },
        marine: { freq: 156.8, name: 'Marine VHF (156.8 MHz)' },
        cb: { freq: 27, name: 'CB Radio (27 MHz)' },
        custom: { freq: 915, name: 'Custom Frequency' }
    };

    // ==================== STATE ====================
    
    let pointA = null;
    let pointB = null;
    let antennaHeightA = 2;
    let antennaHeightB = 2;
    let selectedPreset = 'meshtastic_us';
    let customFrequency = 915;
    let currentAnalysis = null;
    let isSelectingPoint = null;  // 'A' or 'B' or null
    let subscribers = [];

    // ==================== CORE CALCULATIONS ====================
    
    function earthCurvatureDrop(distanceM) {
        return (distanceM * distanceM) / (2 * EFFECTIVE_RADIUS);
    }
    
    function fresnelRadius(d1, d2, frequencyMHz) {
        if (d1 <= 0 || d2 <= 0) return 0;
        const wavelengthM = SPEED_OF_LIGHT / frequencyMHz;
        return Math.sqrt((wavelengthM * d1 * d2) / (d1 + d2));
    }
    
    function freeSpacePathLoss(distanceKm, frequencyMHz) {
        if (distanceKm <= 0 || frequencyMHz <= 0) return 0;
        return 20 * Math.log10(distanceKm) + 20 * Math.log10(frequencyMHz) + 32.44;
    }
    
    function haversineDistance(p1, p2) {
        const R = EARTH_RADIUS_M;
        const dLat = (p2.lat - p1.lat) * Math.PI / 180;
        const dLon = (p2.lon - p1.lon) * Math.PI / 180;
        const a = Math.sin(dLat/2) ** 2 +
                  Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
                  Math.sin(dLon/2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }
    
    function calculateBearing(p1, p2) {
        const lat1 = p1.lat * Math.PI / 180;
        const lat2 = p2.lat * Math.PI / 180;
        const dLon = (p2.lon - p1.lon) * Math.PI / 180;
        const y = Math.sin(dLon) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
        return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    }
    
    function bearingToCardinal(bearing) {
        const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
        return dirs[Math.round(bearing / 22.5) % 16];
    }
    
    function interpolatePath(p1, p2, numPoints) {
        const points = [];
        for (let i = 0; i < numPoints; i++) {
            const f = i / (numPoints - 1);
            points.push({
                lat: p1.lat + (p2.lat - p1.lat) * f,
                lon: p1.lon + (p2.lon - p1.lon) * f
            });
        }
        return points;
    }
    
    function getCurrentFrequency() {
        return selectedPreset === 'custom' ? customFrequency : FREQUENCY_PRESETS[selectedPreset].freq;
    }

    // ==================== MAIN ANALYSIS ====================
    
    async function analyzePath() {
        if (!pointA || !pointB) throw new Error('Both points required');
        
        const distance = haversineDistance(pointA, pointB);
        if (distance < 100) throw new Error('Points must be >100m apart');
        if (distance > 500000) throw new Error('Path exceeds 500km limit');
        
        const bearing = calculateBearing(pointA, pointB);
        const freq = getCurrentFrequency();
        const numSamples = Math.max(50, Math.min(200, Math.ceil(distance / 100)));
        const pathPoints = interpolatePath(pointA, pointB, numSamples);
        
        // Fetch elevations
        let elevations;
        try {
            if (typeof ElevationModule !== 'undefined') {
                elevations = await ElevationModule.fetchElevations(pathPoints);
                // Convert feet to meters
                elevations = elevations.map(e => e !== null ? e / 3.28084 : 0);
            } else {
                throw new Error('ElevationModule not available');
            }
        } catch (e) {
            console.error('Elevation fetch failed:', e);
            throw new Error('Could not fetch elevation data');
        }
        
        // Fill any nulls
        for (let i = 0; i < elevations.length; i++) {
            if (elevations[i] === null || elevations[i] === undefined) {
                elevations[i] = i > 0 ? elevations[i-1] : 0;
            }
        }
        
        const elevA = elevations[0];
        const elevB = elevations[elevations.length - 1];
        const losStartH = elevA + antennaHeightA;
        const losEndH = elevB + antennaHeightB;
        
        let minClearancePct = Infinity;
        let minClearanceIdx = 0;
        const obstructions = [];
        const profile = [];
        
        for (let i = 0; i < pathPoints.length; i++) {
            const f = i / (pathPoints.length - 1);
            const distFromA = f * distance;
            const distFromB = distance - distFromA;
            const terrainH = elevations[i];
            const losH = losStartH + (losEndH - losStartH) * f;
            const curveDropA = earthCurvatureDrop(distFromA);
            const curveDropB = earthCurvatureDrop(distFromB);
            const curveDrop = Math.min(curveDropA, curveDropB);
            const effectiveLosH = losH - curveDrop;
            const fresnelR = fresnelRadius(distFromA, distFromB, freq);
            const clearance = effectiveLosH - terrainH;
            const clearancePct = fresnelR > 0 ? (clearance / fresnelR) * 100 : 100;
            
            if (i > 0 && i < pathPoints.length - 1) {
                if (clearancePct < minClearancePct) {
                    minClearancePct = clearancePct;
                    minClearanceIdx = i;
                }
                if (clearance < 0) {
                    obstructions.push({ distance: distFromA, penetration: -clearance, elevation: terrainH });
                }
            }
            
            profile.push({
                distance: distFromA,
                terrain: terrainH,
                los: effectiveLosH,
                fresnelUpper: effectiveLosH + fresnelR,
                fresnelLower: effectiveLosH - fresnelR,
                clearance,
                clearancePct
            });
        }
        
        const fspl = freeSpacePathLoss(distance / 1000, freq);
        let obsLoss = obstructions.length > 0 ? Math.min(obstructions.length * 6, 30) : 
                      minClearancePct < 60 ? (60 - minClearancePct) * 0.1 : 0;
        
        const status = obstructions.length > 0 ? 'obstructed' :
                       minClearancePct >= 60 ? 'clear' : 'marginal';
        
        currentAnalysis = {
            pointA, pointB,
            antennaHeightA, antennaHeightB,
            frequency: freq,
            distance,
            bearing,
            bearingCardinal: bearingToCardinal(bearing),
            elevationA: elevA,
            elevationB: elevB,
            profile,
            fresnel: {
                midpointRadius: fresnelRadius(distance/2, distance/2, freq),
                minClearancePct: Math.round(minClearancePct),
                minClearanceIdx
            },
            obstructions,
            pathLoss: {
                freeSpace: Math.round(fspl * 10) / 10,
                estimated: Math.round((fspl + obsLoss) * 10) / 10
            },
            status
        };
        
        notifySubscribers('analysis', currentAnalysis);
        return currentAnalysis;
    }

    // ==================== RENDERING ====================
    
    function renderProfile(canvas, analysis) {
        if (!canvas || !analysis) return;
        
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;
        
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, W, H);
        
        const pad = { t: 25, b: 35, l: 50, r: 15 };
        const cw = W - pad.l - pad.r;
        const ch = H - pad.t - pad.b;
        
        const profile = analysis.profile;
        const maxDist = analysis.distance;
        
        let minE = Infinity, maxE = -Infinity;
        for (const p of profile) {
            minE = Math.min(minE, p.terrain, p.fresnelLower);
            maxE = Math.max(maxE, p.terrain, p.fresnelUpper);
        }
        const range = maxE - minE || 100;
        minE -= range * 0.1;
        maxE += range * 0.1;
        
        const toX = d => pad.l + (d / maxDist) * cw;
        const toY = e => pad.t + ch - ((e - minE) / (maxE - minE)) * ch;
        
        // Grid
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        const eStep = Math.pow(10, Math.floor(Math.log10((maxE - minE) / 4)));
        for (let e = Math.ceil(minE/eStep)*eStep; e <= maxE; e += eStep) {
            ctx.beginPath();
            ctx.moveTo(pad.l, toY(e));
            ctx.lineTo(W - pad.r, toY(e));
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.font = '9px system-ui';
            ctx.textAlign = 'right';
            ctx.fillText(`${Math.round(e)}m`, pad.l - 4, toY(e) + 3);
        }
        
        // Fresnel zone
        ctx.fillStyle = 'rgba(251,191,36,0.15)';
        ctx.beginPath();
        for (let i = 0; i < profile.length; i++) {
            const x = toX(profile[i].distance);
            const y = toY(profile[i].fresnelUpper);
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        for (let i = profile.length - 1; i >= 0; i--) {
            ctx.lineTo(toX(profile[i].distance), toY(profile[i].fresnelLower));
        }
        ctx.closePath();
        ctx.fill();
        
        ctx.strokeStyle = 'rgba(251,191,36,0.5)';
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Terrain
        ctx.fillStyle = 'rgba(34,197,94,0.3)';
        ctx.beginPath();
        ctx.moveTo(toX(0), toY(minE));
        for (const p of profile) ctx.lineTo(toX(p.distance), toY(p.terrain));
        ctx.lineTo(toX(maxDist), toY(minE));
        ctx.closePath();
        ctx.fill();
        
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < profile.length; i++) {
            const x = toX(profile[i].distance);
            const y = toY(profile[i].terrain);
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        
        // LOS line
        const losColor = analysis.status === 'clear' ? '#22c55e' :
                        analysis.status === 'marginal' ? '#eab308' : '#ef4444';
        ctx.strokeStyle = losColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(toX(0), toY(profile[0].los));
        ctx.lineTo(toX(maxDist), toY(profile[profile.length-1].los));
        ctx.stroke();
        
        // Endpoints
        ctx.fillStyle = '#3b82f6';
        ctx.beginPath();
        ctx.arc(toX(0), toY(profile[0].los), 5, 0, Math.PI*2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(toX(maxDist), toY(profile[profile.length-1].los), 5, 0, Math.PI*2);
        ctx.fill();
        
        // Labels
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 9px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('A', toX(0), toY(profile[0].los) - 10);
        ctx.fillText('B', toX(maxDist), toY(profile[profile.length-1].los) - 10);
        
        // Obstructions
        ctx.fillStyle = '#ef4444';
        for (const obs of analysis.obstructions) {
            ctx.beginPath();
            ctx.arc(toX(obs.distance), toY(obs.elevation), 4, 0, Math.PI*2);
            ctx.fill();
        }
        
        // Title & status
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px system-ui';
        ctx.textAlign = 'left';
        ctx.fillText('RF Path Profile', pad.l, 15);
        
        ctx.fillStyle = losColor;
        ctx.textAlign = 'right';
        ctx.fillText(`${analysis.status.toUpperCase()} (${analysis.fresnel.minClearancePct}%)`, W - pad.r, 15);
        
        // X-axis label
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '9px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(`Distance: ${(maxDist/1000).toFixed(2)} km`, W/2, H - 5);
    }
    
    function renderPanel() {
        const presetOpts = Object.entries(FREQUENCY_PRESETS)
            .map(([k, v]) => `<option value="${k}" ${k === selectedPreset ? 'selected' : ''}>${v.name}</option>`)
            .join('');
        
        const statusColors = { clear: '#22c55e', marginal: '#eab308', obstructed: '#ef4444' };
        const statusIcons = { clear: '✅', marginal: '⚠️', obstructed: '❌' };
        
        let resultsHtml = '';
        if (currentAnalysis) {
            const a = currentAnalysis;
            resultsHtml = `
                <div style="margin-top:12px;padding:12px;background:rgba(0,0,0,0.3);border-radius:8px;border:1px solid rgba(255,255,255,0.1)">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                        <span style="font-weight:600;font-size:13px">Analysis Results</span>
                        <span style="color:${statusColors[a.status]};font-weight:600;font-size:12px">
                            ${statusIcons[a.status]} ${a.status.toUpperCase()}
                        </span>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;margin-bottom:12px">
                        <span style="color:rgba(255,255,255,0.6)">Distance:</span>
                        <span style="text-align:right">${(a.distance/1000).toFixed(2)} km</span>
                        <span style="color:rgba(255,255,255,0.6)">Bearing:</span>
                        <span style="text-align:right">${a.bearing.toFixed(1)}° ${a.bearingCardinal}</span>
                        <span style="color:rgba(255,255,255,0.6)">Fresnel Clearance:</span>
                        <span style="text-align:right;color:${statusColors[a.status]}">${a.fresnel.minClearancePct}%</span>
                        <span style="color:rgba(255,255,255,0.6)">Free-Space Loss:</span>
                        <span style="text-align:right">${a.pathLoss.freeSpace} dB</span>
                        <span style="color:rgba(255,255,255,0.6)">Estimated Loss:</span>
                        <span style="text-align:right">${a.pathLoss.estimated} dB</span>
                    </div>
                    <canvas id="rflos-canvas" width="340" height="180" style="width:100%;border-radius:4px;background:#0f172a"></canvas>
                    ${a.obstructions.length > 0 ? `<div style="margin-top:8px;padding:6px;background:rgba(239,68,68,0.15);border-radius:4px;font-size:10px;color:#fca5a5">
                        ⚠️ ${a.obstructions.length} obstruction${a.obstructions.length > 1 ? 's' : ''} blocking line of sight
                    </div>` : ''}
                </div>
            `;
        }
        
        return `
            <div style="padding:12px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                    <span style="font-weight:600;font-size:14px">📡 RF Line of Sight</span>
                    ${currentAnalysis ? `<button class="btn btn--secondary" id="rflos-clear" style="padding:4px 8px;font-size:10px">Clear</button>` : ''}
                </div>
                
                <!-- Point A -->
                <div style="margin-bottom:10px;padding:10px;background:rgba(59,130,246,0.1);border-radius:8px;border:1px solid rgba(59,130,246,0.3)">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                        <span style="font-size:12px;font-weight:500;color:#60a5fa">📍 Point A</span>
                        <button class="btn btn--secondary" id="rflos-select-a" style="padding:3px 8px;font-size:10px;${isSelectingPoint === 'A' ? 'background:#3b82f6;color:#fff' : ''}">
                            ${isSelectingPoint === 'A' ? 'Click Map...' : pointA ? 'Change' : 'Select'}
                        </button>
                    </div>
                    ${pointA ? `<div style="font-size:10px;color:rgba(255,255,255,0.6);margin-bottom:4px">${pointA.lat.toFixed(5)}°, ${pointA.lon.toFixed(5)}°</div>` : 
                              `<div style="font-size:10px;color:rgba(255,255,255,0.4)">Click "Select" then click map</div>`}
                    <div style="display:flex;align-items:center;gap:6px;margin-top:6px">
                        <label style="font-size:10px;color:rgba(255,255,255,0.6)">Antenna:</label>
                        <input type="number" id="rflos-ant-a" value="${antennaHeightA}" min="0" max="500" step="0.5"
                               style="width:55px;padding:3px;font-size:10px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:4px;color:#fff">
                        <span style="font-size:10px;color:rgba(255,255,255,0.5)">m</span>
                    </div>
                </div>
                
                <!-- Point B -->
                <div style="margin-bottom:10px;padding:10px;background:rgba(34,197,94,0.1);border-radius:8px;border:1px solid rgba(34,197,94,0.3)">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                        <span style="font-size:12px;font-weight:500;color:#4ade80">📍 Point B</span>
                        <button class="btn btn--secondary" id="rflos-select-b" style="padding:3px 8px;font-size:10px;${isSelectingPoint === 'B' ? 'background:#22c55e;color:#fff' : ''}">
                            ${isSelectingPoint === 'B' ? 'Click Map...' : pointB ? 'Change' : 'Select'}
                        </button>
                    </div>
                    ${pointB ? `<div style="font-size:10px;color:rgba(255,255,255,0.6);margin-bottom:4px">${pointB.lat.toFixed(5)}°, ${pointB.lon.toFixed(5)}°</div>` : 
                              `<div style="font-size:10px;color:rgba(255,255,255,0.4)">Click "Select" then click map</div>`}
                    <div style="display:flex;align-items:center;gap:6px;margin-top:6px">
                        <label style="font-size:10px;color:rgba(255,255,255,0.6)">Antenna:</label>
                        <input type="number" id="rflos-ant-b" value="${antennaHeightB}" min="0" max="500" step="0.5"
                               style="width:55px;padding:3px;font-size:10px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:4px;color:#fff">
                        <span style="font-size:10px;color:rgba(255,255,255,0.5)">m</span>
                    </div>
                </div>
                
                <!-- Frequency -->
                <div style="margin-bottom:12px;padding:10px;background:rgba(255,255,255,0.05);border-radius:8px">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                        <label style="font-size:11px;font-weight:500">📻 Frequency</label>
                        <select id="rflos-preset" style="flex:1;padding:4px;font-size:10px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:4px;color:#fff">
                            ${presetOpts}
                        </select>
                    </div>
                    <div style="display:flex;align-items:center;gap:6px">
                        <input type="number" id="rflos-freq" value="${getCurrentFrequency()}" min="1" max="100000" step="0.1"
                               style="width:70px;padding:4px;font-size:10px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:4px;color:#fff">
                        <span style="font-size:10px;color:rgba(255,255,255,0.5)">MHz</span>
                    </div>
                </div>
                
                <!-- Analyze Button -->
                <button class="btn btn--primary" id="rflos-analyze" style="width:100%;padding:10px;font-size:12px;${!pointA || !pointB ? 'opacity:0.5;cursor:not-allowed' : ''}" ${!pointA || !pointB ? 'disabled' : ''}>
                    🔍 Analyze RF Path
                </button>
                
                ${resultsHtml}
                
                <div style="margin-top:10px;font-size:9px;color:rgba(255,255,255,0.3);text-align:center">
                    Elevation: Copernicus DEM GLO-90 © ESA
                </div>
            </div>
        `;
    }
    
    function attachHandlers(container) {
        const selectA = container.querySelector('#rflos-select-a');
        const selectB = container.querySelector('#rflos-select-b');
        const antA = container.querySelector('#rflos-ant-a');
        const antB = container.querySelector('#rflos-ant-b');
        const presetSel = container.querySelector('#rflos-preset');
        const freqInput = container.querySelector('#rflos-freq');
        const analyzeBtn = container.querySelector('#rflos-analyze');
        const clearBtn = container.querySelector('#rflos-clear');
        
        if (selectA) {
            selectA.onclick = () => {
                isSelectingPoint = isSelectingPoint === 'A' ? null : 'A';
                notifySubscribers('selecting', isSelectingPoint);
            };
        }
        
        if (selectB) {
            selectB.onclick = () => {
                isSelectingPoint = isSelectingPoint === 'B' ? null : 'B';
                notifySubscribers('selecting', isSelectingPoint);
            };
        }
        
        if (antA) antA.onchange = e => { antennaHeightA = parseFloat(e.target.value) || 2; };
        if (antB) antB.onchange = e => { antennaHeightB = parseFloat(e.target.value) || 2; };
        
        if (presetSel) {
            presetSel.onchange = e => {
                selectedPreset = e.target.value;
                if (freqInput) freqInput.value = getCurrentFrequency();
            };
        }
        
        if (freqInput) {
            freqInput.onchange = e => {
                customFrequency = parseFloat(e.target.value) || 915;
                selectedPreset = 'custom';
            };
        }
        
        if (analyzeBtn) {
            analyzeBtn.onclick = async () => {
                analyzeBtn.disabled = true;
                analyzeBtn.textContent = '⏳ Analyzing...';
                try {
                    await analyzePath();
                } catch (err) {
                    alert('Analysis failed: ' + err.message);
                }
                analyzeBtn.disabled = false;
                analyzeBtn.textContent = '🔍 Analyze RF Path';
                notifySubscribers('update', null);
            };
        }
        
        if (clearBtn) {
            clearBtn.onclick = () => {
                pointA = null;
                pointB = null;
                currentAnalysis = null;
                notifySubscribers('clear', null);
            };
        }
        
        // Render profile canvas if analysis exists
        setTimeout(() => {
            const canvas = container.querySelector('#rflos-canvas');
            if (canvas && currentAnalysis) {
                renderProfile(canvas, currentAnalysis);
            }
        }, 50);
    }
    
    function handleMapClick(lat, lon) {
        if (!isSelectingPoint) return false;
        
        if (isSelectingPoint === 'A') {
            pointA = { lat, lon };
        } else if (isSelectingPoint === 'B') {
            pointB = { lat, lon };
        }
        
        isSelectingPoint = null;
        currentAnalysis = null;
        notifySubscribers('pointSet', { pointA, pointB });
        return true;
    }
    
    function renderMapOverlay(ctx, latLonToPixel) {
        if (pointA) {
            const pA = latLonToPixel(pointA.lat, pointA.lon);
            ctx.fillStyle = '#3b82f6';
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(pA.x, pA.y, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 10px system-ui';
            ctx.textAlign = 'center';
            ctx.fillText('A', pA.x, pA.y + 3);
        }
        
        if (pointB) {
            const pB = latLonToPixel(pointB.lat, pointB.lon);
            ctx.fillStyle = '#22c55e';
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(pB.x, pB.y, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 10px system-ui';
            ctx.textAlign = 'center';
            ctx.fillText('B', pB.x, pB.y + 3);
        }
        
        if (pointA && pointB) {
            const pA = latLonToPixel(pointA.lat, pointA.lon);
            const pB = latLonToPixel(pointB.lat, pointB.lon);
            
            const color = currentAnalysis ? 
                (currentAnalysis.status === 'clear' ? '#22c55e' : 
                 currentAnalysis.status === 'marginal' ? '#eab308' : '#ef4444') : '#60a5fa';
            
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.setLineDash(currentAnalysis ? [] : [6, 4]);
            ctx.beginPath();
            ctx.moveTo(pA.x, pA.y);
            ctx.lineTo(pB.x, pB.y);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // Draw obstructions on map
            if (currentAnalysis && currentAnalysis.obstructions.length > 0) {
                ctx.fillStyle = '#ef4444';
                for (const obs of currentAnalysis.obstructions) {
                    const idx = Math.round((obs.distance / currentAnalysis.distance) * (currentAnalysis.profile.length - 1));
                    if (idx > 0 && idx < currentAnalysis.profile.length) {
                        const f = obs.distance / currentAnalysis.distance;
                        const obsLat = pointA.lat + (pointB.lat - pointA.lat) * f;
                        const obsLon = pointA.lon + (pointB.lon - pointA.lon) * f;
                        const pObs = latLonToPixel(obsLat, obsLon);
                        ctx.beginPath();
                        ctx.arc(pObs.x, pObs.y, 5, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }
        }
    }

    // ==================== EVENTS ====================
    
    function notifySubscribers(event, data) {
        subscribers.forEach(fn => {
            try { fn(event, data); } catch (e) { console.error('RFLOS event error:', e); }
        });
    }
    
    function subscribe(callback) {
        subscribers.push(callback);
        return () => { subscribers = subscribers.filter(fn => fn !== callback); };
    }

    // ==================== PUBLIC API ====================
    
    function init() {
        console.log('RFLOSModule initialized');
        return true;
    }
    
    return {
        init,
        renderPanel,
        attachHandlers,
        handleMapClick,
        renderMapOverlay,
        analyzePath,
        renderProfile,
        subscribe,
        getPresets: () => ({ ...FREQUENCY_PRESETS }),
        getState: () => ({ pointA, pointB, antennaHeightA, antennaHeightB, selectedPreset, currentAnalysis }),
        isSelecting: () => isSelectingPoint !== null,
        clearAnalysis: () => { pointA = null; pointB = null; currentAnalysis = null; isSelectingPoint = null; },
        setPointA: (lat, lon) => { pointA = { lat, lon }; },
        setPointB: (lat, lon) => { pointB = { lat, lon }; },
        // Expose calculations for testing
        utils: { earthCurvatureDrop, fresnelRadius, freeSpacePathLoss, haversineDistance, calculateBearing }
    };
})();

if (typeof window !== 'undefined') window.RFLOSModule = RFLOSModule;
