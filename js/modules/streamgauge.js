/**
 * GridDown USGS Stream Gauge Module
 * Real-time water level and streamflow data from USGS monitoring stations
 * 
 * Data Source: USGS National Water Information System (NWIS)
 * API: https://waterservices.usgs.gov/
 * License: Public Domain (US Government work)
 */
const StreamGaugeModule = (function() {
    'use strict';

    // ==================== CONSTANTS ====================
    
    const USGS_API_BASE = 'https://waterservices.usgs.gov/nwis/iv/';
    const CACHE_DURATION_MS = 15 * 60 * 1000; // 15 minutes
    const DEFAULT_RADIUS_MILES = 50;
    const MAX_STATIONS = 50;
    
    // USGS Parameter Codes
    const PARAM_CODES = {
        STREAMFLOW: '00060',      // Discharge (cfs)
        GAUGE_HEIGHT: '00065',    // Gage height (ft)
        WATER_TEMP: '00010',      // Water temperature (°C)
        DISSOLVED_O2: '00300',    // Dissolved oxygen (mg/L)
        PH: '00400',              // pH
        TURBIDITY: '63680',       // Turbidity (FNU)
        CONDUCTANCE: '00095'      // Specific conductance (µS/cm)
    };
    
    // Flood stage categories (general guidelines)
    const FLOOD_STAGES = {
        action: { label: 'Action', color: '#fbbf24', icon: '⚠️' },
        minor: { label: 'Minor Flooding', color: '#f97316', icon: '🟠' },
        moderate: { label: 'Moderate Flooding', color: '#ef4444', icon: '🔴' },
        major: { label: 'Major Flooding', color: '#7c2d12', icon: '🟤' }
    };

    // ==================== STATE ====================
    
    let stations = [];
    let selectedStation = null;
    let lastFetch = null;
    let lastCenter = null;
    let isLoading = false;
    let error = null;
    let showOnMap = true;
    let subscribers = [];

    // ==================== API FUNCTIONS ====================
    
    /**
     * Fetch stations near a location
     * @param {number} lat - Latitude
     * @param {number} lon - Longitude
     * @param {number} radiusMiles - Search radius in miles
     * @returns {Promise<Array>} Array of station data
     */
    async function fetchNearbyStations(lat, lon, radiusMiles = DEFAULT_RADIUS_MILES) {
        // Convert radius to bounding box
        const latDelta = radiusMiles / 69; // ~69 miles per degree latitude
        const lonDelta = radiusMiles / (69 * Math.cos(lat * Math.PI / 180));
        
        const bbox = {
            west: lon - lonDelta,
            south: lat - latDelta,
            east: lon + lonDelta,
            north: lat + latDelta
        };
        
        return fetchStationsByBbox(bbox);
    }
    
    /**
     * Fetch stations within a bounding box
     * @param {Object} bbox - {west, south, east, north}
     * @returns {Promise<Array>} Array of station data
     */
    async function fetchStationsByBbox(bbox) {
        const params = new URLSearchParams({
            format: 'json',
            bBox: `${bbox.west.toFixed(4)},${bbox.south.toFixed(4)},${bbox.east.toFixed(4)},${bbox.north.toFixed(4)}`,
            parameterCd: `${PARAM_CODES.STREAMFLOW},${PARAM_CODES.GAUGE_HEIGHT}`,
            siteStatus: 'active'
        });
        
        const url = `${USGS_API_BASE}?${params}`;
        
        try {
            isLoading = true;
            error = null;
            notifySubscribers('loading', true);
            
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`USGS API error: ${response.status}`);
            }
            
            const data = await response.json();
            stations = parseUSGSResponse(data);
            lastFetch = Date.now();
            lastCenter = { lat: (bbox.north + bbox.south) / 2, lon: (bbox.east + bbox.west) / 2 };
            
            // Cache the data
            cacheStations(stations);
            
            isLoading = false;
            notifySubscribers('stations', stations);
            
            return stations;
        } catch (e) {
            console.error('Failed to fetch USGS data:', e);
            error = e.message;
            isLoading = false;
            notifySubscribers('error', error);
            
            // Try to load from cache
            const cached = loadCachedStations();
            if (cached) {
                stations = cached;
                return stations;
            }
            
            throw e;
        }
    }
    
    /**
     * Fetch detailed data for a specific station
     * @param {string} siteNo - USGS site number
     * @returns {Promise<Object>} Detailed station data
     */
    async function fetchStationDetails(siteNo) {
        const params = new URLSearchParams({
            format: 'json',
            sites: siteNo,
            parameterCd: Object.values(PARAM_CODES).join(','),
            siteStatus: 'all'
        });
        
        const url = `${USGS_API_BASE}?${params}`;
        
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`USGS API error: ${response.status}`);
            }
            
            const data = await response.json();
            const parsed = parseUSGSResponse(data);
            
            if (parsed.length > 0) {
                return parsed[0];
            }
            
            throw new Error('Station not found');
        } catch (e) {
            console.error('Failed to fetch station details:', e);
            throw e;
        }
    }
    
    /**
     * Parse USGS JSON response into station objects
     * @param {Object} data - USGS API response
     * @returns {Array} Parsed station array
     */
    function parseUSGSResponse(data) {
        if (!data || !data.value || !data.value.timeSeries) {
            return [];
        }
        
        const stationMap = new Map();
        
        for (const series of data.value.timeSeries) {
            const sourceInfo = series.sourceInfo;
            const variable = series.variable;
            const values = series.values?.[0]?.value || [];
            
            if (!sourceInfo || !sourceInfo.siteCode?.[0]) continue;
            
            const siteNo = sourceInfo.siteCode[0].value;
            const siteName = sourceInfo.siteName || 'Unknown';
            const lat = sourceInfo.geoLocation?.geogLocation?.latitude;
            const lon = sourceInfo.geoLocation?.geogLocation?.longitude;
            
            if (!lat || !lon) continue;
            
            // Get or create station entry
            if (!stationMap.has(siteNo)) {
                stationMap.set(siteNo, {
                    siteNo,
                    name: siteName,
                    lat: parseFloat(lat),
                    lon: parseFloat(lon),
                    measurements: {},
                    lastUpdate: null
                });
            }
            
            const station = stationMap.get(siteNo);
            
            // Parse the measurement
            const paramCode = variable?.variableCode?.[0]?.value;
            const paramName = variable?.variableName || 'Unknown';
            const unit = variable?.unit?.unitCode || '';
            
            if (values.length > 0) {
                const latestValue = values[values.length - 1];
                const measurement = {
                    value: parseFloat(latestValue.value),
                    unit,
                    name: paramName,
                    dateTime: latestValue.dateTime,
                    qualifiers: latestValue.qualifiers || []
                };
                
                // Map param code to friendly name
                if (paramCode === PARAM_CODES.STREAMFLOW) {
                    station.measurements.streamflow = measurement;
                } else if (paramCode === PARAM_CODES.GAUGE_HEIGHT) {
                    station.measurements.gaugeHeight = measurement;
                } else if (paramCode === PARAM_CODES.WATER_TEMP) {
                    station.measurements.waterTemp = measurement;
                } else if (paramCode === PARAM_CODES.DISSOLVED_O2) {
                    station.measurements.dissolvedO2 = measurement;
                } else if (paramCode === PARAM_CODES.PH) {
                    station.measurements.ph = measurement;
                }
                
                // Track latest update
                const updateTime = new Date(latestValue.dateTime).getTime();
                if (!station.lastUpdate || updateTime > station.lastUpdate) {
                    station.lastUpdate = updateTime;
                }
            }
        }
        
        return Array.from(stationMap.values());
    }

    // ==================== CACHING ====================
    
    function cacheStations(data) {
        try {
            const cacheData = {
                stations: data,
                timestamp: Date.now(),
                center: lastCenter
            };
            localStorage.setItem('griddown_streamgauge_cache', JSON.stringify(cacheData));
        } catch (e) {
            console.warn('Failed to cache stream gauge data:', e);
        }
    }
    
    function loadCachedStations() {
        try {
            const cached = localStorage.getItem('griddown_streamgauge_cache');
            if (cached) {
                const data = JSON.parse(cached);
                // Check if cache is still valid (24 hours for offline use)
                if (Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
                    lastCenter = data.center;
                    lastFetch = data.timestamp;
                    return data.stations;
                }
            }
        } catch (e) {
            console.warn('Failed to load cached stream gauge data:', e);
        }
        return null;
    }

    // ==================== RENDERING ====================
    
    /**
     * Render stream gauge markers on map
     * @param {CanvasRenderingContext2D} ctx
     * @param {Function} latLonToPixel
     */
    function renderMapOverlay(ctx, latLonToPixel) {
        if (!showOnMap || stations.length === 0) return;
        
        for (const station of stations) {
            const pos = latLonToPixel(station.lat, station.lon);
            
            // Determine color based on data availability and status
            let color = '#3b82f6'; // Default blue
            let status = 'normal';
            
            // Check gauge height for potential flooding
            if (station.measurements.gaugeHeight) {
                const height = station.measurements.gaugeHeight.value;
                // These thresholds are generic - real flood stages vary by location
                // A production app would fetch NWS flood stage data
                status = 'normal';
            }
            
            const isSelected = selectedStation && selectedStation.siteNo === station.siteNo;
            
            // Draw marker
            ctx.beginPath();
            
            // Water drop shape
            ctx.save();
            ctx.translate(pos.x, pos.y);
            
            if (isSelected) {
                // Larger selected marker
                ctx.fillStyle = 'rgba(59, 130, 246, 0.3)';
                ctx.beginPath();
                ctx.arc(0, 0, 20, 0, Math.PI * 2);
                ctx.fill();
            }
            
            // Main marker
            ctx.fillStyle = color;
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            
            // Simple circle marker
            ctx.beginPath();
            ctx.arc(0, -4, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            // Water wave icon inside
            ctx.fillStyle = '#fff';
            ctx.font = '10px system-ui';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('〰', 0, -4);
            
            ctx.restore();
        }
    }
    
    /**
     * Check if a click hit a station marker
     * @param {number} clickLat
     * @param {number} clickLon
     * @param {Function} latLonToPixel
     * @param {number} clickX
     * @param {number} clickY
     * @returns {Object|null} Station or null
     */
    function hitTest(clickX, clickY, latLonToPixel) {
        for (const station of stations) {
            const pos = latLonToPixel(station.lat, station.lon);
            const dist = Math.sqrt((pos.x - clickX) ** 2 + (pos.y - clickY) ** 2);
            if (dist < 15) {
                return station;
            }
        }
        return null;
    }
    
    /**
     * Render panel content
     * @returns {string} HTML
     */
    function renderPanel() {
        if (isLoading) {
            return `
                <div style="padding:20px;text-align:center">
                    <div style="font-size:24px;margin-bottom:8px">💧</div>
                    <div>Loading stream gauge data...</div>
                </div>
            `;
        }
        
        if (error && stations.length === 0) {
            return `
                <div style="padding:20px;text-align:center">
                    <div style="font-size:24px;margin-bottom:8px">⚠️</div>
                    <div style="color:#f59e0b">Failed to load data</div>
                    <div style="font-size:12px;opacity:0.7;margin-top:4px">${error}</div>
                    <button class="btn btn--secondary" id="sg-retry" style="margin-top:12px">Retry</button>
                </div>
            `;
        }
        
        if (selectedStation) {
            return renderStationDetail(selectedStation);
        }
        
        if (stations.length === 0) {
            return `
                <div style="padding:20px;text-align:center">
                    <div style="font-size:24px;margin-bottom:8px">💧</div>
                    <div>No stream gauges found nearby</div>
                    <div style="font-size:12px;opacity:0.7;margin-top:4px">Try panning the map to a different area</div>
                    <button class="btn btn--primary" id="sg-load" style="margin-top:12px">Load Nearby Gauges</button>
                </div>
            `;
        }
        
        return renderStationList();
    }
    
    /**
     * Render list of stations
     */
    function renderStationList() {
        const sortedStations = [...stations].sort((a, b) => {
            // Sort by streamflow (highest first) or name
            const flowA = a.measurements.streamflow?.value || 0;
            const flowB = b.measurements.streamflow?.value || 0;
            return flowB - flowA;
        });
        
        return `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                <span style="font-size:12px;opacity:0.7">${stations.length} gauges found</span>
                <div style="display:flex;gap:8px">
                    <button class="btn btn--icon btn--small" id="sg-refresh" title="Refresh">
                        ${typeof Icons !== 'undefined' ? Icons.get('refresh') : '↻'}
                    </button>
                    <button class="btn btn--icon btn--small ${showOnMap ? 'btn--active' : ''}" id="sg-toggle-map" title="Show on map">
                        ${typeof Icons !== 'undefined' ? Icons.get('map') : '🗺️'}
                    </button>
                </div>
            </div>
            
            <div style="display:flex;flex-direction:column;gap:8px;max-height:400px;overflow-y:auto">
                ${sortedStations.slice(0, MAX_STATIONS).map(station => {
                    const flow = station.measurements.streamflow;
                    const height = station.measurements.gaugeHeight;
                    const age = station.lastUpdate ? getTimeAgo(station.lastUpdate) : 'Unknown';
                    
                    return `
                        <button class="card" data-station="${station.siteNo}" style="text-align:left">
                            <div class="card__header">
                                <span class="card__title" style="font-size:12px">${truncateName(station.name)}</span>
                                <span style="font-size:10px;opacity:0.5">${age}</span>
                            </div>
                            <div style="display:flex;gap:16px;margin-top:6px;font-size:11px">
                                ${flow ? `
                                    <div>
                                        <span style="opacity:0.6">Flow:</span>
                                        <span style="font-weight:600;color:#3b82f6">${formatNumber(flow.value)} cfs</span>
                                    </div>
                                ` : ''}
                                ${height ? `
                                    <div>
                                        <span style="opacity:0.6">Stage:</span>
                                        <span style="font-weight:600;color:#22c55e">${height.value.toFixed(2)} ft</span>
                                    </div>
                                ` : ''}
                            </div>
                        </button>
                    `;
                }).join('')}
            </div>
            
            <div style="margin-top:12px;font-size:10px;color:rgba(255,255,255,0.4);text-align:center">
                Data: USGS National Water Information System
            </div>
        `;
    }
    
    /**
     * Render detailed station view
     */
    function renderStationDetail(station) {
        const flow = station.measurements.streamflow;
        const height = station.measurements.gaugeHeight;
        const temp = station.measurements.waterTemp;
        const age = station.lastUpdate ? getTimeAgo(station.lastUpdate) : 'Unknown';
        
        return `
            <div style="margin-bottom:12px">
                <button class="btn btn--secondary btn--small" id="sg-back">← Back to list</button>
            </div>
            
            <div style="margin-bottom:16px">
                <h3 style="font-size:14px;margin:0 0 4px 0">${station.name}</h3>
                <div style="font-size:11px;opacity:0.6">
                    USGS ${station.siteNo} • Updated ${age}
                </div>
                <div style="font-size:11px;opacity:0.6;margin-top:2px">
                    ${station.lat.toFixed(4)}°, ${station.lon.toFixed(4)}°
                </div>
            </div>
            
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
                ${flow ? `
                    <div style="padding:12px;background:rgba(59,130,246,0.1);border-radius:8px;border:1px solid rgba(59,130,246,0.3)">
                        <div style="font-size:10px;opacity:0.6;margin-bottom:4px">Streamflow</div>
                        <div style="font-size:20px;font-weight:700;color:#3b82f6">${formatNumber(flow.value)}</div>
                        <div style="font-size:11px;opacity:0.7">cubic ft/sec</div>
                    </div>
                ` : ''}
                ${height ? `
                    <div style="padding:12px;background:rgba(34,197,94,0.1);border-radius:8px;border:1px solid rgba(34,197,94,0.3)">
                        <div style="font-size:10px;opacity:0.6;margin-bottom:4px">Gauge Height</div>
                        <div style="font-size:20px;font-weight:700;color:#22c55e">${height.value.toFixed(2)}</div>
                        <div style="font-size:11px;opacity:0.7">feet</div>
                    </div>
                ` : ''}
                ${temp ? `
                    <div style="padding:12px;background:rgba(251,191,36,0.1);border-radius:8px;border:1px solid rgba(251,191,36,0.3)">
                        <div style="font-size:10px;opacity:0.6;margin-bottom:4px">Water Temp</div>
                        <div style="font-size:20px;font-weight:700;color:#fbbf24">${(temp.value * 9/5 + 32).toFixed(1)}</div>
                        <div style="font-size:11px;opacity:0.7">°F (${temp.value.toFixed(1)}°C)</div>
                    </div>
                ` : ''}
            </div>
            
            <div style="display:flex;gap:8px">
                <button class="btn btn--primary btn--small" id="sg-navigate" style="flex:1">
                    🧭 Navigate Here
                </button>
                <button class="btn btn--secondary btn--small" id="sg-center-map">
                    🗺️ Show on Map
                </button>
            </div>
            
            <div style="margin-top:16px;padding:12px;background:rgba(255,255,255,0.05);border-radius:8px">
                <div style="font-size:11px;font-weight:600;margin-bottom:8px">ℹ️ About This Data</div>
                <div style="font-size:10px;opacity:0.7;line-height:1.5">
                    Real-time data from USGS stream monitoring stations. 
                    Streamflow indicates water volume; gauge height shows water level above a fixed point.
                    Data may be provisional and subject to revision.
                </div>
            </div>
            
            <div style="margin-top:12px;text-align:center">
                <a href="https://waterdata.usgs.gov/nwis/uv?site_no=${station.siteNo}" target="_blank" 
                   style="font-size:11px;color:#60a5fa;text-decoration:none">
                    View on USGS Website ↗
                </a>
            </div>
        `;
    }
    
    /**
     * Attach event handlers
     */
    function attachHandlers(container) {
        // Station selection
        container.querySelectorAll('[data-station]').forEach(btn => {
            btn.onclick = () => {
                const siteNo = btn.dataset.station;
                selectedStation = stations.find(s => s.siteNo === siteNo);
                notifySubscribers('select', selectedStation);
            };
        });
        
        // Back button
        const backBtn = container.querySelector('#sg-back');
        if (backBtn) {
            backBtn.onclick = () => {
                selectedStation = null;
                notifySubscribers('update', null);
            };
        }
        
        // Refresh button
        const refreshBtn = container.querySelector('#sg-refresh');
        if (refreshBtn) {
            refreshBtn.onclick = async () => {
                if (lastCenter) {
                    await fetchNearbyStations(lastCenter.lat, lastCenter.lon);
                }
            };
        }
        
        // Toggle map visibility
        const toggleMapBtn = container.querySelector('#sg-toggle-map');
        if (toggleMapBtn) {
            toggleMapBtn.onclick = () => {
                showOnMap = !showOnMap;
                notifySubscribers('update', null);
                // Request map redraw
                if (typeof MapModule !== 'undefined' && MapModule.requestRender) {
                    MapModule.requestRender();
                }
            };
        }
        
        // Load button
        const loadBtn = container.querySelector('#sg-load');
        if (loadBtn) {
            loadBtn.onclick = async () => {
                // Get current map center
                if (typeof MapModule !== 'undefined') {
                    const center = MapModule.getCenter();
                    if (center) {
                        await fetchNearbyStations(center.lat, center.lon);
                    }
                }
            };
        }
        
        // Retry button
        const retryBtn = container.querySelector('#sg-retry');
        if (retryBtn) {
            retryBtn.onclick = async () => {
                if (lastCenter) {
                    await fetchNearbyStations(lastCenter.lat, lastCenter.lon);
                }
            };
        }
        
        // Navigate button
        const navBtn = container.querySelector('#sg-navigate');
        if (navBtn && selectedStation) {
            navBtn.onclick = () => {
                if (typeof NavigationModule !== 'undefined') {
                    NavigationModule.setDestination(selectedStation.lat, selectedStation.lon, selectedStation.name);
                }
            };
        }
        
        // Center map button
        const centerBtn = container.querySelector('#sg-center-map');
        if (centerBtn && selectedStation) {
            centerBtn.onclick = () => {
                if (typeof MapModule !== 'undefined') {
                    MapModule.setCenter(selectedStation.lat, selectedStation.lon);
                    MapModule.setZoom(14);
                }
            };
        }
    }

    // ==================== UTILITIES ====================
    
    function truncateName(name, maxLen = 35) {
        if (name.length <= maxLen) return name;
        return name.substring(0, maxLen - 3) + '...';
    }
    
    function formatNumber(num) {
        if (num >= 10000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        if (num >= 1000) {
            return num.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        }
        return num.toFixed(1);
    }
    
    function getTimeAgo(timestamp) {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    }
    
    function notifySubscribers(event, data) {
        subscribers.forEach(fn => {
            try {
                fn(event, data);
            } catch (e) {
                console.error('StreamGauge subscriber error:', e);
            }
        });
    }
    
    function subscribe(callback) {
        subscribers.push(callback);
        return () => {
            subscribers = subscribers.filter(fn => fn !== callback);
        };
    }

    // ==================== PUBLIC API ====================
    
    function init() {
        // Try to load cached data on init
        const cached = loadCachedStations();
        if (cached) {
            stations = cached;
        }
        console.log('StreamGaugeModule initialized');
        return true;
    }
    
    return {
        init,
        fetchNearbyStations,
        fetchStationsByBbox,
        fetchStationDetails,
        renderPanel,
        renderMapOverlay,
        attachHandlers,
        hitTest,
        subscribe,
        
        // State getters
        getStations: () => [...stations],
        getSelectedStation: () => selectedStation,
        isLoading: () => isLoading,
        getError: () => error,
        isShowingOnMap: () => showOnMap,
        
        // State setters
        setSelectedStation: (station) => {
            selectedStation = station;
            notifySubscribers('select', station);
        },
        clearSelection: () => {
            selectedStation = null;
            notifySubscribers('update', null);
        },
        setShowOnMap: (show) => {
            showOnMap = show;
            notifySubscribers('update', null);
        }
    };
})();

if (typeof window !== 'undefined') {
    window.StreamGaugeModule = StreamGaugeModule;
}
