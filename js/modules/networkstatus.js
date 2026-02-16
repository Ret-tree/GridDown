/**
 * GridDown Network Status Module
 * Monitors network connectivity and displays offline/online status indicators
 * 
 * Shows persistent banner when offline, toast when connection restored
 */
const NetworkStatusModule = (function() {
    'use strict';

    // ==================== CONSTANTS ====================
    
    const STORAGE_KEY = 'griddown_offline_dismissed';
    const ONLINE_TOAST_DURATION = 3000;
    const CHECK_INTERVAL_MS = 30000; // Periodic connectivity check
    
    // ==================== STATE ====================
    
    let isOnline = navigator.onLine;
    let wasOffline = false;
    let bannerElement = null;
    let checkInterval = null;
    let subscribers = [];
    let lastOnlineTime = Date.now();
    let offlineSince = null;

    // ==================== CORE FUNCTIONS ====================
    
    /**
     * Initialize the module
     */
    function init() {
        // Set initial state
        isOnline = navigator.onLine;
        
        // Listen for browser online/offline events
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        
        // Listen for app offline mode toggle via State subscriber
        if (typeof State !== 'undefined') {
            State.subscribe((newState, prevState) => {
                const appOfflineMode = newState.isOffline;
                const wasAppOffline = prevState?.isOffline;
                
                if (appOfflineMode !== wasAppOffline) {
                    if (appOfflineMode) {
                        // App is in user-controlled offline mode - stop checking
                        stopConnectivityCheck();
                        handleOffline(); // Update UI to show offline
                    } else {
                        // App offline mode disabled - resume checking
                        startConnectivityCheck();
                        // Check actual connectivity
                        checkConnectivity().then(online => {
                            if (online) handleOnline();
                        }).catch(err => {
                            console.warn('[Network] Connectivity check failed:', err.message);
                        });
                    }
                }
            }, ['isOffline']);
        }
        
        // Start periodic connectivity check (backup for unreliable events)
        // Only if not already in app offline mode
        if (typeof State === 'undefined' || !State.get('isOffline')) {
            startConnectivityCheck();
        }
        
        // Show initial state if offline
        if (!isOnline) {
            offlineSince = Date.now();
            showOfflineBanner();
        }
        
        console.log('NetworkStatusModule initialized, online:', isOnline);
        return true;
    }
    
    /**
     * Handle going online
     */
    function handleOnline() {
        if (isOnline) return; // Already online
        
        isOnline = true;
        const offlineDuration = offlineSince ? Date.now() - offlineSince : 0;
        offlineSince = null;
        lastOnlineTime = Date.now();
        
        // Hide offline banner
        hideOfflineBanner();
        
        // Show "back online" toast if was offline for more than 5 seconds
        if (wasOffline && offlineDuration > 5000) {
            showOnlineToast(offlineDuration);
        }
        
        wasOffline = false;
        
        notifySubscribers('online', { 
            timestamp: Date.now(),
            offlineDuration 
        });
        
        console.log('Network: Back online after', formatDuration(offlineDuration));
    }
    
    /**
     * Handle going offline
     */
    function handleOffline() {
        if (!isOnline) return; // Already offline
        
        isOnline = false;
        wasOffline = true;
        offlineSince = Date.now();
        
        // Show offline banner
        showOfflineBanner();
        
        notifySubscribers('offline', { 
            timestamp: Date.now() 
        });
        
        console.log('Network: Gone offline');
    }
    
    /**
     * Periodic connectivity check (backup for unreliable events)
     */
    function startConnectivityCheck() {
        if (checkInterval) return;
        
        checkInterval = setInterval(async () => {
            const actuallyOnline = await checkConnectivity();
            
            if (actuallyOnline && !isOnline) {
                handleOnline();
            } else if (!actuallyOnline && isOnline) {
                handleOffline();
            }
        }, CHECK_INTERVAL_MS);
    }
    
    /**
     * Stop connectivity check
     */
    function stopConnectivityCheck() {
        if (checkInterval) {
            clearInterval(checkInterval);
            checkInterval = null;
        }
    }
    
    /**
     * Actually check connectivity by making a small request
     * Skips check if app is in user-controlled offline mode
     */
    async function checkConnectivity() {
        // Skip if app is in user-controlled offline mode
        if (typeof State !== 'undefined' && State.get('isOffline')) {
            return false;
        }
        
        // First check navigator.onLine
        if (!navigator.onLine) return false;
        
        // Then try a small fetch to verify real connectivity
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            
            // Try to fetch a tiny resource (service worker should handle this)
            const response = await fetch('manifest.json', {
                method: 'HEAD',
                cache: 'no-store',
                signal: controller.signal
            });
            
            clearTimeout(timeout);
            return response.ok;
        } catch (e) {
            // Network error - offline or blocked (don't log, this is expected when offline)
            return false;
        }
    }

    // ==================== UI ====================
    
    /**
     * Show offline status banner
     */
    function showOfflineBanner() {
        // Remove existing banner if any
        hideOfflineBanner();
        
        bannerElement = document.createElement('div');
        bannerElement.id = 'offline-banner';
        bannerElement.innerHTML = `
            <style>
                #offline-banner {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
                    color: white;
                    padding: 10px 16px;
                    z-index: 10001;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 12px;
                    font-family: system-ui, -apple-system, sans-serif;
                    font-size: 13px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    animation: slideDown 0.3s ease-out;
                }
                
                @keyframes slideDown {
                    from { transform: translateY(-100%); }
                    to { transform: translateY(0); }
                }
                
                @keyframes slideUp {
                    from { transform: translateY(0); }
                    to { transform: translateY(-100%); }
                }
                
                @keyframes pulse-icon {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
                
                #offline-banner .offline-icon {
                    font-size: 18px;
                    animation: pulse-icon 2s ease-in-out infinite;
                }
                
                #offline-banner .offline-text {
                    font-weight: 500;
                }
                
                #offline-banner .offline-subtext {
                    opacity: 0.9;
                    font-size: 11px;
                }
                
                #offline-banner .offline-time {
                    font-size: 11px;
                    opacity: 0.8;
                    margin-left: auto;
                    font-variant-numeric: tabular-nums;
                }
                
                /* Adjust main content when banner is shown */
                body.offline-mode {
                    padding-top: 44px;
                }
                
                body.offline-mode .sidebar {
                    top: 44px;
                }
                
                body.offline-mode #map-container {
                    top: 44px;
                }
            </style>
            
            <span class="offline-icon">📴</span>
            <div>
                <span class="offline-text">Offline Mode</span>
                <span class="offline-subtext"> — Using cached data</span>
            </div>
            <span class="offline-time" id="offline-duration"></span>
        `;
        
        document.body.appendChild(bannerElement);
        document.body.classList.add('offline-mode');
        
        // Start duration timer
        updateOfflineDuration();
        
        // Notify any listeners that UI changed
        notifySubscribers('banner-shown', null);
    }
    
    /**
     * Update the offline duration display
     */
    function updateOfflineDuration() {
        if (!offlineSince || !bannerElement) return;
        
        const durationEl = document.getElementById('offline-duration');
        if (durationEl) {
            const duration = Date.now() - offlineSince;
            durationEl.textContent = formatDuration(duration);
        }
        
        // Update every second while offline
        if (!isOnline) {
            setTimeout(updateOfflineDuration, 1000);
        }
    }
    
    /**
     * Hide offline banner
     */
    function hideOfflineBanner() {
        if (bannerElement) {
            bannerElement.style.animation = 'slideUp 0.3s ease-out forwards';
            setTimeout(() => {
                if (bannerElement && bannerElement.parentNode) {
                    bannerElement.parentNode.removeChild(bannerElement);
                }
                bannerElement = null;
            }, 300);
        }
        document.body.classList.remove('offline-mode');
    }
    
    /**
     * Show "back online" toast
     */
    function showOnlineToast(offlineDuration) {
        // Use ModalsModule if available, otherwise create our own
        if (typeof ModalsModule !== 'undefined' && ModalsModule.showToast) {
            const durationText = offlineDuration > 0 ? ` (offline for ${formatDuration(offlineDuration)})` : '';
            ModalsModule.showToast(`Back online${durationText}`, 'success');
            return;
        }
        
        // Fallback toast
        const toast = document.createElement('div');
        toast.id = 'online-toast';
        toast.innerHTML = `
            <style>
                #online-toast {
                    position: fixed;
                    bottom: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
                    color: white;
                    padding: 12px 20px;
                    border-radius: 8px;
                    font-family: system-ui, -apple-system, sans-serif;
                    font-size: 13px;
                    font-weight: 500;
                    z-index: 10002;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                    animation: toastIn 0.3s ease-out;
                }
                
                @keyframes toastIn {
                    from { transform: translateX(-50%) translateY(20px); opacity: 0; }
                    to { transform: translateX(-50%) translateY(0); opacity: 1; }
                }
                
                @keyframes toastOut {
                    from { transform: translateX(-50%) translateY(0); opacity: 1; }
                    to { transform: translateX(-50%) translateY(20px); opacity: 0; }
                }
            </style>
            <span>✅</span>
            <span>Back online</span>
            ${offlineDuration > 0 ? `<span style="opacity:0.8;font-size:11px">(offline for ${formatDuration(offlineDuration)})</span>` : ''}
        `;
        
        document.body.appendChild(toast);
        
        // Auto-remove after duration
        setTimeout(() => {
            toast.style.animation = 'toastOut 0.3s ease-out forwards';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, ONLINE_TOAST_DURATION);
    }
    
    /**
     * Show a small inline indicator (for embedding in other UI)
     */
    function renderInlineIndicator() {
        if (isOnline) {
            return `
                <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#22c55e">
                    <span style="width:8px;height:8px;background:#22c55e;border-radius:50%"></span>
                    <span>Online</span>
                </div>
            `;
        } else {
            const duration = offlineSince ? formatDuration(Date.now() - offlineSince) : '';
            return `
                <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#ef4444">
                    <span style="width:8px;height:8px;background:#ef4444;border-radius:50%;animation:pulse-dot 2s infinite"></span>
                    <span>Offline${duration ? ` (${duration})` : ''}</span>
                </div>
                <style>
                    @keyframes pulse-dot {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0.4; }
                    }
                </style>
            `;
        }
    }

    // ==================== UTILITIES ====================
    
    /**
     * Format duration in human-readable form
     */
    function formatDuration(ms) {
        if (ms < 1000) return 'just now';
        
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            const remainingMinutes = minutes % 60;
            return `${hours}h ${remainingMinutes}m`;
        } else if (minutes > 0) {
            const remainingSeconds = seconds % 60;
            return `${minutes}m ${remainingSeconds}s`;
        } else {
            return `${seconds}s`;
        }
    }
    
    /**
     * Subscribe to network status changes
     * Callback receives (event, data) where event is 'online', 'offline', or 'banner-shown'
     */
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
                console.error('NetworkStatus subscriber error:', e);
            }
        });
    }
    
    /**
     * Cleanup
     */
    function destroy() {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        stopConnectivityCheck();
        hideOfflineBanner();
    }

    // ==================== PUBLIC API ====================
    
    return {
        init,
        destroy,
        
        // State
        isOnline: () => isOnline,
        isOffline: () => !isOnline,
        getOfflineSince: () => offlineSince,
        getLastOnlineTime: () => lastOnlineTime,
        getOfflineDuration: () => offlineSince ? Date.now() - offlineSince : 0,
        
        // Manual triggers (for testing)
        checkConnectivity,
        simulateOffline: () => handleOffline(),
        simulateOnline: () => handleOnline(),
        
        // UI
        showOfflineBanner,
        hideOfflineBanner,
        renderInlineIndicator,
        
        // Subscription
        subscribe,
        
        // Utilities
        formatDuration
    };
})();

if (typeof window !== 'undefined') {
    window.NetworkStatusModule = NetworkStatusModule;
}
