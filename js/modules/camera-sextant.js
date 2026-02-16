/**
 * GridDown Camera Sextant Module - Phase 8c
 * 
 * Provides crude celestial body altitude measurement using:
 * - Device camera for body targeting
 * - Accelerometer for gravity/level reference
 * - Device orientation for pitch angle (altitude)
 * 
 * Accuracy: ~1-2° (vs 0.1° for real sextant)
 * Emergency navigation tool - no specialized equipment required
 * 
 * @version 1.0.0
 */
const CameraSextantModule = (function() {
    'use strict';

    // ==================== STATE ====================
    
    let state = {
        isActive: false,
        isCalibrated: false,
        stream: null,
        videoElement: null,
        canvasElement: null,
        overlayElement: null,
        
        // Sensor state
        hasOrientationPermission: false,
        hasMotionPermission: false,
        hasCameraPermission: false,
        
        // Current readings
        currentPitch: 0,        // Device pitch angle (degrees from horizontal)
        currentRoll: 0,         // Device roll angle (level indicator)
        gravityVector: { x: 0, y: 0, z: 0 },
        
        // Calibration
        horizonOffset: 0,       // Calibration offset for horizon
        
        // Measurement
        capturedAltitude: null,
        capturedTime: null,
        measurementHistory: [],
        
        // Smoothing
        pitchHistory: [],
        rollHistory: [],
        smoothingWindow: 10,    // Number of samples to average
        
        // UI callbacks
        onAltitudeUpdate: null,
        onCapture: null,
        onError: null
    };

    // ==================== CONSTANTS ====================
    
    const DEG_TO_RAD = Math.PI / 180;
    const RAD_TO_DEG = 180 / Math.PI;
    
    // Accuracy estimation based on conditions
    const ACCURACY_ESTIMATES = {
        ideal: 1.0,      // Stable, calibrated, good conditions
        normal: 1.5,     // Typical handheld use
        poor: 2.5,       // Moving, uncalibrated
        veryPoor: 5.0    // Strong movement, interference
    };

    // ==================== INITIALIZATION ====================

    /**
     * Check device capabilities
     * @returns {Object} Capability report
     */
    function checkCapabilities() {
        const capabilities = {
            camera: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
            deviceOrientation: 'DeviceOrientationEvent' in window,
            deviceMotion: 'DeviceMotionEvent' in window,
            absoluteOrientation: false,
            accelerometer: false,
            gyroscope: false
        };
        
        // Check for absolute orientation (compass-based)
        if (capabilities.deviceOrientation) {
            capabilities.absoluteOrientation = 'ondeviceorientationabsolute' in window ||
                                                ('DeviceOrientationEvent' in window && 
                                                 typeof DeviceOrientationEvent.requestPermission === 'function');
        }
        
        // Check for Sensor API (newer devices)
        if ('Accelerometer' in window) capabilities.accelerometer = true;
        if ('Gyroscope' in window) capabilities.gyroscope = true;
        
        capabilities.supported = capabilities.camera && 
                                 (capabilities.deviceOrientation || capabilities.deviceMotion);
        
        return capabilities;
    }

    /**
     * Request necessary permissions (iOS 13+ requires explicit permission)
     * @returns {Promise<Object>} Permission status
     */
    async function requestPermissions() {
        const permissions = {
            camera: false,
            orientation: false,
            motion: false
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
            // Permission not required on this device
            permissions.orientation = true;
            state.hasOrientationPermission = true;
        }
        
        // Request motion permission (iOS 13+)
        if (typeof DeviceMotionEvent !== 'undefined' && 
            typeof DeviceMotionEvent.requestPermission === 'function') {
            try {
                const response = await DeviceMotionEvent.requestPermission();
                permissions.motion = response === 'granted';
                state.hasMotionPermission = permissions.motion;
            } catch (e) {
                console.warn('Motion permission denied:', e);
            }
        } else {
            permissions.motion = true;
            state.hasMotionPermission = true;
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
                facingMode: 'environment',  // Rear camera
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

    // ==================== SENSOR HANDLING ====================

    /**
     * Handle device orientation event
     * @param {DeviceOrientationEvent} event
     */
    function handleOrientation(event) {
        if (!state.isActive) return;
        
        // Beta: front-to-back tilt (pitch) -180 to 180
        // Gamma: left-to-right tilt (roll) -90 to 90
        // Alpha: compass direction 0 to 360
        
        let pitch = event.beta || 0;
        let roll = event.gamma || 0;
        
        // Normalize pitch to altitude angle
        // When phone is held vertically (screen facing user): beta ≈ 90°
        // When phone points at horizon: beta ≈ 90°, altitude = 0°
        // When phone points straight up: beta ≈ 0°, altitude = 90°
        // When phone points down: beta ≈ 180° or -180°, altitude = -90°
        
        // Convert beta to altitude (angle above horizon)
        // Assume phone is held with screen facing user
        let altitude = 90 - pitch;
        
        // Handle device orientation quirks
        if (altitude > 90) altitude = 180 - altitude;
        if (altitude < -90) altitude = -180 - altitude;
        
        // Apply calibration offset
        altitude -= state.horizonOffset;
        
        // Add to history for smoothing
        state.pitchHistory.push(altitude);
        state.rollHistory.push(roll);
        
        // Keep history limited
        if (state.pitchHistory.length > state.smoothingWindow) {
            state.pitchHistory.shift();
        }
        if (state.rollHistory.length > state.smoothingWindow) {
            state.rollHistory.shift();
        }
        
        // Calculate smoothed values
        state.currentPitch = state.pitchHistory.reduce((a, b) => a + b, 0) / state.pitchHistory.length;
        state.currentRoll = state.rollHistory.reduce((a, b) => a + b, 0) / state.rollHistory.length;
        
        // Notify callback
        if (state.onAltitudeUpdate) {
            state.onAltitudeUpdate({
                altitude: state.currentPitch,
                roll: state.currentRoll,
                raw: { beta: event.beta, gamma: event.gamma, alpha: event.alpha }
            });
        }
    }

    /**
     * Handle device motion event (accelerometer)
     * @param {DeviceMotionEvent} event
     */
    function handleMotion(event) {
        if (!state.isActive) return;
        
        const acc = event.accelerationIncludingGravity;
        if (acc) {
            state.gravityVector = {
                x: acc.x || 0,
                y: acc.y || 0,
                z: acc.z || 0
            };
        }
    }

    /**
     * Start sensor listening
     */
    function startSensors() {
        window.addEventListener('deviceorientation', handleOrientation, true);
        window.addEventListener('devicemotion', handleMotion, true);
    }

    /**
     * Stop sensor listening
     */
    function stopSensors() {
        window.removeEventListener('deviceorientation', handleOrientation, true);
        window.removeEventListener('devicemotion', handleMotion, true);
    }

    // ==================== CALIBRATION ====================

    /**
     * Calibrate horizon
     * Point device at known horizon and call this function
     */
    function calibrateHorizon() {
        // Current reading should be 0° at horizon
        state.horizonOffset = state.currentPitch;
        state.isCalibrated = true;
        
        return {
            offset: state.horizonOffset,
            message: `Horizon calibrated. Offset: ${state.horizonOffset.toFixed(2)}°`
        };
    }

    /**
     * Reset calibration
     */
    function resetCalibration() {
        state.horizonOffset = 0;
        state.isCalibrated = false;
    }

    /**
     * Calibrate using a known altitude
     * @param {number} knownAltitude - Known altitude of target in degrees
     */
    function calibrateToKnownAltitude(knownAltitude) {
        const difference = knownAltitude - state.currentPitch;
        state.horizonOffset -= difference;
        state.isCalibrated = true;
        
        return {
            offset: state.horizonOffset,
            message: `Calibrated to known altitude ${knownAltitude}°. Offset: ${state.horizonOffset.toFixed(2)}°`
        };
    }

    // ==================== MEASUREMENT ====================

    /**
     * Capture current altitude measurement
     * @returns {Object} Captured measurement data
     */
    function captureAltitude() {
        const now = new Date();
        
        // Estimate accuracy based on conditions
        const rollStability = Math.abs(state.currentRoll);
        const historyVariance = calculateVariance(state.pitchHistory);
        
        let accuracy = ACCURACY_ESTIMATES.normal;
        if (state.isCalibrated && rollStability < 5 && historyVariance < 0.5) {
            accuracy = ACCURACY_ESTIMATES.ideal;
        } else if (rollStability > 15 || historyVariance > 2) {
            accuracy = ACCURACY_ESTIMATES.poor;
        } else if (rollStability > 30 || historyVariance > 5) {
            accuracy = ACCURACY_ESTIMATES.veryPoor;
        }
        
        const measurement = {
            altitude: state.currentPitch,
            altitudeDegrees: Math.floor(state.currentPitch),
            altitudeMinutes: (state.currentPitch % 1) * 60,
            roll: state.currentRoll,
            time: now,
            utc: now.toISOString(),
            calibrated: state.isCalibrated,
            estimatedAccuracy: accuracy,
            stability: {
                rollDeviation: rollStability,
                pitchVariance: historyVariance
            },
            gravityVector: { ...state.gravityVector }
        };
        
        state.capturedAltitude = measurement.altitude;
        state.capturedTime = now;
        state.measurementHistory.push(measurement);
        
        // Keep history limited
        if (state.measurementHistory.length > 100) {
            state.measurementHistory.shift();
        }
        
        // Notify callback
        if (state.onCapture) {
            state.onCapture(measurement);
        }
        
        return measurement;
    }

    /**
     * Calculate variance of an array
     */
    function calculateVariance(arr) {
        if (arr.length < 2) return 0;
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        return arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length;
    }

    /**
     * Get averaged measurement from multiple captures
     * @param {number} numSamples - Number of samples to average
     * @returns {Object} Averaged measurement
     */
    function getAveragedMeasurement(numSamples = 5) {
        if (state.measurementHistory.length < numSamples) {
            numSamples = state.measurementHistory.length;
        }
        
        if (numSamples === 0) {
            return { error: 'No measurements available' };
        }
        
        const recent = state.measurementHistory.slice(-numSamples);
        const avgAlt = recent.reduce((sum, m) => sum + m.altitude, 0) / numSamples;
        const avgAccuracy = recent.reduce((sum, m) => sum + m.estimatedAccuracy, 0) / numSamples;
        
        // Time is average of measurements
        const avgTime = new Date(
            recent.reduce((sum, m) => sum + m.time.getTime(), 0) / numSamples
        );
        
        return {
            altitude: avgAlt,
            altitudeDegrees: Math.floor(avgAlt),
            altitudeMinutes: (avgAlt % 1) * 60,
            time: avgTime,
            utc: avgTime.toISOString(),
            sampleCount: numSamples,
            estimatedAccuracy: avgAccuracy / Math.sqrt(numSamples),  // Accuracy improves with averaging
            calibrated: state.isCalibrated
        };
    }

    // ==================== SESSION MANAGEMENT ====================

    /**
     * Start camera sextant session
     * @param {HTMLVideoElement} videoElement - Video element for camera
     * @param {Object} options - Configuration options
     */
    async function startSession(videoElement, options = {}) {
        if (state.isActive) {
            return { error: 'Session already active' };
        }
        
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
        if (!permissions.orientation && !permissions.motion) {
            return { error: 'Sensor permission denied' };
        }
        
        // Start camera
        try {
            await startCamera(videoElement);
        } catch (e) {
            return { error: `Camera failed: ${e.message}` };
        }
        
        // Start sensors
        startSensors();
        
        // Set callbacks
        if (options.onAltitudeUpdate) state.onAltitudeUpdate = options.onAltitudeUpdate;
        if (options.onCapture) state.onCapture = options.onCapture;
        if (options.onError) state.onError = options.onError;
        
        // Clear history
        state.pitchHistory = [];
        state.rollHistory = [];
        state.measurementHistory = [];
        
        state.isActive = true;
        
        return {
            success: true,
            capabilities: caps,
            permissions: permissions
        };
    }

    /**
     * Stop camera sextant session
     */
    function stopSession() {
        stopCamera();
        stopSensors();
        
        state.isActive = false;
        state.onAltitudeUpdate = null;
        state.onCapture = null;
        state.onError = null;
    }

    /**
     * Get current session state
     */
    function getState() {
        return {
            isActive: state.isActive,
            isCalibrated: state.isCalibrated,
            currentAltitude: state.currentPitch,
            currentRoll: state.currentRoll,
            horizonOffset: state.horizonOffset,
            capturedAltitude: state.capturedAltitude,
            capturedTime: state.capturedTime,
            measurementCount: state.measurementHistory.length,
            hasCameraPermission: state.hasCameraPermission,
            hasOrientationPermission: state.hasOrientationPermission,
            hasMotionPermission: state.hasMotionPermission
        };
    }

    // ==================== UI HELPERS ====================

    /**
     * Render camera sextant overlay HTML
     * @param {Object} options - Display options
     * @returns {string} HTML string
     */
    function renderOverlay(options = {}) {
        const { 
            showCrosshairs = true, 
            showLevel = true, 
            showAltitude = true,
            showInstructions = true 
        } = options;
        
        return `
            <div id="camera-sextant-overlay" style="position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none">
                ${showCrosshairs ? `
                    <!-- Crosshairs -->
                    <div style="position:absolute;top:50%;left:0;right:0;height:2px;background:rgba(255,0,0,0.7);transform:translateY(-50%)"></div>
                    <div style="position:absolute;left:50%;top:0;bottom:0;width:2px;background:rgba(255,0,0,0.7);transform:translateX(-50%)"></div>
                    <!-- Center circle -->
                    <div style="position:absolute;top:50%;left:50%;width:40px;height:40px;border:2px solid rgba(255,0,0,0.7);border-radius:50%;transform:translate(-50%,-50%)"></div>
                ` : ''}
                
                ${showLevel ? `
                    <!-- Level indicator (roll) -->
                    <div id="camera-sextant-level" style="position:absolute;bottom:100px;left:50%;transform:translateX(-50%);width:200px;height:30px;background:rgba(0,0,0,0.5);border-radius:15px;overflow:hidden">
                        <div style="position:absolute;top:50%;left:50%;width:2px;height:100%;background:rgba(255,255,255,0.5);transform:translateX(-50%)"></div>
                        <div id="camera-sextant-bubble" style="position:absolute;top:50%;left:50%;width:20px;height:20px;background:lime;border-radius:50%;transform:translate(-50%,-50%);transition:left 0.1s"></div>
                    </div>
                ` : ''}
                
                ${showAltitude ? `
                    <!-- Altitude display -->
                    <div id="camera-sextant-altitude" style="position:absolute;top:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.7);padding:10px 20px;border-radius:8px;text-align:center">
                        <div style="font-size:10px;color:rgba(255,255,255,0.6);text-transform:uppercase">Altitude</div>
                        <div id="camera-sextant-alt-value" style="font-size:24px;font-weight:bold;color:white;font-family:monospace">--° --'</div>
                        <div id="camera-sextant-accuracy" style="font-size:10px;color:rgba(255,255,255,0.5)">Point at horizon to calibrate</div>
                    </div>
                ` : ''}
                
                ${showInstructions ? `
                    <!-- Instructions -->
                    <div id="camera-sextant-instructions" style="position:absolute;bottom:20px;left:20px;right:20px;background:rgba(0,0,0,0.7);padding:10px;border-radius:8px;text-align:center;font-size:11px;color:rgba(255,255,255,0.8)">
                        1. Hold phone vertically • 2. Point at celestial body • 3. Level the bubble • 4. Tap Capture
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Update overlay display
     * @param {Object} data - Current measurement data
     */
    function updateOverlayDisplay(data) {
        // Update altitude display
        const altValue = document.getElementById('camera-sextant-alt-value');
        if (altValue && data.altitude !== undefined) {
            const deg = Math.floor(Math.abs(data.altitude));
            const min = ((Math.abs(data.altitude) % 1) * 60).toFixed(1);
            const sign = data.altitude < 0 ? '-' : '';
            altValue.textContent = `${sign}${deg}° ${min}'`;
        }
        
        // Update accuracy indicator
        const accuracy = document.getElementById('camera-sextant-accuracy');
        if (accuracy) {
            if (state.isCalibrated) {
                accuracy.textContent = `Est. accuracy: ±${ACCURACY_ESTIMATES.normal.toFixed(1)}°`;
                accuracy.style.color = 'rgba(100,255,100,0.8)';
            } else {
                accuracy.textContent = 'Point at horizon to calibrate';
                accuracy.style.color = 'rgba(255,200,100,0.8)';
            }
        }
        
        // Update level bubble
        const bubble = document.getElementById('camera-sextant-bubble');
        if (bubble && data.roll !== undefined) {
            // Clamp roll to reasonable range
            const clampedRoll = Math.max(-45, Math.min(45, data.roll));
            const bubblePos = 50 + (clampedRoll / 45) * 40;  // Map to 10-90%
            bubble.style.left = `${bubblePos}%`;
            
            // Color based on level
            if (Math.abs(data.roll) < 2) {
                bubble.style.background = 'lime';
            } else if (Math.abs(data.roll) < 5) {
                bubble.style.background = 'yellow';
            } else {
                bubble.style.background = 'orange';
            }
        }
    }

    /**
     * Render camera sextant widget for panel integration
     * @returns {string} HTML string
     */
    function renderWidget() {
        const caps = checkCapabilities();
        const currentState = getState();
        
        if (!caps.supported) {
            return `
                <div style="background:rgba(239,68,68,0.1);border-radius:10px;padding:12px;text-align:center">
                    <div style="font-size:14px;font-weight:600;color:#ef4444;margin-bottom:8px">📷 Camera Sextant Unavailable</div>
                    <div style="font-size:11px;color:rgba(255,255,255,0.6)">
                        This device doesn't support required features:
                        <br>Camera: ${caps.camera ? '✓' : '✗'} | 
                        Orientation: ${caps.deviceOrientation ? '✓' : '✗'} | 
                        Motion: ${caps.deviceMotion ? '✓' : '✗'}
                    </div>
                </div>
            `;
        }
        
        return `
            <div style="background:var(--color-bg-elevated);border-radius:10px;padding:12px;margin-bottom:12px">
                <div style="font-size:14px;font-weight:600;margin-bottom:12px">📷 Camera Sextant</div>
                
                <div style="font-size:11px;color:rgba(255,255,255,0.6);margin-bottom:12px">
                    Point your phone at a celestial body to measure its altitude above the horizon.
                    Accuracy: ~1-2° (emergency use)
                </div>
                
                <div id="camera-sextant-container" style="position:relative;width:100%;aspect-ratio:4/3;background:#000;border-radius:8px;overflow:hidden;margin-bottom:12px;display:none">
                    <video id="camera-sextant-video" style="width:100%;height:100%;object-fit:cover" playsinline autoplay muted></video>
                    <div id="camera-sextant-overlay-container"></div>
                </div>
                
                <div id="camera-sextant-controls">
                    <button id="camera-sextant-start" class="btn btn--primary btn--full" style="padding:10px;margin-bottom:8px">
                        📷 Start Camera Sextant
                    </button>
                    
                    <div id="camera-sextant-active-controls" style="display:none">
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
                            <button id="camera-sextant-calibrate" class="btn btn--secondary" style="padding:8px;font-size:11px">
                                🎯 Calibrate Horizon
                            </button>
                            <button id="camera-sextant-capture" class="btn btn--primary" style="padding:8px;font-size:11px">
                                📸 Capture Altitude
                            </button>
                        </div>
                        <button id="camera-sextant-stop" class="btn btn--secondary btn--full" style="padding:8px;font-size:11px">
                            ✕ Close Camera
                        </button>
                    </div>
                </div>
                
                <div id="camera-sextant-result" style="display:none;margin-top:12px">
                    <div style="background:rgba(59,130,246,0.1);border-radius:8px;padding:12px">
                        <div style="font-size:12px;color:#3b82f6;font-weight:600;margin-bottom:4px">📐 Captured Altitude</div>
                        <div id="camera-sextant-result-value" style="font-size:18px;font-weight:700;font-family:monospace">--° --'</div>
                        <div id="camera-sextant-result-accuracy" style="font-size:10px;color:rgba(255,255,255,0.5);margin-top:4px"></div>
                        <button id="camera-sextant-use" class="btn btn--primary btn--full" style="padding:8px;margin-top:8px;font-size:11px">
                            Use This Measurement
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Format altitude as degrees and minutes
     * @param {number} altitude - Altitude in decimal degrees
     * @returns {string} Formatted string
     */
    function formatAltitude(altitude) {
        const sign = altitude < 0 ? '-' : '';
        const absAlt = Math.abs(altitude);
        const deg = Math.floor(absAlt);
        const min = ((absAlt % 1) * 60).toFixed(1);
        return `${sign}${deg}° ${min}'`;
    }

    // ==================== PUBLIC API ====================
    
    return {
        // Initialization
        checkCapabilities,
        requestPermissions,
        
        // Session management
        startSession,
        stopSession,
        getState,
        
        // Camera
        startCamera,
        stopCamera,
        
        // Calibration
        calibrateHorizon,
        calibrateToKnownAltitude,
        resetCalibration,
        
        // Measurement
        captureAltitude,
        getAveragedMeasurement,
        
        // UI
        renderWidget,
        renderOverlay,
        updateOverlayDisplay,
        formatAltitude,
        
        // Constants
        ACCURACY_ESTIMATES
    };
})();

window.CameraSextantModule = CameraSextantModule;

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CameraSextantModule;
}
