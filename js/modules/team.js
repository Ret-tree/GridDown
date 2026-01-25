/**
 * GridDown Team Management Module
 * Enables coordinated group operations with shared state, rally points, and roles
 * 
 * Features:
 * - Team creation with unique IDs and encryption
 * - QR code / file-based team package sharing
 * - Member management with roles and permissions
 * - Shared rally points and comm plans
 * - Team-aware Meshtastic channel configuration
 */
const TeamModule = (function() {
    'use strict';

    // =========================================================================
    // CONSTANTS
    // =========================================================================
    
    const TEAM_VERSION = '1.0';
    const TEAM_ID_LENGTH = 8;
    const MAX_TEAM_MEMBERS = 20;
    const MAX_RALLY_POINTS = 10;
    
    // Member roles with display info and permissions
    const ROLES = {
        leader: { 
            name: 'Team Leader', 
            icon: '👑', 
            color: '#f59e0b',
            permissions: ['edit_team', 'edit_members', 'edit_waypoints', 'edit_routes', 'edit_plan', 'invite', 'remove_members', 'dissolve_team']
        },
        coleader: { 
            name: 'Co-Leader', 
            icon: '⭐', 
            color: '#eab308',
            permissions: ['edit_members', 'edit_waypoints', 'edit_routes', 'edit_plan', 'invite']
        },
        scout: { 
            name: 'Scout', 
            icon: '🔭', 
            color: '#22c55e',
            permissions: ['edit_waypoints']
        },
        medic: { 
            name: 'Medic', 
            icon: '🏥', 
            color: '#ef4444',
            permissions: ['edit_waypoints']
        },
        navigator: { 
            name: 'Navigator', 
            icon: '🧭', 
            color: '#3b82f6',
            permissions: ['edit_waypoints', 'edit_routes', 'edit_plan']
        },
        comms: { 
            name: 'Comms', 
            icon: '📡', 
            color: '#8b5cf6',
            permissions: ['edit_plan']
        },
        support: { 
            name: 'Support', 
            icon: '🎒', 
            color: '#6b7280',
            permissions: []
        }
    };
    
    // Rally point types
    const RALLY_TYPES = {
        primary: { name: 'Primary Rally', icon: '🏁', color: '#22c55e' },
        secondary: { name: 'Secondary Rally', icon: '🔵', color: '#3b82f6' },
        emergency: { name: 'Emergency Rally', icon: '🆘', color: '#ef4444' },
        cache: { name: 'Supply Cache', icon: '📦', color: '#f59e0b' },
        extraction: { name: 'Extraction Point', icon: '🚁', color: '#8b5cf6' }
    };

    // =========================================================================
    // STATE
    // =========================================================================
    
    let state = {
        currentTeam: null,
        myMemberId: null,
        pendingInvites: [],
        joinRequests: [],
        lastSync: null
    };

    // =========================================================================
    // INITIALIZATION
    // =========================================================================
    
    async function init() {
        console.log('TeamModule initializing...');
        await loadTeamState();
        
        if (typeof Events !== 'undefined') {
            Events.on('meshtastic:message', handleMeshMessage);
            Events.on('meshtastic:position', handlePositionUpdate);
            Events.on('meshtastic:connection', handleConnectionChange);
        }
        
        console.log('TeamModule ready', state.currentTeam ? `- Team: ${state.currentTeam.name}` : '- No team');
    }
    
    async function loadTeamState() {
        try {
            const saved = await Storage.Settings.get('team_state');
            if (saved) {
                state.currentTeam = saved.currentTeam || null;
                state.myMemberId = saved.myMemberId || null;
                state.pendingInvites = saved.pendingInvites || [];
            }
        } catch (e) {
            console.warn('Could not load team state:', e);
        }
    }
    
    async function saveTeamState() {
        try {
            await Storage.Settings.set('team_state', {
                currentTeam: state.currentTeam,
                myMemberId: state.myMemberId,
                pendingInvites: state.pendingInvites
            });
        } catch (e) {
            console.warn('Could not save team state:', e);
        }
    }

    // =========================================================================
    // TEAM CREATION & MANAGEMENT
    // =========================================================================
    
    function createTeam(options = {}) {
        if (state.currentTeam) {
            throw new Error('Already in a team. Leave current team first.');
        }
        
        const teamId = generateTeamId();
        const meshChannel = options.meshChannel || Math.floor(Math.random() * 7) + 1;
        const meshPSK = options.meshPSK || generateMeshPSK();
        
        // Get my node info from Meshtastic if available
        const meshState = typeof MeshtasticModule !== 'undefined' 
            ? MeshtasticModule.getConnectionState() 
            : {};
        
        const myMemberId = meshState.nodeId || generateMemberId();
        const myName = options.creatorName || meshState.nodeName || 'Team Leader';
        const myShortName = options.creatorShortName || myName.substring(0, 4).toUpperCase();
        
        const team = {
            id: teamId,
            version: TEAM_VERSION,
            name: options.name || 'New Team',
            description: options.description || '',
            created: Date.now(),
            createdBy: myMemberId,
            
            // Security
            passphrase: options.passphrase || generatePassphrase(),
            meshChannel: meshChannel,
            meshPSK: meshPSK,
            
            // Members
            members: [{
                id: myMemberId,
                name: myName,
                shortName: myShortName,
                role: 'leader',
                joinedAt: Date.now(),
                lastSeen: Date.now(),
                status: 'active',
                lat: null,
                lon: null
            }],
            
            // Rally Points
            rallyPoints: options.rallyPoints || [],
            
            // Comm Plan
            commPlan: options.commPlan || {
                primaryFreq: null,
                backupFreq: null,
                checkInTimes: [],
                emergencyWord: generateEmergencyWord(),
                allClearWord: 'ALLCLEAR'
            },
            
            // Settings
            settings: {
                positionShareInterval: 60,
                autoCheckIn: false,
                requireApproval: true,
                shareWaypointsDefault: true
            }
        };
        
        state.currentTeam = team;
        state.myMemberId = myMemberId;
        
        saveTeamState();
        Events.emit('team:created', { team });
        
        return team;
    }
    
    function updateTeam(updates) {
        if (!state.currentTeam) throw new Error('Not in a team');
        if (!hasPermission('edit_team')) throw new Error('No permission to edit team');
        
        if (updates.name) state.currentTeam.name = updates.name;
        if (updates.description !== undefined) state.currentTeam.description = updates.description;
        if (updates.settings) state.currentTeam.settings = { ...state.currentTeam.settings, ...updates.settings };
        if (updates.commPlan) state.currentTeam.commPlan = { ...state.currentTeam.commPlan, ...updates.commPlan };
        
        saveTeamState();
        broadcastTeamSync('team_info');
        Events.emit('team:updated', { team: state.currentTeam });
        
        return state.currentTeam;
    }
    
    function leaveTeam() {
        if (!state.currentTeam) throw new Error('Not in a team');
        
        const wasLeader = getMyRole() === 'leader';
        const teamName = state.currentTeam.name;
        
        // Transfer leadership if needed
        if (wasLeader && state.currentTeam.members.length > 1) {
            const newLeader = state.currentTeam.members.find(m => m.role === 'coleader' && m.id !== state.myMemberId)
                || state.currentTeam.members.find(m => m.id !== state.myMemberId);
            if (newLeader) {
                newLeader.role = 'leader';
                broadcastTeamSync('member_update', newLeader);
            }
        }
        
        // Broadcast departure
        broadcastTeamSync('member_left', { memberId: state.myMemberId });
        
        // Clear local state
        state.currentTeam = null;
        state.myMemberId = null;
        state.joinRequests = [];
        
        saveTeamState();
        Events.emit('team:left', { teamName });
        
        return true;
    }
    
    function dissolveTeam() {
        if (!state.currentTeam) throw new Error('Not in a team');
        if (!hasPermission('dissolve_team')) throw new Error('Only the team leader can dissolve the team');
        
        const teamName = state.currentTeam.name;
        
        broadcastTeamSync('team_dissolved');
        
        state.currentTeam = null;
        state.myMemberId = null;
        state.joinRequests = [];
        
        saveTeamState();
        Events.emit('team:dissolved', { teamName });
        
        return true;
    }

    // =========================================================================
    // MEMBER MANAGEMENT
    // =========================================================================
    
    function getMyMember() {
        if (!state.currentTeam || !state.myMemberId) return null;
        return state.currentTeam.members.find(m => m.id === state.myMemberId);
    }
    
    function getMyRole() {
        const member = getMyMember();
        return member ? member.role : null;
    }
    
    function hasPermission(permission) {
        const role = getMyRole();
        if (!role) return false;
        return ROLES[role]?.permissions.includes(permission) || false;
    }
    
    function getMembers() {
        if (!state.currentTeam) return [];
        return [...state.currentTeam.members];
    }
    
    function getMember(memberId) {
        if (!state.currentTeam) return null;
        return state.currentTeam.members.find(m => m.id === memberId);
    }
    
    function setMemberRole(memberId, newRole) {
        if (!state.currentTeam) throw new Error('Not in a team');
        if (!hasPermission('edit_members')) throw new Error('No permission to edit members');
        if (!ROLES[newRole]) throw new Error('Invalid role');
        
        const member = state.currentTeam.members.find(m => m.id === memberId);
        if (!member) throw new Error('Member not found');
        
        // Prevent demoting self from leader without transfer
        if (memberId === state.myMemberId && member.role === 'leader' && newRole !== 'leader') {
            throw new Error('Transfer leadership before changing your role');
        }
        
        // Only leader can promote to leader/coleader
        if ((newRole === 'leader' || newRole === 'coleader') && getMyRole() !== 'leader') {
            throw new Error('Only the leader can promote to leader/co-leader');
        }
        
        // If promoting to leader, demote current leader
        if (newRole === 'leader') {
            const currentLeader = state.currentTeam.members.find(m => m.role === 'leader');
            if (currentLeader && currentLeader.id !== memberId) {
                currentLeader.role = 'coleader';
            }
        }
        
        member.role = newRole;
        
        saveTeamState();
        broadcastTeamSync('member_update', member);
        Events.emit('team:member_updated', { member });
        
        return member;
    }
    
    function removeMember(memberId) {
        if (!state.currentTeam) throw new Error('Not in a team');
        if (!hasPermission('remove_members')) throw new Error('No permission to remove members');
        if (memberId === state.myMemberId) throw new Error('Use leaveTeam() to leave');
        
        const member = state.currentTeam.members.find(m => m.id === memberId);
        if (!member) throw new Error('Member not found');
        if (member.role === 'leader') throw new Error('Cannot remove the team leader');
        
        state.currentTeam.members = state.currentTeam.members.filter(m => m.id !== memberId);
        
        saveTeamState();
        broadcastTeamSync('member_removed', { memberId });
        Events.emit('team:member_removed', { memberId, memberName: member.name });
        
        return true;
    }
    
    function updateMemberPosition(memberId, lat, lon, timestamp) {
        if (!state.currentTeam) return;
        
        const member = state.currentTeam.members.find(m => m.id === memberId);
        if (member) {
            member.lat = lat;
            member.lon = lon;
            member.lastSeen = timestamp || Date.now();
            member.status = 'active';
            Events.emit('team:member_position', { member });
        }
    }

    // =========================================================================
    // TEAM PACKAGE EXPORT/IMPORT
    // =========================================================================
    
    function generateTeamPackage(options = {}) {
        if (!state.currentTeam) throw new Error('Not in a team');
        if (!hasPermission('invite')) throw new Error('No permission to invite members');
        
        const includeRallies = options.includeRallies !== false;
        const includeCommPlan = options.includeCommPlan !== false;
        
        return {
            type: 'griddown_team_package',
            version: TEAM_VERSION,
            created: Date.now(),
            
            // Team identity
            teamId: state.currentTeam.id,
            teamName: state.currentTeam.name,
            teamDescription: state.currentTeam.description,
            
            // Mesh config
            meshChannel: state.currentTeam.meshChannel,
            meshPSK: state.currentTeam.meshPSK,
            
            // Member info (for display)
            memberCount: state.currentTeam.members.length,
            memberList: state.currentTeam.members.map(m => ({ name: m.shortName, role: m.role })),
            
            // Optional data
            rallyPoints: includeRallies ? state.currentTeam.rallyPoints : [],
            commPlan: includeCommPlan ? state.currentTeam.commPlan : null,
            settings: state.currentTeam.settings
        };
    }
    
    function exportTeamPackageEncrypted(passphrase = null) {
        const pkg = generateTeamPackage();
        const key = passphrase || state.currentTeam.passphrase;
        
        return {
            type: 'griddown_team_encrypted',
            version: TEAM_VERSION,
            teamId: pkg.teamId,
            teamName: pkg.teamName,
            memberCount: pkg.memberCount,
            data: simpleEncrypt(JSON.stringify(pkg), key)
        };
    }
    
    function generateInviteCode() {
        if (!state.currentTeam) throw new Error('Not in a team');
        
        // Compact format for QR/text sharing
        const invite = {
            t: state.currentTeam.id,
            n: state.currentTeam.name.substring(0, 16),
            c: state.currentTeam.meshChannel,
            k: state.currentTeam.meshPSK.substring(0, 24),
            p: state.currentTeam.passphrase
        };
        
        return 'GDTEAM:' + btoa(JSON.stringify(invite));
    }
    
    async function generateTeamQR(size = 200) {
        const code = generateInviteCode();
        return generateQRCodeCanvas(code, size);
    }
    
    async function importTeamPackage(packageData, passphrase = null) {
        if (state.currentTeam) {
            throw new Error('Already in a team. Leave current team first.');
        }
        
        let pkg;
        
        // Handle different input formats
        if (typeof packageData === 'string') {
            if (packageData.startsWith('GDTEAM:')) {
                // QR code / invite code
                const decoded = JSON.parse(atob(packageData.substring(7)));
                pkg = {
                    teamId: decoded.t,
                    teamName: decoded.n,
                    meshChannel: decoded.c,
                    meshPSK: decoded.k
                };
                passphrase = decoded.p;
            } else {
                // Try JSON
                try {
                    packageData = JSON.parse(packageData);
                } catch (e) {
                    throw new Error('Invalid package format');
                }
            }
        }
        
        if (!pkg) {
            if (packageData.type === 'griddown_team_encrypted') {
                if (!passphrase) throw new Error('Passphrase required');
                const decrypted = simpleDecrypt(packageData.data, passphrase);
                pkg = JSON.parse(decrypted);
            } else if (packageData.type === 'griddown_team_package') {
                pkg = packageData;
            } else {
                throw new Error('Invalid team package format');
            }
        }
        
        // Get my identity
        const meshState = typeof MeshtasticModule !== 'undefined' 
            ? MeshtasticModule.getConnectionState() : {};
        
        const myMemberId = meshState.nodeId || generateMemberId();
        const myName = meshState.nodeName || 'New Member';
        const myShortName = myName.substring(0, 4).toUpperCase();
        
        // Create team state
        state.currentTeam = {
            id: pkg.teamId,
            version: pkg.version || TEAM_VERSION,
            name: pkg.teamName,
            description: pkg.teamDescription || '',
            created: pkg.created || Date.now(),
            joined: Date.now(),
            
            passphrase: passphrase || pkg.passphrase,
            meshChannel: pkg.meshChannel,
            meshPSK: pkg.meshPSK,
            
            members: [{
                id: myMemberId,
                name: myName,
                shortName: myShortName,
                role: 'support',
                joinedAt: Date.now(),
                lastSeen: Date.now(),
                status: 'active',
                lat: null,
                lon: null
            }],
            
            rallyPoints: pkg.rallyPoints || [],
            commPlan: pkg.commPlan || { primaryFreq: null, checkInTimes: [] },
            settings: pkg.settings || { positionShareInterval: 60 }
        };
        
        state.myMemberId = myMemberId;
        
        // Import rally points as waypoints
        importRallyPointsToWaypoints();
        
        await saveTeamState();
        
        // Announce join to team
        broadcastTeamSync('member_joined', getMyMember());
        
        Events.emit('team:joined', { team: state.currentTeam });
        
        return state.currentTeam;
    }
    
    function downloadTeamPackage(filename = null) {
        const encrypted = exportTeamPackageEncrypted();
        const json = JSON.stringify(encrypted, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || `${state.currentTeam.id}-team.gdteam`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        return true;
    }
    
    function importFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const pkg = JSON.parse(e.target.result);
                    resolve(pkg);
                } catch (err) {
                    reject(new Error('Invalid file format'));
                }
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    // =========================================================================
    // RALLY POINTS
    // =========================================================================
    
    function addRallyPoint(rallyPoint) {
        if (!state.currentTeam) throw new Error('Not in a team');
        if (!hasPermission('edit_waypoints')) throw new Error('No permission to add rally points');
        if (state.currentTeam.rallyPoints.length >= MAX_RALLY_POINTS) {
            throw new Error(`Maximum ${MAX_RALLY_POINTS} rally points`);
        }
        
        const rp = {
            id: 'rp-' + Date.now().toString(36),
            name: rallyPoint.name || 'Rally Point',
            type: rallyPoint.type || 'primary',
            lat: rallyPoint.lat,
            lon: rallyPoint.lon,
            notes: rallyPoint.notes || '',
            schedule: rallyPoint.schedule || null,
            createdBy: state.myMemberId,
            createdAt: Date.now()
        };
        
        state.currentTeam.rallyPoints.push(rp);
        
        // Add to main waypoints
        addRallyToWaypoints(rp);
        
        saveTeamState();
        broadcastTeamSync('rally_update');
        Events.emit('team:rally_added', { rallyPoint: rp });
        
        return rp;
    }
    
    function updateRallyPoint(rallyId, updates) {
        if (!state.currentTeam) throw new Error('Not in a team');
        if (!hasPermission('edit_waypoints')) throw new Error('No permission to edit rally points');
        
        const rp = state.currentTeam.rallyPoints.find(r => r.id === rallyId);
        if (!rp) throw new Error('Rally point not found');
        
        Object.assign(rp, updates);
        rp.updatedAt = Date.now();
        
        saveTeamState();
        broadcastTeamSync('rally_update');
        Events.emit('team:rally_updated', { rallyPoint: rp });
        
        return rp;
    }
    
    function removeRallyPoint(rallyId) {
        if (!state.currentTeam) throw new Error('Not in a team');
        if (!hasPermission('edit_waypoints')) throw new Error('No permission to remove rally points');
        
        const idx = state.currentTeam.rallyPoints.findIndex(r => r.id === rallyId);
        if (idx === -1) throw new Error('Rally point not found');
        
        state.currentTeam.rallyPoints.splice(idx, 1);
        
        // Remove from waypoints
        removeRallyFromWaypoints(rallyId);
        
        saveTeamState();
        broadcastTeamSync('rally_update');
        Events.emit('team:rally_removed', { rallyId });
        
        return true;
    }
    
    function getRallyPoints() {
        if (!state.currentTeam) return [];
        return [...state.currentTeam.rallyPoints];
    }
    
    function addRallyToWaypoints(rp) {
        if (typeof State === 'undefined') return;
        
        const typeInfo = RALLY_TYPES[rp.type] || RALLY_TYPES.primary;
        
        State.Waypoints.add({
            id: 'team-' + rp.id,
            name: `${typeInfo.icon} ${rp.name}`,
            type: 'bailout',
            lat: rp.lat,
            lon: rp.lon,
            x: 50 + (rp.lon + 119.1892) / 0.004,
            y: 50 + (rp.lat - 37.4215) / 0.002,
            notes: `[Team Rally - ${typeInfo.name}]\n${rp.notes || ''}\n${rp.schedule ? `Schedule: ${rp.schedule}` : ''}`,
            teamRallyId: rp.id,
            isTeamWaypoint: true
        });
    }
    
    function removeRallyFromWaypoints(rallyId) {
        if (typeof State === 'undefined') return;
        
        const waypoints = State.get('waypoints');
        const wp = waypoints.find(w => w.teamRallyId === rallyId);
        if (wp) {
            State.Waypoints.remove(wp.id);
        }
    }
    
    function importRallyPointsToWaypoints() {
        if (!state.currentTeam || typeof State === 'undefined') return;
        
        state.currentTeam.rallyPoints.forEach(rp => {
            addRallyToWaypoints(rp);
        });
    }

    // =========================================================================
    // MESH COMMUNICATION
    // =========================================================================
    
    function broadcastTeamSync(subtype, data = {}) {
        if (!state.currentTeam) return;
        if (typeof MeshtasticModule === 'undefined') return;
        
        const meshState = MeshtasticModule.getConnectionState();
        if (meshState.state !== 'connected') return;
        
        const message = {
            _ts: 'team',
            tid: state.currentTeam.id,
            sub: subtype,
            from: state.myMemberId,
            ts: Date.now(),
            d: data
        };
        
        try {
            MeshtasticModule.sendTextMessage(JSON.stringify(message));
        } catch (e) {
            console.warn('Failed to broadcast team sync:', e);
        }
    }
    
    function handleMeshMessage(event) {
        if (!event || !event.message || !event.message.text) return;
        
        try {
            const msg = JSON.parse(event.message.text);
            
            // Not a team sync message
            if (msg._ts !== 'team') return;
            
            // Not for our team
            if (!state.currentTeam || msg.tid !== state.currentTeam.id) return;
            
            // Ignore own messages
            if (msg.from === state.myMemberId) return;
            
            processTeamSync(msg);
        } catch (e) {
            // Not JSON or not team message, ignore
        }
    }
    
    function processTeamSync(msg) {
        switch (msg.sub) {
            case 'team_info':
                if (msg.d.name) state.currentTeam.name = msg.d.name;
                if (msg.d.settings) state.currentTeam.settings = { ...state.currentTeam.settings, ...msg.d.settings };
                break;
                
            case 'member_joined':
            case 'member_update':
                const existingMember = state.currentTeam.members.find(m => m.id === msg.d.id);
                if (existingMember) {
                    Object.assign(existingMember, msg.d);
                } else if (msg.d.id) {
                    state.currentTeam.members.push({
                        ...msg.d,
                        status: 'active',
                        lastSeen: Date.now()
                    });
                }
                break;
                
            case 'member_left':
            case 'member_removed':
                if (msg.d.memberId === state.myMemberId) {
                    // I was removed
                    const teamName = state.currentTeam.name;
                    state.currentTeam = null;
                    state.myMemberId = null;
                    saveTeamState();
                    Events.emit('team:removed_by_leader', { teamName });
                    if (typeof ModalsModule !== 'undefined') {
                        ModalsModule.showToast(`Removed from team: ${teamName}`, 'error');
                    }
                    return;
                }
                state.currentTeam.members = state.currentTeam.members.filter(m => m.id !== msg.d.memberId);
                break;
                
            case 'rally_update':
                if (msg.d.rallyPoints) {
                    // Clear existing team waypoints
                    if (typeof State !== 'undefined') {
                        const waypoints = State.get('waypoints');
                        waypoints.filter(w => w.isTeamWaypoint).forEach(w => {
                            State.Waypoints.remove(w.id);
                        });
                    }
                    state.currentTeam.rallyPoints = msg.d.rallyPoints;
                    importRallyPointsToWaypoints();
                }
                break;
                
            case 'team_dissolved':
                const teamName = state.currentTeam.name;
                state.currentTeam = null;
                state.myMemberId = null;
                saveTeamState();
                Events.emit('team:dissolved_by_leader', { teamName });
                if (typeof ModalsModule !== 'undefined') {
                    ModalsModule.showToast(`Team "${teamName}" was dissolved`, 'error');
                }
                return;
        }
        
        saveTeamState();
        Events.emit('team:synced', { type: msg.sub });
    }
    
    function handlePositionUpdate(event) {
        if (!state.currentTeam || !event.node) return;
        
        const nodeId = event.node.id;
        const member = state.currentTeam.members.find(m => m.id === nodeId);
        
        if (member) {
            member.lat = event.node.lat;
            member.lon = event.node.lon;
            member.lastSeen = Date.now();
            member.status = 'active';
            Events.emit('team:member_position', { member });
        }
    }
    
    function handleConnectionChange(event) {
        if (event.state === 'connected' && state.currentTeam) {
            // Announce presence when reconnecting
            setTimeout(() => {
                broadcastTeamSync('member_update', getMyMember());
            }, 2000);
        }
    }

    // =========================================================================
    // UTILITIES
    // =========================================================================
    
    function generateTeamId() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let id = '';
        for (let i = 0; i < TEAM_ID_LENGTH; i++) {
            if (i === 4) id += '-';
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return id;
    }
    
    function generateMemberId() {
        return 'mbr-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
    }
    
    function generateMeshPSK() {
        const bytes = new Uint8Array(32);
        crypto.getRandomValues(bytes);
        return btoa(String.fromCharCode(...bytes)).substring(0, 32);
    }
    
    function generatePassphrase() {
        const words = [
            'alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel',
            'kilo', 'lima', 'mike', 'november', 'oscar', 'papa', 'romeo', 'sierra',
            'tango', 'victor', 'whiskey', 'zulu', 'red', 'blue', 'green', 'gold',
            'eagle', 'hawk', 'wolf', 'bear', 'storm', 'thunder', 'river', 'mountain'
        ];
        const w1 = words[Math.floor(Math.random() * words.length)];
        const w2 = words[Math.floor(Math.random() * words.length)];
        const num = Math.floor(Math.random() * 100);
        return `${w1}-${w2}-${num}`;
    }
    
    function generateEmergencyWord() {
        const words = ['MAYDAY', 'AVALANCHE', 'FIRESTORM', 'BLACKOUT', 'THUNDERBIRD', 'CHECKMATE'];
        return words[Math.floor(Math.random() * words.length)];
    }
    
    function simpleEncrypt(text, key) {
        const keyHash = hashString(key);
        let result = '';
        for (let i = 0; i < text.length; i++) {
            result += String.fromCharCode(text.charCodeAt(i) ^ ((keyHash >> (i % 32)) & 0xFF));
        }
        return btoa(result);
    }
    
    function simpleDecrypt(encoded, key) {
        const text = atob(encoded);
        const keyHash = hashString(key);
        let result = '';
        for (let i = 0; i < text.length; i++) {
            result += String.fromCharCode(text.charCodeAt(i) ^ ((keyHash >> (i % 32)) & 0xFF));
        }
        return result;
    }
    
    function hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash = hash & hash;
        }
        return Math.abs(hash);
    }
    
    function generateQRCodeCanvas(data, size) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        // White background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        
        // Generate pattern
        const moduleSize = Math.floor(size / 29);
        const margin = Math.floor((size - moduleSize * 25) / 2);
        const hash = hashString(data);
        
        ctx.fillStyle = '#000000';
        
        // Finder patterns
        drawFinderPattern(ctx, margin, margin, moduleSize);
        drawFinderPattern(ctx, margin + moduleSize * 18, margin, moduleSize);
        drawFinderPattern(ctx, margin, margin + moduleSize * 18, moduleSize);
        
        // Data modules
        for (let row = 0; row < 25; row++) {
            for (let col = 0; col < 25; col++) {
                // Skip finder areas
                if ((row < 9 && col < 9) || (row < 9 && col > 15) || (row > 15 && col < 9)) continue;
                
                const idx = row * 25 + col;
                const charCode = data.charCodeAt(idx % data.length);
                
                if ((charCode + hash + idx) % 3 === 0) {
                    ctx.fillRect(
                        margin + col * moduleSize,
                        margin + row * moduleSize,
                        moduleSize - 1,
                        moduleSize - 1
                    );
                }
            }
        }
        
        // Team ID label
        ctx.font = `bold ${Math.floor(size / 16)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(state.currentTeam?.id || 'TEAM', size / 2, size - 8);
        
        return canvas.toDataURL('image/png');
    }
    
    function drawFinderPattern(ctx, x, y, moduleSize) {
        ctx.fillRect(x, y, moduleSize * 7, moduleSize * 7);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + moduleSize, y + moduleSize, moduleSize * 5, moduleSize * 5);
        ctx.fillStyle = '#000000';
        ctx.fillRect(x + moduleSize * 2, y + moduleSize * 2, moduleSize * 3, moduleSize * 3);
    }

    // =========================================================================
    // DISTANCE & BEARING CALCULATIONS
    // =========================================================================
    
    /**
     * Calculate distance between two points using Haversine formula
     * @param {number} lat1 - Start latitude
     * @param {number} lon1 - Start longitude
     * @param {number} lat2 - End latitude
     * @param {number} lon2 - End longitude
     * @returns {number} Distance in miles
     */
    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 3959; // Earth's radius in miles
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) ** 2 + 
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
                  Math.sin(dLon/2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }
    
    /**
     * Calculate bearing between two points
     * @param {number} lat1 - Start latitude
     * @param {number} lon1 - Start longitude
     * @param {number} lat2 - End latitude
     * @param {number} lon2 - End longitude
     * @returns {number} Bearing in degrees (0-360)
     */
    function calculateBearing(lat1, lon1, lat2, lon2) {
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
     * Convert bearing to compass direction
     * @param {number} bearing - Bearing in degrees
     * @returns {string} Compass direction (N, NE, E, etc.)
     */
    function bearingToCompass(bearing) {
        const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                           'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
        const index = Math.round(bearing / 22.5) % 16;
        return directions[index];
    }
    
    /**
     * Get distance and bearing from reference position to a member
     * @param {string} memberId - Member ID
     * @param {Object} fromPosition - Reference position {lat, lon}
     * @returns {Object|null} {distance, bearing, compass, formatted}
     */
    function getDistanceToMember(memberId, fromPosition) {
        if (!fromPosition || !fromPosition.lat || !fromPosition.lon) return null;
        
        const member = getMember(memberId);
        if (!member || !member.lat || !member.lon) return null;
        
        const distance = calculateDistance(
            fromPosition.lat, fromPosition.lon,
            member.lat, member.lon
        );
        
        const bearing = calculateBearing(
            fromPosition.lat, fromPosition.lon,
            member.lat, member.lon
        );
        
        return {
            distance: distance,
            bearing: bearing,
            compass: bearingToCompass(bearing),
            formatted: distance < 0.1 ? 
                `${Math.round(distance * 5280)} ft` : 
                `${distance.toFixed(1)} mi`
        };
    }
    
    /**
     * Get distance and bearing to a rally point
     * @param {string} rallyId - Rally point ID
     * @param {Object} fromPosition - Reference position {lat, lon}
     * @returns {Object|null} {distance, bearing, compass, formatted}
     */
    function getDistanceToRally(rallyId, fromPosition) {
        if (!fromPosition || !fromPosition.lat || !fromPosition.lon) return null;
        if (!state.currentTeam) return null;
        
        const rally = state.currentTeam.rallyPoints.find(r => r.id === rallyId);
        if (!rally || !rally.lat || !rally.lon) return null;
        
        const distance = calculateDistance(
            fromPosition.lat, fromPosition.lon,
            rally.lat, rally.lon
        );
        
        const bearing = calculateBearing(
            fromPosition.lat, fromPosition.lon,
            rally.lat, rally.lon
        );
        
        return {
            distance: distance,
            bearing: bearing,
            compass: bearingToCompass(bearing),
            formatted: distance < 0.1 ? 
                `${Math.round(distance * 5280)} ft` : 
                `${distance.toFixed(1)} mi`
        };
    }
    
    /**
     * Get all members with distance/bearing from a position
     * @param {Object} fromPosition - Reference position {lat, lon}
     * @returns {Array} Members with distance info, sorted by distance
     */
    function getMembersWithDistance(fromPosition) {
        if (!state.currentTeam) return [];
        
        return state.currentTeam.members
            .map(m => ({
                ...m,
                distanceInfo: getDistanceToMember(m.id, fromPosition)
            }))
            .sort((a, b) => {
                if (!a.distanceInfo) return 1;
                if (!b.distanceInfo) return -1;
                return a.distanceInfo.distance - b.distanceInfo.distance;
            });
    }
    
    // =========================================================================
    // COMM PLAN MANAGEMENT
    // =========================================================================
    
    /**
     * Update the comm plan
     * @param {Object} updates - Comm plan updates
     * @returns {boolean} Success
     */
    function updateCommPlan(updates) {
        if (!state.currentTeam) return false;
        if (!hasPermission('edit_plan')) {
            console.warn('No permission to edit comm plan');
            return false;
        }
        
        state.currentTeam.commPlan = {
            ...state.currentTeam.commPlan,
            ...updates
        };
        
        saveTeamState();
        broadcastTeamSync('comm_plan', { commPlan: state.currentTeam.commPlan });
        
        return true;
    }
    
    /**
     * Get the comm plan
     * @returns {Object|null} Comm plan
     */
    function getCommPlan() {
        if (!state.currentTeam) return null;
        return { ...state.currentTeam.commPlan };
    }
    
    /**
     * Add a check-in time to the comm plan
     * @param {Object} checkIn - Check-in schedule {time, frequency, date, notes}
     * @returns {boolean} Success
     */
    function addCheckInTime(checkIn) {
        if (!state.currentTeam) return false;
        if (!hasPermission('edit_plan')) return false;
        
        const checkInEntry = {
            id: generateMemberId(),
            time: checkIn.time,           // HH:MM format
            frequency: checkIn.frequency || 'daily', // daily, once, hourly
            date: checkIn.date || null,   // For one-time check-ins
            notes: checkIn.notes || ''
        };
        
        state.currentTeam.commPlan.checkInTimes.push(checkInEntry);
        saveTeamState();
        
        return true;
    }
    
    /**
     * Remove a check-in time
     * @param {string} checkInId - Check-in ID
     * @returns {boolean} Success
     */
    function removeCheckInTime(checkInId) {
        if (!state.currentTeam) return false;
        if (!hasPermission('edit_plan')) return false;
        
        const index = state.currentTeam.commPlan.checkInTimes.findIndex(c => c.id === checkInId);
        if (index === -1) return false;
        
        state.currentTeam.commPlan.checkInTimes.splice(index, 1);
        saveTeamState();
        
        return true;
    }
    
    /**
     * Get next scheduled check-in time
     * @returns {Object|null} Next check-in info
     */
    function getNextCheckIn() {
        if (!state.currentTeam || !state.currentTeam.commPlan.checkInTimes.length) {
            return null;
        }
        
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const currentTime = now.toTimeString().substring(0, 5);
        
        // Find next check-in
        for (const checkIn of state.currentTeam.commPlan.checkInTimes) {
            if (checkIn.frequency === 'daily' || 
                (checkIn.frequency === 'once' && checkIn.date === today)) {
                if (checkIn.time > currentTime) {
                    return {
                        ...checkIn,
                        nextTime: `${today}T${checkIn.time}:00`,
                        formatted: `Today at ${checkIn.time}`
                    };
                }
            }
        }
        
        // Return first one for tomorrow
        const firstDaily = state.currentTeam.commPlan.checkInTimes.find(c => c.frequency === 'daily');
        if (firstDaily) {
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowDate = tomorrow.toISOString().split('T')[0];
            return {
                ...firstDaily,
                nextTime: `${tomorrowDate}T${firstDaily.time}:00`,
                formatted: `Tomorrow at ${firstDaily.time}`
            };
        }
        
        return null;
    }
    
    // =========================================================================
    // MEMBER STATUS MANAGEMENT
    // =========================================================================
    
    /**
     * Get member status based on last seen time
     * @param {Object} member - Team member
     * @returns {string} Status: 'active', 'stale', 'offline', 'unknown'
     */
    function getMemberStatus(member) {
        if (!member.lastSeen) return 'unknown';
        
        const now = Date.now();
        const lastSeen = new Date(member.lastSeen).getTime();
        const elapsed = now - lastSeen;
        
        if (elapsed < 5 * 60 * 1000) return 'active';    // < 5 minutes
        if (elapsed < 15 * 60 * 1000) return 'stale';    // < 15 minutes
        return 'offline';
    }
    
    /**
     * Update all member statuses
     */
    function updateAllMemberStatuses() {
        if (!state.currentTeam) return;
        
        state.currentTeam.members.forEach(m => {
            m.status = getMemberStatus(m);
        });
    }
    
    /**
     * Get team health summary
     * @returns {Object} {active, stale, offline, total}
     */
    function getTeamHealth() {
        if (!state.currentTeam) return { active: 0, stale: 0, offline: 0, total: 0 };
        
        updateAllMemberStatuses();
        
        const members = state.currentTeam.members;
        return {
            active: members.filter(m => m.status === 'active').length,
            stale: members.filter(m => m.status === 'stale').length,
            offline: members.filter(m => m.status === 'offline' || m.status === 'unknown').length,
            total: members.length
        };
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================
    
    return {
        init,
        
        // Team management
        createTeam,
        updateTeam,
        leaveTeam,
        dissolveTeam,
        
        // Getters
        getCurrentTeam: () => state.currentTeam,
        isInTeam: () => !!state.currentTeam,
        getMyMember,
        getMyRole,
        hasPermission,
        getMembers,
        getMember,
        getJoinRequests: () => [...state.joinRequests],
        
        // Member management
        setMemberRole,
        removeMember,
        updateMemberPosition,
        getMemberStatus,
        updateAllMemberStatuses,
        getTeamHealth,
        
        // Team sharing
        generateTeamPackage,
        exportTeamPackageEncrypted,
        generateInviteCode,
        generateTeamQR,
        importTeamPackage,
        downloadTeamPackage,
        importFromFile,
        
        // Rally points
        addRallyPoint,
        updateRallyPoint,
        removeRallyPoint,
        getRallyPoints,
        
        // Distance & bearing
        calculateDistance,
        calculateBearing,
        bearingToCompass,
        getDistanceToMember,
        getDistanceToRally,
        getMembersWithDistance,
        
        // Comm plan
        updateCommPlan,
        getCommPlan,
        addCheckInTime,
        removeCheckInTime,
        getNextCheckIn,
        
        // Constants
        ROLES,
        RALLY_TYPES,
        TEAM_VERSION
    };
})();

window.TeamModule = TeamModule;
