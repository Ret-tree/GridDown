/**
 * GridDown Update Module
 * Handles service worker updates and notifies users when new versions are available
 * 
 * Listens for SW_UPDATED messages from service worker and shows update prompts
 */
const UpdateModule = (function() {
    'use strict';

    // ==================== CONSTANTS ====================
    
    const STORAGE_KEY = 'griddown_last_version';
    const TOAST_DURATION = 0; // Persistent until dismissed or refreshed
    
    // ==================== STATE ====================
    
    let currentVersion = null;
    let newVersion = null;
    let updateAvailable = false;
    let toastElement = null;
    let registration = null;

    // ==================== CORE FUNCTIONS ====================
    
    /**
     * Initialize the module
     */
    function init() {
        // Get current version from localStorage
        currentVersion = localStorage.getItem(STORAGE_KEY);
        
        // Listen for messages from service worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', handleSWMessage);
            
            // Check for updates on init
            checkForUpdates();
            
            // Also check periodically (every 5 minutes when tab is active)
            setInterval(checkForUpdates, 5 * 60 * 1000);
            
            // Check on visibility change (when user returns to tab)
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    checkForUpdates();
                }
            });
        }
        
        console.log('UpdateModule initialized, current version:', currentVersion || 'unknown');
        return true;
    }
    
    /**
     * Handle messages from service worker
     */
    function handleSWMessage(event) {
        const { type, version } = event.data || {};
        
        if (type === 'SW_UPDATED') {
            console.log('Service worker updated to:', version);
            handleUpdateAvailable(version);
        } else if (type === 'SW_VERSION') {
            // Store current version
            if (version && version !== currentVersion) {
                if (currentVersion) {
                    // Version changed - this is an update
                    handleUpdateAvailable(version);
                } else {
                    // First time - just store version
                    currentVersion = version;
                    localStorage.setItem(STORAGE_KEY, version);
                }
            }
        }
    }
    
    /**
     * Check for service worker updates
     */
    async function checkForUpdates() {
        if (!('serviceWorker' in navigator)) return;
        
        try {
            registration = await navigator.serviceWorker.ready;
            
            // Ask SW for current version
            if (navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({ type: 'GET_VERSION' });
            }
            
            // Check for new SW waiting
            if (registration.waiting) {
                handleUpdateAvailable('new version');
            }
            
            // Listen for new SW installing
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                if (newWorker) {
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            handleUpdateAvailable('new version');
                        }
                    });
                }
            });
            
            // Trigger update check
            registration.update().catch(() => {
                // Silent fail - network might be offline
            });
            
        } catch (e) {
            console.warn('Update check failed:', e);
        }
    }
    
    /**
     * Handle update available
     */
    function handleUpdateAvailable(version) {
        if (updateAvailable) return; // Already showing
        
        newVersion = version;
        updateAvailable = true;
        
        showUpdateToast(version);
    }

    // ==================== UI ====================
    
    /**
     * Show update available toast
     */
    function showUpdateToast(version) {
        // Remove existing toast if any
        hideUpdateToast();
        
        // Extract version number if it's in format "griddown-v6.15.0"
        const versionDisplay = version.replace('griddown-', '').replace(/^v/, '');
        
        toastElement = document.createElement('div');
        toastElement.id = 'update-toast';
        toastElement.innerHTML = `
            <style>
                #update-toast {
                    position: fixed;
                    bottom: 20px;
                    left: 20px;
                    right: 20px;
                    max-width: 400px;
                    margin: 0 auto;
                    background: linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%);
                    color: white;
                    padding: 16px;
                    border-radius: 12px;
                    font-family: system-ui, -apple-system, sans-serif;
                    z-index: 10003;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
                    animation: updateToastIn 0.4s ease-out;
                }
                
                @keyframes updateToastIn {
                    from { 
                        transform: translateY(100px); 
                        opacity: 0; 
                    }
                    to { 
                        transform: translateY(0); 
                        opacity: 1; 
                    }
                }
                
                @keyframes updateToastOut {
                    from { 
                        transform: translateY(0); 
                        opacity: 1; 
                    }
                    to { 
                        transform: translateY(100px); 
                        opacity: 0; 
                    }
                }
                
                #update-toast .toast-header {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 12px;
                }
                
                #update-toast .toast-icon {
                    font-size: 24px;
                }
                
                #update-toast .toast-title {
                    font-size: 15px;
                    font-weight: 600;
                }
                
                #update-toast .toast-version {
                    margin-left: auto;
                    font-size: 11px;
                    opacity: 0.8;
                    background: rgba(255,255,255,0.15);
                    padding: 3px 8px;
                    border-radius: 4px;
                }
                
                #update-toast .toast-message {
                    font-size: 13px;
                    opacity: 0.9;
                    margin-bottom: 14px;
                    line-height: 1.4;
                }
                
                #update-toast .toast-actions {
                    display: flex;
                    gap: 10px;
                }
                
                #update-toast .toast-btn {
                    flex: 1;
                    padding: 10px 16px;
                    border-radius: 8px;
                    font-size: 13px;
                    font-weight: 500;
                    border: none;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                
                #update-toast .toast-btn-primary {
                    background: white;
                    color: #1e40af;
                }
                
                #update-toast .toast-btn-primary:hover {
                    background: #f0f0f0;
                }
                
                #update-toast .toast-btn-secondary {
                    background: rgba(255,255,255,0.15);
                    color: white;
                }
                
                #update-toast .toast-btn-secondary:hover {
                    background: rgba(255,255,255,0.25);
                }
            </style>
            
            <div class="toast-header">
                <span class="toast-icon">🔄</span>
                <span class="toast-title">Update Available</span>
                <span class="toast-version">${versionDisplay}</span>
            </div>
            
            <div class="toast-message">
                A new version of GridDown is ready. Refresh to get the latest features and improvements.
            </div>
            
            <div class="toast-actions">
                <button class="toast-btn toast-btn-secondary" id="update-later">
                    Later
                </button>
                <button class="toast-btn toast-btn-primary" id="update-refresh">
                    Refresh Now
                </button>
            </div>
        `;
        
        document.body.appendChild(toastElement);
        
        // Event handlers
        document.getElementById('update-refresh').onclick = () => {
            applyUpdate();
        };
        
        document.getElementById('update-later').onclick = () => {
            hideUpdateToast();
        };
    }
    
    /**
     * Hide update toast
     */
    function hideUpdateToast() {
        if (toastElement) {
            toastElement.style.animation = 'updateToastOut 0.3s ease-out forwards';
            setTimeout(() => {
                if (toastElement && toastElement.parentNode) {
                    toastElement.parentNode.removeChild(toastElement);
                }
                toastElement = null;
            }, 300);
        }
    }
    
    /**
     * Apply the update (refresh page)
     */
    function applyUpdate() {
        // Update stored version
        if (newVersion) {
            localStorage.setItem(STORAGE_KEY, newVersion);
        }
        
        // If there's a waiting service worker, tell it to take over
        if (registration && registration.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        
        // Refresh the page
        window.location.reload();
    }
    
    /**
     * Get current app version
     */
    function getCurrentVersion() {
        return currentVersion;
    }
    
    /**
     * Check if update is available
     */
    function isUpdateAvailable() {
        return updateAvailable;
    }

    // ==================== PUBLIC API ====================
    
    return {
        init,
        checkForUpdates,
        applyUpdate,
        hideUpdateToast,
        getCurrentVersion,
        isUpdateAvailable,
        getNewVersion: () => newVersion
    };
})();

if (typeof window !== 'undefined') {
    window.UpdateModule = UpdateModule;
}
