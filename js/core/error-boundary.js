/**
 * GridDown Error Boundary
 * Centralized error capture for unhandled errors and rejected promises.
 * 
 * Maintains a ring buffer of recent errors for diagnostics.
 * Does not suppress errors — they still appear in console.
 * 
 * Load this BEFORE other modules so it captures everything.
 * 
 * Usage:
 *   ErrorBoundary.getErrors()        — Get all captured errors
 *   ErrorBoundary.getErrors(10)      — Get last 10 errors
 *   ErrorBoundary.clear()            — Clear error buffer
 *   ErrorBoundary.onError(callback)  — Subscribe to new errors
 *   ErrorBoundary.getStats()         — Get error count by category
 */
const ErrorBoundary = (function() {
    'use strict';

    // Configuration
    const MAX_ERRORS = 100;       // Ring buffer size
    const THROTTLE_MS = 1000;     // Minimum interval between duplicate errors
    const IGNORE_PATTERNS = [
        /ResizeObserver loop/i,   // Benign Chrome warning
        /Script error\./i,        // Cross-origin script errors (no useful info)
        /Loading chunk.*failed/i  // CDN chunk load failures (handled by retry logic)
    ];

    // State
    const errors = [];
    const subscribers = [];
    const recentHashes = new Map();   // hash → timestamp for dedup
    let totalCount = 0;
    let suppressedCount = 0;

    /**
     * Generate a simple hash for deduplication
     */
    function hashError(message, source) {
        const str = (message || '') + '|' + (source || '');
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
        }
        return hash;
    }

    /**
     * Check if error should be ignored
     */
    function shouldIgnore(message) {
        if (!message) return false;
        return IGNORE_PATTERNS.some(pattern => pattern.test(message));
    }

    /**
     * Check if error is a throttled duplicate
     */
    function isDuplicate(hash) {
        const now = Date.now();
        const lastSeen = recentHashes.get(hash);
        if (lastSeen && (now - lastSeen) < THROTTLE_MS) {
            return true;
        }
        recentHashes.set(hash, now);

        // Clean old entries periodically
        if (recentHashes.size > 200) {
            const cutoff = now - THROTTLE_MS * 2;
            for (const [key, time] of recentHashes) {
                if (time < cutoff) recentHashes.delete(key);
            }
        }
        return false;
    }

    /**
     * Extract module name from filename or stack
     */
    function inferModule(source, stack) {
        const str = source || stack || '';
        // Match js/modules/something.js or js/core/something.js
        const match = str.match(/js\/(?:modules|core)\/([^/.]+)/);
        if (match) return match[1];
        // Match top-level js/app.js or sw.js
        const topMatch = str.match(/(?:^|\/)([^/]+)\.js/);
        if (topMatch) return topMatch[1];
        return 'unknown';
    }

    /**
     * Record an error in the ring buffer
     */
    function recordError(entry) {
        totalCount++;

        if (shouldIgnore(entry.message)) {
            suppressedCount++;
            return;
        }

        const hash = hashError(entry.message, entry.source);
        if (isDuplicate(hash)) {
            suppressedCount++;
            return;
        }

        // Add to ring buffer
        if (errors.length >= MAX_ERRORS) {
            errors.shift();
        }
        errors.push(entry);

        // Notify subscribers
        for (const cb of subscribers) {
            try {
                cb(entry);
            } catch (e) {
                // Don't let subscriber errors cascade
            }
        }
    }

    /**
     * Install global error handlers
     */
    function init() {
        // Capture synchronous errors (thrown in event handlers, setTimeout, etc.)
        window.addEventListener('error', function(event) {
            recordError({
                type: 'error',
                message: event.message || 'Unknown error',
                source: event.filename || '',
                line: event.lineno || 0,
                col: event.colno || 0,
                module: inferModule(event.filename, event.error && event.error.stack),
                stack: event.error ? (event.error.stack || '').split('\n').slice(0, 5).join('\n') : '',
                timestamp: Date.now()
            });
            // Don't prevent default — error still shows in console
        });

        // Capture unhandled promise rejections
        window.addEventListener('unhandledrejection', function(event) {
            const reason = event.reason;
            const message = reason instanceof Error ? reason.message : String(reason || 'Unknown rejection');
            const stack = reason instanceof Error ? (reason.stack || '') : '';

            recordError({
                type: 'unhandledrejection',
                message: message,
                source: '',
                line: 0,
                col: 0,
                module: inferModule('', stack),
                stack: stack.split('\n').slice(0, 5).join('\n'),
                timestamp: Date.now()
            });
            // Don't prevent default — rejection still shows in console
        });
    }

    // Public API
    const api = {
        /**
         * Initialize error boundary (call once, early in boot)
         */
        init: init,

        /**
         * Get captured errors
         * @param {number} [count] - Number of most recent errors (default: all)
         * @returns {Array} Error entries
         */
        getErrors: function(count) {
            if (count && count > 0) {
                return errors.slice(-count);
            }
            return errors.slice();
        },

        /**
         * Clear the error buffer
         */
        clear: function() {
            errors.length = 0;
            recentHashes.clear();
        },

        /**
         * Subscribe to new errors
         * @param {Function} callback - Called with error entry
         * @returns {Function} Unsubscribe function
         */
        onError: function(callback) {
            if (typeof callback === 'function') {
                subscribers.push(callback);
                return function() {
                    const idx = subscribers.indexOf(callback);
                    if (idx > -1) subscribers.splice(idx, 1);
                };
            }
            return function() {};
        },

        /**
         * Get error statistics
         * @returns {Object} Stats including counts by type and module
         */
        getStats: function() {
            const byModule = {};
            const byType = { error: 0, unhandledrejection: 0 };

            for (const entry of errors) {
                byType[entry.type] = (byType[entry.type] || 0) + 1;
                byModule[entry.module] = (byModule[entry.module] || 0) + 1;
            }

            return {
                total: totalCount,
                captured: errors.length,
                suppressed: suppressedCount,
                byType: byType,
                byModule: byModule
            };
        },

        /**
         * Format errors for display or export
         * @param {number} [count] - Number of errors to format
         * @returns {string} Formatted error report
         */
        formatReport: function(count) {
            const errs = api.getErrors(count);
            if (errs.length === 0) return 'No errors captured.';

            const stats = api.getStats();
            const lines = [
                `GridDown Error Report — ${new Date().toISOString()}`,
                `Total: ${stats.total} | Captured: ${stats.captured} | Suppressed: ${stats.suppressed}`,
                '---'
            ];

            for (const e of errs) {
                const time = new Date(e.timestamp).toLocaleTimeString();
                lines.push(`[${time}] [${e.type}] [${e.module}] ${e.message}`);
                if (e.source && e.line) {
                    lines.push(`  at ${e.source}:${e.line}:${e.col}`);
                }
                if (e.stack) {
                    lines.push('  ' + e.stack.split('\n').slice(1, 3).join('\n  '));
                }
            }

            return lines.join('\n');
        }
    };

    return api;
})();

window.ErrorBoundary = ErrorBoundary;
