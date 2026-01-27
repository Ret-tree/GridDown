/**
 * GridDown RF Sentinel Integration Module
 * 
 * Connects to RF Sentinel (rf-sentinel-v3) for real-time RF detection data:
 * - Aircraft (ADS-B 1090 MHz)
 * - Ships (AIS 162 MHz)
 * - Drones (Remote ID 2.4 GHz)
 * - Radiosondes (400 MHz)
 * - APRS Stations (144.39 MHz)
 * 
 * Also provides off-grid weather via FIS-B (978 MHz UAT) as alternative
 * to internet-based NWS/IEM weather sources.
 * 
 * Connection methods:
 * - Auto (recommended): Tries WebSocket first, falls back to REST
 * - WebSocket: Real-time push updates via native WebSocket
 * - MQTT: Real-time pub/sub via MQTT over WebSocket (requires Mosquitto)
 * - REST polling: Periodic fetch every 5 seconds (fallback)
 * 
 * @version 1.1.0
 */
const RFSentinelModule = (function() {
    'use strict';

    // ==================== Configuration ====================
    
    const CONFIG = {
        // Connection settings
        defaultHost: 'rfsentinel.local',
        defaultPort: 8000,
        defaultConnectionMethod: 'auto',  // 'auto' | 'websocket' | 'mqtt' | 'rest'
        wsReconnectDelayMs: 5000,
        wsMaxReconnectAttempts: 10,
        restPollIntervalMs: 5000,
        healthCheckIntervalMs: 30000,
        
        // MQTT settings
        mqttPort: 9001,  // WebSocket port for MQTT (Mosquitto default)
        mqttReconnectDelayMs: 5000,
        mqttMaxReconnectAttempts: 10,
        mqttTopics: {
            tracks: 'rfsentinel/tracks/#',
            trackUpdate: 'rfsentinel/tracks/update',
            trackLost: 'rfsentinel/tracks/lost',
            weather: 'rfsentinel/weather/#',
            alerts: 'rfsentinel/alerts',
            emergency: 'rfsentinel/emergency'
        },
        
        // Track display settings
        trackMaxAgeSeconds: 300,  // 5 minutes
        trackStaleThresholdMs: 60000,  // 1 minute
        
        // Weather settings
        fisBStaleThresholdMinutes: 15,
        weatherAutoFallback: true,
        
        // Map rendering
        maxRenderedTracks: 500,
        labelMinZoom: 10
    };

    // Connection method options
    const CONNECTION_METHODS = {
        auto: {
            id: 'auto',
            name: 'Auto (recommended)',
            description: 'Tries WebSocket first, falls back to REST'
        },
        websocket: {
            id: 'websocket',
            name: 'WebSocket',
            description: 'Real-time push via native WebSocket'
        },
        mqtt: {
            id: 'mqtt',
            name: 'MQTT',
            description: 'Pub/sub via MQTT over WebSocket (requires broker)'
        },
        rest: {
            id: 'rest',
            name: 'REST Polling',
            description: 'Periodic fetch every 5 seconds'
        }
    };

    // Track type definitions with display properties
    const TRACK_TYPES = {
        aircraft: {
            id: 'aircraft',
            name: 'Aircraft',
            icon: '✈️',
            color: '#3b82f6',  // Blue
            enabled: true,
            endpoint: '/api/tracks/aircraft',
            description: 'ADS-B aircraft (1090 MHz)'
        },
        ship: {
            id: 'ship',
            name: 'Ships',
            icon: '🚢',
            color: '#06b6d4',  // Cyan
            enabled: true,
            endpoint: '/api/tracks/ships',
            description: 'AIS vessels (162 MHz)'
        },
        drone: {
            id: 'drone',
            name: 'Drones',
            icon: '🛸',
            color: '#f59e0b',  // Amber
            enabled: false,
            endpoint: '/api/tracks/drones',
            description: 'Remote ID drones (2.4 GHz)'
        },
        radiosonde: {
            id: 'radiosonde',
            name: 'Radiosondes',
            icon: '🎈',
            color: '#8b5cf6',  // Purple
            enabled: false,
            endpoint: '/api/tracks/radiosondes',
            description: 'Weather balloons (400 MHz)'
        },
        aprs: {
            id: 'aprs',
            name: 'APRS',
            icon: '📻',
            color: '#22c55e',  // Green
            enabled: false,
            endpoint: '/api/tracks/aprs',
            description: 'Amateur radio (144.39 MHz)'
        }
    };

    // Weather source options
    const WEATHER_SOURCES = {
        internet: {
            id: 'internet',
            name: 'Internet (NWS/IEM)',
            description: 'Online weather services - always available'
        },
        fisb: {
            id: 'fisb',
            name: 'RF Sentinel FIS-B',
            description: 'Off-grid via 978 MHz UAT receiver'
        }
    };

    // Emergency squawk codes
    const EMERGENCY_SQUAWKS = {
        '7500': { name: 'HIJACK', severity: 'critical', color: '#dc2626' },
        '7600': { name: 'RADIO FAIL', severity: 'high', color: '#f97316' },
        '7700': { name: 'EMERGENCY', severity: 'critical', color: '#dc2626' }
    };

    // ==================== State ====================
    
    let state = {
        // Connection
        connected: false,
        connecting: false,
        connectionMethod: CONFIG.defaultConnectionMethod,  // 'auto' | 'websocket' | 'mqtt' | 'rest'
        connectionMode: null,  // Actual mode used: 'websocket' | 'mqtt' | 'rest' | null
        host: CONFIG.defaultHost,
        port: CONFIG.defaultPort,
        mqttPort: CONFIG.mqttPort,
        
        // WebSocket
        ws: null,
        wsReconnectAttempts: 0,
        wsReconnectTimer: null,
        
        // MQTT
        mqttClient: null,
        mqttReconnectAttempts: 0,
        mqttReconnectTimer: null,
        mqttSubscriptions: [],
        
        // REST polling
        restPollTimer: null,
        
        // Health check
        healthCheckTimer: null,
        lastHealthCheck: null,
        serverHealth: null,
        
        // Track data
        tracks: new Map(),  // id -> track object
        trackCounts: {
            aircraft: 0,
            ship: 0,
            drone: 0,
            radiosonde: 0,
            aprs: 0
        },
        
        // Track type toggles
        trackTypeSettings: {
            aircraft: { enabled: true },
            ship: { enabled: true },
            drone: { enabled: false },
            radiosonde: { enabled: false },
            aprs: { enabled: false }
        },
        
        // Weather
        weatherSource: 'internet',  // 'internet' | 'fisb'
        fisBData: {
            metars: [],
            tafs: [],
            sigmets: [],
            tfrs: [],
            pireps: [],
            lastUpdate: null,
            isStale: true
        },
        
        // Alerts
        emergencyTracks: [],
        alerts: [],
        
        // Statistics
        stats: {
            tracksReceived: 0,
            messagesReceived: 0,
            connectionTime: null,
            lastUpdate: null
        }
    };

    // Module-scoped event manager
    let rfSentinelEvents = null;
    let mqttLibLoaded = false;
    let initialized = false;

    // ==================== Initialization ====================

    function init() {
        if (initialized) {
            console.debug('RFSentinelModule already initialized');
            return;
        }
        
        // Create scoped event manager
        if (typeof EventManager !== 'undefined' && EventManager.createScopedManager) {
            rfSentinelEvents = EventManager.createScopedManager(EventManager.SCOPES.RFSENTINEL || 'rfsentinel');
        }
        
        // Load saved settings
        loadSettings();
        
        initialized = true;
        console.log('RFSentinelModule initialized');
    }

    function destroy() {
        disconnect();
        
        if (rfSentinelEvents) {
            rfSentinelEvents.clear();
            rfSentinelEvents = null;
        }
        
        initialized = false;
        console.log('RFSentinelModule destroyed');
    }

    // ==================== Settings Persistence ====================

    async function loadSettings() {
        try {
            if (typeof Storage === 'undefined') return;
            
            const settings = await Storage.Settings.get('rfsentinel_settings');
            if (settings) {
                state.host = settings.host || CONFIG.defaultHost;
                state.port = settings.port || CONFIG.defaultPort;
                state.mqttPort = settings.mqttPort || CONFIG.mqttPort;
                state.connectionMethod = settings.connectionMethod || CONFIG.defaultConnectionMethod;
                state.weatherSource = settings.weatherSource || 'internet';
                
                // Load track type toggles
                if (settings.trackTypeSettings) {
                    Object.keys(settings.trackTypeSettings).forEach(type => {
                        if (state.trackTypeSettings[type]) {
                            state.trackTypeSettings[type].enabled = settings.trackTypeSettings[type].enabled;
                        }
                    });
                }
            }
        } catch (e) {
            console.warn('Could not load RF Sentinel settings:', e);
        }
    }

    async function saveSettings() {
        try {
            if (typeof Storage === 'undefined') return;
            
            await Storage.Settings.set('rfsentinel_settings', {
                host: state.host,
                port: state.port,
                mqttPort: state.mqttPort,
                connectionMethod: state.connectionMethod,
                weatherSource: state.weatherSource,
                trackTypeSettings: state.trackTypeSettings
            });
        } catch (e) {
            console.warn('Could not save RF Sentinel settings:', e);
        }
    }

    // ==================== Connection Management ====================

    function getBaseUrl() {
        return `http://${state.host}:${state.port}`;
    }

    function getWsUrl() {
        return `ws://${state.host}:${state.port}/ws`;
    }

    function getMqttWsUrl() {
        return `ws://${state.host}:${state.mqttPort}/mqtt`;
    }

    /**
     * Set connection method
     * @param {string} method - 'auto' | 'websocket' | 'mqtt' | 'rest'
     */
    function setConnectionMethod(method) {
        if (!CONNECTION_METHODS[method]) return false;
        state.connectionMethod = method;
        saveSettings();
        return true;
    }

    /**
     * Connect to RF Sentinel server
     * Uses the configured connection method (auto, websocket, mqtt, or rest)
     */
    async function connect(host = null, port = null, mqttPort = null) {
        if (state.connected || state.connecting) {
            console.log('RFSentinel: Already connected or connecting');
            return false;
        }
        
        state.connecting = true;
        
        if (host) state.host = host;
        if (port) state.port = port;
        if (mqttPort) state.mqttPort = mqttPort;
        
        // Save connection settings
        saveSettings();
        
        const method = state.connectionMethod;
        console.log(`RFSentinel: Connecting to ${state.host}:${state.port} using method: ${method}`);
        emitEvent('connecting', { host: state.host, port: state.port, method });
        
        // For non-MQTT methods, verify server is reachable via health check
        if (method !== 'mqtt') {
            try {
                const health = await checkHealth();
                if (!health || health.status !== 'ok') {
                    throw new Error('Server health check failed');
                }
            } catch (e) {
                console.error('RFSentinel: Server not reachable:', e);
                state.connecting = false;
                emitEvent('error', { message: 'Server not reachable', error: e });
                return false;
            }
        }
        
        // Connect based on selected method
        switch (method) {
            case 'websocket':
                return await connectWithWebSocket();
                
            case 'mqtt':
                return await connectWithMqtt();
                
            case 'rest':
                return connectWithRest();
                
            case 'auto':
            default:
                return await connectAuto();
        }
    }

    /**
     * Auto connection - tries WebSocket first, then REST
     */
    async function connectAuto() {
        // Try WebSocket first
        try {
            await connectWebSocket();
            return true;
        } catch (e) {
            console.warn('RFSentinel: WebSocket failed, falling back to REST:', e);
            
            // Fall back to REST polling
            try {
                startRestPolling();
                return true;
            } catch (restError) {
                console.error('RFSentinel: REST polling failed:', restError);
                state.connecting = false;
                emitEvent('error', { message: 'Connection failed', error: restError });
                return false;
            }
        }
    }

    /**
     * WebSocket-only connection
     */
    async function connectWithWebSocket() {
        try {
            await connectWebSocket();
            return true;
        } catch (e) {
            console.error('RFSentinel: WebSocket connection failed:', e);
            state.connecting = false;
            emitEvent('error', { message: 'WebSocket connection failed', error: e });
            return false;
        }
    }

    /**
     * MQTT-only connection
     */
    async function connectWithMqtt() {
        try {
            await connectMqtt();
            return true;
        } catch (e) {
            console.error('RFSentinel: MQTT connection failed:', e);
            state.connecting = false;
            emitEvent('error', { message: 'MQTT connection failed. Ensure MQTT broker is running with WebSocket support.', error: e });
            return false;
        }
    }

    /**
     * REST-only connection
     */
    function connectWithRest() {
        try {
            startRestPolling();
            return true;
        } catch (e) {
            console.error('RFSentinel: REST polling failed:', e);
            state.connecting = false;
            emitEvent('error', { message: 'REST connection failed', error: e });
            return false;
        }
    }

    /**
     * Disconnect from RF Sentinel server
     */
    function disconnect() {
        console.log('RFSentinel: Disconnecting...');
        
        // Close WebSocket
        if (state.ws) {
            state.ws.close();
            state.ws = null;
        }
        
        // Close MQTT
        if (state.mqttClient) {
            try {
                state.mqttClient.end(true);
            } catch (e) {
                console.warn('RFSentinel: Error closing MQTT client:', e);
            }
            state.mqttClient = null;
        }
        
        // Clear timers
        if (state.wsReconnectTimer) {
            clearTimeout(state.wsReconnectTimer);
            state.wsReconnectTimer = null;
        }
        
        if (state.mqttReconnectTimer) {
            clearTimeout(state.mqttReconnectTimer);
            state.mqttReconnectTimer = null;
        }
        
        if (state.restPollTimer) {
            clearInterval(state.restPollTimer);
            state.restPollTimer = null;
        }
        
        if (state.healthCheckTimer) {
            clearInterval(state.healthCheckTimer);
            state.healthCheckTimer = null;
        }
        
        // Reset state
        state.connected = false;
        state.connecting = false;
        state.connectionMode = null;
        state.wsReconnectAttempts = 0;
        state.mqttReconnectAttempts = 0;
        state.mqttSubscriptions = [];
        state.tracks.clear();
        state.trackCounts = { aircraft: 0, ship: 0, drone: 0, radiosonde: 0, aprs: 0 };
        
        emitEvent('disconnected', {});
        
        // Trigger map refresh
        if (typeof MapModule !== 'undefined') {
            MapModule.render();
        }
    }

    // ==================== WebSocket Connection ====================

    function connectWebSocket() {
        return new Promise((resolve, reject) => {
            const wsUrl = getWsUrl();
            console.log('RFSentinel: Connecting WebSocket to', wsUrl);
            
            try {
                state.ws = new WebSocket(wsUrl);
            } catch (e) {
                reject(e);
                return;
            }
            
            const connectTimeout = setTimeout(() => {
                if (state.ws && state.ws.readyState === WebSocket.CONNECTING) {
                    state.ws.close();
                    reject(new Error('WebSocket connection timeout'));
                }
            }, 10000);
            
            state.ws.onopen = () => {
                clearTimeout(connectTimeout);
                console.log('RFSentinel: WebSocket connected');
                
                state.connected = true;
                state.connecting = false;
                state.connectionMode = 'websocket';
                state.wsReconnectAttempts = 0;
                state.stats.connectionTime = Date.now();
                
                // Start health check interval
                startHealthCheckInterval();
                
                emitEvent('connected', { mode: 'websocket' });
                resolve();
            };
            
            state.ws.onmessage = (event) => {
                handleWebSocketMessage(event.data);
            };
            
            state.ws.onclose = (event) => {
                clearTimeout(connectTimeout);
                console.log('RFSentinel: WebSocket closed', event.code, event.reason);
                
                if (state.connected) {
                    state.connected = false;
                    emitEvent('disconnected', { code: event.code, reason: event.reason });
                    
                    // Attempt reconnect
                    scheduleWebSocketReconnect();
                } else if (state.connecting) {
                    state.connecting = false;
                    reject(new Error('WebSocket closed during connect'));
                }
            };
            
            state.ws.onerror = (error) => {
                console.error('RFSentinel: WebSocket error:', error);
                emitEvent('error', { message: 'WebSocket error', error });
            };
        });
    }

    function scheduleWebSocketReconnect() {
        if (state.wsReconnectAttempts >= CONFIG.wsMaxReconnectAttempts) {
            console.log('RFSentinel: Max reconnect attempts reached, falling back to REST');
            startRestPolling();
            return;
        }
        
        state.wsReconnectAttempts++;
        const delay = CONFIG.wsReconnectDelayMs * state.wsReconnectAttempts;
        
        console.log(`RFSentinel: Reconnecting in ${delay}ms (attempt ${state.wsReconnectAttempts})`);
        
        state.wsReconnectTimer = setTimeout(async () => {
            try {
                await connectWebSocket();
            } catch (e) {
                console.warn('RFSentinel: Reconnect failed:', e);
                scheduleWebSocketReconnect();
            }
        }, delay);
    }

    function handleWebSocketMessage(data) {
        try {
            const message = JSON.parse(data);
            state.stats.messagesReceived++;
            state.stats.lastUpdate = Date.now();
            
            switch (message.type) {
                case 'track':
                case 'track_update':
                    handleTrackUpdate(message.data || message);
                    break;
                    
                case 'track_lost':
                    handleTrackLost(message.id || message.data?.id);
                    break;
                    
                case 'weather':
                    handleWeatherUpdate(message.data || message);
                    break;
                    
                case 'alert':
                    handleAlert(message.data || message);
                    break;
                    
                case 'ping':
                    // Respond with pong
                    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
                        state.ws.send(JSON.stringify({ type: 'pong' }));
                    }
                    break;
                    
                default:
                    // Generic data update
                    if (message.tracks) {
                        message.tracks.forEach(track => handleTrackUpdate(track));
                    }
            }
        } catch (e) {
            console.warn('RFSentinel: Failed to parse WebSocket message:', e);
        }
    }

    // ==================== MQTT Connection ====================

    /**
     * Load MQTT.js library dynamically from CDN
     * Only loaded when user selects MQTT connection method
     */
    async function loadMqttLibrary() {
        if (mqttLibLoaded || typeof mqtt !== 'undefined') {
            mqttLibLoaded = true;
            return true;
        }
        
        return new Promise((resolve, reject) => {
            console.log('RFSentinel: Loading MQTT.js library...');
            
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/mqtt@5.3.4/dist/mqtt.min.js';
            script.async = true;
            
            script.onload = () => {
                console.log('RFSentinel: MQTT.js library loaded');
                mqttLibLoaded = true;
                resolve(true);
            };
            
            script.onerror = () => {
                console.error('RFSentinel: Failed to load MQTT.js library');
                reject(new Error('Failed to load MQTT.js library. Check network connection.'));
            };
            
            document.head.appendChild(script);
        });
    }

    /**
     * Connect via MQTT over WebSocket
     */
    async function connectMqtt() {
        // First, load the MQTT library
        try {
            await loadMqttLibrary();
        } catch (e) {
            throw new Error('MQTT library not available: ' + e.message);
        }
        
        if (typeof mqtt === 'undefined') {
            throw new Error('MQTT library not loaded');
        }
        
        return new Promise((resolve, reject) => {
            const mqttUrl = getMqttWsUrl();
            console.log('RFSentinel: Connecting MQTT to', mqttUrl);
            
            const connectTimeout = setTimeout(() => {
                reject(new Error('MQTT connection timeout'));
            }, 15000);
            
            try {
                state.mqttClient = mqtt.connect(mqttUrl, {
                    clientId: `griddown_${Math.random().toString(16).slice(2, 10)}`,
                    keepalive: 30,
                    reconnectPeriod: 0,  // We handle reconnection ourselves
                    connectTimeout: 10000
                });
            } catch (e) {
                clearTimeout(connectTimeout);
                reject(e);
                return;
            }
            
            state.mqttClient.on('connect', () => {
                clearTimeout(connectTimeout);
                console.log('RFSentinel: MQTT connected');
                
                state.connected = true;
                state.connecting = false;
                state.connectionMode = 'mqtt';
                state.mqttReconnectAttempts = 0;
                state.stats.connectionTime = Date.now();
                
                // Subscribe to topics
                subscribeMqttTopics();
                
                // Start health check interval
                startHealthCheckInterval();
                
                emitEvent('connected', { mode: 'mqtt' });
                resolve();
            });
            
            state.mqttClient.on('message', (topic, message) => {
                handleMqttMessage(topic, message);
            });
            
            state.mqttClient.on('close', () => {
                console.log('RFSentinel: MQTT connection closed');
                
                if (state.connected && state.connectionMode === 'mqtt') {
                    state.connected = false;
                    emitEvent('disconnected', { reason: 'MQTT connection closed' });
                    
                    // Attempt reconnect
                    scheduleMqttReconnect();
                }
            });
            
            state.mqttClient.on('error', (error) => {
                console.error('RFSentinel: MQTT error:', error);
                clearTimeout(connectTimeout);
                
                if (state.connecting) {
                    state.connecting = false;
                    reject(error);
                } else {
                    emitEvent('error', { message: 'MQTT error', error });
                }
            });
            
            state.mqttClient.on('offline', () => {
                console.warn('RFSentinel: MQTT client offline');
                if (state.connected && state.connectionMode === 'mqtt') {
                    emitEvent('error', { message: 'MQTT connection lost' });
                }
            });
        });
    }

    /**
     * Subscribe to RF Sentinel MQTT topics
     */
    function subscribeMqttTopics() {
        if (!state.mqttClient || !state.mqttClient.connected) return;
        
        const topics = [
            CONFIG.mqttTopics.tracks,
            CONFIG.mqttTopics.weather,
            CONFIG.mqttTopics.alerts,
            CONFIG.mqttTopics.emergency
        ];
        
        topics.forEach(topic => {
            state.mqttClient.subscribe(topic, { qos: 0 }, (err) => {
                if (err) {
                    console.warn(`RFSentinel: Failed to subscribe to ${topic}:`, err);
                } else {
                    console.log(`RFSentinel: Subscribed to ${topic}`);
                    state.mqttSubscriptions.push(topic);
                }
            });
        });
    }

    /**
     * Handle incoming MQTT messages
     */
    function handleMqttMessage(topic, message) {
        try {
            const data = JSON.parse(message.toString());
            state.stats.messagesReceived++;
            state.stats.lastUpdate = Date.now();
            
            // Route based on topic
            if (topic.startsWith('rfsentinel/tracks')) {
                if (topic.includes('/lost')) {
                    handleTrackLost(data.id || data);
                } else {
                    handleTrackUpdate(data);
                }
            } else if (topic.startsWith('rfsentinel/weather')) {
                handleWeatherUpdate(data);
            } else if (topic === CONFIG.mqttTopics.alerts) {
                handleAlert(data);
            } else if (topic === CONFIG.mqttTopics.emergency) {
                // Emergency message - treat as alert with high priority
                handleAlert({ ...data, severity: 'critical' });
            }
        } catch (e) {
            console.warn('RFSentinel: Failed to parse MQTT message:', e, 'Topic:', topic);
        }
    }

    /**
     * Schedule MQTT reconnection attempt
     */
    function scheduleMqttReconnect() {
        if (state.mqttReconnectAttempts >= CONFIG.mqttMaxReconnectAttempts) {
            console.log('RFSentinel: Max MQTT reconnect attempts reached');
            emitEvent('error', { message: 'MQTT reconnection failed. Max attempts reached.' });
            return;
        }
        
        state.mqttReconnectAttempts++;
        const delay = CONFIG.mqttReconnectDelayMs * state.mqttReconnectAttempts;
        
        console.log(`RFSentinel: MQTT reconnecting in ${delay}ms (attempt ${state.mqttReconnectAttempts})`);
        
        state.mqttReconnectTimer = setTimeout(async () => {
            try {
                await connectMqtt();
            } catch (e) {
                console.warn('RFSentinel: MQTT reconnect failed:', e);
                scheduleMqttReconnect();
            }
        }, delay);
    }

    /**
     * Check if MQTT is available (library loaded and can connect)
     */
    function isMqttAvailable() {
        return mqttLibLoaded || typeof mqtt !== 'undefined';
    }

    // ==================== REST Polling ====================

    function startRestPolling() {
        if (state.restPollTimer) {
            clearInterval(state.restPollTimer);
        }
        
        console.log('RFSentinel: Starting REST polling');
        
        state.connected = true;
        state.connecting = false;
        state.connectionMode = 'rest';
        state.stats.connectionTime = Date.now();
        
        // Start health check interval
        startHealthCheckInterval();
        
        // Initial fetch
        fetchAllTracks();
        
        // Poll interval
        state.restPollTimer = setInterval(() => {
            fetchAllTracks();
        }, CONFIG.restPollIntervalMs);
        
        emitEvent('connected', { mode: 'rest' });
    }

    async function fetchAllTracks() {
        if (!state.connected) return;
        
        try {
            const response = await fetch(`${getBaseUrl()}/api/tracks?max_age=${CONFIG.trackMaxAgeSeconds}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const tracks = await response.json();
            state.stats.lastUpdate = Date.now();
            
            // Clear existing tracks and repopulate
            const newTrackIds = new Set();
            
            tracks.forEach(track => {
                handleTrackUpdate(track);
                newTrackIds.add(track.id);
            });
            
            // Remove stale tracks not in response
            for (const [id, track] of state.tracks) {
                if (!newTrackIds.has(id)) {
                    handleTrackLost(id);
                }
            }
            
        } catch (e) {
            console.warn('RFSentinel: REST fetch failed:', e);
            emitEvent('error', { message: 'REST fetch failed', error: e });
        }
    }

    // ==================== Health Check ====================

    function startHealthCheckInterval() {
        if (state.healthCheckTimer) {
            clearInterval(state.healthCheckTimer);
        }
        
        state.healthCheckTimer = setInterval(async () => {
            const health = await checkHealth();
            if (!health || health.status !== 'ok') {
                console.warn('RFSentinel: Health check failed');
                emitEvent('health:degraded', health);
            }
        }, CONFIG.healthCheckIntervalMs);
    }

    async function checkHealth() {
        try {
            const response = await fetch(`${getBaseUrl()}/health`, {
                signal: AbortSignal.timeout(5000)
            });
            
            if (!response.ok) return null;
            
            const health = await response.json();
            state.lastHealthCheck = Date.now();
            state.serverHealth = health;
            
            return health;
        } catch (e) {
            console.warn('RFSentinel: Health check error:', e);
            return null;
        }
    }

    // ==================== Track Management ====================

    function handleTrackUpdate(track) {
        if (!track || !track.id) return;
        
        // Normalize track type
        const type = normalizeTrackType(track.type);
        if (!type || !TRACK_TYPES[type]) return;
        
        // Check for emergency status
        checkEmergencyStatus(track);
        
        // Store track
        const existingTrack = state.tracks.get(track.id);
        const isNew = !existingTrack;
        
        state.tracks.set(track.id, {
            ...track,
            type,
            lastUpdate: Date.now(),
            isNew: isNew
        });
        
        state.stats.tracksReceived++;
        
        // Update counts
        updateTrackCounts();
        
        // Emit event
        if (isNew) {
            emitEvent('track:new', { track, type });
        } else {
            emitEvent('track:update', { track, type });
        }
        
        // Trigger map refresh (throttled)
        requestMapRefresh();
    }

    function handleTrackLost(trackId) {
        if (!trackId || !state.tracks.has(trackId)) return;
        
        const track = state.tracks.get(trackId);
        state.tracks.delete(trackId);
        
        updateTrackCounts();
        emitEvent('track:lost', { trackId, type: track?.type });
        requestMapRefresh();
    }

    function normalizeTrackType(type) {
        if (!type) return null;
        
        const typeMap = {
            'aircraft': 'aircraft',
            'plane': 'aircraft',
            'adsb': 'aircraft',
            'ship': 'ship',
            'vessel': 'ship',
            'ais': 'ship',
            'drone': 'drone',
            'uav': 'drone',
            'remoteid': 'drone',
            'radiosonde': 'radiosonde',
            'sonde': 'radiosonde',
            'balloon': 'radiosonde',
            'aprs': 'aprs'
        };
        
        return typeMap[type.toLowerCase()] || null;
    }

    function updateTrackCounts() {
        state.trackCounts = { aircraft: 0, ship: 0, drone: 0, radiosonde: 0, aprs: 0 };
        
        for (const [id, track] of state.tracks) {
            if (state.trackCounts.hasOwnProperty(track.type)) {
                state.trackCounts[track.type]++;
            }
        }
    }

    function checkEmergencyStatus(track) {
        // Check aircraft emergency squawks
        if (track.type === 'aircraft' && track.squawk) {
            const squawk = String(track.squawk);
            if (EMERGENCY_SQUAWKS[squawk]) {
                const emergency = {
                    track,
                    squawk,
                    info: EMERGENCY_SQUAWKS[squawk],
                    timestamp: Date.now()
                };
                
                // Check if we already have this emergency
                const existing = state.emergencyTracks.find(e => e.track.id === track.id);
                if (!existing) {
                    state.emergencyTracks.push(emergency);
                    emitEvent('emergency:squawk', emergency);
                    
                    // Show alert
                    showEmergencyAlert(emergency);
                }
            }
        }
        
        // Check AIS emergency devices (MMSI prefixes 970, 972, 974)
        if (track.type === 'ship' && track.mmsi) {
            const mmsi = String(track.mmsi);
            if (mmsi.startsWith('970') || mmsi.startsWith('972') || mmsi.startsWith('974')) {
                const deviceType = mmsi.startsWith('970') ? 'SART' :
                                   mmsi.startsWith('972') ? 'MOB' : 'EPIRB';
                
                const emergency = {
                    track,
                    deviceType,
                    timestamp: Date.now()
                };
                
                const existing = state.emergencyTracks.find(e => e.track.id === track.id);
                if (!existing) {
                    state.emergencyTracks.push(emergency);
                    emitEvent('emergency:ais', emergency);
                    showEmergencyAlert(emergency);
                }
            }
        }
    }

    function showEmergencyAlert(emergency) {
        if (typeof ModalsModule !== 'undefined') {
            let message;
            if (emergency.squawk) {
                message = `🚨 EMERGENCY SQUAWK ${emergency.squawk} (${emergency.info.name})\n` +
                          `Aircraft: ${emergency.track.callsign || emergency.track.id}`;
            } else if (emergency.deviceType) {
                message = `🆘 AIS ${emergency.deviceType} EMERGENCY DEVICE\n` +
                          `MMSI: ${emergency.track.mmsi}`;
            }
            
            ModalsModule.showToast(message, 'error', 10000);
        }
    }

    // ==================== Track Type Toggles ====================

    /**
     * Enable/disable display of a track type on the map
     */
    function setTrackTypeEnabled(type, enabled) {
        if (!TRACK_TYPES[type]) return false;
        
        state.trackTypeSettings[type].enabled = enabled;
        saveSettings();
        
        emitEvent('trackType:changed', { type, enabled });
        requestMapRefresh();
        
        return true;
    }

    function isTrackTypeEnabled(type) {
        return state.trackTypeSettings[type]?.enabled || false;
    }

    function getTrackTypeSettings() {
        return { ...state.trackTypeSettings };
    }

    // ==================== Weather Source Management ====================

    /**
     * Set weather data source
     * @param {string} source - 'internet' or 'fisb'
     */
    function setWeatherSource(source) {
        if (!WEATHER_SOURCES[source]) return false;
        
        const oldSource = state.weatherSource;
        state.weatherSource = source;
        saveSettings();
        
        emitEvent('weatherSource:changed', { oldSource, newSource: source });
        
        // If switching to FIS-B, fetch current data
        if (source === 'fisb' && state.connected) {
            fetchFisBWeather();
        }
        
        return true;
    }

    function getWeatherSource() {
        return state.weatherSource;
    }

    async function fetchFisBWeather() {
        if (!state.connected) return null;
        
        try {
            const response = await fetch(`${getBaseUrl()}/api/weather`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            
            state.fisBData = {
                metars: data.metars || [],
                tafs: data.tafs || [],
                sigmets: data.sigmets || [],
                tfrs: data.tfrs || [],
                pireps: data.pireps || [],
                lastUpdate: Date.now(),
                isStale: false
            };
            
            emitEvent('weather:updated', state.fisBData);
            return state.fisBData;
            
        } catch (e) {
            console.warn('RFSentinel: Failed to fetch FIS-B weather:', e);
            return null;
        }
    }

    function handleWeatherUpdate(data) {
        if (!data) return;
        
        // Update specific weather product
        if (data.metars) state.fisBData.metars = data.metars;
        if (data.tafs) state.fisBData.tafs = data.tafs;
        if (data.sigmets) state.fisBData.sigmets = data.sigmets;
        if (data.tfrs) state.fisBData.tfrs = data.tfrs;
        if (data.pireps) state.fisBData.pireps = data.pireps;
        
        state.fisBData.lastUpdate = Date.now();
        state.fisBData.isStale = false;
        
        emitEvent('weather:updated', state.fisBData);
    }

    function isFisBStale() {
        if (!state.fisBData.lastUpdate) return true;
        
        const ageMinutes = (Date.now() - state.fisBData.lastUpdate) / 60000;
        return ageMinutes > CONFIG.fisBStaleThresholdMinutes;
    }

    function getFisBData() {
        return {
            ...state.fisBData,
            isStale: isFisBStale()
        };
    }

    // ==================== Alert Management ====================

    function handleAlert(alert) {
        if (!alert) return;
        
        state.alerts.push({
            ...alert,
            timestamp: Date.now()
        });
        
        // Keep last 100 alerts
        if (state.alerts.length > 100) {
            state.alerts = state.alerts.slice(-100);
        }
        
        emitEvent('alert', alert);
        
        // Show toast for important alerts
        if (alert.severity === 'critical' || alert.severity === 'high') {
            if (typeof ModalsModule !== 'undefined') {
                ModalsModule.showToast(alert.message || alert.title, 'warning');
            }
        }
    }

    // ==================== Map Rendering ====================

    let mapRefreshPending = false;
    let mapRefreshTimer = null;

    function requestMapRefresh() {
        if (mapRefreshPending) return;
        
        mapRefreshPending = true;
        
        // Throttle to max 10 fps
        mapRefreshTimer = setTimeout(() => {
            mapRefreshPending = false;
            if (typeof MapModule !== 'undefined') {
                MapModule.render();
            }
        }, 100);
    }

    /**
     * Render RF Sentinel tracks on the map canvas
     * Called by MapModule during render cycle
     */
    function renderOnMap(ctx, width, height, latLonToPixel, zoom) {
        if (!state.connected || state.tracks.size === 0) return;
        
        const now = Date.now();
        let renderedCount = 0;
        
        // Group tracks by type for efficient rendering
        const tracksByType = new Map();
        
        for (const [id, track] of state.tracks) {
            // Skip if type is disabled
            if (!isTrackTypeEnabled(track.type)) continue;
            
            // Skip if no position
            if (!track.lat && !track.latitude) continue;
            if (!track.lon && !track.longitude) continue;
            
            // Skip stale tracks
            const age = now - (track.lastUpdate || track.timestamp || 0);
            if (age > CONFIG.trackMaxAgeSeconds * 1000) continue;
            
            if (!tracksByType.has(track.type)) {
                tracksByType.set(track.type, []);
            }
            tracksByType.get(track.type).push(track);
        }
        
        // Render each type
        for (const [type, tracks] of tracksByType) {
            const typeConfig = TRACK_TYPES[type];
            if (!typeConfig) continue;
            
            tracks.forEach(track => {
                if (renderedCount >= CONFIG.maxRenderedTracks) return;
                
                const lat = track.lat || track.latitude;
                const lon = track.lon || track.longitude;
                const pixel = latLonToPixel(lat, lon);
                
                // Skip if off-screen
                if (pixel.x < -50 || pixel.x > width + 50 ||
                    pixel.y < -50 || pixel.y > height + 50) {
                    return;
                }
                
                renderTrack(ctx, track, pixel, typeConfig, zoom, now);
                renderedCount++;
            });
        }
    }

    function renderTrack(ctx, track, pixel, typeConfig, zoom, now) {
        const x = pixel.x;
        const y = pixel.y;
        const color = typeConfig.color;
        
        // Check if emergency
        const isEmergency = state.emergencyTracks.some(e => e.track.id === track.id);
        
        // Calculate track age for alpha
        const age = now - (track.lastUpdate || track.timestamp || 0);
        const staleRatio = Math.min(age / (CONFIG.trackMaxAgeSeconds * 1000), 1);
        const alpha = 1 - (staleRatio * 0.5);  // Fade from 1.0 to 0.5
        
        ctx.save();
        ctx.globalAlpha = alpha;
        
        // Draw based on track type
        if (track.type === 'aircraft') {
            renderAircraft(ctx, x, y, track, color, isEmergency);
        } else if (track.type === 'ship') {
            renderShip(ctx, x, y, track, color, isEmergency);
        } else if (track.type === 'drone') {
            renderDrone(ctx, x, y, track, color, isEmergency);
        } else {
            // Generic marker for radiosonde, aprs
            renderGenericMarker(ctx, x, y, typeConfig, isEmergency);
        }
        
        // Draw label if zoomed in enough
        if (zoom >= CONFIG.labelMinZoom) {
            const label = track.callsign || track.name || track.id?.slice(0, 8);
            if (label) {
                ctx.font = '10px system-ui, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillStyle = '#fff';
                ctx.strokeStyle = 'rgba(0,0,0,0.7)';
                ctx.lineWidth = 2;
                ctx.strokeText(label, x, y + 20);
                ctx.fillText(label, x, y + 20);
            }
        }
        
        ctx.restore();
    }

    function renderAircraft(ctx, x, y, track, color, isEmergency) {
        const heading = track.heading || track.track || 0;
        
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((heading * Math.PI) / 180);
        
        // Aircraft shape
        ctx.beginPath();
        ctx.moveTo(0, -12);  // Nose
        ctx.lineTo(8, 8);    // Right wing tip
        ctx.lineTo(0, 4);    // Tail
        ctx.lineTo(-8, 8);   // Left wing tip
        ctx.closePath();
        
        ctx.fillStyle = isEmergency ? '#ef4444' : color;
        ctx.fill();
        ctx.strokeStyle = isEmergency ? '#fff' : 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // Emergency pulse
        if (isEmergency) {
            const pulse = (Math.sin(Date.now() / 150) + 1) / 2;
            ctx.beginPath();
            ctx.arc(0, 0, 15 + pulse * 10, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(239, 68, 68, ${0.5 - pulse * 0.3})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        
        ctx.restore();
    }

    function renderShip(ctx, x, y, track, color, isEmergency) {
        const heading = track.heading || track.cog || 0;
        
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((heading * Math.PI) / 180);
        
        // Ship shape (boat-like)
        ctx.beginPath();
        ctx.moveTo(0, -10);   // Bow
        ctx.lineTo(6, 0);     // Starboard
        ctx.lineTo(6, 8);     // Starboard stern
        ctx.lineTo(-6, 8);    // Port stern
        ctx.lineTo(-6, 0);    // Port
        ctx.closePath();
        
        ctx.fillStyle = isEmergency ? '#ef4444' : color;
        ctx.fill();
        ctx.strokeStyle = isEmergency ? '#fff' : 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        ctx.restore();
    }

    function renderDrone(ctx, x, y, track, color, isEmergency) {
        // Drone as diamond shape
        ctx.beginPath();
        ctx.moveTo(x, y - 8);
        ctx.lineTo(x + 8, y);
        ctx.lineTo(x, y + 8);
        ctx.lineTo(x - 8, y);
        ctx.closePath();
        
        ctx.fillStyle = isEmergency ? '#ef4444' : color;
        ctx.fill();
        ctx.strokeStyle = isEmergency ? '#fff' : 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    function renderGenericMarker(ctx, x, y, typeConfig, isEmergency) {
        // Circle marker
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fillStyle = isEmergency ? '#ef4444' : typeConfig.color;
        ctx.fill();
        ctx.strokeStyle = isEmergency ? '#fff' : 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // ==================== Event Emitting ====================

    function emitEvent(eventName, data) {
        if (typeof Events !== 'undefined') {
            Events.emit(`rfsentinel:${eventName}`, data);
        }
    }

    // ==================== Public API ====================

    return {
        init,
        destroy,
        
        // Connection
        connect,
        disconnect,
        isConnected: () => state.connected,
        isConnecting: () => state.connecting,
        getConnectionMode: () => state.connectionMode,
        getConnectionMethod: () => state.connectionMethod,
        setConnectionMethod,
        getConnectionMethods: () => ({ ...CONNECTION_METHODS }),
        getHost: () => state.host,
        getPort: () => state.port,
        getMqttPort: () => state.mqttPort,
        setHost: (host) => { state.host = host; saveSettings(); },
        setPort: (port) => { state.port = port; saveSettings(); },
        setMqttPort: (port) => { state.mqttPort = port; saveSettings(); },
        checkHealth,
        isMqttAvailable,
        
        // Tracks
        getTracks: () => [...state.tracks.values()],
        getTrack: (id) => state.tracks.get(id),
        getTrackCounts: () => ({ ...state.trackCounts }),
        getTracksByType: (type) => [...state.tracks.values()].filter(t => t.type === type),
        
        // Track type toggles
        setTrackTypeEnabled,
        isTrackTypeEnabled,
        getTrackTypeSettings,
        getTrackTypes: () => ({ ...TRACK_TYPES }),
        
        // Weather source
        setWeatherSource,
        getWeatherSource,
        fetchFisBWeather,
        getFisBData,
        isFisBStale,
        getWeatherSources: () => ({ ...WEATHER_SOURCES }),
        
        // Emergencies
        getEmergencyTracks: () => [...state.emergencyTracks],
        clearEmergencyTracks: () => { state.emergencyTracks = []; },
        
        // Alerts
        getAlerts: () => [...state.alerts],
        clearAlerts: () => { state.alerts = []; },
        
        // Map rendering
        renderOnMap,
        
        // Stats
        getStats: () => ({ ...state.stats }),
        getServerHealth: () => state.serverHealth,
        
        // Constants
        TRACK_TYPES,
        WEATHER_SOURCES,
        EMERGENCY_SQUAWKS,
        CONNECTION_METHODS,
        CONFIG
    };
})();

// Register globally
window.RFSentinelModule = RFSentinelModule;
