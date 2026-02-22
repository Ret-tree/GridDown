/**
 * GridDown Weather Module - Weather Integration for Route Planning
 * Uses Open-Meteo API (free, no key required)
 * Provides current conditions, forecasts, alerts, and route weather analysis
 */
const WeatherModule = (function() {
    'use strict';

    // API endpoints
    const WEATHER_API = 'https://api.open-meteo.com/v1/forecast';
    
    // Cache for weather data (expires after 30 minutes)
    const weatherCache = new Map();
    const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
    
    // Weather condition codes mapping
    const WMO_CODES = {
        0: { desc: 'Clear sky', icon: '☀️', severity: 0 },
        1: { desc: 'Mainly clear', icon: '🌤️', severity: 0 },
        2: { desc: 'Partly cloudy', icon: '⛅', severity: 0 },
        3: { desc: 'Overcast', icon: '☁️', severity: 0 },
        45: { desc: 'Foggy', icon: '🌫️', severity: 1 },
        48: { desc: 'Depositing rime fog', icon: '🌫️', severity: 1 },
        51: { desc: 'Light drizzle', icon: '🌧️', severity: 1 },
        53: { desc: 'Moderate drizzle', icon: '🌧️', severity: 1 },
        55: { desc: 'Dense drizzle', icon: '🌧️', severity: 2 },
        56: { desc: 'Light freezing drizzle', icon: '🌨️', severity: 2 },
        57: { desc: 'Dense freezing drizzle', icon: '🌨️', severity: 3 },
        61: { desc: 'Slight rain', icon: '🌧️', severity: 1 },
        63: { desc: 'Moderate rain', icon: '🌧️', severity: 2 },
        65: { desc: 'Heavy rain', icon: '🌧️', severity: 3 },
        66: { desc: 'Light freezing rain', icon: '🌨️', severity: 3 },
        67: { desc: 'Heavy freezing rain', icon: '🌨️', severity: 4 },
        71: { desc: 'Slight snow', icon: '🌨️', severity: 2 },
        73: { desc: 'Moderate snow', icon: '🌨️', severity: 3 },
        75: { desc: 'Heavy snow', icon: '❄️', severity: 4 },
        77: { desc: 'Snow grains', icon: '🌨️', severity: 2 },
        80: { desc: 'Slight rain showers', icon: '🌦️', severity: 1 },
        81: { desc: 'Moderate rain showers', icon: '🌦️', severity: 2 },
        82: { desc: 'Violent rain showers', icon: '⛈️', severity: 4 },
        85: { desc: 'Slight snow showers', icon: '🌨️', severity: 2 },
        86: { desc: 'Heavy snow showers', icon: '❄️', severity: 3 },
        95: { desc: 'Thunderstorm', icon: '⛈️', severity: 4 },
        96: { desc: 'Thunderstorm with slight hail', icon: '⛈️', severity: 4 },
        99: { desc: 'Thunderstorm with heavy hail', icon: '⛈️', severity: 5 }
    };

    // Alert thresholds
    const ALERT_THRESHOLDS = {
        temperature: {
            extremeHeat: 100,      // °F
            heat: 90,
            cold: 32,
            extremeCold: 10
        },
        wind: {
            extreme: 50,          // mph
            high: 30,
            moderate: 20
        },
        precipitation: {
            heavy: 0.5,           // inches/hour
            moderate: 0.2
        },
        visibility: {
            poor: 1,              // miles
            moderate: 3
        }
    };
    
    let initialized = false;
    let cleanupInterval = null;
    let currentWind = null;

    // ==================== Weather Monitoring State ====================
    let weatherMonitoringEnabled = false;
    let weatherMonitoringTimer = null;
    let waypointMonitoringTimer = null;
    let weatherMonitoringLastCheck = null;
    let waypointMonitoringLastCheck = null;
    let weatherMonitoringSettings = {
        intervalMs: 30 * 60 * 1000,      // 30 minutes default (current position)
        waypointIntervalMs: 60 * 60 * 1000, // 60 minutes default (waypoints)
        waypointMonitoring: true,         // Monitor waypoints alongside current position
        lastConditions: null              // Cache last conditions for UI display
    };

    // ==================== FIS-B SIGMET Processing State (Phase 3) ====================
    // Track alerted SIGMET IDs to prevent duplicate notifications
    const alertedSigmetIds = new Map();  // sigmetKey -> { timestamp, expiration }
    const SIGMET_ALERT_RADIUS_MI = 100;  // Alert if SIGMET is within this radius (miles)

    // ==================== NWS Weather Alerts State (Phase 4) ====================
    const NWS_API_BASE = 'https://api.weather.gov';
    const NWS_USER_AGENT = '(GridDown Emergency Navigation, contact@blackdot.technology)';
    const NWS_CACHE_DURATION = 10 * 60 * 1000;  // 10 min cache (NWS updates every ~5 min)
    let nwsAlertsCache = null;      // { lat, lon, alerts, timestamp }
    let nwsLastFetch = null;        // timestamp of last successful fetch
    let nwsLastAlertCount = 0;      // count from last fetch for UI display
    const alertedNWSIds = new Map(); // alertId -> { timestamp, expiration }

    /**
     * Initialize the module
     */
    function init() {
        if (initialized) {
            console.debug('WeatherModule already initialized');
            return;
        }
        
        console.log('WeatherModule initialized');
        
        // Set up periodic cache cleanup
        cleanupInterval = setInterval(cleanupCache, 5 * 60 * 1000);
        initialized = true;
        
        // Restore weather monitoring state from storage
        _restoreWeatherMonitoringState();
    }
    
    /**
     * Cleanup module resources
     */
    function destroy() {
        stopWeatherMonitoring();
        if (cleanupInterval) {
            clearInterval(cleanupInterval);
            cleanupInterval = null;
        }
        weatherCache.clear();
        initialized = false;
        console.log('WeatherModule destroyed');
    }

    /**
     * Clean up expired cache entries
     */
    function cleanupCache() {
        const now = Date.now();
        for (const [key, entry] of weatherCache.entries()) {
            if (now - entry.timestamp > CACHE_DURATION) {
                weatherCache.delete(key);
            }
        }
    }

    /**
     * Get cache key for coordinates
     */
    function getCacheKey(lat, lon) {
        return `${lat.toFixed(2)},${lon.toFixed(2)}`;
    }

    /**
     * Fetch current weather and forecast for a location
     */
    async function fetchWeather(lat, lon, options = {}) {
        const cacheKey = getCacheKey(lat, lon);
        const cached = weatherCache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
            return cached.data;
        }

        const forecastDays = options.forecastDays || 7;
        
        try {
            const params = new URLSearchParams({
                latitude: lat.toFixed(6),
                longitude: lon.toFixed(6),
                current: [
                    'temperature_2m',
                    'relative_humidity_2m',
                    'apparent_temperature',
                    'precipitation',
                    'rain',
                    'snowfall',
                    'weather_code',
                    'cloud_cover',
                    'wind_speed_10m',
                    'wind_direction_10m',
                    'wind_gusts_10m',
                    'dewpoint_2m',
                    'uv_index'
                ].join(','),
                hourly: [
                    'temperature_2m',
                    'relative_humidity_2m',
                    'precipitation_probability',
                    'precipitation',
                    'weather_code',
                    'wind_speed_10m',
                    'wind_direction_10m',
                    'wind_gusts_10m',
                    'visibility'
                ].join(','),
                daily: [
                    'weather_code',
                    'temperature_2m_max',
                    'temperature_2m_min',
                    'apparent_temperature_max',
                    'apparent_temperature_min',
                    'sunrise',
                    'sunset',
                    'precipitation_sum',
                    'precipitation_probability_max',
                    'wind_speed_10m_max',
                    'wind_gusts_10m_max'
                ].join(','),
                temperature_unit: 'fahrenheit',
                wind_speed_unit: 'mph',
                precipitation_unit: 'inch',
                timezone: 'auto',
                forecast_days: forecastDays
            });

            const response = await fetch(`${WEATHER_API}?${params}`);
            
            if (!response.ok) {
                throw new Error(`Weather API error: ${response.status}`);
            }

            const data = await response.json();
            const processed = processWeatherData(data);
            
            // Cache the result
            weatherCache.set(cacheKey, {
                timestamp: Date.now(),
                data: processed
            });

            // Update wind data and map indicator
            if (processed.current) {
                currentWind = {
                    speed: processed.current.windSpeed,
                    direction: processed.current.windDirection,
                    gusts: processed.current.windGusts,
                    cardinal: windDirectionToCardinal(processed.current.windDirection),
                    dewpoint: processed.current.dewpoint,
                    uvIndex: processed.current.uvIndex,
                    time: processed.current.time
                };
                updateWindIndicator(currentWind);
                if (typeof Events !== 'undefined') {
                    Events.emit('weather:wind', currentWind);
                }
            }

            return processed;
        } catch (err) {
            console.error('Weather fetch error:', err);
            throw err;
        }
    }

    /**
     * Process raw API data into usable format
     */
    function processWeatherData(data) {
        const current = data.current ? {
            temperature: data.current.temperature_2m,
            feelsLike: data.current.apparent_temperature,
            humidity: data.current.relative_humidity_2m,
            precipitation: data.current.precipitation,
            rain: data.current.rain,
            snow: data.current.snowfall,
            weatherCode: data.current.weather_code,
            weather: WMO_CODES[data.current.weather_code] || WMO_CODES[0],
            cloudCover: data.current.cloud_cover,
            windSpeed: data.current.wind_speed_10m,
            windDirection: data.current.wind_direction_10m,
            windGusts: data.current.wind_gusts_10m,
            dewpoint: data.current.dewpoint_2m,
            uvIndex: data.current.uv_index,
            time: data.current.time
        } : null;

        const hourly = data.hourly ? data.hourly.time.map((time, i) => ({
            time: time,
            temperature: data.hourly.temperature_2m[i],
            humidity: data.hourly.relative_humidity_2m[i],
            precipProbability: data.hourly.precipitation_probability[i],
            precipitation: data.hourly.precipitation[i],
            weatherCode: data.hourly.weather_code[i],
            weather: WMO_CODES[data.hourly.weather_code[i]] || WMO_CODES[0],
            windSpeed: data.hourly.wind_speed_10m[i],
            windDirection: data.hourly.wind_direction_10m ? data.hourly.wind_direction_10m[i] : null,
            windGusts: data.hourly.wind_gusts_10m[i],
            visibility: data.hourly.visibility ? data.hourly.visibility[i] / 1609.34 : null // Convert meters to miles
        })) : [];

        const daily = data.daily ? data.daily.time.map((time, i) => ({
            date: time,
            weatherCode: data.daily.weather_code[i],
            weather: WMO_CODES[data.daily.weather_code[i]] || WMO_CODES[0],
            tempMax: data.daily.temperature_2m_max[i],
            tempMin: data.daily.temperature_2m_min[i],
            feelsLikeMax: data.daily.apparent_temperature_max[i],
            feelsLikeMin: data.daily.apparent_temperature_min[i],
            sunrise: data.daily.sunrise[i],
            sunset: data.daily.sunset[i],
            precipitation: data.daily.precipitation_sum[i],
            precipProbability: data.daily.precipitation_probability_max[i],
            windMax: data.daily.wind_speed_10m_max[i],
            gustsMax: data.daily.wind_gusts_10m_max[i]
        })) : [];

        return {
            current,
            hourly,
            daily,
            timezone: data.timezone,
            location: {
                lat: data.latitude,
                lon: data.longitude,
                elevation: data.elevation
            }
        };
    }

    /**
     * Get weather for a specific waypoint
     */
    async function getWaypointWeather(waypoint) {
        const lat = waypoint.lat || (37.4215 + (waypoint.y - 50) * 0.002);
        const lon = waypoint.lon || (-119.1892 + (waypoint.x - 50) * 0.004);
        
        return await fetchWeather(lat, lon);
    }

    /**
     * Analyze weather conditions along a route
     */
    async function analyzeRouteWeather(route, waypoints, options = {}) {
        if (!route || !route.points || route.points.length < 2) {
            return null;
        }

        const travelDate = options.travelDate || new Date();
        const travelHours = options.estimatedHours || 8;
        
        // Get coordinates for key points along route
        const routePoints = [];
        const numSamples = Math.min(route.points.length, 5); // Sample up to 5 points
        const step = Math.floor(route.points.length / numSamples);
        
        for (let i = 0; i < route.points.length; i += step) {
            const point = route.points[i];
            let lat, lon, name;
            
            if (point.waypointId) {
                const wp = waypoints.find(w => w.id === point.waypointId);
                if (wp) {
                    lat = wp.lat || (37.4215 + (wp.y - 50) * 0.002);
                    lon = wp.lon || (-119.1892 + (wp.x - 50) * 0.004);
                    name = wp.name;
                }
            }
            
            if (!lat || !lon) {
                lat = point.lat || (37.4215 + ((point.y || 50) - 50) * 0.002);
                lon = point.lon || (-119.1892 + ((point.x || 50) - 50) * 0.004);
                name = `Point ${routePoints.length + 1}`;
            }
            
            routePoints.push({ lat, lon, name, index: i });
        }

        // Ensure we include the last point
        const lastPoint = route.points[route.points.length - 1];
        if (routePoints[routePoints.length - 1].index !== route.points.length - 1) {
            let lat, lon, name;
            if (lastPoint.waypointId) {
                const wp = waypoints.find(w => w.id === lastPoint.waypointId);
                if (wp) {
                    lat = wp.lat || (37.4215 + (wp.y - 50) * 0.002);
                    lon = wp.lon || (-119.1892 + (wp.x - 50) * 0.004);
                    name = wp.name;
                }
            }
            if (!lat || !lon) {
                lat = lastPoint.lat || (37.4215 + ((lastPoint.y || 50) - 50) * 0.002);
                lon = lastPoint.lon || (-119.1892 + ((lastPoint.x || 50) - 50) * 0.004);
                name = 'End Point';
            }
            routePoints.push({ lat, lon, name, index: route.points.length - 1 });
        }

        // Fetch weather for each point
        const weatherData = await Promise.all(
            routePoints.map(async (point) => {
                try {
                    const weather = await fetchWeather(point.lat, point.lon);
                    return { ...point, weather };
                } catch (err) {
                    return { ...point, weather: null, error: err.message };
                }
            })
        );

        // Generate alerts and recommendations
        const alerts = generateRouteAlerts(weatherData, travelDate, travelHours);
        const recommendations = generateRecommendations(weatherData, alerts);
        const bestWindows = findBestTravelWindows(weatherData, travelHours);

        return {
            points: weatherData,
            alerts,
            recommendations,
            bestWindows,
            summary: generateRouteSummary(weatherData)
        };
    }

    // =========================================================================
    // WEATHER ALERT PROCESSING — AlertModule Integration
    // =========================================================================
    
    /**
     * Process current weather conditions through AlertModule.
     * This is the shared entry point for all weather-to-alert routing:
     * background monitoring (Phase 2), FIS-B SIGMETs (Phase 3), and
     * NWS fallback (Phase 4) all funnel through this function.
     * 
     * Evaluates current conditions against ALERT_THRESHOLDS and fires
     * AlertModule.trigger() for each breach. AlertModule handles
     * deduplication (60s debounce per alert key), sound, banners,
     * push notifications, and history.
     * 
     * @param {Object} current - Current conditions object (from fetchWeather().current)
     * @param {string} locationName - Human-readable location (e.g. "Current Location", waypoint name)
     * @returns {Array} Array of triggered alert objects (from AlertModule.trigger), empty if none
     */
    function processWeatherAlerts(current, locationName) {
        if (!current || typeof AlertModule === 'undefined') return [];
        
        const triggered = [];
        const loc = locationName || 'Current Location';
        
        // --- Temperature ---
        if (current.temperature >= ALERT_THRESHOLDS.temperature.extremeHeat) {
            const result = AlertModule.trigger({
                source: AlertModule.SOURCES.WEATHER,
                severity: AlertModule.SEVERITY.CRITICAL,
                title: 'Extreme Heat',
                message: `${loc}: ${Math.round(current.temperature)}°F — carry extra water, travel during cooler hours`,
                data: { type: 'extreme_heat', temperature: current.temperature, location: loc },
                persistent: true,
                sound: true,
                notification: true
            });
            if (result) triggered.push(result);
        } else if (current.temperature >= ALERT_THRESHOLDS.temperature.heat) {
            const result = AlertModule.trigger({
                source: AlertModule.SOURCES.WEATHER,
                severity: AlertModule.SEVERITY.WARNING,
                title: 'High Temperature',
                message: `${loc}: ${Math.round(current.temperature)}°F — stay hydrated, take breaks in shade`,
                data: { type: 'heat', temperature: current.temperature, location: loc },
                persistent: false,
                sound: true,
                notification: true
            });
            if (result) triggered.push(result);
        } else if (current.temperature <= ALERT_THRESHOLDS.temperature.extremeCold) {
            const result = AlertModule.trigger({
                source: AlertModule.SOURCES.WEATHER,
                severity: AlertModule.SEVERITY.CRITICAL,
                title: 'Extreme Cold',
                message: `${loc}: ${Math.round(current.temperature)}°F — risk of hypothermia, ensure proper gear`,
                data: { type: 'extreme_cold', temperature: current.temperature, location: loc },
                persistent: true,
                sound: true,
                notification: true
            });
            if (result) triggered.push(result);
        } else if (current.temperature <= ALERT_THRESHOLDS.temperature.cold) {
            const result = AlertModule.trigger({
                source: AlertModule.SOURCES.WEATHER,
                severity: AlertModule.SEVERITY.WARNING,
                title: 'Cold Conditions',
                message: `${loc}: ${Math.round(current.temperature)}°F — layer clothing, watch for ice`,
                data: { type: 'cold', temperature: current.temperature, location: loc },
                persistent: false,
                sound: true,
                notification: true
            });
            if (result) triggered.push(result);
        }
        
        // --- Wind ---
        if (current.windGusts >= ALERT_THRESHOLDS.wind.extreme) {
            const result = AlertModule.trigger({
                source: AlertModule.SOURCES.WEATHER,
                severity: AlertModule.SEVERITY.CRITICAL,
                title: 'Dangerous Wind',
                message: `${loc}: gusts to ${Math.round(current.windGusts)} mph — avoid exposed areas, secure gear`,
                data: { type: 'extreme_wind', windGusts: current.windGusts, windSpeed: current.windSpeed, location: loc },
                persistent: true,
                sound: true,
                notification: true
            });
            if (result) triggered.push(result);
        } else if (current.windSpeed >= ALERT_THRESHOLDS.wind.high) {
            const result = AlertModule.trigger({
                source: AlertModule.SOURCES.WEATHER,
                severity: AlertModule.SEVERITY.WARNING,
                title: 'High Wind',
                message: `${loc}: ${Math.round(current.windSpeed)} mph — exercise caution on exposed terrain`,
                data: { type: 'high_wind', windSpeed: current.windSpeed, location: loc },
                persistent: false,
                sound: true,
                notification: true
            });
            if (result) triggered.push(result);
        }
        
        // --- Severe weather (WMO code severity) ---
        if (current.weather && current.weather.severity >= 4) {
            const result = AlertModule.trigger({
                source: AlertModule.SOURCES.WEATHER,
                severity: AlertModule.SEVERITY.CRITICAL,
                title: 'Severe Weather',
                message: `${loc}: ${current.weather.desc} — consider finding shelter`,
                data: { type: 'severe_weather', weatherCode: current.weatherCode, desc: current.weather.desc, location: loc },
                persistent: true,
                sound: true,
                notification: true
            });
            if (result) triggered.push(result);
        } else if (current.weather && current.weather.severity >= 3) {
            const result = AlertModule.trigger({
                source: AlertModule.SOURCES.WEATHER,
                severity: AlertModule.SEVERITY.WARNING,
                title: 'Adverse Weather',
                message: `${loc}: ${current.weather.desc} — prepare for adverse conditions`,
                data: { type: 'bad_weather', weatherCode: current.weatherCode, desc: current.weather.desc, location: loc },
                persistent: false,
                sound: true,
                notification: true
            });
            if (result) triggered.push(result);
        }
        
        // --- Visibility (from current conditions if available) ---
        // Note: Open-Meteo only provides visibility in hourly data, not current.
        // This check supports future sources (FIS-B, NWS) that include current visibility.
        if (current.visibility != null && current.visibility < ALERT_THRESHOLDS.visibility.poor) {
            const result = AlertModule.trigger({
                source: AlertModule.SOURCES.WEATHER,
                severity: AlertModule.SEVERITY.CAUTION,
                title: 'Poor Visibility',
                message: `${loc}: ${current.visibility.toFixed(1)} miles — slow down, use navigation aids`,
                data: { type: 'visibility', visibility: current.visibility, location: loc },
                persistent: false,
                sound: false,
                notification: false
            });
            if (result) triggered.push(result);
        }
        
        if (triggered.length > 0) {
            console.log(`[Weather] processWeatherAlerts: ${triggered.length} alert(s) triggered for "${loc}"`);
        }
        
        return triggered;
    }

    // =========================================================================
    // BACKGROUND WEATHER MONITORING (Phase 2)
    // =========================================================================
    
    /**
     * Check weather conditions at the user's current position.
     * Gets GPS location (or falls back to map center), fetches weather,
     * and routes current conditions through processWeatherAlerts().
     * 
     * @returns {Object|null} { lat, lon, weather, alerts } or null if no position available
     */
    async function checkWeatherAtCurrentPosition() {
        let lat, lon;
        
        // Priority 1: GPS position
        if (typeof GPSModule !== 'undefined') {
            const pos = GPSModule.getPosition();
            if (pos?.lat && pos?.lon) {
                lat = pos.lat;
                lon = pos.lon;
            }
        }
        
        // Priority 2: Map center fallback
        if (!lat && typeof MapModule !== 'undefined') {
            const mapState = MapModule.getMapState();
            if (mapState?.lat && mapState?.lon) {
                lat = mapState.lat;
                lon = mapState.lon;
            }
        }
        
        if (!lat || !lon) {
            console.debug('[Weather Monitor] No position available, skipping check');
            return null;
        }
        
        try {
            const weather = await fetchWeather(lat, lon);
            weatherMonitoringLastCheck = Date.now();
            
            if (!weather?.current) {
                console.debug('[Weather Monitor] No current conditions returned');
                return { lat, lon, weather, alerts: [] };
            }
            
            // Cache conditions for status display
            weatherMonitoringSettings.lastConditions = {
                temperature: weather.current.temperature,
                windSpeed: weather.current.windSpeed,
                windGusts: weather.current.windGusts,
                weatherCode: weather.current.weatherCode,
                desc: weather.current.weather?.desc,
                icon: weather.current.weather?.icon,
                timestamp: Date.now()
            };
            
            // Route through Phase 1 plumbing
            const alerts = processWeatherAlerts(weather.current, 'Current Location');
            
            // Phase 4: NWS alerts fallback when AtlasRF is not providing FIS-B
            let nwsAlerts = [];
            if (!_isAtlasRFProvidingAlerts()) {
                try {
                    const nwsFeatures = await fetchNWSAlerts(lat, lon);
                    if (nwsFeatures && nwsFeatures.length > 0) {
                        nwsAlerts = processNWSAlerts(nwsFeatures, 'Current Location');
                    }
                } catch (err) {
                    console.debug('[Weather Monitor] NWS fallback check failed:', err.message);
                }
            }
            
            const allAlerts = [...alerts, ...nwsAlerts];
            
            // Emit event for other modules to consume
            if (typeof Events !== 'undefined') {
                Events.emit('weather:monitoring:check', {
                    lat, lon, weather, alerts: allAlerts,
                    nwsActive: !_isAtlasRFProvidingAlerts(),
                    timestamp: weatherMonitoringLastCheck
                });
            }
            
            return { lat, lon, weather, alerts: allAlerts };
        } catch (err) {
            console.warn('[Weather Monitor] Check failed:', err.message);
            return null;
        }
    }
    
    /**
     * Check weather conditions at all saved waypoints.
     * Iterates each waypoint with a lat/lon, fetches weather, and routes
     * through processWeatherAlerts(). Also checks NWS alerts per waypoint
     * when AtlasRF is not providing FIS-B.
     * 
     * Throttles requests with 1-second delays between waypoints to avoid
     * hammering the Open-Meteo API.
     * 
     * @returns {Array} Array of { waypoint, weather, alerts } results
     */
    async function checkWeatherAtWaypoints() {
        if (typeof State === 'undefined') return [];
        
        const waypoints = State.get('waypoints') || [];
        if (waypoints.length === 0) return [];
        
        const results = [];
        const nwsFallback = !_isAtlasRFProvidingAlerts();
        
        for (const wp of waypoints) {
            if (!wp.lat || !wp.lon) continue;
            
            // Throttle between waypoints
            if (results.length > 0) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            try {
                const weather = await fetchWeather(wp.lat, wp.lon);
                let alerts = [];
                
                if (weather?.current) {
                    const wpName = wp.name || wp.label || `Waypoint (${wp.lat.toFixed(2)}, ${wp.lon.toFixed(2)})`;
                    alerts = processWeatherAlerts(weather.current, wpName);
                    
                    // NWS fallback for waypoint location
                    if (nwsFallback) {
                        try {
                            const nwsFeatures = await fetchNWSAlerts(wp.lat, wp.lon);
                            if (nwsFeatures && nwsFeatures.length > 0) {
                                const nwsAlerts = processNWSAlerts(nwsFeatures, wpName);
                                alerts = [...alerts, ...nwsAlerts];
                            }
                        } catch (e) {
                            // NWS errors don't break waypoint monitoring
                        }
                    }
                }
                
                results.push({ waypoint: wp, weather, alerts });
            } catch (err) {
                console.debug(`[Weather Monitor] Waypoint "${wp.name || ''}" check failed:`, err.message);
            }
        }
        
        waypointMonitoringLastCheck = Date.now();
        
        if (results.length > 0) {
            const totalAlerts = results.reduce((sum, r) => sum + r.alerts.length, 0);
            if (totalAlerts > 0) {
                console.log(`[Weather Monitor] Waypoint check: ${totalAlerts} alert(s) across ${results.length} waypoints`);
            }
            
            if (typeof Events !== 'undefined') {
                Events.emit('weather:monitoring:waypoints', {
                    results, timestamp: waypointMonitoringLastCheck
                });
            }
        }
        
        return results;
    }
    
    /**
     * Start background weather monitoring.
     * Performs an immediate check, then sets up periodic polling.
     * 
     * @param {Object} options
     * @param {number} options.intervalMs - Polling interval in ms (default 30 min)
     * @returns {boolean} true if started successfully
     */
    function startWeatherMonitoring(options = {}) {
        // Update settings if provided
        if (options.intervalMs && options.intervalMs >= 5 * 60 * 1000) {
            weatherMonitoringSettings.intervalMs = options.intervalMs;
        }
        if (options.waypointIntervalMs && options.waypointIntervalMs >= 15 * 60 * 1000) {
            weatherMonitoringSettings.waypointIntervalMs = options.waypointIntervalMs;
        }
        if (typeof options.waypointMonitoring === 'boolean') {
            weatherMonitoringSettings.waypointMonitoring = options.waypointMonitoring;
        }
        
        // Stop existing monitoring first
        stopWeatherMonitoring(true);  // silent = true, don't clear enabled flag
        
        weatherMonitoringEnabled = true;
        
        // Immediate first check — current position
        checkWeatherAtCurrentPosition();
        
        // Set up periodic polling — current position
        weatherMonitoringTimer = setInterval(() => {
            checkWeatherAtCurrentPosition();
        }, weatherMonitoringSettings.intervalMs);
        
        // Waypoint monitoring (separate, longer interval)
        if (weatherMonitoringSettings.waypointMonitoring) {
            // Delay first waypoint check by 5s to avoid overlapping with position check
            setTimeout(() => checkWeatherAtWaypoints(), 5000);
            
            waypointMonitoringTimer = setInterval(() => {
                checkWeatherAtWaypoints();
            }, weatherMonitoringSettings.waypointIntervalMs);
        }
        
        // Persist state
        _saveWeatherMonitoringState();
        
        console.log(`[Weather Monitor] Started (position: every ${Math.round(weatherMonitoringSettings.intervalMs / 60000)} min` +
            `${weatherMonitoringSettings.waypointMonitoring ? `, waypoints: every ${Math.round(weatherMonitoringSettings.waypointIntervalMs / 60000)} min` : ''})`);
        return true;
    }
    
    /**
     * Stop background weather monitoring.
     * 
     * @param {boolean} silent - If true, don't clear enabled flag (used internally for restart)
     */
    function stopWeatherMonitoring(silent) {
        if (weatherMonitoringTimer) {
            clearInterval(weatherMonitoringTimer);
            weatherMonitoringTimer = null;
        }
        if (waypointMonitoringTimer) {
            clearInterval(waypointMonitoringTimer);
            waypointMonitoringTimer = null;
        }
        
        if (!silent) {
            weatherMonitoringEnabled = false;
            _saveWeatherMonitoringState();
            console.log('[Weather Monitor] Stopped');
        }
    }
    
    /**
     * Manual immediate check — for "Check Now" button.
     * Works whether monitoring is enabled or not.
     * 
     * @returns {Object|null} Check result from checkWeatherAtCurrentPosition
     */
    async function checkWeatherNow() {
        const result = await checkWeatherAtCurrentPosition();
        // Also check waypoints if enabled
        if (weatherMonitoringSettings.waypointMonitoring) {
            checkWeatherAtWaypoints();  // fire and forget, don't await
        }
        return result;
    }
    
    /**
     * Update the monitoring interval. If monitoring is active, restarts with new interval.
     * 
     * @param {number} intervalMs - New interval in milliseconds (minimum 5 minutes)
     */
    function setWeatherMonitoringInterval(intervalMs) {
        if (intervalMs < 5 * 60 * 1000) {
            console.warn('[Weather Monitor] Minimum interval is 5 minutes');
            intervalMs = 5 * 60 * 1000;
        }
        
        weatherMonitoringSettings.intervalMs = intervalMs;
        _saveWeatherMonitoringState();
        
        // Restart with new interval if currently running
        if (weatherMonitoringEnabled && weatherMonitoringTimer) {
            stopWeatherMonitoring(true);
            weatherMonitoringTimer = setInterval(() => {
                checkWeatherAtCurrentPosition();
            }, weatherMonitoringSettings.intervalMs);
            console.log(`[Weather Monitor] Interval updated to ${Math.round(intervalMs / 60000)} min`);
        }
    }
    
    /**
     * Check if weather monitoring is currently active.
     * @returns {boolean}
     */
    function isWeatherMonitoringEnabled() {
        return weatherMonitoringEnabled;
    }
    
    /**
     * Get weather monitoring settings and status.
     * @returns {Object} { enabled, intervalMs, lastCheck, lastConditions }
     */
    function getWeatherMonitoringSettings() {
        const waypointCount = typeof State !== 'undefined' ? (State.get('waypoints') || []).length : 0;
        return {
            enabled: weatherMonitoringEnabled,
            intervalMs: weatherMonitoringSettings.intervalMs,
            waypointIntervalMs: weatherMonitoringSettings.waypointIntervalMs,
            waypointMonitoring: weatherMonitoringSettings.waypointMonitoring,
            waypointCount,
            waypointLastCheck: waypointMonitoringLastCheck,
            lastCheck: weatherMonitoringLastCheck,
            lastConditions: weatherMonitoringSettings.lastConditions,
            thresholds: { ...ALERT_THRESHOLDS },
            nws: getNWSAlertStatus()
        };
    }
    
    /**
     * Get current alert thresholds.
     * @returns {Object} deep copy of ALERT_THRESHOLDS
     */
    function getAlertThresholds() {
        return JSON.parse(JSON.stringify(ALERT_THRESHOLDS));
    }
    
    /**
     * Update alert thresholds. Merges provided values with current thresholds.
     * Validates ranges and persists to storage.
     * 
     * @param {Object} thresholds — partial threshold object to merge
     * @returns {Object} updated thresholds
     */
    function setAlertThresholds(thresholds) {
        if (!thresholds || typeof thresholds !== 'object') return ALERT_THRESHOLDS;
        
        // Merge temperature thresholds
        if (thresholds.temperature) {
            const t = thresholds.temperature;
            if (t.extremeHeat != null) ALERT_THRESHOLDS.temperature.extremeHeat = Number(t.extremeHeat);
            if (t.heat != null) ALERT_THRESHOLDS.temperature.heat = Number(t.heat);
            if (t.cold != null) ALERT_THRESHOLDS.temperature.cold = Number(t.cold);
            if (t.extremeCold != null) ALERT_THRESHOLDS.temperature.extremeCold = Number(t.extremeCold);
        }
        
        // Merge wind thresholds
        if (thresholds.wind) {
            const w = thresholds.wind;
            if (w.extreme != null) ALERT_THRESHOLDS.wind.extreme = Number(w.extreme);
            if (w.high != null) ALERT_THRESHOLDS.wind.high = Number(w.high);
            if (w.moderate != null) ALERT_THRESHOLDS.wind.moderate = Number(w.moderate);
        }
        
        // Merge visibility threshold
        if (thresholds.visibility) {
            if (thresholds.visibility.poor != null) ALERT_THRESHOLDS.visibility.poor = Number(thresholds.visibility.poor);
            if (thresholds.visibility.moderate != null) ALERT_THRESHOLDS.visibility.moderate = Number(thresholds.visibility.moderate);
        }
        
        // Merge precipitation threshold
        if (thresholds.precipitation) {
            if (thresholds.precipitation.heavy != null) ALERT_THRESHOLDS.precipitation.heavy = Number(thresholds.precipitation.heavy);
            if (thresholds.precipitation.moderate != null) ALERT_THRESHOLDS.precipitation.moderate = Number(thresholds.precipitation.moderate);
        }
        
        _saveWeatherMonitoringState();
        console.log('[Weather Monitor] Alert thresholds updated');
        return JSON.parse(JSON.stringify(ALERT_THRESHOLDS));
    }
    
    /**
     * Toggle waypoint monitoring on/off. If monitoring is active, restarts to apply.
     * 
     * @param {boolean} enabled
     */
    function setWaypointMonitoring(enabled) {
        weatherMonitoringSettings.waypointMonitoring = !!enabled;
        _saveWeatherMonitoringState();
        
        // Restart monitoring to apply change if currently running
        if (weatherMonitoringEnabled) {
            startWeatherMonitoring();
        }
    }
    
    /**
     * Persist monitoring state to storage for restore across page loads.
     * @private
     */
    function _saveWeatherMonitoringState() {
        try {
            if (typeof Storage !== 'undefined' && Storage.Settings) {
                Storage.Settings.set('weatherMonitoringEnabled', weatherMonitoringEnabled);
                Storage.Settings.set('weatherMonitoringSettings', {
                    intervalMs: weatherMonitoringSettings.intervalMs,
                    waypointIntervalMs: weatherMonitoringSettings.waypointIntervalMs,
                    waypointMonitoring: weatherMonitoringSettings.waypointMonitoring
                });
                Storage.Settings.set('weatherAlertThresholds', {
                    temperature: { ...ALERT_THRESHOLDS.temperature },
                    wind: { ...ALERT_THRESHOLDS.wind },
                    visibility: { ...ALERT_THRESHOLDS.visibility },
                    precipitation: { ...ALERT_THRESHOLDS.precipitation }
                });
            }
        } catch (e) {
            console.warn('[Weather Monitor] Could not save state:', e);
        }
    }
    
    /**
     * Restore monitoring state from storage on app load.
     * Called from init() to resume monitoring if it was active before page refresh.
     * @private
     */
    async function _restoreWeatherMonitoringState() {
        try {
            if (typeof Storage === 'undefined' || !Storage.Settings) return;
            
            const enabled = await Storage.Settings.get('weatherMonitoringEnabled', false);
            const settings = await Storage.Settings.get('weatherMonitoringSettings', null);
            const thresholds = await Storage.Settings.get('weatherAlertThresholds', null);
            
            if (settings?.intervalMs) {
                weatherMonitoringSettings.intervalMs = settings.intervalMs;
            }
            if (settings?.waypointIntervalMs) {
                weatherMonitoringSettings.waypointIntervalMs = settings.waypointIntervalMs;
            }
            if (typeof settings?.waypointMonitoring === 'boolean') {
                weatherMonitoringSettings.waypointMonitoring = settings.waypointMonitoring;
            }
            
            // Restore custom thresholds
            if (thresholds) {
                setAlertThresholds(thresholds);
            }
            
            if (enabled) {
                startWeatherMonitoring();
                console.log('[Weather Monitor] Restored active monitoring from saved state');
            }
        } catch (e) {
            console.warn('[Weather Monitor] Could not restore state:', e);
        }
    }

    // =========================================================================
    // NWS WEATHER ALERTS API — FALLBACK (Phase 4)
    // =========================================================================
    
    /**
     * Determine whether AtlasRF is actively providing FIS-B weather data.
     * When AtlasRF is connected and not stale, NWS fallback is suppressed
     * to avoid duplicate alerting from two sources.
     * 
     * @returns {boolean} true if AtlasRF FIS-B is active
     */
    function _isAtlasRFProvidingAlerts() {
        if (typeof AtlasRFModule === 'undefined') return false;
        if (!AtlasRFModule.isConnected()) return false;
        
        // Check if weather source is set to FIS-B
        const source = AtlasRFModule.getWeatherSource();
        if (source !== 'fisb') return false;
        
        // Check if FIS-B data is not stale
        if (AtlasRFModule.isFisBStale()) return false;
        
        return true;
    }
    
    /**
     * Fetch active weather alerts from the NWS API for a given position.
     * Returns the raw GeoJSON features array from api.weather.gov.
     * Uses a 10-minute cache to avoid hammering the API.
     * 
     * NWS API documentation: https://www.weather.gov/documentation/services-web-api
     * 
     * @param {number} lat 
     * @param {number} lon
     * @returns {Array|null} Array of GeoJSON alert features, or null on error
     */
    async function fetchNWSAlerts(lat, lon) {
        // Check cache — same area, recent enough
        if (nwsAlertsCache && Date.now() - nwsAlertsCache.timestamp < NWS_CACHE_DURATION) {
            const dLat = Math.abs(lat - nwsAlertsCache.lat);
            const dLon = Math.abs(lon - nwsAlertsCache.lon);
            // Reuse cache if position hasn't moved much (~5mi)
            if (dLat < 0.07 && dLon < 0.07) {
                return nwsAlertsCache.alerts;
            }
        }
        
        try {
            const url = `${NWS_API_BASE}/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}&status=actual&message_type=alert,update`;
            
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/geo+json',
                    'User-Agent': NWS_USER_AGENT
                },
                signal: AbortSignal.timeout(15000)
            });
            
            if (!response.ok) {
                // NWS returns 404 for points outside US coverage
                if (response.status === 404) {
                    console.debug('[NWS] No coverage for this location (outside US)');
                    nwsAlertsCache = { lat, lon, alerts: [], timestamp: Date.now() };
                    return [];
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            const alerts = data.features || [];
            
            // Update cache
            nwsAlertsCache = { lat, lon, alerts, timestamp: Date.now() };
            nwsLastFetch = Date.now();
            nwsLastAlertCount = alerts.length;
            
            console.log(`[NWS] Fetched ${alerts.length} active alert(s) for ${lat.toFixed(4)},${lon.toFixed(4)}`);
            return alerts;
            
        } catch (err) {
            // Network errors expected when offline — this IS a fallback after all
            if (err.name === 'AbortError' || err.name === 'TimeoutError') {
                console.debug('[NWS] Fetch timed out (offline or slow connection)');
            } else {
                console.warn('[NWS] Fetch failed:', err.message);
            }
            return null;
        }
    }
    
    /**
     * Map an NWS alert to AlertModule severity.
     * 
     * NWS severity levels: Extreme, Severe, Moderate, Minor, Unknown
     * NWS urgency levels: Immediate, Expected, Future, Past, Unknown
     * NWS certainty levels: Observed, Likely, Possible, Unlikely, Unknown
     * 
     * @param {Object} properties — NWS alert properties
     * @returns {Object} { alertSeverity, persistent, sound, notification, icon }
     */
    function classifyNWSAlert(properties) {
        const severity = (properties.severity || '').toLowerCase();
        const urgency = (properties.urgency || '').toLowerCase();
        const event = (properties.event || '').toLowerCase();
        
        // ---- CRITICAL: Extreme severity or immediate life-threatening events ----
        if (severity === 'extreme' || 
            event.includes('tornado warning') ||
            event.includes('flash flood emergency') ||
            event.includes('tsunami warning') ||
            event.includes('extreme wind warning') ||
            event.includes('hurricane warning')) {
            return {
                alertSeverity: AlertModule.SEVERITY.CRITICAL,
                persistent: true,
                sound: true,
                notification: true,
                icon: severity === 'extreme' || event.includes('tornado') ? '🌪️' : '🔴'
            };
        }
        
        // ---- WARNING: Severe severity or warning-type products ----
        if (severity === 'severe' ||
            event.includes('warning') ||
            (urgency === 'immediate' && severity !== 'minor')) {
            
            let icon = '⚠️';
            if (event.includes('thunderstorm')) icon = '⛈️';
            else if (event.includes('flood')) icon = '🌊';
            else if (event.includes('winter storm') || event.includes('blizzard')) icon = '❄️';
            else if (event.includes('fire')) icon = '🔥';
            else if (event.includes('wind')) icon = '💨';
            else if (event.includes('heat')) icon = '🌡️';
            else if (event.includes('hurricane') || event.includes('tropical')) icon = '🌀';
            
            return {
                alertSeverity: AlertModule.SEVERITY.WARNING,
                persistent: false,
                sound: true,
                notification: true,
                icon
            };
        }
        
        // ---- CAUTION: Moderate/Minor or watch/advisory products ----
        let icon = 'ℹ️';
        if (event.includes('watch')) icon = '👁️';
        else if (event.includes('advisory')) icon = '📋';
        
        return {
            alertSeverity: AlertModule.SEVERITY.CAUTION,
            persistent: false,
            sound: false,
            notification: event.includes('watch'),  // Watches get push, advisories don't
            icon
        };
    }
    
    /**
     * Process NWS alert features through AlertModule.
     * Deduplicates by NWS alert ID to prevent re-alerting on repeated fetches.
     * 
     * @param {Array} features — GeoJSON features from NWS API
     * @param {string} locationName — human-readable location for alert message
     * @returns {Array} array of triggered alert objects
     */
    function processNWSAlerts(features, locationName) {
        if (!Array.isArray(features) || features.length === 0) return [];
        if (typeof AlertModule === 'undefined') return [];
        
        const now = Date.now();
        const triggered = [];
        
        // Purge expired entries from dedup cache
        for (const [key, entry] of alertedNWSIds.entries()) {
            if (entry.expiration < now) {
                alertedNWSIds.delete(key);
            }
        }
        
        for (const feature of features) {
            const props = feature.properties;
            if (!props) continue;
            
            // Generate dedup key from NWS alert ID
            const alertId = props.id || props['@id'] || `nws:${props.event}:${props.onset}`;
            
            // Skip if already alerted
            if (alertedNWSIds.has(alertId)) continue;
            
            // Skip expired alerts
            if (props.expires) {
                const expiresTs = new Date(props.expires).getTime();
                if (!isNaN(expiresTs) && expiresTs < now) continue;
            }
            
            // Classify
            const classification = classifyNWSAlert(props);
            
            // Build message
            const headline = props.headline || props.event || 'Weather Alert';
            const desc = props.description ?
                props.description.replace(/[\r\n]+/g, ' ').substring(0, 150).trim() :
                headline;
            
            const locStr = locationName ? ` near ${locationName}` : '';
            
            // Route through AlertModule
            const result = AlertModule.trigger({
                source: AlertModule.SOURCES.WEATHER,
                severity: classification.alertSeverity,
                title: `${classification.icon} NWS: ${props.event || 'Weather Alert'}`,
                message: `${desc}${locStr}`,
                data: {
                    type: 'nws_alert',
                    nwsId: alertId,
                    event: props.event,
                    severity: props.severity,
                    urgency: props.urgency,
                    certainty: props.certainty,
                    headline: props.headline,
                    instruction: props.instruction,
                    effective: props.effective,
                    expires: props.expires,
                    senderName: props.senderName
                },
                persistent: classification.persistent,
                sound: classification.sound,
                notification: classification.notification
            });
            
            if (result) {
                triggered.push(result);
                
                // Mark as alerted with expiration
                const expiresTs = props.expires ?
                    new Date(props.expires).getTime() : now + 4 * 60 * 60 * 1000;
                alertedNWSIds.set(alertId, {
                    timestamp: now,
                    expiration: isNaN(expiresTs) ? now + 4 * 60 * 60 * 1000 : expiresTs
                });
            }
        }
        
        if (triggered.length > 0) {
            console.log(`[NWS] processNWSAlerts: ${triggered.length} alert(s) triggered from ${features.length} active`);
            
            if (typeof Events !== 'undefined') {
                Events.emit('weather:nws:alerts', { triggered, total: features.length });
            }
        }
        
        return triggered;
    }
    
    /**
     * Get NWS alerts status for UI display.
     * @returns {Object} { lastFetch, alertCount, isActive, source }
     */
    function getNWSAlertStatus() {
        const rfActive = _isAtlasRFProvidingAlerts();
        return {
            lastFetch: nwsLastFetch,
            alertCount: nwsLastAlertCount,
            isActive: !rfActive,
            source: rfActive ? 'fisb' : 'nws',
            cachedAlerts: nwsAlertsCache?.alerts?.length || 0
        };
    }

    /**
     * Generate weather alerts for a route
     */
    function generateRouteAlerts(weatherData, travelDate, travelHours) {
        const alerts = [];
        const startHour = travelDate.getHours();
        
        weatherData.forEach((point) => {
            if (!point.weather) return;
            
            const current = point.weather.current;
            const hourly = point.weather.hourly;
            
            // Check current conditions
            if (current) {
                // Temperature alerts
                if (current.temperature >= ALERT_THRESHOLDS.temperature.extremeHeat) {
                    alerts.push({
                        type: 'extreme_heat',
                        severity: 'critical',
                        location: point.name,
                        message: `Extreme heat: ${Math.round(current.temperature)}°F`,
                        icon: '🔥',
                        recommendation: 'Carry extra water, travel during cooler hours'
                    });
                } else if (current.temperature >= ALERT_THRESHOLDS.temperature.heat) {
                    alerts.push({
                        type: 'heat',
                        severity: 'warning',
                        location: point.name,
                        message: `High temperature: ${Math.round(current.temperature)}°F`,
                        icon: '🌡️',
                        recommendation: 'Stay hydrated, take breaks in shade'
                    });
                } else if (current.temperature <= ALERT_THRESHOLDS.temperature.extremeCold) {
                    alerts.push({
                        type: 'extreme_cold',
                        severity: 'critical',
                        location: point.name,
                        message: `Extreme cold: ${Math.round(current.temperature)}°F`,
                        icon: '🥶',
                        recommendation: 'Risk of hypothermia, ensure proper gear'
                    });
                } else if (current.temperature <= ALERT_THRESHOLDS.temperature.cold) {
                    alerts.push({
                        type: 'cold',
                        severity: 'warning',
                        location: point.name,
                        message: `Cold conditions: ${Math.round(current.temperature)}°F`,
                        icon: '❄️',
                        recommendation: 'Layer clothing, watch for ice'
                    });
                }

                // Wind alerts
                if (current.windGusts >= ALERT_THRESHOLDS.wind.extreme) {
                    alerts.push({
                        type: 'extreme_wind',
                        severity: 'critical',
                        location: point.name,
                        message: `Dangerous winds: gusts to ${Math.round(current.windGusts)} mph`,
                        icon: '💨',
                        recommendation: 'Avoid exposed areas, secure gear'
                    });
                } else if (current.windSpeed >= ALERT_THRESHOLDS.wind.high) {
                    alerts.push({
                        type: 'high_wind',
                        severity: 'warning',
                        location: point.name,
                        message: `High winds: ${Math.round(current.windSpeed)} mph`,
                        icon: '🌬️',
                        recommendation: 'Exercise caution on exposed terrain'
                    });
                }

                // Severe weather alerts
                if (current.weather.severity >= 4) {
                    alerts.push({
                        type: 'severe_weather',
                        severity: 'critical',
                        location: point.name,
                        message: current.weather.desc,
                        icon: current.weather.icon,
                        recommendation: 'Consider postponing travel or finding shelter'
                    });
                } else if (current.weather.severity >= 3) {
                    alerts.push({
                        type: 'bad_weather',
                        severity: 'warning',
                        location: point.name,
                        message: current.weather.desc,
                        icon: current.weather.icon,
                        recommendation: 'Prepare for adverse conditions'
                    });
                }
            }

            // Check hourly forecast for travel window
            if (hourly && hourly.length > 0) {
                const relevantHours = hourly.slice(startHour, startHour + travelHours);
                
                relevantHours.forEach((hour, i) => {
                    // High precipitation probability
                    if (hour.precipProbability >= 70 && hour.weather.severity >= 2) {
                        const time = new Date(hour.time).toLocaleTimeString('en-US', { 
                            hour: 'numeric', 
                            hour12: true 
                        });
                        alerts.push({
                            type: 'precipitation',
                            severity: 'caution',
                            location: point.name,
                            message: `${hour.precipProbability}% chance of ${hour.weather.desc} at ${time}`,
                            icon: hour.weather.icon,
                            recommendation: 'Pack rain gear'
                        });
                    }

                    // Poor visibility
                    if (hour.visibility && hour.visibility < ALERT_THRESHOLDS.visibility.poor) {
                        alerts.push({
                            type: 'visibility',
                            severity: 'warning',
                            location: point.name,
                            message: `Poor visibility: ${hour.visibility.toFixed(1)} miles`,
                            icon: '🌫️',
                            recommendation: 'Slow down, use navigation aids'
                        });
                    }
                });
            }
        });

        // Deduplicate similar alerts
        const uniqueAlerts = [];
        const seen = new Set();
        
        alerts.forEach(alert => {
            const key = `${alert.type}-${alert.severity}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueAlerts.push(alert);
            }
        });

        // Sort by severity
        const severityOrder = { critical: 0, warning: 1, caution: 2 };
        uniqueAlerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

        return uniqueAlerts;
    }

    /**
     * Generate travel recommendations based on weather
     */
    function generateRecommendations(weatherData, alerts) {
        const recommendations = [];
        
        // Check for any critical alerts
        const hasCritical = alerts.some(a => a.severity === 'critical');
        const hasWarning = alerts.some(a => a.severity === 'warning');
        
        if (hasCritical) {
            recommendations.push({
                priority: 'high',
                icon: '⚠️',
                text: 'Hazardous conditions detected. Consider postponing or finding alternate route.'
            });
        }

        // Aggregate conditions
        let maxTemp = -Infinity, minTemp = Infinity;
        let maxWind = 0, maxPrecip = 0;
        
        weatherData.forEach(point => {
            if (!point.weather?.current) return;
            const c = point.weather.current;
            maxTemp = Math.max(maxTemp, c.temperature);
            minTemp = Math.min(minTemp, c.temperature);
            maxWind = Math.max(maxWind, c.windSpeed, c.windGusts || 0);
            maxPrecip = Math.max(maxPrecip, c.precipitation);
        });

        // Temperature-based recommendations
        if (maxTemp > 85) {
            recommendations.push({
                priority: 'medium',
                icon: '💧',
                text: `High temps (${Math.round(maxTemp)}°F). Carry extra water - recommend ${Math.ceil((maxTemp - 70) / 10 + 2)} liters per person.`
            });
        }

        if (minTemp < 40) {
            recommendations.push({
                priority: 'medium',
                icon: '🧥',
                text: `Cold conditions (${Math.round(minTemp)}°F). Pack warm layers and emergency blanket.`
            });
        }

        // Wind recommendations
        if (maxWind > 25) {
            recommendations.push({
                priority: 'medium',
                icon: '🏕️',
                text: `Windy conditions (${Math.round(maxWind)} mph). Secure tent/tarp, protect cooking stove.`
            });
        }

        // Precipitation recommendations
        const anyPrecip = weatherData.some(p => 
            p.weather?.current?.precipitation > 0 || 
            p.weather?.hourly?.some(h => h.precipProbability > 50)
        );
        
        if (anyPrecip) {
            recommendations.push({
                priority: 'medium',
                icon: '🧥',
                text: 'Rain/snow expected. Pack waterproof gear and protect electronics.'
            });
        }

        // General good conditions
        if (!hasCritical && !hasWarning && maxTemp < 85 && minTemp > 40 && maxWind < 20) {
            recommendations.push({
                priority: 'low',
                icon: '✅',
                text: 'Weather conditions look favorable for travel.'
            });
        }

        return recommendations;
    }

    /**
     * Find best travel windows in the forecast
     */
    function findBestTravelWindows(weatherData, requiredHours) {
        // Validate inputs
        if (!weatherData || !weatherData.length) {
            return [];
        }
        
        const hourly = weatherData[0]?.weather?.hourly;
        
        // Ensure hourly data exists and has enough elements
        if (!hourly || !Array.isArray(hourly) || hourly.length < requiredHours) {
            return [];
        }
        
        // Validate that hourly entries have required properties
        if (!hourly[0]?.time) {
            return [];
        }

        const windows = [];
        
        // Score each potential starting hour
        for (let start = 0; start < hourly.length - requiredHours; start++) {
            let score = 100;
            let issues = [];
            
            for (let h = start; h < start + requiredHours && h < hourly.length; h++) {
                const hour = hourly[h];
                if (!hour) continue;
                
                // Penalize based on conditions
                if (hour.weather?.severity >= 4) {
                    score -= 50;
                    issues.push('severe weather');
                } else if (hour.weather?.severity >= 2) {
                    score -= 20;
                }
                
                if (hour.precipProbability > 70) {
                    score -= 15;
                    issues.push('high precip chance');
                } else if (hour.precipProbability > 40) {
                    score -= 5;
                }
                
                if (hour.windSpeed > 30) {
                    score -= 20;
                    issues.push('high winds');
                } else if (hour.windSpeed > 20) {
                    score -= 10;
                }
                
                if (hour.temperature > 95 || hour.temperature < 25) {
                    score -= 15;
                    issues.push('extreme temp');
                }
                
                // Bonus for good visibility
                if (hour.visibility && hour.visibility > 5) {
                    score += 2;
                }
            }
            
            // Safely get time values
            const startEntry = hourly[start];
            const endIndex = Math.min(start + requiredHours, hourly.length - 1);
            const endEntry = hourly[endIndex];
            
            if (!startEntry?.time || !endEntry?.time) {
                continue;
            }
            
            const startTime = new Date(startEntry.time);
            const endTime = new Date(endEntry.time);
            
            // Calculate average temperature safely
            const tempSlice = hourly.slice(start, start + requiredHours).filter(h => h && typeof h.temperature === 'number');
            const avgTemp = tempSlice.length > 0 
                ? tempSlice.reduce((sum, h) => sum + h.temperature, 0) / tempSlice.length 
                : null;
            
            windows.push({
                start: startTime,
                end: endTime,
                score: Math.max(0, score),
                issues: [...new Set(issues)],
                avgTemp
            });
        }

        // Sort by score and return top 3
        windows.sort((a, b) => b.score - a.score);
        
        return windows.slice(0, 3).filter(w => w.score > 30);
    }

    /**
     * Generate a summary of route weather
     */
    function generateRouteSummary(weatherData) {
        if (!weatherData.length) {
            return { status: 'unknown', message: 'No weather data available' };
        }

        const conditions = weatherData
            .filter(p => p.weather?.current)
            .map(p => p.weather.current);

        if (!conditions.length) {
            return { status: 'unknown', message: 'No current weather data' };
        }

        const avgTemp = conditions.reduce((sum, c) => sum + c.temperature, 0) / conditions.length;
        const maxWind = Math.max(...conditions.map(c => c.windSpeed));
        const worstSeverity = Math.max(...conditions.map(c => c.weather.severity));
        const worstWeather = conditions.find(c => c.weather.severity === worstSeverity);

        let status, message;
        
        if (worstSeverity >= 4) {
            status = 'hazardous';
            message = `Hazardous: ${worstWeather.weather.desc}`;
        } else if (worstSeverity >= 3 || maxWind > 35) {
            status = 'poor';
            message = `Poor conditions: ${worstWeather.weather.desc}`;
        } else if (worstSeverity >= 2 || maxWind > 25 || avgTemp > 95 || avgTemp < 32) {
            status = 'fair';
            message = `Fair: ${worstWeather.weather.desc}, ${Math.round(avgTemp)}°F`;
        } else {
            status = 'good';
            message = `Good conditions: ${Math.round(avgTemp)}°F, ${worstWeather.weather.desc}`;
        }

        return {
            status,
            message,
            avgTemperature: avgTemp,
            maxWind,
            dominantCondition: worstWeather.weather
        };
    }

    /**
     * Get weather for current map center
     */
    async function getMapCenterWeather() {
        if (typeof MapModule === 'undefined') return null;
        
        const mapState = MapModule.getMapState();
        return await fetchWeather(mapState.lat, mapState.lon);
    }

    /**
     * Format temperature with unit
     */
    function formatTemp(temp, unit = 'F') {
        if (temp === null || temp === undefined) return '--';
        return `${Math.round(temp)}°${unit}`;
    }

    /**
     * Format wind speed and direction
     */
    function formatWind(speed, direction) {
        if (speed === null || speed === undefined) return '--';
        
        const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                      'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
        const dirIndex = direction !== null ? Math.round(direction / 22.5) % 16 : null;
        const dirStr = dirIndex !== null ? dirs[dirIndex] : '';
        
        return `${Math.round(speed)} mph ${dirStr}`;
    }

    /**
     * Format date for display
     */
    function formatDate(dateStr) {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }

    /**
     * Format time for display
     */
    function formatTime(timeStr) {
        const date = new Date(timeStr);
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }

    /**
     * Get severity color
     */
    function getSeverityColor(severity) {
        switch (severity) {
            case 'critical': return '#ef4444';
            case 'warning': return '#f59e0b';
            case 'caution': return '#3b82f6';
            default: return '#22c55e';
        }
    }

    /**
     * Get status color
     */
    function getStatusColor(status) {
        switch (status) {
            case 'hazardous': return '#ef4444';
            case 'poor': return '#f59e0b';
            case 'fair': return '#3b82f6';
            case 'good': return '#22c55e';
            default: return '#6b7280';
        }
    }

    // ==================== Wind Indicator ====================

    /**
     * Convert wind direction degrees to 16-point cardinal
     * @param {number} deg - Wind direction in degrees (where wind comes FROM)
     * @returns {string} Cardinal direction like 'N', 'NNE', 'SW', etc.
     */
    function windDirectionToCardinal(deg) {
        if (deg === null || deg === undefined || isNaN(deg)) return '--';
        const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE',
                      'S','SSW','SW','WSW','W','WNW','NW','NNW'];
        return dirs[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
    }

    /**
     * Get Beaufort scale description from wind speed
     * @param {number} mph - Wind speed in mph
     * @returns {object} { scale, label, color }
     */
    function getBeaufortScale(mph) {
        if (mph < 1)  return { scale: 0, label: 'Calm',           color: '#94a3b8' };
        if (mph < 4)  return { scale: 1, label: 'Light air',      color: '#94a3b8' };
        if (mph < 8)  return { scale: 2, label: 'Light breeze',   color: '#22c55e' };
        if (mph < 13) return { scale: 3, label: 'Gentle breeze',  color: '#22c55e' };
        if (mph < 19) return { scale: 4, label: 'Moderate breeze', color: '#3b82f6' };
        if (mph < 25) return { scale: 5, label: 'Fresh breeze',   color: '#3b82f6' };
        if (mph < 32) return { scale: 6, label: 'Strong breeze',  color: '#f59e0b' };
        if (mph < 39) return { scale: 7, label: 'High wind',      color: '#f59e0b' };
        if (mph < 47) return { scale: 8, label: 'Gale',           color: '#ef4444' };
        if (mph < 55) return { scale: 9, label: 'Strong gale',    color: '#ef4444' };
        if (mph < 64) return { scale: 10, label: 'Storm',         color: '#dc2626' };
        if (mph < 73) return { scale: 11, label: 'Violent storm',  color: '#dc2626' };
        return              { scale: 12, label: 'Hurricane',       color: '#7f1d1d' };
    }

    /**
     * Calculate dewpoint from temperature and relative humidity
     * Uses Magnus-Tetens approximation
     * @param {number} tempF - Temperature in Fahrenheit
     * @param {number} rh - Relative humidity (0-100)
     * @returns {number} Dewpoint in Fahrenheit
     */
    function calcDewpoint(tempF, rh) {
        if (tempF === null || rh === null || rh <= 0) return null;
        const tempC = (tempF - 32) * 5 / 9;
        const a = 17.27;
        const b = 237.7;
        const alpha = (a * tempC) / (b + tempC) + Math.log(rh / 100);
        const dewC = (b * alpha) / (a - alpha);
        return dewC * 9 / 5 + 32;
    }

    /**
     * Update the wind indicator DOM element on the map
     * @param {object} wind - { speed, direction, gusts, cardinal }
     */
    function updateWindIndicator(wind) {
        const el = document.getElementById('wind-indicator');
        if (!el) return;

        if (!wind || wind.speed === null || wind.speed === undefined) {
            el.style.display = 'none';
            return;
        }

        const speed = Math.round(wind.speed);
        const gusts = wind.gusts !== null ? Math.round(wind.gusts) : null;
        const dir = wind.direction;
        const cardinal = wind.cardinal || windDirectionToCardinal(dir);
        const beaufort = getBeaufortScale(speed);
        const hasGusts = gusts !== null && gusts > speed + 5;

        // Arrow rotation: Open-Meteo reports direction wind comes FROM
        // Arrow should point in direction wind is GOING TO (add 180°)
        const arrowRotation = dir !== null ? (dir + 180) % 360 : 0;
        const showArrow = dir !== null && speed > 0;

        el.style.display = 'flex';
        el.setAttribute('aria-label',
            `Wind from ${cardinal} at ${speed} mph` +
            (hasGusts ? `, gusting to ${gusts} mph` : '') +
            `. ${beaufort.label}`
        );

        el.innerHTML =
            `<div class="wind-indicator__arrow" style="transform:rotate(${arrowRotation}deg);opacity:${showArrow ? 1 : 0.3}" aria-hidden="true">` +
                `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${beaufort.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">` +
                    `<line x1="12" y1="19" x2="12" y2="5"/>` +
                    `<polyline points="5 12 12 5 19 12"/>` +
                `</svg>` +
            `</div>` +
            `<div class="wind-indicator__data">` +
                `<div class="wind-indicator__speed" style="color:${beaufort.color}">${speed}<span class="wind-indicator__unit"> mph</span></div>` +
                (hasGusts ? `<div class="wind-indicator__gusts">💨 ${gusts}</div>` : '') +
                `<div class="wind-indicator__dir">${cardinal}</div>` +
            `</div>`;
    }

    /**
     * Get current wind data (last fetched)
     * @returns {object|null} { speed, direction, gusts, cardinal, dewpoint, uvIndex, time }
     */
    function getCurrentWind() {
        return currentWind;
    }

    // ==================== AtlasRF FIS-B Integration ====================
    
    // Storage for off-grid weather data from AtlasRF
    let atlasRFFisBData = null;  // { metars, tafs, sigmets, tfrs, pireps, lastUpdate }
    let atlasRFConditions = null;  // { temperature_c, humidity, wind_speed_mps, ... }
    
    /**
     * Receive FIS-B weather data from AtlasRF (via event bridge in app.js)
     * When weather source is set to 'fisb', this data replaces internet weather
     */
    function handleAtlasRFWeather(fisBData) {
        if (!fisBData) return;
        
        atlasRFFisBData = {
            metars: fisBData.metars || [],
            tafs: fisBData.tafs || [],
            sigmets: fisBData.sigmets || [],
            tfrs: fisBData.tfrs || [],
            pireps: fisBData.pireps || [],
            lastUpdate: fisBData.lastUpdate || Date.now(),
            isStale: fisBData.isStale || false
        };
        
        console.log('WeatherModule: Received FIS-B data from AtlasRF',
            `(${atlasRFFisBData.metars.length} METARs, ${atlasRFFisBData.sigmets.length} SIGMETs)`);
        
        // Process SIGMETs for alert routing (Phase 3)
        if (atlasRFFisBData.sigmets.length > 0) {
            processFisBSigmets(atlasRFFisBData.sigmets);
        }
    }
    
    // ==================== FIS-B SIGMET Alert Processing (Phase 3) ====================
    
    /**
     * Classify a SIGMET by examining its type and text fields.
     * Returns { category, severity, label, icon } for AlertModule routing.
     * 
     * Categories:
     *   convective — severe thunderstorms, tornadoes (CRITICAL)
     *   sigmet     — severe turbulence, severe icing, volcanic ash (WARNING)
     *   airmet     — moderate turbulence/icing, IFR, mountain obscuration (CAUTION)
     * 
     * @param {Object} sigmet — a SIGMET object from AtlasRF
     * @returns {Object} { category, alertSeverity, label, icon }
     */
    function classifySigmet(sigmet) {
        // Normalize fields — AtlasRF may use different naming conventions
        const type = (sigmet.type || sigmet.product_type || sigmet.productType || '').toLowerCase();
        const hazard = (sigmet.hazard || sigmet.phenomenon || sigmet.hazard_type || '').toLowerCase();
        const raw = (sigmet.text || sigmet.raw || sigmet.raw_text || sigmet.message || '').toUpperCase();
        
        // --- Convective SIGMET (WST) ---
        if (type.includes('convective') || type === 'wst' ||
            hazard.includes('convective') || hazard.includes('tornado') ||
            raw.includes('CONVECTIVE SIGMET') || raw.includes('TORNADO') ||
            raw.includes('WST')) {
            
            const hasTornado = hazard.includes('tornado') || raw.includes('TORNADO');
            return {
                category: 'convective',
                alertSeverity: AlertModule.SEVERITY.CRITICAL,
                label: hasTornado ? 'Tornado SIGMET' : 'Convective SIGMET',
                icon: hasTornado ? '🌪️' : '⛈️'
            };
        }
        
        // --- Standard SIGMET (WS) — severe hazards ---
        if (type.includes('sigmet') || type === 'ws' ||
            raw.includes('SIGMET') && !raw.includes('AIRMET')) {
            
            let label = 'SIGMET';
            let icon = '⚠️';
            
            if (hazard.includes('turbulence') || raw.includes('TURB')) {
                label = 'Severe Turbulence SIGMET';
                icon = '💨';
            } else if (hazard.includes('icing') || raw.includes('ICE') || raw.includes('ICING')) {
                label = 'Severe Icing SIGMET';
                icon = '🧊';
            } else if (hazard.includes('volcanic') || raw.includes('VOLCANIC') || raw.includes('ASH')) {
                label = 'Volcanic Ash SIGMET';
                icon = '🌋';
            } else if (hazard.includes('dust') || hazard.includes('sand') || raw.includes('DUSTSTORM') || raw.includes('SANDSTORM')) {
                label = 'Dust/Sandstorm SIGMET';
                icon = '🏜️';
            }
            
            return {
                category: 'sigmet',
                alertSeverity: AlertModule.SEVERITY.WARNING,
                label,
                icon
            };
        }
        
        // --- AIRMET (WA) — moderate hazards ---
        if (type.includes('airmet') || type === 'wa' ||
            raw.includes('AIRMET')) {
            
            let label = 'AIRMET';
            let icon = 'ℹ️';
            
            if (hazard.includes('sierra') || raw.includes('SIERRA') || raw.includes('IFR') || raw.includes('MIST') || raw.includes('FOG')) {
                label = 'AIRMET Sierra (IFR/Visibility)';
                icon = '🌫️';
            } else if (hazard.includes('tango') || raw.includes('TANGO') || raw.includes('TURB')) {
                label = 'AIRMET Tango (Turbulence)';
                icon = '💨';
            } else if (hazard.includes('zulu') || raw.includes('ZULU') || raw.includes('ICE') || raw.includes('FREEZE')) {
                label = 'AIRMET Zulu (Icing/Freezing)';
                icon = '🧊';
            }
            
            return {
                category: 'airmet',
                alertSeverity: AlertModule.SEVERITY.CAUTION,
                label,
                icon
            };
        }
        
        // --- Fallback: classify from raw text keywords ---
        if (raw.includes('THUNDERSTORM') || raw.includes('TSTM') || raw.includes('SVR')) {
            return {
                category: 'convective',
                alertSeverity: AlertModule.SEVERITY.CRITICAL,
                label: 'Severe Weather SIGMET',
                icon: '⛈️'
            };
        }
        
        // Unknown type — default to WARNING
        return {
            category: 'unknown',
            alertSeverity: AlertModule.SEVERITY.WARNING,
            label: 'Weather SIGMET',
            icon: '⚠️'
        };
    }
    
    /**
     * Generate a unique deduplication key for a SIGMET.
     * Uses structured ID fields first, falls back to content hash.
     * 
     * @param {Object} sigmet
     * @returns {string} deduplication key
     */
    function getSigmetKey(sigmet) {
        // Prefer structured ID fields
        const id = sigmet.id || sigmet.sigmet_id || sigmet.product_id || sigmet.alphanumeric_id || '';
        if (id) return `sigmet:${id}`;
        
        // Fallback: hash from type + first 80 chars of text
        const type = sigmet.type || sigmet.product_type || 'unknown';
        const text = (sigmet.text || sigmet.raw || sigmet.raw_text || sigmet.message || '').substring(0, 80);
        return `sigmet:${type}:${text}`;
    }
    
    /**
     * Extract a SIGMET's geographic reference point (center lat/lon).
     * Tries structured fields first, falls back to coordinate extraction from text.
     * 
     * @param {Object} sigmet
     * @returns {Object|null} { lat, lon } or null if no position found
     */
    function getSigmetPosition(sigmet) {
        // Direct lat/lon fields
        if (sigmet.lat != null && sigmet.lon != null) {
            return { lat: sigmet.lat, lon: sigmet.lon };
        }
        if (sigmet.center_lat != null && sigmet.center_lon != null) {
            return { lat: sigmet.center_lat, lon: sigmet.center_lon };
        }
        
        // Polygon/area center
        const area = sigmet.area || sigmet.polygon || sigmet.coords || sigmet.boundary || sigmet.points;
        if (Array.isArray(area) && area.length > 0) {
            // If array of {lat, lon} objects
            if (area[0]?.lat != null) {
                const avgLat = area.reduce((sum, p) => sum + p.lat, 0) / area.length;
                const avgLon = area.reduce((sum, p) => sum + p.lon, 0) / area.length;
                return { lat: avgLat, lon: avgLon };
            }
            // If array of [lat, lon] arrays
            if (Array.isArray(area[0]) && area[0].length >= 2) {
                const avgLat = area.reduce((sum, p) => sum + p[0], 0) / area.length;
                const avgLon = area.reduce((sum, p) => sum + p[1], 0) / area.length;
                return { lat: avgLat, lon: avgLon };
            }
        }
        
        // No position found — will be treated as geographically relevant (broadcast alert)
        return null;
    }
    
    /**
     * Calculate great-circle distance between two points in miles.
     * Used for geographic relevance filtering of SIGMETs.
     * 
     * @param {number} lat1 @param {number} lon1 @param {number} lat2 @param {number} lon2
     * @returns {number} distance in miles
     */
    function _haversineDistMi(lat1, lon1, lat2, lon2) {
        const R = 3959; // Earth radius in miles
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    
    /**
     * Check if a SIGMET is geographically relevant to the user.
     * A SIGMET is relevant if:
     *   - It has no position data (can't filter, assume relevant)
     *   - Its center is within SIGMET_ALERT_RADIUS_MI of the user's position
     *   - Its center is within SIGMET_ALERT_RADIUS_MI of any active waypoint
     * 
     * @param {Object} sigmetPos - { lat, lon } or null
     * @returns {boolean}
     */
    function isSigmetRelevant(sigmetPos) {
        // No position data — can't filter, assume relevant (conservative for safety)
        if (!sigmetPos) return true;
        
        // Check against user's current position
        let userLat, userLon;
        if (typeof GPSModule !== 'undefined') {
            const pos = GPSModule.getPosition();
            if (pos?.lat && pos?.lon) {
                userLat = pos.lat;
                userLon = pos.lon;
            }
        }
        if (!userLat && typeof MapModule !== 'undefined') {
            const mapState = MapModule.getMapState();
            if (mapState?.lat && mapState?.lon) {
                userLat = mapState.lat;
                userLon = mapState.lon;
            }
        }
        
        if (userLat && userLon) {
            const dist = _haversineDistMi(userLat, userLon, sigmetPos.lat, sigmetPos.lon);
            if (dist <= SIGMET_ALERT_RADIUS_MI) return true;
        }
        
        // Check against active waypoints
        if (typeof State !== 'undefined') {
            const waypoints = State.get('waypoints') || [];
            for (const wp of waypoints) {
                if (wp.lat != null && wp.lon != null) {
                    const dist = _haversineDistMi(wp.lat, wp.lon, sigmetPos.lat, sigmetPos.lon);
                    if (dist <= SIGMET_ALERT_RADIUS_MI) return true;
                }
            }
        }
        
        return false;
    }
    
    /**
     * Extract human-readable description from a SIGMET for the alert message.
     * 
     * @param {Object} sigmet
     * @param {Object} classification — from classifySigmet()
     * @returns {string}
     */
    function getSigmetDescription(sigmet, classification) {
        // Prefer structured description fields
        const desc = sigmet.description || sigmet.summary || '';
        if (desc) return desc;
        
        // Build from hazard + area info
        const hazard = sigmet.hazard || sigmet.phenomenon || '';
        const area = sigmet.area_description || sigmet.region || sigmet.location || '';
        if (hazard || area) {
            return [hazard, area].filter(Boolean).join(' — ');
        }
        
        // Extract meaningful portion from raw text (first 120 chars, no line breaks)
        const raw = (sigmet.text || sigmet.raw || sigmet.raw_text || sigmet.message || '');
        if (raw) {
            return raw.replace(/[\r\n]+/g, ' ').substring(0, 120).trim();
        }
        
        return classification.label;
    }
    
    /**
     * Get the expiration time of a SIGMET for deduplication cache.
     * 
     * @param {Object} sigmet
     * @returns {number} timestamp in ms, or default 2h from now
     */
    function getSigmetExpiration(sigmet) {
        // Try various time field names
        const expiry = sigmet.valid_to || sigmet.end_time || sigmet.expiration ||
                       sigmet.validTo || sigmet.endTime || sigmet.expires;
        
        if (expiry) {
            const ts = typeof expiry === 'number' ? expiry : new Date(expiry).getTime();
            if (!isNaN(ts) && ts > Date.now()) return ts;
        }
        
        // Default: 2 hours from now (typical SIGMET validity)
        return Date.now() + 2 * 60 * 60 * 1000;
    }
    
    /**
     * Process FIS-B SIGMETs received from AtlasRF.
     * Classifies each SIGMET, checks geographic relevance, deduplicates,
     * and routes relevant alerts through AlertModule.
     * 
     * Called from handleAtlasRFWeather() when SIGMETs are present.
     * 
     * @param {Array} sigmets — array of SIGMET objects from AtlasRF
     * @returns {Array} array of triggered alert objects
     */
    function processFisBSigmets(sigmets) {
        if (!Array.isArray(sigmets) || sigmets.length === 0) return [];
        if (typeof AlertModule === 'undefined') return [];
        
        const now = Date.now();
        const triggered = [];
        
        // Purge expired entries from dedup cache
        for (const [key, entry] of alertedSigmetIds.entries()) {
            if (entry.expiration < now) {
                alertedSigmetIds.delete(key);
            }
        }
        
        for (const sigmet of sigmets) {
            // 1. Generate dedup key
            const key = getSigmetKey(sigmet);
            
            // 2. Skip if already alerted for this SIGMET
            if (alertedSigmetIds.has(key)) continue;
            
            // 3. Classify the SIGMET
            const classification = classifySigmet(sigmet);
            
            // 4. Check geographic relevance
            const sigmetPos = getSigmetPosition(sigmet);
            if (!isSigmetRelevant(sigmetPos)) {
                console.debug(`[Weather] SIGMET "${key}" skipped — outside ${SIGMET_ALERT_RADIUS_MI}mi radius`);
                continue;
            }
            
            // 5. Build alert message
            const description = getSigmetDescription(sigmet, classification);
            const distInfo = sigmetPos ? (() => {
                let userLat, userLon;
                if (typeof GPSModule !== 'undefined') {
                    const pos = GPSModule.getPosition();
                    if (pos?.lat && pos?.lon) { userLat = pos.lat; userLon = pos.lon; }
                }
                if (userLat && userLon) {
                    const dist = Math.round(_haversineDistMi(userLat, userLon, sigmetPos.lat, sigmetPos.lon));
                    return ` (${dist} mi away)`;
                }
                return '';
            })() : '';
            
            // 6. Route through AlertModule
            const result = AlertModule.trigger({
                source: AlertModule.SOURCES.WEATHER,
                severity: classification.alertSeverity,
                title: `${classification.icon} FIS-B: ${classification.label}`,
                message: `${description}${distInfo}`,
                data: {
                    type: 'fisb_sigmet',
                    subtype: classification.category,
                    sigmetKey: key,
                    position: sigmetPos,
                    raw: sigmet.text || sigmet.raw || sigmet.raw_text || sigmet.message || '',
                    classification
                },
                persistent: classification.alertSeverity === AlertModule.SEVERITY.CRITICAL,
                sound: classification.alertSeverity !== AlertModule.SEVERITY.CAUTION,
                notification: classification.alertSeverity !== AlertModule.SEVERITY.CAUTION
            });
            
            if (result) {
                triggered.push(result);
                // Mark as alerted with expiration
                alertedSigmetIds.set(key, {
                    timestamp: now,
                    expiration: getSigmetExpiration(sigmet)
                });
            }
        }
        
        if (triggered.length > 0) {
            console.log(`[Weather] processFisBSigmets: ${triggered.length} SIGMET alert(s) triggered from ${sigmets.length} received`);
            
            if (typeof Events !== 'undefined') {
                Events.emit('weather:sigmet:alerts', { triggered, total: sigmets.length });
            }
        }
        
        return triggered;
    }
    
    /**
     * Receive current weather conditions from AtlasRF (Open-Meteo relay)
     * Provides current conditions even when GridDown has no internet
     */
    function handleAtlasRFConditions(conditions) {
        if (!conditions) return;
        
        atlasRFConditions = { ...conditions };
        
        // Update currentWind from AtlasRF data
        if (conditions.wind_speed_mps != null && conditions.wind_direction != null) {
            currentWind = {
                speed: conditions.wind_speed_mps * 2.237,  // m/s -> mph
                direction: conditions.wind_direction,
                gusts: conditions.wind_gust_mps ? conditions.wind_gust_mps * 2.237 : null,
                cardinal: windDirectionToCardinal(conditions.wind_direction),
                source: 'atlasrf'
            };
            updateWindIndicator(currentWind);
            if (typeof Events !== 'undefined') {
                Events.emit('weather:wind', currentWind);
            }
        }
        
        console.log('WeatherModule: Received conditions from AtlasRF',
            `(${conditions.temperature_c?.toFixed(1)}°C, ${conditions.conditions || ''})`);
    }
    
    /**
     * Get AtlasRF FIS-B weather data
     * Returns null if no data received or data is stale
     */
    function getAtlasRFWeather() {
        return atlasRFFisBData;
    }
    
    /**
     * Get AtlasRF current conditions
     */
    function getAtlasRFConditions() {
        return atlasRFConditions;
    }

    // Public API
    return {
        init,
        destroy,
        fetchWeather,
        getWaypointWeather,
        analyzeRouteWeather,
        getMapCenterWeather,
        processWeatherAlerts,
        // Weather monitoring (Phase 2)
        startWeatherMonitoring,
        stopWeatherMonitoring,
        checkWeatherNow,
        isWeatherMonitoringEnabled,
        getWeatherMonitoringSettings,
        setWeatherMonitoringInterval,
        // Waypoint monitoring & thresholds (Phase 5)
        checkWeatherAtWaypoints,
        getAlertThresholds,
        setAlertThresholds,
        setWaypointMonitoring,
        generateRouteAlerts,
        // NWS Weather Alerts fallback (Phase 4)
        fetchNWSAlerts,
        processNWSAlerts,
        getNWSAlertStatus,
        findBestTravelWindows,
        getCurrentWind,
        formatTemp,
        formatWind,
        formatDate,
        formatTime,
        getSeverityColor,
        getStatusColor,
        windDirectionToCardinal,
        getBeaufortScale,
        calcDewpoint,
        // AtlasRF FIS-B integration
        handleAtlasRFWeather,
        handleAtlasRFConditions,
        processFisBSigmets,
        getAtlasRFWeather,
        getAtlasRFConditions,
        WMO_CODES,
        ALERT_THRESHOLDS
    };
})();

window.WeatherModule = WeatherModule;
