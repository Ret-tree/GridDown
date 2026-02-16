/**
 * GridDown APRS Module - Amateur Packet Reporting System Integration
 * Supports Bluetooth TNC connections (Mobilinkd), packet parsing, and tactical display
 * 
 * APRS provides long-range position tracking over VHF radio (144.390 MHz NA)
 * Complements Meshtastic for extended coverage scenarios
 * 
 * ============================================================================
 * APRS ATTRIBUTION
 * ============================================================================
 * APRS® is a registered trademark of APRS Software and Bob Bruninga, WB4APR.
 * Automatic Packet Reporting System (APRS) Copyright © Bob Bruninga, WB4APR (SK)
 * Contact: wb4apr@amsat.org
 * 
 * Bob Bruninga, WB4APR, the inventor of APRS, became a Silent Key on 
 * February 7, 2022. His contributions to amateur radio are gratefully 
 * acknowledged.
 * 
 * APRS Protocol: http://www.aprs.org/
 * TAPR (Tucson Amateur Packet Radio): https://tapr.org/
 * 
 * Users of this module must hold a valid amateur radio license and comply
 * with all applicable regulations when transmitting APRS packets.
 * ============================================================================
 */
const APRSModule = (function() {
    'use strict';

    // ==================== Configuration ====================
    
    const CONFIG = {
        // Beacon settings
        defaultBeaconInterval: 300,      // 5 minutes
        smartBeaconMinInterval: 30,      // Minimum 30 seconds when moving fast
        smartBeaconMaxInterval: 1800,    // Maximum 30 minutes when stationary
        smartBeaconMinSpeed: 5,          // mph threshold for movement
        smartBeaconTurnAngle: 30,        // degrees change triggers beacon
        
        // Station management
        stationTimeout: 3600000,         // 1 hour - fade stations not heard
        stationPurge: 86400000,          // 24 hours - remove from database
        maxTrackPoints: 50,              // Position history per station
        maxStations: 500,                // Maximum stations to track
        
        // Display
        showTrackTails: true,
        trackTailLength: 20,             // Points to show in tail
        labelMinZoom: 10,                // Zoom level to show callsign labels
        
        // KISS protocol
        KISS_FEND: 0xC0,
        KISS_FESC: 0xDB,
        KISS_TFEND: 0xDC,
        KISS_TFESC: 0xDD,
        KISS_CMD_DATA: 0x00
    };

    // APRS symbol table (primary and alternate)
    const APRS_SYMBOLS = {
        // Primary table (/)
        '/!': { icon: '👮', name: 'Police' },
        '/#': { icon: '🔢', name: 'Digi' },
        '/$': { icon: '📞', name: 'Phone' },
        '/%': { icon: '📡', name: 'DX Cluster' },
        '/&': { icon: '⛽', name: 'Gateway' },
        "/'": { icon: '✈️', name: 'Aircraft Small' },
        '/(': { icon: '☁️', name: 'Cloudy' },
        '/)': { icon: '📱', name: 'Mobile Sat' },
        '/*': { icon: '❄️', name: 'Snowmobile' },
        '/+': { icon: '➕', name: 'Red Cross' },
        '/,': { icon: '🎯', name: 'Boy Scout' },
        '/-': { icon: '🏠', name: 'House QTH' },
        '/.': { icon: '❌', name: 'X' },
        '//': { icon: '🔴', name: 'Dot' },
        '/0': { icon: '0️⃣', name: 'Circle 0' },
        '/1': { icon: '1️⃣', name: 'Circle 1' },
        '/2': { icon: '2️⃣', name: 'Circle 2' },
        '/3': { icon: '3️⃣', name: 'Circle 3' },
        '/4': { icon: '4️⃣', name: 'Circle 4' },
        '/5': { icon: '5️⃣', name: 'Circle 5' },
        '/6': { icon: '6️⃣', name: 'Circle 6' },
        '/7': { icon: '7️⃣', name: 'Circle 7' },
        '/8': { icon: '8️⃣', name: 'Circle 8' },
        '/9': { icon: '9️⃣', name: 'Circle 9' },
        '/:': { icon: '🔥', name: 'Fire' },
        '/;': { icon: '🏕️', name: 'Campground' },
        '/<': { icon: '🏍️', name: 'Motorcycle' },
        '/=': { icon: '🚂', name: 'Railroad' },
        '/>': { icon: '🚗', name: 'Car' },
        '/?': { icon: '❓', name: 'Server' },
        '/A': { icon: '🚑', name: 'Ambulance' },
        '/B': { icon: '🚲', name: 'Bicycle' },
        '/C': { icon: '📻', name: 'RACES' },
        '/E': { icon: '👁️', name: 'Eyeball' },
        '/F': { icon: '🚜', name: 'Tractor' },
        '/G': { icon: '🎮', name: 'Grid Square' },
        '/H': { icon: '🏨', name: 'Hotel' },
        '/I': { icon: '📡', name: 'TCP/IP' },
        '/J': { icon: '🎒', name: 'School' },
        '/K': { icon: '🚚', name: 'Truck' },
        '/L': { icon: '💻', name: 'Laptop' },
        '/M': { icon: '📮', name: 'Mic-E Repeater' },
        '/N': { icon: '🔺', name: 'Node' },
        '/O': { icon: '🎈', name: 'Balloon' },
        '/P': { icon: '👮', name: 'Police' },
        '/Q': { icon: '🌪️', name: 'Quake' },
        '/R': { icon: '🚐', name: 'RV' },
        '/S': { icon: '🚀', name: 'Shuttle' },
        '/T': { icon: '📺', name: 'SSTV' },
        '/U': { icon: '🚌', name: 'Bus' },
        '/V': { icon: '🚁', name: 'ATV' },
        '/W': { icon: '💧', name: 'Water Station' },
        '/X': { icon: '🚁', name: 'Helicopter' },
        '/Y': { icon: '⛵', name: 'Yacht' },
        '/Z': { icon: '🖥️', name: 'Windows' },
        '/[': { icon: '🚶', name: 'Jogger' },
        '/]': { icon: '📬', name: 'Mailbox' },
        '/^': { icon: '✈️', name: 'Aircraft Large' },
        '/_': { icon: '🌤️', name: 'Weather Station' },
        '/`': { icon: '📡', name: 'Dish Antenna' },
        '/a': { icon: '🚑', name: 'Ambulance' },
        '/b': { icon: '🚲', name: 'Bike' },
        '/c': { icon: '🏕️', name: 'Camp' },
        '/d': { icon: '🔥', name: 'Fire Dept' },
        '/e': { icon: '🐴', name: 'Horse' },
        '/f': { icon: '🚒', name: 'Fire Truck' },
        '/g': { icon: '🏔️', name: 'Glider' },
        '/h': { icon: '🏥', name: 'Hospital' },
        '/i': { icon: '📡', name: 'IOTA' },
        '/j': { icon: '🚙', name: 'Jeep' },
        '/k': { icon: '🚚', name: 'Truck' },
        '/l': { icon: '💻', name: 'Laptop' },
        '/m': { icon: '📡', name: 'Mic-E' },
        '/n': { icon: '📍', name: 'Node' },
        '/o': { icon: '🏢', name: 'EOC' },
        '/p': { icon: '🐕', name: 'Dog' },
        '/r': { icon: '📻', name: 'Repeater' },
        '/s': { icon: '🚢', name: 'Ship' },
        '/t': { icon: '🚚', name: 'Truck Stop' },
        '/u': { icon: '🚛', name: 'Semi' },
        '/v': { icon: '🚐', name: 'Van' },
        '/w': { icon: '💧', name: 'Water' },
        '/y': { icon: '🏠', name: 'House' },
        '/~': { icon: '📡', name: 'TNC Stream' }
    };

    // ==================== State ====================
    
    let state = {
        // Connection
        connected: false,
        connecting: false,
        bleDevice: null,
        bleCharacteristic: null,
        connectionType: null,        // 'bluetooth', 'kiss-tcp', 'direwolf'
        
        // User config
        myCallsign: '',
        mySSID: 9,                   // -9 is standard for mobile
        beaconEnabled: false,
        beaconInterval: CONFIG.defaultBeaconInterval,
        smartBeaconing: true,
        statusText: '',
        symbol: '/>',                // Car by default
        
        // Transmit state
        lastBeaconTime: 0,
        lastBeaconPosition: null,
        lastBeaconCourse: 0,
        
        // Station database
        stations: new Map(),         // callsign -> station object
        
        // Receive buffer
        rxBuffer: [],
        
        // Statistics
        stats: {
            packetsReceived: 0,
            packetsSent: 0,
            parseErrors: 0,
            lastPacketTime: null
        }
    };
    
    // Scoped event manager for cleanup
    let aprsEvents = null;
    let initialized = false;

    // ==================== Initialization ====================

    /**
     * Initialize APRS module
     */
    function init() {
        if (initialized) {
            console.debug('APRS module already initialized');
            return;
        }
        
        // Create scoped event manager
        aprsEvents = EventManager.createScopedManager(EventManager.SCOPES.APRS);
        
        loadSettings();
        loadStations();
        
        // Start station cleanup timer with tracked interval
        aprsEvents.setInterval(cleanupStations, 60000);
        
        // Start beacon timer if enabled
        aprsEvents.setInterval(checkBeacon, 10000);
        
        initialized = true;
        console.log('APRS module initialized');
    }
    
    /**
     * Cleanup APRS module resources
     */
    function destroy() {
        // Disconnect if connected
        if (state.connected) {
            disconnect();
        }
        
        // Clear all tracked intervals and listeners
        if (aprsEvents) {
            aprsEvents.clear();
            aprsEvents = null;
        }
        
        initialized = false;
        console.log('APRS module destroyed');
    }

    /**
     * Load settings from storage
     */
    async function loadSettings() {
        try {
            const settings = await Storage.Settings.get('aprs_settings');
            if (settings) {
                state.myCallsign = settings.callsign || '';
                state.mySSID = settings.ssid || 9;
                state.beaconEnabled = settings.beaconEnabled || false;
                state.beaconInterval = settings.beaconInterval || CONFIG.defaultBeaconInterval;
                state.smartBeaconing = settings.smartBeaconing !== false;
                state.statusText = settings.statusText || '';
                state.symbol = settings.symbol || '/>';
            }
        } catch (e) {
            console.warn('Could not load APRS settings:', e);
        }
    }

    /**
     * Save settings to storage
     */
    async function saveSettings() {
        try {
            await Storage.Settings.set('aprs_settings', {
                callsign: state.myCallsign,
                ssid: state.mySSID,
                beaconEnabled: state.beaconEnabled,
                beaconInterval: state.beaconInterval,
                smartBeaconing: state.smartBeaconing,
                statusText: state.statusText,
                symbol: state.symbol
            });
        } catch (e) {
            console.warn('Could not save APRS settings:', e);
        }
    }

    /**
     * Load stations from storage
     */
    async function loadStations() {
        try {
            const saved = await Storage.Settings.get('aprs_stations');
            if (saved && Array.isArray(saved)) {
                saved.forEach(s => {
                    if (s.callsign && Date.now() - s.lastHeard < CONFIG.stationPurge) {
                        state.stations.set(s.callsign, s);
                    }
                });
            }
        } catch (e) {
            console.warn('Could not load APRS stations:', e);
        }
    }

    /**
     * Save stations to storage
     */
    async function saveStations() {
        try {
            const stationsArray = Array.from(state.stations.values());
            await Storage.Settings.set('aprs_stations', stationsArray);
        } catch (e) {
            console.warn('Could not save APRS stations:', e);
        }
    }

    // ==================== Bluetooth TNC Connection ====================

    /**
     * Connect to Bluetooth TNC (Mobilinkd)
     */
    async function connectBluetooth() {
        // Check browser compatibility first
        if (typeof CompatibilityModule !== 'undefined') {
            if (!CompatibilityModule.requireFeature('webBluetooth', true)) {
                throw new Error('Web Bluetooth not supported on this browser.');
            }
        }
        
        if (!navigator.bluetooth) {
            throw new Error('Web Bluetooth not supported in this browser');
        }

        state.connecting = true;
        emitConnectionState();

        try {
            // Request Bluetooth device
            const device = await navigator.bluetooth.requestDevice({
                filters: [
                    { namePrefix: 'Mobilinkd' },
                    { namePrefix: 'TNC' },
                    { services: ['6e400001-b5a3-f393-e0a9-e50e24dcca9e'] } // Nordic UART
                ],
                optionalServices: ['6e400001-b5a3-f393-e0a9-e50e24dcca9e']
            });

            console.log('APRS: Bluetooth device selected:', device.name);

            // Connect to GATT server
            const server = await device.gatt.connect();
            console.log('APRS: GATT server connected');

            // Get Nordic UART service
            const service = await server.getPrimaryService('6e400001-b5a3-f393-e0a9-e50e24dcca9e');
            
            // Get TX characteristic (for sending to TNC)
            const txChar = await service.getCharacteristic('6e400002-b5a3-f393-e0a9-e50e24dcca9e');
            
            // Get RX characteristic (for receiving from TNC)
            const rxChar = await service.getCharacteristic('6e400003-b5a3-f393-e0a9-e50e24dcca9e');

            // Subscribe to notifications
            await rxChar.startNotifications();
            rxChar.addEventListener('characteristicvaluechanged', handleBluetoothData);

            // Handle disconnection
            device.addEventListener('gattserverdisconnected', handleDisconnect);

            // Store connection
            state.bleDevice = device;
            state.bleCharacteristic = txChar;
            state.connected = true;
            state.connecting = false;
            state.connectionType = 'bluetooth';

            emitConnectionState();
            
            if (typeof ModalsModule !== 'undefined') {
                ModalsModule.showToast(`Connected to ${device.name}`, 'success');
            }

            return true;

        } catch (error) {
            console.error('APRS: Bluetooth connection failed:', error);
            state.connecting = false;
            state.connected = false;
            emitConnectionState();
            throw error;
        }
    }

    /**
     * Handle incoming Bluetooth data
     */
    function handleBluetoothData(event) {
        const value = event.target.value;
        const data = new Uint8Array(value.buffer);
        
        // Add to receive buffer and process KISS frames
        for (let i = 0; i < data.length; i++) {
            state.rxBuffer.push(data[i]);
        }
        
        processKISSBuffer();
    }

    /**
     * Handle Bluetooth disconnection
     */
    function handleDisconnect() {
        console.log('APRS: Bluetooth disconnected');
        state.connected = false;
        state.bleDevice = null;
        state.bleCharacteristic = null;
        state.connectionType = null;
        emitConnectionState();
        
        if (typeof ModalsModule !== 'undefined') {
            ModalsModule.showToast('APRS TNC disconnected', 'error');
        }
    }

    /**
     * Disconnect from TNC
     */
    function disconnect() {
        if (state.bleDevice && state.bleDevice.gatt.connected) {
            state.bleDevice.gatt.disconnect();
        }
        state.connected = false;
        state.bleDevice = null;
        state.bleCharacteristic = null;
        state.connectionType = null;
        emitConnectionState();
    }

    /**
     * Emit connection state change event
     */
    function emitConnectionState() {
        Events.emit('aprs:connection', {
            connected: state.connected,
            connecting: state.connecting,
            type: state.connectionType
        });
    }

    // ==================== KISS Protocol ====================

    /**
     * Process KISS frames from receive buffer
     */
    function processKISSBuffer() {
        // Find complete KISS frames (FEND to FEND)
        while (true) {
            const startIdx = state.rxBuffer.indexOf(CONFIG.KISS_FEND);
            if (startIdx === -1) {
                state.rxBuffer = [];
                return;
            }

            // Remove any data before first FEND
            if (startIdx > 0) {
                state.rxBuffer = state.rxBuffer.slice(startIdx);
            }

            // Find end FEND
            const endIdx = state.rxBuffer.indexOf(CONFIG.KISS_FEND, 1);
            if (endIdx === -1) {
                return; // Incomplete frame, wait for more data
            }

            // Extract frame
            const frame = state.rxBuffer.slice(1, endIdx);
            state.rxBuffer = state.rxBuffer.slice(endIdx + 1);

            // Process frame if it has data
            if (frame.length > 1) {
                const cmdByte = frame[0];
                const port = (cmdByte >> 4) & 0x0F;
                const cmd = cmdByte & 0x0F;

                if (cmd === CONFIG.KISS_CMD_DATA) {
                    const ax25Data = unescapeKISS(frame.slice(1));
                    processAX25Frame(ax25Data);
                }
            }
        }
    }

    /**
     * Unescape KISS special bytes
     */
    function unescapeKISS(data) {
        const result = [];
        let i = 0;
        while (i < data.length) {
            if (data[i] === CONFIG.KISS_FESC) {
                i++;
                if (data[i] === CONFIG.KISS_TFEND) {
                    result.push(CONFIG.KISS_FEND);
                } else if (data[i] === CONFIG.KISS_TFESC) {
                    result.push(CONFIG.KISS_FESC);
                }
            } else {
                result.push(data[i]);
            }
            i++;
        }
        return new Uint8Array(result);
    }

    /**
     * Escape data for KISS transmission
     */
    function escapeKISS(data) {
        const result = [];
        for (let i = 0; i < data.length; i++) {
            if (data[i] === CONFIG.KISS_FEND) {
                result.push(CONFIG.KISS_FESC, CONFIG.KISS_TFEND);
            } else if (data[i] === CONFIG.KISS_FESC) {
                result.push(CONFIG.KISS_FESC, CONFIG.KISS_TFESC);
            } else {
                result.push(data[i]);
            }
        }
        return new Uint8Array(result);
    }

    /**
     * Build KISS frame for transmission
     */
    function buildKISSFrame(ax25Data) {
        const escaped = escapeKISS(ax25Data);
        const frame = new Uint8Array(escaped.length + 3);
        frame[0] = CONFIG.KISS_FEND;
        frame[1] = CONFIG.KISS_CMD_DATA;
        frame.set(escaped, 2);
        frame[frame.length - 1] = CONFIG.KISS_FEND;
        return frame;
    }

    // ==================== AX.25 Protocol ====================

    /**
     * Process AX.25 frame
     */
    function processAX25Frame(data) {
        try {
            // Minimum AX.25 frame: 14 bytes address + 1 control + 1 PID
            if (data.length < 16) {
                return;
            }

            // Parse addresses
            const destCall = parseCallsign(data.slice(0, 7));
            const srcCall = parseCallsign(data.slice(7, 14));
            
            // Parse digipeater path
            const digis = [];
            let idx = 14;
            let lastAddress = (data[13] & 0x01) === 1;
            
            while (!lastAddress && idx + 7 <= data.length) {
                const digi = parseCallsign(data.slice(idx, idx + 7));
                digis.push(digi);
                lastAddress = (data[idx + 6] & 0x01) === 1;
                idx += 7;
            }

            // Skip control and PID bytes
            idx += 2;

            // Rest is information field
            const info = data.slice(idx);
            const infoStr = new TextDecoder().decode(info);

            // Parse APRS packet
            parseAPRSPacket(srcCall, destCall, digis, infoStr);

            state.stats.packetsReceived++;
            state.stats.lastPacketTime = Date.now();

        } catch (e) {
            console.warn('APRS: AX.25 parse error:', e);
            state.stats.parseErrors++;
        }
    }

    /**
     * Parse callsign from AX.25 address field
     */
    function parseCallsign(bytes) {
        let call = '';
        for (let i = 0; i < 6; i++) {
            const c = bytes[i] >> 1;
            if (c !== 0x20) { // Skip padding spaces
                call += String.fromCharCode(c);
            }
        }
        const ssid = (bytes[6] >> 1) & 0x0F;
        const hasBeenRepeated = (bytes[6] & 0x80) !== 0;
        
        return {
            call: call.trim(),
            ssid: ssid,
            full: ssid > 0 ? `${call.trim()}-${ssid}` : call.trim(),
            repeated: hasBeenRepeated
        };
    }

    /**
     * Encode callsign to AX.25 address field
     */
    function encodeCallsign(callsign, ssid, isLast = false, command = false) {
        const bytes = new Uint8Array(7);
        const paddedCall = callsign.toUpperCase().padEnd(6, ' ');
        
        for (let i = 0; i < 6; i++) {
            bytes[i] = paddedCall.charCodeAt(i) << 1;
        }
        
        bytes[6] = (ssid << 1) | 0x60; // SSID + reserved bits
        if (isLast) bytes[6] |= 0x01;  // Last address bit
        if (command) bytes[6] |= 0x80; // Command/has been repeated
        
        return bytes;
    }

    // ==================== APRS Packet Parsing ====================

    /**
     * Parse APRS packet content
     */
    function parseAPRSPacket(source, dest, digis, info) {
        if (!info || info.length === 0) return;

        const dataType = info.charAt(0);
        let packet = {
            source: source.full,
            dest: dest.full,
            path: digis.map(d => d.full + (d.repeated ? '*' : '')).join(','),
            raw: info,
            type: 'unknown',
            timestamp: Date.now()
        };

        // Parse based on data type identifier
        switch (dataType) {
            case '!':  // Position without timestamp
            case '=':  // Position without timestamp with messaging
                packet = { ...packet, ...parsePositionPacket(info.slice(1), false) };
                packet.type = 'position';
                break;
                
            case '/':  // Position with timestamp
            case '@':  // Position with timestamp with messaging
                packet = { ...packet, ...parsePositionPacket(info.slice(1), true) };
                packet.type = 'position';
                break;
                
            case '`':  // Mic-E (current)
            case "'": // Mic-E (old)
                packet = { ...packet, ...parseMicEPacket(dest.call, info.slice(1)) };
                packet.type = 'position';
                break;
                
            case ':':  // Message
                packet = { ...packet, ...parseMessagePacket(info.slice(1)) };
                packet.type = 'message';
                break;
                
            case ';':  // Object
                packet = { ...packet, ...parseObjectPacket(info.slice(1)) };
                packet.type = 'object';
                break;
                
            case ')':  // Item
                packet = { ...packet, ...parseItemPacket(info.slice(1)) };
                packet.type = 'item';
                break;
                
            case '>':  // Status
                packet.status = info.slice(1);
                packet.type = 'status';
                break;
                
            case 'T':  // Telemetry
                packet.type = 'telemetry';
                break;
                
            case '_':  // Weather (Positionless)
                packet.type = 'weather';
                break;
                
            case '<':  // Station capabilities
                packet.type = 'capabilities';
                break;
        }

        // Process the packet
        handleParsedPacket(packet);
    }

    /**
     * Parse standard position packet
     */
    function parsePositionPacket(data, hasTimestamp) {
        let idx = 0;
        const result = {};

        // Skip timestamp if present
        if (hasTimestamp && data.length >= 7) {
            result.timestamp = data.slice(0, 7);
            idx = 7;
        }

        // Check for compressed vs uncompressed
        const firstChar = data.charAt(idx);
        
        if (firstChar >= '0' && firstChar <= '9') {
            // Uncompressed position
            // Format: DDMM.MMN/DDDMM.MMW
            const latStr = data.slice(idx, idx + 8);
            const latDeg = parseInt(latStr.slice(0, 2), 10);
            const latMin = parseFloat(latStr.slice(2, 7));
            const latDir = latStr.charAt(7);
            
            let lat = latDeg + latMin / 60;
            if (latDir === 'S') lat = -lat;
            
            const symTable = data.charAt(idx + 8);
            
            const lonStr = data.slice(idx + 9, idx + 18);
            const lonDeg = parseInt(lonStr.slice(0, 3), 10);
            const lonMin = parseFloat(lonStr.slice(3, 8));
            const lonDir = lonStr.charAt(8);
            
            let lon = lonDeg + lonMin / 60;
            if (lonDir === 'W') lon = -lon;
            
            const symCode = data.charAt(idx + 18);
            
            result.lat = lat;
            result.lon = lon;
            result.symbol = symTable + symCode;
            
            // Parse extension data (course/speed, altitude, etc.)
            const extension = data.slice(idx + 19);
            if (extension.length >= 7 && extension.charAt(3) === '/') {
                result.course = parseInt(extension.slice(0, 3), 10) || 0;
                result.speed = parseInt(extension.slice(4, 7), 10) || 0; // knots
                result.speed = Math.round(result.speed * 1.15078); // Convert to mph
            }
            
            // Look for altitude /A=NNNNNN
            const altMatch = data.match(/\/A=(-?\d{6})/);
            if (altMatch) {
                result.altitude = parseInt(altMatch[1], 10);
            }
            
            // Comment after position
            const commentStart = idx + 19 + (result.course !== undefined ? 7 : 0);
            if (data.length > commentStart) {
                result.comment = data.slice(commentStart).replace(/\/A=-?\d{6}/, '').trim();
            }
            
        } else if (firstChar === '/' || firstChar === '\\' || (firstChar >= 'A' && firstChar <= 'Z') || (firstChar >= 'a' && firstChar <= 'j')) {
            // Compressed position
            const compressed = parseCompressedPosition(data.slice(idx));
            Object.assign(result, compressed);
        }

        return result;
    }

    /**
     * Parse compressed position format
     */
    function parseCompressedPosition(data) {
        if (data.length < 13) return {};

        const symTable = data.charAt(0);
        const latChars = data.slice(1, 5);
        const lonChars = data.slice(5, 9);
        const symCode = data.charAt(9);
        const csT = data.charCodeAt(10) - 33;
        const speed = data.charCodeAt(11) - 33;
        const compType = data.charCodeAt(12) - 33;

        // Decode lat/lon from base91
        let latVal = 0, lonVal = 0;
        for (let i = 0; i < 4; i++) {
            latVal = latVal * 91 + (latChars.charCodeAt(i) - 33);
            lonVal = lonVal * 91 + (lonChars.charCodeAt(i) - 33);
        }

        const lat = 90 - latVal / 380926;
        const lon = -180 + lonVal / 190463;

        const result = {
            lat: lat,
            lon: lon,
            symbol: symTable + symCode
        };

        // Decode course/speed or altitude based on compression type
        if ((compType & 0x18) === 0x10) {
            // NMEA source with altitude
            result.altitude = Math.pow(1.002, csT * 91 + speed) - 1;
        } else if (csT >= 0 && csT <= 89) {
            // Course/speed
            result.course = csT * 4;
            result.speed = Math.round(Math.pow(1.08, speed) - 1);
        }

        return result;
    }

    /**
     * Parse Mic-E encoded position (from destination callsign + info field)
     */
    function parseMicEPacket(destCall, info) {
        // Mic-E encodes latitude in destination address and longitude in info field
        const result = {};
        
        try {
            // Parse latitude from destination (6 characters)
            let latDigits = '';
            let latDir = 'N';
            let lonOffset = 0;
            let messageCode = 0;
            
            for (let i = 0; i < 6; i++) {
                const c = destCall.charCodeAt(i);
                let digit;
                
                if (c >= 48 && c <= 57) {        // 0-9
                    digit = c - 48;
                } else if (c >= 65 && c <= 74) { // A-J
                    digit = c - 65;
                    if (i < 3) messageCode |= (1 << (2 - i));
                } else if (c >= 75 && c <= 76) { // K-L
                    digit = c - 65;
                } else if (c >= 80 && c <= 90) { // P-Z
                    digit = c - 80;
                    if (i < 3) messageCode |= (1 << (2 - i));
                    if (i === 3) latDir = 'S';
                    if (i === 4) lonOffset = 100;
                    if (i === 5) lonOffset += 1; // West indicator
                }
                
                latDigits += digit;
            }
            
            const latDeg = parseInt(latDigits.slice(0, 2), 10);
            const latMin = parseInt(latDigits.slice(2, 4), 10) + parseInt(latDigits.slice(4, 6), 10) / 100;
            let lat = latDeg + latMin / 60;
            if (latDir === 'S') lat = -lat;
            
            // Parse longitude from info field
            if (info.length >= 3) {
                let lonDeg = info.charCodeAt(0) - 28;
                if (lonOffset >= 100) lonDeg += 100;
                if (lonDeg >= 180 && lonDeg <= 189) lonDeg -= 80;
                if (lonDeg >= 190 && lonDeg <= 199) lonDeg -= 190;
                
                let lonMin = info.charCodeAt(1) - 28;
                if (lonMin >= 60) lonMin -= 60;
                
                let lonMinFrac = info.charCodeAt(2) - 28;
                
                let lon = lonDeg + (lonMin + lonMinFrac / 100) / 60;
                if (lonOffset % 2 === 1) lon = -lon; // West
                
                result.lat = lat;
                result.lon = lon;
            }
            
            // Speed and course
            if (info.length >= 6) {
                const sp = info.charCodeAt(3) - 28;
                const dc = info.charCodeAt(4) - 28;
                const se = info.charCodeAt(5) - 28;
                
                result.speed = Math.round(((sp * 10 + Math.floor(dc / 10)) - 800) * 1.15078);
                result.course = ((dc % 10) * 100 + se) - 400;
                if (result.course < 0) result.course += 400;
            }
            
            // Symbol
            if (info.length >= 8) {
                result.symbol = info.charAt(7) + info.charAt(6);
            }
            
            // Status text after symbol
            if (info.length > 8) {
                result.comment = info.slice(8).trim();
            }
            
        } catch (e) {
            console.warn('APRS: Mic-E parse error:', e);
        }
        
        return result;
    }

    /**
     * Parse message packet
     */
    function parseMessagePacket(data) {
        const result = {};
        
        // Format: ADDRESSEE:message{ID}
        const colonIdx = data.indexOf(':');
        if (colonIdx > 0) {
            result.addressee = data.slice(0, colonIdx).trim();
            
            const msgPart = data.slice(colonIdx + 1);
            const ackMatch = msgPart.match(/^ack(\w+)$/);
            const rejMatch = msgPart.match(/^rej(\w+)$/);
            
            if (ackMatch) {
                result.isAck = true;
                result.messageId = ackMatch[1];
            } else if (rejMatch) {
                result.isRej = true;
                result.messageId = rejMatch[1];
            } else {
                const idMatch = msgPart.match(/\{(\w+)\}$/);
                if (idMatch) {
                    result.messageId = idMatch[1];
                    result.message = msgPart.slice(0, -idMatch[0].length);
                } else {
                    result.message = msgPart;
                }
            }
        }
        
        return result;
    }

    /**
     * Parse object packet
     */
    function parseObjectPacket(data) {
        const result = {};
        
        // Format: NAME_____*DDMM.MMN/DDDMM.MMW...
        if (data.length >= 10) {
            result.objectName = data.slice(0, 9).trim();
            result.isLive = data.charAt(9) === '*'; // * = live, _ = killed
            
            // Position follows
            const posData = data.slice(10);
            const posResult = parsePositionPacket(posData, true);
            Object.assign(result, posResult);
        }
        
        return result;
    }

    /**
     * Parse item packet
     */
    function parseItemPacket(data) {
        const result = {};
        
        // Format: NAME!DDMM.MMN/DDDMM.MMW... or NAME_...
        const delimIdx = data.search(/[!_]/);
        if (delimIdx > 0) {
            result.itemName = data.slice(0, delimIdx);
            result.isLive = data.charAt(delimIdx) === '!';
            
            const posData = data.slice(delimIdx + 1);
            const posResult = parsePositionPacket(posData, false);
            Object.assign(result, posResult);
        }
        
        return result;
    }

    // ==================== Station Management ====================

    /**
     * Handle a parsed APRS packet
     */
    function handleParsedPacket(packet) {
        console.log('APRS packet:', packet.source, packet.type, packet);
        
        // Update or create station
        if (packet.lat !== undefined && packet.lon !== undefined) {
            updateStation(packet);
        }
        
        // Handle messages
        if (packet.type === 'message' && packet.addressee) {
            handleIncomingMessage(packet);
        }
        
        // Handle objects/items
        if (packet.type === 'object' || packet.type === 'item') {
            handleObject(packet);
        }
        
        // Emit event for UI updates
        Events.emit('aprs:packet', packet);
    }

    /**
     * Update station database with new position
     */
    function updateStation(packet) {
        const callsign = packet.source;
        let station = state.stations.get(callsign);
        
        if (!station) {
            station = {
                callsign: callsign,
                track: [],
                packets: 0,
                firstHeard: Date.now()
            };
        }
        
        // Update position
        station.lat = packet.lat;
        station.lon = packet.lon;
        station.lastHeard = Date.now();
        station.packets++;
        
        // Update optional fields
        if (packet.course !== undefined) station.course = packet.course;
        if (packet.speed !== undefined) station.speed = packet.speed;
        if (packet.altitude !== undefined) station.altitude = packet.altitude;
        if (packet.symbol) station.symbol = packet.symbol;
        if (packet.comment) station.status = packet.comment;
        if (packet.path) station.path = packet.path;
        
        // Add to track history
        station.track.push({
            lat: packet.lat,
            lon: packet.lon,
            time: Date.now()
        });
        
        // Limit track history
        if (station.track.length > CONFIG.maxTrackPoints) {
            station.track = station.track.slice(-CONFIG.maxTrackPoints);
        }
        
        // Store
        state.stations.set(callsign, station);
        
        // Limit total stations
        if (state.stations.size > CONFIG.maxStations) {
            pruneOldestStations();
        }
        
        // Save periodically
        if (station.packets % 10 === 0) {
            saveStations();
        }
        
        // Emit position update
        Events.emit('aprs:position', station);
    }

    /**
     * Handle incoming message
     */
    function handleIncomingMessage(packet) {
        const myCall = getMyFullCallsign();
        
        // Check if message is for us
        if (packet.addressee.toUpperCase() === myCall.toUpperCase()) {
            // Send ack if message has ID
            if (packet.messageId && !packet.isAck && !packet.isRej) {
                sendMessageAck(packet.source, packet.messageId);
            }
            
            Events.emit('aprs:message_received', {
                from: packet.source,
                message: packet.message,
                id: packet.messageId,
                time: Date.now()
            });
            
            if (typeof ModalsModule !== 'undefined') {
                ModalsModule.showToast(`APRS msg from ${packet.source}: ${packet.message}`, 'info');
            }
        }
    }

    /**
     * Handle object/item packet
     */
    function handleObject(packet) {
        const name = packet.objectName || packet.itemName;
        if (!name) return;
        
        const objectKey = 'OBJ:' + name;
        
        if (packet.isLive) {
            // Create/update object as a station
            let obj = state.stations.get(objectKey) || {
                callsign: objectKey,
                isObject: true,
                objectName: name,
                creator: packet.source,
                track: [],
                packets: 0,
                firstHeard: Date.now()
            };
            
            obj.lat = packet.lat;
            obj.lon = packet.lon;
            obj.lastHeard = Date.now();
            obj.symbol = packet.symbol;
            obj.status = packet.comment;
            obj.packets++;
            
            state.stations.set(objectKey, obj);
            Events.emit('aprs:object', obj);
        } else {
            // Remove killed object
            state.stations.delete(objectKey);
            Events.emit('aprs:object_killed', { name });
        }
    }

    /**
     * Prune oldest stations when limit exceeded
     */
    function pruneOldestStations() {
        const stations = Array.from(state.stations.values());
        stations.sort((a, b) => a.lastHeard - b.lastHeard);
        
        const toRemove = stations.slice(0, stations.length - CONFIG.maxStations + 50);
        toRemove.forEach(s => state.stations.delete(s.callsign));
    }

    /**
     * Cleanup stale stations
     */
    function cleanupStations() {
        const now = Date.now();
        
        state.stations.forEach((station, callsign) => {
            if (now - station.lastHeard > CONFIG.stationPurge) {
                state.stations.delete(callsign);
            }
        });
    }

    // ==================== Transmit Functions ====================

    /**
     * Send position beacon
     */
    async function sendBeacon(force = false) {
        if (!state.connected || !state.myCallsign) {
            return false;
        }
        
        // Get current position
        let position;
        try {
            position = await getCurrentPosition();
        } catch (e) {
            console.warn('APRS: Could not get position for beacon:', e);
            return false;
        }
        
        // Build position packet
        const packet = buildPositionPacket(
            position.lat,
            position.lon,
            position.course || 0,
            position.speed || 0,
            position.altitude || null,
            state.statusText
        );
        
        // Send
        const success = await transmitPacket(packet);
        
        if (success) {
            state.lastBeaconTime = Date.now();
            state.lastBeaconPosition = position;
            state.stats.packetsSent++;
            Events.emit('aprs:beacon_sent', position);
        }
        
        return success;
    }

    /**
     * Build position packet string
     */
    function buildPositionPacket(lat, lon, course, speed, altitude, comment) {
        // Use uncompressed format for simplicity
        // Format: !DDMM.MMN/DDDMM.MMWsccc/sss/A=NNNNNN comment
        
        const latDir = lat >= 0 ? 'N' : 'S';
        const lonDir = lon >= 0 ? 'E' : 'W';
        lat = Math.abs(lat);
        lon = Math.abs(lon);
        
        const latDeg = Math.floor(lat);
        const latMin = (lat - latDeg) * 60;
        const lonDeg = Math.floor(lon);
        const lonMin = (lon - lonDeg) * 60;
        
        let packet = '='; // Position with messaging capability
        packet += latDeg.toString().padStart(2, '0');
        packet += latMin.toFixed(2).padStart(5, '0');
        packet += latDir;
        packet += state.symbol.charAt(0); // Symbol table
        packet += lonDeg.toString().padStart(3, '0');
        packet += lonMin.toFixed(2).padStart(5, '0');
        packet += lonDir;
        packet += state.symbol.charAt(1); // Symbol code
        
        // Course/speed extension
        const crs = Math.round(course || 0).toString().padStart(3, '0');
        const spd = Math.round((speed || 0) / 1.15078).toString().padStart(3, '0'); // mph to knots
        packet += crs + '/' + spd;
        
        // Altitude
        if (altitude !== null) {
            const alt = Math.round(altitude).toString().padStart(6, '0');
            packet += '/A=' + alt;
        }
        
        // Comment
        if (comment) {
            packet += ' ' + comment.slice(0, 43); // APRS comment limit
        }
        
        return packet;
    }

    /**
     * Send APRS message
     */
    async function sendMessage(addressee, message, wantAck = true) {
        if (!state.connected || !state.myCallsign) {
            return false;
        }
        
        // Build message packet
        // Format: :ADDRESSEE:message{ID}
        const paddedAddr = addressee.toUpperCase().padEnd(9, ' ');
        let packet = ':' + paddedAddr + ':' + message;
        
        if (wantAck) {
            const msgId = generateMessageId();
            packet += '{' + msgId;
        }
        
        return transmitPacket(packet);
    }

    /**
     * Send message acknowledgment
     */
    async function sendMessageAck(addressee, messageId) {
        const paddedAddr = addressee.toUpperCase().padEnd(9, ' ');
        const packet = ':' + paddedAddr + ':ack' + messageId;
        return transmitPacket(packet);
    }

    /**
     * Send tactical object
     */
    async function sendObject(name, lat, lon, symbol, comment, live = true) {
        if (!state.connected || !state.myCallsign) {
            return false;
        }
        
        // Build object packet
        // Format: ;NAME_____*DDMM.MMN/DDDMM.MMWs comment
        const paddedName = name.slice(0, 9).padEnd(9, ' ');
        const status = live ? '*' : '_';
        
        let packet = ';' + paddedName + status;
        
        // Add timestamp (DHM zulu)
        const now = new Date();
        packet += now.getUTCDate().toString().padStart(2, '0');
        packet += now.getUTCHours().toString().padStart(2, '0');
        packet += now.getUTCMinutes().toString().padStart(2, '0');
        packet += 'z';
        
        // Position
        const latDir = lat >= 0 ? 'N' : 'S';
        const lonDir = lon >= 0 ? 'E' : 'W';
        lat = Math.abs(lat);
        lon = Math.abs(lon);
        
        const latDeg = Math.floor(lat);
        const latMin = (lat - latDeg) * 60;
        const lonDeg = Math.floor(lon);
        const lonMin = (lon - lonDeg) * 60;
        
        packet += latDeg.toString().padStart(2, '0');
        packet += latMin.toFixed(2).padStart(5, '0');
        packet += latDir;
        packet += (symbol || '/>').charAt(0);
        packet += lonDeg.toString().padStart(3, '0');
        packet += lonMin.toFixed(2).padStart(5, '0');
        packet += lonDir;
        packet += (symbol || '/>').charAt(1);
        
        if (comment) {
            packet += ' ' + comment.slice(0, 36);
        }
        
        return transmitPacket(packet);
    }

    /**
     * Transmit raw APRS packet
     */
    async function transmitPacket(infoField) {
        if (!state.connected || !state.bleCharacteristic) {
            return false;
        }
        
        try {
            // Build AX.25 frame
            const ax25Frame = buildAX25Frame(infoField);
            
            // Wrap in KISS
            const kissFrame = buildKISSFrame(ax25Frame);
            
            // Send via Bluetooth
            await state.bleCharacteristic.writeValue(kissFrame);
            
            console.log('APRS: Transmitted:', infoField);
            state.stats.packetsSent++;
            
            return true;
            
        } catch (e) {
            console.error('APRS: Transmit error:', e);
            return false;
        }
    }

    /**
     * Build AX.25 UI frame
     */
    function buildAX25Frame(infoField) {
        const destCall = 'APGRDW'; // GridDown tocall
        const destSSID = 0;
        const srcCall = state.myCallsign.toUpperCase();
        const srcSSID = state.mySSID;
        
        // Standard APRS digipeater path
        const digiPath = ['WIDE1-1', 'WIDE2-1'];
        
        // Calculate frame size
        const infoBytes = new TextEncoder().encode(infoField);
        const frameSize = 7 + 7 + (digiPath.length * 7) + 2 + infoBytes.length;
        const frame = new Uint8Array(frameSize);
        let idx = 0;
        
        // Destination address
        const destAddr = encodeCallsign(destCall, destSSID, digiPath.length === 0);
        frame.set(destAddr, idx);
        idx += 7;
        
        // Source address
        const srcAddr = encodeCallsign(srcCall, srcSSID, digiPath.length === 0);
        frame.set(srcAddr, idx);
        idx += 7;
        
        // Digipeater path
        digiPath.forEach((digi, i) => {
            const parts = digi.split('-');
            const call = parts[0];
            const ssid = parseInt(parts[1], 10) || 0;
            const isLast = i === digiPath.length - 1;
            const digiAddr = encodeCallsign(call, ssid, isLast);
            frame.set(digiAddr, idx);
            idx += 7;
        });
        
        // Control field (UI frame)
        frame[idx++] = 0x03;
        
        // PID (no layer 3)
        frame[idx++] = 0xF0;
        
        // Information field
        frame.set(infoBytes, idx);
        
        return frame;
    }

    // ==================== Smart Beaconing ====================

    /**
     * Check if beacon should be sent
     */
    async function checkBeacon() {
        if (!state.beaconEnabled || !state.connected || !state.myCallsign) {
            return;
        }
        
        const now = Date.now();
        const elapsed = (now - state.lastBeaconTime) / 1000;
        
        if (state.smartBeaconing) {
            // Smart beaconing logic
            try {
                const position = await getCurrentPosition();
                
                // Check time thresholds
                if (elapsed >= CONFIG.smartBeaconMaxInterval) {
                    sendBeacon();
                    return;
                }
                
                if (elapsed < CONFIG.smartBeaconMinInterval) {
                    return;
                }
                
                // Check speed-based interval
                const speed = position.speed || 0;
                if (speed >= CONFIG.smartBeaconMinSpeed) {
                    // Moving - calculate adaptive interval
                    const interval = CONFIG.smartBeaconMaxInterval - 
                        (speed / 60) * (CONFIG.smartBeaconMaxInterval - CONFIG.smartBeaconMinInterval);
                    
                    if (elapsed >= interval) {
                        sendBeacon();
                        return;
                    }
                }
                
                // Check turn angle
                if (state.lastBeaconPosition && position.course !== undefined) {
                    const angleDiff = Math.abs(position.course - state.lastBeaconCourse);
                    const normalizedDiff = angleDiff > 180 ? 360 - angleDiff : angleDiff;
                    
                    if (normalizedDiff >= CONFIG.smartBeaconTurnAngle && speed >= CONFIG.smartBeaconMinSpeed) {
                        sendBeacon();
                        state.lastBeaconCourse = position.course;
                        return;
                    }
                }
                
            } catch (e) {
                // No position available
            }
            
        } else {
            // Fixed interval beaconing
            if (elapsed >= state.beaconInterval) {
                sendBeacon();
            }
        }
    }

    // ==================== Distance & Bearing Calculations ====================

    /**
     * Calculate distance between two points using Haversine formula
     * @returns {number} Distance in miles
     */
    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 3959; // Earth's radius in miles
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    /**
     * Calculate bearing from point 1 to point 2
     * @returns {number} Bearing in degrees (0-360)
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
     * Convert bearing to compass direction
     * @param {number} bearing - Bearing in degrees
     * @returns {string} Compass direction (N, NE, E, etc.)
     */
    function bearingToCompass(bearing) {
        const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                           'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
        const index = Math.round(bearing / 22.5) % 16;
        return directions[index];
    }

    /**
     * Get distance and bearing info to an APRS station
     * @param {string} callsign - Station callsign
     * @param {Object} fromPosition - {lat, lon} of observer
     * @returns {Object|null} Distance info or null if unavailable
     */
    function getDistanceToStation(callsign, fromPosition) {
        if (!fromPosition || fromPosition.lat === undefined || fromPosition.lon === undefined) {
            return null;
        }
        
        const station = state.stations.get(callsign);
        if (!station || station.lat === undefined || station.lon === undefined) {
            return null;
        }
        
        const distance = calculateDistance(fromPosition.lat, fromPosition.lon, station.lat, station.lon);
        const bearing = calculateBearing(fromPosition.lat, fromPosition.lon, station.lat, station.lon);
        const compass = bearingToCompass(bearing);
        
        return {
            distance: distance,
            bearing: bearing,
            compass: compass,
            formatted: distance < 0.1 ? `${Math.round(distance * 5280)} ft` : `${distance.toFixed(1)} mi`,
            bearingFormatted: `${compass} (${Math.round(bearing)}°)`
        };
    }

    /**
     * Get all stations with distance info, sorted by distance
     * @param {Object} fromPosition - {lat, lon} of observer
     * @returns {Array} Stations with distance info, sorted nearest first
     */
    function getStationsWithDistance(fromPosition) {
        if (!fromPosition || fromPosition.lat === undefined || fromPosition.lon === undefined) {
            return Array.from(state.stations.values());
        }
        
        const stationsWithDist = [];
        
        state.stations.forEach((station, callsign) => {
            if (station.lat !== undefined && station.lon !== undefined) {
                const distInfo = getDistanceToStation(callsign, fromPosition);
                stationsWithDist.push({
                    ...station,
                    distanceInfo: distInfo
                });
            } else {
                stationsWithDist.push({
                    ...station,
                    distanceInfo: null
                });
            }
        });
        
        // Sort by distance (nearest first), stations without position at end
        stationsWithDist.sort((a, b) => {
            if (!a.distanceInfo && !b.distanceInfo) return 0;
            if (!a.distanceInfo) return 1;
            if (!b.distanceInfo) return -1;
            return a.distanceInfo.distance - b.distanceInfo.distance;
        });
        
        return stationsWithDist;
    }

    // ==================== Utilities ====================

    /**
     * Get current position from GPS or manual entry
     */
    function getCurrentPosition() {
        return new Promise((resolve, reject) => {
            // Try to get from GPSModule first (includes manual position support)
            if (typeof GPSModule !== 'undefined') {
                const gpsPos = GPSModule.getPosition();
                if (gpsPos && gpsPos.lat && gpsPos.lon) {
                    resolve({
                        lat: gpsPos.lat,
                        lon: gpsPos.lon,
                        altitude: gpsPos.altitude,
                        speed: gpsPos.speed || 0,
                        course: gpsPos.heading || 0,
                        isManual: gpsPos.isManual || false
                    });
                    return;
                }
            }
            
            // Fallback to browser geolocation if no position available
            if (!navigator.geolocation) {
                reject(new Error('Geolocation not available'));
                return;
            }
            
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    resolve({
                        lat: pos.coords.latitude,
                        lon: pos.coords.longitude,
                        altitude: pos.coords.altitude ? pos.coords.altitude * 3.28084 : null, // meters to feet
                        speed: pos.coords.speed ? pos.coords.speed * 2.237 : 0, // m/s to mph
                        course: pos.coords.heading || 0
                    });
                },
                (err) => reject(err),
                { enableHighAccuracy: true, timeout: 10000 }
            );
        });
    }

    /**
     * Generate message ID
     */
    function generateMessageId() {
        return Math.random().toString(36).substring(2, 7).toUpperCase();
    }

    /**
     * Get full callsign with SSID
     */
    function getMyFullCallsign() {
        if (!state.myCallsign) return '';
        return state.mySSID > 0 ? `${state.myCallsign}-${state.mySSID}` : state.myCallsign;
    }

    /**
     * Get symbol info
     */
    function getSymbolInfo(symbol) {
        return APRS_SYMBOLS[symbol] || { icon: '📍', name: 'Unknown' };
    }

    // ==================== Map Rendering ====================

    /**
     * Render APRS stations on map canvas
     */
    function renderOnMap(ctx, width, height, latLonToPixel) {
        const now = Date.now();
        
        state.stations.forEach((station, callsign) => {
            if (station.lat === undefined || station.lon === undefined) return;
            
            const pixel = latLonToPixel(station.lat, station.lon);
            if (pixel.x < -50 || pixel.x > width + 50 || pixel.y < -50 || pixel.y > height + 50) {
                return;
            }
            
            const age = now - station.lastHeard;
            const isFresh = age < CONFIG.stationTimeout;
            const opacity = isFresh ? 1 : Math.max(0.3, 1 - (age - CONFIG.stationTimeout) / CONFIG.stationTimeout);
            
            // Draw track tail
            if (CONFIG.showTrackTails && station.track && station.track.length > 1) {
                const tailPoints = station.track.slice(-CONFIG.trackTailLength);
                ctx.beginPath();
                ctx.strokeStyle = `rgba(59, 130, 246, ${opacity * 0.5})`;
                ctx.lineWidth = 2;
                
                tailPoints.forEach((pt, i) => {
                    const px = latLonToPixel(pt.lat, pt.lon);
                    if (i === 0) ctx.moveTo(px.x, px.y);
                    else ctx.lineTo(px.x, px.y);
                });
                ctx.stroke();
            }
            
            // Draw station marker
            const symbolInfo = getSymbolInfo(station.symbol);
            const isObject = station.isObject;
            const markerSize = isObject ? 14 : 18;
            const bgColor = isObject ? 'rgba(236, 72, 153, 0.9)' : 'rgba(59, 130, 246, 0.9)';
            
            // Outer ring
            ctx.beginPath();
            ctx.arc(pixel.x, pixel.y, markerSize, 0, Math.PI * 2);
            ctx.fillStyle = bgColor;
            ctx.globalAlpha = opacity;
            ctx.fill();
            
            // Inner circle
            ctx.beginPath();
            ctx.arc(pixel.x, pixel.y, markerSize - 4, 0, Math.PI * 2);
            ctx.fillStyle = '#1a1f2e';
            ctx.fill();
            
            // Symbol
            ctx.font = `${isObject ? 12 : 14}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#fff';
            ctx.fillText(symbolInfo.icon, pixel.x, pixel.y);
            
            // Direction indicator
            if (station.course !== undefined && station.speed > 0) {
                const angle = (station.course - 90) * Math.PI / 180;
                const arrowLen = markerSize + 8;
                ctx.beginPath();
                ctx.moveTo(pixel.x, pixel.y);
                ctx.lineTo(
                    pixel.x + Math.cos(angle) * arrowLen,
                    pixel.y + Math.sin(angle) * arrowLen
                );
                ctx.strokeStyle = bgColor;
                ctx.lineWidth = 3;
                ctx.stroke();
            }
            
            // Callsign label
            ctx.font = '10px system-ui, sans-serif';
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = 'rgba(0,0,0,0.7)';
            ctx.lineWidth = 3;
            ctx.textAlign = 'center';
            const label = isObject ? station.objectName : station.callsign;
            ctx.strokeText(label, pixel.x, pixel.y + markerSize + 12);
            ctx.fillText(label, pixel.x, pixel.y + markerSize + 12);
            
            ctx.globalAlpha = 1;
        });
    }

    // ==================== Public API ====================

    return {
        init,
        destroy,
        
        // Connection
        connectBluetooth,
        disconnect,
        isConnected: () => state.connected,
        isConnecting: () => state.connecting,
        getConnectionType: () => state.connectionType,
        
        // Configuration
        setCallsign: (call, ssid = 9) => {
            state.myCallsign = call.toUpperCase().replace(/[^A-Z0-9]/g, '');
            state.mySSID = Math.min(15, Math.max(0, parseInt(ssid, 10) || 0));
            saveSettings();
        },
        getCallsign: () => getMyFullCallsign(),
        setSymbol: (sym) => { state.symbol = sym; saveSettings(); },
        getSymbol: () => state.symbol,
        setStatusText: (text) => { state.statusText = text; saveSettings(); },
        getStatusText: () => state.statusText,
        setBeaconEnabled: (enabled) => { state.beaconEnabled = enabled; saveSettings(); },
        isBeaconEnabled: () => state.beaconEnabled,
        setBeaconInterval: (seconds) => { state.beaconInterval = seconds; saveSettings(); },
        getBeaconInterval: () => state.beaconInterval,
        setSmartBeaconing: (enabled) => { state.smartBeaconing = enabled; saveSettings(); },
        isSmartBeaconing: () => state.smartBeaconing,
        
        // Transmit
        sendBeacon,
        sendMessage,
        sendObject,
        
        // Station data
        getStations: () => Array.from(state.stations.values()),
        getStation: (callsign) => state.stations.get(callsign),
        clearStations: () => { state.stations.clear(); saveStations(); },
        
        // Demo/Training API - allows external tools to inject simulated stations
        injectDemoStations: (demoStations) => {
            // Only allow in demo mode for security
            if (!window.__GRIDDOWN_DEMO_MODE__ && !window.__SCENEFORGE_DEMO_MODE__) {
                console.warn('[APRS] injectDemoStations requires demo mode to be enabled');
                return false;
            }
            if (!Array.isArray(demoStations)) return false;
            for (const s of demoStations) {
                if (s.callsign) {
                    s._injected = true; // Mark as demo station
                    s._injectedAt = Date.now();
                    state.stations.set(s.callsign, s);
                }
            }
            console.log(`[APRS] Injected ${demoStations.length} demo stations`);
            return true;
        },
        
        // Clear only injected demo stations
        clearDemoStations: () => {
            let cleared = 0;
            for (const [callsign, station] of state.stations) {
                if (station._injected) {
                    state.stations.delete(callsign);
                    cleared++;
                }
            }
            console.log(`[APRS] Cleared ${cleared} demo stations`);
            return cleared;
        },
        
        // Distance & Bearing
        calculateDistance,
        calculateBearing,
        bearingToCompass,
        getDistanceToStation,
        getStationsWithDistance,
        
        // Stats
        getStats: () => ({ ...state.stats }),
        
        // Symbol lookup
        getSymbolInfo,
        APRS_SYMBOLS,
        
        // Map rendering
        renderOnMap
    };
})();

window.APRSModule = APRSModule;
