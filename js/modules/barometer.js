/**
 * GridDown Barometric Altimeter Module
 * Uses device barometer for altitude estimation and weather trend analysis
 * 
 * Requires: Generic Sensor API (Chrome on Android)
 * Samsung Tab Active series: Full support
 * iOS Safari: NOT SUPPORTED (API not exposed)
 */
const BarometerModule = (function() {
    'use strict';

    // ==================== CONSTANTS ====================
    
    // Standard atmosphere constants
    const SEA_LEVEL_PRESSURE_HPA = 1013.25;  // Standard sea level pressure
    const PRESSURE_ALTITUDE_CONSTANT = 44330; // meters
    const PRESSURE_EXPONENT = 0.1903;
    
    // History settings
    const HISTORY_INTERVAL_MS = 60 * 1000;    // Record every 1 minute
    const HISTORY_MAX_POINTS = 360;            // 6 hours of history
    const TREND_WINDOW_MS = 3 * 60 * 60 * 1000; // 3 hours for trend calculation
    
    // Weather thresholds (hPa per hour)
    const WEATHER_THRESHOLDS = {
        rapidFall: -2.0,      // Storm approaching
        slowFall: -0.5,       // Weather deteriorating
        steady: 0.5,          // Stable (±0.5)
        slowRise: 0.5,        // Weather improving
        rapidRise: 2.0        // High pressure building
    };

    // ==================== STATE ====================
    
    let sensor = null;
    let isSupported = false;
    let isActive = false;
    let error = null;
    
    // Current readings
    let currentPressure = null;       // hPa
    let currentAltitude = null;       // meters
    let lastUpdate = null;
    
    // Calibration
    let calibrationOffset = 0;        // meters (added to calculated altitude)
    let referencePressure = SEA_LEVEL_PRESSURE_HPA;  // hPa (adjustable)
    
    // History for trend analysis
    let pressureHistory = [];         // [{timestamp, pressure}]
    let historyInterval = null;
    
    // Subscribers for updates
    let subscribers = [];

    // ==================== CORE FUNCTIONS ====================
    
    /**
     * Check if barometer is supported
     */
    function checkSupport() {
        if (typeof Barometer === 'undefined') {
            isSupported = false;
            error = 'Barometer API not available (requires Android Chrome)';
            return false;
        }
        isSupported = true;
        return true;
    }
    
    /**
     * Initialize the barometer sensor
     */
    async function init() {
        console.log('BarometerModule initializing...');
        
        // Check API support
        if (!checkSupport()) {
            console.warn('Barometer not supported:', error);
            loadFromStorage();
            return false;
        }
        
        // Load saved calibration and history
        loadFromStorage();
        
        console.log('BarometerModule initialized (sensor available)');
        return true;
    }
    
    /**
     * Start barometer readings
     */
    async function start() {
        // Check browser compatibility first with visual warning
        if (typeof CompatibilityModule !== 'undefined' && !isSupported) {
            CompatibilityModule.requireFeature('barometer', true);
            return false;
        }
        
        if (!isSupported) {
            error = 'Barometer not supported on this device';
            notifySubscribers('error', error);
            return false;
        }
        
        if (isActive) {
            return true; // Already running
        }
        
        try {
            // Request permission if needed (some browsers require this)
            if (navigator.permissions) {
                try {
                    const result = await navigator.permissions.query({ name: 'accelerometer' });
                    // Barometer often grouped with motion sensors
                } catch (e) {
                    // Permission query not supported for this sensor, continue anyway
                }
            }
            
            // Create sensor with 1Hz frequency
            sensor = new Barometer({ frequency: 1 });
            
            sensor.addEventListener('reading', handleReading);
            sensor.addEventListener('error', handleError);
            
            sensor.start();
            isActive = true;
            error = null;
            
            // Start history recording
            startHistoryRecording();
            
            notifySubscribers('start', null);
            console.log('Barometer started');
            
            return true;
        } catch (e) {
            error = e.message || 'Failed to start barometer';
            isActive = false;
            notifySubscribers('error', error);
            console.error('Barometer start failed:', e);
            return false;
        }
    }
    
    /**
     * Stop barometer readings
     */
    function stop() {
        if (sensor) {
            try {
                sensor.stop();
                sensor.removeEventListener('reading', handleReading);
                sensor.removeEventListener('error', handleError);
            } catch (e) {
                console.warn('Error stopping barometer:', e);
            }
            sensor = null;
        }
        
        isActive = false;
        stopHistoryRecording();
        notifySubscribers('stop', null);
        console.log('Barometer stopped');
    }
    
    /**
     * Handle barometer reading
     */
    function handleReading() {
        if (!sensor) return;
        
        // Sensor returns pressure in Pascals, convert to hPa
        const pressurePa = sensor.pressure;
        currentPressure = pressurePa / 100;  // Pa to hPa
        lastUpdate = Date.now();
        
        // Calculate altitude using barometric formula
        currentAltitude = calculateAltitude(currentPressure) + calibrationOffset;
        
        notifySubscribers('reading', {
            pressure: currentPressure,
            altitude: currentAltitude,
            timestamp: lastUpdate
        });
    }
    
    /**
     * Handle sensor error
     */
    function handleError(event) {
        error = event.error.message || 'Barometer error';
        notifySubscribers('error', error);
        console.error('Barometer error:', event.error);
    }
    
    /**
     * Calculate altitude from pressure using barometric formula
     * @param {number} pressure - Pressure in hPa
     * @returns {number} Altitude in meters
     */
    function calculateAltitude(pressure) {
        // Hypsometric formula
        // h = 44330 * (1 - (P/P0)^0.1903)
        return PRESSURE_ALTITUDE_CONSTANT * (1 - Math.pow(pressure / referencePressure, PRESSURE_EXPONENT));
    }
    
    /**
     * Calculate pressure from altitude (inverse formula)
     * @param {number} altitude - Altitude in meters
     * @returns {number} Pressure in hPa
     */
    function calculatePressure(altitude) {
        // P = P0 * (1 - h/44330)^(1/0.1903)
        return referencePressure * Math.pow(1 - altitude / PRESSURE_ALTITUDE_CONSTANT, 1 / PRESSURE_EXPONENT);
    }

    // ==================== CALIBRATION ====================
    
    /**
     * Calibrate altitude to a known elevation
     * @param {number} knownAltitude - Known altitude in meters
     */
    function calibrateToAltitude(knownAltitude) {
        if (currentPressure === null) {
            error = 'No pressure reading available for calibration';
            return false;
        }
        
        // Calculate what altitude the current pressure gives us
        const uncalibratedAltitude = calculateAltitude(currentPressure);
        
        // Set offset to make current reading match known altitude
        calibrationOffset = knownAltitude - uncalibratedAltitude;
        
        // Update current altitude with new calibration
        currentAltitude = knownAltitude;
        
        saveToStorage();
        notifySubscribers('calibrate', { knownAltitude, offset: calibrationOffset });
        
        console.log(`Calibrated: offset=${calibrationOffset.toFixed(1)}m to match ${knownAltitude}m`);
        return true;
    }
    
    /**
     * Calibrate using GPS altitude
     * @param {number} gpsAltitude - GPS-reported altitude in meters
     */
    function calibrateToGPS(gpsAltitude) {
        return calibrateToAltitude(gpsAltitude);
    }
    
    /**
     * Set sea-level reference pressure (QNH)
     * @param {number} pressure - Sea-level pressure in hPa
     */
    function setReferencePressure(pressure) {
        referencePressure = pressure;
        
        // Recalculate altitude with new reference
        if (currentPressure !== null) {
            currentAltitude = calculateAltitude(currentPressure) + calibrationOffset;
        }
        
        saveToStorage();
        notifySubscribers('reference', { pressure: referencePressure });
    }
    
    /**
     * Reset calibration to defaults
     */
    function resetCalibration() {
        calibrationOffset = 0;
        referencePressure = SEA_LEVEL_PRESSURE_HPA;
        
        if (currentPressure !== null) {
            currentAltitude = calculateAltitude(currentPressure);
        }
        
        saveToStorage();
        notifySubscribers('calibrate', { reset: true });
    }

    // ==================== HISTORY & TRENDS ====================
    
    /**
     * Start recording pressure history
     */
    function startHistoryRecording() {
        if (historyInterval) return;
        
        // Record immediately
        recordHistoryPoint();
        
        // Then record periodically
        historyInterval = setInterval(recordHistoryPoint, HISTORY_INTERVAL_MS);
    }
    
    /**
     * Stop recording pressure history
     */
    function stopHistoryRecording() {
        if (historyInterval) {
            clearInterval(historyInterval);
            historyInterval = null;
        }
    }
    
    /**
     * Record current pressure to history
     */
    function recordHistoryPoint() {
        if (currentPressure === null) return;
        
        pressureHistory.push({
            timestamp: Date.now(),
            pressure: currentPressure
        });
        
        // Trim old entries
        const cutoff = Date.now() - (HISTORY_MAX_POINTS * HISTORY_INTERVAL_MS);
        pressureHistory = pressureHistory.filter(p => p.timestamp > cutoff);
        
        saveToStorage();
    }
    
    /**
     * Calculate pressure trend
     * @returns {Object} {ratePerHour, trend, description, icon, color}
     */
    function getTrend() {
        if (pressureHistory.length < 2) {
            return {
                ratePerHour: 0,
                trend: 'unknown',
                description: 'Insufficient data',
                icon: '❓',
                color: '#6b7280'
            };
        }
        
        const now = Date.now();
        const windowStart = now - TREND_WINDOW_MS;
        
        // Get points within trend window
        const recentPoints = pressureHistory.filter(p => p.timestamp > windowStart);
        
        if (recentPoints.length < 2) {
            return {
                ratePerHour: 0,
                trend: 'unknown',
                description: 'Insufficient recent data',
                icon: '❓',
                color: '#6b7280'
            };
        }
        
        // Calculate rate of change using linear regression
        const firstPoint = recentPoints[0];
        const lastPoint = recentPoints[recentPoints.length - 1];
        
        const timeDiffHours = (lastPoint.timestamp - firstPoint.timestamp) / (1000 * 60 * 60);
        const pressureDiff = lastPoint.pressure - firstPoint.pressure;
        
        const ratePerHour = timeDiffHours > 0 ? pressureDiff / timeDiffHours : 0;
        
        // Classify trend
        let trend, description, icon, color;
        
        if (ratePerHour <= WEATHER_THRESHOLDS.rapidFall) {
            trend = 'rapid_fall';
            description = 'Storm approaching';
            icon = '⛈️';
            color = '#ef4444';
        } else if (ratePerHour <= WEATHER_THRESHOLDS.slowFall) {
            trend = 'falling';
            description = 'Weather deteriorating';
            icon = '🌧️';
            color = '#f59e0b';
        } else if (ratePerHour >= WEATHER_THRESHOLDS.rapidRise) {
            trend = 'rapid_rise';
            description = 'High pressure building';
            icon = '☀️';
            color = '#22c55e';
        } else if (ratePerHour >= WEATHER_THRESHOLDS.slowRise) {
            trend = 'rising';
            description = 'Weather improving';
            icon = '🌤️';
            color = '#3b82f6';
        } else {
            trend = 'steady';
            description = 'Stable conditions';
            icon = '➡️';
            color = '#6b7280';
        }
        
        return {
            ratePerHour: Math.round(ratePerHour * 100) / 100,
            trend,
            description,
            icon,
            color
        };
    }
    
    /**
     * Get pressure history for charting
     * @param {number} hours - Number of hours of history to return
     * @returns {Array} [{timestamp, pressure}]
     */
    function getHistory(hours = 6) {
        const cutoff = Date.now() - (hours * 60 * 60 * 1000);
        return pressureHistory.filter(p => p.timestamp > cutoff);
    }

    // ==================== STORAGE ====================
    
    function saveToStorage() {
        try {
            const data = {
                calibrationOffset,
                referencePressure,
                pressureHistory: pressureHistory.slice(-HISTORY_MAX_POINTS)
            };
            localStorage.setItem('griddown_barometer', JSON.stringify(data));
        } catch (e) {
            console.warn('Failed to save barometer data:', e);
        }
    }
    
    function loadFromStorage() {
        try {
            const stored = localStorage.getItem('griddown_barometer');
            if (stored) {
                const data = JSON.parse(stored);
                calibrationOffset = data.calibrationOffset || 0;
                referencePressure = data.referencePressure || SEA_LEVEL_PRESSURE_HPA;
                pressureHistory = data.pressureHistory || [];
                
                // Clean old history
                const cutoff = Date.now() - (HISTORY_MAX_POINTS * HISTORY_INTERVAL_MS);
                pressureHistory = pressureHistory.filter(p => p.timestamp > cutoff);
            }
        } catch (e) {
            console.warn('Failed to load barometer data:', e);
        }
    }

    // ==================== RENDERING ====================
    
    /**
     * Render the barometer panel section
     * @returns {string} HTML
     */
    function renderPanel() {
        const trend = getTrend();
        const altitudeFt = currentAltitude !== null ? Math.round(currentAltitude * 3.28084) : null;
        const altitudeM = currentAltitude !== null ? Math.round(currentAltitude) : null;
        
        if (!isSupported) {
            return `
                <div style="padding:16px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.2);border-radius:10px;text-align:center">
                    <div style="font-size:20px;margin-bottom:8px">📵</div>
                    <div style="font-weight:500;color:#f59e0b">Barometer Not Available</div>
                    <div style="font-size:11px;opacity:0.7;margin-top:4px">
                        Requires Android device with Chrome browser
                    </div>
                </div>
            `;
        }
        
        if (!isActive) {
            return `
                <div style="padding:16px;background:var(--color-bg-elevated);border-radius:10px;text-align:center">
                    <div style="font-size:24px;margin-bottom:8px">📊</div>
                    <div style="margin-bottom:12px">Barometric altimeter ready</div>
                    <button class="btn btn--primary" id="baro-start">
                        Start Barometer
                    </button>
                </div>
            `;
        }
        
        if (error) {
            return `
                <div style="padding:16px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:10px">
                    <div style="color:#ef4444;font-weight:500;margin-bottom:4px">⚠️ Barometer Error</div>
                    <div style="font-size:12px;opacity:0.7">${error}</div>
                    <button class="btn btn--secondary btn--small" id="baro-retry" style="margin-top:12px">
                        Retry
                    </button>
                </div>
            `;
        }
        
        return `
            <!-- Current Reading -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
                <div style="padding:14px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);border-radius:10px;text-align:center">
                    <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-bottom:4px">ALTITUDE</div>
                    <div style="font-size:24px;font-weight:700;color:#3b82f6">${altitudeFt !== null ? altitudeFt.toLocaleString() : '--'}</div>
                    <div style="font-size:11px;opacity:0.6">feet (${altitudeM !== null ? altitudeM.toLocaleString() + 'm' : '--'})</div>
                </div>
                <div style="padding:14px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:10px;text-align:center">
                    <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-bottom:4px">PRESSURE</div>
                    <div style="font-size:24px;font-weight:700;color:#22c55e">${currentPressure !== null ? currentPressure.toFixed(1) : '--'}</div>
                    <div style="font-size:11px;opacity:0.6">hPa (mbar)</div>
                </div>
            </div>
            
            <!-- Weather Trend -->
            <div style="padding:14px;background:${trend.color}15;border:1px solid ${trend.color}40;border-radius:10px;margin-bottom:16px">
                <div style="display:flex;align-items:center;gap:12px">
                    <div style="font-size:32px">${trend.icon}</div>
                    <div style="flex:1">
                        <div style="font-weight:600;color:${trend.color}">${trend.description}</div>
                        <div style="font-size:11px;opacity:0.7">
                            ${trend.ratePerHour > 0 ? '+' : ''}${trend.ratePerHour.toFixed(2)} hPa/hr
                        </div>
                    </div>
                    <div style="text-align:right;font-size:11px;opacity:0.6">
                        ${pressureHistory.length} readings<br>
                        ${getHistoryDuration()}
                    </div>
                </div>
            </div>
            
            <!-- Pressure History Chart -->
            <div style="margin-bottom:16px">
                <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:8px">PRESSURE TREND (6 HOURS)</div>
                <div id="baro-chart" style="height:80px;background:var(--color-bg-elevated);border-radius:8px;overflow:hidden">
                    ${renderMiniChart()}
                </div>
            </div>
            
            <!-- Calibration -->
            <div style="padding:12px;background:var(--color-bg-elevated);border-radius:10px;margin-bottom:12px">
                <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:8px">CALIBRATION</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                    <button class="btn btn--secondary btn--small" id="baro-cal-gps" title="Calibrate to GPS altitude">
                        📍 Sync to GPS
                    </button>
                    <button class="btn btn--secondary btn--small" id="baro-cal-manual" title="Enter known altitude">
                        ✏️ Set Altitude
                    </button>
                    <button class="btn btn--secondary btn--small" id="baro-cal-reset" title="Reset calibration">
                        🔄 Reset
                    </button>
                </div>
                ${calibrationOffset !== 0 ? `
                    <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:8px">
                        Calibration offset: ${calibrationOffset > 0 ? '+' : ''}${calibrationOffset.toFixed(1)}m
                    </div>
                ` : ''}
            </div>
            
            <!-- Stop Button -->
            <button class="btn btn--secondary btn--full" id="baro-stop">
                Stop Barometer
            </button>
            
            <div style="margin-top:12px;font-size:10px;color:rgba(255,255,255,0.3);text-align:center">
                Last update: ${lastUpdate ? new Date(lastUpdate).toLocaleTimeString() : '--'}
            </div>
        `;
    }
    
    /**
     * Render mini pressure chart
     */
    function renderMiniChart() {
        const history = getHistory(6);
        
        if (history.length < 2) {
            return `
                <div style="display:flex;align-items:center;justify-content:center;height:100%;color:rgba(255,255,255,0.4);font-size:11px">
                    Collecting data...
                </div>
            `;
        }
        
        // Find min/max for scaling
        const pressures = history.map(h => h.pressure);
        const minP = Math.min(...pressures) - 1;
        const maxP = Math.max(...pressures) + 1;
        const range = maxP - minP;
        
        // Generate SVG path
        const width = 300;
        const height = 80;
        const padding = 5;
        
        const points = history.map((h, i) => {
            const x = padding + (i / (history.length - 1)) * (width - 2 * padding);
            const y = height - padding - ((h.pressure - minP) / range) * (height - 2 * padding);
            return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(' ');
        
        // Area fill path
        const areaPath = points + ` L${width - padding},${height - padding} L${padding},${height - padding} Z`;
        
        return `
            <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
                <defs>
                    <linearGradient id="pressureGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.3"/>
                        <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.05"/>
                    </linearGradient>
                </defs>
                <path d="${areaPath}" fill="url(#pressureGradient)"/>
                <path d="${points}" fill="none" stroke="#3b82f6" stroke-width="2"/>
            </svg>
        `;
    }
    
    /**
     * Get history duration string
     */
    function getHistoryDuration() {
        if (pressureHistory.length < 2) return 'No history';
        
        const oldest = pressureHistory[0].timestamp;
        const newest = pressureHistory[pressureHistory.length - 1].timestamp;
        const durationMs = newest - oldest;
        
        const hours = Math.floor(durationMs / (1000 * 60 * 60));
        const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
        
        if (hours > 0) {
            return `${hours}h ${minutes}m history`;
        }
        return `${minutes}m history`;
    }
    
    /**
     * Attach event handlers
     */
    function attachHandlers(container) {
        // Start button
        const startBtn = container.querySelector('#baro-start');
        if (startBtn) {
            startBtn.onclick = async () => {
                await start();
                // Re-render will happen via subscriber
            };
        }
        
        // Stop button
        const stopBtn = container.querySelector('#baro-stop');
        if (stopBtn) {
            stopBtn.onclick = () => {
                stop();
            };
        }
        
        // Retry button
        const retryBtn = container.querySelector('#baro-retry');
        if (retryBtn) {
            retryBtn.onclick = async () => {
                error = null;
                await start();
            };
        }
        
        // Calibrate to GPS
        const calGpsBtn = container.querySelector('#baro-cal-gps');
        if (calGpsBtn) {
            calGpsBtn.onclick = () => {
                if (typeof GPSModule !== 'undefined') {
                    const gpsState = GPSModule.getState();
                    if (gpsState.altitude !== null) {
                        calibrateToGPS(gpsState.altitude);
                        if (typeof ModalsModule !== 'undefined') {
                            ModalsModule.showToast(`Calibrated to GPS: ${Math.round(gpsState.altitude)}m`, 'success');
                        }
                    } else {
                        if (typeof ModalsModule !== 'undefined') {
                            ModalsModule.showToast('No GPS altitude available', 'error');
                        }
                    }
                }
            };
        }
        
        // Manual calibration
        const calManualBtn = container.querySelector('#baro-cal-manual');
        if (calManualBtn) {
            calManualBtn.onclick = () => {
                const input = prompt('Enter known altitude in meters:', currentAltitude ? Math.round(currentAltitude).toString() : '0');
                if (input !== null) {
                    const altitude = parseFloat(input);
                    if (!isNaN(altitude)) {
                        calibrateToAltitude(altitude);
                        if (typeof ModalsModule !== 'undefined') {
                            ModalsModule.showToast(`Calibrated to ${altitude}m`, 'success');
                        }
                    }
                }
            };
        }
        
        // Reset calibration
        const calResetBtn = container.querySelector('#baro-cal-reset');
        if (calResetBtn) {
            calResetBtn.onclick = () => {
                resetCalibration();
                if (typeof ModalsModule !== 'undefined') {
                    ModalsModule.showToast('Calibration reset', 'success');
                }
            };
        }
    }

    // ==================== SUBSCRIPTION ====================
    
    function subscribe(callback) {
        subscribers.push(callback);
        return () => {
            subscribers = subscribers.filter(fn => fn !== callback);
        };
    }
    
    function notifySubscribers(event, data) {
        subscribers.forEach(fn => {
            try {
                fn(event, data);
            } catch (e) {
                console.error('Barometer subscriber error:', e);
            }
        });
    }

    // ==================== PUBLIC API ====================
    
    return {
        init,
        start,
        stop,
        
        // Calibration
        calibrateToAltitude,
        calibrateToGPS,
        setReferencePressure,
        resetCalibration,
        
        // Data access
        getCurrentPressure: () => currentPressure,
        getCurrentAltitude: () => currentAltitude,
        getAltitudeFeet: () => currentAltitude !== null ? currentAltitude * 3.28084 : null,
        getTrend,
        getHistory,
        
        // State
        isSupported: () => isSupported,
        isActive: () => isActive,
        getError: () => error,
        getLastUpdate: () => lastUpdate,
        getCalibrationOffset: () => calibrationOffset,
        getReferencePressure: () => referencePressure,
        
        // UI
        renderPanel,
        attachHandlers,
        subscribe
    };
})();

if (typeof window !== 'undefined') {
    window.BarometerModule = BarometerModule;
}
