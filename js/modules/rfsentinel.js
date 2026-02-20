/**
 * GridDown RF Sentinel Integration Module
 * 
 * Connects to RF Sentinel (rf-sentinel-v3) for real-time RF detection data:
 * - Aircraft (ADS-B 1090 MHz)
 * - Ships (AIS 162 MHz)
 * - Drones - Remote ID (2.4 GHz WiFi/BLE) - Has GPS position
 * - Drones - FPV/RF (5.8/2.4/915 MHz) - RF signal only, no GPS (Pro license)
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
 * @version 1.5.0
 */
const RFSentinelModule = (function() {
    'use strict';

    // ==================== Configuration ====================
    
    const CONFIG = {
        // Connection settings
        defaultHost: 'rfsentinel.local',
        defaultPort: 8080,
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
            name: 'Drones (Remote ID)',
            icon: '🛸',
            color: '#f59e0b',  // Amber
            enabled: false,
            endpoint: '/api/tracks/drones',
            description: 'Remote ID drones with GPS position'
        },
        fpv: {
            id: 'fpv',
            name: 'Drones (FPV/RF)',
            icon: '📡',
            color: '#ef4444',  // Red
            enabled: false,
            endpoint: '/api/fpv/tracks',
            description: 'FPV drones detected by RF signal (no GPS)',
            noPosition: true  // Flag indicating these tracks have no map position
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
        autoReconnect: false,  // Persist: auto-reconnect on page load if true
        connectionMethod: CONFIG.defaultConnectionMethod,  // 'auto' | 'websocket' | 'mqtt' | 'rest'
        connectionMode: null,  // Actual mode used: 'websocket' | 'mqtt' | 'rest' | null
        host: CONFIG.defaultHost,
        port: CONFIG.defaultPort,
        mqttPort: CONFIG.mqttPort,
        useHttps: 'auto',  // 'auto' | true | false — protocol for API/WS connections
        
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
            fpv: 0,
            radiosonde: 0,
            aprs: 0
        },
        
        // Track type toggles
        trackTypeSettings: {
            aircraft: { enabled: true },
            ship: { enabled: true },
            drone: { enabled: false },
            fpv: { enabled: false },
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
        },
        
        // Weather conditions from Open-Meteo (via RF Sentinel)
        weatherConditions: null,  // { temperature_c, humidity, wind_speed_mps, wind_direction, pressure_hpa, conditions, ... }
        
        // RF Sentinel station GPS location
        stationLocation: null,  // { latitude, longitude, altitude, source, timestamp }
        
        // Track correlations (links between multiple tracks from same physical object)
        correlations: new Map()  // correlation_id -> { id, tracks: [...], confidence, ... }
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
        
        // Load saved settings then auto-reconnect if previously connected
        loadSettings().then(() => {
            if (state.autoReconnect && state.host) {
                console.log(`RFSentinel: Auto-reconnecting to ${state.host}:${state.port} (method: ${state.connectionMethod})`);
                connect();
            }
        });
        
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
                state.useHttps = settings.useHttps !== undefined ? settings.useHttps : 'auto';
                state.autoReconnect = settings.autoReconnect || false;
                
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
            console.warn('RFSentinel: Could not load settings:', e);
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
                useHttps: state.useHttps,
                autoReconnect: state.autoReconnect,
                trackTypeSettings: state.trackTypeSettings
            });
        } catch (e) {
            console.warn('RFSentinel: Could not save settings:', e);
        }
    }

    // ==================== Connection Management ====================

    /**
     * Determine whether to use HTTPS/WSS for connections.
     * 'auto' mode: uses HTTP for local-looking hosts (.local, private IPs),
     * matches page protocol for everything else.
     */
    function shouldUseHttps() {
        if (state.useHttps === true) return true;
        if (state.useHttps === false) return false;
        
        // Auto-detect
        const host = state.host || '';
        
        // Local hostnames and private IPs → HTTP (usually no valid TLS cert)
        if (host.endsWith('.local') ||
            host === 'localhost' ||
            host.startsWith('127.') ||
            host.startsWith('10.') ||
            host.startsWith('192.168.') ||
            host.startsWith('172.16.') || host.startsWith('172.17.') ||
            host.startsWith('172.18.') || host.startsWith('172.19.') ||
            host.startsWith('172.2') || host.startsWith('172.30.') ||
            host.startsWith('172.31.')) {
            return false;
        }
        
        // Non-local host: match page protocol if available
        if (typeof window !== 'undefined' && window.location?.protocol === 'https:') {
            return true;
        }
        
        return false;
    }

    function getBaseUrl() {
        const protocol = shouldUseHttps() ? 'https' : 'http';
        return `${protocol}://${state.host}:${state.port}`;
    }

    function getWsUrl() {
        const protocol = shouldUseHttps() ? 'wss' : 'ws';
        // Use the external integration endpoint — /ws requires RF Sentinel
        // session cookie auth which external clients (GridDown) don't have.
        // /api/integration/ws/external allows unauthenticated or API-key connections.
        return `${protocol}://${state.host}:${state.port}/api/integration/ws/external`;
    }

    function getMqttWsUrl() {
        const protocol = shouldUseHttps() ? 'wss' : 'ws';
        return `${protocol}://${state.host}:${state.mqttPort}/mqtt`;
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
        state.autoReconnect = true;
        
        if (host) state.host = host;
        if (port) state.port = port;
        if (mqttPort) state.mqttPort = mqttPort;
        
        // Save connection settings
        saveSettings();
        
        const method = state.connectionMethod;
        console.log(`RFSentinel: Connecting to ${state.host}:${state.port} using method: ${method}`);
        emitEvent('connecting', { host: state.host, port: state.port, method });
        
        // For non-MQTT methods, verify server is reachable via health check
        // Uses 3 retries with increasing timeouts to handle slow mDNS resolution
        if (method !== 'mqtt') {
            try {
                const health = await checkHealth(3, 8000);
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
            
            // Clean up failed WebSocket before starting REST
            // This prevents delayed onclose from clobbering REST connection state
            if (state.ws) {
                try { state.ws.close(); } catch (_) {}
                state.ws = null;
            }
            
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
        
        // User explicitly disconnected — don't auto-reconnect on next load
        state.autoReconnect = false;
        
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
        state.trackCounts = { aircraft: 0, ship: 0, drone: 0, fpv: 0, radiosonde: 0, aprs: 0 };
        state.stationLocation = null;
        state.weatherConditions = null;
        state.correlations.clear();
        
        emitEvent('disconnected', {});
        
        // Persist autoReconnect = false so we don't reconnect on next page load
        saveSettings();
        
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
            
            // Guard against double resolve/reject
            let settled = false;
            
            const connectTimeout = setTimeout(() => {
                if (state.ws && state.ws.readyState === WebSocket.CONNECTING) {
                    console.warn('RFSentinel: WebSocket connection timeout, closing');
                    // Only close — let onclose handle the rejection
                    state.ws.close();
                }
            }, 10000);
            
            state.ws.onopen = () => {
                clearTimeout(connectTimeout);
                if (settled) return;
                settled = true;
                
                console.log('RFSentinel: WebSocket connected');
                
                state.connected = true;
                state.connecting = false;
                state.connectionMode = 'websocket';
                state.wsReconnectAttempts = 0;
                state.stats.connectionTime = Date.now();
                
                // Start health check interval
                startHealthCheckInterval();
                
                // Seed current tracks via one-time REST fetch so the map
                // isn't empty until each track's next update trickles in.
                // Fire-and-forget — WebSocket handles real-time from here.
                seedInitialTracks();
                
                emitEvent('connected', { mode: 'websocket' });
                resolve();
            };
            
            state.ws.onmessage = (event) => {
                handleWebSocketMessage(event.data);
            };
            
            state.ws.onclose = (event) => {
                clearTimeout(connectTimeout);
                console.log('RFSentinel: WebSocket closed', event.code, event.reason);
                
                // Guard: if connection already fell back to REST, don't clobber state
                if (state.connectionMode === 'rest') {
                    console.log('RFSentinel: WebSocket onclose ignored — already using REST');
                    return;
                }
                
                if (state.connected && state.connectionMode === 'websocket') {
                    state.connected = false;
                    emitEvent('disconnected', { code: event.code, reason: event.reason });
                    
                    // Attempt reconnect
                    scheduleWebSocketReconnect();
                } else if (!settled) {
                    settled = true;
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

    /**
     * Seed initial track state via one-time REST fetch.
     *
     * When GridDown connects via WebSocket (or reconnects), the WS stream
     * only delivers events published *after* registration.  If RF Sentinel
     * is already tracking targets, the map starts empty and tracks only
     * appear as each gets its next update — seconds for ADS-B, minutes for
     * ships/APRS/radiosondes.
     *
     * This one-shot GET /api/tracks backfills everything RF Sentinel is
     * currently tracking so the map is fully populated immediately.
     * It is intentionally fire-and-forget; a failure here is harmless
     * because the WebSocket will deliver updates anyway.
     */
    async function seedInitialTracks() {
        try {
            const url = `${getBaseUrl()}/api/tracks?max_age=${CONFIG.trackMaxAgeSeconds}`;
            console.log('RFSentinel: Seeding initial tracks from', url);
            
            const response = await fetch(url, { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const tracks = await response.json();
            
            if (Array.isArray(tracks) && tracks.length > 0) {
                tracks.forEach(track => handleTrackUpdate(track));
                console.log(`RFSentinel: Seeded ${tracks.length} tracks`);
            } else {
                console.log('RFSentinel: No active tracks to seed');
            }
        } catch (e) {
            // Non-fatal — WebSocket will deliver updates as they arrive
            console.warn('RFSentinel: Initial track seed failed (non-fatal):', e.message);
        }
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
                    
                case 'track_batch':
                    // RF Sentinel v3.3+ batches track updates for efficiency
                    handleTrackBatch(message.data || message);
                    break;
                    
                case 'track_new':
                    handleTrackUpdate(message.data || message);
                    break;
                    
                case 'track_lost':
                    handleTrackLost(message.data?.id || message.id);
                    break;
                    
                case 'weather':
                    handleWeatherUpdate(message.data || message);
                    break;
                    
                case 'fisb_update':
                    // RF Sentinel emits FIS-B weather products as 'fisb_update'
                    handleFisBUpdate(message.data || message);
                    break;
                    
                case 'weather_conditions':
                    // Open-Meteo current conditions from RF Sentinel
                    handleWeatherConditions(message.data || message);
                    break;
                    
                case 'alert':
                    handleAlert(message.data || message);
                    break;
                    
                case 'service_status':
                    handleServiceStatus(message.data || message);
                    break;
                    
                case 'service_error':
                    handleServiceError(message.data || message);
                    break;
                    
                case 'system_status':
                    handleSystemStatus(message.data || message);
                    break;
                    
                case 'location_update':
                    handleLocationUpdate(message.data || message);
                    break;
                    
                case 'correlation_new':
                case 'correlation_update':
                case 'correlation_lost':
                    handleCorrelationEvent(message.type, message.data || message);
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
    
    /**
     * Handle batched track updates (RF Sentinel v3.3+)
     * More efficient than individual updates for high-volume data
     */
    function handleTrackBatch(data) {
        if (!data || !data.tracks || !Array.isArray(data.tracks)) {
            console.warn('RFSentinel: Invalid track batch data');
            return;
        }
        
        const batchCount = data.count || data.tracks.length;
        console.debug(`RFSentinel: Processing batch of ${batchCount} tracks`);
        
        // Process all tracks in the batch
        data.tracks.forEach(track => handleTrackUpdate(track));
        
        // Emit batch complete event
        emitEvent('track:batch', { count: batchCount });
    }
    
    /**
     * Handle service status updates
     */
    function handleServiceStatus(data) {
        if (!data) return;
        
        emitEvent('service:status', data);
        
        // Update internal service state if needed
        if (data.service && data.status) {
            console.log(`RFSentinel: Service ${data.service} status: ${data.status}`);
        }
    }
    
    /**
     * Handle service error notifications
     */
    function handleServiceError(data) {
        if (!data) return;
        
        console.warn('RFSentinel: Service error:', data);
        emitEvent('service:error', data);
    }
    
    /**
     * Handle system status updates
     */
    function handleSystemStatus(data) {
        if (!data) return;
        
        // Update server health info
        state.serverHealth = {
            ...state.serverHealth,
            ...data
        };
        
        emitEvent('system:status', data);
    }
    
    /**
     * Handle location updates from RF Sentinel GPS
     */
    function handleLocationUpdate(data) {
        if (!data) return;
        
        state.stationLocation = {
            latitude: data.latitude || data.lat,
            longitude: data.longitude || data.lon,
            altitude: data.altitude || data.alt,
            source: data.source || 'gps',
            timestamp: Date.now()
        };
        
        emitEvent('location:update', state.stationLocation);
        requestMapRefresh();
    }
    
    /**
     * Handle correlation events (RF Sentinel Pro feature)
     * Correlation links multiple tracks that belong to the same physical object
     * e.g., ADS-B + Remote ID from same drone
     */
    function handleCorrelationEvent(eventType, data) {
        if (!data) return;
        
        const correlationId = data.id || data.correlation_id;
        
        switch (eventType) {
            case 'correlation_new':
                console.log('RFSentinel: New correlation:', correlationId);
                if (correlationId) {
                    state.correlations.set(correlationId, {
                        ...data,
                        lastUpdate: Date.now()
                    });
                }
                emitEvent('correlation:new', data);
                requestMapRefresh();
                break;
                
            case 'correlation_update':
                if (correlationId && state.correlations.has(correlationId)) {
                    state.correlations.set(correlationId, {
                        ...state.correlations.get(correlationId),
                        ...data,
                        lastUpdate: Date.now()
                    });
                }
                emitEvent('correlation:update', data);
                requestMapRefresh();
                break;
                
            case 'correlation_lost':
                console.log('RFSentinel: Correlation lost:', correlationId);
                if (correlationId) {
                    state.correlations.delete(correlationId);
                }
                emitEvent('correlation:lost', data);
                requestMapRefresh();
                break;
        }
    }

    // ==================== MQTT Connection ====================

    /**
     * Load MQTT.js library - tries local bundle first, CDN fallback
     * Local bundle enables MQTT even when GridDown has no internet access
     * (RF Sentinel and GridDown communicate over local network)
     */
    async function loadMqttLibrary() {
        if (mqttLibLoaded || typeof mqtt !== 'undefined') {
            mqttLibLoaded = true;
            return true;
        }
        
        // Try local bundled copy first (works offline)
        try {
            await loadScript('js/vendor/mqtt.min.js');
            console.log('RFSentinel: MQTT.js loaded from local bundle');
            mqttLibLoaded = true;
            return true;
        } catch (e) {
            console.warn('RFSentinel: Local MQTT.js not found, trying CDN...');
        }
        
        // Fallback to CDN (requires internet)
        try {
            await loadScript('https://unpkg.com/mqtt@5.3.4/dist/mqtt.min.js');
            console.log('RFSentinel: MQTT.js loaded from CDN');
            mqttLibLoaded = true;
            return true;
        } catch (e) {
            throw new Error('Failed to load MQTT.js library. Bundle js/vendor/mqtt.min.js for offline use.');
        }
    }
    
    /**
     * Load a script element and return a promise
     */
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load: ${src}`));
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
                
                // Seed current tracks via REST (same reason as WebSocket mode —
                // MQTT only delivers messages published after subscription)
                seedInitialTracks();
                
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
            CONFIG.mqttTopics.emergency,
            'rfsentinel/correlation/#',   // Correlation events
            'rfsentinel/status/#'         // Service status + GPS location
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
            
            // Unwrap payload: MQTT bridge wraps data in { type, data, station_id, timestamp }
            const payload = data.data || data;
            
            // Route based on topic
            if (topic.startsWith('rfsentinel/tracks')) {
                if (topic.includes('/lost')) {
                    handleTrackLost(payload.id || payload);
                } else {
                    handleTrackUpdate(payload);
                }
            } else if (topic.startsWith('rfsentinel/weather')) {
                // Differentiate weather sub-topics
                if (topic.includes('/conditions')) {
                    handleWeatherConditions(payload);
                } else if (data.type === 'fisb_update' || topic.includes('/fisb') || topic.includes('/metar') || topic.includes('/taf') || topic.includes('/sigmet') || topic.includes('/pirep') || topic.includes('/tfr')) {
                    handleFisBUpdate(payload);
                } else {
                    handleWeatherUpdate(payload);
                }
            } else if (topic.startsWith('rfsentinel/correlation')) {
                // Correlation events from MQTT bridge
                const eventType = data.type || 'correlation_update';
                handleCorrelationEvent(eventType, payload);
            } else if (topic.startsWith('rfsentinel/status')) {
                // Service status and location updates from MQTT bridge
                if (topic.includes('/location') || data.type === 'location_update') {
                    handleLocationUpdate(payload);
                } else if (data.type === 'service_status') {
                    handleServiceStatus(payload);
                }
            } else if (topic === CONFIG.mqttTopics.alerts) {
                handleAlert(payload);
            } else if (topic === CONFIG.mqttTopics.emergency) {
                // Emergency message - treat as alert with high priority
                handleAlert({ ...payload, severity: 'critical' });
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
            const response = await fetch(
                `${getBaseUrl()}/api/tracks?max_age=${CONFIG.trackMaxAgeSeconds}`,
                { cache: 'no-store' }  // Prevent browser caching stale track data
            );
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
            
            // Purge stale tracks from the Map so counts stay accurate
            // and memory doesn't grow unbounded in WebSocket/MQTT mode.
            // (REST polling already reconciles via fetchAllTracks.)
            if (state.connectionMode !== 'rest') {
                purgeStaleTrack();
            }
        }, CONFIG.healthCheckIntervalMs);
    }

    /**
     * Remove tracks from state.tracks that have exceeded trackMaxAgeSeconds.
     *
     * In WebSocket and MQTT modes, tracks are only added/updated — never
     * removed — unless a track_lost event arrives.  Without periodic purging
     * the Map grows indefinitely, causing dashboard counts to drift above
     * what the renderer actually displays on the map.
     */
    function purgeStaleTrack() {
        const now = Date.now();
        const maxAge = CONFIG.trackMaxAgeSeconds * 1000;
        let purged = 0;
        
        for (const [id, track] of state.tracks) {
            const age = now - (track.lastUpdate || track.timestamp || 0);
            if (age > maxAge) {
                state.tracks.delete(id);
                purged++;
            }
        }
        
        if (purged > 0) {
            console.debug(`RFSentinel: Purged ${purged} stale tracks`);
            updateTrackCounts();
            requestMapRefresh();
        }
    }

    async function checkHealth(retries = 1, timeoutMs = 5000) {
        const attempts = Math.max(1, retries);
        
        for (let attempt = 1; attempt <= attempts; attempt++) {
            try {
                const response = await fetch(`${getBaseUrl()}/health`, {
                    signal: AbortSignal.timeout(timeoutMs),
                    cache: 'no-store'
                });
                
                if (!response.ok) {
                    if (attempt < attempts) {
                        console.warn(`RFSentinel: Health check attempt ${attempt}/${attempts} got HTTP ${response.status}, retrying...`);
                        continue;
                    }
                    return null;
                }
                
                const health = await response.json();
                state.lastHealthCheck = Date.now();
                state.serverHealth = health;
                
                if (attempt > 1) {
                    console.log(`RFSentinel: Health check succeeded on attempt ${attempt}/${attempts}`);
                }
                
                return health;
            } catch (e) {
                if (attempt < attempts) {
                    console.warn(`RFSentinel: Health check attempt ${attempt}/${attempts} failed (${e.message}), retrying...`);
                } else {
                    console.warn('RFSentinel: Health check error:', e);
                    return null;
                }
            }
        }
        
        return null;
    }

    // ==================== Track Management ====================

    function handleTrackUpdate(track) {
        if (!track || !track.id) return;
        
        // Flatten metadata into top-level (REST API returns metadata as nested
        // dict, but WebSocket sends fields at top-level — normalize here so
        // rendering code can always use track.callsign, track.squawk, etc.)
        if (track.metadata && typeof track.metadata === 'object') {
            for (const [key, value] of Object.entries(track.metadata)) {
                if (!(key in track)) {
                    track[key] = value;
                }
            }
        }
        
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
            // Use last_seen from RF Sentinel when available — this is the
            // actual detection timestamp from the database and matches how
            // RF Sentinel's own dashboard ages tracks.  For real-time WS
            // updates last_seen ≈ Date.now(); for REST-seeded tracks it
            // reflects the true age so counts stay aligned with RF Sentinel.
            lastUpdate: track.last_seen
                ? new Date(track.last_seen).getTime()
                : Date.now(),
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
            'fpv': 'fpv',
            'drone_rf': 'fpv',
            'radiosonde': 'radiosonde',
            'sonde': 'radiosonde',
            'balloon': 'radiosonde',
            'aprs': 'aprs'
        };
        
        return typeMap[type.toLowerCase()] || null;
    }

    function updateTrackCounts() {
        state.trackCounts = { aircraft: 0, ship: 0, drone: 0, fpv: 0, radiosonde: 0, aprs: 0 };
        
        const now = Date.now();
        const maxAge = CONFIG.trackMaxAgeSeconds * 1000;
        
        for (const [id, track] of state.tracks) {
            // Apply same filters as renderOnMap so counts match what's displayed
            const age = now - (track.lastUpdate || track.timestamp || 0);
            if (age > maxAge) continue;
            
            if (!track.lat && !track.latitude) continue;
            if (!track.lon && !track.longitude) continue;
            
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

    // ==================== FIS-B Update Handler ====================
    
    /**
     * Handle FIS-B weather product push from RF Sentinel WebSocket
     * This is the real-time push version — separate from the REST fetch
     */
    function handleFisBUpdate(data) {
        if (!data) return;
        
        // FIS-B products come with a product_type field
        const productType = data.product_type || '';
        
        if (data.metars || productType === 'metar') {
            state.fisBData.metars = data.metars || (data.data ? [data.data] : []);
        }
        if (data.tafs || productType === 'taf') {
            state.fisBData.tafs = data.tafs || (data.data ? [data.data] : []);
        }
        if (data.sigmets || productType === 'sigmet') {
            state.fisBData.sigmets = data.sigmets || (data.data ? [data.data] : []);
        }
        if (data.tfrs || productType === 'tfr') {
            state.fisBData.tfrs = data.tfrs || (data.data ? [data.data] : []);
        }
        if (data.pireps || productType === 'pirep') {
            state.fisBData.pireps = data.pireps || (data.data ? [data.data] : []);
        }
        
        state.fisBData.lastUpdate = Date.now();
        state.fisBData.isStale = false;
        
        emitEvent('weather:fisb', state.fisBData);
        emitEvent('weather:updated', state.fisBData);
    }
    
    // ==================== Weather Conditions Handler ====================
    
    /**
     * Handle Open-Meteo current weather conditions from RF Sentinel
     * Provides temperature, humidity, wind, pressure, etc. without internet
     */
    function handleWeatherConditions(data) {
        if (!data) return;
        
        state.weatherConditions = {
            temperature_c: data.temperature_c ?? data.temperature,
            feels_like_c: data.feels_like_c ?? data.apparent_temperature,
            humidity: data.humidity ?? data.relative_humidity,
            wind_speed_mps: data.wind_speed_mps ?? data.wind_speed,
            wind_direction: data.wind_direction ?? data.wind_direction_deg,
            wind_gust_mps: data.wind_gust_mps ?? data.wind_gust,
            pressure_hpa: data.pressure_hpa ?? data.surface_pressure,
            visibility_m: data.visibility_m ?? data.visibility,
            cloud_cover: data.cloud_cover,
            conditions: data.conditions || data.description || '',
            uv_index: data.uv_index,
            precipitation_mm: data.precipitation_mm ?? data.precipitation,
            timestamp: Date.now(),
            source: 'open_meteo_via_rfsentinel'
        };
        
        emitEvent('weather:conditions', state.weatherConditions);
    }

    // ==================== Track Hit Testing & Details ====================
    
    /**
     * Hit-test for map click — find the nearest track to a screen coordinate
     * @param {number} clickX - Screen X coordinate
     * @param {number} clickY - Screen Y coordinate  
     * @param {Function} latLonToPixel - Map projection function
     * @returns {Object|null} The nearest track within hit radius, or null
     */
    function hitTest(clickX, clickY, latLonToPixel) {
        if (!state.connected || state.tracks.size === 0) return null;
        
        const hitRadius = 20;  // pixels
        const now = Date.now();
        let closestTrack = null;
        let closestDist = Infinity;
        
        for (const [id, track] of state.tracks) {
            if (!isTrackTypeEnabled(track.type)) continue;
            
            const lat = track.lat || track.latitude;
            const lon = track.lon || track.longitude;
            if (!lat || !lon) continue;
            
            const age = now - (track.lastUpdate || track.timestamp || 0);
            if (age > CONFIG.trackMaxAgeSeconds * 1000) continue;
            
            const pixel = latLonToPixel(lat, lon);
            const dx = clickX - pixel.x;
            const dy = clickY - pixel.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist <= hitRadius && dist < closestDist) {
                closestDist = dist;
                closestTrack = track;
            }
        }
        
        return closestTrack;
    }
    
    /**
     * Format track details for display in popup/modal
     * Returns an array of { label, value } pairs with all available metadata
     */
    function getTrackDetails(track) {
        if (!track) return [];
        
        const details = [];
        const type = track.type || 'unknown';
        const typeConfig = TRACK_TYPES[type] || {};
        
        details.push({ label: 'Type', value: `${typeConfig.icon || ''} ${typeConfig.name || type}` });
        
        if (track.callsign) details.push({ label: 'Callsign', value: track.callsign });
        if (track.name) details.push({ label: 'Name', value: track.name });
        if (track.identifier) details.push({ label: 'Identifier', value: track.identifier });
        
        // Aircraft-specific
        if (type === 'aircraft') {
            if (track.icao || track.icao_hex) details.push({ label: 'ICAO', value: track.icao || track.icao_hex });
            if (track.registration) details.push({ label: 'Registration', value: track.registration });
            if (track.aircraft_type || track.model) details.push({ label: 'Aircraft', value: track.aircraft_type || track.model });
            if (track.operator) details.push({ label: 'Operator', value: track.operator });
            if (track.squawk) {
                const sqInfo = EMERGENCY_SQUAWKS[String(track.squawk)];
                details.push({ label: 'Squawk', value: sqInfo ? `${track.squawk} (${sqInfo.name})` : track.squawk });
            }
            if (track.source) details.push({ label: 'Source', value: track.source.toUpperCase() });
        }
        
        // Ship-specific
        if (type === 'ship') {
            if (track.mmsi) details.push({ label: 'MMSI', value: track.mmsi });
            if (track.ship_type) details.push({ label: 'Ship Type', value: track.ship_type });
            if (track.destination) details.push({ label: 'Destination', value: track.destination });
            if (track.length) details.push({ label: 'Length', value: `${track.length}m` });
            if (track.nav_status) details.push({ label: 'Nav Status', value: track.nav_status });
        }
        
        // Drone-specific
        if (type === 'drone') {
            if (track.operator_id) details.push({ label: 'Operator ID', value: track.operator_id });
            if (track.uas_id || track.serial) details.push({ label: 'UAS ID', value: track.uas_id || track.serial });
            if (track.manufacturer) details.push({ label: 'Manufacturer', value: track.manufacturer });
        }
        
        // Position data
        const lat = track.lat || track.latitude;
        const lon = track.lon || track.longitude;
        if (lat && lon) details.push({ label: 'Position', value: `${lat.toFixed(4)}°, ${lon.toFixed(4)}°` });
        
        const alt = track.altitude_m ?? track.altitude ?? track.alt_baro ?? track.alt;
        if (alt != null) {
            const altFt = Math.round(alt * 3.28084);
            details.push({ label: 'Altitude', value: `${altFt.toLocaleString()} ft (${Math.round(alt)}m)` });
        }
        
        const speed = track.speed_mps ?? track.ground_speed ?? track.speed ?? track.sog;
        if (speed != null) {
            const speedKts = Math.round(speed * 1.94384);
            details.push({ label: 'Speed', value: `${speedKts} kts (${Math.round(speed)} m/s)` });
        }
        
        const heading = track.heading ?? track.track ?? track.cog;
        if (heading != null) {
            details.push({ label: 'Heading', value: `${Math.round(heading)}°` });
        }
        
        if (track.vert_rate || track.vertical_speed) {
            const vr = track.vert_rate || track.vertical_speed;
            details.push({ label: 'Vert Rate', value: `${vr > 0 ? '+' : ''}${Math.round(vr * 196.85)} fpm` });
        }
        
        // Distance from station
        if (state.stationLocation && lat && lon) {
            const dist = haversineDistance(
                state.stationLocation.latitude, state.stationLocation.longitude,
                lat, lon
            );
            if (dist != null) {
                const distNm = (dist / 1852).toFixed(1);
                const distKm = (dist / 1000).toFixed(1);
                details.push({ label: 'Distance', value: `${distNm} nm (${distKm} km)` });
            }
        }
        
        // Correlation info
        const correlation = getCorrelationForTrack(track.id);
        if (correlation) {
            const linkedTracks = (correlation.tracks || [])
                .filter(t => t.track_id !== track.id)
                .map(t => t.track_id?.slice(0, 10))
                .join(', ');
            if (linkedTracks) {
                details.push({ label: 'Correlated', value: `🔗 ${linkedTracks}` });
            }
        }
        
        // Last update
        if (track.lastUpdate) {
            const age = Math.round((Date.now() - track.lastUpdate) / 1000);
            details.push({ label: 'Last Update', value: age < 60 ? `${age}s ago` : `${Math.round(age / 60)}m ago` });
        }
        
        return details;
    }
    
    /**
     * Simple haversine distance between two lat/lon points
     * @returns distance in meters
     */
    function haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371000; // Earth radius in meters
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    
    /**
     * Find the correlation that includes a given track ID
     * @returns {Object|null} Correlation data or null
     */
    function getCorrelationForTrack(trackId) {
        if (!trackId) return null;
        
        for (const [id, corr] of state.correlations) {
            const tracks = corr.tracks || corr.track_ids || [];
            const trackIds = tracks.map(t => typeof t === 'string' ? t : t.track_id);
            if (trackIds.includes(trackId)) {
                return corr;
            }
        }
        return null;
    }

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
        if (!state.connected) return;
        
        const now = Date.now();
        let renderedCount = 0;
        
        // Render station location first (underneath tracks)
        renderStationMarker(ctx, width, height, latLonToPixel, zoom);
        
        // Render correlation lines between correlated tracks (underneath track icons)
        renderCorrelationLines(ctx, latLonToPixel, now);
        
        if (state.tracks.size === 0) return;
        
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
        
        // Draw based on track type with distinct silhouette icons
        if (track.type === 'aircraft') {
            renderAircraft(ctx, x, y, track, color, isEmergency);
        } else if (track.type === 'ship') {
            renderShip(ctx, x, y, track, color, isEmergency);
        } else if (track.type === 'drone') {
            renderDrone(ctx, x, y, track, color, isEmergency);
        } else if (track.type === 'radiosonde') {
            renderRadiosonde(ctx, x, y, color, isEmergency);
        } else if (track.type === 'aprs') {
            renderAPRS(ctx, x, y, color, isEmergency);
        } else {
            // Fallback generic marker for unknown types
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
                const labelY = y + 22;
                ctx.strokeText(label, x, labelY);
                ctx.fillText(label, x, labelY);
            }
        }
        
        ctx.restore();
    }

    /**
     * Render aircraft as top-down airplane silhouette
     * Fuselage + swept wings + horizontal stabilizer, rotates with heading
     */
    function renderAircraft(ctx, x, y, track, color, isEmergency) {
        const heading = track.heading || track.track || 0;
        const fillColor = isEmergency ? '#ef4444' : color;
        const strokeColor = isEmergency ? '#fff' : 'rgba(255,255,255,0.6)';
        
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((heading * Math.PI) / 180);
        
        // Fuselage
        ctx.beginPath();
        ctx.moveTo(0, -14);    // Nose
        ctx.lineTo(2, -10);    // Nose taper right
        ctx.lineTo(2, -4);     // Fuselage right before wing
        ctx.lineTo(11, 0);     // Right wing tip
        ctx.lineTo(11, 2);     // Right wing trailing edge tip
        ctx.lineTo(2, 0);      // Right wing root trailing edge
        ctx.lineTo(2, 8);      // Fuselage right before tail
        ctx.lineTo(6, 11);     // Right stabilizer tip
        ctx.lineTo(6, 12);     // Right stabilizer trailing edge
        ctx.lineTo(1, 10);     // Right stabilizer root
        ctx.lineTo(0, 11);     // Tail center
        ctx.lineTo(-1, 10);    // Left stabilizer root
        ctx.lineTo(-6, 12);    // Left stabilizer trailing edge
        ctx.lineTo(-6, 11);    // Left stabilizer tip
        ctx.lineTo(-2, 8);     // Fuselage left before tail
        ctx.lineTo(-2, 0);     // Left wing root trailing edge
        ctx.lineTo(-11, 2);    // Left wing trailing edge tip
        ctx.lineTo(-11, 0);    // Left wing tip
        ctx.lineTo(-2, -4);    // Fuselage left before wing
        ctx.lineTo(-2, -10);   // Nose taper left
        ctx.closePath();
        
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // Emergency pulse ring
        if (isEmergency) {
            const pulse = (Math.sin(Date.now() / 150) + 1) / 2;
            ctx.beginPath();
            ctx.arc(0, 0, 18 + pulse * 10, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(239, 68, 68, ${0.5 - pulse * 0.3})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        
        ctx.restore();
    }

    /**
     * Render ship as top-down vessel hull with superstructure
     * Pointed bow + hull + bridge block, rotates with heading/COG
     */
    function renderShip(ctx, x, y, track, color, isEmergency) {
        const heading = track.heading || track.cog || 0;
        const fillColor = isEmergency ? '#ef4444' : color;
        const strokeColor = isEmergency ? '#fff' : 'rgba(255,255,255,0.6)';
        
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((heading * Math.PI) / 180);
        
        // Hull outline - pointed bow, wider stern
        ctx.beginPath();
        ctx.moveTo(0, -13);    // Bow point
        ctx.lineTo(4, -6);     // Forward starboard
        ctx.lineTo(5, 0);      // Mid starboard (beam)
        ctx.lineTo(5, 7);      // Aft starboard
        ctx.lineTo(4, 10);     // Stern starboard
        ctx.lineTo(-4, 10);    // Stern port
        ctx.lineTo(-5, 7);     // Aft port
        ctx.lineTo(-5, 0);     // Mid port (beam)
        ctx.lineTo(-4, -6);    // Forward port
        ctx.closePath();
        
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // Superstructure / bridge (lighter block near aft)
        ctx.beginPath();
        ctx.rect(-3, 2, 6, 5);
        ctx.fillStyle = isEmergency ? '#fca5a5' : lightenColor(color, 0.35);
        ctx.fill();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 0.5;
        ctx.stroke();
        
        ctx.restore();
    }

    /**
     * Render drone as quadcopter silhouette
     * Central body + 4 motor arms + rotor circles
     */
    function renderDrone(ctx, x, y, track, color, isEmergency) {
        const heading = track.heading || 0;
        const fillColor = isEmergency ? '#ef4444' : color;
        const strokeColor = isEmergency ? '#fff' : 'rgba(255,255,255,0.6)';
        
        ctx.save();
        ctx.translate(x, y);
        if (heading) {
            ctx.rotate((heading * Math.PI) / 180);
        }
        
        // Motor arms (X pattern)
        ctx.strokeStyle = fillColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-8, -8); ctx.lineTo(8, 8);    // Arm NW to SE
        ctx.moveTo(8, -8);  ctx.lineTo(-8, 8);    // Arm NE to SW
        ctx.stroke();
        
        // Central body (rounded square)
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // Four rotor circles at arm tips
        const rotorRadius = 3.5;
        const armPositions = [[-8, -8], [8, -8], [8, 8], [-8, 8]];
        armPositions.forEach(([rx, ry]) => {
            ctx.beginPath();
            ctx.arc(rx, ry, rotorRadius, 0, Math.PI * 2);
            ctx.strokeStyle = fillColor;
            ctx.lineWidth = 1;
            ctx.stroke();
        });
        
        // Direction indicator (front dot) - forward is up
        ctx.beginPath();
        ctx.arc(0, -4.5, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = strokeColor;
        ctx.fill();
        
        // Emergency pulse ring
        if (isEmergency) {
            const pulse = (Math.sin(Date.now() / 150) + 1) / 2;
            ctx.beginPath();
            ctx.arc(0, 0, 16 + pulse * 10, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(239, 68, 68, ${0.5 - pulse * 0.3})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        
        ctx.restore();
    }

    /**
     * Render radiosonde as weather balloon with payload gondola
     * Circle balloon + tether line + small payload box
     */
    function renderRadiosonde(ctx, x, y, color, isEmergency) {
        const fillColor = isEmergency ? '#ef4444' : color;
        const strokeColor = isEmergency ? '#fff' : 'rgba(255,255,255,0.6)';
        
        ctx.save();
        
        // Balloon (oval, slightly taller than wide)
        ctx.beginPath();
        ctx.ellipse(x, y - 5, 6, 8, 0, 0, Math.PI * 2);
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // Balloon highlight (small shine)
        ctx.beginPath();
        ctx.ellipse(x - 2, y - 8, 1.5, 2.5, -0.3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fill();
        
        // Tether line
        ctx.beginPath();
        ctx.moveTo(x, y + 3);
        ctx.lineTo(x - 1, y + 7);
        ctx.lineTo(x + 1, y + 9);
        ctx.lineTo(x, y + 12);
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 0.8;
        ctx.stroke();
        
        // Payload gondola (small rectangle)
        ctx.beginPath();
        ctx.rect(x - 2.5, y + 12, 5, 4);
        ctx.fillStyle = isEmergency ? '#fca5a5' : lightenColor(color, 0.3);
        ctx.fill();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 0.8;
        ctx.stroke();
        
        ctx.restore();
    }

    /**
     * Render APRS station as radio tower / antenna
     * Vertical mast + triangular base + signal arcs
     */
    function renderAPRS(ctx, x, y, color, isEmergency) {
        const fillColor = isEmergency ? '#ef4444' : color;
        const strokeColor = isEmergency ? '#fff' : 'rgba(255,255,255,0.6)';
        const parentAlpha = ctx.globalAlpha || 1;
        
        ctx.save();
        
        // Tower mast (vertical line)
        ctx.beginPath();
        ctx.moveTo(x, y - 12);
        ctx.lineTo(x, y + 8);
        ctx.strokeStyle = fillColor;
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Triangular base / guy-wire supports
        ctx.beginPath();
        ctx.moveTo(x, y + 1);      // Mast attachment point
        ctx.lineTo(x - 6, y + 8);  // Left base
        ctx.lineTo(x + 6, y + 8);  // Right base
        ctx.closePath();
        ctx.fillStyle = fillColor;
        ctx.globalAlpha = parentAlpha * 0.5;
        ctx.fill();
        ctx.globalAlpha = parentAlpha;  // Restore cleanly
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 0.8;
        ctx.stroke();
        
        // Antenna tip (small diamond at top)
        ctx.beginPath();
        ctx.moveTo(x, y - 14);    // Top
        ctx.lineTo(x + 2, y - 12);
        ctx.lineTo(x, y - 10);
        ctx.lineTo(x - 2, y - 12);
        ctx.closePath();
        ctx.fillStyle = fillColor;
        ctx.fill();
        
        // Signal arcs (two small arcs emanating from antenna)
        ctx.strokeStyle = fillColor;
        ctx.lineWidth = 1;
        ctx.globalAlpha = parentAlpha * 0.6;
        
        // Right arc
        ctx.beginPath();
        ctx.arc(x, y - 12, 5, -Math.PI * 0.4, Math.PI * 0.1);
        ctx.stroke();
        
        // Left arc
        ctx.beginPath();
        ctx.arc(x, y - 12, 5, Math.PI * 0.9, Math.PI * 1.4);
        ctx.stroke();
        
        // Outer arcs (fainter)
        ctx.globalAlpha = parentAlpha * 0.3;
        ctx.beginPath();
        ctx.arc(x, y - 12, 8, -Math.PI * 0.35, Math.PI * 0.05);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y - 12, 8, Math.PI * 0.95, Math.PI * 1.35);
        ctx.stroke();
        
        ctx.restore();
    }

    /**
     * Fallback generic marker for unknown track types
     */
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

    /**
     * Lighten a hex color by a given amount for icon detail elements
     * @param {string} hex - Hex color string (e.g. '#3b82f6')
     * @param {number} amount - Lighten factor 0-1
     * @returns {string} Lightened hex color
     */
    function lightenColor(hex, amount) {
        try {
            const num = parseInt(hex.replace('#', ''), 16);
            const r = Math.min(255, ((num >> 16) & 0xff) + Math.round(255 * amount));
            const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(255 * amount));
            const b = Math.min(255, (num & 0xff) + Math.round(255 * amount));
            return `rgb(${r},${g},${b})`;
        } catch (e) {
            return hex;
        }
    }
    
    /**
     * Render the RF Sentinel station location on the map
     * Shows as a pulsing radar icon so the user knows where the receiver is
     */
    function renderStationMarker(ctx, width, height, latLonToPixel, zoom) {
        const loc = state.stationLocation;
        if (!loc || !loc.latitude || !loc.longitude) return;
        
        const pixel = latLonToPixel(loc.latitude, loc.longitude);
        
        // Skip if off-screen
        if (pixel.x < -30 || pixel.x > width + 30 ||
            pixel.y < -30 || pixel.y > height + 30) {
            return;
        }
        
        const x = pixel.x;
        const y = pixel.y;
        
        ctx.save();
        
        // Pulsing radar ring
        const pulse = (Math.sin(Date.now() / 1000) + 1) / 2;  // 0-1 slow pulse
        ctx.beginPath();
        ctx.arc(x, y, 12 + pulse * 6, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(59, 130, 246, ${0.4 - pulse * 0.3})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        // Station dot
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#3b82f6';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Cross-hair lines (subtle)
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - 10, y); ctx.lineTo(x - 4, y);
        ctx.moveTo(x + 4, y); ctx.lineTo(x + 10, y);
        ctx.moveTo(x, y - 10); ctx.lineTo(x, y - 4);
        ctx.moveTo(x, y + 4); ctx.lineTo(x, y + 10);
        ctx.stroke();
        
        // Label
        if (zoom >= 8) {
            ctx.font = '9px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#93c5fd';
            ctx.strokeStyle = 'rgba(0,0,0,0.7)';
            ctx.lineWidth = 2;
            ctx.strokeText('RF Sentinel', x, y + 22);
            ctx.fillText('RF Sentinel', x, y + 22);
        }
        
        ctx.restore();
    }
    
    /**
     * Render dashed lines between correlated tracks
     * e.g., connecting an ADS-B aircraft track with its Remote ID drone track
     */
    function renderCorrelationLines(ctx, latLonToPixel, now) {
        if (state.correlations.size === 0) return;
        
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(34, 197, 94, 0.6)';  // Green dashed line
        
        for (const [id, corr] of state.correlations) {
            const trackIds = (corr.tracks || corr.track_ids || [])
                .map(t => typeof t === 'string' ? t : t.track_id);
            
            // Collect positions of all tracks in this correlation
            const positions = [];
            for (const trackId of trackIds) {
                const track = state.tracks.get(trackId);
                if (!track) continue;
                
                const lat = track.lat || track.latitude;
                const lon = track.lon || track.longitude;
                if (!lat || !lon) continue;
                
                const age = now - (track.lastUpdate || track.timestamp || 0);
                if (age > CONFIG.trackMaxAgeSeconds * 1000) continue;
                
                positions.push(latLonToPixel(lat, lon));
            }
            
            // Draw lines between each pair of correlated track positions
            if (positions.length >= 2) {
                for (let i = 0; i < positions.length - 1; i++) {
                    ctx.beginPath();
                    ctx.moveTo(positions[i].x, positions[i].y);
                    ctx.lineTo(positions[i + 1].x, positions[i + 1].y);
                    ctx.stroke();
                    
                    // Link icon at midpoint
                    const mx = (positions[i].x + positions[i + 1].x) / 2;
                    const my = (positions[i].y + positions[i + 1].y) / 2;
                    ctx.fillStyle = 'rgba(34, 197, 94, 0.8)';
                    ctx.font = '10px system-ui';
                    ctx.textAlign = 'center';
                    ctx.fillText('🔗', mx, my + 3);
                }
            }
        }
        
        ctx.setLineDash([]);
        ctx.restore();
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
        getUseHttps: () => state.useHttps,
        setUseHttps: (val) => { state.useHttps = val; saveSettings(); },
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
        
        // Weather conditions (from Open-Meteo via RF Sentinel)
        getWeatherConditions: () => state.weatherConditions ? { ...state.weatherConditions } : null,
        
        // Station location
        getStationLocation: () => state.stationLocation ? { ...state.stationLocation } : null,
        
        // Correlations
        getCorrelations: () => [...state.correlations.values()],
        getCorrelationForTrack,
        
        // Emergencies
        getEmergencyTracks: () => [...state.emergencyTracks],
        clearEmergencyTracks: () => { state.emergencyTracks = []; },
        
        // Alerts
        getAlerts: () => [...state.alerts],
        clearAlerts: () => { state.alerts = []; },
        
        // Map rendering & interaction
        renderOnMap,
        hitTest,
        getTrackDetails,
        
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
