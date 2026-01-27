/**
 * GridDown Constants - Configuration and Data Definitions
 */
const Constants = (function() {
    'use strict';

    /**
     * Waypoint type definitions with structured field schemas
     * Each type has: icon, label, color, and fields array
     * Field types: text, number, select, checkbox, date, textarea
     */
    const WAYPOINT_TYPES = {
        water: { 
            icon: '💧', 
            label: 'Water Source', 
            color: '#3B82F6',
            fields: [
                { 
                    key: 'flowRate', 
                    label: 'Flow Rate', 
                    type: 'select',
                    options: [
                        { value: '', label: 'Unknown' },
                        { value: 'trickle', label: 'Trickle (<0.5 GPM)' },
                        { value: 'low', label: 'Low (0.5-2 GPM)' },
                        { value: 'moderate', label: 'Moderate (2-5 GPM)' },
                        { value: 'good', label: 'Good (5-10 GPM)' },
                        { value: 'excellent', label: 'Excellent (>10 GPM)' }
                    ]
                },
                { 
                    key: 'treatmentRequired', 
                    label: 'Treatment Required', 
                    type: 'select',
                    options: [
                        { value: 'unknown', label: 'Unknown' },
                        { value: 'none', label: 'None (Potable)' },
                        { value: 'filter', label: 'Filter Recommended' },
                        { value: 'treat', label: 'Filter + Chemical/UV' },
                        { value: 'boil', label: 'Boil Required' }
                    ]
                },
                { 
                    key: 'reliability', 
                    label: 'Seasonal Reliability', 
                    type: 'select',
                    options: [
                        { value: 'unknown', label: 'Unknown' },
                        { value: 'perennial', label: 'Year-round (Perennial)' },
                        { value: 'seasonal', label: 'Seasonal (Spring/Summer)' },
                        { value: 'intermittent', label: 'Intermittent (After Rain)' },
                        { value: 'dry', label: 'Often Dry' }
                    ]
                },
                { 
                    key: 'sourceType', 
                    label: 'Source Type', 
                    type: 'select',
                    options: [
                        { value: 'stream', label: 'Stream/Creek' },
                        { value: 'river', label: 'River' },
                        { value: 'spring', label: 'Spring' },
                        { value: 'lake', label: 'Lake/Pond' },
                        { value: 'well', label: 'Well' },
                        { value: 'tank', label: 'Tank/Cistern' },
                        { value: 'faucet', label: 'Faucet/Spigot' },
                        { value: 'other', label: 'Other' }
                    ]
                },
                { key: 'lastVerified', label: 'Last Verified', type: 'date' }
            ]
        },
        fuel: { 
            icon: '⛽', 
            label: 'Fuel Cache/Station', 
            color: '#F59E0B',
            fields: [
                { 
                    key: 'fuelType', 
                    label: 'Fuel Type', 
                    type: 'select',
                    options: [
                        { value: 'gasoline', label: 'Gasoline (Regular)' },
                        { value: 'premium', label: 'Gasoline (Premium)' },
                        { value: 'diesel', label: 'Diesel' },
                        { value: 'e85', label: 'E85 Ethanol' },
                        { value: 'propane', label: 'Propane' },
                        { value: 'mixed', label: 'Multiple Types' }
                    ]
                },
                { 
                    key: 'quantity', 
                    label: 'Quantity (gallons)', 
                    type: 'number',
                    placeholder: 'Leave blank if station'
                },
                { 
                    key: 'cacheType', 
                    label: 'Type', 
                    type: 'select',
                    options: [
                        { value: 'station', label: 'Gas Station' },
                        { value: 'cache', label: 'Pre-positioned Cache' },
                        { value: 'private', label: 'Private (Permission Req.)' },
                        { value: 'emergency', label: 'Emergency Reserve Only' }
                    ]
                },
                { key: 'hours', label: 'Operating Hours', type: 'text', placeholder: 'e.g., 24/7 or 6am-10pm' },
                { 
                    key: 'payment', 
                    label: 'Payment Methods', 
                    type: 'select',
                    options: [
                        { value: 'any', label: 'Cash & Card' },
                        { value: 'card', label: 'Card Only' },
                        { value: 'cash', label: 'Cash Only' },
                        { value: 'none', label: 'N/A (Cache)' }
                    ]
                },
                { key: 'expirationDate', label: 'Expiration Date', type: 'date', placeholder: 'For caches' },
                { key: 'lastVerified', label: 'Last Verified', type: 'date' }
            ]
        },
        camp: { 
            icon: '🏕️', 
            label: 'Camp Site', 
            color: '#10B981',
            fields: [
                { 
                    key: 'capacity', 
                    label: 'Capacity', 
                    type: 'select',
                    options: [
                        { value: 'solo', label: '1-2 people' },
                        { value: 'small', label: '3-4 people' },
                        { value: 'medium', label: '5-8 people' },
                        { value: 'large', label: '9+ people' },
                        { value: 'group', label: 'Large group site' }
                    ]
                },
                { 
                    key: 'cover', 
                    label: 'Cover/Shelter', 
                    type: 'select',
                    options: [
                        { value: 'none', label: 'None (Exposed)' },
                        { value: 'partial', label: 'Partial (Some trees)' },
                        { value: 'good', label: 'Good (Tree cover)' },
                        { value: 'excellent', label: 'Excellent (Dense cover)' },
                        { value: 'structure', label: 'Structure available' }
                    ]
                },
                { 
                    key: 'waterProximity', 
                    label: 'Water Proximity', 
                    type: 'select',
                    options: [
                        { value: 'none', label: 'None nearby' },
                        { value: 'far', label: '>0.5 mile' },
                        { value: 'moderate', label: '0.1-0.5 mile' },
                        { value: 'close', label: '<500 ft' },
                        { value: 'onsite', label: 'On-site' }
                    ]
                },
                { 
                    key: 'cellSignal', 
                    label: 'Cell Signal', 
                    type: 'select',
                    options: [
                        { value: 'none', label: 'No signal' },
                        { value: 'weak', label: 'Weak (1 bar)' },
                        { value: 'moderate', label: 'Moderate (2-3 bars)' },
                        { value: 'good', label: 'Good (4+ bars)' },
                        { value: 'unknown', label: 'Unknown' }
                    ]
                },
                { 
                    key: 'legality', 
                    label: 'Legality', 
                    type: 'select',
                    options: [
                        { value: 'legal', label: 'Legal (Designated site)' },
                        { value: 'dispersed', label: 'Dispersed (Legal)' },
                        { value: 'permitted', label: 'Permit Required' },
                        { value: 'private', label: 'Private (Permission Req.)' },
                        { value: 'prohibited', label: 'Prohibited' },
                        { value: 'unknown', label: 'Unknown' }
                    ]
                },
                { 
                    key: 'terrain', 
                    label: 'Ground Type', 
                    type: 'select',
                    options: [
                        { value: 'flat', label: 'Flat & Clear' },
                        { value: 'sloped', label: 'Slightly Sloped' },
                        { value: 'rocky', label: 'Rocky' },
                        { value: 'sandy', label: 'Sandy' },
                        { value: 'grassy', label: 'Grassy' }
                    ]
                },
                { key: 'fireAllowed', label: 'Fires Allowed', type: 'checkbox' },
                { key: 'lastVerified', label: 'Last Verified', type: 'date' }
            ]
        },
        resupply: { 
            icon: '🏪', 
            label: 'Resupply Point', 
            color: '#8B5CF6',
            fields: [
                { 
                    key: 'storeType', 
                    label: 'Store Type', 
                    type: 'select',
                    options: [
                        { value: 'convenience', label: 'Convenience Store' },
                        { value: 'grocery', label: 'Grocery Store' },
                        { value: 'supermarket', label: 'Supermarket' },
                        { value: 'outfitter', label: 'Outdoor/Outfitter' },
                        { value: 'hardware', label: 'Hardware Store' },
                        { value: 'general', label: 'General Store' },
                        { value: 'restaurant', label: 'Restaurant/Food' },
                        { value: 'other', label: 'Other' }
                    ]
                },
                { key: 'hours', label: 'Operating Hours', type: 'text', placeholder: 'e.g., 7am-9pm or 24/7' },
                { key: 'phone', label: 'Phone Number', type: 'text', placeholder: 'Optional' },
                { 
                    key: 'inventory', 
                    label: 'Inventory Notes', 
                    type: 'textarea',
                    placeholder: 'What supplies are available? Any limitations?'
                },
                { 
                    key: 'services', 
                    label: 'Services Available', 
                    type: 'select',
                    options: [
                        { value: 'basic', label: 'Basic supplies only' },
                        { value: 'full', label: 'Full grocery' },
                        { value: 'outdoor', label: 'Outdoor gear' },
                        { value: 'fuel', label: 'Includes fuel' },
                        { value: 'medical', label: 'Medical supplies' }
                    ]
                },
                { key: 'lastVerified', label: 'Last Verified', type: 'date' }
            ]
        },
        hazard: { 
            icon: '⚠️', 
            label: 'Hazard', 
            color: '#EF4444',
            fields: [
                { 
                    key: 'hazardType', 
                    label: 'Hazard Type', 
                    type: 'select',
                    options: [
                        { value: 'road', label: 'Road Damage/Washout' },
                        { value: 'bridge', label: 'Bridge Out/Damaged' },
                        { value: 'flood', label: 'Flood Risk Area' },
                        { value: 'rockfall', label: 'Rockfall/Landslide' },
                        { value: 'wildlife', label: 'Wildlife Hazard' },
                        { value: 'vegetation', label: 'Overgrown/Blocked' },
                        { value: 'terrain', label: 'Difficult Terrain' },
                        { value: 'crime', label: 'Security Concern' },
                        { value: 'closure', label: 'Road/Area Closure' },
                        { value: 'other', label: 'Other' }
                    ]
                },
                { 
                    key: 'severity', 
                    label: 'Severity', 
                    type: 'select',
                    options: [
                        { value: 'info', label: 'Info (Awareness only)' },
                        { value: 'caution', label: 'Caution (Proceed carefully)' },
                        { value: 'warning', label: 'Warning (May be impassable)' },
                        { value: 'danger', label: 'Danger (High risk)' },
                        { value: 'impassable', label: 'Impassable (Blocked)' }
                    ]
                },
                { 
                    key: 'seasonal', 
                    label: 'Seasonal', 
                    type: 'select',
                    options: [
                        { value: 'permanent', label: 'Permanent/Year-round' },
                        { value: 'winter', label: 'Winter Only' },
                        { value: 'spring', label: 'Spring (Snowmelt/Rain)' },
                        { value: 'summer', label: 'Summer Only' },
                        { value: 'wet', label: 'Wet Weather Only' },
                        { value: 'variable', label: 'Variable/Unpredictable' }
                    ]
                },
                { 
                    key: 'vehicleImpact', 
                    label: 'Vehicle Impact', 
                    type: 'select',
                    options: [
                        { value: 'all', label: 'All vehicles affected' },
                        { value: '4x4', label: '4x4/High clearance only' },
                        { value: 'atv', label: 'ATV/Motorcycle only' },
                        { value: 'foot', label: 'Foot traffic only' },
                        { value: 'none', label: 'Not passable' }
                    ]
                },
                { key: 'lastVerified', label: 'Last Verified', type: 'date' }
            ]
        },
        bailout: { 
            icon: '🚁', 
            label: 'Bail-out Point', 
            color: '#EC4899',
            fields: [
                { 
                    key: 'accessType', 
                    label: 'Access to Civilization', 
                    type: 'select',
                    options: [
                        { value: 'highway', label: 'Major Highway' },
                        { value: 'paved', label: 'Paved Road' },
                        { value: 'maintained', label: 'Maintained Dirt Road' },
                        { value: 'trail', label: 'Trail/4x4 Only' },
                        { value: 'helicopter', label: 'Helicopter LZ Only' }
                    ]
                },
                { 
                    key: 'emsResponse', 
                    label: 'EMS Response Time', 
                    type: 'select',
                    options: [
                        { value: 'immediate', label: '<15 minutes' },
                        { value: 'quick', label: '15-30 minutes' },
                        { value: 'moderate', label: '30-60 minutes' },
                        { value: 'delayed', label: '1-2 hours' },
                        { value: 'remote', label: '>2 hours' },
                        { value: 'unknown', label: 'Unknown' }
                    ]
                },
                { 
                    key: 'nearestTown', 
                    label: 'Nearest Town', 
                    type: 'text',
                    placeholder: 'Town name and distance'
                },
                { 
                    key: 'cellSignal', 
                    label: 'Cell Signal', 
                    type: 'select',
                    options: [
                        { value: 'none', label: 'No signal' },
                        { value: 'weak', label: 'Weak (1 bar)' },
                        { value: 'moderate', label: 'Moderate (2-3 bars)' },
                        { value: 'good', label: 'Good (4+ bars)' },
                        { value: 'unknown', label: 'Unknown' }
                    ]
                },
                { 
                    key: 'services', 
                    label: 'Nearby Services', 
                    type: 'select',
                    options: [
                        { value: 'full', label: 'Full services (Hospital, etc.)' },
                        { value: 'medical', label: 'Medical clinic' },
                        { value: 'basic', label: 'Basic (Gas, food)' },
                        { value: 'minimal', label: 'Minimal' },
                        { value: 'none', label: 'None' }
                    ]
                },
                { key: 'emergencyPhone', label: 'Emergency Contact', type: 'text', placeholder: 'Local emergency number' },
                { key: 'helicopterLZ', label: 'Helicopter LZ Available', type: 'checkbox' },
                { key: 'lastVerified', label: 'Last Verified', type: 'date' }
            ]
        },
        custom: { 
            icon: '📍', 
            label: 'Custom POI', 
            color: '#6B7280',
            fields: [
                { key: 'category', label: 'Category', type: 'text', placeholder: 'Custom category' },
                { key: 'lastVerified', label: 'Last Verified', type: 'date' }
            ]
        }
    };

    const VEHICLE_PROFILES = {
        truck: { name: '4x4 Truck', fuelCapacity: 30, mpgRoad: 18, mpgTrail: 10, mpgCrawl: 5 },
        jeep: { name: 'Jeep/SUV', fuelCapacity: 22, mpgRoad: 20, mpgTrail: 12, mpgCrawl: 6 },
        atv: { name: 'ATV/UTV', fuelCapacity: 8, mpgRoad: 30, mpgTrail: 25, mpgCrawl: 18 },
        foot: { name: 'On Foot', waterPerDay: 4, milesPerDay: 15, caloriesPerDay: 3500 }
    };

    const NAV_ITEMS = [
        { id: 'sos', icon: 'sos', label: 'SOS' },
        { id: 'map', icon: 'map', label: 'Map' },
        { id: 'navigation', icon: 'navigation', label: 'Navigate' },
        { id: 'waypoints', icon: 'waypoint', label: 'Waypoints' },
        { id: 'routes', icon: 'route', label: 'Routes' },
        { id: 'logistics', icon: 'logistics', label: 'Logistics' },
        { id: 'contingency', icon: 'shield', label: 'Planning' },
        { id: 'weather', icon: 'weather', label: 'Weather' },
        { id: 'sunmoon', icon: 'sun', label: 'Sun/Moon' },
        { id: 'gps', icon: 'locate', label: 'GPS' },
        { id: 'coords', icon: 'crosshair', label: 'Coords' },
        { id: 'radio', icon: 'antenna', label: 'Radio' },
        { id: 'comms', icon: 'radio', label: 'Comms' },
        { id: 'medical', icon: 'medical', label: 'Medical' },
        { id: 'fieldguides', icon: 'book', label: 'Field Guides' },
        { id: 'terrain', icon: 'mountain', label: 'Terrain' },
        { id: 'offline', icon: 'download', label: 'Offline' },
        { id: 'team', icon: 'team', label: 'Team' },
        { id: 'rfsentinel', icon: 'radar', label: 'RF Sentinel' }
    ];

    const MAP_LAYERS = [
        { key: 'terrain', label: 'Terrain', icon: 'terrain' },
        { key: 'satellite', label: 'Satellite', icon: 'satellite' },
        { key: 'contours', label: 'Contour Lines', icon: 'layers' },
        { key: 'grid', label: 'Grid', icon: 'map' }
    ];

    const DEFAULT_MAP_REGIONS = [
        { id: 'r1', name: 'Sierra Nevada - North', size: '847 MB', bounds: '38.5°N - 40°N', status: 'downloaded', lastSync: '2025-01-15' },
        { id: 'r2', name: 'Sierra Nevada - South', size: '723 MB', bounds: '36°N - 38.5°N', status: 'downloaded', lastSync: '2025-01-10' },
        { id: 'r3', name: 'Mojave Desert', size: '512 MB', bounds: '34°N - 36°N', status: 'pending', lastSync: null },
        { id: 'r4', name: 'Death Valley', size: '389 MB', bounds: '35.5°N - 37.5°N', status: 'available', lastSync: null }
    ];

    // Sample waypoints with structured data
    const SAMPLE_WAYPOINTS = [
        { 
            id: '1', 
            name: 'Basecamp Alpha', 
            type: 'camp', 
            x: 25, 
            y: 65, 
            notes: 'Good cover, near water', 
            verified: true,
            confidence: 5,
            visibility: 'team',
            // Structured fields
            capacity: 'medium',
            cover: 'good',
            waterProximity: 'close',
            cellSignal: 'none',
            legality: 'dispersed',
            terrain: 'flat',
            fireAllowed: true,
            lastVerified: '2025-01-10'
        },
        { 
            id: '2', 
            name: 'Eagle Creek', 
            type: 'water', 
            x: 35, 
            y: 48, 
            notes: 'Filter required, seasonal flow', 
            verified: true,
            confidence: 4,
            visibility: 'community',
            createdBy: 'TrailRunner42',
            source: 'community',
            sharedAt: '2024-12-15T10:30:00Z',
            // Structured fields
            flowRate: 'moderate',
            treatmentRequired: 'filter',
            reliability: 'seasonal',
            sourceType: 'stream',
            lastVerified: '2025-01-08'
        },
        { 
            id: '3', 
            name: 'Summit Cache', 
            type: 'fuel', 
            x: 55, 
            y: 35, 
            notes: '5 gal diesel, expires 2025-06', 
            verified: false,
            confidence: 2,
            visibility: 'private',
            // Structured fields
            fuelType: 'diesel',
            quantity: 5,
            cacheType: 'cache',
            payment: 'none',
            expirationDate: '2025-06-01'
        },
        { 
            id: '4', 
            name: 'Washout Zone', 
            type: 'hazard', 
            x: 68, 
            y: 45, 
            notes: 'Deep ruts after rain', 
            verified: true,
            confidence: 4,
            visibility: 'community',
            createdBy: 'OffRoad_Mike',
            source: 'community',
            sharedAt: '2025-01-05T14:22:00Z',
            // Structured fields
            hazardType: 'road',
            severity: 'warning',
            seasonal: 'wet',
            vehicleImpact: '4x4',
            lastVerified: '2025-01-15'
        },
        { 
            id: '5', 
            name: 'Highway Junction', 
            type: 'bailout', 
            x: 85, 
            y: 22, 
            notes: 'Cell signal, 20 min to town', 
            verified: true,
            confidence: 5,
            visibility: 'team',
            // Structured fields
            accessType: 'paved',
            emsResponse: 'quick',
            nearestTown: 'Pine Valley - 8 miles',
            cellSignal: 'good',
            services: 'basic',
            helicopterLZ: true,
            lastVerified: '2025-01-12'
        }
    ];

    const SAMPLE_ROUTES = [
        { id: 'r1', name: 'Sierra Traverse', distance: '45.2', duration: '6.5h', elevation: '3,200', points: [{ x: 25, y: 65 }, { x: 35, y: 48 }, { x: 55, y: 35 }, { x: 85, y: 22 }] }
    ];

    const SAMPLE_TEAM = [
        { id: 1, name: 'Alpha-1 (You)', status: 'active', lastUpdate: 'Now', lat: 37.4, lon: -119.2 },
        { id: 2, name: 'Bravo-2', status: 'active', lastUpdate: '2 min ago', lat: 37.42, lon: -119.18 },
        { id: 3, name: 'Charlie-3', status: 'stale', lastUpdate: '15 min ago', lat: 37.38, lon: -119.22 }
    ];

    /**
     * Helper to get field label for a value
     */
    function getFieldDisplayValue(type, fieldKey, value) {
        const typeConfig = WAYPOINT_TYPES[type];
        if (!typeConfig || !typeConfig.fields) return value;
        
        const field = typeConfig.fields.find(f => f.key === fieldKey);
        if (!field) return value;
        
        if (field.type === 'select' && field.options) {
            const option = field.options.find(o => o.value === value);
            return option ? option.label : value;
        }
        
        if (field.type === 'checkbox') {
            return value ? 'Yes' : 'No';
        }
        
        if (field.type === 'date' && value) {
            return new Date(value).toLocaleDateString();
        }
        
        return value;
    }

    // Confidence rating levels
    const CONFIDENCE_LEVELS = [
        { value: 1, label: 'Very Low', color: '#ef4444', description: 'Unverified rumor or very old data' },
        { value: 2, label: 'Low', color: '#f97316', description: 'Second-hand info or needs verification' },
        { value: 3, label: 'Medium', color: '#eab308', description: 'Reasonably reliable but not recent' },
        { value: 4, label: 'High', color: '#22c55e', description: 'Recently verified or reliable source' },
        { value: 5, label: 'Very High', color: '#10b981', description: 'Personally verified recently' }
    ];

    /**
     * Get confidence level info by rating value
     */
    function getConfidenceInfo(rating) {
        return CONFIDENCE_LEVELS.find(l => l.value === rating) || CONFIDENCE_LEVELS[2];
    }

    // Visibility options for waypoints
    const VISIBILITY_OPTIONS = {
        private: {
            label: 'Private',
            icon: '🔒',
            color: '#6b7280',
            description: 'Only visible to you'
        },
        team: {
            label: 'Team',
            icon: '👥',
            color: '#3b82f6',
            description: 'Shared with your team members'
        },
        community: {
            label: 'Community',
            icon: '🌐',
            color: '#10b981',
            description: 'Shared with the community'
        }
    };

    /**
     * Get visibility option info by key
     */
    function getVisibilityInfo(visibility) {
        return VISIBILITY_OPTIONS[visibility] || VISIBILITY_OPTIONS.private;
    }

    return { 
        WAYPOINT_TYPES, 
        VEHICLE_PROFILES, 
        NAV_ITEMS, 
        MAP_LAYERS, 
        DEFAULT_MAP_REGIONS, 
        SAMPLE_WAYPOINTS, 
        SAMPLE_ROUTES, 
        SAMPLE_TEAM,
        CONFIDENCE_LEVELS,
        VISIBILITY_OPTIONS,
        getFieldDisplayValue,
        getConfidenceInfo,
        getVisibilityInfo
    };
})();
window.Constants = Constants;
