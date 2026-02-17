/**
 * GridDown Terrain Analysis Module
 * Provides slope analysis, viewshed/LOS, solar exposure, flood risk, and cover assessment
 */
const TerrainModule = (function() {
    'use strict';

    // ==================== Configuration ====================
    
    const CONFIG = {
        // Slope thresholds (degrees)
        slopeThresholds: {
            flat: 5,           // 0-5° - Easy walking, any vehicle
            gentle: 15,        // 5-15° - Moderate walking, most vehicles
            moderate: 25,      // 15-25° - Strenuous hiking, 4x4 only
            steep: 35,         // 25-35° - Difficult hiking, no vehicles
            verysteep: 45,     // 35-45° - Climbing/scrambling
            cliff: 90          // 45°+ - Technical terrain
        },
        
        // Trafficability ratings
        trafficability: {
            foot: {
                easy: 15,      // Up to 15° easy
                moderate: 25,  // Up to 25° moderate
                difficult: 35, // Up to 35° difficult
                extreme: 45    // Up to 45° extreme
            },
            vehicle_4x4: {
                easy: 10,
                moderate: 20,
                difficult: 30,
                impassable: 35
            },
            vehicle_standard: {
                easy: 5,
                moderate: 10,
                difficult: 15,
                impassable: 20
            },
            atv: {
                easy: 15,
                moderate: 25,
                difficult: 35,
                impassable: 45
            }
        },
        
        // Viewshed settings
        viewshed: {
            maxRange: 10000,      // meters
            rayCount: 360,        // number of rays to cast
            observerHeight: 1.7,  // meters (eye level standing)
            targetHeight: 0,      // meters (ground level)
            resolution: 30        // meters between sample points
        },
        
        // Solar exposure settings
        solar: {
            optimalSlopeMin: 5,   // degrees
            optimalSlopeMax: 30   // degrees
        },
        
        // Flood risk settings
        flood: {
            highRiskElevation: 5,    // meters above drainage
            moderateRiskElevation: 15,
            lowRiskElevation: 30,
            drainageSearchRadius: 500 // meters
        },
        
        // Cover assessment
        cover: {
            terrainMaskAngle: 10,    // degrees below horizon for masking
            roughnessWindow: 100      // meters for roughness calculation
        }
    };

    // Analysis cache
    let analysisCache = new Map();
    const CACHE_TTL = 300000; // 5 minutes

    // ==================== Slope Analysis ====================

    /**
     * Calculate slope between two points
     * @param {Object} p1 - {lat, lon, elevation}
     * @param {Object} p2 - {lat, lon, elevation}
     * @returns {number} Slope in degrees
     */
    function calculateSlope(p1, p2) {
        const distance = haversineDistance(p1.lat, p1.lon, p2.lat, p2.lon);
        if (distance === 0) return 0;
        
        const rise = Math.abs(p2.elevation - p1.elevation);
        const slopeRadians = Math.atan(rise / distance);
        return slopeRadians * (180 / Math.PI);
    }

    /**
     * Calculate slope and aspect for a point using surrounding elevation data
     * @param {number} lat - Latitude
     * @param {number} lon - Longitude
     * @param {number} radius - Sample radius in meters
     * @returns {Promise<Object>} {slope, aspect, elevation}
     */
    async function analyzeSlopeAt(lat, lon, radius = 30) {
        const cacheKey = `slope_${lat.toFixed(5)}_${lon.toFixed(5)}_${radius}`;
        if (analysisCache.has(cacheKey)) {
            const cached = analysisCache.get(cacheKey);
            if (Date.now() - cached.time < CACHE_TTL) {
                return cached.data;
            }
        }

        try {
            // Get elevation at center and 8 surrounding points
            const points = [
                { lat, lon }, // center
                { lat: lat + metersToDegLat(radius), lon }, // N
                { lat: lat + metersToDegLat(radius), lon: lon + metersToDegLon(radius, lat) }, // NE
                { lat, lon: lon + metersToDegLon(radius, lat) }, // E
                { lat: lat - metersToDegLat(radius), lon: lon + metersToDegLon(radius, lat) }, // SE
                { lat: lat - metersToDegLat(radius), lon }, // S
                { lat: lat - metersToDegLat(radius), lon: lon - metersToDegLon(radius, lat) }, // SW
                { lat, lon: lon - metersToDegLon(radius, lat) }, // W
                { lat: lat + metersToDegLat(radius), lon: lon - metersToDegLon(radius, lat) } // NW
            ];

            const elevations = await Promise.all(
                points.map(p => getElevation(p.lat, p.lon))
            );

            const center = elevations[0];
            const n = elevations[1], ne = elevations[2], e = elevations[3];
            const se = elevations[4], s = elevations[5], sw = elevations[6];
            const w = elevations[7], nw = elevations[8];

            // Calculate slope using 3x3 kernel (Horn's method)
            const dzdx = ((ne + 2*e + se) - (nw + 2*w + sw)) / (8 * radius);
            const dzdy = ((nw + 2*n + ne) - (sw + 2*s + se)) / (8 * radius);

            const slope = Math.atan(Math.sqrt(dzdx*dzdx + dzdy*dzdy)) * (180 / Math.PI);
            
            // Calculate aspect (compass bearing of downhill direction)
            let aspect = Math.atan2(-dzdx, -dzdy) * (180 / Math.PI);
            if (aspect < 0) aspect += 360;

            const result = {
                slope: Math.round(slope * 10) / 10,
                aspect: Math.round(aspect),
                aspectCardinal: getCardinalDirection(aspect),
                elevation: center,
                classification: classifySlope(slope)
            };

            analysisCache.set(cacheKey, { data: result, time: Date.now() });
            return result;

        } catch (e) {
            console.warn('Slope analysis failed:', e);
            return { slope: 0, aspect: 0, aspectCardinal: 'N/A', elevation: 0, classification: 'unknown' };
        }
    }

    /**
     * Analyze slope along a route
     * @param {Array} points - Array of {lat, lon} points
     * @returns {Promise<Object>} Route slope analysis
     */
    async function analyzeRouteSlope(points) {
        if (!points || points.length < 2) {
            return { error: 'Need at least 2 points' };
        }

        const segments = [];
        let totalDistance = 0;
        let totalClimb = 0;
        let totalDescent = 0;
        let maxSlope = 0;
        let steepSegments = 0;

        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            const elevation = await getElevation(p.lat, p.lon);
            
            if (i > 0) {
                const prevP = points[i - 1];
                const prevElev = segments[i - 1].elevation;
                const distance = haversineDistance(prevP.lat, prevP.lon, p.lat, p.lon);
                const elevChange = elevation - prevElev;
                const slope = distance > 0 ? Math.atan(elevChange / distance) * (180 / Math.PI) : 0;

                totalDistance += distance;
                if (elevChange > 0) totalClimb += elevChange;
                else totalDescent += Math.abs(elevChange);
                
                maxSlope = Math.max(maxSlope, Math.abs(slope));
                if (Math.abs(slope) > CONFIG.slopeThresholds.moderate) steepSegments++;

                segments.push({
                    lat: p.lat,
                    lon: p.lon,
                    elevation,
                    distanceFromStart: totalDistance,
                    segmentDistance: distance,
                    elevationChange: elevChange,
                    slope: Math.round(slope * 10) / 10,
                    classification: classifySlope(Math.abs(slope))
                });
            } else {
                segments.push({
                    lat: p.lat,
                    lon: p.lon,
                    elevation,
                    distanceFromStart: 0,
                    segmentDistance: 0,
                    elevationChange: 0,
                    slope: 0,
                    classification: 'flat'
                });
            }
        }

        return {
            segments,
            summary: {
                totalDistance: Math.round(totalDistance),
                totalClimb: Math.round(totalClimb),
                totalDescent: Math.round(totalDescent),
                maxSlope: Math.round(maxSlope * 10) / 10,
                avgSlope: segments.length > 1 ? Math.round(segments.slice(1).reduce((sum, s) => sum + Math.abs(s.slope), 0) / (segments.length - 1) * 10) / 10 : 0,
                steepSegments,
                steepPercentage: Math.round(steepSegments / (segments.length - 1) * 100)
            },
            trafficability: assessRouteTrafficability(segments)
        };
    }

    /**
     * Classify slope by steepness
     */
    function classifySlope(slope) {
        const abs = Math.abs(slope);
        if (abs <= CONFIG.slopeThresholds.flat) return 'flat';
        if (abs <= CONFIG.slopeThresholds.gentle) return 'gentle';
        if (abs <= CONFIG.slopeThresholds.moderate) return 'moderate';
        if (abs <= CONFIG.slopeThresholds.steep) return 'steep';
        if (abs <= CONFIG.slopeThresholds.verysteep) return 'verysteep';
        return 'cliff';
    }

    /**
     * Assess trafficability for different modes
     */
    function assessTrafficability(slope, mode = 'foot') {
        const thresholds = CONFIG.trafficability[mode];
        if (!thresholds) return 'unknown';

        const abs = Math.abs(slope);
        if (abs <= thresholds.easy) return 'easy';
        if (abs <= thresholds.moderate) return 'moderate';
        if (abs <= thresholds.difficult) return 'difficult';
        return mode.startsWith('vehicle') ? 'impassable' : 'extreme';
    }

    /**
     * Assess route trafficability for all modes
     */
    function assessRouteTrafficability(segments) {
        const modes = ['foot', 'vehicle_4x4', 'vehicle_standard', 'atv'];
        const result = {};

        modes.forEach(mode => {
            let passable = true;
            let difficulty = 'easy';
            let problemSegments = 0;

            segments.forEach(seg => {
                const rating = assessTrafficability(seg.slope, mode);
                if (rating === 'impassable' || rating === 'extreme') {
                    passable = mode === 'foot'; // Foot can still pass extreme
                    problemSegments++;
                }
                if (rating === 'difficult' || rating === 'extreme') {
                    difficulty = 'difficult';
                } else if (rating === 'moderate' && difficulty === 'easy') {
                    difficulty = 'moderate';
                }
            });

            result[mode] = {
                passable,
                difficulty,
                problemSegments,
                recommendation: passable ? 
                    (difficulty === 'easy' ? 'Good route' : `Proceed with caution (${problemSegments} challenging sections)`) :
                    `Not recommended (${problemSegments} impassable sections)`
            };
        });

        return result;
    }

    // ==================== Viewshed Analysis ====================

    /**
     * Calculate viewshed from an observation point
     * @param {number} lat - Observer latitude
     * @param {number} lon - Observer longitude
     * @param {Object} options - {maxRange, observerHeight, rayCount}
     * @returns {Promise<Object>} Viewshed data
     */
    async function calculateViewshed(lat, lon, options = {}) {
        const config = {
            maxRange: options.maxRange || CONFIG.viewshed.maxRange,
            observerHeight: options.observerHeight || CONFIG.viewshed.observerHeight,
            rayCount: options.rayCount || CONFIG.viewshed.rayCount,
            resolution: options.resolution || CONFIG.viewshed.resolution
        };

        const cacheKey = `viewshed_${lat.toFixed(5)}_${lon.toFixed(5)}_${config.maxRange}_${config.observerHeight}`;
        if (analysisCache.has(cacheKey)) {
            const cached = analysisCache.get(cacheKey);
            if (Date.now() - cached.time < CACHE_TTL) {
                return cached.data;
            }
        }

        try {
            // Get observer elevation
            const observerElev = await getElevation(lat, lon);
            const observerTotal = observerElev + config.observerHeight;

            const rays = [];
            const visibleArea = { points: [], totalArea: 0 };
            const blindSpots = [];

            // Cast rays in all directions
            const angleStep = 360 / config.rayCount;
            
            for (let angle = 0; angle < 360; angle += angleStep) {
                const ray = await castRay(
                    lat, lon, observerTotal,
                    angle, config.maxRange, config.resolution
                );
                rays.push(ray);

                // Collect visible points
                ray.points.forEach(p => {
                    if (p.visible) {
                        visibleArea.points.push({ lat: p.lat, lon: p.lon, distance: p.distance });
                    }
                });

                // Identify blind spots (significant hidden areas)
                const hiddenRanges = findHiddenRanges(ray.points);
                hiddenRanges.forEach(range => {
                    if (range.length > 200) { // At least 200m of hidden terrain
                        blindSpots.push({
                            bearing: angle,
                            startDistance: range.start,
                            endDistance: range.end,
                            length: range.length
                        });
                    }
                });
            }

            // Calculate approximate visible area
            visibleArea.totalArea = estimateVisibleArea(visibleArea.points);

            // Find key terrain features
            const keyFeatures = identifyKeyTerrain(rays, lat, lon);

            const result = {
                observer: { lat, lon, elevation: observerElev, height: config.observerHeight },
                config,
                summary: {
                    maxVisibleDistance: Math.max(...rays.map(r => r.maxVisibleDistance)),
                    avgVisibleDistance: Math.round(rays.reduce((s, r) => s + r.maxVisibleDistance, 0) / rays.length),
                    visibleAreaSqKm: Math.round(visibleArea.totalArea / 1000000 * 100) / 100,
                    blindSpotCount: blindSpots.length,
                    coveragePercent: calculateCoveragePercent(rays, config.maxRange)
                },
                rays,
                blindSpots,
                keyFeatures
            };

            analysisCache.set(cacheKey, { data: result, time: Date.now() });
            return result;

        } catch (e) {
            console.error('Viewshed calculation failed:', e);
            return { error: e.message };
        }
    }

    /**
     * Cast a single ray for viewshed calculation
     */
    async function castRay(startLat, startLon, observerElev, bearing, maxRange, resolution) {
        const points = [];
        let maxVisibleDistance = 0;
        let maxAngleToHorizon = -90;

        const steps = Math.ceil(maxRange / resolution);

        for (let i = 1; i <= steps; i++) {
            const distance = i * resolution;
            const { lat, lon } = destinationPoint(startLat, startLon, distance, bearing);
            
            let elevation;
            try {
                elevation = await getElevation(lat, lon);
            } catch {
                elevation = 0;
            }

            // Calculate angle from observer to this point
            const angleToPoint = Math.atan2(elevation - observerElev, distance) * (180 / Math.PI);
            
            // Point is visible if angle is greater than max angle so far
            const visible = angleToPoint >= maxAngleToHorizon;
            
            if (visible) {
                maxAngleToHorizon = angleToPoint;
                maxVisibleDistance = distance;
            }

            points.push({
                lat, lon, distance, elevation,
                angleToPoint: Math.round(angleToPoint * 10) / 10,
                visible
            });
        }

        return {
            bearing,
            maxVisibleDistance,
            points
        };
    }

    /**
     * Check line of sight between two points
     * @param {Object} from - {lat, lon, height}
     * @param {Object} to - {lat, lon, height}
     * @returns {Promise<Object>} LOS analysis
     */
    async function checkLineOfSight(from, to) {
        const distance = haversineDistance(from.lat, from.lon, to.lat, to.lon);
        const bearing = calculateBearing(from.lat, from.lon, to.lat, to.lon);
        const resolution = Math.max(10, Math.min(50, distance / 50)); // 10-50m resolution

        const fromElev = await getElevation(from.lat, from.lon);
        const toElev = await getElevation(to.lat, to.lon);

        const fromTotal = fromElev + (from.height || 1.7);
        const toTotal = toElev + (to.height || 0);

        const steps = Math.ceil(distance / resolution);
        const obstructions = [];
        let hasLOS = true;

        // Calculate the line of sight elevation at each point
        for (let i = 1; i < steps; i++) {
            const d = i * resolution;
            const fraction = d / distance;
            const losElev = fromTotal + (toTotal - fromTotal) * fraction;

            const { lat, lon } = destinationPoint(from.lat, from.lon, d, bearing);
            let groundElev;
            try {
                groundElev = await getElevation(lat, lon);
            } catch {
                groundElev = 0;
            }

            if (groundElev > losElev) {
                hasLOS = false;
                obstructions.push({
                    lat, lon, distance: d,
                    groundElev,
                    losElev: Math.round(losElev),
                    clearance: Math.round(losElev - groundElev)
                });
            }
        }

        return {
            from: { ...from, elevation: fromElev },
            to: { ...to, elevation: toElev },
            distance: Math.round(distance),
            bearing: Math.round(bearing),
            hasLOS,
            obstructions,
            summary: hasLOS ? 
                'Clear line of sight' : 
                `Obstructed by ${obstructions.length} terrain feature(s)`
        };
    }

    /**
     * Find hidden ranges in a ray
     */
    function findHiddenRanges(points) {
        const ranges = [];
        let inHidden = false;
        let hiddenStart = 0;

        points.forEach(p => {
            if (!p.visible && !inHidden) {
                inHidden = true;
                hiddenStart = p.distance;
            } else if (p.visible && inHidden) {
                inHidden = false;
                ranges.push({
                    start: hiddenStart,
                    end: p.distance,
                    length: p.distance - hiddenStart
                });
            }
        });

        return ranges;
    }

    /**
     * Identify key terrain features from viewshed
     */
    function identifyKeyTerrain(rays, observerLat, observerLon) {
        const features = {
            highPoints: [],
            ridgelines: [],
            valleys: []
        };

        rays.forEach(ray => {
            let prevElev = 0;
            let rising = true;

            ray.points.forEach((p, i) => {
                if (i > 0) {
                    const wasRising = rising;
                    rising = p.elevation > prevElev;

                    // Peak detection (was rising, now falling)
                    if (wasRising && !rising && p.visible) {
                        features.highPoints.push({
                            lat: ray.points[i-1].lat,
                            lon: ray.points[i-1].lon,
                            elevation: prevElev,
                            distance: ray.points[i-1].distance,
                            bearing: ray.bearing
                        });
                    }
                }
                prevElev = p.elevation;
            });
        });

        // Sort and limit high points
        features.highPoints.sort((a, b) => b.elevation - a.elevation);
        features.highPoints = features.highPoints.slice(0, 10);

        return features;
    }

    /**
     * Estimate visible area from points
     */
    function estimateVisibleArea(points) {
        if (points.length < 3) return 0;
        
        // Simple estimation using max distances
        let maxDist = 0;
        points.forEach(p => {
            if (p.distance > maxDist) maxDist = p.distance;
        });
        
        // Approximate as percentage of circle
        const fullCircleArea = Math.PI * maxDist * maxDist;
        const coverage = points.length / (360 * (maxDist / 30)); // Rough estimate
        
        return Math.min(fullCircleArea, fullCircleArea * Math.min(1, coverage));
    }

    /**
     * Calculate coverage percent
     */
    function calculateCoveragePercent(rays, maxRange) {
        let totalVisible = 0;
        let totalPossible = 0;

        rays.forEach(ray => {
            ray.points.forEach(p => {
                totalPossible++;
                if (p.visible) totalVisible++;
            });
        });

        return Math.round(totalVisible / totalPossible * 100);
    }

    // ==================== Solar Exposure Analysis ====================

    /**
     * Analyze solar exposure at a point
     * @param {number} lat - Latitude
     * @param {number} lon - Longitude
     * @param {Date} date - Date for analysis
     * @returns {Promise<Object>} Solar exposure data
     */
    async function analyzeSolarExposure(lat, lon, date = new Date()) {
        const slopeData = await analyzeSlopeAt(lat, lon);
        
        // Get sun position data if SunMoonModule is available
        let sunData = null;
        if (typeof SunMoonModule !== 'undefined' && SunMoonModule.getSunTimes) {
            sunData = SunMoonModule.getSunTimes(date, lat, lon);
        }

        const aspect = slopeData.aspect;
        const slope = slopeData.slope;

        // Calculate exposure score based on aspect and slope
        // In Northern Hemisphere: South-facing (180°) gets most sun
        // Adjust for latitude
        const isNorthernHemisphere = lat >= 0;
        const optimalAspect = isNorthernHemisphere ? 180 : 0; // South in N, North in S
        
        // Calculate aspect difference from optimal
        let aspectDiff = Math.abs(aspect - optimalAspect);
        if (aspectDiff > 180) aspectDiff = 360 - aspectDiff;
        
        // Score components
        const aspectScore = 100 - (aspectDiff / 180 * 100);
        const slopeScore = slope >= CONFIG.solar.optimalSlopeMin && 
                          slope <= CONFIG.solar.optimalSlopeMax ? 100 :
                          slope < CONFIG.solar.optimalSlopeMin ? 
                            (slope / CONFIG.solar.optimalSlopeMin * 100) :
                            Math.max(0, 100 - (slope - CONFIG.solar.optimalSlopeMax) * 3);

        const overallScore = (aspectScore * 0.6 + slopeScore * 0.4);

        // Determine exposure category
        let category, description;
        if (overallScore >= 80) {
            category = 'excellent';
            description = 'Maximum sun exposure - good for solar charging, may be hot';
        } else if (overallScore >= 60) {
            category = 'good';
            description = 'Good sun exposure - balanced light and warmth';
        } else if (overallScore >= 40) {
            category = 'moderate';
            description = 'Partial sun exposure - cooler conditions';
        } else if (overallScore >= 20) {
            category = 'limited';
            description = 'Limited sun exposure - shaded much of day';
        } else {
            category = 'minimal';
            description = 'Very limited sun - north-facing or steep terrain';
        }

        // Morning vs afternoon sun
        const morningExposure = aspect >= 45 && aspect <= 135 ? 'high' : 
                               aspect >= 315 || aspect <= 45 ? 'moderate' : 'low';
        const afternoonExposure = aspect >= 225 && aspect <= 315 ? 'high' :
                                  aspect >= 135 && aspect <= 225 ? 'moderate' : 'low';

        return {
            location: { lat, lon },
            slope: slopeData,
            exposure: {
                score: Math.round(overallScore),
                category,
                description,
                aspectScore: Math.round(aspectScore),
                slopeScore: Math.round(slopeScore)
            },
            timing: {
                morningExposure,
                afternoonExposure,
                bestTime: morningExposure === 'high' ? 'Morning' :
                         afternoonExposure === 'high' ? 'Afternoon' : 'Midday'
            },
            recommendations: {
                solarCharging: overallScore >= 60 ? 'Good location' : 'Consider alternate site',
                camping: {
                    summer: overallScore >= 60 ? 'May be hot - seek shade' : 'Good temperature',
                    winter: overallScore >= 60 ? 'Good warmth' : 'May be cold - insulate well'
                }
            },
            sunData
        };
    }

    /**
     * Compare solar exposure for multiple points
     */
    async function compareSolarExposure(points, date = new Date()) {
        const analyses = await Promise.all(
            points.map(p => analyzeSolarExposure(p.lat, p.lon, date))
        );

        // Sort by score
        const ranked = analyses
            .map((a, i) => ({ ...a, index: i, originalPoint: points[i] }))
            .sort((a, b) => b.exposure.score - a.exposure.score);

        return {
            analyses,
            ranked,
            best: ranked[0],
            worst: ranked[ranked.length - 1],
            recommendation: `Best sun exposure: Point ${ranked[0].index + 1} (${ranked[0].exposure.score}% score)`
        };
    }

    // ==================== Flood Risk Analysis ====================

    /**
     * Analyze flood risk at a point
     * @param {number} lat - Latitude
     * @param {number} lon - Longitude
     * @returns {Promise<Object>} Flood risk assessment
     */
    async function analyzeFloodRisk(lat, lon) {
        const cacheKey = `flood_${lat.toFixed(5)}_${lon.toFixed(5)}`;
        if (analysisCache.has(cacheKey)) {
            const cached = analysisCache.get(cacheKey);
            if (Date.now() - cached.time < CACHE_TTL) {
                return cached.data;
            }
        }

        try {
            const centerElev = await getElevation(lat, lon);
            const radius = CONFIG.flood.drainageSearchRadius;
            
            // Sample elevations in a grid around the point
            const samples = [];
            const gridSize = 10;
            const step = radius / gridSize;

            for (let i = -gridSize; i <= gridSize; i++) {
                for (let j = -gridSize; j <= gridSize; j++) {
                    const sLat = lat + metersToDegLat(i * step);
                    const sLon = lon + metersToDegLon(j * step, lat);
                    const distance = Math.sqrt(i * i + j * j) * step;
                    
                    if (distance <= radius) {
                        let elev;
                        try {
                            elev = await getElevation(sLat, sLon);
                        } catch {
                            continue;
                        }
                        samples.push({ lat: sLat, lon: sLon, elevation: elev, distance });
                    }
                }
            }

            // Find lowest point (potential drainage)
            const minElev = Math.min(...samples.map(s => s.elevation));
            const maxElev = Math.max(...samples.map(s => s.elevation));
            const drainagePoints = samples.filter(s => s.elevation <= minElev + 5);
            
            // Calculate elevation above nearest drainage
            let nearestDrainage = null;
            let minDrainageDistance = Infinity;
            drainagePoints.forEach(dp => {
                const dist = haversineDistance(lat, lon, dp.lat, dp.lon);
                if (dist < minDrainageDistance) {
                    minDrainageDistance = dist;
                    nearestDrainage = dp;
                }
            });

            const elevAboveDrainage = nearestDrainage ? 
                centerElev - nearestDrainage.elevation : 
                centerElev - minElev;

            // Calculate terrain position (ridge, slope, valley)
            const localRelief = maxElev - minElev;
            const elevPercentile = localRelief > 0 ? 
                (centerElev - minElev) / localRelief * 100 : 50; // Flat terrain = neutral
            let terrainPosition;
            if (elevPercentile >= 80) terrainPosition = 'ridge';
            else if (elevPercentile >= 50) terrainPosition = 'upper_slope';
            else if (elevPercentile >= 20) terrainPosition = 'lower_slope';
            else terrainPosition = 'valley';

            // Determine risk level
            let riskLevel, riskDescription;
            if (elevAboveDrainage < CONFIG.flood.highRiskElevation || terrainPosition === 'valley') {
                riskLevel = 'high';
                riskDescription = 'In or very close to drainage - high flash flood risk';
            } else if (elevAboveDrainage < CONFIG.flood.moderateRiskElevation || terrainPosition === 'lower_slope') {
                riskLevel = 'moderate';
                riskDescription = 'Near drainage - moderate flood risk in heavy rain';
            } else if (elevAboveDrainage < CONFIG.flood.lowRiskElevation) {
                riskLevel = 'low';
                riskDescription = 'Elevated above drainage - low flood risk';
            } else {
                riskLevel = 'minimal';
                riskDescription = 'Well above drainage - minimal flood risk';
            }

            // Slope analysis for runoff
            const slope = await analyzeSlopeAt(lat, lon);
            const runoffRisk = slope.slope > 15 ? 'May receive runoff from upslope' : 'Low runoff exposure';

            const result = {
                location: { lat, lon, elevation: centerElev },
                drainage: {
                    nearestDistance: nearestDrainage ? Math.round(minDrainageDistance) : null,
                    elevationAbove: Math.round(elevAboveDrainage),
                    drainageElevation: nearestDrainage?.elevation || minElev
                },
                terrain: {
                    position: terrainPosition,
                    localRelief: Math.round(localRelief),
                    elevationPercentile: Math.round(elevPercentile)
                },
                risk: {
                    level: riskLevel,
                    description: riskDescription,
                    runoffRisk,
                    score: riskLevel === 'high' ? 90 : 
                           riskLevel === 'moderate' ? 60 :
                           riskLevel === 'low' ? 30 : 10
                },
                recommendations: {
                    camping: riskLevel === 'high' ? 
                        'DO NOT camp here - find higher ground' :
                        riskLevel === 'moderate' ?
                        'Monitor weather closely - have evacuation plan' :
                        'Generally safe - standard precautions',
                    weather: riskLevel !== 'minimal' ?
                        'Check forecast for upstream rainfall' : 
                        'Normal weather awareness'
                }
            };

            analysisCache.set(cacheKey, { data: result, time: Date.now() });
            return result;

        } catch (e) {
            console.error('Flood risk analysis failed:', e);
            return { error: e.message };
        }
    }

    // ==================== Cover & Concealment Assessment ====================

    /**
     * Assess cover and concealment at a point
     * @param {number} lat - Latitude
     * @param {number} lon - Longitude
     * @returns {Promise<Object>} Cover assessment
     */
    async function assessCover(lat, lon) {
        const cacheKey = `cover_${lat.toFixed(5)}_${lon.toFixed(5)}`;
        if (analysisCache.has(cacheKey)) {
            const cached = analysisCache.get(cacheKey);
            if (Date.now() - cached.time < CACHE_TTL) {
                return cached.data;
            }
        }

        try {
            // Get slope data
            const slope = await analyzeSlopeAt(lat, lon);
            
            // Calculate terrain roughness (variation in elevation)
            const roughness = await calculateTerrainRoughness(lat, lon);
            
            // Check for terrain masking (dead ground)
            const terrainMask = await assessTerrainMasking(lat, lon);
            
            // Estimate concealment based on terrain
            let terrainConcealment, terrainCover;
            
            if (slope.slope > 30 || roughness.roughnessIndex > 70) {
                terrainConcealment = 'excellent';
                terrainCover = 'good'; // Steep terrain provides some protection
            } else if (slope.slope > 15 || roughness.roughnessIndex > 40) {
                terrainConcealment = 'good';
                terrainCover = 'moderate';
            } else if (slope.slope > 5 || roughness.roughnessIndex > 20) {
                terrainConcealment = 'moderate';
                terrainCover = 'limited';
            } else {
                terrainConcealment = 'poor';
                terrainCover = 'none';
            }

            // Overall assessment
            const concealmentScore = 
                (terrainConcealment === 'excellent' ? 90 :
                 terrainConcealment === 'good' ? 70 :
                 terrainConcealment === 'moderate' ? 50 :
                 terrainConcealment === 'poor' ? 20 : 0);

            const coverScore =
                (terrainCover === 'good' ? 80 :
                 terrainCover === 'moderate' ? 50 :
                 terrainCover === 'limited' ? 25 : 0);

            const result = {
                location: { lat, lon },
                slope,
                roughness,
                terrainMask,
                assessment: {
                    concealment: {
                        rating: terrainConcealment,
                        score: concealmentScore,
                        description: getConDescription(terrainConcealment)
                    },
                    cover: {
                        rating: terrainCover,
                        score: coverScore,
                        description: getCoverDescription(terrainCover)
                    },
                    overall: Math.round((concealmentScore + coverScore) / 2)
                },
                tacticalNotes: generateTacticalNotes(slope, roughness, terrainMask),
                recommendations: {
                    observation: concealmentScore < 50 ? 
                        'Exposed position - easily observed' : 
                        'Good concealment from observation',
                    protection: coverScore < 40 ?
                        'Limited protection - seek better cover' :
                        'Adequate terrain protection available',
                    movement: roughness.roughnessIndex > 50 ?
                        'Difficult movement - plan accordingly' :
                        'Reasonable movement possible'
                }
            };

            analysisCache.set(cacheKey, { data: result, time: Date.now() });
            return result;

        } catch (e) {
            console.error('Cover assessment failed:', e);
            return { error: e.message };
        }
    }

    /**
     * Calculate terrain roughness
     */
    async function calculateTerrainRoughness(lat, lon) {
        const window = CONFIG.cover.roughnessWindow;
        const samples = [];
        const gridSize = 5;
        const step = window / gridSize;

        for (let i = -gridSize; i <= gridSize; i++) {
            for (let j = -gridSize; j <= gridSize; j++) {
                const sLat = lat + metersToDegLat(i * step);
                const sLon = lon + metersToDegLon(j * step, lat);
                try {
                    const elev = await getElevation(sLat, sLon);
                    samples.push(elev);
                } catch {
                    continue;
                }
            }
        }

        if (samples.length < 5) {
            return { roughnessIndex: 0, stdDev: 0, range: 0 };
        }

        // Calculate standard deviation
        const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
        const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length;
        const stdDev = Math.sqrt(variance);

        const range = Math.max(...samples) - Math.min(...samples);

        // Roughness index (0-100)
        const roughnessIndex = Math.min(100, stdDev * 2 + range / 2);

        return {
            roughnessIndex: Math.round(roughnessIndex),
            stdDev: Math.round(stdDev * 10) / 10,
            range: Math.round(range),
            classification: roughnessIndex > 70 ? 'very_rough' :
                           roughnessIndex > 40 ? 'rough' :
                           roughnessIndex > 20 ? 'moderate' : 'smooth'
        };
    }

    /**
     * Assess terrain masking (dead ground)
     */
    async function assessTerrainMasking(lat, lon) {
        const directions = [0, 45, 90, 135, 180, 225, 270, 315];
        const maskedDirections = [];
        const centerElev = await getElevation(lat, lon);

        for (const bearing of directions) {
            // Check if there's higher terrain nearby that provides masking
            const checkDistance = 100; // meters
            const { lat: checkLat, lon: checkLon } = destinationPoint(lat, lon, checkDistance, bearing);
            
            try {
                const checkElev = await getElevation(checkLat, checkLon);
                const elevDiff = checkElev - centerElev;
                const angle = Math.atan2(elevDiff, checkDistance) * (180 / Math.PI);
                
                if (angle > CONFIG.cover.terrainMaskAngle) {
                    maskedDirections.push({
                        bearing,
                        cardinal: getCardinalDirection(bearing),
                        maskAngle: Math.round(angle)
                    });
                }
            } catch {
                continue;
            }
        }

        return {
            maskedDirections,
            maskingPercent: Math.round(maskedDirections.length / directions.length * 100),
            description: maskedDirections.length >= 6 ? 'Well protected by terrain' :
                        maskedDirections.length >= 4 ? 'Partial terrain protection' :
                        maskedDirections.length >= 2 ? 'Limited terrain protection' :
                        'Exposed - minimal terrain masking'
        };
    }

    function getConDescription(rating) {
        const descriptions = {
            excellent: 'Terrain provides excellent visual concealment',
            good: 'Good concealment from most observation angles',
            moderate: 'Some concealment from terrain features',
            poor: 'Limited concealment - position easily observed'
        };
        return descriptions[rating] || 'Unknown';
    }

    function getCoverDescription(rating) {
        const descriptions = {
            good: 'Terrain provides good physical protection',
            moderate: 'Some physical protection from terrain',
            limited: 'Minimal protection from terrain features',
            none: 'No significant terrain cover available'
        };
        return descriptions[rating] || 'Unknown';
    }

    function generateTacticalNotes(slope, roughness, terrainMask) {
        const notes = [];

        if (slope.slope > 25) {
            notes.push(`Steep terrain (${slope.slope}°) - limits vehicle access but aids concealment`);
        }
        
        if (roughness.roughnessIndex > 50) {
            notes.push('Rough terrain - slow movement but good for dispersal');
        }

        if (terrainMask.maskingPercent > 50) {
            notes.push(`Protected from ${terrainMask.maskedDirections.map(d => d.cardinal).join(', ')}`);
        }

        if (slope.aspect >= 315 || slope.aspect <= 45) {
            notes.push('North-facing slope - cooler, may retain snow longer');
        } else if (slope.aspect >= 135 && slope.aspect <= 225) {
            notes.push('South-facing slope - warmer, better sun exposure');
        }

        return notes;
    }

    // ==================== Comprehensive Site Analysis ====================

    /**
     * Comprehensive terrain analysis for a potential site
     * @param {number} lat - Latitude
     * @param {number} lon - Longitude
     * @param {Object} options - Analysis options
     * @returns {Promise<Object>} Complete site analysis
     */
    async function analyzeSite(lat, lon, options = {}) {
        const date = options.date || new Date();
        
        const [slope, solar, flood, cover] = await Promise.all([
            analyzeSlopeAt(lat, lon),
            analyzeSolarExposure(lat, lon, date),
            analyzeFloodRisk(lat, lon),
            assessCover(lat, lon)
        ]);

        // Calculate overall suitability scores for different purposes
        const campingSuitability = calculateCampingSuitability(slope, solar, flood, cover);
        const observationSuitability = calculateObservationSuitability(slope, cover);
        const concealmentSuitability = cover.assessment.overall;

        return {
            location: { lat, lon },
            timestamp: new Date().toISOString(),
            slope,
            solar: solar.exposure,
            flood: flood.risk,
            cover: cover.assessment,
            suitability: {
                camping: campingSuitability,
                observation: observationSuitability,
                concealment: concealmentSuitability
            },
            summary: generateSiteSummary(slope, solar, flood, cover),
            recommendations: generateSiteRecommendations(slope, solar, flood, cover)
        };
    }

    function calculateCampingSuitability(slope, solar, flood, cover) {
        let score = 100;
        const issues = [];

        // Slope penalty
        if (slope.slope > 15) {
            score -= 30;
            issues.push('Too steep for comfortable camping');
        } else if (slope.slope > 10) {
            score -= 15;
            issues.push('Sloped ground');
        }

        // Flood risk penalty
        if (flood.risk.level === 'high') {
            score -= 50;
            issues.push('HIGH FLOOD RISK');
        } else if (flood.risk.level === 'moderate') {
            score -= 25;
            issues.push('Moderate flood risk');
        }

        // Cover bonus/penalty for weather protection
        if (cover.assessment.concealment.rating === 'poor') {
            score -= 10;
            issues.push('Exposed to elements');
        }

        return {
            score: Math.max(0, score),
            rating: score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'fair' : 'poor',
            issues
        };
    }

    function calculateObservationSuitability(slope, cover) {
        let score = 50;

        // Higher ground is better
        if (slope.elevation > 0) {
            score += 20;
        }

        // Concealment is bad for observation post
        if (cover.assessment.concealment.rating === 'excellent') {
            score -= 20; // Can't see out either
        }

        // Rough terrain can be good for protection while observing
        if (cover.roughness.roughnessIndex > 40) {
            score += 15;
        }

        return {
            score: Math.max(0, Math.min(100, score)),
            rating: score >= 70 ? 'good' : score >= 50 ? 'fair' : 'poor'
        };
    }

    function generateSiteSummary(slope, solar, flood, cover) {
        const parts = [];

        parts.push(`Elevation ${slope.elevation}m, ${slope.classification} slope (${slope.slope}°) facing ${slope.aspectCardinal}`);
        parts.push(`Solar: ${solar.exposure.category} (${solar.exposure.score}%)`);
        parts.push(`Flood risk: ${flood.risk.level}`);
        parts.push(`Cover: ${cover.assessment.concealment.rating} concealment, ${cover.assessment.cover.rating} protection`);

        return parts.join('. ');
    }

    function generateSiteRecommendations(slope, solar, flood, cover) {
        const recs = [];

        if (flood.risk.level === 'high') {
            recs.push({ priority: 'critical', text: 'Move to higher ground - flash flood risk' });
        }

        if (slope.slope > 15) {
            recs.push({ priority: 'moderate', text: 'Consider flatter terrain for camp setup' });
        }

        if (solar.exposure.score < 40) {
            recs.push({ priority: 'info', text: 'Limited sun - plan for cooler conditions' });
        }

        if (cover.assessment.concealment.score < 30) {
            recs.push({ priority: 'info', text: 'Exposed position - consider terrain for privacy/security' });
        }

        return recs;
    }

    // ==================== Helper Functions ====================

    /**
     * Get elevation (uses ElevationModule if available)
     */
    async function getElevation(lat, lon) {
        if (typeof ElevationModule !== 'undefined') {
            return await ElevationModule.getElevation(lat, lon);
        }
        // Fallback to mock data
        return 1000 + Math.random() * 500;
    }

    /**
     * Haversine distance in meters
     */
    function haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371000; // meters
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) ** 2 + 
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
                  Math.sin(dLon/2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    /**
     * Calculate bearing between two points
     */
    function calculateBearing(lat1, lon1, lat2, lon2) {
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const lat1Rad = lat1 * Math.PI / 180;
        const lat2Rad = lat2 * Math.PI / 180;
        
        const y = Math.sin(dLon) * Math.cos(lat2Rad);
        const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - 
                  Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
        
        let bearing = Math.atan2(y, x) * 180 / Math.PI;
        return (bearing + 360) % 360;
    }

    /**
     * Calculate destination point from start, distance, and bearing
     */
    function destinationPoint(lat, lon, distance, bearing) {
        const R = 6371000; // meters
        const bearingRad = bearing * Math.PI / 180;
        const latRad = lat * Math.PI / 180;
        const lonRad = lon * Math.PI / 180;
        const angularDist = distance / R;

        const newLatRad = Math.asin(
            Math.sin(latRad) * Math.cos(angularDist) +
            Math.cos(latRad) * Math.sin(angularDist) * Math.cos(bearingRad)
        );
        
        const newLonRad = lonRad + Math.atan2(
            Math.sin(bearingRad) * Math.sin(angularDist) * Math.cos(latRad),
            Math.cos(angularDist) - Math.sin(latRad) * Math.sin(newLatRad)
        );

        return {
            lat: newLatRad * 180 / Math.PI,
            lon: newLonRad * 180 / Math.PI
        };
    }

    /**
     * Convert meters to degrees latitude
     */
    function metersToDegLat(meters) {
        return meters / 111320;
    }

    /**
     * Convert meters to degrees longitude (varies by latitude)
     */
    function metersToDegLon(meters, lat) {
        return meters / (111320 * Math.cos(lat * Math.PI / 180));
    }

    /**
     * Get cardinal direction from bearing
     */
    function getCardinalDirection(bearing) {
        const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'N'];
        const index = Math.round(bearing / 45);
        return directions[index];
    }

    /**
     * Clear analysis cache
     */
    function clearCache() {
        analysisCache.clear();
    }

    // ==================== Public API ====================

    return {
        // Configuration
        CONFIG,
        
        // Slope Analysis
        calculateSlope,
        analyzeSlopeAt,
        analyzeRouteSlope,
        classifySlope,
        assessTrafficability,
        
        // Viewshed
        calculateViewshed,
        checkLineOfSight,
        
        // Solar
        analyzeSolarExposure,
        compareSolarExposure,
        
        // Flood Risk
        analyzeFloodRisk,
        
        // Cover Assessment
        assessCover,
        calculateTerrainRoughness,
        
        // Comprehensive
        analyzeSite,
        
        // Utilities
        clearCache,
        haversineDistance,
        calculateBearing,
        destinationPoint,
        getCardinalDirection
    };
})();

window.TerrainModule = TerrainModule;
