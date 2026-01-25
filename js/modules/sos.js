/**
 * GridDown SOS/Emergency Module
 * Emergency beacon, check-in system, and distress signaling
 * Prepared for Meshtastic/Amateur Radio integration
 */
const SOSModule = (function() {
    'use strict';

    // Emergency types with protocols
    const EMERGENCY_TYPES = {
        medical: {
            id: 'medical',
            name: 'Medical Emergency',
            icon: '🏥',
            color: '#ef4444',
            priority: 1,
            prowords: 'MAYDAY MAYDAY MAYDAY',
            description: 'Injury, illness, or medical condition requiring assistance'
        },
        mechanical: {
            id: 'mechanical',
            name: 'Vehicle/Equipment Failure',
            icon: '🔧',
            color: '#f59e0b',
            priority: 2,
            prowords: 'PAN PAN PAN',
            description: 'Vehicle breakdown or critical equipment failure'
        },
        lost: {
            id: 'lost',
            name: 'Lost/Disoriented',
            icon: '🧭',
            color: '#3b82f6',
            priority: 2,
            prowords: 'PAN PAN PAN',
            description: 'Unable to determine location or route'
        },
        weather: {
            id: 'weather',
            name: 'Weather Emergency',
            icon: '⛈️',
            color: '#8b5cf6',
            priority: 2,
            prowords: 'PAN PAN PAN',
            description: 'Severe weather, flash flood, or exposure risk'
        },
        security: {
            id: 'security',
            name: 'Security Threat',
            icon: '⚠️',
            color: '#dc2626',
            priority: 1,
            prowords: 'MAYDAY MAYDAY MAYDAY',
            description: 'Hostile encounter or immediate danger from people'
        },
        overdue: {
            id: 'overdue',
            name: 'Overdue/No Contact',
            icon: '⏰',
            color: '#ec4899',
            priority: 3,
            prowords: 'SECURITE SECURITE SECURITE',
            description: 'Missed check-in or communication window'
        },
        resources: {
            id: 'resources',
            name: 'Resource Emergency',
            icon: '💧',
            color: '#06b6d4',
            priority: 2,
            prowords: 'PAN PAN PAN',
            description: 'Critical shortage of water, fuel, or supplies'
        },
        general: {
            id: 'general',
            name: 'General Emergency',
            icon: '🆘',
            color: '#ef4444',
            priority: 1,
            prowords: 'MAYDAY MAYDAY MAYDAY',
            description: 'Unspecified emergency requiring immediate assistance'
        }
    };

    // Signal methods (for future integration)
    const SIGNAL_METHODS = {
        meshtastic: {
            id: 'meshtastic',
            name: 'Meshtastic',
            icon: '📡',
            status: 'not_connected',
            description: 'LoRa mesh network'
        },
        amateur: {
            id: 'amateur',
            name: 'Amateur Radio',
            icon: '📻',
            status: 'manual',
            description: 'HAM radio voice/digital'
        },
        satellite: {
            id: 'satellite',
            name: 'Satellite Messenger',
            icon: '🛰️',
            status: 'not_connected',
            description: 'InReach, SPOT, etc.'
        },
        visual: {
            id: 'visual',
            name: 'Visual Signals',
            icon: '🔦',
            status: 'available',
            description: 'Mirror, light, smoke'
        },
        audio: {
            id: 'audio',
            name: 'Audio Signals',
            icon: '📢',
            status: 'available',
            description: 'Whistle, horn, voice'
        }
    };

    // Ground-to-air signals
    const GROUND_AIR_SIGNALS = [
        { symbol: 'V', meaning: 'Require Assistance', description: 'General distress' },
        { symbol: 'X', meaning: 'Require Medical', description: 'Medical emergency' },
        { symbol: 'N', meaning: 'No/Negative', description: 'Answer no' },
        { symbol: 'Y', meaning: 'Yes/Affirmative', description: 'Answer yes' },
        { symbol: '→', meaning: 'Traveling This Direction', description: 'Direction of travel' },
        { symbol: 'I', meaning: 'Require Doctor', description: 'Serious injury' },
        { symbol: 'II', meaning: 'Require Supplies', description: 'Need food/water' },
        { symbol: 'F', meaning: 'Require Food & Water', description: 'Resource shortage' },
        { symbol: '△', meaning: 'Safe to Land', description: 'Landing zone clear' },
        { symbol: 'LL', meaning: 'All Well', description: 'No assistance needed' }
    ];

    // Whistle signals
    const WHISTLE_SIGNALS = [
        { pattern: '• • •', meaning: 'Help/Distress', description: '3 short blasts' },
        { pattern: '—', meaning: 'Stop/Attention', description: '1 long blast' },
        { pattern: '• •', meaning: 'Come to me', description: '2 short blasts' },
        { pattern: '—  —  —', meaning: 'SOS', description: '3 long blasts' }
    ];

    // Broadcast settings
    const BROADCAST_INTERVAL = 60000; // 60 seconds between repeat broadcasts
    const INITIAL_BURST_COUNT = 3;    // Send 3 times initially
    const INITIAL_BURST_DELAY = 5000; // 5 seconds between initial bursts

    // State
    let state = {
        isActive: false,
        activeEmergency: null,
        activatedAt: null,
        lastCheckIn: null,
        nextCheckIn: null,
        checkInInterval: 60, // minutes
        emergencyContacts: [],
        currentPosition: null,
        signalLog: [],
        acknowledgedBy: [],
        broadcastInterval: null,  // Interval ID for repeat broadcasts
        broadcastCount: 0,        // Number of broadcasts sent
        lastBroadcast: null,      // Timestamp of last broadcast
        meshtastic: {
            connected: false,
            nodeId: null,
            channel: null
        },
        aprs: {
            connected: false,
            callsign: null
        }
    };

    // Subscribers for state changes
    let subscribers = [];

    /**
     * Initialize the SOS module
     */
    async function init() {
        await loadState();
        setupPositionTracking();
        setupCheckInTimer();
        console.log('[SOS] Module initialized');
    }

    /**
     * Load saved state
     */
    async function loadState() {
        try {
            const saved = await Storage.Settings.get('sosState');
            if (saved) {
                state = { ...state, ...saved };
                // Restore dates
                if (saved.activatedAt) state.activatedAt = new Date(saved.activatedAt);
                if (saved.lastCheckIn) state.lastCheckIn = new Date(saved.lastCheckIn);
                if (saved.nextCheckIn) state.nextCheckIn = new Date(saved.nextCheckIn);
            }
            
            const contacts = await Storage.Settings.get('emergencyContacts');
            if (contacts) {
                state.emergencyContacts = contacts;
            }
        } catch (e) {
            console.error('[SOS] Failed to load state:', e);
        }
    }

    /**
     * Save state
     */
    async function saveState() {
        try {
            await Storage.Settings.set('sosState', {
                isActive: state.isActive,
                activeEmergency: state.activeEmergency,
                activatedAt: state.activatedAt?.toISOString(),
                lastCheckIn: state.lastCheckIn?.toISOString(),
                nextCheckIn: state.nextCheckIn?.toISOString(),
                checkInInterval: state.checkInInterval,
                signalLog: state.signalLog.slice(-50), // Keep last 50 entries
                acknowledgedBy: state.acknowledgedBy
            });
            await Storage.Settings.set('emergencyContacts', state.emergencyContacts);
        } catch (e) {
            console.error('[SOS] Failed to save state:', e);
        }
    }

    /**
     * Setup position tracking
     */
    function setupPositionTracking() {
        // Check for existing position (including manual) from GPSModule
        if (typeof GPSModule !== 'undefined') {
            const existingPos = GPSModule.getPosition();
            if (existingPos && existingPos.lat && existingPos.lon) {
                state.currentPosition = {
                    lat: existingPos.lat,
                    lon: existingPos.lon,
                    accuracy: existingPos.accuracy || null,
                    timestamp: new Date(),
                    isManual: existingPos.isManual || false
                };
            }
            
            // Subscribe to position updates from GPSModule
            GPSModule.subscribe((gpsState) => {
                const pos = GPSModule.getPosition();
                if (pos && pos.lat && pos.lon) {
                    state.currentPosition = {
                        lat: pos.lat,
                        lon: pos.lon,
                        accuracy: gpsState.accuracy || null,
                        timestamp: new Date(),
                        isManual: pos.isManual || false
                    };
                }
            });
        }
        
        // Get position from GPS events if available
        if (typeof Events !== 'undefined') {
            Events.on('gps:position', (pos) => {
                state.currentPosition = pos;
            });
            
            // Also listen for manual position changes
            Events.on('gps:manualPositionSet', (pos) => {
                state.currentPosition = {
                    lat: pos.lat,
                    lon: pos.lon,
                    accuracy: null,
                    timestamp: new Date(),
                    isManual: true
                };
            });
        }
        
        // Fallback to native geolocation (only if no position from GPSModule)
        if (!state.currentPosition && 'geolocation' in navigator) {
            navigator.geolocation.watchPosition(
                (pos) => {
                    if (!state.currentPosition || !state.currentPosition.isManual) {
                        state.currentPosition = {
                            lat: pos.coords.latitude,
                            lon: pos.coords.longitude,
                            accuracy: pos.coords.accuracy,
                            timestamp: new Date(),
                            isManual: false
                        };
                    }
                },
                () => {},
                { enableHighAccuracy: true }
            );
        }
    }

    /**
     * Setup check-in timer
     */
    function setupCheckInTimer() {
        // Check every minute
        setInterval(() => {
            if (state.nextCheckIn && new Date() > state.nextCheckIn) {
                // Overdue!
                notifyCheckInOverdue();
            }
        }, 60000);
    }

    /**
     * Notify check-in overdue
     */
    function notifyCheckInOverdue() {
        const minutesOverdue = Math.floor((new Date() - state.nextCheckIn) / 60000);
        
        if (typeof ModalsModule !== 'undefined') {
            ModalsModule.showToast(`⚠️ Check-in overdue by ${minutesOverdue} min`, 'error');
        }
        
        // Emit event
        if (typeof Events !== 'undefined') {
            Events.emit('sos:checkInOverdue', { minutesOverdue });
        }
        
        notifySubscribers({ type: 'checkInOverdue', minutesOverdue });
    }

    /**
     * Activate SOS/Emergency beacon
     */
    function activateSOS(emergencyType = 'general', details = {}) {
        const emergency = EMERGENCY_TYPES[emergencyType] || EMERGENCY_TYPES.general;
        
        state.isActive = true;
        state.activeEmergency = {
            type: emergencyType,
            ...emergency,
            details: details.description || '',
            injuries: details.injuries || 0,
            immobile: details.immobile || false,
            activatedAt: new Date()
        };
        state.activatedAt = new Date();
        state.broadcastCount = 0;
        
        // Log the activation
        addSignalLog('activated', `SOS Activated: ${emergency.name}`);
        
        // Get current position
        if (state.currentPosition) {
            state.activeEmergency.position = { ...state.currentPosition };
        } else if (typeof GPSModule !== 'undefined') {
            const pos = GPSModule.getPosition();
            if (pos) {
                state.activeEmergency.position = { lat: pos.lat, lon: pos.lon, altitude: pos.altitude };
                state.currentPosition = state.activeEmergency.position;
            }
        }
        
        saveState();
        notifySubscribers({ type: 'activated', emergency: state.activeEmergency });
        
        // Emit event for other modules
        if (typeof Events !== 'undefined') {
            Events.emit('sos:activated', state.activeEmergency);
        }
        
        // Send initial burst of emergency signals
        sendInitialBurst();
        
        // Start repeat broadcast interval
        startBroadcastInterval();
        
        if (typeof ModalsModule !== 'undefined') {
            ModalsModule.showToast(`🆘 SOS ACTIVATED - ${emergency.name}`, 'error');
        }
        
        return state.activeEmergency;
    }

    /**
     * Cancel/Deactivate SOS
     */
    function deactivateSOS(reason = 'User cancelled') {
        if (!state.isActive) return;
        
        // Stop repeat broadcasts
        stopBroadcastInterval();
        
        addSignalLog('deactivated', `SOS Cancelled: ${reason}`);
        
        const wasActive = { ...state.activeEmergency };
        
        state.isActive = false;
        state.activeEmergency = null;
        state.activatedAt = null;
        state.acknowledgedBy = [];
        state.broadcastCount = 0;
        state.lastBroadcast = null;
        
        saveState();
        notifySubscribers({ type: 'deactivated', reason, wasActive });
        
        if (typeof Events !== 'undefined') {
            Events.emit('sos:deactivated', { reason, wasActive });
        }
        
        // Send all-clear via all available methods
        sendAllClear();
        
        if (typeof ModalsModule !== 'undefined') {
            ModalsModule.showToast('✓ SOS Cancelled - All Clear sent', 'success');
        }
    }

    /**
     * Send initial burst of emergency signals (multiple times for reliability)
     */
    async function sendInitialBurst() {
        addSignalLog('burst_start', `Starting initial SOS burst (${INITIAL_BURST_COUNT} transmissions)`);
        
        for (let i = 0; i < INITIAL_BURST_COUNT; i++) {
            await sendEmergencySignal();
            if (i < INITIAL_BURST_COUNT - 1) {
                await sleep(INITIAL_BURST_DELAY);
            }
        }
        
        addSignalLog('burst_complete', `Initial SOS burst complete`);
    }
    
    /**
     * Start repeat broadcast interval
     */
    function startBroadcastInterval() {
        // Clear any existing interval
        stopBroadcastInterval();
        
        // Set up repeat broadcasts
        state.broadcastInterval = setInterval(() => {
            if (state.isActive) {
                sendEmergencySignal();
                addSignalLog('repeat_broadcast', `Repeat SOS broadcast #${state.broadcastCount}`);
            }
        }, BROADCAST_INTERVAL);
        
        addSignalLog('interval_started', `Repeat broadcasts every ${BROADCAST_INTERVAL/1000}s`);
    }
    
    /**
     * Stop repeat broadcast interval
     */
    function stopBroadcastInterval() {
        if (state.broadcastInterval) {
            clearInterval(state.broadcastInterval);
            state.broadcastInterval = null;
            addSignalLog('interval_stopped', 'Repeat broadcasts stopped');
        }
    }
    
    /**
     * Helper sleep function
     */
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Send emergency signal via all available methods
     */
    async function sendEmergencySignal() {
        const emergency = state.activeEmergency;
        if (!emergency) return;
        
        state.broadcastCount++;
        state.lastBroadcast = new Date();
        
        // Build message
        const message = buildEmergencyMessage(emergency);
        
        let sentVia = [];
        
        // Try Meshtastic if available and connected
        if (typeof MeshtasticModule !== 'undefined' && MeshtasticModule.isConnected()) {
            try {
                await sendViaMeshtastic(emergency);
                sentVia.push('Meshtastic');
            } catch (e) {
                console.error('[SOS] Meshtastic send failed:', e);
                addSignalLog('meshtastic_error', `Meshtastic failed: ${e.message}`);
            }
        }
        
        // Try APRS if available and connected
        if (typeof APRSModule !== 'undefined' && APRSModule.isConnected()) {
            try {
                await sendViaAPRS(emergency, message);
                sentVia.push('APRS');
            } catch (e) {
                console.error('[SOS] APRS send failed:', e);
                addSignalLog('aprs_error', `APRS failed: ${e.message}`);
            }
        }
        
        // Log result
        if (sentVia.length > 0) {
            addSignalLog('signal_sent', `SOS #${state.broadcastCount} sent via: ${sentVia.join(', ')}`);
            
            // Emit event
            if (typeof Events !== 'undefined') {
                Events.emit('sos:broadcast', { 
                    count: state.broadcastCount, 
                    sentVia, 
                    timestamp: state.lastBroadcast 
                });
            }
        } else {
            addSignalLog('no_connection', `SOS #${state.broadcastCount} - No active radio connections`);
            
            // Show warning on first broadcast only
            if (state.broadcastCount === 1 && typeof ModalsModule !== 'undefined') {
                ModalsModule.showToast('⚠️ No radio connected - SOS not transmitted', 'error');
            }
        }
        
        // Update subscribers
        notifySubscribers({ 
            type: 'broadcast', 
            count: state.broadcastCount, 
            sentVia,
            timestamp: state.lastBroadcast
        });
        
        return { sentVia, message };
    }

    /**
     * Build emergency message
     */
    function buildEmergencyMessage(emergency) {
        const pos = emergency.position || state.currentPosition;
        const type = EMERGENCY_TYPES[emergency.type] || EMERGENCY_TYPES.general;
        
        let message = `${type.prowords}\n`;
        message += `TYPE: ${type.name}\n`;
        
        if (pos) {
            message += `POS: ${pos.lat.toFixed(6)}, ${pos.lon.toFixed(6)}\n`;
            if (typeof Coordinates !== 'undefined') {
                try {
                    message += `MGRS: ${Coordinates.toMGRS(pos.lat, pos.lon)}\n`;
                } catch (e) {
                    // MGRS conversion failed, skip
                }
            }
        }
        
        message += `TIME: ${new Date().toISOString()}\n`;
        
        if (emergency.injuries > 0) {
            message += `INJURIES: ${emergency.injuries}\n`;
        }
        
        if (emergency.immobile) {
            message += `STATUS: IMMOBILE\n`;
        }
        
        if (emergency.details) {
            message += `DETAILS: ${emergency.details}\n`;
        }
        
        return message;
    }

    /**
     * Send SOS via Meshtastic mesh network
     */
    async function sendViaMeshtastic(emergency) {
        if (typeof MeshtasticModule === 'undefined') {
            throw new Error('MeshtasticModule not available');
        }
        
        if (!MeshtasticModule.isConnected()) {
            throw new Error('Meshtastic not connected');
        }
        
        const type = EMERGENCY_TYPES[emergency.type] || EMERGENCY_TYPES.general;
        const pos = emergency.position || state.currentPosition;
        
        // Use MeshtasticModule's built-in SOS function
        await MeshtasticModule.sendSOS({
            situation: type.name,
            injuries: emergency.injuries > 0 ? `${emergency.injuries} injured` : 'None reported',
            people: 1,
            supplies: emergency.immobile ? 'Immobile - cannot move' : 'Mobile',
            message: emergency.details || type.description
        });
        
        addSignalLog('meshtastic_sent', `Meshtastic SOS broadcast sent`);
        
        return true;
    }
    
    /**
     * Send SOS via APRS radio network
     */
    async function sendViaAPRS(emergency, message) {
        if (typeof APRSModule === 'undefined') {
            throw new Error('APRSModule not available');
        }
        
        if (!APRSModule.isConnected()) {
            throw new Error('APRS not connected');
        }
        
        const type = EMERGENCY_TYPES[emergency.type] || EMERGENCY_TYPES.general;
        const pos = emergency.position || state.currentPosition;
        
        // Build APRS emergency status text
        const emergencyStatus = `**EMERGENCY** ${type.name}${emergency.injuries > 0 ? ' - ' + emergency.injuries + ' injured' : ''}`;
        
        // Store original status and symbol
        const originalStatus = APRSModule.getStatusText ? APRSModule.getStatusText() : '';
        const originalSymbol = APRSModule.getSymbol ? APRSModule.getSymbol() : '/>';
        
        // Set emergency status and symbol (APRS emergency symbol is /!)
        if (APRSModule.setStatusText) {
            APRSModule.setStatusText(emergencyStatus);
        }
        if (APRSModule.setSymbol) {
            APRSModule.setSymbol('/!'); // APRS emergency/priority symbol
        }
        
        // Send emergency beacon
        await APRSModule.sendBeacon(true); // force immediate beacon
        
        // Also send emergency message to APRS-IS if available (repeat 3 times)
        // APRS emergency frequency monitoring stations will see this
        try {
            // Send to common emergency/distress tactical call
            await APRSModule.sendMessage('EMER', `${type.prowords} ${type.name} at ${pos ? pos.lat.toFixed(4) + ',' + pos.lon.toFixed(4) : 'unknown location'}`);
        } catch (e) {
            // Message send failed, but beacon was sent
            console.warn('[SOS] APRS message failed, beacon sent:', e);
        }
        
        addSignalLog('aprs_sent', `APRS emergency beacon transmitted`);
        
        return true;
    }

    /**
     * Send all-clear signal via all available methods
     */
    async function sendAllClear() {
        const allClearMessage = 'CANCEL CANCEL CANCEL - Previous emergency cancelled - All clear';
        
        let sentVia = [];
        
        // Send via Meshtastic
        if (typeof MeshtasticModule !== 'undefined' && MeshtasticModule.isConnected()) {
            try {
                // Send all-clear message
                if (MeshtasticModule.sendTextMessage) {
                    await MeshtasticModule.sendTextMessage(allClearMessage);
                }
                sentVia.push('Meshtastic');
                addSignalLog('meshtastic_clear', 'Meshtastic all-clear sent');
            } catch (e) {
                console.error('[SOS] Meshtastic all-clear failed:', e);
            }
        }
        
        // Send via APRS
        if (typeof APRSModule !== 'undefined' && APRSModule.isConnected()) {
            try {
                // Reset to normal status
                if (APRSModule.setStatusText) {
                    APRSModule.setStatusText('All clear - emergency cancelled');
                }
                if (APRSModule.setSymbol) {
                    APRSModule.setSymbol('/>'); // Normal vehicle symbol
                }
                
                // Send beacon with all-clear status
                await APRSModule.sendBeacon(true);
                
                // Send message
                await APRSModule.sendMessage('EMER', allClearMessage);
                
                sentVia.push('APRS');
                addSignalLog('aprs_clear', 'APRS all-clear sent');
            } catch (e) {
                console.error('[SOS] APRS all-clear failed:', e);
            }
        }
        
        if (sentVia.length > 0) {
            addSignalLog('all_clear_sent', `All-clear sent via: ${sentVia.join(', ')}`);
        } else {
            addSignalLog('all_clear_local', 'All-clear (no radio connections)');
        }
        
        // Emit event
        if (typeof Events !== 'undefined') {
            Events.emit('sos:all_clear', { sentVia, timestamp: new Date() });
        }
    }

    /**
     * Perform check-in
     */
    function checkIn(status = 'ok', notes = '') {
        state.lastCheckIn = new Date();
        state.nextCheckIn = new Date(Date.now() + state.checkInInterval * 60000);
        
        addSignalLog('checkin', `Check-in: ${status}${notes ? ' - ' + notes : ''}`);
        
        saveState();
        notifySubscribers({ type: 'checkIn', status, notes });
        
        if (typeof Events !== 'undefined') {
            Events.emit('sos:checkIn', { status, notes, time: state.lastCheckIn });
        }
        
        if (typeof ModalsModule !== 'undefined') {
            ModalsModule.showToast(`✓ Checked in - Next: ${formatTime(state.nextCheckIn)}`, 'success');
        }
    }

    /**
     * Set check-in interval
     */
    function setCheckInInterval(minutes) {
        state.checkInInterval = Math.max(15, Math.min(480, minutes));
        if (state.lastCheckIn) {
            state.nextCheckIn = new Date(state.lastCheckIn.getTime() + state.checkInInterval * 60000);
        }
        saveState();
    }

    /**
     * Add/update emergency contact
     */
    function addEmergencyContact(contact) {
        const existing = state.emergencyContacts.findIndex(c => c.id === contact.id);
        if (existing >= 0) {
            state.emergencyContacts[existing] = contact;
        } else {
            contact.id = contact.id || Helpers.generateId();
            state.emergencyContacts.push(contact);
        }
        saveState();
        return contact;
    }

    /**
     * Remove emergency contact
     */
    function removeEmergencyContact(contactId) {
        state.emergencyContacts = state.emergencyContacts.filter(c => c.id !== contactId);
        saveState();
    }

    /**
     * Add entry to signal log
     */
    function addSignalLog(type, message) {
        state.signalLog.push({
            type,
            message,
            timestamp: new Date().toISOString(),
            position: state.currentPosition ? {
                lat: state.currentPosition.lat,
                lon: state.currentPosition.lon
            } : null
        });
        
        // Keep log manageable
        if (state.signalLog.length > 100) {
            state.signalLog = state.signalLog.slice(-50);
        }
    }

    /**
     * Acknowledge SOS (from external source)
     */
    function acknowledgeFromExternal(source, callsign, eta = null) {
        state.acknowledgedBy.push({
            source,
            callsign,
            eta,
            time: new Date()
        });
        
        addSignalLog('acknowledged', `ACK from ${callsign} via ${source}`);
        saveState();
        notifySubscribers({ type: 'acknowledged', source, callsign, eta });
        
        if (typeof ModalsModule !== 'undefined') {
            ModalsModule.showToast(`✓ SOS Acknowledged by ${callsign}`, 'success');
        }
    }

    /**
     * Subscribe to state changes
     */
    function subscribe(callback) {
        subscribers.push(callback);
        return () => {
            const idx = subscribers.indexOf(callback);
            if (idx > -1) subscribers.splice(idx, 1);
        };
    }

    /**
     * Notify subscribers
     */
    function notifySubscribers(data) {
        subscribers.forEach(cb => {
            try {
                cb(data);
            } catch (e) {
                console.error('[SOS] Subscriber error:', e);
            }
        });
    }

    /**
     * Format time for display
     */
    function formatTime(date) {
        if (!date) return '--:--';
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }

    /**
     * Format duration
     */
    function formatDuration(ms) {
        const mins = Math.floor(ms / 60000);
        const hours = Math.floor(mins / 60);
        const remainMins = mins % 60;
        
        if (hours > 0) {
            return `${hours}h ${remainMins}m`;
        }
        return `${mins}m`;
    }
    
    /**
     * Format timestamp as relative time (e.g., "30s ago", "2m ago")
     */
    function formatTimeAgo(timestamp) {
        if (!timestamp) return '';
        const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
        
        if (seconds < 60) return `${seconds}s ago`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        return `${Math.floor(seconds / 3600)}h ago`;
    }

    /**
     * Get nearest bailout/help point
     */
    function getNearestHelp() {
        if (!state.currentPosition) return null;
        
        const waypoints = State.get('waypoints');
        const helpTypes = ['bailout', 'resupply', 'camp'];
        
        let nearest = null;
        let nearestDist = Infinity;
        
        waypoints.forEach(wp => {
            if (!helpTypes.includes(wp.type)) return;
            
            const wpLat = wp.lat || (37.4215 + (wp.y - 50) * 0.002);
            const wpLon = wp.lon || (-119.1892 + (wp.x - 50) * 0.004);
            
            const dist = Helpers.calcDistance(
                state.currentPosition.lat,
                state.currentPosition.lon,
                wpLat,
                wpLon
            );
            
            if (dist < nearestDist) {
                nearestDist = dist;
                nearest = {
                    waypoint: wp,
                    distance: dist,
                    bearing: calcBearing(
                        state.currentPosition.lat,
                        state.currentPosition.lon,
                        wpLat,
                        wpLon
                    )
                };
            }
        });
        
        return nearest;
    }

    /**
     * Calculate bearing between two points
     */
    function calcBearing(lat1, lon1, lat2, lon2) {
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
     * Get compass direction from bearing
     */
    function bearingToCompass(bearing) {
        const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                      'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
        const idx = Math.round(bearing / 22.5) % 16;
        return dirs[idx];
    }

    /**
     * Generate position report for radio transmission
     */
    function generatePositionReport() {
        const pos = state.currentPosition;
        if (!pos) return null;
        
        const report = {
            timestamp: new Date().toISOString(),
            formats: {}
        };
        
        // Decimal degrees
        report.formats.dd = `${pos.lat.toFixed(6)}, ${pos.lon.toFixed(6)}`;
        
        // DMS
        if (typeof Coordinates !== 'undefined') {
            report.formats.dms = Coordinates.format(pos.lat, pos.lon, { format: 'dms' });
            report.formats.mgrs = Coordinates.format(pos.lat, pos.lon, { format: 'mgrs' });
            report.formats.utm = Coordinates.format(pos.lat, pos.lon, { format: 'utm' });
        }
        
        // Phonetic for radio
        report.phonetic = generatePhoneticCoords(pos.lat, pos.lon);
        
        return report;
    }

    /**
     * Generate phonetic coordinates for radio transmission
     */
    function generatePhoneticCoords(lat, lon) {
        const phonetic = {
            '0': 'ZERO', '1': 'ONE', '2': 'TWO', '3': 'THREE', '4': 'FOUR',
            '5': 'FIVE', '6': 'SIX', '7': 'SEVEN', '8': 'EIGHT', '9': 'NINER',
            '.': 'DECIMAL', '-': 'MINUS'
        };
        
        const latStr = lat.toFixed(4);
        const lonStr = lon.toFixed(4);
        
        const toPhonetic = (str) => {
            return str.split('').map(c => phonetic[c] || c).join(' ');
        };
        
        return {
            lat: `LATITUDE ${toPhonetic(latStr)} ${lat >= 0 ? 'NORTH' : 'SOUTH'}`,
            lon: `LONGITUDE ${toPhonetic(lonStr.replace('-', ''))} ${lon >= 0 ? 'EAST' : 'WEST'}`
        };
    }

    /**
     * Render SOS panel content
     */
    function renderPanel() {
        const pos = state.currentPosition;
        const nearestHelp = getNearestHelp();
        const isOverdue = state.nextCheckIn && new Date() > state.nextCheckIn;
        const posReport = generatePositionReport();
        
        let html = `
            <div class="panel__header">
                <h2 class="panel__title">🆘 Emergency</h2>
                ${state.isActive ? `
                    <span style="padding:6px 12px;background:rgba(239,68,68,0.2);border-radius:20px;font-size:11px;color:#ef4444;font-weight:600;animation:pulse 1s infinite">
                        SOS ACTIVE
                    </span>
                ` : ''}
            </div>
        `;
        
        // Active SOS Display
        if (state.isActive && state.activeEmergency) {
            const emergency = state.activeEmergency;
            const elapsed = formatDuration(Date.now() - new Date(emergency.activatedAt).getTime());
            
            // Check radio connections
            const meshtasticConnected = typeof MeshtasticModule !== 'undefined' && MeshtasticModule.isConnected();
            const aprsConnected = typeof APRSModule !== 'undefined' && APRSModule.isConnected();
            const hasRadio = meshtasticConnected || aprsConnected;
            
            html += `
                <div style="padding:16px;background:rgba(239,68,68,0.15);border:2px solid rgba(239,68,68,0.4);border-radius:12px;margin-bottom:16px;animation:pulse 2s infinite">
                    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
                        <span style="font-size:32px">${emergency.icon}</span>
                        <div>
                            <div style="font-size:16px;font-weight:600;color:#ef4444">${emergency.name}</div>
                            <div style="font-size:12px;color:rgba(255,255,255,0.6)">Active for ${elapsed}</div>
                        </div>
                    </div>
                    
                    <!-- Broadcast Status -->
                    <div style="padding:10px;background:rgba(0,0,0,0.2);border-radius:8px;margin-bottom:12px">
                        <div style="font-size:11px;font-weight:500;color:rgba(255,255,255,0.5);margin-bottom:8px">📡 BROADCAST STATUS</div>
                        
                        <!-- Radio Connections -->
                        <div style="display:flex;gap:8px;margin-bottom:8px">
                            <div style="flex:1;padding:6px 8px;background:${meshtasticConnected ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)'};border-radius:6px;font-size:11px;display:flex;align-items:center;gap:6px">
                                <span style="color:${meshtasticConnected ? '#22c55e' : '#6b7280'}">●</span>
                                <span style="color:${meshtasticConnected ? '#22c55e' : 'rgba(255,255,255,0.4)'}">Meshtastic</span>
                            </div>
                            <div style="flex:1;padding:6px 8px;background:${aprsConnected ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)'};border-radius:6px;font-size:11px;display:flex;align-items:center;gap:6px">
                                <span style="color:${aprsConnected ? '#22c55e' : '#6b7280'}">●</span>
                                <span style="color:${aprsConnected ? '#22c55e' : 'rgba(255,255,255,0.4)'}">APRS</span>
                            </div>
                        </div>
                        
                        <!-- Broadcast Count -->
                        <div style="display:flex;justify-content:space-between;font-size:11px;color:rgba(255,255,255,0.6)">
                            <span>Broadcasts sent: <span style="color:#f97316;font-weight:600">${state.broadcastCount}</span></span>
                            ${state.lastBroadcast ? `
                                <span>Last: ${formatTimeAgo(state.lastBroadcast)}</span>
                            ` : ''}
                        </div>
                        
                        ${!hasRadio ? `
                            <div style="margin-top:8px;padding:8px;background:rgba(239,68,68,0.1);border-radius:6px;font-size:10px;color:#f97316">
                                ⚠️ No radio connected - SOS not being transmitted. Connect Meshtastic or APRS to broadcast.
                            </div>
                        ` : `
                            <div style="margin-top:8px;font-size:10px;color:rgba(255,255,255,0.4)">
                                Repeating every 60 seconds until cancelled
                            </div>
                        `}
                    </div>
                    
                    ${state.acknowledgedBy.length > 0 ? `
                        <div style="padding:10px;background:rgba(34,197,94,0.15);border-radius:8px;margin-bottom:12px">
                            <div style="font-size:12px;font-weight:500;color:#22c55e">✓ Acknowledged by:</div>
                            ${state.acknowledgedBy.map(a => `
                                <div style="font-size:11px;color:rgba(255,255,255,0.7)">${a.callsign} via ${a.source}${a.eta ? ` - ETA: ${a.eta}` : ''}</div>
                            `).join('')}
                        </div>
                    ` : ''}
                    
                    <button class="btn btn--full" id="cancel-sos-btn" style="background:rgba(34,197,94,0.2);color:#22c55e;border:1px solid rgba(34,197,94,0.3)">
                        ✓ Cancel SOS - I'm OK
                    </button>
                </div>
            `;
        } else {
            // Check radio connections for status display
            const meshtasticConnected = typeof MeshtasticModule !== 'undefined' && MeshtasticModule.isConnected();
            const aprsConnected = typeof APRSModule !== 'undefined' && APRSModule.isConnected();
            const hasRadio = meshtasticConnected || aprsConnected;
            
            // SOS Activation Buttons
            html += `
                <div style="margin-bottom:16px">
                    <button class="btn btn--full" id="quick-sos-btn" style="padding:20px;font-size:18px;background:linear-gradient(135deg,#ef4444,#dc2626);margin-bottom:12px">
                        🆘 ACTIVATE SOS
                    </button>
                    
                    <!-- Radio Status -->
                    <div style="padding:10px;background:var(--color-bg-elevated);border-radius:8px;margin-bottom:12px">
                        <div style="font-size:11px;font-weight:500;color:rgba(255,255,255,0.5);margin-bottom:6px">📡 Radio Status</div>
                        <div style="display:flex;gap:8px">
                            <div style="flex:1;padding:6px 8px;background:${meshtasticConnected ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)'};border-radius:6px;font-size:11px;display:flex;align-items:center;gap:6px">
                                <span style="color:${meshtasticConnected ? '#22c55e' : '#6b7280'}">●</span>
                                <span style="color:${meshtasticConnected ? '#22c55e' : 'rgba(255,255,255,0.4)'}">Meshtastic</span>
                            </div>
                            <div style="flex:1;padding:6px 8px;background:${aprsConnected ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)'};border-radius:6px;font-size:11px;display:flex;align-items:center;gap:6px">
                                <span style="color:${aprsConnected ? '#22c55e' : '#6b7280'}">●</span>
                                <span style="color:${aprsConnected ? '#22c55e' : 'rgba(255,255,255,0.4)'}">APRS</span>
                            </div>
                        </div>
                        ${!hasRadio ? `
                            <div style="margin-top:6px;font-size:10px;color:#f97316">
                                ⚠️ No radio connected - SOS will not be transmitted
                            </div>
                        ` : `
                            <div style="margin-top:6px;font-size:10px;color:#22c55e">
                                ✓ SOS will broadcast via ${[meshtasticConnected ? 'Meshtastic' : '', aprsConnected ? 'APRS' : ''].filter(Boolean).join(' & ')}
                            </div>
                        `}
                    </div>
                    
                    <div class="section-label">Emergency Type</div>
                    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">
                        ${Object.entries(EMERGENCY_TYPES).slice(0, 6).map(([key, type]) => `
                            <button class="btn btn--secondary sos-type-btn" data-sos-type="${key}" 
                                style="flex-direction:column;padding:12px;gap:4px;border-color:${type.color}30">
                                <span style="font-size:20px">${type.icon}</span>
                                <span style="font-size:11px;color:${type.color}">${type.name.split(' ')[0]}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        html += `<div class="divider"></div>`;
        
        // Current Position (for radio transmission)
        html += `
            <div class="section-label">📍 Current Position</div>
            <div style="padding:14px;background:var(--color-bg-elevated);border-radius:12px;margin-bottom:16px">
                ${pos ? `
                    <div style="font-family:'IBM Plex Mono',monospace;font-size:13px;color:#f97316;margin-bottom:8px;word-break:break-all">
                        ${posReport?.formats.dd || `${pos.lat.toFixed(6)}, ${pos.lon.toFixed(6)}`}
                    </div>
                    ${posReport?.formats.mgrs ? `
                        <div style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:rgba(255,255,255,0.6);margin-bottom:8px">
                            MGRS: ${posReport.formats.mgrs}
                        </div>
                    ` : ''}
                    <div style="display:flex;gap:8px">
                        <button class="btn btn--secondary" id="copy-coords-btn" style="flex:1;font-size:11px;padding:8px">
                            📋 Copy
                        </button>
                        <button class="btn btn--secondary" id="speak-coords-btn" style="flex:1;font-size:11px;padding:8px">
                            🔊 Speak
                        </button>
                    </div>
                ` : `
                    <div style="text-align:center;color:rgba(255,255,255,0.4);padding:12px">
                        <div style="font-size:24px;margin-bottom:8px">📍</div>
                        <div style="font-size:12px">Position not available</div>
                        <button class="btn btn--secondary" id="get-position-btn" style="margin-top:8px;font-size:11px">
                            Get Current Position
                        </button>
                    </div>
                `}
            </div>
        `;
        
        // Nearest Help
        if (nearestHelp) {
            const wp = nearestHelp.waypoint;
            const wpType = Constants.WAYPOINT_TYPES[wp.type];
            html += `
                <div class="section-label">🚁 Nearest Help</div>
                <div style="padding:14px;background:var(--color-bg-elevated);border-radius:12px;margin-bottom:16px;display:flex;align-items:center;gap:12px">
                    <div style="width:44px;height:44px;background:${wpType.color}22;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px">
                        ${wpType.icon}
                    </div>
                    <div style="flex:1">
                        <div style="font-size:14px;font-weight:500">${wp.name}</div>
                        <div style="font-size:12px;color:rgba(255,255,255,0.6)">
                            ${nearestHelp.distance.toFixed(1)} mi • ${bearingToCompass(nearestHelp.bearing)} (${Math.round(nearestHelp.bearing)}°)
                        </div>
                    </div>
                    <button class="btn btn--secondary" data-navigate-to="${wp.id}" style="padding:8px">
                        🧭
                    </button>
                </div>
            `;
        }
        
        html += `<div class="divider"></div>`;
        
        // Check-In System
        html += `
            <div class="section-label">⏰ Check-In System</div>
            <div style="padding:14px;background:${isOverdue ? 'rgba(239,68,68,0.15)' : 'var(--color-bg-elevated)'};border:1px solid ${isOverdue ? 'rgba(239,68,68,0.3)' : 'transparent'};border-radius:12px;margin-bottom:16px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                    <div>
                        <div style="font-size:12px;color:rgba(255,255,255,0.5)">Last Check-In</div>
                        <div style="font-size:14px;font-weight:500">${state.lastCheckIn ? formatTime(state.lastCheckIn) : 'Never'}</div>
                    </div>
                    <div style="text-align:right">
                        <div style="font-size:12px;color:${isOverdue ? '#ef4444' : 'rgba(255,255,255,0.5)'}">
                            ${isOverdue ? '⚠️ OVERDUE' : 'Next Due'}
                        </div>
                        <div style="font-size:14px;font-weight:500;color:${isOverdue ? '#ef4444' : 'inherit'}">
                            ${state.nextCheckIn ? formatTime(state.nextCheckIn) : '--:--'}
                        </div>
                    </div>
                </div>
                
                <div style="display:flex;gap:8px">
                    <button class="btn btn--primary" id="checkin-ok-btn" style="flex:1">
                        ✓ Check In OK
                    </button>
                    <button class="btn btn--secondary" id="checkin-issue-btn" style="flex:1">
                        ⚠️ Issue
                    </button>
                </div>
                
                <div style="margin-top:12px;display:flex;align-items:center;gap:8px">
                    <span style="font-size:11px;color:rgba(255,255,255,0.5)">Interval:</span>
                    <select id="checkin-interval" style="flex:1;padding:6px;font-size:12px">
                        ${[15, 30, 60, 120, 240, 480].map(m => `
                            <option value="${m}" ${state.checkInInterval === m ? 'selected' : ''}>
                                ${m < 60 ? `${m} min` : `${m/60} hour${m > 60 ? 's' : ''}`}
                            </option>
                        `).join('')}
                    </select>
                </div>
            </div>
        `;
        
        html += `<div class="divider"></div>`;
        
        // Emergency Contacts
        html += `
            <div class="section-label">📞 Emergency Contacts</div>
            <div style="margin-bottom:16px">
                ${state.emergencyContacts.length > 0 ? `
                    ${state.emergencyContacts.map(contact => `
                        <div style="padding:12px;background:var(--color-bg-elevated);border-radius:8px;margin-bottom:8px;display:flex;align-items:center;gap:12px">
                            <div style="flex:1">
                                <div style="font-size:13px;font-weight:500">${contact.name}</div>
                                <div style="font-size:11px;color:rgba(255,255,255,0.5)">
                                    ${contact.callsign ? `📻 ${contact.callsign}` : ''}
                                    ${contact.phone ? `📱 ${contact.phone}` : ''}
                                </div>
                            </div>
                            <button class="btn btn--secondary" data-remove-contact="${contact.id}" style="padding:6px;font-size:11px">✕</button>
                        </div>
                    `).join('')}
                ` : `
                    <div style="padding:20px;text-align:center;color:rgba(255,255,255,0.4);font-size:12px">
                        No emergency contacts configured
                    </div>
                `}
                <button class="btn btn--secondary btn--full" id="add-contact-btn">
                    + Add Emergency Contact
                </button>
            </div>
        `;
        
        html += `<div class="divider"></div>`;
        
        // Signal Reference (collapsible)
        html += `
            <details style="margin-bottom:16px">
                <summary style="cursor:pointer;font-size:13px;font-weight:500;color:var(--color-text-muted);padding:8px 0">
                    📖 Signal Reference
                </summary>
                
                <div style="padding-top:12px">
                    <!-- Ground-to-Air Signals -->
                    <div class="section-label" style="margin-top:0">Ground-to-Air Signals</div>
                    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-bottom:16px">
                        ${GROUND_AIR_SIGNALS.slice(0, 5).map(sig => `
                            <div style="padding:8px;background:var(--color-bg-elevated);border-radius:6px;text-align:center" title="${sig.description}">
                                <div style="font-size:18px;font-weight:700;font-family:monospace">${sig.symbol}</div>
                                <div style="font-size:8px;color:rgba(255,255,255,0.5);margin-top:2px">${sig.meaning.split(' ')[0]}</div>
                            </div>
                        `).join('')}
                    </div>
                    
                    <!-- Whistle Signals -->
                    <div class="section-label">Whistle Signals</div>
                    <div style="font-size:11px">
                        ${WHISTLE_SIGNALS.map(sig => `
                            <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
                                <span style="font-family:monospace;color:#f97316">${sig.pattern}</span>
                                <span style="color:rgba(255,255,255,0.6)">${sig.meaning}</span>
                            </div>
                        `).join('')}
                    </div>
                    
                    <!-- Pro Words -->
                    <div class="section-label" style="margin-top:12px">Radio Pro-Words</div>
                    <div style="font-size:11px;color:rgba(255,255,255,0.6);line-height:1.6">
                        <strong style="color:#ef4444">MAYDAY</strong> - Life-threatening emergency<br>
                        <strong style="color:#f59e0b">PAN PAN</strong> - Urgent, not life-threatening<br>
                        <strong style="color:#3b82f6">SECURITE</strong> - Safety information
                    </div>
                </div>
            </details>
        `;
        
        // Signal Log (collapsible)
        if (state.signalLog.length > 0) {
            html += `
                <details>
                    <summary style="cursor:pointer;font-size:13px;font-weight:500;color:var(--color-text-muted);padding:8px 0">
                        📋 Signal Log (${state.signalLog.length})
                    </summary>
                    <div style="max-height:200px;overflow-y:auto;padding-top:8px">
                        ${state.signalLog.slice().reverse().map(entry => `
                            <div style="padding:8px;background:var(--color-bg-elevated);border-radius:6px;margin-bottom:4px;font-size:11px">
                                <div style="color:rgba(255,255,255,0.4)">${new Date(entry.timestamp).toLocaleString()}</div>
                                <div style="color:rgba(255,255,255,0.8)">${entry.message}</div>
                            </div>
                        `).join('')}
                    </div>
                </details>
            `;
        }
        
        return html;
    }

    /**
     * Attach panel event listeners
     */
    function attachPanelListeners(container) {
        // Quick SOS button
        const quickSOS = container.querySelector('#quick-sos-btn');
        if (quickSOS) {
            quickSOS.onclick = () => showSOSModal();
        }
        
        // SOS type buttons
        container.querySelectorAll('.sos-type-btn').forEach(btn => {
            btn.onclick = () => {
                const type = btn.dataset.sosType;
                showSOSModal(type);
            };
        });
        
        // Cancel SOS
        const cancelSOS = container.querySelector('#cancel-sos-btn');
        if (cancelSOS) {
            cancelSOS.onclick = () => {
                if (confirm('Are you sure you want to cancel the SOS? Only do this if you are safe.')) {
                    deactivateSOS('User confirmed safe');
                    // Re-render panel
                    if (typeof PanelsModule !== 'undefined') {
                        PanelsModule.render();
                    }
                }
            };
        }
        
        // Copy coordinates
        const copyCoords = container.querySelector('#copy-coords-btn');
        if (copyCoords) {
            copyCoords.onclick = () => {
                const report = generatePositionReport();
                if (report) {
                    const text = `Position: ${report.formats.dd}\nMGRS: ${report.formats.mgrs || 'N/A'}`;
                    navigator.clipboard.writeText(text).then(() => {
                        ModalsModule.showToast('Coordinates copied', 'success');
                    });
                }
            };
        }
        
        // Speak coordinates
        const speakCoords = container.querySelector('#speak-coords-btn');
        if (speakCoords) {
            speakCoords.onclick = () => {
                const report = generatePositionReport();
                if (report && 'speechSynthesis' in window) {
                    const text = `${report.phonetic.lat}. ${report.phonetic.lon}`;
                    const utterance = new SpeechSynthesisUtterance(text);
                    utterance.rate = 0.8;
                    speechSynthesis.speak(utterance);
                } else {
                    ModalsModule.showToast('Speech not available', 'error');
                }
            };
        }
        
        // Get position
        const getPos = container.querySelector('#get-position-btn');
        if (getPos) {
            getPos.onclick = () => {
                // First check GPSModule for existing position (including manual)
                if (typeof GPSModule !== 'undefined') {
                    const gpsPos = GPSModule.getPosition();
                    if (gpsPos && gpsPos.lat && gpsPos.lon) {
                        state.currentPosition = {
                            lat: gpsPos.lat,
                            lon: gpsPos.lon,
                            accuracy: gpsPos.accuracy || null,
                            timestamp: new Date(),
                            isManual: gpsPos.isManual || false
                        };
                        PanelsModule.render();
                        ModalsModule.showToast(gpsPos.isManual ? 'Using manual position' : 'Position acquired', 'success');
                        return;
                    }
                }
                
                // Fallback to browser geolocation
                if ('geolocation' in navigator) {
                    navigator.geolocation.getCurrentPosition(
                        (pos) => {
                            state.currentPosition = {
                                lat: pos.coords.latitude,
                                lon: pos.coords.longitude,
                                accuracy: pos.coords.accuracy,
                                timestamp: new Date(),
                                isManual: false
                            };
                            PanelsModule.render();
                            ModalsModule.showToast('Position acquired', 'success');
                        },
                        (err) => {
                            ModalsModule.showToast('Could not get position. Try setting manual position in Team panel.', 'error');
                        }
                    );
                } else {
                    ModalsModule.showToast('Geolocation not supported. Set manual position in Team panel.', 'error');
                }
            };
        }
        
        // Check-in buttons
        const checkinOK = container.querySelector('#checkin-ok-btn');
        if (checkinOK) {
            checkinOK.onclick = () => {
                checkIn('ok');
                PanelsModule.render();
            };
        }
        
        const checkinIssue = container.querySelector('#checkin-issue-btn');
        if (checkinIssue) {
            checkinIssue.onclick = () => {
                const notes = prompt('Describe the issue:');
                if (notes !== null) {
                    checkIn('issue', notes);
                    PanelsModule.render();
                }
            };
        }
        
        // Check-in interval
        const intervalSelect = container.querySelector('#checkin-interval');
        if (intervalSelect) {
            intervalSelect.onchange = (e) => {
                setCheckInInterval(parseInt(e.target.value));
                PanelsModule.render();
            };
        }
        
        // Navigate to waypoint
        container.querySelectorAll('[data-navigate-to]').forEach(btn => {
            btn.onclick = () => {
                const wpId = btn.dataset.navigateTo;
                const waypoints = State.get('waypoints');
                const wp = waypoints.find(w => w.id === wpId);
                if (wp && typeof NavigationModule !== 'undefined') {
                    NavigationModule.startNavigation(wp);
                    State.UI.setActivePanel('navigation');
                }
            };
        });
        
        // Add contact button
        const addContact = container.querySelector('#add-contact-btn');
        if (addContact) {
            addContact.onclick = () => showContactModal();
        }
        
        // Remove contact buttons
        container.querySelectorAll('[data-remove-contact]').forEach(btn => {
            btn.onclick = () => {
                if (confirm('Remove this contact?')) {
                    removeEmergencyContact(btn.dataset.removeContact);
                    PanelsModule.render();
                }
            };
        });
    }

    /**
     * Show SOS activation modal
     */
    function showSOSModal(preselectedType = null) {
        const modalContainer = document.getElementById('modal-container');
        if (!modalContainer) return;
        
        const type = preselectedType ? EMERGENCY_TYPES[preselectedType] : EMERGENCY_TYPES.general;
        
        modalContainer.innerHTML = `
            <div class="modal-backdrop" id="modal-backdrop">
                <div class="modal" style="border-color:rgba(239,68,68,0.3)">
                    <div class="modal__header" style="background:rgba(239,68,68,0.1)">
                        <h3 class="modal__title" style="color:#ef4444">🆘 Activate SOS</h3>
                        <button class="modal__close" id="modal-close">${typeof Icons !== 'undefined' ? Icons.get('close') : '✕'}</button>
                    </div>
                    <div class="modal__body">
                        <div style="text-align:center;margin-bottom:20px">
                            <span style="font-size:48px">${type.icon}</span>
                            <div style="font-size:18px;font-weight:600;margin-top:8px">${type.name}</div>
                            <div style="font-size:12px;color:rgba(255,255,255,0.5)">${type.description}</div>
                        </div>
                        
                        <div class="form-group">
                            <label>Emergency Type</label>
                            <select id="sos-type" style="font-size:14px">
                                ${Object.entries(EMERGENCY_TYPES).map(([key, t]) => `
                                    <option value="${key}" ${key === (preselectedType || 'general') ? 'selected' : ''}>
                                        ${t.icon} ${t.name}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label>Additional Details</label>
                            <textarea id="sos-details" rows="2" placeholder="Describe the situation..."></textarea>
                        </div>
                        
                        <div style="display:flex;gap:12px">
                            <div class="form-group" style="flex:1">
                                <label>Injuries</label>
                                <input type="number" id="sos-injuries" min="0" max="99" value="0" style="text-align:center">
                            </div>
                            <div class="form-group" style="flex:1">
                                <label class="checkbox-field" style="height:100%;margin:0">
                                    <input type="checkbox" id="sos-immobile" style="width:auto">
                                    <span>Unable to move</span>
                                </label>
                            </div>
                        </div>
                        
                        <div style="padding:12px;background:rgba(239,68,68,0.1);border-radius:8px;margin-top:16px">
                            <div style="font-size:11px;color:#ef4444;font-weight:500;margin-bottom:4px">⚠️ IMPORTANT</div>
                            <div style="font-size:11px;color:rgba(255,255,255,0.6)">
                                Only activate SOS in genuine emergencies. False alarms waste resources and may delay help for others.
                            </div>
                        </div>
                    </div>
                    <div class="modal__footer">
                        <button class="btn btn--secondary" id="modal-cancel">Cancel</button>
                        <button class="btn" id="modal-activate" style="background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;flex:2">
                            🆘 ACTIVATE SOS
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Event listeners
        modalContainer.querySelector('#modal-close').onclick = () => modalContainer.innerHTML = '';
        modalContainer.querySelector('#modal-cancel').onclick = () => modalContainer.innerHTML = '';
        modalContainer.querySelector('#modal-backdrop').onclick = (e) => {
            if (e.target.id === 'modal-backdrop') modalContainer.innerHTML = '';
        };
        
        modalContainer.querySelector('#modal-activate').onclick = () => {
            const sosType = modalContainer.querySelector('#sos-type').value;
            const details = modalContainer.querySelector('#sos-details').value;
            const injuries = parseInt(modalContainer.querySelector('#sos-injuries').value) || 0;
            const immobile = modalContainer.querySelector('#sos-immobile').checked;
            
            activateSOS(sosType, { description: details, injuries, immobile });
            modalContainer.innerHTML = '';
            
            // Re-render panel
            if (typeof PanelsModule !== 'undefined') {
                PanelsModule.render();
            }
        };
    }

    /**
     * Show add contact modal
     */
    function showContactModal() {
        const modalContainer = document.getElementById('modal-container');
        if (!modalContainer) return;
        
        modalContainer.innerHTML = `
            <div class="modal-backdrop" id="modal-backdrop">
                <div class="modal">
                    <div class="modal__header">
                        <h3 class="modal__title">Add Emergency Contact</h3>
                        <button class="modal__close" id="modal-close">${typeof Icons !== 'undefined' ? Icons.get('close') : '✕'}</button>
                    </div>
                    <div class="modal__body">
                        <div class="form-group">
                            <label>Name</label>
                            <input type="text" id="contact-name" placeholder="Contact name">
                        </div>
                        <div class="form-group">
                            <label>Phone Number</label>
                            <input type="tel" id="contact-phone" placeholder="+1 555-123-4567">
                        </div>
                        <div class="form-group">
                            <label>Radio Callsign (optional)</label>
                            <input type="text" id="contact-callsign" placeholder="e.g., KD6ABC">
                        </div>
                        <div class="form-group">
                            <label>Frequency (optional)</label>
                            <input type="text" id="contact-frequency" placeholder="e.g., 146.520 MHz">
                        </div>
                        <div class="form-group">
                            <label>Notes</label>
                            <textarea id="contact-notes" rows="2" placeholder="Relationship, availability, etc."></textarea>
                        </div>
                    </div>
                    <div class="modal__footer">
                        <button class="btn btn--secondary" id="modal-cancel">Cancel</button>
                        <button class="btn btn--primary" id="modal-save">Add Contact</button>
                    </div>
                </div>
            </div>
        `;
        
        modalContainer.querySelector('#modal-close').onclick = () => modalContainer.innerHTML = '';
        modalContainer.querySelector('#modal-cancel').onclick = () => modalContainer.innerHTML = '';
        modalContainer.querySelector('#modal-backdrop').onclick = (e) => {
            if (e.target.id === 'modal-backdrop') modalContainer.innerHTML = '';
        };
        
        modalContainer.querySelector('#modal-save').onclick = () => {
            const name = modalContainer.querySelector('#contact-name').value.trim();
            if (!name) {
                ModalsModule.showToast('Name is required', 'error');
                return;
            }
            
            addEmergencyContact({
                name,
                phone: modalContainer.querySelector('#contact-phone').value.trim(),
                callsign: modalContainer.querySelector('#contact-callsign').value.trim(),
                frequency: modalContainer.querySelector('#contact-frequency').value.trim(),
                notes: modalContainer.querySelector('#contact-notes').value.trim()
            });
            
            modalContainer.innerHTML = '';
            ModalsModule.showToast('Contact added', 'success');
            PanelsModule.render();
        };
    }

    /**
     * Get current state
     */
    function getState() {
        return { ...state };
    }

    // Public API
    return {
        init,
        activateSOS,
        deactivateSOS,
        checkIn,
        setCheckInInterval,
        addEmergencyContact,
        removeEmergencyContact,
        acknowledgeFromExternal,
        generatePositionReport,
        getNearestHelp,
        subscribe,
        getState,
        renderPanel,
        attachPanelListeners,
        
        // Broadcast control
        sendEmergencySignal,    // Manually trigger a broadcast
        getBroadcastCount: () => state.broadcastCount,
        getLastBroadcast: () => state.lastBroadcast,
        isBroadcasting: () => state.broadcastInterval !== null,
        
        // Constants
        EMERGENCY_TYPES,
        SIGNAL_METHODS,
        GROUND_AIR_SIGNALS,
        WHISTLE_SIGNALS
    };
})();

window.SOSModule = SOSModule;
