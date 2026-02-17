/**
 * GridDown Mobile Enhancements Module
 * Provides mobile-specific UI and functionality
 * 
 * Features:
 * - Floating Action Button (FAB) for quick actions
 * - PWA Install Prompt with smart banner
 * - Battery status indicator
 * - Connection status indicator
 * - Enhanced haptic feedback system
 * 
 * Design Principle: All features gracefully degrade on desktop
 * - Uses feature detection before API calls
 * - CSS hides mobile-only elements above 768px
 * - No modification of existing functionality
 */
const MobileModule = (function() {
    'use strict';

    // Configuration
    const CONFIG = {
        fabBreakpoint: 1024,          // Hide FAB above this width (tablet support)
        installPromptDelay: 30000,    // Wait 30s before showing install prompt
        installPromptKey: 'griddown_install_dismissed',
        batteryUpdateInterval: 60000, // Update battery every 60s
        hapticEnabled: true
    };

    // State
    let initialized = false;
    let isMobile = false;
    let deferredInstallPrompt = null;
    let batteryManager = null;
    let fabExpanded = false;
    let fabContainer = null;
    let statusContainer = null;

    // Haptic patterns (duration in ms)
    const HAPTIC_PATTERNS = {
        tap: [10],
        success: [10, 50, 10],
        warning: [30, 50, 30],
        error: [50, 30, 50, 30, 50],
        navigation: [20],
        longPress: [50]
    };

    /**
     * Initialize mobile module
     */
    function init() {
        if (initialized) return;

        // Check if mobile
        isMobile = checkIsMobile();
        
        // Always set up features (they self-disable on desktop)
        setupInstallPrompt();
        setupBatteryMonitor();
        setupConnectionMonitor();
        
        // Only create mobile UI elements if mobile
        if (isMobile) {
            createFAB();
            createStatusIndicators();
        }

        // Listen for resize and orientation changes (tablets rotate frequently in field)
        window.addEventListener('resize', handleResize);
        window.addEventListener('orientationchange', () => {
            // Delay slightly — viewport dimensions update after orientationchange fires
            setTimeout(handleResize, 100);
        });

        initialized = true;
        console.log(`Mobile module initialized (isMobile: ${isMobile})`);
    }

    /**
     * Check if device is mobile based on screen width and touch support
     */
    function checkIsMobile() {
        const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        const isNarrow = window.innerWidth <= CONFIG.fabBreakpoint;
        return hasTouch && isNarrow;
    }

    /**
     * Handle window resize
     */
    function handleResize() {
        const wasMobile = isMobile;
        isMobile = checkIsMobile();

        // Create/destroy mobile UI as needed
        if (isMobile && !wasMobile) {
            if (!fabContainer) createFAB();
            if (!statusContainer) createStatusIndicators();
        }
    }

    // ==================== FLOATING ACTION BUTTON ====================

    /**
     * Create the Floating Action Button
     */
    function createFAB() {
        // Don't create if already exists
        if (document.getElementById('mobile-fab')) return;

        fabContainer = document.createElement('div');
        fabContainer.id = 'mobile-fab';
        fabContainer.className = 'mobile-fab';
        fabContainer.setAttribute('role', 'group');
        fabContainer.setAttribute('aria-label', 'Quick actions');

        fabContainer.innerHTML = `
            <div class="mobile-fab__actions" id="fab-actions" aria-hidden="true">
                <button class="mobile-fab__action" data-action="search" aria-label="Search">
                    <span class="mobile-fab__action-icon">🔍</span>
                    <span class="mobile-fab__action-label">Search</span>
                </button>
                <button class="mobile-fab__action" data-action="wizard" aria-label="Situation Help">
                    <span class="mobile-fab__action-icon">❓</span>
                    <span class="mobile-fab__action-label">Help Me</span>
                </button>
                <button class="mobile-fab__action" data-action="waypoint" aria-label="Add Waypoint">
                    <span class="mobile-fab__action-icon">📍</span>
                    <span class="mobile-fab__action-label">Waypoint</span>
                </button>
                <button class="mobile-fab__action" data-action="compass" aria-label="Compass">
                    <span class="mobile-fab__action-icon">🧭</span>
                    <span class="mobile-fab__action-label">Compass</span>
                </button>
                <button class="mobile-fab__action mobile-fab__action--emergency" data-action="sos" aria-label="Emergency SOS">
                    <span class="mobile-fab__action-icon">🆘</span>
                    <span class="mobile-fab__action-label">SOS</span>
                </button>
            </div>
            <button class="mobile-fab__trigger" id="fab-trigger" aria-label="Quick actions menu" aria-expanded="false">
                <span class="mobile-fab__trigger-icon" id="fab-icon">⚡</span>
            </button>
        `;

        document.body.appendChild(fabContainer);

        // Bind events
        const trigger = document.getElementById('fab-trigger');
        trigger.addEventListener('click', toggleFAB);

        // Bind action buttons
        fabContainer.querySelectorAll('.mobile-fab__action').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                handleFABAction(btn.dataset.action);
            });
        });

        // Close FAB when clicking outside
        document.addEventListener('click', (e) => {
            if (fabExpanded && !fabContainer.contains(e.target)) {
                closeFAB();
            }
        });

        // Close FAB on escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && fabExpanded) {
                closeFAB();
            }
        });
    }

    /**
     * Toggle FAB expanded state
     */
    function toggleFAB() {
        if (fabExpanded) {
            closeFAB();
        } else {
            openFAB();
        }
    }

    /**
     * Open FAB menu
     */
    function openFAB() {
        fabExpanded = true;
        fabContainer.classList.add('mobile-fab--expanded');
        
        const trigger = document.getElementById('fab-trigger');
        const actions = document.getElementById('fab-actions');
        const icon = document.getElementById('fab-icon');
        
        trigger.setAttribute('aria-expanded', 'true');
        actions.setAttribute('aria-hidden', 'false');
        icon.textContent = '✕';
        
        haptic('tap');
    }

    /**
     * Close FAB menu
     */
    function closeFAB() {
        fabExpanded = false;
        fabContainer.classList.remove('mobile-fab--expanded');
        
        const trigger = document.getElementById('fab-trigger');
        const actions = document.getElementById('fab-actions');
        const icon = document.getElementById('fab-icon');
        
        trigger.setAttribute('aria-expanded', 'false');
        actions.setAttribute('aria-hidden', 'true');
        icon.textContent = '⚡';
    }

    /**
     * Handle FAB action button clicks
     */
    function handleFABAction(action) {
        haptic('tap');
        closeFAB();

        switch (action) {
            case 'search':
                // Open global search
                if (typeof SearchModule !== 'undefined' && SearchModule.open) {
                    SearchModule.open();
                }
                break;

            case 'wizard':
                // Open situation wizard
                if (typeof SituationWizard !== 'undefined' && SituationWizard.open) {
                    SituationWizard.open();
                }
                break;

            case 'waypoint':
                // Add waypoint at current location or map center
                if (typeof ModalsModule !== 'undefined') {
                    ModalsModule.openWaypointModal();
                }
                break;

            case 'compass':
                // Open celestial/compass panel
                if (typeof State !== 'undefined') {
                    State.UI.setActivePanel('celestial');
                    Events.emit(Events.EVENTS.PANEL_CHANGE, { panel: 'celestial' });
                    State.UI.openPanel();
                }
                break;

            case 'sos':
                // Open SOS panel
                if (typeof State !== 'undefined') {
                    State.UI.setActivePanel('sos');
                    Events.emit(Events.EVENTS.PANEL_CHANGE, { panel: 'sos' });
                    State.UI.openPanel();
                }
                haptic('warning');
                break;
        }
    }

    // ==================== PWA INSTALL PROMPT ====================

    /**
     * Set up PWA install prompt handling
     */
    function setupInstallPrompt() {
        // Listen for the beforeinstallprompt event
        window.addEventListener('beforeinstallprompt', (e) => {
            // Prevent default browser prompt
            e.preventDefault();
            
            // Store the event for later
            deferredInstallPrompt = e;
            
            // Check if user previously dismissed
            const dismissed = localStorage.getItem(CONFIG.installPromptKey);
            if (dismissed) {
                const dismissedTime = parseInt(dismissed);
                const daysSinceDismiss = (Date.now() - dismissedTime) / (1000 * 60 * 60 * 24);
                
                // Don't show again for 7 days after dismissal
                if (daysSinceDismiss < 7) {
                    return;
                }
            }
            
            // Show install banner after delay
            setTimeout(() => {
                if (deferredInstallPrompt) {
                    showInstallBanner();
                }
            }, CONFIG.installPromptDelay);
        });

        // Track successful install
        window.addEventListener('appinstalled', () => {
            console.log('GridDown installed successfully');
            deferredInstallPrompt = null;
            hideInstallBanner();
            
            if (typeof ModalsModule !== 'undefined') {
                ModalsModule.showToast('GridDown installed! 🎉', 'success', 3000);
            }
        });
    }

    /**
     * Show the install banner
     */
    function showInstallBanner() {
        // Don't show if already installed (standalone mode)
        if (window.matchMedia('(display-mode: standalone)').matches) {
            return;
        }

        // Don't show if banner already exists
        if (document.getElementById('install-banner')) return;

        const banner = document.createElement('div');
        banner.id = 'install-banner';
        banner.className = 'install-banner';
        banner.setAttribute('role', 'alert');

        banner.innerHTML = `
            <div class="install-banner__content">
                <div class="install-banner__icon">📱</div>
                <div class="install-banner__text">
                    <div class="install-banner__title">Install GridDown</div>
                    <div class="install-banner__subtitle">Add to home screen for offline access</div>
                </div>
            </div>
            <div class="install-banner__actions">
                <button class="install-banner__btn install-banner__btn--dismiss" id="install-dismiss">
                    Later
                </button>
                <button class="install-banner__btn install-banner__btn--install" id="install-accept">
                    Install
                </button>
            </div>
        `;

        document.body.appendChild(banner);

        // Animate in
        requestAnimationFrame(() => {
            banner.classList.add('install-banner--visible');
        });

        // Bind events
        document.getElementById('install-dismiss').addEventListener('click', dismissInstall);
        document.getElementById('install-accept').addEventListener('click', acceptInstall);
    }

    /**
     * Hide install banner
     */
    function hideInstallBanner() {
        const banner = document.getElementById('install-banner');
        if (banner) {
            banner.classList.remove('install-banner--visible');
            setTimeout(() => banner.remove(), 300);
        }
    }

    /**
     * User dismissed install prompt
     */
    function dismissInstall() {
        localStorage.setItem(CONFIG.installPromptKey, Date.now().toString());
        hideInstallBanner();
    }

    /**
     * User accepted install prompt
     */
    async function acceptInstall() {
        if (!deferredInstallPrompt) return;

        // Show the browser's install prompt
        deferredInstallPrompt.prompt();

        // Wait for user choice
        const { outcome } = await deferredInstallPrompt.userChoice;
        
        console.log(`Install prompt outcome: ${outcome}`);
        
        // Clear the deferred prompt
        deferredInstallPrompt = null;
        hideInstallBanner();
    }

    // ==================== BATTERY MONITOR ====================

    /**
     * Set up battery monitoring
     */
    async function setupBatteryMonitor() {
        // Check for Battery API support
        if (!('getBattery' in navigator)) {
            console.log('Battery API not supported');
            return;
        }

        try {
            batteryManager = await navigator.getBattery();
            
            // Initial update
            updateBatteryStatus();

            // Listen for changes
            batteryManager.addEventListener('chargingchange', updateBatteryStatus);
            batteryManager.addEventListener('levelchange', updateBatteryStatus);

            // Periodic update as backup
            setInterval(updateBatteryStatus, CONFIG.batteryUpdateInterval);
        } catch (e) {
            console.warn('Battery API error:', e);
        }
    }

    /**
     * Update battery status display
     */
    function updateBatteryStatus() {
        if (!batteryManager) return;

        const level = Math.round(batteryManager.level * 100);
        const charging = batteryManager.charging;

        // Update status indicator if it exists
        const batteryEl = document.getElementById('status-battery');
        if (batteryEl) {
            const icon = charging ? '🔌' : (level <= 20 ? '🪫' : '🔋');
            const colorClass = level <= 20 ? 'status-indicator--warning' : 
                              level <= 10 ? 'status-indicator--critical' : '';
            
            batteryEl.innerHTML = `<span class="status-indicator__icon">${icon}</span><span class="status-indicator__value">${level}%</span>`;
            batteryEl.className = `status-indicator status-indicator--battery ${colorClass}`;
            batteryEl.title = `Battery: ${level}%${charging ? ' (charging)' : ''}`;
        }

        // Emit event for other modules
        if (typeof Events !== 'undefined') {
            Events.emit('battery:update', { level, charging });
        }

        // Warn if battery is critically low
        if (level <= 10 && !charging) {
            if (typeof ModalsModule !== 'undefined') {
                ModalsModule.showToast(`⚠️ Battery critically low: ${level}%`, 'warning', 5000);
            }
        }
    }

    /**
     * Get current battery status
     */
    function getBatteryStatus() {
        if (!batteryManager) return null;
        
        return {
            level: Math.round(batteryManager.level * 100),
            charging: batteryManager.charging,
            chargingTime: batteryManager.chargingTime,
            dischargingTime: batteryManager.dischargingTime
        };
    }

    // ==================== CONNECTION MONITOR ====================

    /**
     * Set up connection monitoring
     */
    function setupConnectionMonitor() {
        // Initial update
        updateConnectionStatus();

        // Listen for online/offline events
        window.addEventListener('online', () => {
            updateConnectionStatus();
            if (typeof ModalsModule !== 'undefined') {
                ModalsModule.showToast('Back online', 'success', 2000);
            }
            haptic('success');
        });

        window.addEventListener('offline', () => {
            updateConnectionStatus();
            if (typeof ModalsModule !== 'undefined') {
                ModalsModule.showToast('You are offline', 'warning', 3000);
            }
            haptic('warning');
        });

        // Listen for connection quality changes (if available)
        if ('connection' in navigator) {
            navigator.connection.addEventListener('change', updateConnectionStatus);
        }
    }

    /**
     * Update connection status display
     */
    function updateConnectionStatus() {
        const online = navigator.onLine;
        let connectionType = 'unknown';
        let effectiveType = '';

        // Get connection details if available
        if ('connection' in navigator) {
            connectionType = navigator.connection.type || 'unknown';
            effectiveType = navigator.connection.effectiveType || '';
        }

        // Update status indicator if it exists
        const connectionEl = document.getElementById('status-connection');
        if (connectionEl) {
            let icon, label;
            
            if (!online) {
                icon = '📵';
                label = 'Offline';
                connectionEl.className = 'status-indicator status-indicator--connection status-indicator--offline';
            } else if (effectiveType === 'slow-2g' || effectiveType === '2g') {
                icon = '📶';
                label = 'Slow';
                connectionEl.className = 'status-indicator status-indicator--connection status-indicator--slow';
            } else {
                icon = '📶';
                label = 'Online';
                connectionEl.className = 'status-indicator status-indicator--connection status-indicator--online';
            }

            connectionEl.innerHTML = `<span class="status-indicator__icon">${icon}</span><span class="status-indicator__value">${label}</span>`;
            connectionEl.title = online ? `Connected (${effectiveType || connectionType})` : 'Offline - using cached data';
        }

        // Emit event
        if (typeof Events !== 'undefined') {
            Events.emit('connection:update', { online, connectionType, effectiveType });
        }
    }

    /**
     * Get current connection status
     */
    function getConnectionStatus() {
        return {
            online: navigator.onLine,
            type: navigator.connection?.type || 'unknown',
            effectiveType: navigator.connection?.effectiveType || 'unknown',
            downlink: navigator.connection?.downlink || null,
            rtt: navigator.connection?.rtt || null
        };
    }

    // ==================== STATUS INDICATORS ====================

    /**
     * Create status indicators container
     */
    function createStatusIndicators() {
        // Don't create if already exists
        if (document.getElementById('mobile-status')) return;

        statusContainer = document.createElement('div');
        statusContainer.id = 'mobile-status';
        statusContainer.className = 'mobile-status';
        statusContainer.setAttribute('role', 'status');
        statusContainer.setAttribute('aria-live', 'polite');

        statusContainer.innerHTML = `
            <div class="status-indicator status-indicator--connection" id="status-connection">
                <span class="status-indicator__icon">📶</span>
                <span class="status-indicator__value">--</span>
            </div>
            <div class="status-indicator status-indicator--battery" id="status-battery">
                <span class="status-indicator__icon">🔋</span>
                <span class="status-indicator__value">--%</span>
            </div>
        `;

        document.body.appendChild(statusContainer);

        // Initial updates
        updateConnectionStatus();
        updateBatteryStatus();
    }

    // ==================== HAPTIC FEEDBACK ====================

    /**
     * Trigger haptic feedback
     * @param {string} pattern - Pattern name: tap, success, warning, error, navigation, longPress
     */
    function haptic(pattern = 'tap') {
        if (!CONFIG.hapticEnabled) return;
        if (!('vibrate' in navigator)) return;

        const vibrationPattern = HAPTIC_PATTERNS[pattern] || HAPTIC_PATTERNS.tap;
        
        try {
            navigator.vibrate(vibrationPattern);
        } catch (e) {
            // Vibration not available or blocked
        }
    }

    /**
     * Enable/disable haptic feedback
     */
    function setHapticEnabled(enabled) {
        CONFIG.hapticEnabled = enabled;
        localStorage.setItem('griddown_haptic_enabled', enabled.toString());
    }

    /**
     * Check if haptic is enabled
     */
    function isHapticEnabled() {
        const saved = localStorage.getItem('griddown_haptic_enabled');
        if (saved !== null) {
            CONFIG.hapticEnabled = saved === 'true';
        }
        return CONFIG.hapticEnabled;
    }

    // ==================== FULLSCREEN ====================

    /**
     * Toggle fullscreen mode
     */
    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen?.() ||
            document.documentElement.webkitRequestFullscreen?.() ||
            document.documentElement.mozRequestFullScreen?.();
            haptic('tap');
        } else {
            document.exitFullscreen?.() ||
            document.webkitExitFullscreen?.() ||
            document.mozCancelFullScreen?.();
        }
    }

    /**
     * Check if in fullscreen mode
     */
    function isFullscreen() {
        return !!(document.fullscreenElement || 
                  document.webkitFullscreenElement || 
                  document.mozFullScreenElement);
    }

    // ==================== PUBLIC API ====================

    return {
        init,
        
        // FAB
        openFAB,
        closeFAB,
        toggleFAB,
        
        // Install
        showInstallBanner,
        hideInstallBanner,
        
        // Status
        getBatteryStatus,
        getConnectionStatus,
        
        // Haptic
        haptic,
        setHapticEnabled,
        isHapticEnabled,
        
        // Fullscreen
        toggleFullscreen,
        isFullscreen,
        
        // State
        get isMobile() { return isMobile; }
    };
})();

// Auto-initialize when DOM is ready
if (typeof window !== 'undefined') {
    window.MobileModule = MobileModule;
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => MobileModule.init());
    } else {
        MobileModule.init();
    }
}
