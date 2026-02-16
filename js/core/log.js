/**
 * GridDown Log Level Controller
 * Controls console output verbosity without modifying existing code.
 * 
 * Wraps console.log and console.debug to respect a configurable log level.
 * console.warn and console.error always pass through (safety-critical).
 * 
 * Load BEFORE other modules so all their console calls are intercepted.
 * 
 * Levels (ascending verbosity):
 *   'error'  — Only console.error
 *   'warn'   — console.error + console.warn (production default)
 *   'info'   — + console.info
 *   'log'    — + console.log
 *   'debug'  — Everything including console.debug (development)
 * 
 * Usage:
 *   Log.setLevel('debug')   — Enable all output (troubleshooting)
 *   Log.setLevel('warn')    — Quiet mode (production)
 *   Log.getLevel()          — Current level
 *   Log.restore()           — Restore original console (emergency)
 *   
 * Persists to localStorage as 'griddown_log_level'.
 * URL override: ?loglevel=debug (takes precedence, not persisted)
 */
const Log = (function() {
    'use strict';

    // Level hierarchy (lower number = more restrictive)
    const LEVELS = {
        error: 0,
        warn:  1,
        info:  2,
        log:   3,
        debug: 4
    };

    // Save originals before any module can alias them
    const _originals = {
        log:   console.log.bind(console),
        debug: console.debug.bind(console),
        info:  console.info.bind(console),
        warn:  console.warn.bind(console),
        error: console.error.bind(console)
    };

    const STORAGE_KEY = 'griddown_log_level';
    const DEFAULT_LEVEL = 'warn';
    
    let currentLevel = DEFAULT_LEVEL;
    let suppressed = 0;

    // No-op function for suppressed methods
    function noop() { suppressed++; }

    /**
     * Apply the current log level by replacing console methods
     */
    function applyLevel() {
        const threshold = LEVELS[currentLevel] !== undefined ? LEVELS[currentLevel] : LEVELS[DEFAULT_LEVEL];

        // console.error and console.warn always pass through
        console.error = _originals.error;
        console.warn  = _originals.warn;
        
        // Conditionally enable lower-priority methods
        console.info  = threshold >= LEVELS.info  ? _originals.info  : noop;
        console.log   = threshold >= LEVELS.log   ? _originals.log   : noop;
        console.debug = threshold >= LEVELS.debug ? _originals.debug : noop;
    }

    /**
     * Determine initial log level from URL params or localStorage
     */
    function resolveInitialLevel() {
        // URL param takes precedence (not persisted)
        try {
            const params = new URLSearchParams(window.location.search);
            const urlLevel = params.get('loglevel');
            if (urlLevel && LEVELS[urlLevel] !== undefined) {
                return urlLevel;
            }
        } catch (e) {
            // URLSearchParams not available or no location
        }

        // localStorage
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored && LEVELS[stored] !== undefined) {
                return stored;
            }
        } catch (e) {
            // Private browsing or storage unavailable
        }

        return DEFAULT_LEVEL;
    }

    /**
     * Initialize — call once, as early as possible
     */
    function init() {
        currentLevel = resolveInitialLevel();
        applyLevel();
        
        // Announce if not at default (helps developers know verbose mode is on)
        if (currentLevel !== DEFAULT_LEVEL) {
            _originals.log(`[Log] Level: ${currentLevel} (set via ${
                new URLSearchParams(window.location.search).get('loglevel') ? 'URL param' : 'localStorage'
            })`);
        }
    }

    // Public API
    const api = {
        init: init,

        /**
         * Set log level
         * @param {string} level - 'error', 'warn', 'info', 'log', or 'debug'
         * @param {boolean} [persist=true] - Save to localStorage
         */
        setLevel: function(level, persist) {
            if (LEVELS[level] === undefined) {
                _originals.warn(`[Log] Invalid level "${level}". Valid: ${Object.keys(LEVELS).join(', ')}`);
                return;
            }
            currentLevel = level;
            applyLevel();
            
            if (persist !== false) {
                try {
                    localStorage.setItem(STORAGE_KEY, level);
                } catch (e) { /* ignore */ }
            }
            
            _originals.log(`[Log] Level set to: ${level}`);
        },

        /**
         * Get current log level
         * @returns {string}
         */
        getLevel: function() {
            return currentLevel;
        },

        /**
         * Get suppression stats
         * @returns {object}
         */
        getStats: function() {
            return {
                level: currentLevel,
                suppressed: suppressed,
                levels: Object.keys(LEVELS)
            };
        },

        /**
         * Restore all original console methods (emergency escape hatch)
         */
        restore: function() {
            console.log   = _originals.log;
            console.debug = _originals.debug;
            console.info  = _originals.info;
            console.warn  = _originals.warn;
            console.error = _originals.error;
            _originals.log('[Log] All console methods restored to originals');
        },

        /** 
         * Access originals directly (always works regardless of level)
         */
        originals: _originals,

        /**
         * Level constants for programmatic use
         */
        LEVELS: LEVELS
    };

    return api;
})();

window.Log = Log;
