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
    }
    
    /**
     * Cleanup module resources
     */
    function destroy() {
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
                    'wind_gusts_10m'
                ].join(','),
                hourly: [
                    'temperature_2m',
                    'relative_humidity_2m',
                    'precipitation_probability',
                    'precipitation',
                    'weather_code',
                    'wind_speed_10m',
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

    // Public API
    return {
        init,
        destroy,
        fetchWeather,
        getWaypointWeather,
        analyzeRouteWeather,
        getMapCenterWeather,
        generateRouteAlerts,
        findBestTravelWindows,
        formatTemp,
        formatWind,
        formatDate,
        formatTime,
        getSeverityColor,
        getStatusColor,
        WMO_CODES,
        ALERT_THRESHOLDS
    };
})();

window.WeatherModule = WeatherModule;
