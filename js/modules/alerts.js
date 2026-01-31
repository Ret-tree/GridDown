/**
 * GridDown Alert Module - Centralized Alert Management System
 * Handles persistent banners, push notifications, sound alerts, and alert history
 */
const AlertModule = (function() {
    'use strict';
    
    // Alert severity levels
    const SEVERITY = {
        INFO: 'info',
        CAUTION: 'caution',
        WARNING: 'warning',
        CRITICAL: 'critical',
        EMERGENCY: 'emergency'
    };
    
    // Alert sources
    const SOURCES = {
        AQI: 'aqi',
        RADIATION: 'radiation',
        WEATHER: 'weather',
        SYSTEM: 'system',
        BEACON: 'beacon'
    };
    
    // Severity colors
    const SEVERITY_COLORS = {
        info: { bg: '#3b82f6', text: '#ffffff', border: '#2563eb' },
        caution: { bg: '#f59e0b', text: '#000000', border: '#d97706' },
        warning: { bg: '#f97316', text: '#ffffff', border: '#ea580c' },
        critical: { bg: '#ef4444', text: '#ffffff', border: '#dc2626' },
        emergency: { bg: '#7f1d1d', text: '#ffffff', border: '#991b1b' }
    };
    
    // State
    let initialized = false;
    let alertHistory = [];
    let activeAlerts = new Map();  // Map of alertId -> alert
    let soundEnabled = true;
    let notificationsEnabled = false;
    let notificationPermission = 'default';
    let bannerContainer = null;
    
    // Settings
    const MAX_HISTORY = 100;
    const ALERT_DEBOUNCE_MS = 60000;  // Don't repeat same alert within 1 minute
    let lastAlertTimes = new Map();  // Map of alertKey -> timestamp
    
    /**
     * Initialize the alert module
     */
    function init() {
        if (initialized) return;
        
        // Create banner container
        bannerContainer = document.createElement('div');
        bannerContainer.id = 'alert-banners';
        bannerContainer.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            z-index: 9998;
            display: flex;
            flex-direction: column;
            pointer-events: none;
        `;
        document.body.appendChild(bannerContainer);
        
        // Check notification permission
        if ('Notification' in window) {
            notificationPermission = Notification.permission;
            notificationsEnabled = notificationPermission === 'granted';
        }
        
        // Load settings from storage
        loadSettings();
        
        // Load alert history
        loadHistory();
        
        initialized = true;
        console.log('AlertModule initialized');
    }
    
    /**
     * Load settings from storage
     */
    async function loadSettings() {
        try {
            if (typeof Storage !== 'undefined' && Storage.Settings) {
                soundEnabled = await Storage.Settings.get('alertSoundEnabled', true);
                notificationsEnabled = await Storage.Settings.get('alertNotificationsEnabled', false);
            }
        } catch (e) {
            console.warn('Could not load alert settings:', e);
        }
    }
    
    /**
     * Load alert history from storage
     */
    async function loadHistory() {
        try {
            if (typeof Storage !== 'undefined' && Storage.Settings) {
                const saved = await Storage.Settings.get('alertHistory', []);
                if (Array.isArray(saved)) {
                    alertHistory = saved.slice(-MAX_HISTORY);
                }
            }
        } catch (e) {
            console.warn('Could not load alert history:', e);
        }
    }
    
    /**
     * Save alert history to storage
     */
    async function saveHistory() {
        try {
            if (typeof Storage !== 'undefined' && Storage.Settings) {
                await Storage.Settings.set('alertHistory', alertHistory.slice(-MAX_HISTORY));
            }
        } catch (e) {
            console.warn('Could not save alert history:', e);
        }
    }
    
    /**
     * Request notification permission
     */
    async function requestNotificationPermission() {
        if (!('Notification' in window)) {
            return false;
        }
        
        try {
            const permission = await Notification.requestPermission();
            notificationPermission = permission;
            notificationsEnabled = permission === 'granted';
            
            if (typeof Storage !== 'undefined' && Storage.Settings) {
                await Storage.Settings.set('alertNotificationsEnabled', notificationsEnabled);
            }
            
            return notificationsEnabled;
        } catch (e) {
            console.error('Failed to request notification permission:', e);
            return false;
        }
    }
    
    /**
     * Trigger an alert
     * @param {Object} options - Alert configuration
     * @param {string} options.source - Alert source (aqi, radiation, weather, etc.)
     * @param {string} options.severity - Alert severity level
     * @param {string} options.title - Alert title
     * @param {string} options.message - Alert message
     * @param {Object} options.data - Additional data (location, readings, etc.)
     * @param {boolean} options.persistent - Show persistent banner
     * @param {boolean} options.sound - Play alert sound
     * @param {boolean} options.notification - Show push notification
     */
    function trigger(options) {
        const {
            source = SOURCES.SYSTEM,
            severity = SEVERITY.INFO,
            title = 'Alert',
            message = '',
            data = {},
            persistent = false,
            sound = true,
            notification = true
        } = options;
        
        // Create alert key for deduplication
        const alertKey = `${source}:${severity}:${title}`;
        
        // Check debounce
        const lastTime = lastAlertTimes.get(alertKey) || 0;
        if (Date.now() - lastTime < ALERT_DEBOUNCE_MS) {
            console.debug('Alert debounced:', alertKey);
            return null;
        }
        lastAlertTimes.set(alertKey, Date.now());
        
        // Create alert object
        const alert = {
            id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            source,
            severity,
            title,
            message,
            data,
            timestamp: Date.now(),
            acknowledged: false
        };
        
        // Add to history
        alertHistory.push(alert);
        if (alertHistory.length > MAX_HISTORY) {
            alertHistory.shift();
        }
        saveHistory();
        
        // Show toast notification
        if (typeof ModalsModule !== 'undefined') {
            const toastType = severity === SEVERITY.INFO ? 'info' : 
                             severity === SEVERITY.CAUTION ? 'info' :
                             severity === SEVERITY.WARNING ? 'warning' : 'error';
            const duration = persistent ? 8000 : 4000;
            ModalsModule.showToast(`${getIcon(severity)} ${title}: ${message}`, toastType, duration);
        }
        
        // Show persistent banner for critical/emergency
        if (persistent || severity === SEVERITY.CRITICAL || severity === SEVERITY.EMERGENCY) {
            showBanner(alert);
        }
        
        // Play sound
        if (sound && soundEnabled && severity !== SEVERITY.INFO) {
            playAlertSound(severity);
        }
        
        // Push notification
        if (notification && notificationsEnabled) {
            showPushNotification(alert);
        }
        
        // Emit event
        if (typeof Events !== 'undefined') {
            Events.emit('alert:triggered', alert);
        }
        
        console.log(`Alert triggered: [${severity}] ${source} - ${title}`);
        return alert;
    }
    
    /**
     * Get severity icon
     */
    function getIcon(severity) {
        switch (severity) {
            case SEVERITY.EMERGENCY: return '🚨';
            case SEVERITY.CRITICAL: return '⛔';
            case SEVERITY.WARNING: return '⚠️';
            case SEVERITY.CAUTION: return '⚡';
            default: return 'ℹ️';
        }
    }
    
    /**
     * Show persistent banner
     */
    function showBanner(alert) {
        if (!bannerContainer) return;
        
        // Remove existing banner for same source if any
        const existingId = `banner-${alert.source}`;
        const existing = document.getElementById(existingId);
        if (existing) {
            existing.remove();
            activeAlerts.delete(existingId);
        }
        
        const colors = SEVERITY_COLORS[alert.severity] || SEVERITY_COLORS.info;
        
        const banner = document.createElement('div');
        banner.id = existingId;
        banner.className = 'alert-banner';
        banner.style.cssText = `
            background: ${colors.bg};
            color: ${colors.text};
            padding: 10px 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            font-size: 13px;
            border-bottom: 2px solid ${colors.border};
            pointer-events: auto;
            animation: slideDown 0.3s ease-out;
        `;
        
        banner.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;flex:1">
                <span style="font-size:16px">${getIcon(alert.severity)}</span>
                <div>
                    <strong>${alert.title}</strong>
                    <span style="opacity:0.9;margin-left:8px">${alert.message}</span>
                </div>
            </div>
            <button class="banner-dismiss" style="
                background: rgba(255,255,255,0.2);
                border: none;
                color: inherit;
                padding: 4px 10px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
            ">Dismiss</button>
        `;
        
        banner.querySelector('.banner-dismiss').onclick = () => {
            dismissBanner(existingId, alert.id);
        };
        
        bannerContainer.appendChild(banner);
        activeAlerts.set(existingId, alert);
    }
    
    /**
     * Dismiss a banner
     */
    function dismissBanner(bannerId, alertId) {
        const banner = document.getElementById(bannerId);
        if (banner) {
            banner.style.animation = 'slideUp 0.2s ease-in forwards';
            setTimeout(() => banner.remove(), 200);
        }
        activeAlerts.delete(bannerId);
        
        // Mark alert as acknowledged
        const alert = alertHistory.find(a => a.id === alertId);
        if (alert) {
            alert.acknowledged = true;
            saveHistory();
        }
    }
    
    /**
     * Dismiss all banners
     */
    function dismissAllBanners() {
        activeAlerts.forEach((alert, bannerId) => {
            dismissBanner(bannerId, alert.id);
        });
    }
    
    /**
     * Play alert sound
     */
    function playAlertSound(severity) {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            // Different sounds for different severities
            switch (severity) {
                case SEVERITY.EMERGENCY:
                    oscillator.frequency.value = 880;
                    oscillator.type = 'square';
                    gainNode.gain.value = 0.3;
                    // Rapid beeping
                    for (let i = 0; i < 6; i++) {
                        setTimeout(() => {
                            if (i % 2 === 0) gainNode.gain.value = 0.3;
                            else gainNode.gain.value = 0;
                        }, i * 150);
                    }
                    break;
                case SEVERITY.CRITICAL:
                    oscillator.frequency.value = 660;
                    oscillator.type = 'sawtooth';
                    gainNode.gain.value = 0.2;
                    break;
                case SEVERITY.WARNING:
                    oscillator.frequency.value = 523;
                    oscillator.type = 'triangle';
                    gainNode.gain.value = 0.15;
                    break;
                default:
                    oscillator.frequency.value = 440;
                    oscillator.type = 'sine';
                    gainNode.gain.value = 0.1;
            }
            
            oscillator.start();
            
            // Fade out
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);
            oscillator.stop(audioCtx.currentTime + 0.8);
            
        } catch (e) {
            console.warn('Could not play alert sound:', e);
        }
    }
    
    /**
     * Show push notification
     */
    function showPushNotification(alert) {
        if (!('Notification' in window) || Notification.permission !== 'granted') {
            return;
        }
        
        try {
            const notification = new Notification(`GridDown: ${alert.title}`, {
                body: alert.message,
                icon: '/icons/icon-192.png',
                badge: '/icons/icon-192.png',
                tag: `griddown-${alert.source}`,
                renotify: true,
                requireInteraction: alert.severity === SEVERITY.CRITICAL || alert.severity === SEVERITY.EMERGENCY
            });
            
            notification.onclick = () => {
                window.focus();
                notification.close();
            };
            
            // Auto-close after 10 seconds for non-critical
            if (alert.severity !== SEVERITY.CRITICAL && alert.severity !== SEVERITY.EMERGENCY) {
                setTimeout(() => notification.close(), 10000);
            }
        } catch (e) {
            console.warn('Could not show push notification:', e);
        }
    }
    
    /**
     * Get alert history
     */
    function getHistory(options = {}) {
        let filtered = [...alertHistory];
        
        if (options.source) {
            filtered = filtered.filter(a => a.source === options.source);
        }
        if (options.severity) {
            filtered = filtered.filter(a => a.severity === options.severity);
        }
        if (options.since) {
            filtered = filtered.filter(a => a.timestamp >= options.since);
        }
        if (options.unacknowledged) {
            filtered = filtered.filter(a => !a.acknowledged);
        }
        
        return filtered.sort((a, b) => b.timestamp - a.timestamp);
    }
    
    /**
     * Clear alert history
     */
    function clearHistory(source = null) {
        if (source) {
            alertHistory = alertHistory.filter(a => a.source !== source);
        } else {
            alertHistory = [];
        }
        saveHistory();
    }
    
    /**
     * Get active alerts (banners)
     */
    function getActiveAlerts() {
        return Array.from(activeAlerts.values());
    }
    
    /**
     * Settings
     */
    function setSoundEnabled(enabled) {
        soundEnabled = enabled;
        if (typeof Storage !== 'undefined' && Storage.Settings) {
            Storage.Settings.set('alertSoundEnabled', enabled);
        }
    }
    
    function isSoundEnabled() {
        return soundEnabled;
    }
    
    function isNotificationsEnabled() {
        return notificationsEnabled;
    }
    
    function getNotificationPermission() {
        return notificationPermission;
    }
    
    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideDown {
            from { transform: translateY(-100%); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
        @keyframes slideUp {
            from { transform: translateY(0); opacity: 1; }
            to { transform: translateY(-100%); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
    
    // Public API
    return {
        init,
        trigger,
        dismissBanner,
        dismissAllBanners,
        getHistory,
        clearHistory,
        getActiveAlerts,
        requestNotificationPermission,
        setSoundEnabled,
        isSoundEnabled,
        isNotificationsEnabled,
        getNotificationPermission,
        SEVERITY,
        SOURCES
    };
})();

window.AlertModule = AlertModule;
