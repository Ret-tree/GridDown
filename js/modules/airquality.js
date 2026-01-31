/**
 * GridDown Air Quality Module - AirNow AQI Integration
 * Uses EPA AirNow API (public domain, US Government work)
 * Provides current AQI for US, Canada, and Mexico locations
 * Graceful fallback for international users
 */
const AirQualityModule = (function() {
    'use strict';

    // AirNow API configuration
    // Note: For production, register for an API key at https://docs.airnowapi.org/
    // The API is free and public domain (US Government work)
    const AIRNOW_API = 'https://www.airnowapi.org/aq/observation/latLong/current/';
    
    // API key - users should replace with their own from AirNow
    // Register at: https://docs.airnowapi.org/account/request/
    let apiKey = null;
    
    // Cache for AQI data (expires after 1 hour - matches AirNow update frequency)
    const aqiCache = new Map();
    const CACHE_DURATION = 60 * 60 * 1000; // 1 hour
    
    // Coverage boundaries (approximate)
    // AirNow covers: US, Canada, Mexico
    const COVERAGE_BOUNDS = {
        north: 72,    // Northern Canada
        south: 14,    // Southern Mexico
        east: -52,    // Eastern Canada
        west: -180    // Western Alaska/Aleutians
    };

    // AQI categories per EPA standards
    const AQI_CATEGORIES = {
        good: {
            range: [0, 50],
            label: 'Good',
            color: '#00E400',
            textColor: '#000000',
            icon: '😊',
            description: 'Air quality is satisfactory, and air pollution poses little or no risk.',
            guidance: 'Enjoy outdoor activities.'
        },
        moderate: {
            range: [51, 100],
            label: 'Moderate',
            color: '#FFFF00',
            textColor: '#000000',
            icon: '🙂',
            description: 'Air quality is acceptable. However, there may be a risk for some people who are unusually sensitive to air pollution.',
            guidance: 'Unusually sensitive people should consider limiting prolonged outdoor exertion.'
        },
        usg: {
            range: [101, 150],
            label: 'Unhealthy for Sensitive Groups',
            color: '#FF7E00',
            textColor: '#000000',
            icon: '😷',
            description: 'Members of sensitive groups may experience health effects. The general public is less likely to be affected.',
            guidance: 'Active children/adults and people with respiratory disease should limit prolonged outdoor exertion.'
        },
        unhealthy: {
            range: [151, 200],
            label: 'Unhealthy',
            color: '#FF0000',
            textColor: '#FFFFFF',
            icon: '🤢',
            description: 'Some members of the general public may experience health effects; members of sensitive groups may experience more serious health effects.',
            guidance: 'Active children/adults and people with respiratory disease should avoid prolonged outdoor exertion.'
        },
        veryUnhealthy: {
            range: [201, 300],
            label: 'Very Unhealthy',
            color: '#8F3F97',
            textColor: '#FFFFFF',
            icon: '🚨',
            description: 'Health alert: The risk of health effects is increased for everyone.',
            guidance: 'Everyone should avoid prolonged outdoor exertion.'
        },
        hazardous: {
            range: [301, 500],
            label: 'Hazardous',
            color: '#7E0023',
            textColor: '#FFFFFF',
            icon: '☠️',
            description: 'Health warning of emergency conditions: everyone is more likely to be affected.',
            guidance: 'Everyone should avoid all outdoor activity.'
        }
    };

    // Pollutant information
    const POLLUTANTS = {
        'O3': { name: 'Ozone', fullName: 'Ground-level Ozone' },
        'PM2.5': { name: 'PM2.5', fullName: 'Fine Particulate Matter (< 2.5μm)' },
        'PM10': { name: 'PM10', fullName: 'Particulate Matter (< 10μm)' },
        'CO': { name: 'CO', fullName: 'Carbon Monoxide' },
        'NO2': { name: 'NO2', fullName: 'Nitrogen Dioxide' },
        'SO2': { name: 'SO2', fullName: 'Sulfur Dioxide' }
    };

    let initialized = false;

    /**
     * Initialize the module
     */
    function init(options = {}) {
        if (initialized) {
            console.debug('AirQualityModule already initialized');
            return;
        }
        
        // Allow API key to be set via options or localStorage
        apiKey = options.apiKey || localStorage.getItem('airnow_api_key') || null;
        
        if (!apiKey) {
            console.warn('AirQualityModule: No API key configured. AQI features will be limited.');
            console.info('Register for a free AirNow API key at: https://docs.airnowapi.org/account/request/');
        }
        
        console.log('AirQualityModule initialized');
        initialized = true;
    }

    /**
     * Set the API key
     */
    function setApiKey(key) {
        apiKey = key;
        if (key) {
            localStorage.setItem('airnow_api_key', key);
        } else {
            localStorage.removeItem('airnow_api_key');
        }
    }

    /**
     * Get the current API key
     */
    function getApiKey() {
        return apiKey;
    }

    /**
     * Check if a location is within AirNow coverage area
     */
    function isInCoverageArea(lat, lon) {
        return lat >= COVERAGE_BOUNDS.south && 
               lat <= COVERAGE_BOUNDS.north && 
               lon >= COVERAGE_BOUNDS.west && 
               lon <= COVERAGE_BOUNDS.east;
    }

    /**
     * Get cache key for coordinates
     */
    function getCacheKey(lat, lon) {
        // Round to 2 decimal places for caching (roughly 1km precision)
        return `${lat.toFixed(2)},${lon.toFixed(2)}`;
    }

    /**
     * Get AQI category from numeric value
     */
    function getCategory(aqi) {
        if (aqi === null || aqi === undefined) return null;
        
        for (const [key, cat] of Object.entries(AQI_CATEGORIES)) {
            if (aqi >= cat.range[0] && aqi <= cat.range[1]) {
                return { key, ...cat };
            }
        }
        
        // Above 500 - still hazardous
        if (aqi > 500) {
            return { key: 'hazardous', ...AQI_CATEGORIES.hazardous };
        }
        
        return null;
    }

    /**
     * Fetch AQI data for a location
     * Returns null for locations outside coverage area
     */
    async function fetchAQI(lat, lon, options = {}) {
        // Check coverage area first
        if (!isInCoverageArea(lat, lon)) {
            return {
                available: false,
                reason: 'outside_coverage',
                message: 'AirNow data is only available for US, Canada, and Mexico'
            };
        }

        // Check for API key
        if (!apiKey) {
            return {
                available: false,
                reason: 'no_api_key',
                message: 'AirNow API key not configured'
            };
        }

        // Check cache
        const cacheKey = getCacheKey(lat, lon);
        const cached = aqiCache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION && !options.forceRefresh) {
            return cached.data;
        }

        try {
            const params = new URLSearchParams({
                format: 'application/json',
                latitude: lat.toFixed(6),
                longitude: lon.toFixed(6),
                distance: options.distance || 25, // Search radius in miles
                API_KEY: apiKey
            });

            const response = await fetch(`${AIRNOW_API}?${params}`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Invalid AirNow API key');
                }
                throw new Error(`AirNow API error: ${response.status}`);
            }

            const data = await response.json();
            const processed = processAQIData(data, lat, lon);

            // Cache the result
            aqiCache.set(cacheKey, {
                timestamp: Date.now(),
                data: processed
            });

            return processed;

        } catch (err) {
            console.error('AirNow fetch error:', err);
            
            // Return cached data if available, even if expired
            if (cached) {
                return {
                    ...cached.data,
                    stale: true,
                    staleMessage: `Data from ${formatTimestamp(cached.timestamp)}`
                };
            }

            return {
                available: false,
                reason: 'fetch_error',
                message: err.message
            };
        }
    }

    /**
     * Process raw AirNow API response
     */
    function processAQIData(data, requestLat, requestLon) {
        if (!data || !Array.isArray(data) || data.length === 0) {
            return {
                available: false,
                reason: 'no_data',
                message: 'No AQI data available for this location'
            };
        }

        // Group readings by pollutant
        const readings = {};
        let primaryReading = null;
        let maxAQI = -1;

        for (const observation of data) {
            const pollutant = observation.ParameterName;
            const aqi = observation.AQI;
            
            readings[pollutant] = {
                aqi: aqi,
                category: getCategory(aqi),
                categoryNumber: observation.Category?.Number,
                categoryName: observation.Category?.Name,
                pollutantInfo: POLLUTANTS[pollutant] || { name: pollutant, fullName: pollutant }
            };

            // Track highest AQI (primary concern)
            if (aqi > maxAQI) {
                maxAQI = aqi;
                primaryReading = {
                    ...readings[pollutant],
                    pollutant: pollutant
                };
            }
        }

        // Use first observation for location/time info
        const firstObs = data[0];

        return {
            available: true,
            aqi: maxAQI,
            category: getCategory(maxAQI),
            primary: primaryReading,
            readings: readings,
            location: {
                reportingArea: firstObs.ReportingArea,
                stateCode: firstObs.StateCode,
                latitude: firstObs.Latitude,
                longitude: firstObs.Longitude
            },
            observation: {
                date: firstObs.DateObserved,
                hour: firstObs.HourObserved,
                timezone: firstObs.LocalTimeZone,
                timestamp: parseObservationTime(firstObs)
            },
            requestedLocation: {
                latitude: requestLat,
                longitude: requestLon
            }
        };
    }

    /**
     * Parse observation time from AirNow data
     */
    function parseObservationTime(obs) {
        try {
            // AirNow provides date as "YYYY-MM-DD" and hour as integer
            const dateStr = `${obs.DateObserved}T${String(obs.HourObserved).padStart(2, '0')}:00:00`;
            return new Date(dateStr);
        } catch (e) {
            return null;
        }
    }

    /**
     * Format timestamp for display
     */
    function formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });
    }

    /**
     * Format observation time for display
     */
    function formatObservationTime(aqiData) {
        if (!aqiData?.observation?.timestamp) {
            return 'Unknown';
        }
        
        const obs = aqiData.observation;
        return `${obs.hour}:00 ${obs.timezone}`;
    }

    /**
     * Get AQI for current GPS location
     */
    async function getCurrentLocationAQI() {
        if (typeof GPSModule === 'undefined') {
            return {
                available: false,
                reason: 'no_gps',
                message: 'GPS module not available'
            };
        }

        const gpsStatus = GPSModule.getStatus();
        
        if (!gpsStatus.tracking || !gpsStatus.position) {
            // Fall back to map center
            if (typeof MapModule !== 'undefined') {
                const mapState = MapModule.getMapState();
                return await fetchAQI(mapState.lat, mapState.lon);
            }
            
            return {
                available: false,
                reason: 'no_position',
                message: 'No GPS position available'
            };
        }

        return await fetchAQI(gpsStatus.position.lat, gpsStatus.position.lon);
    }

    /**
     * Get AQI for map center
     */
    async function getMapCenterAQI() {
        if (typeof MapModule === 'undefined') {
            return {
                available: false,
                reason: 'no_map',
                message: 'Map module not available'
            };
        }

        const mapState = MapModule.getMapState();
        return await fetchAQI(mapState.lat, mapState.lon);
    }

    /**
     * Clear the cache
     */
    function clearCache() {
        aqiCache.clear();
    }

    /**
     * Get coverage info message
     */
    function getCoverageMessage() {
        return 'Air quality data provided by the U.S. EPA AirNow program. ' +
               'Coverage includes United States, Canada, and Mexico. ' +
               'Data is preliminary and subject to change.';
    }

    /**
     * Render AQI badge HTML
     */
    function renderAQIBadge(aqiData, options = {}) {
        if (!aqiData || !aqiData.available) {
            return '';
        }

        const cat = aqiData.category;
        const compact = options.compact || false;

        if (compact) {
            return `
                <div style="display:inline-flex;align-items:center;gap:6px;padding:4px 8px;background:${cat.color};color:${cat.textColor};border-radius:6px;font-size:12px;font-weight:600">
                    <span>${cat.icon}</span>
                    <span>AQI ${aqiData.aqi}</span>
                </div>
            `;
        }

        return `
            <div style="padding:12px;background:${cat.color}22;border:1px solid ${cat.color}44;border-radius:10px">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
                    <div style="font-size:32px">${cat.icon}</div>
                    <div>
                        <div style="font-size:24px;font-weight:700;color:${cat.color}">AQI ${aqiData.aqi}</div>
                        <div style="font-size:13px;color:rgba(255,255,255,0.7)">${cat.label}</div>
                    </div>
                </div>
                <div style="font-size:12px;color:rgba(255,255,255,0.6);margin-bottom:8px">
                    ${cat.description}
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:rgba(255,255,255,0.5)">
                    <span>📍 ${aqiData.location?.reportingArea || 'Unknown'}</span>
                    <span>🕐 ${formatObservationTime(aqiData)}</span>
                </div>
                ${aqiData.primary?.pollutant ? `
                    <div style="margin-top:8px;padding:6px 8px;background:rgba(0,0,0,0.2);border-radius:6px;font-size:11px">
                        Primary pollutant: <strong>${aqiData.primary.pollutantInfo.fullName}</strong>
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Render unavailable state HTML
     */
    function renderUnavailable(aqiData, options = {}) {
        const compact = options.compact || false;
        
        if (!aqiData) {
            return '';
        }

        // Different messages for different reasons
        let icon = '🌐';
        let title = 'AQI Unavailable';
        let message = aqiData.message || 'Air quality data not available';

        if (aqiData.reason === 'outside_coverage') {
            icon = '🗺️';
            title = 'Outside Coverage';
            message = 'AirNow covers US, Canada, and Mexico only';
        } else if (aqiData.reason === 'no_api_key') {
            icon = '🔑';
            title = 'API Key Required';
            message = 'Configure AirNow API key in settings';
        } else if (aqiData.reason === 'no_data') {
            icon = '📡';
            title = 'No Nearby Stations';
            message = 'No air quality monitoring stations found nearby';
        }

        if (compact) {
            return `
                <div style="display:inline-flex;align-items:center;gap:6px;padding:4px 8px;background:rgba(107,114,128,0.2);color:rgba(255,255,255,0.5);border-radius:6px;font-size:11px">
                    <span>${icon}</span>
                    <span>${title}</span>
                </div>
            `;
        }

        return `
            <div style="padding:12px;background:rgba(107,114,128,0.1);border:1px solid rgba(107,114,128,0.2);border-radius:10px">
                <div style="display:flex;align-items:center;gap:10px">
                    <div style="font-size:24px">${icon}</div>
                    <div>
                        <div style="font-size:14px;font-weight:500;color:rgba(255,255,255,0.7)">${title}</div>
                        <div style="font-size:12px;color:rgba(255,255,255,0.5)">${message}</div>
                    </div>
                </div>
            </div>
        `;
    }


    // ==================== MAP OVERLAY FUNCTIONALITY ====================
    
    // Map layer state
    const AQI_LAYER_ID = 'aqi-stations';
    let layerVisible = false;
    let lastBounds = null;
    let stationsCache = new Map();
    let currentStations = [];
    let moveUnsubscribe = null;  // Unsubscribe function for map move events
    const STATIONS_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
    
    // Selected station for popup display
    let selectedStation = null;
    
    /**
     * Fetch AQI monitoring stations in a bounding box
     * Uses AirNow observations API with distance parameter
     */
    async function fetchStationsInBounds(bounds) {
        if (!apiKey) {
            console.warn('AirQualityModule: Cannot fetch stations without API key');
            return [];
        }
        
        // Get center of bounds
        const centerLat = (bounds.north + bounds.south) / 2;
        const centerLon = (bounds.east + bounds.west) / 2;
        
        // Check if in coverage area
        if (!isInCoverageArea(centerLat, centerLon)) {
            return [];
        }
        
        // Calculate distance to cover the bounding box (in miles)
        // Using approximate conversion: 1 degree latitude ~ 69 miles
        const latDiff = bounds.north - bounds.south;
        const lonDiff = bounds.east - bounds.west;
        const distance = Math.max(
            Math.ceil(latDiff * 69 / 2),
            Math.ceil(lonDiff * 69 * Math.cos(centerLat * Math.PI / 180) / 2),
            25 // Minimum 25 miles
        );
        
        // Cap at 100 miles to avoid huge responses
        const cappedDistance = Math.min(distance, 100);
        
        // Check cache
        const cacheKey = `stations_${centerLat.toFixed(1)}_${centerLon.toFixed(1)}_${cappedDistance}`;
        const cached = stationsCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < STATIONS_CACHE_DURATION) {
            return cached.data;
        }
        
        try {
            const url = `${AIRNOW_API}?format=application/json&latitude=${centerLat}&longitude=${centerLon}&distance=${cappedDistance}&API_KEY=${apiKey}`;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) {
                console.error('AirNow stations API error:', response.status);
                return [];
            }
            
            const data = await response.json();
            
            // Process and deduplicate by location
            const stationsMap = new Map();
            
            if (Array.isArray(data)) {
                data.forEach(obs => {
                    const key = `${obs.Latitude.toFixed(3)},${obs.Longitude.toFixed(3)}`;
                    const existing = stationsMap.get(key);
                    
                    // Keep the observation with highest AQI (most relevant for health)
                    if (!existing || (obs.AQI && obs.AQI > (existing.AQI || 0))) {
                        stationsMap.set(key, {
                            lat: obs.Latitude,
                            lon: obs.Longitude,
                            aqi: obs.AQI,
                            parameter: obs.ParameterName,
                            category: obs.Category?.Name || getCategory(obs.AQI)?.label,
                            reportingArea: obs.ReportingArea,
                            stateCode: obs.StateCode,
                            dateObserved: obs.DateObserved,
                            hourObserved: obs.HourObserved,
                            localTimeZone: obs.LocalTimeZone
                        });
                    }
                });
            }
            
            const stations = Array.from(stationsMap.values());
            
            // Cache the results
            stationsCache.set(cacheKey, {
                data: stations,
                timestamp: Date.now()
            });
            
            return stations;
            
        } catch (err) {
            console.error('Error fetching AQI stations:', err);
            return [];
        }
    }
    
    /**
     * Add AQI layer to the map
     */
    async function addMapLayer(options = {}) {
        if (typeof MapModule === 'undefined') {
            console.error('MapModule not available for AQI map layer');
            return false;
        }
        
        if (!apiKey) {
            console.warn('AirQualityModule: API key required for map layer');
            return false;
        }
        
        // Remove existing layer if any
        removeMapLayer();
        
        layerVisible = true;
        
        // Load initial stations
        await refreshMapLayer();
        
        // Subscribe to map movement for refresh on pan/zoom
        if (MapModule.onMoveEnd) {
            moveUnsubscribe = MapModule.onMoveEnd(() => {
                if (layerVisible) {
                    refreshMapLayer();
                }
            });
        }
        
        console.log('AQI map layer added');
        return true;
    }
    
    /**
     * Remove AQI layer from the map
     */
    function removeMapLayer() {
        if (typeof MapModule === 'undefined') return false;
        
        // Unsubscribe from map move events
        if (moveUnsubscribe) {
            moveUnsubscribe();
            moveUnsubscribe = null;
        }
        
        if (MapModule.hasOverlayMarkers && MapModule.hasOverlayMarkers(AQI_LAYER_ID)) {
            MapModule.removeOverlayMarkers(AQI_LAYER_ID);
        }
        
        layerVisible = false;
        lastBounds = null;
        currentStations = [];
        selectedStation = null;
        
        console.log('AQI map layer removed');
        return true;
    }
    
    /**
     * Check if AQI layer is currently visible
     */
    function isMapLayerVisible() {
        return layerVisible;
    }
    
    /**
     * Refresh the AQI markers on the map
     */
    async function refreshMapLayer() {
        if (!layerVisible) return;
        if (typeof MapModule === 'undefined') return;
        
        const mapState = MapModule.getMapState();
        if (!mapState) return;
        
        // Get approximate bounds from map center and zoom
        const zoom = mapState.zoom || 12;
        const lat = mapState.lat;
        const lon = mapState.lon;
        
        // Calculate approximate viewport in degrees based on zoom level
        // At zoom 12, viewport is roughly 0.1 degrees
        const viewportDegrees = 180 / Math.pow(2, zoom);
        
        const currentBounds = {
            north: lat + viewportDegrees,
            south: lat - viewportDegrees,
            east: lon + viewportDegrees * 1.5,  // wider for landscape
            west: lon - viewportDegrees * 1.5
        };
        
        // Check if bounds changed significantly (avoid unnecessary refreshes)
        if (lastBounds) {
            const latChange = Math.abs(currentBounds.north - lastBounds.north) + Math.abs(currentBounds.south - lastBounds.south);
            const lonChange = Math.abs(currentBounds.east - lastBounds.east) + Math.abs(currentBounds.west - lastBounds.west);
            if (latChange < 0.1 && lonChange < 0.1) {
                return; // Bounds haven't changed significantly
            }
        }
        
        lastBounds = currentBounds;
        
        // Fetch stations
        const stations = await fetchStationsInBounds(currentBounds);
        currentStations = stations;
        
        // Convert to overlay markers format
        const markers = stations.map(station => {
            const category = getCategory(station.aqi);
            return {
                lat: station.lat,
                lon: station.lon,
                color: category?.color || '#808080',
                textColor: category?.textColor || '#FFFFFF',
                value: station.aqi,
                label: category?.label || 'Unknown',
                data: station  // Store full station data for click handler
            };
        });
        
        // Add markers to map using MapModule's overlay system
        if (MapModule.addOverlayMarkers) {
            MapModule.addOverlayMarkers(AQI_LAYER_ID, markers, {
                onClick: handleStationClick,
                radius: 12
            });
        }
        
        console.log(`AQI layer: ${stations.length} stations displayed`);
    }
    
    /**
     * Handle click on AQI station marker
     */
    function handleStationClick(marker, layerId) {
        if (!marker?.data) return;
        
        const station = marker.data;
        const category = getCategory(station.aqi);
        selectedStation = station;
        
        // Show station details in a toast/modal
        if (typeof ModalsModule !== 'undefined') {
            const message = `
                <div style="text-align:left">
                    <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
                        <div style="width:44px;height:44px;border-radius:50%;background:${category?.color || '#808080'};display:flex;align-items:center;justify-content:center;flex-shrink:0">
                            <span style="font-size:16px;font-weight:bold;color:${category?.textColor || '#fff'}">${station.aqi || '--'}</span>
                        </div>
                        <div>
                            <div style="font-size:14px;font-weight:600;color:${category?.color || '#888'}">${category?.label || 'Unknown'}</div>
                            <div style="font-size:11px;color:rgba(255,255,255,0.6)">${station.parameter || 'AQI'}</div>
                        </div>
                    </div>
                    ${station.reportingArea ? `<div style="font-size:12px;margin-bottom:4px">📍 ${station.reportingArea}${station.stateCode ? ', ' + station.stateCode : ''}</div>` : ''}
                    <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:4px">Tap to dismiss</div>
                </div>
            `;
            ModalsModule.showToast(message, 'info', 4000);
        }
    }
    
    /**
     * Toggle the AQI map layer
     */
    async function toggleMapLayer() {
        if (layerVisible) {
            removeMapLayer();
            return false;
        } else {
            await addMapLayer();
            return true;
        }
    }

    // ==================== AQI MONITORING & ALERTS ====================
    
    // Forecast API endpoint
    const AIRNOW_FORECAST_API = 'https://www.airnowapi.org/aq/forecast/latLong/';
    
    // Monitoring state
    let monitoringEnabled = false;
    let monitoringInterval = null;
    let waypointMonitoringInterval = null;
    let monitoringSettings = {
        currentLocationInterval: 30 * 60 * 1000,  // 30 minutes
        waypointInterval: 60 * 60 * 1000,         // 60 minutes
        thresholds: {
            caution: 101,    // Unhealthy for Sensitive Groups
            warning: 151,    // Unhealthy
            critical: 201,   // Very Unhealthy
            emergency: 301   // Hazardous
        },
        sensitiveGroups: false,  // Lower thresholds for sensitive individuals
        forecastAlerts: true     // Include forecast-based alerts
    };
    
    // Monitoring cache to avoid duplicate alerts
    let lastAlertAQI = new Map();  // locationKey -> { aqi, timestamp }
    const ALERT_COOLDOWN = 30 * 60 * 1000;  // 30 min cooldown per location
    
    /**
     * Fetch AQI forecast for a location
     * Returns forecast for today and tomorrow
     */
    async function fetchForecast(lat, lon) {
        if (!apiKey) {
            console.warn('AirQualityModule: API key required for forecast');
            return null;
        }
        
        if (!isInCoverageArea(lat, lon)) {
            return null;
        }
        
        try {
            const params = new URLSearchParams({
                format: 'application/json',
                latitude: lat.toFixed(4),
                longitude: lon.toFixed(4),
                distance: 50,
                API_KEY: apiKey
            });
            
            const response = await fetch(`${AIRNOW_FORECAST_API}?${params}`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });
            
            if (!response.ok) {
                console.error('AirNow forecast API error:', response.status);
                return null;
            }
            
            const data = await response.json();
            
            if (!Array.isArray(data) || data.length === 0) {
                return null;
            }
            
            // Group by date and get highest AQI per day
            const forecastByDate = new Map();
            
            data.forEach(item => {
                const date = item.DateForecast;
                const existing = forecastByDate.get(date);
                
                if (!existing || (item.AQI && item.AQI > (existing.aqi || 0))) {
                    forecastByDate.set(date, {
                        date: date,
                        aqi: item.AQI,
                        category: item.Category?.Name || getCategory(item.AQI)?.label,
                        parameter: item.ParameterName,
                        reportingArea: item.ReportingArea,
                        discussion: item.Discussion || null
                    });
                }
            });
            
            // Sort by date and return
            const forecasts = Array.from(forecastByDate.values())
                .sort((a, b) => new Date(a.date) - new Date(b.date));
            
            return {
                lat,
                lon,
                forecasts,
                timestamp: Date.now()
            };
            
        } catch (err) {
            console.error('Error fetching AQI forecast:', err);
            return null;
        }
    }
    
    /**
     * Get alert severity based on AQI value
     */
    function getAlertSeverity(aqi) {
        const t = monitoringSettings.thresholds;
        
        // Adjust for sensitive groups if enabled
        const adjust = monitoringSettings.sensitiveGroups ? -50 : 0;
        
        if (aqi >= t.emergency + adjust) return 'emergency';
        if (aqi >= t.critical + adjust) return 'critical';
        if (aqi >= t.warning + adjust) return 'warning';
        if (aqi >= t.caution + adjust) return 'caution';
        return null;
    }
    
    /**
     * Check if alert should be triggered (cooldown check)
     */
    function shouldTriggerAlert(locationKey, aqi) {
        const last = lastAlertAQI.get(locationKey);
        
        if (!last) return true;
        
        // Always alert if severity increased
        const lastSeverity = getAlertSeverity(last.aqi);
        const newSeverity = getAlertSeverity(aqi);
        
        if (newSeverity && !lastSeverity) return true;
        if (newSeverity === 'emergency' && lastSeverity !== 'emergency') return true;
        if (newSeverity === 'critical' && lastSeverity !== 'critical' && lastSeverity !== 'emergency') return true;
        
        // Check cooldown for same severity
        if (Date.now() - last.timestamp < ALERT_COOLDOWN) {
            return false;
        }
        
        return true;
    }
    
    /**
     * Trigger AQI alert via AlertModule
     */
    function triggerAQIAlert(location, aqi, forecast = false) {
        if (typeof AlertModule === 'undefined') {
            console.warn('AlertModule not available for AQI alerts');
            return;
        }
        
        const severity = getAlertSeverity(aqi);
        if (!severity) return;
        
        const category = getCategory(aqi);
        const locationKey = `${location.lat.toFixed(2)},${location.lon.toFixed(2)}`;
        
        if (!shouldTriggerAlert(locationKey, aqi)) {
            return;
        }
        
        lastAlertAQI.set(locationKey, { aqi, timestamp: Date.now() });
        
        const locationName = location.name || 'Current Location';
        const title = forecast ? 'AQI Forecast Alert' : 'Air Quality Alert';
        const timeframe = forecast ? 'Expected' : 'Current';
        
        AlertModule.trigger({
            source: AlertModule.SOURCES.AQI,
            severity: AlertModule.SEVERITY[severity.toUpperCase()] || AlertModule.SEVERITY.WARNING,
            title: title,
            message: `${locationName}: ${timeframe} AQI ${aqi} (${category?.label || 'Unknown'})`,
            data: {
                lat: location.lat,
                lon: location.lon,
                locationName,
                aqi,
                category: category?.label,
                guidance: category?.guidance,
                forecast,
                timestamp: Date.now()
            },
            persistent: severity === 'critical' || severity === 'emergency',
            sound: severity !== 'caution',
            notification: true
        });
    }
    
    /**
     * Check AQI at current GPS location
     */
    async function checkCurrentLocation() {
        if (!apiKey) return;
        
        let lat, lon;
        
        // Get current location from GPS
        if (typeof GPSModule !== 'undefined') {
            const pos = GPSModule.getPosition();
            if (pos?.lat && pos?.lon) {
                lat = pos.lat;
                lon = pos.lon;
            }
        }
        
        // Fallback to map center
        if (!lat && typeof MapModule !== 'undefined') {
            const center = MapModule.getCenter();
            if (center) {
                lat = center.lat;
                lon = center.lon;
            }
        }
        
        if (!lat || !lon) return;
        
        // Fetch current AQI
        const result = await fetchAQI(lat, lon);
        if (result?.aqi) {
            const severity = getAlertSeverity(result.aqi);
            if (severity) {
                triggerAQIAlert({ lat, lon, name: 'Current Location' }, result.aqi, false);
            }
        }
        
        // Check forecast if enabled
        if (monitoringSettings.forecastAlerts) {
            const forecast = await fetchForecast(lat, lon);
            if (forecast?.forecasts) {
                // Check tomorrow's forecast
                const tomorrow = forecast.forecasts.find(f => {
                    const fDate = new Date(f.date);
                    const today = new Date();
                    return fDate.getDate() !== today.getDate();
                });
                
                if (tomorrow?.aqi) {
                    const severity = getAlertSeverity(tomorrow.aqi);
                    if (severity) {
                        triggerAQIAlert(
                            { lat, lon, name: `Tomorrow (${tomorrow.date})` },
                            tomorrow.aqi,
                            true
                        );
                    }
                }
            }
        }
    }
    
    /**
     * Check AQI at all saved waypoints
     */
    async function checkAllWaypoints() {
        if (!apiKey) return;
        if (typeof State === 'undefined') return;
        
        const waypoints = State.get('waypoints') || [];
        
        for (const wp of waypoints) {
            if (!wp.lat || !wp.lon) continue;
            
            // Small delay between requests to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const result = await fetchAQI(wp.lat, wp.lon);
            if (result?.aqi) {
                const severity = getAlertSeverity(result.aqi);
                if (severity) {
                    triggerAQIAlert({ lat: wp.lat, lon: wp.lon, name: wp.name || 'Waypoint' }, result.aqi, false);
                }
            }
        }
    }
    
    /**
     * Start AQI monitoring
     */
    function startMonitoring(options = {}) {
        if (!apiKey) {
            console.warn('AirQualityModule: API key required for monitoring');
            return false;
        }
        
        // Update settings
        if (options.currentLocationInterval) {
            monitoringSettings.currentLocationInterval = options.currentLocationInterval;
        }
        if (options.waypointInterval) {
            monitoringSettings.waypointInterval = options.waypointInterval;
        }
        if (options.thresholds) {
            monitoringSettings.thresholds = { ...monitoringSettings.thresholds, ...options.thresholds };
        }
        if (typeof options.sensitiveGroups === 'boolean') {
            monitoringSettings.sensitiveGroups = options.sensitiveGroups;
        }
        if (typeof options.forecastAlerts === 'boolean') {
            monitoringSettings.forecastAlerts = options.forecastAlerts;
        }
        
        // Stop existing monitoring
        stopMonitoring();
        
        monitoringEnabled = true;
        
        // Initial check
        checkCurrentLocation();
        checkAllWaypoints();
        
        // Set up intervals
        monitoringInterval = setInterval(() => {
            checkCurrentLocation();
        }, monitoringSettings.currentLocationInterval);
        
        waypointMonitoringInterval = setInterval(() => {
            checkAllWaypoints();
        }, monitoringSettings.waypointInterval);
        
        // Save settings
        if (typeof Storage !== 'undefined' && Storage.Settings) {
            Storage.Settings.set('aqiMonitoringEnabled', true);
            Storage.Settings.set('aqiMonitoringSettings', monitoringSettings);
        }
        
        console.log('AQI monitoring started');
        return true;
    }
    
    /**
     * Stop AQI monitoring
     */
    function stopMonitoring() {
        if (monitoringInterval) {
            clearInterval(monitoringInterval);
            monitoringInterval = null;
        }
        if (waypointMonitoringInterval) {
            clearInterval(waypointMonitoringInterval);
            waypointMonitoringInterval = null;
        }
        
        monitoringEnabled = false;
        
        if (typeof Storage !== 'undefined' && Storage.Settings) {
            Storage.Settings.set('aqiMonitoringEnabled', false);
        }
        
        console.log('AQI monitoring stopped');
    }
    
    /**
     * Check if monitoring is active
     */
    function isMonitoringEnabled() {
        return monitoringEnabled;
    }
    
    /**
     * Get monitoring settings
     */
    function getMonitoringSettings() {
        return { ...monitoringSettings };
    }
    
    /**
     * Update monitoring thresholds
     */
    function setThresholds(thresholds) {
        monitoringSettings.thresholds = { ...monitoringSettings.thresholds, ...thresholds };
        if (typeof Storage !== 'undefined' && Storage.Settings) {
            Storage.Settings.set('aqiMonitoringSettings', monitoringSettings);
        }
    }
    
    /**
     * Enable/disable sensitive groups mode
     */
    function setSensitiveGroups(enabled) {
        monitoringSettings.sensitiveGroups = enabled;
        if (typeof Storage !== 'undefined' && Storage.Settings) {
            Storage.Settings.set('aqiMonitoringSettings', monitoringSettings);
        }
    }
    
    /**
     * Restore monitoring state on init
     */
    async function restoreMonitoringState() {
        if (typeof Storage === 'undefined' || !Storage.Settings) return;
        
        try {
            const enabled = await Storage.Settings.get('aqiMonitoringEnabled', false);
            const settings = await Storage.Settings.get('aqiMonitoringSettings', null);
            
            if (settings) {
                monitoringSettings = { ...monitoringSettings, ...settings };
            }
            
            if (enabled && apiKey) {
                startMonitoring();
            }
        } catch (e) {
            console.warn('Could not restore AQI monitoring state:', e);
        }
    }
    
    /**
     * Manual check - check current location and all waypoints immediately
     */
    async function checkNow() {
        if (!apiKey) {
            if (typeof ModalsModule !== 'undefined') {
                ModalsModule.showToast('AirNow API key required', 'error');
            }
            return;
        }
        
        if (typeof ModalsModule !== 'undefined') {
            ModalsModule.showToast('Checking air quality...', 'info', 2000);
        }
        
        await checkCurrentLocation();
        await checkAllWaypoints();
        
        if (typeof ModalsModule !== 'undefined') {
            ModalsModule.showToast('Air quality check complete', 'success');
        }
    }
    
    /**
     * Get forecast for display
     */
    async function getForecastForLocation(lat, lon) {
        return await fetchForecast(lat, lon);
    }
    
    // Restore monitoring state after init
    setTimeout(() => {
        if (apiKey) {
            restoreMonitoringState();
        }
    }, 2000);

    // Public API
    return {
        init,
        setApiKey,
        getApiKey,
        fetchAQI,
        getCurrentLocationAQI,
        getMapCenterAQI,
        isInCoverageArea,
        getCategory,
        clearCache,
        getCoverageMessage,
        renderAQIBadge,
        renderUnavailable,
        formatObservationTime,
        // Map layer functions
        addMapLayer,
        removeMapLayer,
        refreshMapLayer,
        toggleMapLayer,
        isMapLayerVisible,
        fetchStationsInBounds,
        // Monitoring functions
        startMonitoring,
        stopMonitoring,
        isMonitoringEnabled,
        getMonitoringSettings,
        setThresholds,
        setSensitiveGroups,
        checkNow,
        // Forecast functions
        fetchForecast,
        getForecastForLocation,
        // Constants
        AQI_CATEGORIES,
        POLLUTANTS,
        COVERAGE_BOUNDS
    };
})();

// Export to window
window.AirQualityModule = AirQualityModule;
