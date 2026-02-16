/**
 * GridDown Star Identification Module - Phase 8e
 * 
 * Point camera at sky to auto-identify visible stars and celestial bodies.
 * Provides recommendations for best observation targets.
 * 
 * Features:
 * - Real-time star identification using device orientation
 * - Visual overlay with star names, magnitudes, constellations
 * - Best observation target recommendations
 * - Integration with celestial observation workflow
 * 
 * @version 1.0.0
 */
const StarIDModule = (function() {
    'use strict';

    // ==================== STATE ====================
    
    let state = {
        isActive: false,
        stream: null,
        videoElement: null,
        canvasElement: null,
        animationFrame: null,
        
        // Observer position
        observerLat: 37.7749,
        observerLon: -122.4194,
        
        // Device orientation
        deviceAlpha: 0,      // Compass heading (0-360)
        deviceBeta: 0,       // Pitch (-180 to 180)
        deviceGamma: 0,      // Roll (-90 to 90)
        hasCompass: false,
        
        // Camera pointing direction (calculated from device orientation)
        cameraAzimuth: 0,    // Where camera is pointing (compass direction)
        cameraAltitude: 0,   // Where camera is pointing (angle above horizon)
        
        // Field of view (degrees)
        fovHorizontal: 60,
        fovVertical: 45,
        
        // Identified objects
        identifiedStars: [],
        identifiedPlanets: [],
        identifiedSun: null,
        identifiedMoon: null,
        
        // Selected star for observation
        selectedStar: null,
        
        // Sensor smoothing
        orientationHistory: [],
        smoothingWindow: 5,
        
        // Permissions
        hasCameraPermission: false,
        hasOrientationPermission: false,
        
        // Callbacks
        onStarIdentified: null,
        onSelectionChange: null,
        onError: null
    };

    // ==================== CONSTANTS ====================
    
    const DEG_TO_RAD = Math.PI / 180;
    const RAD_TO_DEG = 180 / Math.PI;
    
    // Star display configuration
    const DISPLAY_CONFIG = {
        maxMagnitude: 3.5,          // Only show stars brighter than this
        labelMinMagnitude: 2.5,     // Only label stars brighter than this
        starBaseSize: 8,            // Base size for magnitude 0 star
        starSizePerMag: 1.5,        // Size reduction per magnitude
        colors: {
            star: '#ffffff',
            starBright: '#ffffcc',
            planet: '#ffcc00',
            sun: '#ffff00',
            moon: '#ccccff',
            selected: '#00ff00',
            crosshairs: 'rgba(255,0,0,0.5)',
            text: '#ffffff',
            textShadow: 'rgba(0,0,0,0.8)',
            fovCircle: 'rgba(255,255,255,0.1)'
        }
    };

    // ==================== INITIALIZATION ====================

    /**
     * Check device capabilities for star ID
     * @returns {Object} Capability report
     */
    function checkCapabilities() {
        const capabilities = {
            camera: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
            deviceOrientation: 'DeviceOrientationEvent' in window,
            absoluteOrientation: false,
            compass: false
        };
        
        // Check for absolute orientation (compass-based)
        if ('ondeviceorientationabsolute' in window) {
            capabilities.absoluteOrientation = true;
            capabilities.compass = true;
        }
        
        capabilities.supported = capabilities.camera && capabilities.deviceOrientation;
        
        return capabilities;
    }

    /**
     * Request necessary permissions
     * @returns {Promise<Object>} Permission status
     */
    async function requestPermissions() {
        const permissions = {
            camera: false,
            orientation: false
        };
        
        // Request camera permission
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment' } 
            });
            stream.getTracks().forEach(track => track.stop());
            permissions.camera = true;
            state.hasCameraPermission = true;
        } catch (e) {
            console.warn('Camera permission denied:', e);
        }
        
        // Request orientation permission (iOS 13+)
        if (typeof DeviceOrientationEvent !== 'undefined' && 
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const response = await DeviceOrientationEvent.requestPermission();
                permissions.orientation = response === 'granted';
                state.hasOrientationPermission = permissions.orientation;
            } catch (e) {
                console.warn('Orientation permission denied:', e);
            }
        } else {
            permissions.orientation = true;
            state.hasOrientationPermission = true;
        }
        
        return permissions;
    }

    // ==================== CAMERA HANDLING ====================

    /**
     * Start camera stream
     * @param {HTMLVideoElement} videoElement - Video element to attach stream
     * @returns {Promise<MediaStream>}
     */
    async function startCamera(videoElement) {
        if (!videoElement) {
            throw new Error('Video element required');
        }
        
        const constraints = {
            video: {
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        };
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            videoElement.srcObject = stream;
            await videoElement.play();
            
            state.stream = stream;
            state.videoElement = videoElement;
            state.hasCameraPermission = true;
            
            return stream;
        } catch (error) {
            console.error('Camera error:', error);
            throw error;
        }
    }

    /**
     * Stop camera stream
     */
    function stopCamera() {
        if (state.stream) {
            state.stream.getTracks().forEach(track => track.stop());
            state.stream = null;
        }
        if (state.videoElement) {
            state.videoElement.srcObject = null;
        }
    }

    // ==================== ORIENTATION HANDLING ====================

    /**
     * Handle device orientation event
     * @param {DeviceOrientationEvent} event
     */
    function handleOrientation(event) {
        if (!state.isActive) return;
        
        // Get raw values
        let alpha = event.alpha || 0;   // Compass heading
        let beta = event.beta || 0;     // Pitch
        let gamma = event.gamma || 0;   // Roll
        
        // Add to history for smoothing
        state.orientationHistory.push({ alpha, beta, gamma });
        if (state.orientationHistory.length > state.smoothingWindow) {
            state.orientationHistory.shift();
        }
        
        // Calculate smoothed values (circular mean for alpha)
        if (state.orientationHistory.length > 0) {
            // Alpha needs circular averaging
            let sinSum = 0, cosSum = 0;
            let betaSum = 0, gammaSum = 0;
            
            for (const h of state.orientationHistory) {
                sinSum += Math.sin(h.alpha * DEG_TO_RAD);
                cosSum += Math.cos(h.alpha * DEG_TO_RAD);
                betaSum += h.beta;
                gammaSum += h.gamma;
            }
            
            state.deviceAlpha = Math.atan2(sinSum, cosSum) * RAD_TO_DEG;
            if (state.deviceAlpha < 0) state.deviceAlpha += 360;
            
            state.deviceBeta = betaSum / state.orientationHistory.length;
            state.deviceGamma = gammaSum / state.orientationHistory.length;
        }
        
        // Calculate camera pointing direction
        // When phone is held vertically (typical camera use):
        // - beta = 90° means pointing at horizon
        // - beta = 0° means pointing straight up
        // - beta = 180° means pointing straight down
        
        // Camera altitude (angle above horizon)
        // Assuming phone held with screen facing user, camera on back
        state.cameraAltitude = 90 - state.deviceBeta;
        if (state.cameraAltitude > 90) state.cameraAltitude = 180 - state.cameraAltitude;
        if (state.cameraAltitude < -90) state.cameraAltitude = -180 - state.cameraAltitude;
        
        // Camera azimuth (compass direction)
        // Alpha is compass heading of top of phone
        // Camera points same direction as top of phone when held vertically
        state.cameraAzimuth = state.deviceAlpha;
        
        state.hasCompass = event.absolute || event.webkitCompassHeading !== undefined;
    }

    /**
     * Handle absolute orientation event (preferred, has compass)
     * @param {DeviceOrientationEvent} event
     */
    function handleAbsoluteOrientation(event) {
        handleOrientation(event);
        state.hasCompass = true;
    }

    /**
     * Start sensor listening
     */
    function startSensors() {
        // Prefer absolute orientation (has compass)
        if ('ondeviceorientationabsolute' in window) {
            window.addEventListener('deviceorientationabsolute', handleAbsoluteOrientation, true);
        } else {
            window.addEventListener('deviceorientation', handleOrientation, true);
        }
    }

    /**
     * Stop sensor listening
     */
    function stopSensors() {
        window.removeEventListener('deviceorientationabsolute', handleAbsoluteOrientation, true);
        window.removeEventListener('deviceorientation', handleOrientation, true);
    }

    // ==================== STAR IDENTIFICATION ====================

    /**
     * Calculate angular distance between two points
     * @param {number} alt1 - Altitude 1 (degrees)
     * @param {number} az1 - Azimuth 1 (degrees)
     * @param {number} alt2 - Altitude 2 (degrees)
     * @param {number} az2 - Azimuth 2 (degrees)
     * @returns {number} Angular distance (degrees)
     */
    function angularDistance(alt1, az1, alt2, az2) {
        const lat1 = alt1 * DEG_TO_RAD;
        const lat2 = alt2 * DEG_TO_RAD;
        const dLon = (az2 - az1) * DEG_TO_RAD;
        
        const cosD = Math.sin(lat1) * Math.sin(lat2) + 
                     Math.cos(lat1) * Math.cos(lat2) * Math.cos(dLon);
        
        return Math.acos(Math.max(-1, Math.min(1, cosD))) * RAD_TO_DEG;
    }

    /**
     * Project celestial coordinates to screen position
     * @param {number} altitude - Object altitude (degrees)
     * @param {number} azimuth - Object azimuth (degrees)
     * @param {number} width - Canvas width
     * @param {number} height - Canvas height
     * @returns {Object|null} Screen position {x, y} or null if out of view
     */
    function projectToScreen(altitude, azimuth, width, height) {
        // Calculate angular offset from camera center
        const dAz = azimuth - state.cameraAzimuth;
        let dAzNorm = dAz;
        if (dAzNorm > 180) dAzNorm -= 360;
        if (dAzNorm < -180) dAzNorm += 360;
        
        const dAlt = altitude - state.cameraAltitude;
        
        // Check if within field of view
        if (Math.abs(dAzNorm) > state.fovHorizontal / 2 + 5 ||
            Math.abs(dAlt) > state.fovVertical / 2 + 5) {
            return null;
        }
        
        // Project to screen (simple gnomonic projection)
        const x = width / 2 + (dAzNorm / state.fovHorizontal) * width;
        const y = height / 2 - (dAlt / state.fovVertical) * height;
        
        return { x, y, dAz: dAzNorm, dAlt };
    }

    /**
     * Identify stars in current field of view
     * @returns {Array} Array of identified stars with screen positions
     */
    function identifyStars() {
        if (typeof CelestialModule === 'undefined') {
            return [];
        }
        
        const now = new Date();
        const identified = [];
        
        // Get all visible bodies
        const visible = CelestialModule.getVisibleBodies(
            state.observerLat, 
            state.observerLon, 
            now, 
            -5  // Include stars just below horizon for tracking
        );
        
        // Check stars
        for (const star of visible.stars) {
            if (star.magnitude > DISPLAY_CONFIG.maxMagnitude) continue;
            
            const distance = angularDistance(
                state.cameraAltitude, state.cameraAzimuth,
                star.altitude, star.azimuth
            );
            
            // Within extended FOV?
            const maxDist = Math.sqrt(
                Math.pow(state.fovHorizontal / 2, 2) + 
                Math.pow(state.fovVertical / 2, 2)
            ) + 10;
            
            if (distance <= maxDist) {
                identified.push({
                    type: 'star',
                    name: star.name,
                    magnitude: star.magnitude,
                    constellation: star.constellation,
                    altitude: star.altitude,
                    azimuth: star.azimuth,
                    distance: distance,
                    GHA: star.GHA,
                    dec: star.dec
                });
            }
        }
        
        // Check planets
        for (const planet of visible.planets) {
            const distance = angularDistance(
                state.cameraAltitude, state.cameraAzimuth,
                planet.altitude, planet.azimuth
            );
            
            const maxDist = Math.sqrt(
                Math.pow(state.fovHorizontal / 2, 2) + 
                Math.pow(state.fovVertical / 2, 2)
            ) + 10;
            
            if (distance <= maxDist) {
                identified.push({
                    type: 'planet',
                    name: planet.body.charAt(0).toUpperCase() + planet.body.slice(1),
                    magnitude: planet.magnitude || 0,
                    altitude: planet.altitude,
                    azimuth: planet.azimuth,
                    distance: distance,
                    GHA: planet.GHA,
                    dec: planet.dec
                });
            }
        }
        
        // Check moon
        if (visible.moon) {
            const distance = angularDistance(
                state.cameraAltitude, state.cameraAzimuth,
                visible.moon.altitude, visible.moon.azimuth
            );
            
            const maxDist = Math.sqrt(
                Math.pow(state.fovHorizontal / 2, 2) + 
                Math.pow(state.fovVertical / 2, 2)
            ) + 10;
            
            if (distance <= maxDist) {
                identified.push({
                    type: 'moon',
                    name: 'Moon',
                    altitude: visible.moon.altitude,
                    azimuth: visible.moon.azimuth,
                    distance: distance,
                    phase: visible.moon.phase,
                    GHA: visible.moon.GHA,
                    dec: visible.moon.dec
                });
            }
        }
        
        // Sort by distance from center (closest first)
        identified.sort((a, b) => a.distance - b.distance);
        
        state.identifiedStars = identified.filter(o => o.type === 'star');
        state.identifiedPlanets = identified.filter(o => o.type === 'planet');
        state.identifiedMoon = identified.find(o => o.type === 'moon') || null;
        
        return identified;
    }

    // ==================== RENDERING ====================

    /**
     * Render star ID overlay on canvas
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} width - Canvas width
     * @param {number} height - Canvas height
     */
    function renderOverlay(ctx, width, height) {
        ctx.clearRect(0, 0, width, height);
        
        const identified = identifyStars();
        
        // Draw FOV indicator circle
        ctx.strokeStyle = DISPLAY_CONFIG.colors.fovCircle;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(width / 2, height / 2, Math.min(width, height) * 0.4, 0, Math.PI * 2);
        ctx.stroke();
        
        // Draw crosshairs
        ctx.strokeStyle = DISPLAY_CONFIG.colors.crosshairs;
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        
        ctx.beginPath();
        ctx.moveTo(width / 2, 0);
        ctx.lineTo(width / 2, height);
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Draw identified objects
        for (const obj of identified) {
            const pos = projectToScreen(obj.altitude, obj.azimuth, width, height);
            if (!pos) continue;
            
            // Determine color and size
            let color, size;
            switch (obj.type) {
                case 'star':
                    color = obj.magnitude < 1 ? DISPLAY_CONFIG.colors.starBright : DISPLAY_CONFIG.colors.star;
                    size = Math.max(2, DISPLAY_CONFIG.starBaseSize - obj.magnitude * DISPLAY_CONFIG.starSizePerMag);
                    break;
                case 'planet':
                    color = DISPLAY_CONFIG.colors.planet;
                    size = 8;
                    break;
                case 'moon':
                    color = DISPLAY_CONFIG.colors.moon;
                    size = 12;
                    break;
                default:
                    color = DISPLAY_CONFIG.colors.star;
                    size = 4;
            }
            
            // Highlight selected
            if (state.selectedStar && state.selectedStar.name === obj.name) {
                color = DISPLAY_CONFIG.colors.selected;
                size += 2;
                
                // Draw selection ring
                ctx.strokeStyle = DISPLAY_CONFIG.colors.selected;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, size + 8, 0, Math.PI * 2);
                ctx.stroke();
            }
            
            // Draw object
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, size / 2, 0, Math.PI * 2);
            ctx.fill();
            
            // Draw label
            const showLabel = obj.type === 'moon' || 
                             obj.type === 'planet' || 
                             (obj.type === 'star' && obj.magnitude < DISPLAY_CONFIG.labelMinMagnitude);
            
            if (showLabel) {
                ctx.font = '12px sans-serif';
                ctx.fillStyle = DISPLAY_CONFIG.colors.text;
                ctx.shadowColor = DISPLAY_CONFIG.colors.textShadow;
                ctx.shadowBlur = 3;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                
                let label = obj.name;
                if (obj.type === 'star' && obj.constellation) {
                    label += ` (${obj.constellation})`;
                }
                
                ctx.fillText(label, pos.x + size / 2 + 5, pos.y);
                ctx.shadowBlur = 0;
            }
        }
        
        // Draw info panel
        renderInfoPanel(ctx, width, height, identified);
    }

    /**
     * Render info panel with current pointing direction
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} width
     * @param {number} height
     * @param {Array} identified
     */
    function renderInfoPanel(ctx, width, height, identified) {
        const padding = 10;
        const panelHeight = 80;
        
        // Semi-transparent background
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, width, panelHeight);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        
        // Pointing direction
        ctx.fillText(`Pointing: Az ${state.cameraAzimuth.toFixed(1)}° Alt ${state.cameraAltitude.toFixed(1)}°`, padding, padding);
        
        // Compass indicator
        const compassText = state.hasCompass ? getCompassDirection(state.cameraAzimuth) : '(No compass)';
        ctx.font = '12px sans-serif';
        ctx.fillStyle = state.hasCompass ? '#22c55e' : '#f59e0b';
        ctx.fillText(compassText, padding, padding + 20);
        
        // Object count
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`${identified.length} objects in view`, padding, padding + 40);
        
        // Center object
        if (identified.length > 0) {
            const center = identified[0];
            ctx.fillStyle = '#3b82f6';
            ctx.fillText(`Center: ${center.name} (${center.distance.toFixed(1)}° from center)`, padding, padding + 55);
        }
    }

    /**
     * Get compass direction from azimuth
     */
    function getCompassDirection(azimuth) {
        const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                          'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
        const index = Math.round(azimuth / 22.5) % 16;
        return directions[index];
    }

    /**
     * Animation loop
     */
    function animate() {
        if (!state.isActive) return;
        
        if (state.canvasElement) {
            const ctx = state.canvasElement.getContext('2d');
            renderOverlay(ctx, state.canvasElement.width, state.canvasElement.height);
        }
        
        state.animationFrame = requestAnimationFrame(animate);
    }

    // ==================== RECOMMENDATIONS ====================

    /**
     * Get recommended stars for observation
     * @returns {Array} Recommended stars sorted by suitability
     */
    function getRecommendedStars() {
        if (typeof CelestialModule === 'undefined') {
            return [];
        }
        
        const now = new Date();
        const visible = CelestialModule.getVisibleBodies(
            state.observerLat, 
            state.observerLon, 
            now, 
            15  // Minimum 15° altitude for good observations
        );
        
        const recommendations = [];
        
        // Score each star
        for (const star of visible.stars) {
            let score = 100;
            
            // Prefer brighter stars
            score -= star.magnitude * 10;
            
            // Prefer mid-altitude (30-60°) for easier observation
            if (star.altitude >= 30 && star.altitude <= 60) {
                score += 20;
            } else if (star.altitude < 20 || star.altitude > 75) {
                score -= 10;
            }
            
            // Bonus for first-magnitude stars
            if (star.magnitude < 1.0) {
                score += 15;
            }
            
            recommendations.push({
                ...star,
                score: score,
                reason: getRecommendationReason(star)
            });
        }
        
        // Add planets (always good targets)
        for (const planet of visible.planets) {
            let score = 120;  // Planets get bonus
            
            if (planet.altitude >= 30 && planet.altitude <= 60) {
                score += 20;
            }
            
            recommendations.push({
                ...planet,
                name: planet.body.charAt(0).toUpperCase() + planet.body.slice(1),
                type: 'planet',
                score: score,
                reason: 'Bright planet, easy to identify'
            });
        }
        
        // Add moon if visible
        if (visible.moon && visible.moon.altitude >= 15) {
            recommendations.push({
                ...visible.moon,
                name: 'Moon',
                type: 'moon',
                score: 150,  // Moon is excellent for beginners
                reason: 'Excellent target - easy to find, large semi-diameter'
            });
        }
        
        // Sort by score (highest first)
        recommendations.sort((a, b) => b.score - a.score);
        
        return recommendations.slice(0, 10);
    }

    /**
     * Get recommendation reason for a star
     */
    function getRecommendationReason(star) {
        const reasons = [];
        
        if (star.magnitude < 0.5) {
            reasons.push('Very bright');
        } else if (star.magnitude < 1.5) {
            reasons.push('Bright');
        }
        
        if (star.altitude >= 30 && star.altitude <= 60) {
            reasons.push('Good altitude');
        } else if (star.altitude < 25) {
            reasons.push('Low altitude');
        } else if (star.altitude > 70) {
            reasons.push('High altitude');
        }
        
        if (star.name === 'Polaris') {
            reasons.push('Latitude reference');
        }
        
        if (star.name === 'Sirius' || star.name === 'Canopus' || star.name === 'Vega') {
            reasons.push('Navigation star');
        }
        
        return reasons.join(', ') || 'Navigation star';
    }

    /**
     * Select a star for observation
     */
    function selectStar(name) {
        const identified = [...state.identifiedStars, ...state.identifiedPlanets];
        if (state.identifiedMoon) identified.push(state.identifiedMoon);
        
        state.selectedStar = identified.find(s => s.name === name) || null;
        
        if (state.onSelectionChange) {
            state.onSelectionChange(state.selectedStar);
        }
        
        return state.selectedStar;
    }

    /**
     * Get currently selected star
     */
    function getSelectedStar() {
        return state.selectedStar;
    }

    // ==================== SESSION MANAGEMENT ====================

    /**
     * Start star ID session
     * @param {HTMLVideoElement} videoElement - Video element for camera
     * @param {HTMLCanvasElement} canvasElement - Canvas for overlay
     * @param {Object} options - Configuration options
     */
    async function startSession(videoElement, canvasElement, options = {}) {
        if (state.isActive) {
            return { error: 'Session already active' };
        }
        
        // Set observer position
        if (options.lat !== undefined) state.observerLat = options.lat;
        if (options.lon !== undefined) state.observerLon = options.lon;
        
        // Check capabilities
        const caps = checkCapabilities();
        if (!caps.supported) {
            return { 
                error: 'Device not supported',
                capabilities: caps
            };
        }
        
        // Request permissions
        const permissions = await requestPermissions();
        if (!permissions.camera) {
            return { error: 'Camera permission denied' };
        }
        if (!permissions.orientation) {
            return { error: 'Orientation permission denied' };
        }
        
        // Start camera
        try {
            await startCamera(videoElement);
        } catch (e) {
            return { error: `Camera failed: ${e.message}` };
        }
        
        // Set up canvas
        state.canvasElement = canvasElement;
        if (canvasElement) {
            canvasElement.width = videoElement.videoWidth || 640;
            canvasElement.height = videoElement.videoHeight || 480;
        }
        
        // Start sensors
        startSensors();
        
        // Set callbacks
        if (options.onStarIdentified) state.onStarIdentified = options.onStarIdentified;
        if (options.onSelectionChange) state.onSelectionChange = options.onSelectionChange;
        if (options.onError) state.onError = options.onError;
        
        // Clear state
        state.orientationHistory = [];
        state.identifiedStars = [];
        state.selectedStar = null;
        
        state.isActive = true;
        
        // Start animation loop
        animate();
        
        return {
            success: true,
            capabilities: caps,
            permissions: permissions
        };
    }

    /**
     * Stop star ID session
     */
    function stopSession() {
        if (state.animationFrame) {
            cancelAnimationFrame(state.animationFrame);
            state.animationFrame = null;
        }
        
        stopCamera();
        stopSensors();
        
        state.isActive = false;
        state.selectedStar = null;
        state.onStarIdentified = null;
        state.onSelectionChange = null;
        state.onError = null;
    }

    /**
     * Update observer position
     */
    function setObserverPosition(lat, lon) {
        state.observerLat = lat;
        state.observerLon = lon;
    }

    /**
     * Get current state
     */
    function getState() {
        return {
            isActive: state.isActive,
            observerLat: state.observerLat,
            observerLon: state.observerLon,
            cameraAzimuth: state.cameraAzimuth,
            cameraAltitude: state.cameraAltitude,
            hasCompass: state.hasCompass,
            identifiedCount: state.identifiedStars.length + state.identifiedPlanets.length + (state.identifiedMoon ? 1 : 0),
            selectedStar: state.selectedStar
        };
    }

    // ==================== UI HELPERS ====================

    /**
     * Render star ID widget for panel integration
     * @returns {string} HTML string
     */
    function renderWidget() {
        const caps = checkCapabilities();
        
        if (!caps.supported) {
            return `
                <div style="background:rgba(239,68,68,0.1);border-radius:10px;padding:12px;text-align:center">
                    <div style="font-size:14px;font-weight:600;color:#ef4444;margin-bottom:8px">🔭 Star ID Unavailable</div>
                    <div style="font-size:11px;color:rgba(255,255,255,0.6)">
                        This device doesn't support required features.
                    </div>
                </div>
            `;
        }
        
        return `
            <div style="background:var(--color-bg-elevated);border-radius:10px;padding:12px;margin-bottom:12px">
                <div style="font-size:14px;font-weight:600;margin-bottom:12px">🔭 Star Identification</div>
                
                <div style="font-size:11px;color:rgba(255,255,255,0.6);margin-bottom:12px">
                    Point your phone at the night sky to identify stars and planets.
                    Tap on identified objects to select them for observation.
                </div>
                
                <div id="star-id-container" style="position:relative;width:100%;aspect-ratio:4/3;background:#000;border-radius:8px;overflow:hidden;margin-bottom:12px;display:none">
                    <video id="star-id-video" style="width:100%;height:100%;object-fit:cover" playsinline autoplay muted></video>
                    <canvas id="star-id-canvas" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none"></canvas>
                </div>
                
                <div id="star-id-controls">
                    <button id="star-id-start" class="btn btn--primary btn--full" style="padding:10px;margin-bottom:8px">
                        🔭 Start Star ID
                    </button>
                    
                    <div id="star-id-active-controls" style="display:none">
                        <div id="star-id-info" style="background:rgba(0,0,0,0.3);border-radius:8px;padding:12px;margin-bottom:12px">
                            <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                                <span style="font-size:11px;color:rgba(255,255,255,0.5)">Pointing</span>
                                <span id="star-id-pointing" style="font-size:11px;font-family:monospace">-- --</span>
                            </div>
                            <div style="display:flex;justify-content:space-between">
                                <span style="font-size:11px;color:rgba(255,255,255,0.5)">Objects in View</span>
                                <span id="star-id-count" style="font-size:11px">0</span>
                            </div>
                        </div>
                        
                        <button id="star-id-stop" class="btn btn--secondary btn--full" style="padding:8px;font-size:11px">
                            ✕ Close Star ID
                        </button>
                    </div>
                </div>
                
                <div id="star-id-selection" style="display:none;margin-top:12px">
                    <div style="background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:8px;padding:12px">
                        <div style="font-size:12px;color:#22c55e;font-weight:600;margin-bottom:4px">Selected Object</div>
                        <div id="star-id-selected-name" style="font-size:16px;font-weight:700">--</div>
                        <div id="star-id-selected-info" style="font-size:11px;color:rgba(255,255,255,0.6);margin-top:4px"></div>
                        <button id="star-id-observe" class="btn btn--primary btn--full" style="padding:8px;margin-top:8px;font-size:11px">
                            Observe This Object
                        </button>
                    </div>
                </div>
            </div>
            
            <div style="background:var(--color-bg-elevated);border-radius:10px;padding:12px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                    <div style="font-size:14px;font-weight:600">⭐ Recommended Targets</div>
                    <button id="star-id-refresh-recs" class="btn btn--secondary" style="padding:4px 8px;font-size:10px">
                        🔄 Refresh
                    </button>
                </div>
                <div id="star-id-recommendations">
                    Loading recommendations...
                </div>
            </div>
        `;
    }

    /**
     * Render recommendations list
     * @returns {string} HTML string
     */
    function renderRecommendations() {
        const recommendations = getRecommendedStars();
        
        if (recommendations.length === 0) {
            return `
                <div style="text-align:center;padding:20px;color:rgba(255,255,255,0.4);font-size:11px">
                    No stars visible. Check if it's dark enough outside (sun must be below -6°).
                </div>
            `;
        }
        
        return `
            <div style="display:flex;flex-direction:column;gap:8px;max-height:300px;overflow-y:auto">
                ${recommendations.map((obj, i) => `
                    <div class="star-id-rec-item" data-name="${obj.name}" 
                         style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:rgba(0,0,0,0.2);border-radius:8px;cursor:pointer;transition:background 0.2s"
                         onmouseover="this.style.background='rgba(59,130,246,0.2)'"
                         onmouseout="this.style.background='rgba(0,0,0,0.2)'">
                        <div>
                            <div style="display:flex;align-items:center;gap:8px">
                                <span style="font-size:16px">${getObjectIcon(obj)}</span>
                                <div>
                                    <div style="font-size:13px;font-weight:600">${obj.name}</div>
                                    <div style="font-size:10px;color:rgba(255,255,255,0.5)">${obj.reason}</div>
                                </div>
                            </div>
                        </div>
                        <div style="text-align:right">
                            <div style="font-size:12px">Alt ${obj.altitude.toFixed(0)}°</div>
                            <div style="font-size:10px;color:rgba(255,255,255,0.5)">Az ${obj.azimuth.toFixed(0)}°</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    /**
     * Get icon for celestial object
     */
    function getObjectIcon(obj) {
        if (obj.type === 'moon' || obj.name === 'Moon') return '🌙';
        if (obj.type === 'planet') return '🪐';
        if (obj.magnitude !== undefined && obj.magnitude < 1) return '⭐';
        return '✦';
    }

    // ==================== PUBLIC API ====================
    
    return {
        // Initialization
        checkCapabilities,
        requestPermissions,
        
        // Session management
        startSession,
        stopSession,
        setObserverPosition,
        getState,
        
        // Star identification
        identifyStars,
        selectStar,
        getSelectedStar,
        getRecommendedStars,
        
        // Rendering
        renderWidget,
        renderRecommendations,
        renderOverlay,
        
        // Utilities
        angularDistance,
        projectToScreen,
        getObjectIcon,
        
        // Constants
        DISPLAY_CONFIG
    };
})();

window.StarIDModule = StarIDModule;

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StarIDModule;
}
