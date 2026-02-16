/**
 * GridDown Plan Sharing Module
 * Export/import encrypted plan packages with conflict resolution
 * Supports offline sharing via AirDrop, email, SD card, mesh, etc.
 */
const PlanSharingModule = (function() {
    'use strict';

    const PLAN_VERSION = '1.0';
    const ENCRYPTION_ALGO = 'AES-GCM';
    const KEY_ITERATIONS = 100000;
    const SALT_LENGTH = 16;
    const IV_LENGTH = 12;

    /**
     * Generate a cryptographic key from a passphrase
     */
    async function deriveKey(passphrase, salt) {
        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(passphrase),
            'PBKDF2',
            false,
            ['deriveBits', 'deriveKey']
        );

        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: KEY_ITERATIONS,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: ENCRYPTION_ALGO, length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Encrypt data with a passphrase
     */
    async function encryptData(data, passphrase) {
        const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
        const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
        const key = await deriveKey(passphrase, salt);

        const encoder = new TextEncoder();
        const encodedData = encoder.encode(JSON.stringify(data));

        const encrypted = await crypto.subtle.encrypt(
            { name: ENCRYPTION_ALGO, iv: iv },
            key,
            encodedData
        );

        // Combine salt + iv + encrypted data
        const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
        combined.set(salt, 0);
        combined.set(iv, salt.length);
        combined.set(new Uint8Array(encrypted), salt.length + iv.length);

        return arrayBufferToBase64(combined.buffer);
    }

    /**
     * Decrypt data with a passphrase
     */
    async function decryptData(encryptedBase64, passphrase) {
        try {
            const combined = base64ToArrayBuffer(encryptedBase64);
            const combinedArray = new Uint8Array(combined);

            const salt = combinedArray.slice(0, SALT_LENGTH);
            const iv = combinedArray.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
            const encrypted = combinedArray.slice(SALT_LENGTH + IV_LENGTH);

            const key = await deriveKey(passphrase, salt);

            const decrypted = await crypto.subtle.decrypt(
                { name: ENCRYPTION_ALGO, iv: iv },
                key,
                encrypted
            );

            const decoder = new TextDecoder();
            return JSON.parse(decoder.decode(decrypted));
        } catch (error) {
            console.error('Decryption failed:', error);
            throw new Error('Decryption failed. Check your passphrase.');
        }
    }

    /**
     * Helper: ArrayBuffer to Base64
     */
    function arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    /**
     * Helper: Base64 to ArrayBuffer
     */
    function base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    /**
     * Create a plan package from current data
     */
    function createPlanPackage(options = {}) {
        const waypoints = State.get('waypoints') || [];
        const routes = State.get('routes') || [];
        
        // Filter to selected items if specified
        const selectedWaypoints = options.waypointIds 
            ? waypoints.filter(w => options.waypointIds.includes(w.id))
            : waypoints;
        
        const selectedRoutes = options.routeIds
            ? routes.filter(r => options.routeIds.includes(r.id))
            : routes;

        // Get logistics config if available
        let logisticsConfig = null;
        if (typeof LogisticsModule !== 'undefined') {
            logisticsConfig = LogisticsModule.getConfig();
        }

        // Get contingency config and current plan if available
        let contingencyData = null;
        if (typeof ContingencyModule !== 'undefined') {
            contingencyData = {};
            if (ContingencyModule.getConfig) {
                contingencyData.config = ContingencyModule.getConfig();
            }
            if (ContingencyModule.getCurrentPlan) {
                contingencyData.currentPlan = ContingencyModule.getCurrentPlan();
            }
            // Only include if we got actual data
            if (!contingencyData.config && !contingencyData.currentPlan) {
                contingencyData = null;
            }
        }

        return {
            version: PLAN_VERSION,
            created: new Date().toISOString(),
            creator: options.creatorName || 'GridDown User',
            description: options.description || '',
            planName: options.planName || 'Exported Plan',
            
            // Core data
            waypoints: selectedWaypoints,
            routes: selectedRoutes,
            
            // Optional modules
            logistics: logisticsConfig,
            contingency: contingencyData,
            
            // Metadata for conflict resolution
            checksum: generateChecksum(selectedWaypoints, selectedRoutes)
        };
    }

    /**
     * Generate a simple checksum for change detection
     */
    function generateChecksum(waypoints, routes) {
        const data = JSON.stringify({ waypoints, routes });
        let hash = 0;
        for (let i = 0; i < data.length; i++) {
            const char = data.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString(16);
    }

    /**
     * Export plan as encrypted .gdplan file
     */
    async function exportPlan(passphrase, options = {}) {
        if (!passphrase || passphrase.length < 4) {
            throw new Error('Passphrase must be at least 4 characters');
        }

        const planPackage = createPlanPackage(options);
        const encrypted = await encryptData(planPackage, passphrase);

        // Create file structure
        const fileData = {
            format: 'gdplan',
            version: PLAN_VERSION,
            encrypted: true,
            data: encrypted
        };

        return JSON.stringify(fileData, null, 2);
    }

    /**
     * Export unencrypted plan (for trusted channels)
     */
    function exportPlanUnencrypted(options = {}) {
        const planPackage = createPlanPackage(options);
        
        const fileData = {
            format: 'gdplan',
            version: PLAN_VERSION,
            encrypted: false,
            data: planPackage
        };

        return JSON.stringify(fileData, null, 2);
    }

    /**
     * Download plan as file
     */
    async function downloadPlan(passphrase, options = {}) {
        const planName = options.planName || 'griddown-plan';
        const filename = `${planName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}.gdplan`;
        
        let content;
        if (passphrase) {
            content = await exportPlan(passphrase, options);
        } else {
            content = exportPlanUnencrypted(options);
        }

        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        return filename;
    }

    /**
     * Parse an imported plan file
     */
    async function parsePlanFile(fileContent, passphrase = null) {
        let fileData;
        
        try {
            fileData = JSON.parse(fileContent);
        } catch (e) {
            throw new Error('Invalid file format');
        }

        if (fileData.format !== 'gdplan') {
            throw new Error('Not a valid GridDown plan file');
        }

        let planData;
        
        if (fileData.encrypted) {
            if (!passphrase) {
                throw new Error('This plan is encrypted. Please provide a passphrase.');
            }
            planData = await decryptData(fileData.data, passphrase);
        } else {
            planData = fileData.data;
        }

        return planData;
    }

    /**
     * Analyze conflicts between imported data and existing data
     */
    function analyzeConflicts(importedPlan) {
        const existingWaypoints = State.get('waypoints') || [];
        const existingRoutes = State.get('routes') || [];

        const conflicts = {
            waypoints: [],
            routes: [],
            newWaypoints: [],
            newRoutes: []
        };

        // Check waypoint conflicts
        (importedPlan.waypoints || []).forEach(imported => {
            const existing = existingWaypoints.find(e => e.id === imported.id);
            
            if (existing) {
                // Check if content actually differs
                const isDifferent = JSON.stringify(existing) !== JSON.stringify(imported);
                if (isDifferent) {
                    conflicts.waypoints.push({
                        imported,
                        existing,
                        type: 'modified'
                    });
                }
                // If identical, we'll skip it automatically
            } else {
                // Check for name collision
                const nameMatch = existingWaypoints.find(e => 
                    e.name.toLowerCase() === imported.name.toLowerCase()
                );
                if (nameMatch) {
                    conflicts.waypoints.push({
                        imported,
                        existing: nameMatch,
                        type: 'name_collision'
                    });
                } else {
                    conflicts.newWaypoints.push(imported);
                }
            }
        });

        // Check route conflicts
        (importedPlan.routes || []).forEach(imported => {
            const existing = existingRoutes.find(e => e.id === imported.id);
            
            if (existing) {
                const isDifferent = JSON.stringify(existing) !== JSON.stringify(imported);
                if (isDifferent) {
                    conflicts.routes.push({
                        imported,
                        existing,
                        type: 'modified'
                    });
                }
            } else {
                const nameMatch = existingRoutes.find(e => 
                    e.name.toLowerCase() === imported.name.toLowerCase()
                );
                if (nameMatch) {
                    conflicts.routes.push({
                        imported,
                        existing: nameMatch,
                        type: 'name_collision'
                    });
                } else {
                    conflicts.newRoutes.push(imported);
                }
            }
        });

        return conflicts;
    }

    /**
     * Merge imported plan with conflict resolutions
     * @param {Object} importedPlan - The parsed plan data
     * @param {Object} resolutions - Map of item IDs to resolution actions
     *   Actions: 'skip', 'replace', 'keep_both', 'merge'
     */
    async function mergePlan(importedPlan, resolutions = {}) {
        const existingWaypoints = [...(State.get('waypoints') || [])];
        const existingRoutes = [...(State.get('routes') || [])];
        
        let addedWaypoints = 0;
        let updatedWaypoints = 0;
        let addedRoutes = 0;
        let updatedRoutes = 0;

        // Process waypoints
        (importedPlan.waypoints || []).forEach(imported => {
            const existingIndex = existingWaypoints.findIndex(e => e.id === imported.id);
            const resolution = resolutions[`waypoint_${imported.id}`] || 'skip';

            if (existingIndex === -1) {
                // Check for name collision
                const nameIndex = existingWaypoints.findIndex(e => 
                    e.name.toLowerCase() === imported.name.toLowerCase()
                );
                
                if (nameIndex === -1 || resolution === 'keep_both') {
                    // No collision or keeping both
                    if (resolution === 'keep_both') {
                        imported = { 
                            ...imported, 
                            id: Helpers.generateId(),
                            name: `${imported.name} (imported)`
                        };
                    }
                    existingWaypoints.push(imported);
                    addedWaypoints++;
                } else if (resolution === 'replace') {
                    existingWaypoints[nameIndex] = { ...imported, id: existingWaypoints[nameIndex].id };
                    updatedWaypoints++;
                }
                // 'skip' does nothing
            } else {
                // ID match - apply resolution
                if (resolution === 'replace') {
                    existingWaypoints[existingIndex] = imported;
                    updatedWaypoints++;
                } else if (resolution === 'keep_both') {
                    const newWp = { 
                        ...imported, 
                        id: Helpers.generateId(),
                        name: `${imported.name} (imported)`
                    };
                    existingWaypoints.push(newWp);
                    addedWaypoints++;
                }
                // 'skip' keeps existing
            }
        });

        // Process routes
        (importedPlan.routes || []).forEach(imported => {
            const existingIndex = existingRoutes.findIndex(e => e.id === imported.id);
            const resolution = resolutions[`route_${imported.id}`] || 'skip';

            if (existingIndex === -1) {
                const nameIndex = existingRoutes.findIndex(e => 
                    e.name.toLowerCase() === imported.name.toLowerCase()
                );
                
                if (nameIndex === -1 || resolution === 'keep_both') {
                    if (resolution === 'keep_both') {
                        imported = { 
                            ...imported, 
                            id: Helpers.generateId(),
                            name: `${imported.name} (imported)`
                        };
                    }
                    existingRoutes.push(imported);
                    addedRoutes++;
                } else if (resolution === 'replace') {
                    existingRoutes[nameIndex] = { ...imported, id: existingRoutes[nameIndex].id };
                    updatedRoutes++;
                }
            } else {
                if (resolution === 'replace') {
                    existingRoutes[existingIndex] = imported;
                    updatedRoutes++;
                } else if (resolution === 'keep_both') {
                    const newRoute = { 
                        ...imported, 
                        id: Helpers.generateId(),
                        name: `${imported.name} (imported)`
                    };
                    existingRoutes.push(newRoute);
                    addedRoutes++;
                } else if (resolution === 'merge') {
                    // Merge route points (add new points that don't exist)
                    const existing = existingRoutes[existingIndex];
                    const mergedPoints = [...existing.points];
                    
                    (imported.points || []).forEach(pt => {
                        const exists = mergedPoints.some(ep => 
                            Math.abs(ep.lat - pt.lat) < 0.0001 && 
                            Math.abs(ep.lon - pt.lon) < 0.0001
                        );
                        if (!exists) {
                            mergedPoints.push(pt);
                        }
                    });
                    
                    existingRoutes[existingIndex] = {
                        ...existing,
                        points: mergedPoints,
                        lastMerged: new Date().toISOString()
                    };
                    updatedRoutes++;
                }
            }
        });

        // Update state
        State.Waypoints.setAll(existingWaypoints);
        State.Routes.setAll(existingRoutes);

        // Persist to storage
        await Storage.Waypoints.saveAll(existingWaypoints);
        await Storage.Routes.saveAll(existingRoutes);

        // Import logistics config if present and user wants it
        if (importedPlan.logistics && resolutions.importLogistics) {
            if (typeof LogisticsModule !== 'undefined') {
                LogisticsModule.setConfig(importedPlan.logistics);
            }
        }

        // Import contingency config if present and user wants it
        if (importedPlan.contingency?.config && resolutions.importContingency) {
            if (typeof ContingencyModule !== 'undefined' && ContingencyModule.setConfig) {
                ContingencyModule.setConfig(importedPlan.contingency.config);
            }
        }

        return {
            waypoints: { added: addedWaypoints, updated: updatedWaypoints },
            routes: { added: addedRoutes, updated: updatedRoutes }
        };
    }

    /**
     * Quick import - automatically resolve all conflicts (add new, skip existing)
     */
    async function quickImport(importedPlan) {
        const conflicts = analyzeConflicts(importedPlan);
        const resolutions = {};

        // Skip all conflicts, add all new items
        conflicts.waypoints.forEach(c => {
            resolutions[`waypoint_${c.imported.id}`] = 'skip';
        });
        conflicts.routes.forEach(c => {
            resolutions[`route_${c.imported.id}`] = 'skip';
        });
        conflicts.newWaypoints.forEach(w => {
            resolutions[`waypoint_${w.id}`] = 'add';
        });
        conflicts.newRoutes.forEach(r => {
            resolutions[`route_${r.id}`] = 'add';
        });

        return mergePlan(importedPlan, resolutions);
    }

    /**
     * Generate a shareable summary of the plan (for mesh/SMS)
     */
    function generatePlanSummary(options = {}) {
        const waypoints = State.get('waypoints') || [];
        const routes = State.get('routes') || [];
        
        let summary = `GDPLAN|v${PLAN_VERSION}|`;
        summary += `W:${waypoints.length}|R:${routes.length}|`;
        summary += `CK:${generateChecksum(waypoints, routes)}|`;
        summary += `T:${Math.floor(Date.now() / 1000)}`;
        
        return summary;
    }

    /**
     * Parse a plan summary (received via mesh/SMS)
     */
    function parsePlanSummary(summary) {
        const parts = summary.split('|');
        if (parts[0] !== 'GDPLAN') return null;
        
        return {
            version: parts[1]?.replace('v', ''),
            waypointCount: parseInt(parts[2]?.replace('W:', '') || 0),
            routeCount: parseInt(parts[3]?.replace('R:', '') || 0),
            checksum: parts[4]?.replace('CK:', ''),
            timestamp: parseInt(parts[5]?.replace('T:', '') || 0) * 1000
        };
    }

    /**
     * Check if local plan matches a summary
     */
    function planMatchesSummary(summary) {
        const parsed = typeof summary === 'string' ? parsePlanSummary(summary) : summary;
        if (!parsed) return false;

        const waypoints = State.get('waypoints') || [];
        const routes = State.get('routes') || [];
        const localChecksum = generateChecksum(waypoints, routes);

        return localChecksum === parsed.checksum;
    }

    // Public API
    return {
        // Export functions
        exportPlan,
        exportPlanUnencrypted,
        downloadPlan,
        createPlanPackage,
        
        // Import functions
        parsePlanFile,
        analyzeConflicts,
        mergePlan,
        quickImport,
        
        // Summary functions (for mesh sharing)
        generatePlanSummary,
        parsePlanSummary,
        planMatchesSummary,
        
        // Utilities
        generateChecksum,
        
        // Constants
        PLAN_VERSION
    };
})();

window.PlanSharingModule = PlanSharingModule;
