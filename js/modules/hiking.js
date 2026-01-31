/**
 * GridDown Hiking Module
 * Hiking time estimates, daylight tracking, pace calculation, and turnaround alerts
 */
const HikingModule = (function() {
    'use strict';
    
    // Hiking pace presets (miles per hour on flat terrain)
    const PACE_PRESETS = {
        slow: { name: 'Slow/Heavy Pack', flatSpeed: 2.0, description: 'Heavy pack, rough terrain, or leisurely pace' },
        moderate: { name: 'Moderate', flatSpeed: 2.5, description: 'Average hiking pace with day pack' },
        fast: { name: 'Fast/Light', flatSpeed: 3.0, description: 'Light pack, good trail, fit hiker' },
        trail_runner: { name: 'Trail Runner', flatSpeed: 4.5, description: 'Running/fast hiking on good trails' }
    };
    
    // Default settings
    let settings = {
        pacePreset: 'moderate',
        customFlatSpeed: null,  // Override preset if set
        safetyMarginMinutes: 30,  // Buffer before sunset
        restStopInterval: 60,  // Minutes between rest stops
        restStopDuration: 10,  // Minutes per rest stop
        includeRestStops: true,
        // Turnaround alert settings
        turnaroundAlerts: true,
        turnaroundWarningMinutes: [30, 15, 5],  // Minutes before turnaround to warn
        turnaroundSoundEnabled: true
    };
    
    // Active hike state
    let activeHike = null;
    let turnaroundMonitorInterval = null;
    let alertsTriggered = new Set();  // Track which alerts have been sent
    
    // Breadcrumb trail data
    let hikingTrail = [];
    const MAX_TRAIL_POINTS = 500;
    let trailRecordingInterval = null;
    
    let initialized = false;
    
    /**
     * Initialize module
     */
    function init() {
        if (initialized) return;
        loadSettings();
        initialized = true;
        console.log('HikingModule initialized');
    }
    
    /**
     * Load settings from storage
     */
    async function loadSettings() {
        try {
            if (typeof Storage !== 'undefined' && Storage.Settings) {
                const saved = await Storage.Settings.get('hikingSettings', null);
                if (saved) {
                    settings = { ...settings, ...saved };
                }
            }
        } catch (e) {
            console.warn('Could not load hiking settings:', e);
        }
    }
    
    /**
     * Save settings to storage
     */
    async function saveSettings() {
        try {
            if (typeof Storage !== 'undefined' && Storage.Settings) {
                await Storage.Settings.set('hikingSettings', settings);
            }
        } catch (e) {
            console.warn('Could not save hiking settings:', e);
        }
    }
    
    /**
     * Get current flat speed based on preset or custom
     */
    function getFlatSpeed() {
        if (settings.customFlatSpeed !== null) {
            return settings.customFlatSpeed;
        }
        return PACE_PRESETS[settings.pacePreset]?.flatSpeed || 2.5;
    }
    
    /**
     * Calculate hiking time using Naismith's Rule
     * Base: 3 miles/hour + 1 hour per 2000ft ascent
     * Modified to account for descent (Tranter's corrections)
     * 
     * @param {number} distanceMiles - Total distance in miles
     * @param {number} elevationGainFt - Total elevation gain in feet
     * @param {number} elevationLossFt - Total elevation loss in feet
     * @param {number} flatSpeedMph - Base speed on flat terrain (default from settings)
     * @returns {Object} Time estimate in hours and breakdown
     */
    function calculateNaismith(distanceMiles, elevationGainFt = 0, elevationLossFt = 0, flatSpeedMph = null) {
        const speed = flatSpeedMph || getFlatSpeed();
        
        // Base time for horizontal distance
        const baseTimeHours = distanceMiles / speed;
        
        // Time for ascent: +1 hour per 2000ft (scaled to pace)
        // Slower hikers take proportionally longer on climbs
        const paceMultiplier = 2.5 / speed;  // Normalized to moderate pace
        const ascentTimeHours = (elevationGainFt / 2000) * paceMultiplier;
        
        // Time for descent: Naismith ignored this, but steep descents are slower
        // Add time for descents steeper than 5% grade
        // Rough estimate: Add 1 hour per 3000ft of significant descent
        let descentTimeHours = 0;
        if (elevationLossFt > 500) {
            descentTimeHours = (elevationLossFt / 3000) * paceMultiplier * 0.5;
        }
        
        const totalHours = baseTimeHours + ascentTimeHours + descentTimeHours;
        
        return {
            method: 'naismith',
            totalHours,
            baseTimeHours,
            ascentTimeHours,
            descentTimeHours,
            flatSpeedMph: speed
        };
    }
    
    /**
     * Calculate hiking time using Tobler's Hiking Function
     * More accurate as it accounts for slope affecting speed
     * 
     * Speed = 6 * e^(-3.5 * |slope + 0.05|) km/h
     * Where slope = rise/run (vertical/horizontal)
     * 
     * @param {number} distanceMiles - Total distance in miles
     * @param {number} elevationGainFt - Total elevation gain in feet
     * @param {number} elevationLossFt - Total elevation loss in feet  
     * @param {number} flatSpeedMph - Base speed multiplier
     * @returns {Object} Time estimate in hours
     */
    function calculateTobler(distanceMiles, elevationGainFt = 0, elevationLossFt = 0, flatSpeedMph = null) {
        const baseSpeed = flatSpeedMph || getFlatSpeed();
        
        // If no elevation data, fall back to simple calculation
        if (elevationGainFt === 0 && elevationLossFt === 0) {
            return {
                method: 'tobler',
                totalHours: distanceMiles / baseSpeed,
                averageSpeedMph: baseSpeed,
                flatSpeedMph: baseSpeed
            };
        }
        
        // Estimate average slope for ascent and descent portions
        // This is a simplification - ideally we'd have the full elevation profile
        
        // Assume gain happens over 40% of distance, loss over 40%, flat 20%
        const ascentDistMiles = distanceMiles * 0.4;
        const descentDistMiles = distanceMiles * 0.4;
        const flatDistMiles = distanceMiles * 0.2;
        
        // Calculate average slopes
        const ascentSlope = ascentDistMiles > 0 
            ? (elevationGainFt / 5280) / ascentDistMiles  // Convert ft to miles
            : 0;
        const descentSlope = descentDistMiles > 0 
            ? -(elevationLossFt / 5280) / descentDistMiles
            : 0;
        
        // Tobler's function: speed = 6 * e^(-3.5 * |slope + 0.05|) km/h
        // Convert to mph and scale to user's base speed
        const toblerBase = 6 * 0.621371;  // ~3.73 mph at optimal slope
        const speedMultiplier = baseSpeed / 2.5;  // Scale relative to moderate pace
        
        const ascentSpeed = toblerBase * Math.exp(-3.5 * Math.abs(ascentSlope + 0.05)) * speedMultiplier;
        const descentSpeed = toblerBase * Math.exp(-3.5 * Math.abs(descentSlope + 0.05)) * speedMultiplier;
        const flatSpeed = toblerBase * Math.exp(-3.5 * 0.05) * speedMultiplier;
        
        // Calculate time for each segment
        const ascentTime = ascentDistMiles / Math.max(ascentSpeed, 0.5);
        const descentTime = descentDistMiles / Math.max(descentSpeed, 0.5);
        const flatTime = flatDistMiles / flatSpeed;
        
        const totalHours = ascentTime + descentTime + flatTime;
        const averageSpeed = distanceMiles / totalHours;
        
        return {
            method: 'tobler',
            totalHours,
            ascentTimeHours: ascentTime,
            descentTimeHours: descentTime,
            flatTimeHours: flatTime,
            averageSpeedMph: averageSpeed,
            flatSpeedMph: baseSpeed
        };
    }
    
    /**
     * Calculate hiking time with detailed elevation profile
     * Uses Tobler's function on each segment for most accuracy
     * 
     * @param {Array} profilePoints - Array of {distance, elevation} from ElevationModule
     * @param {number} flatSpeedMph - Base speed
     * @returns {Object} Detailed time estimate
     */
    function calculateFromProfile(profilePoints, flatSpeedMph = null) {
        if (!profilePoints || profilePoints.length < 2) {
            return null;
        }
        
        const baseSpeed = flatSpeedMph || getFlatSpeed();
        const speedMultiplier = baseSpeed / 2.5;
        const toblerBase = 6 * 0.621371;
        
        let totalTime = 0;
        let totalGain = 0;
        let totalLoss = 0;
        const segments = [];
        
        for (let i = 1; i < profilePoints.length; i++) {
            const prev = profilePoints[i - 1];
            const curr = profilePoints[i];
            
            if (prev.elevation === null || curr.elevation === null) continue;
            
            const distMiles = curr.distance - prev.distance;
            if (distMiles <= 0) continue;
            
            const elevChange = curr.elevation - prev.elevation;
            const slope = (elevChange / 5280) / distMiles;  // Convert ft to miles
            
            // Tobler's function
            const speed = toblerBase * Math.exp(-3.5 * Math.abs(slope + 0.05)) * speedMultiplier;
            const segmentTime = distMiles / Math.max(speed, 0.3);
            
            totalTime += segmentTime;
            
            if (elevChange > 0) {
                totalGain += elevChange;
            } else {
                totalLoss += Math.abs(elevChange);
            }
            
            segments.push({
                startDist: prev.distance,
                endDist: curr.distance,
                elevChange,
                slope: slope * 100,  // As percentage
                speed,
                time: segmentTime
            });
        }
        
        const totalDist = profilePoints[profilePoints.length - 1].distance;
        
        return {
            method: 'profile',
            totalHours: totalTime,
            totalDistanceMiles: totalDist,
            totalElevationGain: totalGain,
            totalElevationLoss: totalLoss,
            averageSpeedMph: totalDist / totalTime,
            flatSpeedMph: baseSpeed,
            segments
        };
    }
    
    /**
     * Get comprehensive hiking time estimate
     * Returns both Naismith and Tobler estimates plus rest stops
     * 
     * @param {number} distanceMiles - Total distance
     * @param {number} elevationGainFt - Total elevation gain
     * @param {number} elevationLossFt - Total elevation loss
     * @param {Object} options - Additional options
     * @returns {Object} Complete time estimate
     */
    function estimateHikingTime(distanceMiles, elevationGainFt = 0, elevationLossFt = 0, options = {}) {
        const flatSpeed = options.flatSpeedMph || getFlatSpeed();
        const includeRests = options.includeRestStops ?? settings.includeRestStops;
        
        const naismith = calculateNaismith(distanceMiles, elevationGainFt, elevationLossFt, flatSpeed);
        const tobler = calculateTobler(distanceMiles, elevationGainFt, elevationLossFt, flatSpeed);
        
        // Use average of both methods for best estimate
        const movingTimeHours = (naismith.totalHours + tobler.totalHours) / 2;
        
        // Calculate rest stops
        let restTimeHours = 0;
        let restStops = 0;
        
        if (includeRests && movingTimeHours > 1) {
            const movingTimeMinutes = movingTimeHours * 60;
            restStops = Math.floor(movingTimeMinutes / settings.restStopInterval);
            restTimeHours = (restStops * settings.restStopDuration) / 60;
        }
        
        const totalTimeHours = movingTimeHours + restTimeHours;
        
        return {
            distanceMiles,
            elevationGainFt,
            elevationLossFt,
            movingTimeHours,
            restTimeHours,
            restStops,
            totalTimeHours,
            naismith,
            tobler,
            averageMovingSpeedMph: distanceMiles / movingTimeHours,
            pacePreset: settings.pacePreset,
            flatSpeedMph: flatSpeed,
            formatted: {
                movingTime: formatDuration(movingTimeHours),
                restTime: formatDuration(restTimeHours),
                totalTime: formatDuration(totalTimeHours),
                pace: `${(60 / (distanceMiles / movingTimeHours)).toFixed(0)} min/mi`
            }
        };
    }
    
    /**
     * Get daylight information for current location
     * 
     * @param {number} lat - Latitude (optional, uses GPS/map center)
     * @param {number} lon - Longitude (optional)
     * @returns {Object} Daylight info including time remaining
     */
    function getDaylightInfo(lat = null, lon = null) {
        // Get position if not provided
        if (lat === null || lon === null) {
            if (typeof GPSModule !== 'undefined') {
                const pos = GPSModule.getPosition();
                if (pos?.lat && pos?.lon) {
                    lat = pos.lat;
                    lon = pos.lon;
                }
            }
            if (lat === null && typeof MapModule !== 'undefined') {
                const center = MapModule.getCenter();
                if (center) {
                    lat = center.lat;
                    lon = center.lon;
                }
            }
        }
        
        if (lat === null || lon === null) {
            return null;
        }
        
        // Get sun times
        if (typeof SunMoonModule === 'undefined') {
            return null;
        }
        
        const now = new Date();
        const sunTimes = SunMoonModule.getSunTimes(now, lat, lon);
        
        if (!sunTimes || sunTimes.sunset === null) {
            return null;
        }
        
        const currentHour = now.getHours() + now.getMinutes() / 60;
        const sunriseHour = sunTimes.sunrise;
        const sunsetHour = sunTimes.sunset;
        
        // Calculate remaining daylight
        let daylightRemainingHours = 0;
        let isDaylight = false;
        let status = 'night';
        
        if (currentHour >= sunriseHour && currentHour < sunsetHour) {
            isDaylight = true;
            daylightRemainingHours = sunsetHour - currentHour;
            status = 'day';
        } else if (currentHour < sunriseHour) {
            // Before sunrise
            status = 'before_sunrise';
            daylightRemainingHours = 0;
        } else {
            // After sunset
            status = 'after_sunset';
            daylightRemainingHours = 0;
        }
        
        // Calculate usable daylight (with safety margin)
        const safetyMargin = settings.safetyMarginMinutes / 60;
        const usableDaylightHours = Math.max(0, daylightRemainingHours - safetyMargin);
        
        // Civil twilight info
        const civilTwilightEnd = sunTimes.dusk;  // End of civil twilight
        let twilightRemainingHours = 0;
        if (civilTwilightEnd && currentHour < civilTwilightEnd) {
            twilightRemainingHours = civilTwilightEnd - currentHour;
        }
        
        return {
            lat,
            lon,
            currentTime: now,
            sunrise: sunriseHour,
            sunset: sunsetHour,
            civilTwilightEnd,
            dayLengthHours: sunTimes.dayLength,
            isDaylight,
            status,
            daylightRemainingHours,
            usableDaylightHours,
            twilightRemainingHours,
            safetyMarginMinutes: settings.safetyMarginMinutes,
            formatted: {
                sunrise: formatTimeFromHours(sunriseHour),
                sunset: formatTimeFromHours(sunsetHour),
                daylightRemaining: formatDuration(daylightRemainingHours),
                usableDaylight: formatDuration(usableDaylightHours),
                twilightRemaining: formatDuration(twilightRemainingHours)
            }
        };
    }
    
    /**
     * Calculate turnaround time for out-and-back hike
     * 
     * @param {number} distanceMiles - One-way distance
     * @param {number} elevationGainFt - One-way elevation gain
     * @param {number} elevationLossFt - One-way elevation loss
     * @param {Object} options - Additional options
     * @returns {Object} Turnaround calculation
     */
    function calculateTurnaround(distanceMiles, elevationGainFt = 0, elevationLossFt = 0, options = {}) {
        const daylight = getDaylightInfo(options.lat, options.lon);
        
        if (!daylight) {
            return { error: 'Could not get daylight information' };
        }
        
        // Calculate return trip (reverse elevation)
        const outboundTime = estimateHikingTime(distanceMiles, elevationGainFt, elevationLossFt, options);
        const returnTime = estimateHikingTime(distanceMiles, elevationLossFt, elevationGainFt, options);
        
        const totalRoundTripHours = outboundTime.totalTimeHours + returnTime.totalTimeHours;
        
        // Calculate latest start time to return by sunset
        const latestStartHour = daylight.sunset - totalRoundTripHours - (settings.safetyMarginMinutes / 60);
        
        // Calculate turnaround time if starting now
        const now = new Date();
        const currentHour = now.getHours() + now.getMinutes() / 60;
        const turnaroundHour = currentHour + outboundTime.totalTimeHours;
        const returnArrivalHour = turnaroundHour + returnTime.totalTimeHours;
        
        // Check if there's enough daylight
        const hasEnoughDaylight = returnArrivalHour <= daylight.sunset - (settings.safetyMarginMinutes / 60);
        
        // Calculate maximum one-way distance with current daylight
        const availableHours = daylight.usableDaylightHours;
        const maxOneWayHours = availableHours / 2;
        const avgSpeed = (outboundTime.averageMovingSpeedMph + returnTime.averageMovingSpeedMph) / 2;
        const maxOneWayDistance = maxOneWayHours * avgSpeed * 0.8;  // 80% for safety
        
        return {
            outboundTime,
            returnTime,
            totalRoundTripHours,
            daylight,
            currentHour,
            turnaroundHour,
            returnArrivalHour,
            latestStartHour,
            hasEnoughDaylight,
            maxOneWayDistance,
            formatted: {
                turnaroundTime: formatTimeFromHours(turnaroundHour),
                returnArrival: formatTimeFromHours(returnArrivalHour),
                latestStart: formatTimeFromHours(latestStartHour),
                totalRoundTrip: formatDuration(totalRoundTripHours),
                maxOneWayDistance: `${maxOneWayDistance.toFixed(1)} mi`
            },
            warnings: generateWarnings(daylight, returnArrivalHour, turnaroundHour)
        };
    }
    
    /**
     * Generate warnings based on daylight and timing
     */
    function generateWarnings(daylight, returnArrivalHour, turnaroundHour) {
        const warnings = [];
        const sunset = daylight.sunset;
        const safeReturn = sunset - (settings.safetyMarginMinutes / 60);
        
        if (!daylight.isDaylight) {
            warnings.push({
                level: 'critical',
                message: 'Currently outside daylight hours',
                icon: '🌙'
            });
        }
        
        if (returnArrivalHour > sunset) {
            warnings.push({
                level: 'critical',
                message: `Return after sunset (${formatTimeFromHours(sunset)})`,
                icon: '⚠️'
            });
        } else if (returnArrivalHour > safeReturn) {
            warnings.push({
                level: 'warning',
                message: 'Cutting it close - minimal safety margin',
                icon: '⏰'
            });
        }
        
        if (daylight.daylightRemainingHours < 2) {
            warnings.push({
                level: 'warning',
                message: `Only ${formatDuration(daylight.daylightRemainingHours)} of daylight remaining`,
                icon: '🌅'
            });
        }
        
        if (turnaroundHour > sunset) {
            warnings.push({
                level: 'critical',
                message: 'Turnaround point after sunset',
                icon: '🚫'
            });
        }
        
        return warnings;
    }
    
    /**
     * Format hours as duration string (Xh Ym)
     */
    function formatDuration(hours) {
        if (hours === null || hours === undefined || isNaN(hours)) {
            return '--';
        }
        
        const totalMinutes = Math.round(hours * 60);
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        
        if (h === 0) {
            return `${m}m`;
        } else if (m === 0) {
            return `${h}h`;
        } else {
            return `${h}h ${m}m`;
        }
    }
    
    /**
     * Format decimal hours as time string (HH:MM AM/PM)
     */
    function formatTimeFromHours(decimalHours) {
        if (decimalHours === null || decimalHours === undefined || isNaN(decimalHours)) {
            return '--:--';
        }
        
        // Handle times past midnight
        let hours = decimalHours % 24;
        if (hours < 0) hours += 24;
        
        const h = Math.floor(hours);
        const m = Math.round((hours - h) * 60);
        
        const period = h >= 12 ? 'PM' : 'AM';
        const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
        
        return `${displayHour}:${m.toString().padStart(2, '0')} ${period}`;
    }
    
    /**
     * Render hiking time estimate as HTML
     */
    function renderTimeEstimate(estimate, options = {}) {
        if (!estimate) {
            return '<div style="color:rgba(255,255,255,0.5)">No time estimate available</div>';
        }
        
        const showDetails = options.showDetails !== false;
        
        return `
            <div class="hiking-estimate">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                    <span style="font-size:11px;color:rgba(255,255,255,0.6)">⏱️ Estimated Time</span>
                    <span style="font-size:16px;font-weight:600;color:#22c55e">${estimate.formatted.totalTime}</span>
                </div>
                ${showDetails ? `
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:11px">
                        <div style="padding:6px;background:rgba(0,0,0,0.2);border-radius:6px">
                            <div style="color:rgba(255,255,255,0.5)">Moving</div>
                            <div style="font-weight:500">${estimate.formatted.movingTime}</div>
                        </div>
                        <div style="padding:6px;background:rgba(0,0,0,0.2);border-radius:6px">
                            <div style="color:rgba(255,255,255,0.5)">Rest Stops</div>
                            <div style="font-weight:500">${estimate.restStops > 0 ? `${estimate.formatted.restTime} (${estimate.restStops}×)` : 'None'}</div>
                        </div>
                        <div style="padding:6px;background:rgba(0,0,0,0.2);border-radius:6px">
                            <div style="color:rgba(255,255,255,0.5)">Avg Pace</div>
                            <div style="font-weight:500">${estimate.formatted.pace}</div>
                        </div>
                        <div style="padding:6px;background:rgba(0,0,0,0.2);border-radius:6px">
                            <div style="color:rgba(255,255,255,0.5)">Preset</div>
                            <div style="font-weight:500">${PACE_PRESETS[estimate.pacePreset]?.name || 'Custom'}</div>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    /**
     * Render daylight remaining widget
     */
    function renderDaylightWidget(daylight = null, options = {}) {
        daylight = daylight || getDaylightInfo();
        
        if (!daylight) {
            return '<div style="color:rgba(255,255,255,0.5)">Daylight info unavailable</div>';
        }
        
        const progressPercent = daylight.isDaylight 
            ? ((daylight.dayLengthHours - daylight.daylightRemainingHours) / daylight.dayLengthHours) * 100
            : 100;
        
        const statusColor = daylight.daylightRemainingHours > 3 ? '#22c55e' :
                           daylight.daylightRemainingHours > 1 ? '#f59e0b' : '#ef4444';
        
        return `
            <div class="daylight-widget" style="padding:12px;background:var(--color-bg-elevated);border-radius:10px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                    <span style="font-size:12px;font-weight:600">☀️ Daylight</span>
                    <span style="font-size:14px;font-weight:600;color:${statusColor}">
                        ${daylight.isDaylight ? daylight.formatted.daylightRemaining + ' left' : 'After Sunset'}
                    </span>
                </div>
                
                <!-- Progress bar -->
                <div style="height:6px;background:rgba(255,255,255,0.1);border-radius:3px;margin-bottom:10px;overflow:hidden">
                    <div style="height:100%;width:${progressPercent}%;background:linear-gradient(90deg, #f59e0b, #ea580c);border-radius:3px"></div>
                </div>
                
                <div style="display:flex;justify-content:space-between;font-size:11px;color:rgba(255,255,255,0.6)">
                    <div>🌅 ${daylight.formatted.sunrise}</div>
                    <div>Usable: ${daylight.formatted.usableDaylight}</div>
                    <div>🌇 ${daylight.formatted.sunset}</div>
                </div>
            </div>
        `;
    }
    
    /**
     * Render turnaround alert widget
     */
    function renderTurnaroundWidget(turnaround) {
        if (!turnaround || turnaround.error) {
            return '';
        }
        
        const hasWarnings = turnaround.warnings && turnaround.warnings.length > 0;
        const criticalWarning = turnaround.warnings?.find(w => w.level === 'critical');
        
        const borderColor = criticalWarning ? '#ef4444' : 
                           hasWarnings ? '#f59e0b' : '#22c55e';
        
        return `
            <div class="turnaround-widget" style="padding:12px;background:var(--color-bg-elevated);border-radius:10px;border-left:3px solid ${borderColor}">
                <div style="font-size:12px;font-weight:600;margin-bottom:10px">🔄 Turnaround Calculator</div>
                
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:11px;margin-bottom:10px">
                    <div style="padding:8px;background:rgba(0,0,0,0.2);border-radius:6px">
                        <div style="color:rgba(255,255,255,0.5)">Turn Around By</div>
                        <div style="font-size:14px;font-weight:600;color:#f97316">${turnaround.formatted.turnaroundTime}</div>
                    </div>
                    <div style="padding:8px;background:rgba(0,0,0,0.2);border-radius:6px">
                        <div style="color:rgba(255,255,255,0.5)">Return By</div>
                        <div style="font-size:14px;font-weight:600">${turnaround.formatted.returnArrival}</div>
                    </div>
                    <div style="padding:8px;background:rgba(0,0,0,0.2);border-radius:6px">
                        <div style="color:rgba(255,255,255,0.5)">Round Trip</div>
                        <div style="font-weight:500">${turnaround.formatted.totalRoundTrip}</div>
                    </div>
                    <div style="padding:8px;background:rgba(0,0,0,0.2);border-radius:6px">
                        <div style="color:rgba(255,255,255,0.5)">Max Distance</div>
                        <div style="font-weight:500">${turnaround.formatted.maxOneWayDistance}</div>
                    </div>
                </div>
                
                ${hasWarnings ? `
                    <div style="margin-top:8px">
                        ${turnaround.warnings.map(w => `
                            <div style="display:flex;align-items:center;gap:6px;padding:6px;background:rgba(${w.level === 'critical' ? '239,68,68' : '245,158,11'},0.1);border-radius:4px;margin-bottom:4px;font-size:11px">
                                <span>${w.icon}</span>
                                <span style="color:${w.level === 'critical' ? '#ef4444' : '#f59e0b'}">${w.message}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : `
                    <div style="display:flex;align-items:center;gap:6px;padding:6px;background:rgba(34,197,94,0.1);border-radius:4px;font-size:11px">
                        <span>✅</span>
                        <span style="color:#22c55e">Adequate daylight for round trip</span>
                    </div>
                `}
            </div>
        `;
    }
    
    /**
     * Render pace selector widget
     */
    function renderPaceSelector(containerId = 'pace-selector') {
        const currentPreset = settings.pacePreset;
        const currentSpeed = getFlatSpeed();
        
        return `
            <div id="${containerId}" style="padding:12px;background:var(--color-bg-elevated);border-radius:10px">
                <div style="font-size:12px;font-weight:600;margin-bottom:10px">🥾 Hiking Pace</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px">
                    ${Object.entries(PACE_PRESETS).map(([key, preset]) => `
                        <button class="btn ${currentPreset === key ? 'btn--primary' : 'btn--secondary'}" 
                                data-pace-preset="${key}"
                                style="padding:8px;font-size:11px">
                            ${preset.name}<br>
                            <span style="font-size:10px;opacity:0.7">${preset.flatSpeed} mph</span>
                        </button>
                    `).join('')}
                </div>
                <div style="font-size:10px;color:rgba(255,255,255,0.5);text-align:center">
                    Current: ${currentSpeed} mph on flat terrain
                </div>
            </div>
        `;
    }
    
    // Settings management
    function getSettings() {
        return { ...settings };
    }
    
    function updateSettings(newSettings) {
        settings = { ...settings, ...newSettings };
        saveSettings();
    }
    
    function setPacePreset(preset) {
        if (PACE_PRESETS[preset]) {
            settings.pacePreset = preset;
            settings.customFlatSpeed = null;
            saveSettings();
        }
    }
    
    function setCustomSpeed(mph) {
        settings.customFlatSpeed = mph;
        saveSettings();
    }
    
    function setSafetyMargin(minutes) {
        settings.safetyMarginMinutes = minutes;
        saveSettings();
    }
    
    // ==================== ACTIVE HIKE & TURNAROUND MONITORING ====================
    
    /**
     * Start an active hike with turnaround monitoring
     * @param {Object} options - Hike configuration
     * @param {number} options.targetDistance - One-way target distance in miles
     * @param {number} options.elevationGain - Expected elevation gain in feet
     * @param {number} options.elevationLoss - Expected elevation loss in feet
     * @param {Date} options.turnaroundTime - Specific turnaround time (optional)
     * @param {boolean} options.outAndBack - Is this an out-and-back hike?
     */
    function startHike(options = {}) {
        const daylight = getDaylightInfo();
        if (!daylight) {
            console.warn('Cannot start hike: daylight info unavailable');
            return null;
        }
        
        // Calculate turnaround if not specified
        let turnaroundTime = options.turnaroundTime;
        let turnaround = null;
        
        if (!turnaroundTime && options.targetDistance) {
            turnaround = calculateTurnaround(
                options.targetDistance,
                options.elevationGain || 0,
                options.elevationLoss || 0
            );
            if (turnaround && !turnaround.error) {
                // Convert decimal hour to Date
                const now = new Date();
                const turnaroundHours = Math.floor(turnaround.turnaroundHour);
                const turnaroundMinutes = Math.round((turnaround.turnaroundHour - turnaroundHours) * 60);
                turnaroundTime = new Date(now);
                turnaroundTime.setHours(turnaroundHours, turnaroundMinutes, 0, 0);
            }
        }
        
        activeHike = {
            startTime: new Date(),
            targetDistance: options.targetDistance || null,
            elevationGain: options.elevationGain || 0,
            elevationLoss: options.elevationLoss || 0,
            turnaroundTime: turnaroundTime,
            outAndBack: options.outAndBack !== false,
            turnaround: turnaround,
            daylight: daylight,
            distanceCovered: 0,
            currentPosition: null,
            startPosition: null
        };
        
        // Get starting position
        if (typeof GPSModule !== 'undefined') {
            const pos = GPSModule.getPosition();
            if (pos) {
                activeHike.startPosition = { lat: pos.lat, lon: pos.lon };
                activeHike.currentPosition = { lat: pos.lat, lon: pos.lon };
            }
        }
        
        // Clear previous alerts
        alertsTriggered.clear();
        
        // Start turnaround monitoring
        if (settings.turnaroundAlerts && turnaroundTime) {
            startTurnaroundMonitoring();
        }
        
        // Start trail recording
        startTrailRecording();
        
        // Emit event
        if (typeof Events !== 'undefined') {
            Events.emit('hike:started', activeHike);
        }
        
        console.log('Hike started, turnaround at:', turnaroundTime);
        return activeHike;
    }
    
    /**
     * Stop the active hike
     */
    function stopHike() {
        if (!activeHike) return null;
        
        const summary = {
            ...activeHike,
            endTime: new Date(),
            duration: (Date.now() - activeHike.startTime.getTime()) / 1000 / 60, // minutes
            trail: [...hikingTrail]
        };
        
        // Stop monitoring
        stopTurnaroundMonitoring();
        stopTrailRecording();
        
        activeHike = null;
        alertsTriggered.clear();
        
        // Emit event
        if (typeof Events !== 'undefined') {
            Events.emit('hike:stopped', summary);
        }
        
        console.log('Hike stopped, duration:', summary.duration.toFixed(1), 'minutes');
        return summary;
    }
    
    /**
     * Get active hike status
     */
    function getActiveHike() {
        if (!activeHike) return null;
        
        // Update with latest position
        if (typeof GPSModule !== 'undefined') {
            const pos = GPSModule.getPosition();
            if (pos) {
                activeHike.currentPosition = { lat: pos.lat, lon: pos.lon };
                
                // Calculate distance from start
                if (activeHike.startPosition) {
                    activeHike.distanceCovered = haversineDistance(
                        activeHike.startPosition.lat, activeHike.startPosition.lon,
                        pos.lat, pos.lon
                    );
                }
            }
        }
        
        // Calculate time to turnaround
        let minutesToTurnaround = null;
        if (activeHike.turnaroundTime) {
            minutesToTurnaround = (activeHike.turnaroundTime.getTime() - Date.now()) / 1000 / 60;
        }
        
        return {
            ...activeHike,
            minutesToTurnaround,
            isPastTurnaround: minutesToTurnaround !== null && minutesToTurnaround < 0,
            elapsedMinutes: (Date.now() - activeHike.startTime.getTime()) / 1000 / 60
        };
    }
    
    /**
     * Check if a hike is active
     */
    function isHikeActive() {
        return activeHike !== null;
    }
    
    /**
     * Start turnaround time monitoring
     */
    function startTurnaroundMonitoring() {
        if (turnaroundMonitorInterval) {
            clearInterval(turnaroundMonitorInterval);
        }
        
        // Check every 30 seconds
        turnaroundMonitorInterval = setInterval(() => {
            checkTurnaroundAlerts();
        }, 30000);
        
        // Initial check
        checkTurnaroundAlerts();
    }
    
    /**
     * Stop turnaround monitoring
     */
    function stopTurnaroundMonitoring() {
        if (turnaroundMonitorInterval) {
            clearInterval(turnaroundMonitorInterval);
            turnaroundMonitorInterval = null;
        }
    }
    
    /**
     * Check and trigger turnaround alerts
     */
    function checkTurnaroundAlerts() {
        if (!activeHike || !activeHike.turnaroundTime) return;
        
        const now = Date.now();
        const turnaroundMs = activeHike.turnaroundTime.getTime();
        const minutesRemaining = (turnaroundMs - now) / 1000 / 60;
        
        // Check warning thresholds
        for (const warningMinutes of settings.turnaroundWarningMinutes) {
            const alertKey = `warning_${warningMinutes}`;
            
            if (minutesRemaining <= warningMinutes && minutesRemaining > warningMinutes - 1 && !alertsTriggered.has(alertKey)) {
                alertsTriggered.add(alertKey);
                triggerTurnaroundAlert('warning', warningMinutes, minutesRemaining);
            }
        }
        
        // Check turnaround time reached
        if (minutesRemaining <= 0 && !alertsTriggered.has('turnaround')) {
            alertsTriggered.add('turnaround');
            triggerTurnaroundAlert('critical', 0, minutesRemaining);
        }
        
        // Check past turnaround (every 5 minutes)
        if (minutesRemaining < -5) {
            const overMinutes = Math.abs(Math.floor(minutesRemaining / 5) * 5);
            const alertKey = `overdue_${overMinutes}`;
            
            if (!alertsTriggered.has(alertKey)) {
                alertsTriggered.add(alertKey);
                triggerTurnaroundAlert('emergency', -overMinutes, minutesRemaining);
            }
        }
    }
    
    /**
     * Trigger a turnaround alert
     */
    function triggerTurnaroundAlert(level, thresholdMinutes, actualMinutes) {
        let title, message, severity;
        
        if (level === 'warning') {
            title = '⏰ Turnaround Warning';
            message = `${thresholdMinutes} minutes until turnaround time`;
            severity = thresholdMinutes <= 5 ? 'warning' : 'caution';
        } else if (level === 'critical') {
            title = '🔄 TURNAROUND NOW';
            message = 'Time to turn back to return before sunset!';
            severity = 'critical';
        } else if (level === 'emergency') {
            title = '⚠️ PAST TURNAROUND';
            message = `${Math.abs(thresholdMinutes)} minutes past turnaround - turn back immediately!`;
            severity = 'emergency';
        }
        
        // Use AlertModule if available
        if (typeof AlertModule !== 'undefined') {
            AlertModule.trigger({
                source: 'hiking',
                severity: AlertModule.SEVERITY[severity.toUpperCase()] || AlertModule.SEVERITY.WARNING,
                title: title,
                message: message,
                data: {
                    thresholdMinutes,
                    actualMinutes,
                    turnaroundTime: activeHike?.turnaroundTime,
                    hikeStartTime: activeHike?.startTime
                },
                persistent: level === 'critical' || level === 'emergency',
                sound: settings.turnaroundSoundEnabled,
                notification: true
            });
        } else if (typeof ModalsModule !== 'undefined') {
            // Fallback to toast
            const toastType = severity === 'emergency' || severity === 'critical' ? 'error' : 'warning';
            ModalsModule.showToast(`${title}: ${message}`, toastType, 8000);
        }
        
        // Emit event
        if (typeof Events !== 'undefined') {
            Events.emit('hike:turnaround_alert', { level, thresholdMinutes, actualMinutes });
        }
        
        console.log('Turnaround alert:', level, message);
    }
    
    // ==================== HIKING TRAIL RECORDING ====================
    
    /**
     * Start recording hiking trail with enhanced data
     */
    function startTrailRecording() {
        hikingTrail = [];
        
        if (trailRecordingInterval) {
            clearInterval(trailRecordingInterval);
        }
        
        // Record point every 10 seconds
        trailRecordingInterval = setInterval(() => {
            recordTrailPoint();
        }, 10000);
        
        // Record initial point
        recordTrailPoint();
    }
    
    /**
     * Stop trail recording
     */
    function stopTrailRecording() {
        if (trailRecordingInterval) {
            clearInterval(trailRecordingInterval);
            trailRecordingInterval = null;
        }
    }
    
    /**
     * Record a trail point with enhanced data
     */
    function recordTrailPoint() {
        if (typeof GPSModule === 'undefined') return;
        
        const pos = GPSModule.getPosition();
        if (!pos) return;
        
        const lastPoint = hikingTrail[hikingTrail.length - 1];
        
        // Calculate speed if we have a previous point
        let speed = 0;
        let distanceFromLast = 0;
        
        if (lastPoint) {
            distanceFromLast = haversineDistance(lastPoint.lat, lastPoint.lon, pos.lat, pos.lon);
            const timeDiff = (Date.now() - lastPoint.timestamp) / 1000 / 3600; // hours
            if (timeDiff > 0) {
                speed = distanceFromLast / timeDiff; // mph
            }
            
            // Skip if haven't moved much (< 10 feet)
            if (distanceFromLast < 0.002) return;
        }
        
        // Get elevation if available
        let elevation = null;
        const gpsState = GPSModule.getState ? GPSModule.getState() : null;
        if (gpsState?.altitude) {
            elevation = gpsState.altitude * 3.28084; // meters to feet
        }
        
        const point = {
            lat: pos.lat,
            lon: pos.lon,
            timestamp: Date.now(),
            elevation: elevation,
            speed: speed,
            accuracy: pos.accuracy || null,
            cumulativeDistance: lastPoint ? lastPoint.cumulativeDistance + distanceFromLast : 0
        };
        
        hikingTrail.push(point);
        
        // Limit trail length
        if (hikingTrail.length > MAX_TRAIL_POINTS) {
            hikingTrail.shift();
        }
    }
    
    /**
     * Get the recorded hiking trail
     */
    function getHikingTrail() {
        return [...hikingTrail];
    }
    
    /**
     * Clear the hiking trail
     */
    function clearHikingTrail() {
        hikingTrail = [];
    }
    
    /**
     * Get trail statistics
     */
    function getTrailStats() {
        if (hikingTrail.length < 2) return null;
        
        const first = hikingTrail[0];
        const last = hikingTrail[hikingTrail.length - 1];
        
        // Calculate total elevation gain/loss
        let elevationGain = 0;
        let elevationLoss = 0;
        let maxElevation = -Infinity;
        let minElevation = Infinity;
        
        for (let i = 1; i < hikingTrail.length; i++) {
            const prev = hikingTrail[i - 1];
            const curr = hikingTrail[i];
            
            if (prev.elevation !== null && curr.elevation !== null) {
                const diff = curr.elevation - prev.elevation;
                if (diff > 0) elevationGain += diff;
                else elevationLoss += Math.abs(diff);
                
                maxElevation = Math.max(maxElevation, curr.elevation);
                minElevation = Math.min(minElevation, curr.elevation);
            }
        }
        
        // Average speed (excluding stopped points)
        const movingPoints = hikingTrail.filter(p => p.speed > 0.5);
        const avgSpeed = movingPoints.length > 0 
            ? movingPoints.reduce((sum, p) => sum + p.speed, 0) / movingPoints.length
            : 0;
        
        return {
            totalDistance: last.cumulativeDistance,
            duration: (last.timestamp - first.timestamp) / 1000 / 60, // minutes
            elevationGain: elevationGain,
            elevationLoss: elevationLoss,
            maxElevation: maxElevation === -Infinity ? null : maxElevation,
            minElevation: minElevation === Infinity ? null : minElevation,
            avgSpeed: avgSpeed,
            pointCount: hikingTrail.length
        };
    }
    
    /**
     * Render hiking trail on canvas (for MapModule integration)
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Function} latLonToPixel - Coordinate conversion function
     * @param {Object} options - Rendering options
     */
    function renderHikingTrail(ctx, latLonToPixel, options = {}) {
        if (hikingTrail.length < 2) return;
        
        const {
            colorBySpeed = true,
            showDistanceMarkers = true,
            showTimeMarkers = false,
            lineWidth = 4,
            markerInterval = 0.25  // miles
        } = options;
        
        // Speed color gradient
        const speedColors = {
            slow: '#ef4444',    // Red - < 1 mph
            walking: '#f59e0b', // Orange - 1-2 mph
            moderate: '#22c55e', // Green - 2-3 mph
            fast: '#3b82f6'     // Blue - > 3 mph
        };
        
        function getSpeedColor(speed) {
            if (speed < 1) return speedColors.slow;
            if (speed < 2) return speedColors.walking;
            if (speed < 3) return speedColors.moderate;
            return speedColors.fast;
        }
        
        // Draw trail segments with speed coloring
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        if (colorBySpeed) {
            // Draw each segment with its own color
            for (let i = 1; i < hikingTrail.length; i++) {
                const prev = hikingTrail[i - 1];
                const curr = hikingTrail[i];
                
                const p1 = latLonToPixel(prev.lat, prev.lon);
                const p2 = latLonToPixel(curr.lat, curr.lon);
                
                ctx.strokeStyle = getSpeedColor(curr.speed);
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            }
        } else {
            // Single color trail
            ctx.strokeStyle = 'rgba(249, 115, 22, 0.8)';
            ctx.beginPath();
            hikingTrail.forEach((point, i) => {
                const pixel = latLonToPixel(point.lat, point.lon);
                if (i === 0) ctx.moveTo(pixel.x, pixel.y);
                else ctx.lineTo(pixel.x, pixel.y);
            });
            ctx.stroke();
        }
        
        // Draw distance markers
        if (showDistanceMarkers) {
            let lastMarkerDist = 0;
            
            hikingTrail.forEach((point, i) => {
                if (point.cumulativeDistance - lastMarkerDist >= markerInterval) {
                    lastMarkerDist = Math.floor(point.cumulativeDistance / markerInterval) * markerInterval;
                    const pixel = latLonToPixel(point.lat, point.lon);
                    
                    // Draw marker circle
                    ctx.fillStyle = '#ffffff';
                    ctx.strokeStyle = '#1f2937';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(pixel.x, pixel.y, 8, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                    
                    // Draw distance text
                    ctx.fillStyle = '#1f2937';
                    ctx.font = 'bold 9px system-ui';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(lastMarkerDist.toFixed(1), pixel.x, pixel.y);
                }
            });
        }
        
        // Draw start marker
        if (hikingTrail.length > 0) {
            const start = hikingTrail[0];
            const startPixel = latLonToPixel(start.lat, start.lon);
            
            ctx.fillStyle = '#22c55e';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(startPixel.x, startPixel.y, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 12px system-ui';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('S', startPixel.x, startPixel.y);
        }
        
        // Draw current position marker
        if (hikingTrail.length > 1) {
            const current = hikingTrail[hikingTrail.length - 1];
            const currentPixel = latLonToPixel(current.lat, current.lon);
            
            // Pulsing effect (use timestamp for animation)
            const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 500);
            const radius = 8 + pulse * 4;
            
            ctx.fillStyle = `rgba(249, 115, 22, ${0.3 + pulse * 0.3})`;
            ctx.beginPath();
            ctx.arc(currentPixel.x, currentPixel.y, radius + 6, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = '#f97316';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(currentPixel.x, currentPixel.y, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
    }
    
    /**
     * Render trail legend
     */
    function renderTrailLegend() {
        return `
            <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:10px;padding:8px;background:rgba(0,0,0,0.3);border-radius:6px">
                <div style="display:flex;align-items:center;gap:4px">
                    <span style="width:12px;height:3px;background:#ef4444;border-radius:2px"></span>
                    <span style="color:rgba(255,255,255,0.6)">Slow (&lt;1 mph)</span>
                </div>
                <div style="display:flex;align-items:center;gap:4px">
                    <span style="width:12px;height:3px;background:#f59e0b;border-radius:2px"></span>
                    <span style="color:rgba(255,255,255,0.6)">Walking (1-2)</span>
                </div>
                <div style="display:flex;align-items:center;gap:4px">
                    <span style="width:12px;height:3px;background:#22c55e;border-radius:2px"></span>
                    <span style="color:rgba(255,255,255,0.6)">Moderate (2-3)</span>
                </div>
                <div style="display:flex;align-items:center;gap:4px">
                    <span style="width:12px;height:3px;background:#3b82f6;border-radius:2px"></span>
                    <span style="color:rgba(255,255,255,0.6)">Fast (&gt;3 mph)</span>
                </div>
            </div>
        `;
    }
    
    /**
     * Render active hike status widget
     */
    function renderActiveHikeWidget() {
        const hike = getActiveHike();
        if (!hike) {
            return `
                <div style="padding:16px;background:var(--color-bg-elevated);border-radius:10px;text-align:center">
                    <div style="font-size:24px;margin-bottom:8px">🥾</div>
                    <div style="font-size:12px;color:rgba(255,255,255,0.6);margin-bottom:12px">No active hike</div>
                    <button class="btn btn--primary" id="start-hike-btn" style="padding:10px 20px">
                        Start Hiking
                    </button>
                </div>
            `;
        }
        
        const stats = getTrailStats();
        const isPastTurnaround = hike.minutesToTurnaround !== null && hike.minutesToTurnaround < 0;
        const turnaroundSoon = hike.minutesToTurnaround !== null && hike.minutesToTurnaround <= 15 && hike.minutesToTurnaround > 0;
        
        let statusColor = '#22c55e';
        let statusText = 'Hiking';
        if (isPastTurnaround) {
            statusColor = '#ef4444';
            statusText = 'TURN BACK!';
        } else if (turnaroundSoon) {
            statusColor = '#f59e0b';
            statusText = 'Turn Soon';
        }
        
        return `
            <div style="padding:12px;background:var(--color-bg-elevated);border-radius:10px;border-left:4px solid ${statusColor}">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                    <div>
                        <div style="font-size:12px;font-weight:600">🥾 Active Hike</div>
                        <div style="font-size:10px;color:rgba(255,255,255,0.5)">${formatDuration(hike.elapsedMinutes / 60)} elapsed</div>
                    </div>
                    <div style="text-align:right">
                        <div style="font-size:14px;font-weight:700;color:${statusColor}">${statusText}</div>
                        ${hike.turnaroundTime ? `
                            <div style="font-size:10px;color:rgba(255,255,255,0.5)">
                                Turnaround: ${formatTimeFromHours(hike.turnaroundTime.getHours() + hike.turnaroundTime.getMinutes() / 60)}
                            </div>
                        ` : ''}
                    </div>
                </div>
                
                ${hike.minutesToTurnaround !== null ? `
                    <div style="padding:10px;background:rgba(${isPastTurnaround ? '239,68,68' : turnaroundSoon ? '245,158,11' : '34,197,94'},0.1);border-radius:8px;margin-bottom:12px;text-align:center">
                        <div style="font-size:11px;color:rgba(255,255,255,0.6)">
                            ${isPastTurnaround ? 'Past turnaround by' : 'Turnaround in'}
                        </div>
                        <div style="font-size:20px;font-weight:700;color:${statusColor}">
                            ${formatDuration(Math.abs(hike.minutesToTurnaround) / 60)}
                        </div>
                    </div>
                ` : ''}
                
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:11px">
                    <div style="text-align:center;padding:8px;background:rgba(0,0,0,0.2);border-radius:6px">
                        <div style="font-size:14px;font-weight:600">${stats ? stats.totalDistance.toFixed(2) : '0.00'}</div>
                        <div style="color:rgba(255,255,255,0.5)">Miles</div>
                    </div>
                    <div style="text-align:center;padding:8px;background:rgba(0,0,0,0.2);border-radius:6px">
                        <div style="font-size:14px;font-weight:600">${stats ? `+${Math.round(stats.elevationGain)}` : '0'}'</div>
                        <div style="color:rgba(255,255,255,0.5)">Gain</div>
                    </div>
                    <div style="text-align:center;padding:8px;background:rgba(0,0,0,0.2);border-radius:6px">
                        <div style="font-size:14px;font-weight:600">${stats ? stats.avgSpeed.toFixed(1) : '0.0'}</div>
                        <div style="color:rgba(255,255,255,0.5)">Avg mph</div>
                    </div>
                </div>
                
                <div style="margin-top:12px">
                    <button class="btn btn--secondary btn--full" id="stop-hike-btn" style="padding:10px">
                        🛑 End Hike
                    </button>
                </div>
            </div>
        `;
    }
    
    /**
     * Haversine distance calculation (miles)
     */
    function haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 3959; // Earth radius in miles
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
    
    // Public API
    return {
        init,
        // Time calculation
        estimateHikingTime,
        calculateNaismith,
        calculateTobler,
        calculateFromProfile,
        // Daylight
        getDaylightInfo,
        calculateTurnaround,
        // Active hike management
        startHike,
        stopHike,
        getActiveHike,
        isHikeActive,
        // Trail recording
        getHikingTrail,
        clearHikingTrail,
        getTrailStats,
        // Rendering
        renderTimeEstimate,
        renderDaylightWidget,
        renderTurnaroundWidget,
        renderPaceSelector,
        renderHikingTrail,
        renderTrailLegend,
        renderActiveHikeWidget,
        // Formatting
        formatDuration,
        formatTimeFromHours,
        // Settings
        getSettings,
        updateSettings,
        setPacePreset,
        setCustomSpeed,
        setSafetyMargin,
        getFlatSpeed,
        // Constants
        PACE_PRESETS
    };
})();

window.HikingModule = HikingModule;
