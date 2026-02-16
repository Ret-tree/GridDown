/**
 * GridDown Rangefinder Resection Module
 * 
 * GPS-denied position fixing using manual distance measurements to known landmarks.
 * User measures distances with any rangefinder (laser, optical, or estimated)
 * and enters values manually. Module calculates position via trilateration.
 * 
 * @version 1.0.0
 */
const RangefinderModule = (function() {
    'use strict';

    // ==================== STATE ====================
    
    let state = {
        // Landmarks with measurements
        landmarks: [],
        
        // Calculated fix
        lastFix: null,
        
        // Fix history
        fixHistory: [],
        
        // Settings
        settings: {
            minLandmarks: 3,
            maxLandmarks: 10,
            distanceUnit: 'meters',  // 'meters' or 'yards'
            confidenceLevel: 0.95
        }
    };

    // ==================== CONSTANTS ====================
    
    const DEG_TO_RAD = Math.PI / 180;
    const RAD_TO_DEG = 180 / Math.PI;
    const EARTH_RADIUS = 6371000;  // meters
    
    // GDOP quality thresholds
    const GDOP_THRESHOLDS = {
        excellent: 2,
        good: 4,
        moderate: 6,
        poor: 8
    };

    // ==================== COORDINATE UTILITIES ====================

    /**
     * Calculate haversine distance between two lat/lon points
     * @param {Object} p1 - First point {lat, lon}
     * @param {Object} p2 - Second point {lat, lon}
     * @returns {number} Distance in meters
     */
    function haversineDistance(p1, p2) {
        const lat1 = p1.lat * DEG_TO_RAD;
        const lat2 = p2.lat * DEG_TO_RAD;
        const dLat = (p2.lat - p1.lat) * DEG_TO_RAD;
        const dLon = (p2.lon - p1.lon) * DEG_TO_RAD;
        
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1) * Math.cos(lat2) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        
        return EARTH_RADIUS * c;
    }

    /**
     * Calculate centroid of points
     * @param {Array} points - Array of {lat, lon} objects
     * @returns {Object} Centroid {lat, lon}
     */
    function calculateCentroid(points) {
        if (points.length === 0) return { lat: 0, lon: 0 };
        
        let sumLat = 0, sumLon = 0;
        for (const p of points) {
            sumLat += p.lat;
            sumLon += p.lon;
        }
        
        return {
            lat: sumLat / points.length,
            lon: sumLon / points.length
        };
    }

    /**
     * Convert lat/lon to local East-North-Up coordinates
     * @param {Object} point - Point {lat, lon}
     * @param {Object} origin - Origin {lat, lon}
     * @returns {Object} Local coordinates {e, n}
     */
    function toENU(point, origin) {
        const dLat = (point.lat - origin.lat) * DEG_TO_RAD;
        const dLon = (point.lon - origin.lon) * DEG_TO_RAD;
        const latRad = origin.lat * DEG_TO_RAD;
        
        const n = dLat * EARTH_RADIUS;
        const e = dLon * EARTH_RADIUS * Math.cos(latRad);
        
        return { e, n };
    }

    /**
     * Convert local ENU coordinates back to lat/lon
     * @param {Object} enu - Local coordinates {e, n}
     * @param {Object} origin - Origin {lat, lon}
     * @returns {Object} Geographic coordinates {lat, lon}
     */
    function fromENU(enu, origin) {
        const latRad = origin.lat * DEG_TO_RAD;
        
        const dLat = enu.n / EARTH_RADIUS;
        const dLon = enu.e / (EARTH_RADIUS * Math.cos(latRad));
        
        return {
            lat: origin.lat + dLat * RAD_TO_DEG,
            lon: origin.lon + dLon * RAD_TO_DEG
        };
    }

    // ==================== TRILATERATION ====================

    /**
     * Solve trilateration problem using nonlinear least squares
     * @param {Array} landmarks - Array of {position: {lat, lon}, distance: number}
     * @returns {Object} Solution {position, accuracy, gdop, residuals}
     */
    function trilaterate(landmarks) {
        if (landmarks.length < 3) {
            return { error: 'Need at least 3 landmarks with distances' };
        }
        
        // Filter landmarks with valid distances
        const validLandmarks = landmarks.filter(lm => 
            lm.distance !== null && 
            lm.distance !== undefined && 
            lm.distance > 0 &&
            lm.position && 
            lm.position.lat !== undefined && 
            lm.position.lon !== undefined
        );
        
        if (validLandmarks.length < 3) {
            return { error: 'Need at least 3 landmarks with valid distances' };
        }
        
        // Calculate centroid as origin for local coordinates
        const positions = validLandmarks.map(lm => lm.position);
        const origin = calculateCentroid(positions);
        
        // Convert to local ENU coordinates
        const localLandmarks = validLandmarks.map(lm => ({
            enu: toENU(lm.position, origin),
            distance: lm.distance,
            name: lm.name
        }));
        
        // Initial guess: centroid (0,0 in local coords)
        let x = 0, y = 0;
        
        // Gauss-Newton iteration
        const maxIterations = 50;
        const tolerance = 0.01;  // meters
        
        for (let iter = 0; iter < maxIterations; iter++) {
            const J = [];   // Jacobian matrix
            const r = [];   // Residuals
            
            for (const lm of localLandmarks) {
                const dx = x - lm.enu.e;
                const dy = y - lm.enu.n;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist < 0.001) {
                    // Avoid division by zero
                    r.push(lm.distance);
                    J.push([1, 0]);
                } else {
                    r.push(dist - lm.distance);
                    J.push([dx / dist, dy / dist]);
                }
            }
            
            // Solve normal equations: (J'J) * delta = -J'r
            const delta = solveNormalEquations(J, r);
            
            x -= delta[0];
            y -= delta[1];
            
            // Check convergence
            const deltaMag = Math.sqrt(delta[0] * delta[0] + delta[1] * delta[1]);
            if (deltaMag < tolerance) {
                break;
            }
        }
        
        // Convert back to lat/lon
        const position = fromENU({ e: x, n: y }, origin);
        
        // Calculate final residuals
        const residuals = [];
        let sumSquaredResiduals = 0;
        
        for (const lm of validLandmarks) {
            const calculatedDist = haversineDistance(position, lm.position);
            const residual = calculatedDist - lm.distance;
            residuals.push({
                name: lm.name,
                measured: lm.distance,
                calculated: calculatedDist,
                residual: residual
            });
            sumSquaredResiduals += residual * residual;
        }
        
        // Calculate accuracy estimate (RMS of residuals)
        const rms = Math.sqrt(sumSquaredResiduals / validLandmarks.length);
        
        // Calculate GDOP
        const gdop = calculateGDOP(localLandmarks, { e: x, n: y });
        
        // Estimate position accuracy (95% confidence)
        const accuracy = rms * gdop * 1.96;
        
        return {
            position: position,
            accuracy: accuracy,
            rms: rms,
            gdop: gdop,
            gdopQuality: getGDOPQuality(gdop),
            residuals: residuals,
            landmarkCount: validLandmarks.length,
            timestamp: new Date()
        };
    }

    /**
     * Solve normal equations using direct 2x2 inversion
     * @param {Array} J - Jacobian matrix (Nx2)
     * @param {Array} r - Residual vector (Nx1)
     * @returns {Array} Solution delta [dx, dy]
     */
    function solveNormalEquations(J, r) {
        // Calculate J'J (2x2 matrix)
        let a = 0, b = 0, c = 0, d = 0;
        let rx = 0, ry = 0;
        
        for (let i = 0; i < J.length; i++) {
            a += J[i][0] * J[i][0];
            b += J[i][0] * J[i][1];
            c += J[i][1] * J[i][0];
            d += J[i][1] * J[i][1];
            
            rx += J[i][0] * r[i];
            ry += J[i][1] * r[i];
        }
        
        // Invert 2x2 matrix
        const det = a * d - b * c;
        if (Math.abs(det) < 1e-10) {
            return [0, 0];  // Singular matrix
        }
        
        const invA = d / det;
        const invB = -b / det;
        const invC = -c / det;
        const invD = a / det;
        
        // Multiply by -J'r
        return [
            invA * rx + invB * ry,
            invC * rx + invD * ry
        ];
    }

    /**
     * Calculate Geometric Dilution of Precision
     * @param {Array} landmarks - Landmarks in local ENU coordinates
     * @param {Object} position - Observer position in ENU {e, n}
     * @returns {number} GDOP value
     */
    function calculateGDOP(landmarks, position) {
        const H = [];
        
        for (const lm of landmarks) {
            const dx = lm.enu.e - position.e;
            const dy = lm.enu.n - position.n;
            const d = Math.sqrt(dx * dx + dy * dy);
            
            if (d > 0.001) {
                H.push([dx / d, dy / d]);
            }
        }
        
        if (H.length < 2) return 99;
        
        // Calculate H'H
        let a = 0, b = 0, c = 0, d = 0;
        for (const row of H) {
            a += row[0] * row[0];
            b += row[0] * row[1];
            c += row[1] * row[0];
            d += row[1] * row[1];
        }
        
        // Invert 2x2 matrix
        const det = a * d - b * c;
        if (Math.abs(det) < 1e-10) return 99;
        
        const invA = d / det;
        const invD = a / det;
        
        // GDOP = sqrt(trace of inverse)
        return Math.sqrt(invA + invD);
    }

    /**
     * Get GDOP quality label
     * @param {number} gdop - GDOP value
     * @returns {string} Quality label
     */
    function getGDOPQuality(gdop) {
        if (gdop <= GDOP_THRESHOLDS.excellent) return 'excellent';
        if (gdop <= GDOP_THRESHOLDS.good) return 'good';
        if (gdop <= GDOP_THRESHOLDS.moderate) return 'moderate';
        return 'poor';
    }

    // ==================== LANDMARK MANAGEMENT ====================

    /**
     * Add a landmark
     * @param {Object} landmark - Landmark data
     * @returns {Object} Added landmark with ID
     */
    function addLandmark(landmark) {
        if (state.landmarks.length >= state.settings.maxLandmarks) {
            return { error: `Maximum ${state.settings.maxLandmarks} landmarks allowed` };
        }
        
        const lm = {
            id: 'lm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            name: landmark.name || 'Landmark ' + (state.landmarks.length + 1),
            position: {
                lat: landmark.lat,
                lon: landmark.lon
            },
            elevation: landmark.elevation || null,
            distance: landmark.distance || null,
            source: landmark.source || 'manual',  // 'waypoint', 'map_tap', 'manual'
            waypointId: landmark.waypointId || null,
            icon: landmark.icon || '📍',
            addedAt: new Date()
        };
        
        state.landmarks.push(lm);
        return lm;
    }

    /**
     * Update landmark distance
     * @param {string} id - Landmark ID
     * @param {number} distance - Measured distance in meters
     */
    function updateDistance(id, distance) {
        const lm = state.landmarks.find(l => l.id === id);
        if (lm) {
            lm.distance = distance;
            lm.measuredAt = new Date();
        }
        return lm;
    }

    /**
     * Remove a landmark
     * @param {string} id - Landmark ID
     */
    function removeLandmark(id) {
        const index = state.landmarks.findIndex(l => l.id === id);
        if (index >= 0) {
            state.landmarks.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Clear all landmarks
     */
    function clearLandmarks() {
        state.landmarks = [];
        state.lastFix = null;
    }

    /**
     * Get all landmarks
     */
    function getLandmarks() {
        return [...state.landmarks];
    }

    /**
     * Get landmarks with valid distances
     */
    function getMeasuredLandmarks() {
        return state.landmarks.filter(lm => lm.distance !== null && lm.distance > 0);
    }

    /**
     * Add landmark from waypoint
     * @param {Object} waypoint - Waypoint object from State
     */
    function addFromWaypoint(waypoint) {
        if (!waypoint) return { error: 'Invalid waypoint' };
        
        // Get lat/lon from waypoint (may need conversion from x/y)
        let lat = waypoint.lat;
        let lon = waypoint.lon;
        
        if (lat === undefined || lon === undefined) {
            // Convert from x/y if needed (using GridDown's default conversion)
            lat = 37.4215 + (waypoint.y - 50) * 0.002;
            lon = -119.1892 + (waypoint.x - 50) * 0.004;
        }
        
        const wpType = (typeof Constants !== 'undefined' && Constants.WAYPOINT_TYPES) 
            ? Constants.WAYPOINT_TYPES[waypoint.type] 
            : null;
        
        return addLandmark({
            name: waypoint.name,
            lat: lat,
            lon: lon,
            elevation: waypoint.elevation,
            source: 'waypoint',
            waypointId: waypoint.id,
            icon: wpType?.icon || '📍'
        });
    }

    /**
     * Add landmark from map tap
     * @param {number} lat - Latitude
     * @param {number} lon - Longitude
     * @param {string} name - Optional name
     */
    function addFromMapTap(lat, lon, name = null) {
        return addLandmark({
            name: name || `Point at ${lat.toFixed(4)}°, ${lon.toFixed(4)}°`,
            lat: lat,
            lon: lon,
            source: 'map_tap',
            icon: '🎯'
        });
    }

    // ==================== FIX CALCULATION ====================

    /**
     * Calculate position fix from current landmarks
     * @returns {Object} Fix result
     */
    function calculateFix() {
        const result = trilaterate(state.landmarks);
        
        if (!result.error) {
            state.lastFix = result;
            state.fixHistory.push({
                ...result,
                id: 'fix_' + Date.now()
            });
            
            // Keep history limited
            if (state.fixHistory.length > 50) {
                state.fixHistory.shift();
            }
        }
        
        return result;
    }

    /**
     * Get last calculated fix
     */
    function getLastFix() {
        return state.lastFix;
    }

    /**
     * Get fix history
     */
    function getFixHistory() {
        return [...state.fixHistory];
    }

    /**
     * Clear fix history
     */
    function clearFixHistory() {
        state.fixHistory = [];
        state.lastFix = null;
    }

    // ==================== PREVIEW / GDOP ====================

    /**
     * Preview GDOP for current landmark configuration
     * Uses estimated position (centroid) to calculate geometry quality
     * @returns {Object} GDOP preview
     */
    function previewGDOP() {
        const landmarks = state.landmarks.filter(lm => 
            lm.position && lm.position.lat !== undefined
        );
        
        if (landmarks.length < 3) {
            return {
                gdop: null,
                quality: 'insufficient',
                message: `Need ${3 - landmarks.length} more landmark(s)`
            };
        }
        
        // Use centroid as estimated position
        const positions = landmarks.map(lm => lm.position);
        const centroid = calculateCentroid(positions);
        
        // Convert to local coordinates
        const localLandmarks = landmarks.map(lm => ({
            enu: toENU(lm.position, centroid)
        }));
        
        const gdop = calculateGDOP(localLandmarks, { e: 0, n: 0 });
        const quality = getGDOPQuality(gdop);
        
        let message;
        switch (quality) {
            case 'excellent':
                message = 'Excellent geometry - high accuracy expected';
                break;
            case 'good':
                message = 'Good geometry - reliable fix';
                break;
            case 'moderate':
                message = 'Moderate geometry - consider adding landmarks';
                break;
            case 'poor':
                message = 'Poor geometry - landmarks too clustered or collinear';
                break;
        }
        
        return { gdop, quality, message, landmarkCount: landmarks.length };
    }

    // ==================== UNIT CONVERSION ====================

    /**
     * Convert distance to meters
     * @param {number} value - Distance value
     * @param {string} unit - Unit ('meters', 'yards', 'feet')
     * @returns {number} Distance in meters
     */
    function toMeters(value, unit) {
        switch (unit) {
            case 'yards':
                return value * 0.9144;
            case 'feet':
                return value * 0.3048;
            case 'kilometers':
                return value * 1000;
            case 'miles':
                return value * 1609.344;
            default:
                return value;
        }
    }

    /**
     * Convert meters to display unit
     * @param {number} meters - Distance in meters
     * @param {string} unit - Target unit
     * @returns {number} Converted distance
     */
    function fromMeters(meters, unit) {
        switch (unit) {
            case 'yards':
                return meters / 0.9144;
            case 'feet':
                return meters / 0.3048;
            case 'kilometers':
                return meters / 1000;
            case 'miles':
                return meters / 1609.344;
            default:
                return meters;
        }
    }

    // ==================== UI RENDERING ====================

    /**
     * Render the resection widget
     * @returns {string} HTML string
     */
    function renderWidget() {
        const landmarks = state.landmarks;
        const measured = getMeasuredLandmarks();
        const gdopPreview = previewGDOP();
        const lastFix = state.lastFix;
        
        return `
            <div style="background:var(--color-bg-elevated);border-radius:10px;padding:12px;margin-bottom:12px">
                <div style="font-size:14px;font-weight:600;margin-bottom:8px">📐 Rangefinder Resection</div>
                <div style="font-size:11px;color:rgba(255,255,255,0.6);margin-bottom:12px">
                    Measure distances to known landmarks with any rangefinder.
                    Enter values below to calculate your position.
                </div>
                
                <!-- Add Landmark Buttons -->
                <div style="display:flex;gap:8px;margin-bottom:12px">
                    <button id="resection-add-waypoint" class="btn btn--secondary" style="flex:1;padding:8px;font-size:11px">
                        📌 From Waypoint
                    </button>
                    <button id="resection-add-map" class="btn btn--secondary" style="flex:1;padding:8px;font-size:11px">
                        🗺️ Tap on Map
                    </button>
                </div>
                
                <!-- Landmarks List -->
                <div style="margin-bottom:12px">
                    <div style="font-size:12px;font-weight:600;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
                        <span>Landmarks (${landmarks.length})</span>
                        ${landmarks.length > 0 ? `
                            <button id="resection-clear-all" style="font-size:10px;color:#ef4444;background:none;border:none;cursor:pointer">
                                Clear All
                            </button>
                        ` : ''}
                    </div>
                    
                    ${landmarks.length > 0 ? `
                        <div style="display:flex;flex-direction:column;gap:8px;max-height:250px;overflow-y:auto">
                            ${landmarks.map(lm => `
                                <div class="resection-landmark-item" data-id="${lm.id}" style="background:rgba(0,0,0,0.2);border-radius:8px;padding:10px">
                                    <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
                                        <div style="display:flex;align-items:center;gap:8px">
                                            <span style="font-size:16px">${lm.icon}</span>
                                            <div>
                                                <div style="font-size:12px;font-weight:600">${lm.name}</div>
                                                <div style="font-size:10px;color:rgba(255,255,255,0.5)">
                                                    ${lm.position.lat.toFixed(4)}°, ${lm.position.lon.toFixed(4)}°
                                                </div>
                                            </div>
                                        </div>
                                        <button class="resection-remove-lm" data-id="${lm.id}" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:14px">
                                            ✕
                                        </button>
                                    </div>
                                    <div style="display:flex;align-items:center;gap:8px">
                                        <label style="font-size:10px;color:rgba(255,255,255,0.5);white-space:nowrap">Distance:</label>
                                        <input type="number" 
                                               class="resection-distance-input" 
                                               data-id="${lm.id}"
                                               value="${lm.distance || ''}" 
                                               placeholder="Enter distance"
                                               min="0"
                                               step="0.1"
                                               style="flex:1;padding:6px 8px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:4px;color:white;font-size:12px">
                                        <span style="font-size:11px;color:rgba(255,255,255,0.5)">m</span>
                                        ${lm.distance ? `<span style="color:#22c55e;font-size:12px">✓</span>` : ''}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    ` : `
                        <div style="text-align:center;padding:20px;color:rgba(255,255,255,0.4);font-size:11px">
                            No landmarks added.<br>Add landmarks from waypoints or tap on map.
                        </div>
                    `}
                </div>
                
                <!-- GDOP Indicator -->
                ${landmarks.length > 0 ? `
                    <div style="background:rgba(0,0,0,0.2);border-radius:8px;padding:10px;margin-bottom:12px">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                            <span style="font-size:11px;color:rgba(255,255,255,0.5)">Geometry Quality</span>
                            <span style="font-size:11px;font-weight:600;color:${getGDOPColor(gdopPreview.quality)}">${gdopPreview.quality.toUpperCase()}</span>
                        </div>
                        <div style="height:6px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden">
                            <div style="height:100%;width:${getGDOPBarWidth(gdopPreview.gdop)}%;background:${getGDOPColor(gdopPreview.quality)};border-radius:3px"></div>
                        </div>
                        <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-top:4px">
                            ${gdopPreview.message}
                        </div>
                    </div>
                ` : ''}
                
                <!-- Calculate Button -->
                <button id="resection-calculate" 
                        class="btn btn--primary btn--full" 
                        style="padding:10px"
                        ${measured.length < 3 ? 'disabled' : ''}>
                    📍 Calculate Position
                    ${measured.length < 3 ? `(Need ${3 - measured.length} more)` : ''}
                </button>
                
                <!-- Result -->
                ${lastFix ? `
                    <div style="margin-top:12px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:8px;padding:12px">
                        <div style="font-size:12px;color:#22c55e;font-weight:600;margin-bottom:8px">📍 Position Fix</div>
                        <div style="font-size:16px;font-weight:700;margin-bottom:4px">
                            ${lastFix.position.lat.toFixed(5)}° N, ${Math.abs(lastFix.position.lon).toFixed(5)}° W
                        </div>
                        <div style="font-size:11px;color:rgba(255,255,255,0.6)">
                            Accuracy: ±${lastFix.accuracy.toFixed(1)} m (95% conf) • 
                            GDOP: ${lastFix.gdop.toFixed(1)} (${lastFix.gdopQuality})
                        </div>
                        <div style="display:flex;gap:8px;margin-top:10px">
                            <button id="resection-apply-fix" class="btn btn--primary" style="flex:1;padding:8px;font-size:11px">
                                ✓ Apply to Map
                            </button>
                            <button id="resection-show-details" class="btn btn--secondary" style="padding:8px;font-size:11px">
                                Details
                            </button>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Get GDOP bar color
     */
    function getGDOPColor(quality) {
        switch (quality) {
            case 'excellent': return '#22c55e';
            case 'good': return '#84cc16';
            case 'moderate': return '#f59e0b';
            case 'poor': return '#ef4444';
            default: return '#6b7280';
        }
    }

    /**
     * Get GDOP bar width percentage
     */
    function getGDOPBarWidth(gdop) {
        if (gdop === null) return 0;
        // Invert so lower GDOP = wider bar
        return Math.max(10, Math.min(100, 100 - (gdop - 1) * 10));
    }

    /**
     * Render waypoint selector modal content
     * @param {Array} waypoints - Available waypoints
     * @returns {string} HTML string
     */
    function renderWaypointSelector(waypoints) {
        const existingIds = state.landmarks
            .filter(lm => lm.waypointId)
            .map(lm => lm.waypointId);
        
        const available = waypoints.filter(wp => !existingIds.includes(wp.id));
        
        if (available.length === 0) {
            return `
                <div style="text-align:center;padding:20px;color:rgba(255,255,255,0.5)">
                    No available waypoints. Create waypoints first or use "Tap on Map".
                </div>
            `;
        }
        
        return `
            <div style="max-height:300px;overflow-y:auto">
                ${available.map(wp => {
                    const wpType = (typeof Constants !== 'undefined' && Constants.WAYPOINT_TYPES)
                        ? Constants.WAYPOINT_TYPES[wp.type]
                        : null;
                    return `
                        <div class="resection-wp-option" data-wp-id="${wp.id}" 
                             style="display:flex;align-items:center;gap:12px;padding:12px;background:rgba(0,0,0,0.2);border-radius:8px;margin-bottom:8px;cursor:pointer;transition:background 0.2s"
                             onmouseover="this.style.background='rgba(59,130,246,0.2)'"
                             onmouseout="this.style.background='rgba(0,0,0,0.2)'">
                            <span style="font-size:20px">${wpType?.icon || '📍'}</span>
                            <div style="flex:1">
                                <div style="font-size:13px;font-weight:600">${wp.name}</div>
                                <div style="font-size:10px;color:rgba(255,255,255,0.5)">
                                    ${wp.type || 'custom'} • ${wp.notes || 'No notes'}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    /**
     * Render fix details modal content
     * @returns {string} HTML string
     */
    function renderFixDetails() {
        const fix = state.lastFix;
        if (!fix) return '<div>No fix calculated</div>';
        
        return `
            <div style="padding:12px">
                <div style="font-size:14px;font-weight:600;margin-bottom:12px">Position Fix Details</div>
                
                <div style="background:rgba(0,0,0,0.2);border-radius:8px;padding:12px;margin-bottom:12px">
                    <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:4px">Position</div>
                    <div style="font-size:16px;font-weight:600">
                        ${fix.position.lat.toFixed(6)}°, ${fix.position.lon.toFixed(6)}°
                    </div>
                </div>
                
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
                    <div style="background:rgba(0,0,0,0.2);border-radius:8px;padding:10px;text-align:center">
                        <div style="font-size:10px;color:rgba(255,255,255,0.5)">ACCURACY (95%)</div>
                        <div style="font-size:18px;font-weight:600">±${fix.accuracy.toFixed(1)} m</div>
                    </div>
                    <div style="background:rgba(0,0,0,0.2);border-radius:8px;padding:10px;text-align:center">
                        <div style="font-size:10px;color:rgba(255,255,255,0.5)">GDOP</div>
                        <div style="font-size:18px;font-weight:600;color:${getGDOPColor(fix.gdopQuality)}">${fix.gdop.toFixed(2)}</div>
                    </div>
                </div>
                
                <div style="font-size:12px;font-weight:600;margin-bottom:8px">Residuals (measurement errors)</div>
                <div style="background:rgba(0,0,0,0.2);border-radius:8px;padding:10px">
                    ${fix.residuals.map(r => `
                        <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:11px;border-bottom:1px solid rgba(255,255,255,0.1)">
                            <span>${r.name}</span>
                            <span style="color:${Math.abs(r.residual) < 5 ? '#22c55e' : '#f59e0b'}">
                                ${r.residual >= 0 ? '+' : ''}${r.residual.toFixed(1)} m
                            </span>
                        </div>
                    `).join('')}
                    <div style="display:flex;justify-content:space-between;padding:8px 0 0;font-size:11px;font-weight:600">
                        <span>RMS Error</span>
                        <span>${fix.rms.toFixed(2)} m</span>
                    </div>
                </div>
                
                <div style="margin-top:12px;font-size:10px;color:rgba(255,255,255,0.5)">
                    Calculated: ${fix.timestamp.toLocaleString()}
                </div>
            </div>
        `;
    }

    // ==================== STATE MANAGEMENT ====================

    /**
     * Get current state
     */
    function getState() {
        return {
            landmarks: [...state.landmarks],
            lastFix: state.lastFix,
            fixCount: state.fixHistory.length,
            measuredCount: getMeasuredLandmarks().length,
            gdopPreview: previewGDOP()
        };
    }

    /**
     * Set distance unit
     */
    function setDistanceUnit(unit) {
        state.settings.distanceUnit = unit;
    }

    // ==================== PUBLIC API ====================
    
    return {
        // Landmark management
        addLandmark,
        addFromWaypoint,
        addFromMapTap,
        removeLandmark,
        clearLandmarks,
        getLandmarks,
        getMeasuredLandmarks,
        updateDistance,
        
        // Fix calculation
        calculateFix,
        getLastFix,
        getFixHistory,
        clearFixHistory,
        previewGDOP,
        
        // Utilities
        haversineDistance,
        toMeters,
        fromMeters,
        
        // State
        getState,
        setDistanceUnit,
        
        // Rendering
        renderWidget,
        renderWaypointSelector,
        renderFixDetails,
        
        // Constants
        GDOP_THRESHOLDS
    };
})();

window.RangefinderModule = RangefinderModule;

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RangefinderModule;
}
