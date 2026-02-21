/**
 * GridDown SARSAT Module - 406 MHz Beacon Receiver Integration
 * Receives and displays PLT/ELB/EPIRB emergency beacon data from an external receiver
 * 
 * Beacon Types:
 * - PLB (Personal Locator Beacon) - Hikers, adventurers
 * - ELT (Emergency Locator Transmitter) - Aircraft
 * - EPIRB (Emergency Position-Indicating Radio Beacon) - Maritime
 * 
 * Protocol: COSPAS-SARSAT 406 MHz (C/S T.001)
 */
const SarsatModule = (function() {
    'use strict';

    // ==================== Configuration ====================
    
    const CONFIG = {
        // Connection settings
        defaultBaudRate: 115200,           // Serial connection baud rate
        webSocketPort: 8406,               // WebSocket server port
        reconnectDelay: 5000,              // Reconnect delay in ms
        maxReconnectAttempts: 12,          // Max auto-reconnect attempts (60s total)
        
        // Discovery settings
        discoveryTimeout: 2000,            // Per-address probe timeout in ms
        discoveryPort: 8406,               // Default port to probe
        statusTimeout: 45000,              // Consider receiver offline after 45s without status (3x heartbeat)
        commandTimeout: 10000,             // Timeout for command responses in ms
        commonAddresses: [                 // Addresses to probe during discovery
            'sarsat-rx.local',
            'sarsat.local',
            'raspberrypi.local',
            'griddown-sarsat.local',
            '192.168.4.1',                 // Common AP mode address
            '192.168.1.100',
            '192.168.1.101',
            '10.0.0.100'
        ],
        
        // Beacon management
        beaconTimeout: 3600000,            // 1 hour - fade beacons not heard
        beaconPurge: 86400000,             // 24 hours - remove from database
        maxBeacons: 200,                   // Maximum beacons to track
        maxPositionHistory: 20,            // Position history per beacon
        
        // Display settings
        showTrackTails: true,
        trackTailLength: 10,
        labelMinZoom: 8,
        
        // 406 MHz Frequencies
        frequencies: [406.025, 406.028, 406.037, 406.040], // MHz
        
        // Message parsing
        syncPattern: 0x2CC,                // 15-bit sync word
        shortMessageBits: 112,
        longMessageBits: 144
    };

    // Beacon type definitions
    const BEACON_TYPES = {
        ELT: { 
            id: 'ELT', 
            name: 'Emergency Locator Transmitter', 
            icon: '✈️', 
            color: '#3b82f6',
            category: 'aviation'
        },
        EPIRB: { 
            id: 'EPIRB', 
            name: 'Emergency Position-Indicating Radio Beacon', 
            icon: '⚓', 
            color: '#06b6d4',
            category: 'maritime'
        },
        PLB: { 
            id: 'PLB', 
            name: 'Personal Locator Beacon', 
            icon: '🚶', 
            color: '#10b981',
            category: 'personal'
        },
        SSAS: { 
            id: 'SSAS', 
            name: 'Ship Security Alert System', 
            icon: '🚨', 
            color: '#ef4444',
            category: 'maritime'
        },
        UNKNOWN: { 
            id: 'UNKNOWN', 
            name: 'Unknown Beacon', 
            icon: '📍', 
            color: '#6b7280',
            category: 'unknown'
        }
    };

    // Country code mapping (partial - first 100 common codes)
    const COUNTRY_CODES = {
        201: 'Albania', 202: 'Andorra', 203: 'Austria', 204: 'Azores',
        205: 'Belgium', 206: 'Belarus', 207: 'Bulgaria', 208: 'Vatican',
        209: 'Cyprus', 210: 'Cyprus', 211: 'Germany', 212: 'Cyprus',
        213: 'Georgia', 214: 'Moldova', 215: 'Malta', 216: 'Armenia',
        218: 'Germany', 219: 'Denmark', 220: 'Denmark', 224: 'Spain',
        225: 'Spain', 226: 'France', 227: 'France', 228: 'France',
        230: 'Finland', 231: 'Faroe Islands', 232: 'United Kingdom',
        233: 'United Kingdom', 234: 'United Kingdom', 235: 'United Kingdom',
        236: 'Gibraltar', 237: 'Greece', 238: 'Croatia', 239: 'Greece',
        240: 'Greece', 241: 'Greece', 242: 'Morocco', 243: 'Hungary',
        244: 'Netherlands', 245: 'Netherlands', 246: 'Netherlands',
        247: 'Italy', 248: 'Malta', 249: 'Malta', 250: 'Ireland',
        251: 'Iceland', 252: 'Liechtenstein', 253: 'Luxembourg',
        254: 'Monaco', 255: 'Madeira', 256: 'Malta', 257: 'Norway',
        258: 'Norway', 259: 'Norway', 261: 'Poland', 262: 'Montenegro',
        263: 'Portugal', 264: 'Romania', 265: 'Sweden', 266: 'Sweden',
        267: 'Slovak Republic', 268: 'San Marino', 269: 'Switzerland',
        270: 'Czech Republic', 271: 'Turkey', 272: 'Ukraine',
        273: 'Russian Federation', 274: 'North Macedonia', 275: 'Latvia',
        276: 'Estonia', 277: 'Lithuania', 278: 'Slovenia', 279: 'Serbia',
        301: 'Anguilla', 303: 'Alaska (USA)', 304: 'Antigua and Barbuda',
        305: 'Antigua and Barbuda', 306: 'Curacao', 307: 'Aruba',
        308: 'Bahamas', 309: 'Bahamas', 310: 'Bermuda', 311: 'Bahamas',
        312: 'Belize', 314: 'Barbados', 316: 'Canada', 319: 'Cayman Islands',
        321: 'Costa Rica', 323: 'Cuba', 325: 'Dominica', 327: 'Dominican Republic',
        329: 'Guadeloupe', 330: 'Grenada', 331: 'Greenland', 332: 'Guatemala',
        334: 'Honduras', 336: 'Haiti', 338: 'Hawaii (USA)', 339: 'Jamaica',
        341: 'Saint Kitts and Nevis', 343: 'Saint Lucia', 345: 'Mexico',
        347: 'Martinique', 348: 'Montserrat', 350: 'Nicaragua', 351: 'Panama',
        352: 'Panama', 353: 'Panama', 354: 'Panama', 355: 'Panama',
        356: 'Panama', 357: 'Panama', 358: 'Puerto Rico (USA)',
        359: 'El Salvador', 361: 'Saint Pierre and Miquelon',
        362: 'Trinidad and Tobago', 364: 'Turks and Caicos Islands',
        366: 'United States', 367: 'United States', 368: 'United States',
        369: 'United States', 370: 'Panama', 371: 'Panama', 372: 'Panama',
        373: 'Panama', 374: 'Panama', 375: 'Saint Vincent and the Grenadines',
        376: 'Saint Vincent and the Grenadines', 377: 'Saint Vincent and the Grenadines',
        378: 'British Virgin Islands', 379: 'US Virgin Islands'
    };

    // ==================== State ====================
    
    let state = {
        // Connection
        connected: false,
        connecting: false,
        connectionType: null,        // 'serial', 'websocket', 'bluetooth'
        connectionUrl: null,         // Active WebSocket URL when connected
        port: null,
        reader: null,
        writer: null,
        webSocket: null,
        
        // Auto-reconnect
        autoReconnect: true,
        reconnectAttempts: 0,
        reconnectTimer: null,
        
        // Discovery
        discovering: false,
        discoveryResults: [],        // Array of { url, latency, status }
        
        // Saved receivers
        savedReceivers: [],          // Array of { url, name, lastConnected, lastSeen }
        
        // Receiver status (from heartbeat)
        receiverStatus: null,        // Latest status message from receiver
        lastStatusTime: null,        // When last status was received
        statusTimeoutTimer: null,    // Timer for detecting stale connection
        receiverOnline: false,       // True if heartbeat received within timeout
        
        // Command tracking
        pendingCommands: new Map(),  // requestId -> { resolve, reject, timeout }
        commandIdCounter: 0,
        
        // Beacon database
        beacons: new Map(),          // hexId -> beacon object
        
        // Receive buffer
        rxBuffer: '',
        
        // Statistics
        stats: {
            beaconsReceived: 0,
            messagesDecoded: 0,
            crcErrors: 0,
            lastMessageTime: null
        },
        
        // Settings
        settings: {
            autoCreateWaypoints: true,
            playAlertSound: true,
            showTestBeacons: false,
            wsServerUrl: 'ws://localhost:8406'
        }
    };
    
    // Scoped event manager for cleanup
    let sarsatEvents = null;
    let initialized = false;

    // ==================== Initialization ====================

    /**
     * Initialize SARSAT module
     */
    function init() {
        if (initialized) {
            console.debug('[SARSAT] Module already initialized');
            return;
        }
        
        // Create scoped event manager if EventManager exists
        if (typeof EventManager !== 'undefined') {
            sarsatEvents = EventManager.createScopedManager(EventManager.SCOPES?.SARSAT || 'sarsat');
        }
        
        loadSettings();
        loadBeacons();
        
        // Start beacon cleanup timer
        if (sarsatEvents) {
            sarsatEvents.setInterval(cleanupBeacons, 60000);
        } else {
            setInterval(cleanupBeacons, 60000);
        }
        
        initialized = true;
        console.log('[SARSAT] Module initialized');
    }
    
    /**
     * Cleanup SARSAT module resources
     */
    function destroy() {
        if (state.connected) {
            disconnect();
        }
        
        _stopAutoReconnect();
        _clearStatusTimeout();
        
        if (sarsatEvents) {
            sarsatEvents.clear();
            sarsatEvents = null;
        }
        
        initialized = false;
        console.log('[SARSAT] Module destroyed');
    }

    /**
     * Load settings from storage
     */
    async function loadSettings() {
        try {
            if (typeof Storage !== 'undefined' && Storage.Settings) {
                const saved = await Storage.Settings.get('sarsat');
                if (saved) {
                    state.settings = { ...state.settings, ...saved };
                }
                // Load saved receivers
                const receivers = await Storage.Settings.get('sarsat_receivers');
                if (receivers && Array.isArray(receivers)) {
                    state.savedReceivers = receivers;
                }
            }
        } catch (e) {
            console.warn('[SARSAT] Could not load settings:', e);
        }
    }
    
    /**
     * Save settings to storage
     */
    async function saveSettings() {
        try {
            if (typeof Storage !== 'undefined' && Storage.Settings) {
                await Storage.Settings.set('sarsat', state.settings);
            }
        } catch (e) {
            console.warn('[SARSAT] Could not save settings:', e);
        }
    }
    
    /**
     * Load beacons from storage
     */
    async function loadBeacons() {
        try {
            if (typeof Storage !== 'undefined' && Storage.Settings) {
                const saved = await Storage.Settings.get('sarsat_beacons');
                if (saved && Array.isArray(saved)) {
                    saved.forEach(b => {
                        state.beacons.set(b.hexId, b);
                    });
                }
            }
        } catch (e) {
            console.warn('[SARSAT] Could not load beacons:', e);
        }
    }
    
    /**
     * Save beacons to storage
     */
    async function saveBeacons() {
        try {
            if (typeof Storage !== 'undefined' && Storage.Settings) {
                const beaconArray = Array.from(state.beacons.values());
                await Storage.Settings.set('sarsat_beacons', beaconArray);
            }
        } catch (e) {
            console.warn('[SARSAT] Could not save beacons:', e);
        }
    }
    
    /**
     * Cleanup old beacons
     */
    function cleanupBeacons() {
        const now = Date.now();
        let removed = 0;
        
        state.beacons.forEach((beacon, hexId) => {
            if (now - beacon.lastHeard > CONFIG.beaconPurge) {
                state.beacons.delete(hexId);
                removed++;
            }
        });
        
        if (removed > 0) {
            console.log(`[SARSAT] Purged ${removed} stale beacons`);
            saveBeacons();
        }
    }

    // ==================== Saved Receivers ====================
    
    /**
     * Save a receiver to the saved list
     */
    function saveReceiver(url, name) {
        const existing = state.savedReceivers.find(r => r.url === url);
        if (existing) {
            existing.name = name || existing.name;
            existing.lastConnected = Date.now();
        } else {
            state.savedReceivers.push({
                url: url,
                name: name || _extractReceiverName(url),
                lastConnected: Date.now(),
                lastSeen: Date.now()
            });
        }
        _persistReceivers();
    }
    
    /**
     * Remove a saved receiver
     */
    function removeReceiver(url) {
        state.savedReceivers = state.savedReceivers.filter(r => r.url !== url);
        _persistReceivers();
    }
    
    /**
     * Rename a saved receiver
     */
    function renameReceiver(url, newName) {
        const receiver = state.savedReceivers.find(r => r.url === url);
        if (receiver) {
            receiver.name = newName;
            _persistReceivers();
        }
    }
    
    /**
     * Get saved receivers list
     */
    function getSavedReceivers() {
        return [...state.savedReceivers].sort((a, b) => (b.lastConnected || 0) - (a.lastConnected || 0));
    }
    
    /**
     * Extract a friendly name from a WebSocket URL
     */
    function _extractReceiverName(url) {
        try {
            const parsed = new URL(url);
            const host = parsed.hostname;
            if (host.endsWith('.local')) return host.replace('.local', '');
            if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return `Receiver @ ${host}`;
            return host;
        } catch (e) {
            return 'SARSAT Receiver';
        }
    }
    
    /**
     * Persist receivers to storage
     */
    async function _persistReceivers() {
        try {
            if (typeof Storage !== 'undefined' && Storage.Settings) {
                await Storage.Settings.set('sarsat_receivers', state.savedReceivers);
            }
        } catch (e) {
            console.warn('[SARSAT] Could not save receivers:', e);
        }
    }
    
    // ==================== Network Discovery ====================
    
    /**
     * Scan for SARSAT receivers on the network
     * Probes common addresses and any custom addresses
     * @param {string[]} extraAddresses - Additional addresses to probe
     * @returns {Promise<Array>} Array of { url, latency, reachable }
     */
    async function discoverReceivers(extraAddresses = []) {
        if (state.discovering) {
            console.warn('[SARSAT] Discovery already in progress');
            return state.discoveryResults;
        }
        
        state.discovering = true;
        state.discoveryResults = [];
        
        if (typeof Events !== 'undefined') {
            Events.emit('sarsat:discovery_start');
        }
        
        // Build list of addresses to probe
        const addresses = [...new Set([
            ...CONFIG.commonAddresses,
            ...extraAddresses,
            // Also probe saved receiver hosts
            ...state.savedReceivers.map(r => {
                try { return new URL(r.url).hostname; } catch(e) { return null; }
            }).filter(Boolean)
        ])];
        
        const port = CONFIG.discoveryPort;
        
        // Probe all addresses in parallel with timeout
        const probePromises = addresses.map(addr => _probeAddress(addr, port));
        const results = await Promise.all(probePromises);
        
        state.discoveryResults = results.filter(r => r.reachable);
        state.discovering = false;
        
        // Update lastSeen on saved receivers that were found
        state.discoveryResults.forEach(result => {
            const saved = state.savedReceivers.find(r => r.url === result.url);
            if (saved) {
                saved.lastSeen = Date.now();
            }
        });
        if (state.discoveryResults.length > 0) {
            _persistReceivers();
        }
        
        if (typeof Events !== 'undefined') {
            Events.emit('sarsat:discovery_complete', { 
                found: state.discoveryResults.length,
                results: state.discoveryResults
            });
        }
        
        console.log(`[SARSAT] Discovery complete: ${state.discoveryResults.length} receiver(s) found`);
        return state.discoveryResults;
    }
    
    /**
     * Probe a single address for a SARSAT WebSocket server
     */
    async function _probeAddress(host, port) {
        const url = `ws://${host}:${port}`;
        const startTime = performance.now();
        
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                resolve({ url, host, latency: null, reachable: false });
            }, CONFIG.discoveryTimeout);
            
            try {
                const ws = new WebSocket(url);
                
                ws.onopen = () => {
                    clearTimeout(timeout);
                    const latency = Math.round(performance.now() - startTime);
                    ws.close();
                    resolve({ url, host, latency, reachable: true });
                };
                
                ws.onerror = () => {
                    clearTimeout(timeout);
                    resolve({ url, host, latency: null, reachable: false });
                };
                
            } catch (e) {
                clearTimeout(timeout);
                resolve({ url, host, latency: null, reachable: false });
            }
        });
    }
    
    // ==================== Auto-Reconnect ====================
    
    /**
     * Start auto-reconnect loop
     */
    function _startAutoReconnect() {
        if (!state.autoReconnect || !state.connectionUrl) return;
        if (state.reconnectTimer) return;
        
        state.reconnectAttempts = 0;
        _attemptReconnect();
    }
    
    /**
     * Attempt a single reconnect
     */
    function _attemptReconnect() {
        if (state.connected || !state.autoReconnect) {
            _stopAutoReconnect();
            return;
        }
        
        if (state.reconnectAttempts >= CONFIG.maxReconnectAttempts) {
            console.log('[SARSAT] Max reconnect attempts reached, giving up');
            _stopAutoReconnect();
            if (typeof Events !== 'undefined') {
                Events.emit('sarsat:reconnect_failed');
            }
            return;
        }
        
        state.reconnectAttempts++;
        console.log(`[SARSAT] Reconnect attempt ${state.reconnectAttempts}/${CONFIG.maxReconnectAttempts}`);
        
        connectWebSocket(state.connectionUrl).then(() => {
            console.log('[SARSAT] Reconnected successfully');
            _stopAutoReconnect();
        }).catch(() => {
            state.reconnectTimer = setTimeout(_attemptReconnect, CONFIG.reconnectDelay);
        });
    }
    
    /**
     * Stop auto-reconnect
     */
    function _stopAutoReconnect() {
        if (state.reconnectTimer) {
            clearTimeout(state.reconnectTimer);
            state.reconnectTimer = null;
        }
        state.reconnectAttempts = 0;
    }

    // ==================== Connection Management ====================

    /**
     * Connect to receiver via Web Serial API
     */
    async function connectSerial() {
        if (state.connected || state.connecting) {
            console.warn('[SARSAT] Already connected or connecting');
            return;
        }
        
        if (!navigator.serial) {
            throw new Error('Web Serial API not supported. Use Chrome or Edge.');
        }
        
        state.connecting = true;
        
        try {
            // Request serial port
            const port = await navigator.serial.requestPort();
            await port.open({ baudRate: CONFIG.defaultBaudRate });
            
            state.port = port;
            state.connectionType = 'serial';
            state.connected = true;
            state.connecting = false;
            
            // Start reading
            readSerialLoop();
            
            console.log('[SARSAT] Connected via Web Serial');
            
            if (typeof Events !== 'undefined') {
                Events.emit('sarsat:connected', { type: 'serial' });
            }
            
        } catch (e) {
            state.connecting = false;
            console.error('[SARSAT] Serial connection failed:', e);
            throw e;
        }
    }
    
    /**
     * Connect to receiver via WebSocket
     */
    async function connectWebSocket(url) {
        if (state.connected || state.connecting) {
            console.warn('[SARSAT] Already connected or connecting');
            return;
        }
        
        const wsUrl = url || state.settings.wsServerUrl;
        state.connecting = true;
        
        return new Promise((resolve, reject) => {
            try {
                const ws = new WebSocket(wsUrl);
                
                ws.onopen = () => {
                    state.webSocket = ws;
                    state.connectionType = 'websocket';
                    state.connectionUrl = wsUrl;
                    state.connected = true;
                    state.connecting = false;
                    
                    // Auto-save this receiver on successful connection
                    saveReceiver(wsUrl);
                    
                    console.log('[SARSAT] Connected via WebSocket to', wsUrl);
                    
                    if (typeof Events !== 'undefined') {
                        Events.emit('sarsat:connected', { type: 'websocket', url: wsUrl });
                    }
                    
                    // Auto-request beacon replay from receiver's database
                    // Uses setTimeout to avoid blocking the connection handler
                    setTimeout(() => {
                        if (state.connected && state.webSocket) {
                            requestRecentBeacons().catch(e => {
                                console.debug('[SARSAT] Beacon replay request failed:', e.message);
                            });
                        }
                    }, 500);
                    
                    resolve();
                };
                
                ws.onmessage = (event) => {
                    handleIncomingData(event.data);
                };
                
                ws.onerror = (error) => {
                    console.error('[SARSAT] WebSocket error:', error);
                    state.connecting = false;
                    reject(error);
                };
                
                ws.onclose = () => {
                    onDisconnected();
                };
                
            } catch (e) {
                state.connecting = false;
                reject(e);
            }
        });
    }
    
    /**
     * Disconnect from receiver
     */
    async function disconnect() {
        if (!state.connected) return;
        
        // Flag as user-initiated so onDisconnected skips auto-reconnect
        state._userDisconnect = true;
        _stopAutoReconnect();
        
        if (state.webSocket) {
            state.webSocket.close();
            state.webSocket = null;
        }
        
        if (state.port) {
            try {
                if (state.reader) {
                    await state.reader.cancel();
                    state.reader = null;
                }
                await state.port.close();
            } catch (e) {
                console.warn('[SARSAT] Error closing port:', e);
            }
            state.port = null;
        }
        
        onDisconnected();
    }
    
    /**
     * Handle disconnection
     */
    function onDisconnected() {
        const wasWebSocket = state.connectionType === 'websocket';
        const previousUrl = state.connectionUrl;
        
        state.connected = false;
        state.connectionType = null;
        
        // Clear status tracking
        _clearStatusTimeout();
        
        // Reject any pending commands
        state.pendingCommands.forEach((pending, id) => {
            clearTimeout(pending.timeout);
            pending.reject(new Error('Disconnected'));
        });
        state.pendingCommands.clear();
        
        console.log('[SARSAT] Disconnected');
        
        if (typeof Events !== 'undefined') {
            Events.emit('sarsat:disconnected');
        }
        
        // Auto-reconnect for WebSocket connections (not user-initiated disconnects)
        if (wasWebSocket && previousUrl && state.autoReconnect && !state._userDisconnect) {
            _startAutoReconnect();
        }
        state._userDisconnect = false;
    }
    
    /**
     * Serial read loop
     */
    async function readSerialLoop() {
        if (!state.port?.readable) return;
        
        const decoder = new TextDecoderStream();
        const readableStreamClosed = state.port.readable.pipeTo(decoder.writable);
        state.reader = decoder.readable.getReader();
        
        try {
            while (true) {
                const { value, done } = await state.reader.read();
                if (done) break;
                if (value) {
                    handleIncomingData(value);
                }
            }
        } catch (e) {
            console.error('[SARSAT] Read error:', e);
        } finally {
            state.reader.releaseLock();
        }
    }

    // ==================== Message Processing ====================

    /**
     * Handle incoming data from receiver
     */
    function handleIncomingData(data) {
        state.rxBuffer += data;
        
        // Process complete JSON messages (newline-delimited)
        let lines = state.rxBuffer.split('\n');
        state.rxBuffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        lines.forEach(line => {
            line = line.trim();
            if (!line) return;
            
            try {
                const message = JSON.parse(line);
                _routeMessage(message);
            } catch (e) {
                // Not JSON - might be raw hex data
                if (/^[0-9A-Fa-f]{22,30}$/.test(line)) {
                    processHexMessage(line);
                } else {
                    console.debug('[SARSAT] Unrecognized data from device:', line.substring(0, 80));
                }
            }
        });
    }
    
    /**
     * Route incoming JSON message based on msgType
     */
    function _routeMessage(message) {
        const msgType = message.msgType;
        
        if (msgType === 'status') {
            _handleStatus(message);
        } else if (msgType === 'response') {
            _handleCommandResponse(message);
        } else if (msgType === 'beacon') {
            // New-format beacon with msgType tag
            processBeaconMessage(message);
        } else if (message.hexId) {
            // Legacy format: no msgType, but has hexId → it's a beacon
            processBeaconMessage(message);
        } else {
            console.debug('[SARSAT] Unknown message type:', msgType, message);
        }
    }
    
    /**
     * Handle receiver status heartbeat
     */
    function _handleStatus(status) {
        state.receiverStatus = status;
        state.lastStatusTime = Date.now();
        state.receiverOnline = true;
        
        // Reset status timeout
        _resetStatusTimeout();
        
        if (typeof Events !== 'undefined') {
            Events.emit('sarsat:status_update', status);
        }
        
        // Log welcome message on first connect
        if (status.welcome) {
            console.log('[SARSAT] Receiver welcome status received. Uptime:', 
                Math.round(status.uptimeSeconds || 0), 's, SDR:', status.sdrConnected);
        }
    }
    
    /**
     * Start/reset the status timeout timer
     * If no heartbeat received within timeout, mark receiver as offline
     */
    function _resetStatusTimeout() {
        if (state.statusTimeoutTimer) {
            clearTimeout(state.statusTimeoutTimer);
        }
        state.statusTimeoutTimer = setTimeout(() => {
            state.receiverOnline = false;
            console.warn('[SARSAT] Receiver heartbeat timeout - receiver may be offline');
            if (typeof Events !== 'undefined') {
                Events.emit('sarsat:receiver_offline');
            }
        }, CONFIG.statusTimeout);
    }
    
    /**
     * Clear the status timeout timer
     */
    function _clearStatusTimeout() {
        if (state.statusTimeoutTimer) {
            clearTimeout(state.statusTimeoutTimer);
            state.statusTimeoutTimer = null;
        }
        state.receiverOnline = false;
        state.receiverStatus = null;
        state.lastStatusTime = null;
    }
    
    /**
     * Handle command response from receiver
     */
    function _handleCommandResponse(response) {
        const requestId = response.requestId;
        
        if (requestId && state.pendingCommands.has(requestId)) {
            const pending = state.pendingCommands.get(requestId);
            clearTimeout(pending.timeout);
            state.pendingCommands.delete(requestId);
            pending.resolve(response);
        }
        
        // Emit event for any listeners (e.g. self_test_result)
        if (typeof Events !== 'undefined') {
            Events.emit('sarsat:command_response', response);
        }
    }
    
    // ==================== Command Sending ====================
    
    /**
     * Send a command to the receiver via WebSocket
     * @param {string} cmd - Command name
     * @param {Object} params - Additional parameters
     * @returns {Promise<Object>} Response from receiver
     */
    function sendCommand(cmd, params = {}) {
        return new Promise((resolve, reject) => {
            if (!state.connected || !state.webSocket) {
                reject(new Error('Not connected to receiver'));
                return;
            }
            if (state.webSocket.readyState !== WebSocket.OPEN) {
                reject(new Error('WebSocket not open'));
                return;
            }
            
            const requestId = `cmd_${++state.commandIdCounter}_${Date.now()}`;
            
            const message = {
                cmd: cmd,
                requestId: requestId,
                ...params
            };
            
            // Set up timeout
            const timeout = setTimeout(() => {
                state.pendingCommands.delete(requestId);
                reject(new Error(`Command '${cmd}' timed out after ${CONFIG.commandTimeout}ms`));
            }, CONFIG.commandTimeout);
            
            // Store pending command
            state.pendingCommands.set(requestId, { resolve, reject, timeout });
            
            try {
                state.webSocket.send(JSON.stringify(message));
            } catch (e) {
                clearTimeout(timeout);
                state.pendingCommands.delete(requestId);
                reject(e);
            }
        });
    }
    
    /**
     * Request immediate status from receiver
     */
    function requestStatus() {
        return sendCommand('get_status');
    }
    
    /**
     * Request current receiver configuration
     */
    function requestConfig() {
        return sendCommand('get_config');
    }
    
    /**
     * Set receiver gain remotely
     * @param {string|number} gain - 'auto' or numeric dB value
     */
    function setRemoteGain(gain) {
        return sendCommand('set_gain', { value: gain });
    }
    
    /**
     * Set receiver primary frequency remotely
     * @param {number} freqMhz - Frequency in MHz (e.g. 406.025)
     */
    function setRemoteFrequency(freqMhz) {
        return sendCommand('set_frequency', { value: freqMhz });
    }
    
    /**
     * Trigger self-test on the receiver
     */
    function triggerSelfTest() {
        return sendCommand('self_test');
    }
    
    /**
     * Request replay of recent beacons (for newly connected clients)
     */
    function requestRecentBeacons() {
        return sendCommand('get_recent_beacons');
    }
    
    /**
     * Request beacons from the receiver's persistent log
     * @param {number} hours - How many hours of history (default: 24, max: 8760)
     * @param {number} limit - Max number of beacons to return (default: 500)
     */
    function requestBeaconLog(hours = 24, limit = 500) {
        return sendCommand('get_beacon_log', { hours, limit });
    }
    
    /**
     * Process JSON beacon message from receiver
     */
    function processBeaconMessage(msg) {
        /*
         * Expected message format from receiver:
         * {
         *   "hexId": "ADCC05819E00401",    // 15-hex beacon ID
         *   "type": "PLB",                  // ELT, EPIRB, PLB, SSAS
         *   "countryCode": 366,             // Country code
         *   "protocol": "user",             // user, location, etc.
         *   "lat": 37.7749,                 // Latitude (if GPS-enabled)
         *   "lon": -122.4194,               // Longitude (if GPS-enabled)
         *   "testMode": false,              // Is this a test transmission?
         *   "frequency": 406.025,           // Receive frequency
         *   "rssi": -85,                    // Signal strength
         *   "timestamp": 1706500000000      // Unix timestamp
         * }
         */
        
        if (!msg.hexId) {
            console.warn('[SARSAT] Message missing hexId');
            return;
        }
        
        // Replay flag: beacon replayed from receiver's database on connect
        const isReplay = msg.replay === true;
        
        // Skip test beacons if setting is disabled
        if (msg.testMode && !state.settings.showTestBeacons) {
            console.debug('[SARSAT] Ignoring test beacon:', msg.hexId);
            return;
        }
        
        // Only count live beacons in stats (not replays)
        if (!isReplay) {
            state.stats.beaconsReceived++;
            state.stats.lastMessageTime = Date.now();
        }
        
        const hexId = msg.hexId.toUpperCase();
        const beaconType = BEACON_TYPES[msg.type] || BEACON_TYPES.UNKNOWN;
        const countryName = COUNTRY_CODES[msg.countryCode] || `Unknown (${msg.countryCode})`;
        
        // Get or create beacon record
        let beacon = state.beacons.get(hexId);
        const isNewBeacon = !beacon;
        
        if (!beacon) {
            beacon = {
                hexId: hexId,
                type: beaconType.id,
                typeName: beaconType.name,
                icon: beaconType.icon,
                color: beaconType.color,
                countryCode: msg.countryCode,
                countryName: countryName,
                protocol: msg.protocol,
                firstHeard: Date.now(),
                lastHeard: Date.now(),
                receiveCount: 0,
                positions: [],
                isTest: msg.testMode || false
            };
            state.beacons.set(hexId, beacon);
        }
        
        // Update beacon
        beacon.lastHeard = Date.now();
        beacon.receiveCount++;
        beacon.rssi = msg.rssi;
        beacon.snr = msg.snr;
        beacon.frequency = msg.frequency;
        
        // Update position if available
        if (typeof msg.lat === 'number' && typeof msg.lon === 'number') {
            const hasPosition = beacon.lat !== undefined;
            beacon.lat = msg.lat;
            beacon.lon = msg.lon;
            
            // Add to position history
            beacon.positions.push({
                lat: msg.lat,
                lon: msg.lon,
                timestamp: Date.now()
            });
            
            // Trim position history
            if (beacon.positions.length > CONFIG.maxPositionHistory) {
                beacon.positions = beacon.positions.slice(-CONFIG.maxPositionHistory);
            }
        }
        
        state.stats.messagesDecoded++;
        saveBeacons();
        
        // Emit events
        if (typeof Events !== 'undefined') {
            Events.emit('sarsat:beacon_received', { beacon, isNew: isNewBeacon, isReplay });
        }
        
        // Skip alerts and notifications for replayed (historical) beacons
        if (isReplay) {
            console.debug(`[SARSAT] Replayed beacon: ${hexId} (${beaconType.name})`);
            return;
        }
        
        // Create waypoint for new beacons with position
        if (isNewBeacon && beacon.lat !== undefined && state.settings.autoCreateWaypoints) {
            createBeaconWaypoint(beacon);
        }
        
        // Play alert for emergency beacons (non-test)
        if (!beacon.isTest && state.settings.playAlertSound) {
            playAlertSound();
        }
        
        // Show toast notification
        if (typeof ModalsModule !== 'undefined') {
            const emoji = beacon.isTest ? '🔧' : '🆘';
            const mode = beacon.isTest ? ' (TEST)' : '';
            ModalsModule.showToast(
                `${emoji} ${beaconType.name}${mode}: ${hexId}`,
                beacon.isTest ? 'info' : 'warning'
            );
        }
        
        console.log(`[SARSAT] ${isNewBeacon ? 'New' : 'Updated'} beacon:`, hexId, beaconType.name);
    }
    
    /**
     * Process raw hex message (fallback for simple receivers)
     */
    function processHexMessage(hex) {
        // Parse 15-hex ID from raw message
        const hexId = hex.substring(0, 15).toUpperCase();
        
        // Extract country code from hex ID
        // Country code is in bits 27-36 (0-indexed) of the message
        const countryCode = parseInt(hexId.substring(1, 4), 16) >> 2 & 0x3FF;
        
        // Determine beacon type from protocol code
        // Protocol code is in bits 37-40
        const protocolCode = (parseInt(hexId.substring(4, 6), 16) >> 4) & 0x0F;
        let beaconType = 'UNKNOWN';
        
        if (protocolCode >= 2 && protocolCode <= 6) beaconType = 'ELT';
        else if (protocolCode >= 7 && protocolCode <= 10) beaconType = 'EPIRB';
        else if (protocolCode >= 11 && protocolCode <= 13) beaconType = 'PLB';
        
        // Check if test beacon
        const isTest = hex.substring(0, 4).toUpperCase() === 'TEST';
        
        processBeaconMessage({
            hexId: hexId,
            type: beaconType,
            countryCode: countryCode,
            protocol: 'unknown',
            testMode: isTest,
            timestamp: Date.now()
        });
    }
    
    /**
     * Create waypoint for beacon
     */
    function createBeaconWaypoint(beacon) {
        if (typeof State === 'undefined' || !State.Waypoints) {
            console.warn('[SARSAT] State.Waypoints not available');
            return;
        }
        
        const beaconType = BEACON_TYPES[beacon.type] || BEACON_TYPES.UNKNOWN;
        const modeText = beacon.isTest ? ' [TEST]' : '';
        
        const waypoint = {
            id: `sarsat-${beacon.hexId}-${Date.now()}`,
            name: `${beaconType.icon} ${beacon.type}${modeText}: ${beacon.hexId}`,
            type: beacon.isTest ? 'poi' : 'hazard',
            lat: beacon.lat,
            lon: beacon.lon,
            notes: [
                `COSPAS-SARSAT ${beacon.typeName}`,
                `Hex ID: ${beacon.hexId}`,
                `Country: ${beacon.countryName}`,
                beacon.isTest ? '⚠️ TEST MODE - Not a real emergency' : '🆘 EMERGENCY BEACON',
                `First received: ${new Date(beacon.firstHeard).toLocaleString()}`,
                `Signal: ${beacon.rssi || 'N/A'} dBm`,
                `Frequency: ${beacon.frequency || 'N/A'} MHz`
            ].join('\n'),
            verified: false,
            emergency: !beacon.isTest,
            source: 'sarsat'
        };
        
        State.Waypoints.add(waypoint);
        console.log('[SARSAT] Created waypoint for beacon:', beacon.hexId);
    }
    
    /**
     * Play alert sound
     */
    function playAlertSound() {
        try {
            // Generate a simple alert tone
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 880; // A5
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.5);
        } catch (e) {
            console.debug('[SARSAT] Could not play alert sound:', e);
        }
    }

    // ==================== Map Rendering ====================

    /**
     * Render beacons on map canvas
     */
    function renderOnMap(ctx, width, height, latLonToPixel) {
        const now = Date.now();
        
        state.beacons.forEach((beacon, hexId) => {
            if (beacon.lat === undefined || beacon.lon === undefined) return;
            
            const pixel = latLonToPixel(beacon.lat, beacon.lon);
            if (pixel.x < -50 || pixel.x > width + 50 || pixel.y < -50 || pixel.y > height + 50) {
                return;
            }
            
            const age = now - beacon.lastHeard;
            const isFresh = age < CONFIG.beaconTimeout;
            const opacity = isFresh ? 1 : Math.max(0.3, 1 - (age - CONFIG.beaconTimeout) / CONFIG.beaconTimeout);
            
            const beaconType = BEACON_TYPES[beacon.type] || BEACON_TYPES.UNKNOWN;
            const markerSize = beacon.isTest ? 14 : 20;
            const bgColor = beacon.isTest ? 'rgba(107, 114, 128, 0.9)' : beaconType.color;
            
            // Draw track tail
            if (CONFIG.showTrackTails && beacon.positions && beacon.positions.length > 1) {
                const tailPoints = beacon.positions.slice(-CONFIG.trackTailLength);
                ctx.beginPath();
                ctx.strokeStyle = beacon.isTest ? 
                    `rgba(107, 114, 128, ${opacity * 0.5})` : 
                    `rgba(239, 68, 68, ${opacity * 0.5})`;
                ctx.lineWidth = 2;
                ctx.setLineDash([4, 4]);
                
                tailPoints.forEach((pt, i) => {
                    const px = latLonToPixel(pt.lat, pt.lon);
                    if (i === 0) ctx.moveTo(px.x, px.y);
                    else ctx.lineTo(px.x, px.y);
                });
                ctx.stroke();
                ctx.setLineDash([]);
            }
            
            // Draw pulsing ring for emergency beacons
            if (!beacon.isTest && isFresh) {
                const pulseSize = markerSize + 10 + Math.sin(now / 200) * 5;
                ctx.beginPath();
                ctx.arc(pixel.x, pixel.y, pulseSize, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(239, 68, 68, ${0.5 * opacity})`;
                ctx.lineWidth = 2;
                ctx.stroke();
            }
            
            // Draw marker background
            ctx.beginPath();
            ctx.arc(pixel.x, pixel.y, markerSize, 0, Math.PI * 2);
            ctx.fillStyle = bgColor;
            ctx.globalAlpha = opacity;
            ctx.fill();
            
            // Draw inner circle
            ctx.beginPath();
            ctx.arc(pixel.x, pixel.y, markerSize - 4, 0, Math.PI * 2);
            ctx.fillStyle = '#1a1f2e';
            ctx.fill();
            
            // Draw icon
            ctx.font = `${beacon.isTest ? 10 : 14}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#fff';
            ctx.fillText(beaconType.icon, pixel.x, pixel.y);
            
            // Draw label
            ctx.font = '10px system-ui, sans-serif';
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = 'rgba(0,0,0,0.7)';
            ctx.lineWidth = 3;
            ctx.textAlign = 'center';
            
            const label = beacon.isTest ? `TEST ${beacon.hexId.substring(0, 6)}` : beacon.hexId.substring(0, 8);
            ctx.strokeText(label, pixel.x, pixel.y + markerSize + 12);
            ctx.fillText(label, pixel.x, pixel.y + markerSize + 12);
            
            ctx.globalAlpha = 1;
        });
    }

    // ==================== Utility Functions ====================

    /**
     * Get beacon by hex ID
     */
    function getBeacon(hexId) {
        return state.beacons.get(hexId.toUpperCase());
    }
    
    /**
     * Get all beacons
     */
    function getBeacons() {
        return Array.from(state.beacons.values());
    }
    
    /**
     * Get emergency (non-test) beacons
     */
    function getEmergencyBeacons() {
        return getBeacons().filter(b => !b.isTest);
    }
    
    /**
     * Clear all beacons
     */
    function clearBeacons() {
        state.beacons.clear();
        saveBeacons();
    }
    
    /**
     * Lookup beacon info from COSPAS-SARSAT
     * Note: This requires internet access and should display disclaimer
     */
    async function lookupBeacon(hexId) {
        // The official beacon decode is at https://406registration.com/decode
        // We can link to it but should not scrape it
        return {
            url: `https://406registration.com/decode?hex=${hexId}`,
            note: 'Visit the official COSPAS-SARSAT decode page for full beacon information'
        };
    }

    // ==================== Public API ====================

    return {
        init,
        destroy,
        
        // Connection
        connectSerial,
        connectWebSocket,
        disconnect,
        isConnected: () => state.connected,
        isConnecting: () => state.connecting,
        getConnectionType: () => state.connectionType,
        getConnectionUrl: () => state.connectionUrl,
        isReconnecting: () => state.reconnectTimer !== null,
        getReconnectAttempts: () => state.reconnectAttempts,
        
        // Discovery
        discoverReceivers,
        isDiscovering: () => state.discovering,
        getDiscoveryResults: () => [...state.discoveryResults],
        
        // Saved Receivers
        getSavedReceivers,
        saveReceiver,
        removeReceiver,
        renameReceiver,
        
        // Receiver Status (from heartbeat)
        getReceiverStatus: () => state.receiverStatus ? { ...state.receiverStatus } : null,
        isReceiverOnline: () => state.receiverOnline,
        getLastStatusTime: () => state.lastStatusTime,
        
        // Remote Commands
        sendCommand,
        requestStatus,
        requestConfig,
        setRemoteGain,
        setRemoteFrequency,
        triggerSelfTest,
        requestRecentBeacons,
        requestBeaconLog,
        
        // Settings
        getSettings: () => ({ ...state.settings }),
        updateSettings: (updates) => {
            state.settings = { ...state.settings, ...updates };
            saveSettings();
        },
        setAutoReconnect: (enabled) => { state.autoReconnect = enabled; },
        getAutoReconnect: () => state.autoReconnect,
        
        // Beacon data
        getBeacon,
        getBeacons,
        getEmergencyBeacons,
        clearBeacons,
        lookupBeacon,
        
        // Stats
        getStats: () => ({ ...state.stats }),
        
        // Map rendering
        renderOnMap,
        
        // Constants
        BEACON_TYPES,
        COUNTRY_CODES,
        CONFIG
    };
})();

// Export for browser
if (typeof window !== 'undefined') {
    window.SarsatModule = SarsatModule;
}

// Export for Node.js (testing)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SarsatModule;
}
