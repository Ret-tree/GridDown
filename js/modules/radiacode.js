/**
 * GridDown RadiaCode Module - Gamma Spectrometer/Dosimeter Integration
 * Supports Radiacode 101/102/103/110 devices via Web Bluetooth
 * 
 * IMPORTANT: This module includes two modes:
 * 1. REAL MODE - Connects to actual RadiaCode hardware via Web Bluetooth
 * 2. DEMO MODE - Simulates a RadiaCode for testing without hardware
 * 
 * The BLE protocol was reverse-engineered by the community (cdump/radiacode, mkgeiger/RadiaCode).
 * RadiaCode does not publish official API documentation.
 * 
 * Protocol Notes:
 * - RadiaCode uses a custom BLE service (not standard GATT)
 * - Communication uses Nordic UART Service (NUS) pattern
 * - Commands are sent as binary packets with length prefix and checksum
 * - Responses are received via BLE notifications
 * 
 * References:
 * - https://github.com/cdump/radiacode (Python library - MIT)
 * - https://github.com/mkgeiger/RadiaCode (Arduino library - MIT)
 * 
 * @version 2.0.0
 * @license MIT
 */
const RadiaCodeModule = (function() {
    'use strict';

    // ==================== BLE Protocol Constants ====================
    // Actual RadiaCode BLE UUIDs from mkgeiger/RadiaCode Arduino library
    // https://github.com/mkgeiger/RadiaCode (MIT License)
    
    const BLE_CONFIG = {
        // RadiaCode proprietary service and characteristics
        SERVICE_UUID: 'e63215e5-7003-49d8-96b0-b024798fb901',
        TX_CHAR_UUID: 'e63215e6-7003-49d8-96b0-b024798fb901',  // Write to device
        RX_CHAR_UUID: 'e63215e7-7003-49d8-96b0-b024798fb901',  // Receive notifications from device
        
        // BLE MTU chunk size (from mkgeiger implementation)
        CHUNK_SIZE: 18,
        
        // Response timeout in ms
        RESPONSE_TIMEOUT: 30000,
        
        // Device name patterns for scanning
        NAME_PREFIXES: ['RadiaCode', 'RC-', 'RC10']
    };

    // Command codes (from reverse-engineering)
    const CMD = {
        // Data requests
        GET_SERIAL: 0x01,
        GET_FW_VERSION: 0x02,
        GET_STATUS: 0x05,
        GET_DATA_BUF: 0x06,        // Real-time radiation data
        GET_SPECTRUM: 0x07,        // Accumulated spectrum
        GET_SPECTRUM_ACCUM: 0x08,  // Long-term accumulated spectrum
        GET_ENERGY_CALIB: 0x09,    // Energy calibration coefficients
        GET_DOSE: 0x0A,            // Total accumulated dose
        GET_TEMPERATURE: 0x0B,     // Device temperature
        
        // Configuration
        SET_DISPLAY_BRIGHTNESS: 0x10,
        SET_SOUND_ON: 0x11,
        SET_VIBRO_ON: 0x12,
        SET_LANGUAGE: 0x13,
        
        // Resets
        RESET_SPECTRUM: 0x20,
        RESET_DOSE: 0x21,
        
        // Device control
        SET_ALARM_LIMITS: 0x30,
        GET_ALARM_LIMITS: 0x31
    };

    // Response types in data buffer
    const DATA_TYPE = {
        REAL_TIME: 0x00,
        BACKGROUND: 0x01,
        SPECTRUM_DATA: 0x02,
        DOSE_POWER: 0x03,
        GPS: 0x04,
        ALARM: 0x05
    };

    // ==================== Configuration ====================
    
    const CONFIG = {
        pollIntervalMs: 1000,
        readingHistorySize: 1000,
        trackPointInterval: 5000,
        maxStoredReadings: 50000,
        maxTracks: 100,
        
        // Alert thresholds (μSv/h) - ICRP/EPA guidelines
        thresholds: {
            normal: 0.3,      // Typical natural background
            elevated: 0.5,    // Above normal, monitor
            warning: 2.5,     // Investigate source
            alarm: 10.0       // Take protective action
        },
        
        // Count rate thresholds (CPS)
        cpsThresholds: {
            normal: 50,
            elevated: 100,
            warning: 500,
            alarm: 2000
        },
        
        // Demo mode settings
        demo: {
            enabled: false,
            baseDoseRate: 0.12,     // μSv/h typical background
            baseCountRate: 35,      // CPS
            noisePercent: 15,       // Random variation %
            updateIntervalMs: 500
        }
    };

    // Isotope library for spectrum analysis
    const ISOTOPE_LIBRARY = [
        { name: 'K-40', energy: 1460.8, window: 50, halfLife: '1.25 billion years', notes: 'Natural - bananas, salt substitute, granite' },
        { name: 'Cs-137', energy: 661.7, window: 40, halfLife: '30.17 years', notes: 'Fission product - Chernobyl, Fukushima, medical' },
        { name: 'Co-60 (1)', energy: 1173.2, window: 40, halfLife: '5.27 years', notes: 'Industrial radiography, food irradiation' },
        { name: 'Co-60 (2)', energy: 1332.5, window: 40, halfLife: '5.27 years', notes: 'Industrial radiography, food irradiation' },
        { name: 'I-131', energy: 364.5, window: 30, halfLife: '8.02 days', notes: 'Thyroid treatment, nuclear accidents' },
        { name: 'Ra-226', energy: 186.2, window: 25, halfLife: '1600 years', notes: 'Naturally occurring, old luminous paint' },
        { name: 'Th-232', energy: 238.6, window: 30, halfLife: '14 billion years', notes: 'Naturally occurring, welding rods, mantles' },
        { name: 'Am-241', energy: 59.5, window: 15, halfLife: '432 years', notes: 'Smoke detectors' },
        { name: 'Tc-99m', energy: 140.5, window: 20, halfLife: '6.01 hours', notes: 'Medical imaging tracer' },
        { name: 'Bi-214', energy: 609.3, window: 40, halfLife: '19.9 min', notes: 'Radon decay chain' },
        { name: 'Pb-214', energy: 351.9, window: 30, halfLife: '26.8 min', notes: 'Radon decay chain' },
        { name: 'Ba-133', energy: 356.0, window: 30, halfLife: '10.5 years', notes: 'Calibration source' },
        { name: 'Na-22', energy: 511.0, window: 35, halfLife: '2.6 years', notes: 'Positron emitter, calibration' },
        { name: 'Eu-152', energy: 344.3, window: 30, halfLife: '13.5 years', notes: 'Calibration source' },
    ];

    // ==================== State ====================
    
    let state = {
        // Connection
        connected: false,
        connecting: false,
        demoMode: false,
        bleDevice: null,
        bleServer: null,
        txCharacteristic: null,
        rxCharacteristic: null,
        
        // Device info
        deviceInfo: {
            serialNumber: '',
            firmwareVersion: '',
            model: '',
            batteryLevel: null
        },
        
        // Current readings
        currentReading: {
            doseRate: 0,            // μSv/h
            doseRateErr: 0,
            countRate: 0,           // CPS
            countRateErr: 0,
            temperature: 0,         // °C
            totalDose: 0,           // μSv accumulated
            timestamp: null
        },
        
        // Reading history (in memory)
        readingHistory: [],
        
        // Spectrum data (1024 channels)
        spectrum: {
            counts: new Array(1024).fill(0),
            duration: 0,
            calibration: [0, 3.0, 0]  // a0, a1, a2 for E(ch) = a0 + a1*ch + a2*ch²
        },
        
        // Track recording
        isRecording: false,
        currentTrack: null,
        tracks: [],
        
        // Alerts
        currentAlertLevel: 'normal',
        alertHistory: [],
        alertsEnabled: true,
        alertSoundEnabled: true,
        lastAlertTime: 0,
        
        // Persistent dose log
        doseLog: {
            cumulativeDose: 0,      // μSv total across all sessions
            sessions: [],           // { startedAt, endedAt, dose, deviceSerial }
            currentSessionStart: null,
            currentSessionDose: 0,
            lastSaveTime: 0
        },
        
        // Settings
        settings: {
            thresholds: { ...CONFIG.thresholds },
            cpsThresholds: { ...CONFIG.cpsThresholds },
            alertDebounceMs: 5000,
            autoRecordOnConnect: false,
            heatmapEnabled: false
        },
        
        // Receive buffer for BLE packets
        rxBuffer: [],
        expectedResponseSize: 0,  // Expected total response size from device
        pendingCommand: null,
        commandResolver: null,
        commandTimeout: null,
        
        // Statistics
        stats: {
            packetsReceived: 0,
            parseErrors: 0,
            connectionTime: null,
            lastUpdate: null
        }
    };
    
    // Intervals and timers
    let radiacodeEvents = null;
    let pollInterval = null;
    let demoInterval = null;
    let initialized = false;

    // ==================== Initialization ====================

    function init() {
        if (initialized) {
            console.debug('RadiaCode module already initialized');
            return;
        }
        
        if (typeof EventManager !== 'undefined' && EventManager.createScopedManager) {
            radiacodeEvents = EventManager.createScopedManager(EventManager.SCOPES.RADIACODE || 'radiacode');
        }
        
        loadSettings();
        loadTracks();
        loadDoseLog();
        
        initialized = true;
        console.log('RadiaCode module initialized');
        console.log('Web Bluetooth available:', 'bluetooth' in navigator);
    }
    
    function destroy() {
        if (state.connected || state.demoMode) {
            disconnect();
        }
        
        if (radiacodeEvents) {
            radiacodeEvents.clear();
            radiacodeEvents = null;
        }
        
        stopPolling();
        stopDemo();
        
        initialized = false;
        console.log('RadiaCode module destroyed');
    }

    async function loadSettings() {
        try {
            if (typeof Storage !== 'undefined' && Storage.Settings) {
                const settings = await Storage.Settings.get('radiacode_settings');
                if (settings) {
                    state.settings = { ...state.settings, ...settings };
                }
            }
        } catch (e) {
            console.warn('Could not load RadiaCode settings:', e);
        }
    }

    async function saveSettings() {
        try {
            if (typeof Storage !== 'undefined' && Storage.Settings) {
                await Storage.Settings.set('radiacode_settings', state.settings);
            }
        } catch (e) {
            console.warn('Could not save RadiaCode settings:', e);
        }
    }

    async function loadTracks() {
        try {
            if (typeof Storage !== 'undefined' && Storage.Settings) {
                const tracks = await Storage.Settings.get('radiacode_tracks');
                if (tracks && Array.isArray(tracks)) {
                    state.tracks = tracks;
                }
            }
        } catch (e) {
            console.warn('Could not load RadiaCode tracks:', e);
        }
    }

    async function saveTracks() {
        try {
            if (typeof Storage !== 'undefined' && Storage.Settings) {
                const tracksToSave = state.tracks.slice(-CONFIG.maxTracks);
                await Storage.Settings.set('radiacode_tracks', tracksToSave);
            }
        } catch (e) {
            console.warn('Could not save RadiaCode tracks:', e);
        }
    }

    async function loadDoseLog() {
        try {
            if (typeof Storage !== 'undefined' && Storage.Settings) {
                const log = await Storage.Settings.get('radiacode_dose_log');
                if (log) {
                    state.doseLog.cumulativeDose = log.cumulativeDose || 0;
                    state.doseLog.sessions = log.sessions || [];
                }
            }
        } catch (e) {
            console.warn('Could not load RadiaCode dose log:', e);
        }
    }

    async function saveDoseLog() {
        try {
            if (typeof Storage !== 'undefined' && Storage.Settings) {
                await Storage.Settings.set('radiacode_dose_log', {
                    cumulativeDose: state.doseLog.cumulativeDose,
                    sessions: state.doseLog.sessions.slice(-200) // keep last 200 sessions
                });
            }
        } catch (e) {
            console.warn('Could not save RadiaCode dose log:', e);
        }
    }

    function startDoseSession() {
        state.doseLog.currentSessionStart = Date.now();
        state.doseLog.currentSessionDose = 0;
    }

    function endDoseSession() {
        if (!state.doseLog.currentSessionStart) return;
        
        const session = {
            startedAt: state.doseLog.currentSessionStart,
            endedAt: Date.now(),
            dose: state.doseLog.currentSessionDose,
            deviceSerial: state.deviceInfo.serialNumber || 'unknown'
        };
        
        if (session.dose > 0) {
            state.doseLog.sessions.push(session);
        }
        
        state.doseLog.currentSessionStart = null;
        state.doseLog.currentSessionDose = 0;
        saveDoseLog();
    }

    // ==================== Demo Mode ====================

    /**
     * Start demo mode - simulates a RadiaCode device
     * Useful for testing UI without actual hardware
     */
    function startDemo() {
        if (state.connected) {
            disconnect();
        }
        
        state.demoMode = true;
        state.connected = true;
        state.connecting = false;
        state.stats.connectionTime = Date.now();
        
        state.deviceInfo = {
            serialNumber: 'DEMO-001',
            firmwareVersion: 'SIM 1.0',
            model: 'RadiaCode-103 (Demo)',
            batteryLevel: 85
        };
        
        // Generate initial spectrum with some peaks
        generateDemoSpectrum();
        
        // Start generating readings
        demoInterval = setInterval(generateDemoReading, CONFIG.demo.updateIntervalMs);
        
        startDoseSession();
        emitConnectionState();
        
        if (typeof ModalsModule !== 'undefined') {
            ModalsModule.showToast('Demo mode started - simulated readings', 'info');
        }
        
        console.log('RadiaCode: Demo mode started');
    }

    /**
     * Stop demo mode
     */
    function stopDemo() {
        if (demoInterval) {
            clearInterval(demoInterval);
            demoInterval = null;
        }
        endDoseSession();
        state.demoMode = false;
    }

    /**
     * Generate a simulated radiation reading
     */
    function generateDemoReading() {
        if (!state.demoMode) return;
        
        const noise = CONFIG.demo.noisePercent / 100;
        const randomFactor = 1 + (Math.random() - 0.5) * 2 * noise;
        
        // Occasionally simulate elevated readings for testing
        let baseDose = CONFIG.demo.baseDoseRate;
        let baseCPS = CONFIG.demo.baseCountRate;
        
        // 5% chance of elevated reading, 1% chance of warning level
        const rand = Math.random();
        if (rand > 0.99) {
            baseDose *= 10;  // Warning level
            baseCPS *= 8;
        } else if (rand > 0.95) {
            baseDose *= 2;   // Elevated
            baseCPS *= 2;
        }
        
        const reading = {
            doseRate: baseDose * randomFactor,
            doseRateErr: baseDose * 0.1 * randomFactor,
            countRate: baseCPS * randomFactor,
            countRateErr: Math.sqrt(baseCPS) * randomFactor,
            temperature: 25 + (Math.random() - 0.5) * 5,
            totalDose: state.currentReading.totalDose + (baseDose * randomFactor * CONFIG.demo.updateIntervalMs / 3600000),
            timestamp: Date.now()
        };
        
        processReading(reading);
    }

    /**
     * Generate a demo spectrum with common isotope peaks
     */
    function generateDemoSpectrum() {
        const counts = new Array(1024).fill(0);
        
        // Background continuum (decreasing exponential + flat floor)
        for (let i = 0; i < 1024; i++) {
            counts[i] = Math.max(0, Math.floor(800 * Math.exp(-i / 150) + 5 + Math.random() * 3));
        }
        
        // Add realistic gamma peaks (narrower, taller for detection)
        // K-40 at 1461 keV (channel ~487) - natural background potassium
        addPeakToSpectrum(counts, 487, 1200, 8);
        
        // Cs-137 at 662 keV (channel ~221) - most commonly detected
        addPeakToSpectrum(counts, 221, 800, 8);
        
        // Bi-214 at 609 keV (channel ~203) - radon chain
        addPeakToSpectrum(counts, 203, 600, 8);
        
        // Pb-214 at 352 keV (channel ~117) - radon chain
        addPeakToSpectrum(counts, 117, 400, 8);
        
        // Tl-208 at 2615 keV (channel ~872) - thorium chain
        addPeakToSpectrum(counts, 872, 300, 10);
        
        state.spectrum = {
            counts: counts,
            duration: 300,  // 5 minutes
            calibration: [0, 3.0, 0]  // 3 keV per channel
        };
    }

    /**
     * Add a Gaussian peak to spectrum
     */
    function addPeakToSpectrum(counts, centerChannel, height, width) {
        for (let i = Math.max(0, centerChannel - width * 3); i < Math.min(1024, centerChannel + width * 3); i++) {
            const gaussian = height * Math.exp(-0.5 * Math.pow((i - centerChannel) / width, 2));
            counts[i] += Math.floor(gaussian + Math.random() * Math.sqrt(gaussian));
        }
    }

    // ==================== Web Bluetooth Connection ====================

    /**
     * Connect to RadiaCode device via Web Bluetooth
     * Uses proprietary RadiaCode BLE service UUIDs from mkgeiger library
     */
    async function connect() {
        // Check browser compatibility first
        if (typeof CompatibilityModule !== 'undefined') {
            if (!CompatibilityModule.requireFeature('webBluetooth', true)) {
                throw new Error('Web Bluetooth not supported on this browser.');
            }
        }
        
        if (!navigator.bluetooth) {
            throw new Error('Web Bluetooth not supported. Use Chrome, Edge, or Opera.');
        }

        state.connecting = true;
        emitConnectionState();

        try {
            // Request device with name filter
            console.log('RadiaCode: Requesting Bluetooth device...');
            
            const device = await navigator.bluetooth.requestDevice({
                filters: BLE_CONFIG.NAME_PREFIXES.map(prefix => ({ namePrefix: prefix })),
                optionalServices: [BLE_CONFIG.SERVICE_UUID]
            });

            console.log('RadiaCode: Device selected:', device.name);
            state.bleDevice = device;

            // Handle disconnection
            device.addEventListener('gattserverdisconnected', handleDisconnect);

            // Connect to GATT server
            console.log('RadiaCode: Connecting to GATT server...');
            state.bleServer = await device.gatt.connect();

            // Get RadiaCode service
            console.log('RadiaCode: Getting service:', BLE_CONFIG.SERVICE_UUID);
            const service = await state.bleServer.getPrimaryService(BLE_CONFIG.SERVICE_UUID);
            console.log('RadiaCode: Service found');

            // Get write characteristic (for sending commands)
            console.log('RadiaCode: Getting write characteristic:', BLE_CONFIG.TX_CHAR_UUID);
            state.txCharacteristic = await service.getCharacteristic(BLE_CONFIG.TX_CHAR_UUID);
            
            // Get notify characteristic (for receiving responses)
            console.log('RadiaCode: Getting notify characteristic:', BLE_CONFIG.RX_CHAR_UUID);
            state.rxCharacteristic = await service.getCharacteristic(BLE_CONFIG.RX_CHAR_UUID);

            // Subscribe to notifications
            await state.rxCharacteristic.startNotifications();
            state.rxCharacteristic.addEventListener('characteristicvaluechanged', handleNotification);
            console.log('RadiaCode: Notifications enabled');

            // Connection successful
            state.connected = true;
            state.connecting = false;
            state.demoMode = false;
            state.stats.connectionTime = Date.now();

            emitConnectionState();

            // Query device info
            await queryDeviceInfo();
            
            // Start dose tracking session
            startDoseSession();
            
            // Start polling for data
            startPolling();

            if (state.settings.autoRecordOnConnect) {
                startTrack('Auto Track');
            }

            if (typeof ModalsModule !== 'undefined') {
                ModalsModule.showToast(`Connected to ${device.name}`, 'success');
            }

            return true;

        } catch (error) {
            console.error('RadiaCode: Connection failed:', error);
            state.connecting = false;
            state.connected = false;
            emitConnectionState();
            throw error;
        }
    }

    /**
     * Disconnect from device
     */
    function disconnect() {
        if (state.isRecording) {
            stopTrack();
        }
        
        stopPolling();
        endDoseSession();
        stopDemo();
        
        if (state.bleDevice && state.bleDevice.gatt && state.bleDevice.gatt.connected) {
            state.bleDevice.gatt.disconnect();
        }
        
        state.connected = false;
        state.demoMode = false;
        state.bleDevice = null;
        state.bleServer = null;
        state.txCharacteristic = null;
        state.rxCharacteristic = null;
        
        emitConnectionState();
    }

    /**
     * Handle disconnection event
     */
    function handleDisconnect() {
        console.log('RadiaCode: Device disconnected');
        
        stopPolling();
        endDoseSession();
        
        state.connected = false;
        state.bleDevice = null;
        state.bleServer = null;
        state.txCharacteristic = null;
        state.rxCharacteristic = null;
        
        emitConnectionState();
        
        if (typeof ModalsModule !== 'undefined') {
            ModalsModule.showToast('RadiaCode disconnected', 'error');
        }
    }

    function emitConnectionState() {
        if (typeof Events !== 'undefined') {
            Events.emit('radiacode:connection', {
                connected: state.connected,
                connecting: state.connecting,
                demoMode: state.demoMode,
                deviceInfo: state.deviceInfo
            });
        }
    }

    // ==================== BLE Communication ====================

    /**
     * Handle incoming BLE notification
     * RadiaCode protocol: First packet contains 4-byte LE size, followed by data
     * Multiple packets are assembled until full response received
     */
    function handleNotification(event) {
        const value = event.target.value;
        const data = new Uint8Array(value.buffer);
        
        state.stats.packetsReceived++;
        
        // First packet contains response size in first 4 bytes (little-endian)
        if (state.expectedResponseSize === 0 && data.length >= 4) {
            // Read 4-byte little-endian size
            state.expectedResponseSize = data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24);
            state.expectedResponseSize += 4; // Include size field itself
            
            // Reset buffer and store this packet
            state.rxBuffer = Array.from(data);
            
            console.log(`RadiaCode: Response started, expecting ${state.expectedResponseSize} bytes`);
        } else {
            // Append to receive buffer
            state.rxBuffer.push(...data);
        }
        
        // Check if complete response received
        if (state.expectedResponseSize > 0 && state.rxBuffer.length >= state.expectedResponseSize) {
            console.log(`RadiaCode: Response complete (${state.rxBuffer.length} bytes)`);
            
            // Parse the complete response
            parseCompleteResponse();
            
            // Reset for next response
            state.expectedResponseSize = 0;
        }
    }

    /**
     * Send command to device using chunked writes
     * RadiaCode protocol: Commands sent in 18-byte chunks (BLE MTU limitation)
     */
    async function sendCommand(cmd, data = []) {
        if (!state.txCharacteristic && !state.demoMode) {
            throw new Error('Not connected');
        }
        
        if (state.demoMode) {
            return handleDemoCommand(cmd, data);
        }
        
        // Build command packet
        // Format: [total_length (4 bytes LE), command (2 bytes LE), data...]
        const packetLength = 4 + 2 + data.length;
        const packet = new Uint8Array(packetLength);
        const view = new DataView(packet.buffer);
        
        // Size field (4 bytes LE) - size of command + data (excluding size field)
        view.setUint32(0, 2 + data.length, true);
        // Command (2 bytes LE)  
        view.setUint16(4, cmd, true);
        
        // Copy data
        for (let i = 0; i < data.length; i++) {
            packet[6 + i] = data[i];
        }
        
        // Clear receive state
        state.rxBuffer = [];
        state.expectedResponseSize = 0;
        state.pendingCommand = cmd;
        
        // Send in chunks of 18 bytes (BLE MTU limitation per mkgeiger)
        const chunkSize = BLE_CONFIG.CHUNK_SIZE;
        for (let pos = 0; pos < packet.length; pos += chunkSize) {
            const remaining = packet.length - pos;
            const toSend = Math.min(remaining, chunkSize);
            const chunk = packet.slice(pos, pos + toSend);
            
            try {
                await state.txCharacteristic.writeValueWithoutResponse(chunk);
            } catch (e) {
                // Fallback to write with response
                await state.txCharacteristic.writeValueWithResponse(chunk);
            }
            
            // Small delay between chunks to avoid overwhelming BLE stack
            if (pos + chunkSize < packet.length) {
                await new Promise(resolve => setTimeout(resolve, 5));
            }
        }
        
        // Wait for response with extended timeout (30 seconds for large responses like spectrum)
        return new Promise((resolve, reject) => {
            state.commandResolver = resolve;
            
            state.commandTimeout = setTimeout(() => {
                console.warn(`RadiaCode: Command 0x${cmd.toString(16)} timeout after ${BLE_CONFIG.RESPONSE_TIMEOUT}ms`);
                state.pendingCommand = null;
                state.commandResolver = null;
                reject(new Error('Command timeout'));
            }, BLE_CONFIG.RESPONSE_TIMEOUT);
        });
    }

    /**
     * Handle command in demo mode
     */
    function handleDemoCommand(cmd, data) {
        switch (cmd) {
            case CMD.GET_SERIAL:
                return state.deviceInfo.serialNumber;
            case CMD.GET_FW_VERSION:
                return state.deviceInfo.firmwareVersion;
            case CMD.GET_SPECTRUM:
                return state.spectrum;
            case CMD.GET_ENERGY_CALIB:
                return state.spectrum.calibration;
            case CMD.GET_TEMPERATURE:
                return state.currentReading.temperature;
            default:
                return null;
        }
    }

    /**
     * Parse a complete response from the device
     */
    function parseCompleteResponse() {
        if (state.rxBuffer.length < 4) return;
        
        // Skip the 4-byte size field, rest is response data
        const responseData = state.rxBuffer.slice(4);
        
        // Resolve pending command
        if (state.commandResolver) {
            clearTimeout(state.commandTimeout);
            state.commandResolver(responseData);
            state.pendingCommand = null;
            state.commandResolver = null;
        }
        
        // Also try to parse as data buffer (for async notifications)
        if (responseData.length > 0) {
            parseDataBuffer(responseData);
        }
    }

    /**
     * Parse real-time data buffer response
     */
    function parseDataBuffer(data) {
        if (data.length < 4) return;
        
        const view = new DataView(new Uint8Array(data).buffer);
        let offset = 0;
        
        while (offset < data.length - 4) {
            const recordType = view.getUint8(offset);
            offset++;
            
            if (recordType === DATA_TYPE.REAL_TIME && offset + 24 <= data.length) {
                // Parse RealTimeData structure
                const reading = {
                    doseRate: view.getFloat32(offset, true),
                    doseRateErr: view.getFloat32(offset + 4, true),
                    countRate: view.getFloat32(offset + 8, true),
                    countRateErr: view.getFloat32(offset + 12, true),
                    temperature: view.getFloat32(offset + 16, true),
                    totalDose: state.currentReading.totalDose,
                    timestamp: Date.now()
                };
                offset += 20;
                
                // Convert dose rate from 0.1 µSv/h units if needed
                // (depends on firmware version)
                
                processReading(reading);
            } else {
                // Skip unknown record type
                break;
            }
        }
    }

    /**
     * Parse spectrum data response
     */
    function parseSpectrumData(data) {
        if (data.length < 4112) return;  // 16 header + 4096 (1024 * 4)
        
        const view = new DataView(new Uint8Array(data).buffer);
        
        state.spectrum.duration = view.getFloat32(0, true);
        state.spectrum.calibration = [
            view.getFloat32(4, true),
            view.getFloat32(8, true),
            view.getFloat32(12, true)
        ];
        
        for (let i = 0; i < 1024; i++) {
            state.spectrum.counts[i] = view.getUint32(16 + i * 4, true);
        }
        
        if (typeof Events !== 'undefined') {
            Events.emit('radiacode:spectrum', state.spectrum);
        }
    }

    /**
     * Parse energy calibration response
     */
    function parseEnergyCalibration(data) {
        if (data.length < 12) return;
        
        const view = new DataView(new Uint8Array(data).buffer);
        state.spectrum.calibration = [
            view.getFloat32(0, true),
            view.getFloat32(4, true),
            view.getFloat32(8, true)
        ];
    }

    /**
     * Query device information
     */
    async function queryDeviceInfo() {
        try {
            // Query serial number
            const serialData = await sendCommand(CMD.GET_SERIAL);
            if (serialData && serialData.length > 0) {
                state.deviceInfo.serialNumber = new TextDecoder().decode(new Uint8Array(serialData)).replace(/\0/g, '');
            }
        } catch (e) {
            console.warn('Could not get serial number:', e);
        }
        
        try {
            // Query firmware version
            const fwData = await sendCommand(CMD.GET_FW_VERSION);
            if (fwData && fwData.length > 0) {
                state.deviceInfo.firmwareVersion = new TextDecoder().decode(new Uint8Array(fwData)).replace(/\0/g, '');
            }
        } catch (e) {
            console.warn('Could not get firmware version:', e);
        }
        
        try {
            // Query energy calibration
            await sendCommand(CMD.GET_ENERGY_CALIB);
        } catch (e) {
            console.warn('Could not get energy calibration:', e);
        }
    }

    /**
     * Request spectrum data from device
     */
    async function requestSpectrum() {
        if (state.demoMode) {
            generateDemoSpectrum();
            return state.spectrum;
        }
        
        try {
            await sendCommand(CMD.GET_SPECTRUM);
            return state.spectrum;
        } catch (e) {
            console.warn('Could not request spectrum:', e);
            return null;
        }
    }

    /**
     * Reset accumulated spectrum on device
     */
    async function resetSpectrum() {
        if (state.demoMode) {
            state.spectrum.counts.fill(0);
            state.spectrum.duration = 0;
            return;
        }
        
        try {
            await sendCommand(CMD.RESET_SPECTRUM);
            state.spectrum.counts.fill(0);
            state.spectrum.duration = 0;
        } catch (e) {
            console.warn('Could not reset spectrum:', e);
        }
    }

    /**
     * Reset accumulated dose on device
     */
    async function resetDose() {
        if (state.demoMode) {
            state.currentReading.totalDose = 0;
            return;
        }
        
        try {
            await sendCommand(CMD.RESET_DOSE);
            state.currentReading.totalDose = 0;
        } catch (e) {
            console.warn('Could not reset dose:', e);
        }
    }

    /**
     * Start polling for real-time data
     */
    function startPolling() {
        stopPolling();
        
        if (state.demoMode) return;  // Demo mode uses its own interval
        
        pollInterval = setInterval(async () => {
            if (state.connected && !state.demoMode) {
                try {
                    await sendCommand(CMD.GET_DATA_BUF);
                } catch (e) {
                    // May have disconnected
                }
            }
        }, CONFIG.pollIntervalMs);
    }

    /**
     * Stop polling
     */
    function stopPolling() {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
    }

    // ==================== Reading Processing ====================

    /**
     * Process a new radiation reading
     */
    function processReading(reading) {
        // Accumulate dose from time between readings
        const prevReading = state.currentReading;
        if (prevReading.timestamp && reading.timestamp && reading.doseRate > 0) {
            const hours = (reading.timestamp - prevReading.timestamp) / 3600000;
            if (hours > 0 && hours < 1) { // sanity: ignore gaps > 1 hour
                const doseIncrement = reading.doseRate * hours;
                state.doseLog.currentSessionDose += doseIncrement;
                state.doseLog.cumulativeDose += doseIncrement;
                
                // Persist every 30 seconds
                const now = Date.now();
                if (now - state.doseLog.lastSaveTime > 30000) {
                    state.doseLog.lastSaveTime = now;
                    saveDoseLog();
                }
            }
        }
        
        state.currentReading = reading;
        state.stats.lastUpdate = Date.now();
        
        // Add to history
        state.readingHistory.push(reading);
        if (state.readingHistory.length > CONFIG.readingHistorySize) {
            state.readingHistory.shift();
        }
        
        // Check alerts
        checkAlerts(reading);
        
        // Add to track if recording
        if (state.isRecording) {
            addTrackPoint(reading);
        }
        
        // Emit update event
        if (typeof Events !== 'undefined') {
            Events.emit('radiacode:reading', reading);
        }
    }

    // ==================== Alert System ====================

    function checkAlerts(reading) {
        if (!state.alertsEnabled) return;
        
        const thresholds = state.settings.thresholds;
        let newLevel = 'normal';
        
        if (reading.doseRate >= thresholds.alarm) {
            newLevel = 'alarm';
        } else if (reading.doseRate >= thresholds.warning) {
            newLevel = 'warning';
        } else if (reading.doseRate >= thresholds.elevated) {
            newLevel = 'elevated';
        }
        
        const now = Date.now();
        if (newLevel !== state.currentAlertLevel) {
            if (now - state.lastAlertTime > state.settings.alertDebounceMs) {
                triggerAlert(newLevel, reading);
                state.lastAlertTime = now;
            }
        }
        
        state.currentAlertLevel = newLevel;
    }

    function triggerAlert(level, reading) {
        let lat = null, lon = null;
        if (typeof GPSModule !== 'undefined') {
            const pos = GPSModule.getPosition();
            if (pos) {
                lat = pos.lat;
                lon = pos.lon;
            }
        }
        
        const alert = {
            timestamp: Date.now(),
            level: level,
            doseRate: reading.doseRate,
            countRate: reading.countRate,
            latitude: lat,
            longitude: lon,
            message: getAlertMessage(level, reading)
        };
        
        state.alertHistory.push(alert);
        if (state.alertHistory.length > 100) {
            state.alertHistory.shift();
        }
        
        if (state.alertSoundEnabled && level !== 'normal') {
            playAlertSound(level);
        }
        
        if (typeof ModalsModule !== 'undefined' && level !== 'normal') {
            const colors = { elevated: 'info', warning: 'warning', alarm: 'error' };
            ModalsModule.showToast(alert.message, colors[level] || 'info');
        }
        
        if (typeof Events !== 'undefined') {
            Events.emit('radiacode:alert', alert);
        }
    }

    function getAlertMessage(level, reading) {
        const doseStr = formatDoseRate(reading.doseRate);
        
        switch (level) {
            case 'alarm':
                return `☢️ RADIATION ALARM: ${doseStr} - Evacuate area!`;
            case 'warning':
                return `⚠️ Radiation Warning: ${doseStr} - Investigate source`;
            case 'elevated':
                return `📊 Elevated radiation: ${doseStr} - Above background`;
            default:
                return `Radiation normal: ${doseStr}`;
        }
    }

    function playAlertSound(level) {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            const frequencies = { elevated: 440, warning: 880, alarm: 1760 };
            const durations = { elevated: 0.3, warning: 0.5, alarm: 1.0 };
            
            oscillator.frequency.value = frequencies[level] || 440;
            oscillator.type = 'square';
            
            const duration = durations[level] || 0.3;
            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
            
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + duration);
        } catch (e) {
            // Audio not available
        }
    }

    // ==================== Track Recording ====================

    function startTrack(name = null, notes = null) {
        if (state.isRecording) {
            stopTrack();
        }
        
        state.currentTrack = {
            id: Date.now(),
            name: name || `Track ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
            notes: notes,
            startedAt: Date.now(),
            endedAt: null,
            points: [],
            stats: {
                avgDoseRate: 0,
                maxDoseRate: 0,
                minDoseRate: Infinity,
                totalDose: 0,
                duration: 0,
                distance: 0
            }
        };
        
        state.isRecording = true;
        
        if (typeof Events !== 'undefined') {
            Events.emit('radiacode:track_started', state.currentTrack);
        }
        
        return state.currentTrack.id;
    }

    function addTrackPoint(reading) {
        if (!state.isRecording || !state.currentTrack) return;
        
        const track = state.currentTrack;
        const lastPoint = track.points[track.points.length - 1];
        
        if (lastPoint && (reading.timestamp - lastPoint.timestamp) < CONFIG.trackPointInterval) {
            return;
        }
        
        let lat = null, lon = null, altitude = null;
        if (typeof GPSModule !== 'undefined') {
            const pos = GPSModule.getPosition();
            if (pos && pos.lat && pos.lon) {
                lat = pos.lat;
                lon = pos.lon;
                altitude = pos.altitude;
            }
        }
        
        const point = {
            timestamp: reading.timestamp,
            doseRate: reading.doseRate,
            countRate: reading.countRate,
            latitude: lat,
            longitude: lon,
            altitude: altitude
        };
        
        track.points.push(point);
        
        // Update stats
        track.stats.maxDoseRate = Math.max(track.stats.maxDoseRate, reading.doseRate);
        track.stats.minDoseRate = Math.min(track.stats.minDoseRate, reading.doseRate);
        
        const sum = track.points.reduce((acc, p) => acc + p.doseRate, 0);
        track.stats.avgDoseRate = sum / track.points.length;
        
        if (lastPoint && lastPoint.latitude && lat) {
            track.stats.distance += calculateDistance(lastPoint.latitude, lastPoint.longitude, lat, lon);
        }
        
        if (lastPoint) {
            const hours = (reading.timestamp - lastPoint.timestamp) / 3600000;
            track.stats.totalDose += reading.doseRate * hours;
        }
        
        if (typeof Events !== 'undefined') {
            Events.emit('radiacode:track_point', point);
        }
    }

    function stopTrack() {
        if (!state.isRecording || !state.currentTrack) return null;
        
        const track = state.currentTrack;
        track.endedAt = Date.now();
        track.stats.duration = track.endedAt - track.startedAt;
        
        if (track.stats.minDoseRate === Infinity) {
            track.stats.minDoseRate = 0;
        }
        
        state.tracks.push(track);
        saveTracks();
        
        state.isRecording = false;
        const finishedTrack = state.currentTrack;
        state.currentTrack = null;
        
        if (typeof Events !== 'undefined') {
            Events.emit('radiacode:track_stopped', finishedTrack);
        }
        
        return finishedTrack;
    }

    function deleteTrack(trackId) {
        const index = state.tracks.findIndex(t => t.id === trackId);
        if (index >= 0) {
            state.tracks.splice(index, 1);
            saveTracks();
            return true;
        }
        return false;
    }

    function exportTrackGeoJSON(trackId) {
        const track = state.tracks.find(t => t.id === trackId);
        if (!track) return null;
        
        const features = [];
        
        const coordinates = track.points
            .filter(p => p.latitude && p.longitude)
            .map(p => [p.longitude, p.latitude, p.altitude || 0]);
        
        if (coordinates.length > 1) {
            features.push({
                type: 'Feature',
                properties: {
                    type: 'radiation_track',
                    name: track.name,
                    avgDoseRate: track.stats.avgDoseRate,
                    maxDoseRate: track.stats.maxDoseRate,
                    totalDose: track.stats.totalDose,
                    demoMode: state.demoMode
                },
                geometry: {
                    type: 'LineString',
                    coordinates: coordinates
                }
            });
        }
        
        track.points.filter(p => p.latitude && p.longitude).forEach(p => {
            features.push({
                type: 'Feature',
                properties: {
                    type: 'radiation_point',
                    doseRate: p.doseRate,
                    countRate: p.countRate,
                    timestamp: p.timestamp,
                    level: getDoseLevel(p.doseRate)
                },
                geometry: {
                    type: 'Point',
                    coordinates: [p.longitude, p.latitude, p.altitude || 0]
                }
            });
        });
        
        return {
            type: 'FeatureCollection',
            features: features,
            properties: {
                name: track.name,
                startedAt: track.startedAt,
                endedAt: track.endedAt,
                stats: track.stats,
                generator: 'GridDown RadiaCode Module',
                version: '2.0.0'
            }
        };
    }

    // ==================== Spectrum Analysis ====================

    function channelToEnergy(channel) {
        const [a0, a1, a2] = state.spectrum.calibration;
        return a0 + a1 * channel + a2 * channel * channel;
    }

    function energyToChannel(energy) {
        const [a0, a1, a2] = state.spectrum.calibration;
        if (Math.abs(a2) < 1e-10) {
            return Math.round((energy - a0) / a1);
        }
        const discriminant = a1 * a1 - 4 * a2 * (a0 - energy);
        if (discriminant < 0) return 0;
        const x = (-a1 + Math.sqrt(discriminant)) / (2 * a2);
        return Math.max(0, Math.min(1023, Math.round(x)));
    }

    function findPeaks(minSignificance = 3.0) {
        const counts = state.spectrum.counts;
        const peaks = [];
        const halfWin = 15;    // look ±15 channels from candidate
        const edgeBand = 5;    // use 5 channels at each edge for background estimate
        const peakHalf = 4;    // peak region ±4 channels from center
        
        // Scan for local maxima first
        for (let i = halfWin; i < counts.length - halfWin; i++) {
            // Must be local maximum within ±peakHalf
            let isMax = true;
            for (let d = 1; d <= peakHalf; d++) {
                if (counts[i] < counts[i - d] || counts[i] < counts[i + d]) {
                    isMax = false;
                    break;
                }
            }
            if (!isMax || counts[i] < 10) continue;
            
            // Estimate background from window edges (outside peak region)
            let bgSum = 0;
            let bgCount = 0;
            for (let d = halfWin - edgeBand; d <= halfWin; d++) {
                bgSum += counts[i - d] + counts[i + d];
                bgCount += 2;
            }
            const bgEstimate = bgSum / bgCount;
            
            // Poisson significance: (signal - background) / sqrt(background)
            if (bgEstimate <= 0) continue;
            const significance = (counts[i] - bgEstimate) / Math.sqrt(bgEstimate);
            
            if (significance >= minSignificance) {
                // Avoid duplicates within ±peakHalf of an already-found peak
                const tooClose = peaks.some(p => Math.abs(p.channel - i) < peakHalf * 2);
                if (!tooClose) {
                    peaks.push({
                        channel: i,
                        energy: channelToEnergy(i),
                        counts: counts[i],
                        significance: significance
                    });
                }
            }
        }
        
        return peaks;
    }

    function identifyIsotopes() {
        const peaks = findPeaks();
        const matches = [];
        
        for (const isotope of ISOTOPE_LIBRARY) {
            for (const peak of peaks) {
                if (Math.abs(peak.energy - isotope.energy) <= isotope.window) {
                    const energyDiff = Math.abs(peak.energy - isotope.energy);
                    const energyScore = 1.0 - (energyDiff / isotope.window);
                    const sigScore = Math.min(1.0, peak.significance / 10.0);
                    const confidence = (energyScore + sigScore) / 2.0;
                    
                    matches.push({
                        isotope: isotope,
                        peak: peak,
                        confidence: confidence
                    });
                    break;
                }
            }
        }
        
        matches.sort((a, b) => b.confidence - a.confidence);
        return matches;
    }

    // ==================== CSV/GPX Export ====================

    function exportTrackCSV(trackId) {
        const track = state.tracks.find(t => t.id === trackId);
        if (!track) return null;
        
        const header = 'timestamp,datetime_utc,latitude,longitude,altitude_m,dose_rate_uSv_h,count_rate_cps,level';
        const rows = track.points
            .filter(p => p.latitude && p.longitude)
            .map(p => [
                p.timestamp,
                new Date(p.timestamp).toISOString(),
                p.latitude.toFixed(7),
                p.longitude.toFixed(7),
                (p.altitude || 0).toFixed(1),
                p.doseRate.toFixed(4),
                p.countRate.toFixed(1),
                getDoseLevel(p.doseRate)
            ].join(','));
        
        return header + '\n' + rows.join('\n') + '\n';
    }

    function exportTrackGPX(trackId) {
        const track = state.tracks.find(t => t.id === trackId);
        if (!track) return null;
        
        const points = track.points.filter(p => p.latitude && p.longitude);
        if (points.length === 0) return null;
        
        const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GridDown RadiaCode"
     xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:griddown="http://griddown.app/gpx/radiation/1"
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <metadata>
    <name>${esc(track.name)}</name>
    <desc>Radiation survey track. Avg: ${track.stats.avgDoseRate?.toFixed(3) || 0} μSv/h, Max: ${track.stats.maxDoseRate?.toFixed(3) || 0} μSv/h</desc>
    <time>${new Date(track.startedAt).toISOString()}</time>
  </metadata>
  <trk>
    <name>${esc(track.name)}</name>
    <type>Radiation Survey</type>
    <trkseg>
`;
        
        points.forEach(p => {
            gpx += `      <trkpt lat="${p.latitude.toFixed(7)}" lon="${p.longitude.toFixed(7)}">
        <ele>${(p.altitude || 0).toFixed(1)}</ele>
        <time>${new Date(p.timestamp).toISOString()}</time>
        <extensions>
          <griddown:doseRate>${p.doseRate.toFixed(4)}</griddown:doseRate>
          <griddown:countRate>${p.countRate.toFixed(1)}</griddown:countRate>
          <griddown:level>${getDoseLevel(p.doseRate)}</griddown:level>
        </extensions>
      </trkpt>
`;
        });
        
        gpx += `    </trkseg>
  </trk>
</gpx>`;
        
        return gpx;
    }

    // ==================== Heatmap Rendering ====================

    function renderHeatmap(ctx, width, height, latLonToPixel) {
        // Gather all geo-tagged points from all tracks + current track
        const allPoints = [];
        state.tracks.forEach(track => {
            track.points.forEach(p => {
                if (p.latitude && p.longitude) allPoints.push(p);
            });
        });
        if (state.isRecording && state.currentTrack) {
            state.currentTrack.points.forEach(p => {
                if (p.latitude && p.longitude) allPoints.push(p);
            });
        }
        
        if (allPoints.length < 3) return; // need minimum points for interpolation
        
        // Determine visible bounds by testing corners
        // Use a cell grid for IDW interpolation
        const cellSize = 12; // pixels per cell
        const cols = Math.ceil(width / cellSize);
        const rows = Math.ceil(height / cellSize);
        
        // Convert all points to pixel coords once
        const pixelPoints = allPoints.map(p => {
            const px = latLonToPixel(p.latitude, p.longitude);
            return { x: px.x, y: px.y, dose: p.doseRate };
        }).filter(p => p.x > -200 && p.x < width + 200 && p.y > -200 && p.y < height + 200);
        
        if (pixelPoints.length < 2) return;
        
        // Influence radius in pixels (adaptive based on point density)
        const avgSpacing = Math.sqrt((width * height) / pixelPoints.length);
        const radius = Math.max(cellSize * 3, Math.min(avgSpacing * 2.5, 150));
        const radiusSq = radius * radius;
        
        // IDW interpolation per cell
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const cx = col * cellSize + cellSize / 2;
                const cy = row * cellSize + cellSize / 2;
                
                let weightedSum = 0;
                let weightTotal = 0;
                let nearbyCount = 0;
                
                for (let i = 0; i < pixelPoints.length; i++) {
                    const dx = cx - pixelPoints[i].x;
                    const dy = cy - pixelPoints[i].y;
                    const distSq = dx * dx + dy * dy;
                    
                    if (distSq > radiusSq) continue;
                    
                    nearbyCount++;
                    // IDW with power=2
                    const w = 1 / (distSq + 1);
                    weightedSum += w * pixelPoints[i].dose;
                    weightTotal += w;
                }
                
                if (nearbyCount < 1 || weightTotal === 0) continue;
                
                const interpolatedDose = weightedSum / weightTotal;
                const color = getDoseColor(interpolatedDose);
                
                // Opacity based on confidence (more nearby points = higher)
                const confidence = Math.min(1.0, nearbyCount / 4);
                const alpha = 0.15 + confidence * 0.2;
                
                // Parse hex color
                const r = parseInt(color.slice(1, 3), 16);
                const g = parseInt(color.slice(3, 5), 16);
                const b = parseInt(color.slice(5, 7), 16);
                
                ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
                ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
            }
        }
    }

    // ==================== Utilities ====================

    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 3959;  // Earth's radius in miles
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function getDoseLevel(doseRate) {
        const t = state.settings.thresholds;
        if (doseRate >= t.alarm) return 'alarm';
        if (doseRate >= t.warning) return 'warning';
        if (doseRate >= t.elevated) return 'elevated';
        return 'normal';
    }

    function getDoseColor(doseRate) {
        const level = getDoseLevel(doseRate);
        const colors = {
            normal: '#22c55e',
            elevated: '#eab308',
            warning: '#f97316',
            alarm: '#ef4444'
        };
        return colors[level] || colors.normal;
    }

    function formatDoseRate(doseRate) {
        if (doseRate < 0.001) {
            return (doseRate * 1000000).toFixed(0) + ' nSv/h';
        } else if (doseRate < 0.01) {
            return (doseRate * 1000).toFixed(1) + ' nSv/h';
        } else if (doseRate < 10) {
            return doseRate.toFixed(2) + ' μSv/h';
        } else if (doseRate < 1000) {
            return doseRate.toFixed(1) + ' μSv/h';
        } else {
            return (doseRate / 1000).toFixed(2) + ' mSv/h';
        }
    }

    function formatCountRate(cps) {
        if (cps < 10) {
            return cps.toFixed(1) + ' CPS';
        } else if (cps < 1000) {
            return Math.round(cps) + ' CPS';
        } else {
            return (cps / 1000).toFixed(2) + ' kCPS';
        }
    }

    // ==================== Map Rendering ====================

    function renderOnMap(ctx, width, height, latLonToPixel) {
        // Heatmap layer (renders under tracks and dots)
        if (state.settings.heatmapEnabled) {
            renderHeatmap(ctx, width, height, latLonToPixel);
        }
        
        state.tracks.forEach(track => {
            renderTrack(ctx, track, latLonToPixel, width, height, false);
        });
        
        if (state.isRecording && state.currentTrack) {
            renderTrack(ctx, state.currentTrack, latLonToPixel, width, height, true);
        }
        
        if ((state.connected || state.demoMode) && state.currentReading.doseRate > 0) {
            renderCurrentPosition(ctx, width, height, latLonToPixel);
        }
    }

    function renderTrack(ctx, track, latLonToPixel, width, height, isActive) {
        const points = track.points.filter(p => p.latitude && p.longitude);
        if (points.length === 0) return;
        
        ctx.beginPath();
        ctx.strokeStyle = isActive ? 'rgba(34, 197, 94, 0.8)' : 'rgba(34, 197, 94, 0.4)';
        ctx.lineWidth = isActive ? 3 : 2;
        
        let firstVisible = true;
        points.forEach((point) => {
            const pixel = latLonToPixel(point.latitude, point.longitude);
            if (pixel.x < -100 || pixel.x > width + 100 || pixel.y < -100 || pixel.y > height + 100) {
                return;
            }
            if (firstVisible) {
                ctx.moveTo(pixel.x, pixel.y);
                firstVisible = false;
            } else {
                ctx.lineTo(pixel.x, pixel.y);
            }
        });
        ctx.stroke();
        
        const sampleRate = Math.max(1, Math.floor(points.length / 100));
        
        points.forEach((point, i) => {
            if (i % sampleRate !== 0 && i !== points.length - 1) return;
            
            const pixel = latLonToPixel(point.latitude, point.longitude);
            if (pixel.x < -20 || pixel.x > width + 20 || pixel.y < -20 || pixel.y > height + 20) {
                return;
            }
            
            const color = getDoseColor(point.doseRate);
            const radius = isActive ? 5 : 4;
            
            ctx.beginPath();
            ctx.arc(pixel.x, pixel.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.3)';
            ctx.lineWidth = 1;
            ctx.stroke();
        });
    }

    function renderCurrentPosition(ctx, width, height, latLonToPixel) {
        let pos = null;
        if (typeof GPSModule !== 'undefined') {
            pos = GPSModule.getPosition();
        }
        
        if (!pos || !pos.lat || !pos.lon) return;
        
        const pixel = latLonToPixel(pos.lat, pos.lon);
        if (pixel.x < -50 || pixel.x > width + 50 || pixel.y < -50 || pixel.y > height + 50) {
            return;
        }
        
        const doseRate = state.currentReading.doseRate;
        const color = getDoseColor(doseRate);
        
        const pulse = (Math.sin(Date.now() / 200) + 1) / 2;
        const baseRadius = 18;
        const pulseRadius = baseRadius + pulse * 8;
        
        // Parse hex color to rgba
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        
        ctx.beginPath();
        ctx.arc(pixel.x, pixel.y, pulseRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.15)`;
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(pixel.x, pixel.y, baseRadius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.fillText('☢', pixel.x, pixel.y);
        
        ctx.font = '10px system-ui, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 3;
        const label = formatDoseRate(doseRate);
        ctx.strokeText(label, pixel.x, pixel.y + baseRadius + 12);
        ctx.fillText(label, pixel.x, pixel.y + baseRadius + 12);
    }

    // ==================== Public API ====================

    return {
        init,
        destroy,
        
        // Connection
        connect,
        disconnect,
        startDemo,
        stopDemo,
        isConnected: () => state.connected,
        isConnecting: () => state.connecting,
        isDemoMode: () => state.demoMode,
        getDeviceInfo: () => ({ ...state.deviceInfo }),
        
        // Current data
        getCurrentReading: () => ({ ...state.currentReading }),
        getReadingHistory: () => [...state.readingHistory],
        getSpectrum: () => ({ ...state.spectrum }),
        
        // Commands
        requestSpectrum,
        resetSpectrum,
        resetDose,
        
        // Track recording
        startTrack,
        stopTrack,
        isRecording: () => state.isRecording,
        getCurrentTrack: () => state.currentTrack ? { ...state.currentTrack } : null,
        getTracks: () => [...state.tracks],
        getTrack: (id) => state.tracks.find(t => t.id === id),
        deleteTrack,
        exportTrackGeoJSON,
        exportTrackCSV,
        exportTrackGPX,
        
        // Alerts
        getAlertLevel: () => state.currentAlertLevel,
        getAlertHistory: () => [...state.alertHistory],
        setAlertsEnabled: (enabled) => { state.alertsEnabled = enabled; },
        isAlertsEnabled: () => state.alertsEnabled,
        setAlertSoundEnabled: (enabled) => { state.alertSoundEnabled = enabled; },
        isAlertSoundEnabled: () => state.alertSoundEnabled,
        
        // Settings
        getSettings: () => ({ ...state.settings }),
        updateSettings: (updates) => {
            state.settings = { ...state.settings, ...updates };
            saveSettings();
        },
        setThreshold: (level, value) => {
            state.settings.thresholds[level] = value;
            saveSettings();
        },
        
        // Spectrum analysis
        channelToEnergy,
        energyToChannel,
        findPeaks,
        identifyIsotopes,
        ISOTOPE_LIBRARY,
        
        // Utilities
        getDoseLevel,
        getDoseColor,
        formatDoseRate,
        formatCountRate,
        
        // Map rendering
        renderOnMap,
        
        // Dose log
        getDoseLog: () => ({
            cumulativeDose: state.doseLog.cumulativeDose,
            currentSessionDose: state.doseLog.currentSessionDose,
            sessions: [...state.doseLog.sessions]
        }),
        resetDoseLog: () => {
            state.doseLog.cumulativeDose = 0;
            state.doseLog.sessions = [];
            state.doseLog.currentSessionDose = 0;
            saveDoseLog();
        },
        
        // Heatmap
        isHeatmapEnabled: () => state.settings.heatmapEnabled,
        setHeatmapEnabled: (enabled) => {
            state.settings.heatmapEnabled = enabled;
            saveSettings();
        },
        
        // Stats
        getStats: () => ({ ...state.stats }),
        
        // Constants (for external reference)
        BLE_CONFIG,
        CMD
    };
})();

// Register globally
window.RadiaCodeModule = RadiaCodeModule;
