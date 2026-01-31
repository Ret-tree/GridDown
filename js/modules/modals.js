/**
 * GridDown Modals Module - Modal Dialogs with Dynamic Type-Specific Fields
 * Includes photo attachment support with camera capture and file upload
 * Includes confidence rating system with age-based decay
 */
const ModalsModule = (function() {
    'use strict';
    let container;
    let keyboardHandler = null;
    let currentWaypoint = null;  // Track current waypoint being edited
    let pendingPhotos = [];      // Photos to be saved with waypoint
    let currentConfidence = 3;   // Current confidence rating (1-5)
    let initialized = false;     // Track initialization
    
    // Maximum photo size and dimensions
    const MAX_PHOTO_SIZE = 1024 * 1024; // 1MB after compression
    const MAX_PHOTO_DIMENSION = 1200;    // Max width/height in pixels
    const THUMBNAIL_SIZE = 80;           // Thumbnail display size
    
    // Confidence rating configuration
    const CONFIDENCE_LEVELS = [
        { value: 1, label: 'Very Low', color: '#ef4444', description: 'Unverified rumor or very old data' },
        { value: 2, label: 'Low', color: '#f97316', description: 'Second-hand info or needs verification' },
        { value: 3, label: 'Medium', color: '#eab308', description: 'Reasonably reliable but not recent' },
        { value: 4, label: 'High', color: '#22c55e', description: 'Recently verified or reliable source' },
        { value: 5, label: 'Very High', color: '#10b981', description: 'Personally verified recently' }
    ];
    
    // Days after which confidence starts to decay
    const CONFIDENCE_DECAY_DAYS = {
        water: 30,      // Water sources can change quickly
        fuel: 90,       // Fuel caches need regular checks
        camp: 180,      // Camp sites are relatively stable
        resupply: 365,  // Stores are usually stable
        hazard: 60,     // Hazards can change with weather/seasons
        bailout: 365,   // Bail-out points are usually stable
        custom: 180     // Default for custom points
    };

    function init() {
        // Prevent double initialization
        if (initialized) {
            console.debug('ModalsModule already initialized');
            return;
        }
        
        container = document.getElementById('modal-container');
        Events.on(Events.EVENTS.MAP_CLICK, (coords) => openWaypointModal(coords));
        
        initialized = true;
    }
    
    /**
     * Calculate effective confidence based on age since last verification
     * @param {number} baseConfidence - Original confidence rating (1-5)
     * @param {string} lastVerified - ISO date string of last verification
     * @param {string} waypointType - Type of waypoint for decay rate
     * @returns {object} - { effective: number, decayed: boolean, daysSince: number }
     */
    function calculateEffectiveConfidence(baseConfidence, lastVerified, waypointType) {
        if (!lastVerified) {
            return { effective: Math.max(1, baseConfidence - 1), decayed: true, daysSince: null };
        }
        
        const now = new Date();
        const verifiedDate = new Date(lastVerified);
        const daysSince = Math.floor((now - verifiedDate) / (1000 * 60 * 60 * 24));
        const decayThreshold = CONFIDENCE_DECAY_DAYS[waypointType] || 180;
        
        if (daysSince <= decayThreshold) {
            return { effective: baseConfidence, decayed: false, daysSince };
        }
        
        // Calculate decay: lose 1 star for each decay period past threshold
        const periodsOverdue = Math.floor((daysSince - decayThreshold) / decayThreshold);
        const decay = Math.min(periodsOverdue + 1, baseConfidence - 1);
        const effective = Math.max(1, baseConfidence - decay);
        
        return { effective, decayed: decay > 0, daysSince };
    }
    
    /**
     * Get confidence level info
     */
    function getConfidenceInfo(rating) {
        return CONFIDENCE_LEVELS.find(l => l.value === rating) || CONFIDENCE_LEVELS[2];
    }
    
    /**
     * Render star rating display (static or interactive)
     */
    function renderStarRating(rating, interactive = false, size = 20) {
        const stars = [];
        for (let i = 1; i <= 5; i++) {
            const filled = i <= rating;
            const color = filled ? getConfidenceInfo(rating).color : 'rgba(255,255,255,0.2)';
            stars.push(`
                <span class="${interactive ? 'confidence-star' : ''}" 
                      data-rating="${i}" 
                      style="cursor:${interactive ? 'pointer' : 'default'};font-size:${size}px;color:${color};transition:color 0.15s">
                    ${filled ? '★' : '☆'}
                </span>
            `);
        }
        return stars.join('');
    }
    
    /**
     * Render confidence rating section for modal
     */
    function renderConfidenceSection(confidence, lastVerified, waypointType) {
        const effectiveData = calculateEffectiveConfidence(confidence, lastVerified, waypointType);
        const info = getConfidenceInfo(confidence);
        
        return `
            <div class="divider" style="margin:16px 0"></div>
            <div class="form-group">
                <label style="display:flex;align-items:center;justify-content:space-between">
                    <span>Confidence Rating</span>
                    <span id="confidence-label" style="font-size:11px;color:${info.color};font-weight:500">${info.label}</span>
                </label>
                
                <div id="confidence-stars" style="
                    display:flex;
                    gap:8px;
                    padding:12px;
                    background:rgba(255,255,255,0.03);
                    border-radius:10px;
                    justify-content:center;
                    align-items:center;
                ">
                    ${renderStarRating(confidence, true, 28)}
                </div>
                
                <div id="confidence-description" style="
                    font-size:11px;
                    color:rgba(255,255,255,0.5);
                    text-align:center;
                    margin-top:8px;
                ">${info.description}</div>
                
                ${effectiveData.decayed ? `
                    <div style="
                        margin-top:8px;
                        padding:8px 12px;
                        background:rgba(234,179,8,0.1);
                        border:1px solid rgba(234,179,8,0.2);
                        border-radius:8px;
                        font-size:11px;
                        color:#eab308;
                        display:flex;
                        align-items:center;
                        gap:8px;
                    ">
                        <span>⚠️</span>
                        <span>
                            ${effectiveData.daysSince ? 
                                `Last verified ${effectiveData.daysSince} days ago. Effective confidence: ${effectiveData.effective}/5` :
                                `Never verified. Consider verifying this waypoint.`
                            }
                        </span>
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    /**
     * Update the confidence display after user selects a rating
     */
    function updateConfidenceDisplay(rating) {
        const info = getConfidenceInfo(rating);
        
        // Update label
        const label = container.querySelector('#confidence-label');
        if (label) {
            label.textContent = info.label;
            label.style.color = info.color;
        }
        
        // Update description
        const desc = container.querySelector('#confidence-description');
        if (desc) {
            desc.textContent = info.description;
        }
        
        // Update stars
        highlightStars(rating);
    }
    
    /**
     * Highlight stars up to the given rating
     */
    function highlightStars(rating) {
        const stars = container.querySelectorAll('.confidence-star');
        stars.forEach(star => {
            const starRating = parseInt(star.dataset.rating);
            const filled = starRating <= rating;
            const color = filled ? getConfidenceInfo(rating).color : 'rgba(255,255,255,0.2)';
            star.style.color = color;
            star.textContent = filled ? '★' : '☆';
        });
    }
    
    // Visibility options configuration
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
    
    let currentVisibility = 'private';
    
    /**
     * Render visibility section for modal
     */
    function renderVisibilitySection(wp) {
        const visibility = wp.visibility || 'private';
        const source = wp.source || null;
        const createdBy = wp.createdBy || 'You';
        const isFromCommunity = visibility === 'community' && source && source !== 'local';
        
        return `
            <div class="divider" style="margin:16px 0"></div>
            <div class="form-group">
                <label style="display:flex;align-items:center;justify-content:space-between">
                    <span>Visibility</span>
                    <span id="visibility-label" style="font-size:11px;color:${VISIBILITY_OPTIONS[visibility].color};font-weight:500">
                        ${VISIBILITY_OPTIONS[visibility].icon} ${VISIBILITY_OPTIONS[visibility].label}
                    </span>
                </label>
                
                <div id="visibility-options" style="display:flex;gap:8px;margin-top:8px">
                    ${Object.entries(VISIBILITY_OPTIONS).map(([key, opt]) => `
                        <button type="button" class="visibility-btn ${visibility === key ? 'visibility-btn--selected' : ''}" 
                                data-visibility="${key}"
                                style="
                                    flex:1;
                                    padding:12px 8px;
                                    background:${visibility === key ? opt.color + '20' : 'rgba(255,255,255,0.03)'};
                                    border:1px solid ${visibility === key ? opt.color + '50' : 'rgba(255,255,255,0.06)'};
                                    border-radius:10px;
                                    display:flex;
                                    flex-direction:column;
                                    align-items:center;
                                    gap:4px;
                                    cursor:pointer;
                                    transition:all 0.2s;
                                ">
                            <span style="font-size:18px">${opt.icon}</span>
                            <span style="font-size:11px;font-weight:500;color:${visibility === key ? opt.color : 'rgba(255,255,255,0.6)'}">
                                ${opt.label}
                            </span>
                        </button>
                    `).join('')}
                </div>
                
                <div id="visibility-description" style="
                    font-size:11px;
                    color:rgba(255,255,255,0.5);
                    text-align:center;
                    margin-top:8px;
                ">${VISIBILITY_OPTIONS[visibility].description}</div>
                
                ${isFromCommunity ? `
                    <div style="
                        margin-top:12px;
                        padding:10px 12px;
                        background:rgba(59,130,246,0.1);
                        border:1px solid rgba(59,130,246,0.2);
                        border-radius:8px;
                        font-size:11px;
                        display:flex;
                        align-items:center;
                        gap:8px;
                    ">
                        <span style="color:#3b82f6">ℹ️</span>
                        <div>
                            <div style="color:#3b82f6;font-weight:500">Community Waypoint</div>
                            <div style="color:rgba(255,255,255,0.5);margin-top:2px">
                                Added by ${createdBy}${source ? ` • Source: ${source}` : ''}
                            </div>
                        </div>
                    </div>
                ` : ''}
                
                ${visibility === 'community' && !isFromCommunity ? `
                    <div style="
                        margin-top:12px;
                        padding:10px 12px;
                        background:rgba(16,185,129,0.1);
                        border:1px solid rgba(16,185,129,0.2);
                        border-radius:8px;
                        font-size:11px;
                        color:rgba(255,255,255,0.6);
                    ">
                        <div style="color:#10b981;font-weight:500;margin-bottom:4px">📤 Share with Community</div>
                        This waypoint will be visible to other GridDown users in this area.
                        Make sure the information is accurate and helpful.
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    /**
     * Update visibility display after user selects an option
     */
    function updateVisibilityDisplay(visibility) {
        const opt = VISIBILITY_OPTIONS[visibility];
        
        // Update label
        const label = container.querySelector('#visibility-label');
        if (label) {
            label.innerHTML = `${opt.icon} ${opt.label}`;
            label.style.color = opt.color;
        }
        
        // Update description
        const desc = container.querySelector('#visibility-description');
        if (desc) {
            desc.textContent = opt.description;
        }
        
        // Update button states
        container.querySelectorAll('.visibility-btn').forEach(btn => {
            const btnVisibility = btn.dataset.visibility;
            const btnOpt = VISIBILITY_OPTIONS[btnVisibility];
            const isSelected = btnVisibility === visibility;
            
            btn.classList.toggle('visibility-btn--selected', isSelected);
            btn.style.background = isSelected ? btnOpt.color + '20' : 'rgba(255,255,255,0.03)';
            btn.style.borderColor = isSelected ? btnOpt.color + '50' : 'rgba(255,255,255,0.06)';
            btn.querySelector('span:last-child').style.color = isSelected ? btnOpt.color : 'rgba(255,255,255,0.6)';
        });
    }
    
    /**
     * Compress and resize an image file to reduce storage
     * @param {File|Blob} file - Image file to process
     * @returns {Promise<string>} - Base64 encoded compressed image
     */
    async function processImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    // Calculate new dimensions
                    let width = img.width;
                    let height = img.height;
                    
                    if (width > MAX_PHOTO_DIMENSION || height > MAX_PHOTO_DIMENSION) {
                        if (width > height) {
                            height = Math.round(height * MAX_PHOTO_DIMENSION / width);
                            width = MAX_PHOTO_DIMENSION;
                        } else {
                            width = Math.round(width * MAX_PHOTO_DIMENSION / height);
                            height = MAX_PHOTO_DIMENSION;
                        }
                    }
                    
                    // Create canvas and draw resized image
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // Compress as JPEG with quality adjustment
                    let quality = 0.8;
                    let dataUrl = canvas.toDataURL('image/jpeg', quality);
                    
                    // Reduce quality if still too large
                    while (dataUrl.length > MAX_PHOTO_SIZE && quality > 0.3) {
                        quality -= 0.1;
                        dataUrl = canvas.toDataURL('image/jpeg', quality);
                    }
                    
                    resolve(dataUrl);
                };
                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    }
    
    /**
     * Handle photo file selection
     */
    async function handlePhotoSelect(files) {
        if (!files || files.length === 0) return;
        
        for (const file of files) {
            if (!file.type.startsWith('image/')) {
                showToast('Only image files are allowed', 'error');
                continue;
            }
            
            try {
                const dataUrl = await processImage(file);
                const photo = {
                    id: Helpers.generateId(),
                    data: dataUrl,
                    timestamp: new Date().toISOString(),
                    filename: file.name
                };
                pendingPhotos.push(photo);
                updatePhotoGallery();
            } catch (err) {
                console.error('Photo processing error:', err);
                showToast('Failed to process photo', 'error');
            }
        }
    }
    
    /**
     * Remove a pending photo
     */
    function removePhoto(photoId) {
        pendingPhotos = pendingPhotos.filter(p => p.id !== photoId);
        updatePhotoGallery();
    }
    
    /**
     * Update the photo gallery display in the modal
     */
    function updatePhotoGallery() {
        const gallery = container.querySelector('#photo-gallery');
        if (!gallery) return;
        
        if (pendingPhotos.length === 0) {
            gallery.innerHTML = `
                <div style="padding:20px;text-align:center;color:rgba(255,255,255,0.4);font-size:12px">
                    No photos attached
                </div>
            `;
            return;
        }
        
        gallery.innerHTML = pendingPhotos.map(photo => `
            <div class="photo-thumbnail" data-photo-id="${photo.id}" style="
                position:relative;
                width:${THUMBNAIL_SIZE}px;
                height:${THUMBNAIL_SIZE}px;
                border-radius:8px;
                overflow:hidden;
                cursor:pointer;
                flex-shrink:0;
            ">
                <img src="${photo.data}" alt="Photo" style="
                    width:100%;
                    height:100%;
                    object-fit:cover;
                ">
                <button class="photo-remove-btn" data-remove-photo="${photo.id}" style="
                    position:absolute;
                    top:4px;
                    right:4px;
                    width:20px;
                    height:20px;
                    border-radius:50%;
                    background:rgba(239,68,68,0.9);
                    border:none;
                    color:white;
                    font-size:12px;
                    cursor:pointer;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                ">×</button>
            </div>
        `).join('');
        
        // Add click handlers for remove buttons
        gallery.querySelectorAll('[data-remove-photo]').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                removePhoto(btn.dataset.removePhoto);
            };
        });
        
        // Add click handlers for thumbnails to view full size
        gallery.querySelectorAll('.photo-thumbnail').forEach(thumb => {
            thumb.onclick = (e) => {
                if (e.target.classList.contains('photo-remove-btn')) return;
                const photo = pendingPhotos.find(p => p.id === thumb.dataset.photoId);
                if (photo) openPhotoViewer(photo);
            };
        });
    }
    
    /**
     * Open full-size photo viewer
     */
    function openPhotoViewer(photo) {
        const viewer = document.createElement('div');
        viewer.id = 'photo-viewer';
        viewer.style.cssText = `
            position:fixed;
            inset:0;
            background:rgba(0,0,0,0.95);
            display:flex;
            align-items:center;
            justify-content:center;
            z-index:1000;
            cursor:pointer;
        `;
        viewer.innerHTML = `
            <img src="${photo.data}" style="max-width:90%;max-height:90%;object-fit:contain;border-radius:8px">
            <button style="
                position:absolute;
                top:20px;
                right:20px;
                width:40px;
                height:40px;
                border-radius:50%;
                background:rgba(255,255,255,0.1);
                border:none;
                color:white;
                font-size:24px;
                cursor:pointer;
            ">×</button>
        `;
        viewer.onclick = () => viewer.remove();
        document.body.appendChild(viewer);
    }
    
    /**
     * Render the photo section HTML
     */
    function renderPhotoSection(existingPhotos = []) {
        return `
            <div class="divider" style="margin:16px 0"></div>
            <div class="form-group">
                <label style="display:flex;align-items:center;justify-content:space-between">
                    <span>📷 Photos (${pendingPhotos.length})</span>
                    <span style="font-size:11px;color:rgba(255,255,255,0.4)">Max 1MB each</span>
                </label>
                
                <div id="photo-gallery" style="
                    display:flex;
                    gap:8px;
                    flex-wrap:wrap;
                    padding:12px;
                    background:rgba(255,255,255,0.03);
                    border-radius:10px;
                    min-height:60px;
                    margin-bottom:12px;
                ">
                    ${pendingPhotos.length === 0 ? `
                        <div style="padding:20px;text-align:center;color:rgba(255,255,255,0.4);font-size:12px;width:100%">
                            No photos attached
                        </div>
                    ` : pendingPhotos.map(photo => `
                        <div class="photo-thumbnail" data-photo-id="${photo.id}" style="
                            position:relative;
                            width:${THUMBNAIL_SIZE}px;
                            height:${THUMBNAIL_SIZE}px;
                            border-radius:8px;
                            overflow:hidden;
                            cursor:pointer;
                            flex-shrink:0;
                        ">
                            <img src="${photo.data}" alt="Photo" style="
                                width:100%;
                                height:100%;
                                object-fit:cover;
                            ">
                            <button class="photo-remove-btn" data-remove-photo="${photo.id}" style="
                                position:absolute;
                                top:4px;
                                right:4px;
                                width:20px;
                                height:20px;
                                border-radius:50%;
                                background:rgba(239,68,68,0.9);
                                border:none;
                                color:white;
                                font-size:12px;
                                cursor:pointer;
                                display:flex;
                                align-items:center;
                                justify-content:center;
                            ">×</button>
                        </div>
                    `).join('')}
                </div>
                
                <div style="display:flex;gap:8px">
                    <label class="btn btn--secondary" style="flex:1;cursor:pointer;justify-content:center">
                        ${Icons.get('upload')} Upload Photo
                        <input type="file" id="photo-file-input" accept="image/*" multiple style="display:none">
                    </label>
                    <label class="btn btn--secondary" style="flex:1;cursor:pointer;justify-content:center">
                        ${Icons.get('camera')} Take Photo
                        <input type="file" id="photo-camera-input" accept="image/*" capture="environment" style="display:none">
                    </label>
                </div>
            </div>
        `;
    }
    
    /**
     * Add keyboard listener for modal
     */
    function addKeyboardListener() {
        keyboardHandler = (e) => {
            if (e.key === 'Escape') {
                closeModal();
            }
        };
        document.addEventListener('keydown', keyboardHandler);
    }
    
    /**
     * Remove keyboard listener
     */
    function removeKeyboardListener() {
        if (keyboardHandler) {
            document.removeEventListener('keydown', keyboardHandler);
            keyboardHandler = null;
        }
    }

    /**
     * Render a single form field based on field definition
     */
    function renderField(field, value) {
        const fieldId = `wp-field-${field.key}`;
        const currentValue = value !== undefined ? value : '';
        
        switch (field.type) {
            case 'select':
                return `
                    <div class="form-group">
                        <label for="${fieldId}">${field.label}</label>
                        <select id="${fieldId}" data-field="${field.key}">
                            ${field.options.map(opt => `
                                <option value="${opt.value}" ${currentValue === opt.value ? 'selected' : ''}>${opt.label}</option>
                            `).join('')}
                        </select>
                    </div>
                `;
            
            case 'number':
                return `
                    <div class="form-group">
                        <label for="${fieldId}">${field.label}</label>
                        <input type="number" id="${fieldId}" data-field="${field.key}" 
                            value="${currentValue}" 
                            placeholder="${field.placeholder || ''}"
                            ${field.min !== undefined ? `min="${field.min}"` : ''}
                            ${field.max !== undefined ? `max="${field.max}"` : ''}
                            ${field.step !== undefined ? `step="${field.step}"` : ''}>
                    </div>
                `;
            
            case 'text':
                return `
                    <div class="form-group">
                        <label for="${fieldId}">${field.label}</label>
                        <input type="text" id="${fieldId}" data-field="${field.key}" 
                            value="${currentValue}" 
                            placeholder="${field.placeholder || ''}">
                    </div>
                `;
            
            case 'textarea':
                return `
                    <div class="form-group">
                        <label for="${fieldId}">${field.label}</label>
                        <textarea id="${fieldId}" data-field="${field.key}" rows="2" 
                            placeholder="${field.placeholder || ''}">${currentValue}</textarea>
                    </div>
                `;
            
            case 'checkbox':
                return `
                    <label class="checkbox-field">
                        <input type="checkbox" id="${fieldId}" data-field="${field.key}" 
                            ${currentValue ? 'checked' : ''}>
                        <span>${field.label}</span>
                    </label>
                `;
            
            case 'date':
                return `
                    <div class="form-group">
                        <label for="${fieldId}">${field.label}</label>
                        <input type="date" id="${fieldId}" data-field="${field.key}" 
                            value="${currentValue}"
                            placeholder="${field.placeholder || ''}">
                    </div>
                `;
            
            default:
                return '';
        }
    }

    /**
     * Render all fields for a waypoint type
     */
    function renderTypeFields(type, waypoint) {
        const typeConfig = Constants.WAYPOINT_TYPES[type];
        if (!typeConfig || !typeConfig.fields || typeConfig.fields.length === 0) {
            return '<div style="padding:12px;color:rgba(255,255,255,0.4);font-size:12px;text-align:center">No additional fields for this type</div>';
        }
        
        return typeConfig.fields.map(field => renderField(field, waypoint[field.key])).join('');
    }

    /**
     * Collect all field values from the form
     */
    function collectFieldValues(type) {
        const values = {};
        const typeConfig = Constants.WAYPOINT_TYPES[type];
        
        if (!typeConfig || !typeConfig.fields) return values;
        
        typeConfig.fields.forEach(field => {
            const element = container.querySelector(`[data-field="${field.key}"]`);
            if (!element) return;
            
            switch (field.type) {
                case 'checkbox':
                    values[field.key] = element.checked;
                    break;
                case 'number':
                    const numVal = element.value;
                    values[field.key] = numVal ? parseFloat(numVal) : null;
                    break;
                default:
                    values[field.key] = element.value || '';
            }
        });
        
        return values;
    }

    /**
     * Open waypoint modal for creating or editing
     * @param {Object|null} coords - Map click coordinates for new waypoint
     * @param {Object|null} waypointToEdit - Existing waypoint to edit
     */
    function openWaypointModal(coords = null, waypointToEdit = null) {
        // Determine if this is a new waypoint or editing existing
        const isNew = !!coords || (!waypointToEdit && !State.get('selectedWaypoint'));
        
        // Get the waypoint data - priority: passed waypoint > selected waypoint > new from coords
        let wp;
        if (waypointToEdit) {
            wp = { ...waypointToEdit }; // Clone to avoid mutation
        } else if (coords) {
            wp = { 
                id: Helpers.generateId(), 
                x: coords.x, 
                y: coords.y,
                lat: coords.lat,
                lon: coords.lon,
                name: '', 
                type: 'custom', 
                notes: '', 
                verified: false 
            };
        } else {
            wp = State.get('selectedWaypoint') || { 
                id: Helpers.generateId(), 
                x: 50, 
                y: 50, 
                name: '', 
                type: 'custom', 
                notes: '', 
                verified: false 
            };
        }
        
        currentWaypoint = { ...wp };
        
        // Initialize pending photos with existing photos
        pendingPhotos = wp.photos ? [...wp.photos] : [];
        
        // Initialize confidence rating
        currentConfidence = wp.confidence || 3;
        
        // Initialize visibility
        currentVisibility = wp.visibility || 'private';
        
        // Format coordinates for display using Coordinates module
        let coordsDisplay;
        if (wp.lat && wp.lon) {
            coordsDisplay = typeof Coordinates !== 'undefined' 
                ? Coordinates.format(wp.lat, wp.lon)
                : `${Math.abs(wp.lat).toFixed(4)}° ${wp.lat >= 0 ? 'N' : 'S'}, ${Math.abs(wp.lon).toFixed(4)}° ${wp.lon >= 0 ? 'E' : 'W'}`;
        } else {
            coordsDisplay = `${wp.x?.toFixed(1) || 0}%, ${wp.y?.toFixed(1) || 0}%`;
        }
        
        const typeConfig = Constants.WAYPOINT_TYPES[wp.type] || Constants.WAYPOINT_TYPES.custom;
        
        // Show modal - update aria-hidden for accessibility
        container.setAttribute('aria-hidden', 'false');
        
        container.innerHTML = `
            <div class="modal-backdrop" id="modal-backdrop" role="presentation">
                <div class="modal" style="max-width:480px;max-height:90vh" role="dialog" aria-modal="true" aria-labelledby="modal-title">
                    <div class="modal__header">
                        <h3 class="modal__title" id="modal-title">${isNew ? 'New Waypoint' : 'Edit Waypoint'}</h3>
                        <button class="modal__close" id="modal-close" aria-label="Close dialog">${Icons.get('close')}</button>
                    </div>
                    <div class="modal__body" style="max-height:calc(90vh - 140px);overflow-y:auto">
                        <!-- Basic Info Section -->
                        <div class="form-group">
                            <label for="wp-name">Name</label>
                            <input type="text" id="wp-name" value="${wp.name || ''}" placeholder="Waypoint name" autofocus aria-required="true">
                        </div>
                        
                        <div class="form-group">
                            <label style="display:flex;justify-content:space-between;align-items:center">
                                <span id="location-label">Location</span>
                                <button type="button" id="toggle-coord-edit" style="font-size:10px;padding:2px 8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:4px;color:rgba(255,255,255,0.6);cursor:pointer" aria-label="Edit coordinates">
                                    Edit
                                </button>
                            </label>
                            <div id="coord-display" style="padding:10px 14px;background:rgba(255,255,255,0.03);border-radius:8px;font-family:'IBM Plex Mono',monospace;font-size:12px;color:rgba(255,255,255,0.6)" aria-labelledby="location-label">
                                📍 ${coordsDisplay}
                            </div>
                            <div id="coord-edit" style="display:none" role="group" aria-label="Coordinate input">
                                <input type="text" id="wp-coords-input" 
                                    value="${wp.lat && wp.lon ? `${wp.lat.toFixed(6)}, ${wp.lon.toFixed(6)}` : ''}" 
                                    placeholder="Enter coordinates (any format)"
                                    style="font-family:'IBM Plex Mono',monospace;font-size:12px"
                                    aria-describedby="coord-format-hint coord-parse-error">
                                <div id="coord-format-hint" style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:4px">
                                    Accepts: DD (37.42, -119.19), DMS, UTM, MGRS
                                </div>
                                <div id="coord-parse-error" style="display:none;font-size:11px;color:#ef4444;margin-top:4px" role="alert" aria-live="polite"></div>
                            </div>
                        </div>
                        
                        <!-- Type Selection -->
                        <div class="form-group">
                            <label id="type-label">Type</label>
                            <div class="type-grid" id="type-grid" role="radiogroup" aria-labelledby="type-label">
                                ${Object.entries(Constants.WAYPOINT_TYPES).map(([k, t]) => `
                                    <button class="type-btn ${wp.type === k ? 'type-btn--selected' : ''}" 
                                            data-type="${k}" 
                                            style="color:${wp.type === k ? t.color : 'inherit'}"
                                            role="radio"
                                            aria-checked="${wp.type === k}"
                                            aria-label="${t.label}">
                                        <span class="type-btn__icon" aria-hidden="true">${t.icon}</span>
                                        <span class="type-btn__label">${t.label.split(' ')[0]}</span>
                                    </button>
                                `).join('')}
                            </div>
                        </div>
                        
                        <!-- Type-Specific Fields Section -->
                        <div id="type-fields-section" style="margin-top:16px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.06)" role="region" aria-label="Type-specific details">
                            <div style="font-size:12px;font-weight:500;color:${typeConfig.color};margin-bottom:12px;display:flex;align-items:center;gap:6px">
                                <span aria-hidden="true">${typeConfig.icon}</span>
                                <span>${typeConfig.label} Details</span>
                            </div>
                            <div id="type-fields-container">
                                ${renderTypeFields(wp.type, wp)}
                            </div>
                        </div>
                        
                        <!-- Notes Section -->
                        <div class="divider" style="margin:16px 0" role="separator"></div>
                        <div class="form-group">
                            <label for="wp-notes">Additional Notes</label>
                            <textarea id="wp-notes" rows="2" placeholder="Any additional notes about this location...">${wp.notes || ''}</textarea>
                        </div>
                        
                        <!-- Confidence Rating Section -->
                        ${renderConfidenceSection(wp.confidence || 3, wp.lastVerified, wp.type)}
                        
                        <!-- Visibility Section -->
                        ${renderVisibilitySection(wp)}
                        
                        <!-- Verified Checkbox -->
                        <label class="checkbox-field">
                            <input type="checkbox" id="wp-verified" ${wp.verified ? 'checked' : ''} aria-describedby="verified-hint">
                            <span id="verified-hint">Verified (physically confirmed)</span>
                        </label>
                        
                        <!-- Photo Section -->
                        ${renderPhotoSection(wp.photos || [])}
                    </div>
                    <div class="modal__footer">
                        ${!isNew ? `<button class="btn btn--secondary" id="modal-delete" style="color:#ef4444" aria-label="Delete waypoint">${Icons.get('trash')}</button>` : ''}
                        <div style="flex:1"></div>
                        <button class="btn btn--secondary" id="modal-cancel">Cancel</button>
                        <button class="btn btn--primary" id="modal-save">${isNew ? 'Add Waypoint' : 'Save Changes'}</button>
                    </div>
                </div>
            </div>
        `;

        let selectedType = wp.type;

        // Type selection handlers - update fields when type changes
        container.querySelectorAll('[data-type]').forEach(btn => {
            btn.onclick = () => {
                // Update button styles and ARIA states
                container.querySelectorAll('[data-type]').forEach(b => {
                    b.classList.remove('type-btn--selected');
                    b.style.color = 'inherit';
                    b.setAttribute('aria-checked', 'false');
                });
                btn.classList.add('type-btn--selected');
                btn.setAttribute('aria-checked', 'true');
                const newType = btn.dataset.type;
                const newTypeConfig = Constants.WAYPOINT_TYPES[newType];
                btn.style.color = newTypeConfig.color;
                selectedType = newType;
                
                // Update section header
                const sectionHeader = container.querySelector('#type-fields-section > div:first-child');
                if (sectionHeader) {
                    sectionHeader.innerHTML = `
                        <span>${newTypeConfig.icon}</span>
                        <span>${newTypeConfig.label} Details</span>
                    `;
                    sectionHeader.style.color = newTypeConfig.color;
                }
                
                // Re-render type fields, preserving data for same type
                const fieldsContainer = container.querySelector('#type-fields-container');
                if (fieldsContainer) {
                    // Only carry over values if switching back to original type
                    const dataForFields = newType === currentWaypoint.type ? currentWaypoint : {};
                    fieldsContainer.innerHTML = renderTypeFields(newType, dataForFields);
                }
            };
        });

        // Modal close handlers
        container.querySelector('#modal-close').onclick = closeModal;
        container.querySelector('#modal-cancel').onclick = closeModal;
        container.querySelector('#modal-backdrop').onclick = (e) => { 
            if (e.target.id === 'modal-backdrop') closeModal(); 
        };

        // Delete button handler (only shown when editing)
        const deleteBtn = container.querySelector('#modal-delete');
        if (deleteBtn) {
            deleteBtn.onclick = () => {
                closeModal();
                confirmDeleteWaypoint(wp);
            };
        }
        
        // Coordinate edit toggle handler
        const coordEditToggle = container.querySelector('#toggle-coord-edit');
        const coordDisplay = container.querySelector('#coord-display');
        const coordEdit = container.querySelector('#coord-edit');
        const coordsInput = container.querySelector('#wp-coords-input');
        const coordParseError = container.querySelector('#coord-parse-error');
        
        if (coordEditToggle && coordDisplay && coordEdit) {
            let isEditing = false;
            
            coordEditToggle.onclick = () => {
                isEditing = !isEditing;
                coordDisplay.style.display = isEditing ? 'none' : 'block';
                coordEdit.style.display = isEditing ? 'block' : 'none';
                coordEditToggle.textContent = isEditing ? 'Done' : 'Edit';
                
                if (!isEditing && coordsInput && coordsInput.value.trim()) {
                    // Try to parse coordinates when done editing
                    if (typeof Coordinates !== 'undefined') {
                        const parsed = Coordinates.parse(coordsInput.value.trim());
                        if (parsed) {
                            wp.lat = parsed.lat;
                            wp.lon = parsed.lon;
                            wp.x = 50 + (parsed.lon + 119.1892) / 0.004;
                            wp.y = 50 + (parsed.lat - 37.4215) / 0.002;
                            
                            // Update display
                            coordDisplay.innerHTML = '📍 ' + Coordinates.format(parsed.lat, parsed.lon);
                            coordParseError.style.display = 'none';
                        } else {
                            coordParseError.textContent = 'Could not parse coordinates';
                            coordParseError.style.display = 'block';
                            isEditing = true;
                            coordDisplay.style.display = 'none';
                            coordEdit.style.display = 'block';
                            coordEditToggle.textContent = 'Done';
                        }
                    }
                }
            };
            
            // Live validation as user types
            if (coordsInput) {
                coordsInput.oninput = () => {
                    const value = coordsInput.value.trim();
                    if (!value) {
                        coordParseError.style.display = 'none';
                        return;
                    }
                    
                    if (typeof Coordinates !== 'undefined') {
                        const parsed = Coordinates.parse(value);
                        if (parsed) {
                            coordParseError.style.display = 'none';
                            coordsInput.style.borderColor = 'rgba(34, 197, 94, 0.5)';
                        } else {
                            coordParseError.textContent = 'Invalid format';
                            coordParseError.style.display = 'block';
                            coordsInput.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                        }
                    }
                };
            }
        }
        
        // Photo input handlers
        const photoFileInput = container.querySelector('#photo-file-input');
        if (photoFileInput) {
            photoFileInput.onchange = (e) => handlePhotoSelect(e.target.files);
        }
        
        const photoCameraInput = container.querySelector('#photo-camera-input');
        if (photoCameraInput) {
            photoCameraInput.onchange = (e) => handlePhotoSelect(e.target.files);
        }
        
        // Initialize photo gallery event handlers
        setTimeout(() => {
            const gallery = container.querySelector('#photo-gallery');
            if (gallery) {
                // Add click handlers for remove buttons
                gallery.querySelectorAll('[data-remove-photo]').forEach(btn => {
                    btn.onclick = (e) => {
                        e.stopPropagation();
                        removePhoto(btn.dataset.removePhoto);
                    };
                });
                
                // Add click handlers for thumbnails to view full size
                gallery.querySelectorAll('.photo-thumbnail').forEach(thumb => {
                    thumb.onclick = (e) => {
                        if (e.target.classList.contains('photo-remove-btn')) return;
                        const photo = pendingPhotos.find(p => p.id === thumb.dataset.photoId);
                        if (photo) openPhotoViewer(photo);
                    };
                });
            }
            
            // Add confidence star rating handlers
            const starsContainer = container.querySelector('#confidence-stars');
            if (starsContainer) {
                starsContainer.querySelectorAll('.confidence-star').forEach(star => {
                    star.onclick = () => {
                        const rating = parseInt(star.dataset.rating);
                        currentConfidence = rating;
                        updateConfidenceDisplay(rating);
                    };
                    
                    // Hover effect
                    star.onmouseenter = () => {
                        const hoverRating = parseInt(star.dataset.rating);
                        highlightStars(hoverRating);
                    };
                    
                    star.onmouseleave = () => {
                        highlightStars(currentConfidence);
                    };
                });
            }
            
            // Add visibility option handlers
            const visibilityContainer = container.querySelector('#visibility-options');
            if (visibilityContainer) {
                visibilityContainer.querySelectorAll('.visibility-btn').forEach(btn => {
                    btn.onclick = () => {
                        currentVisibility = btn.dataset.visibility;
                        updateVisibilityDisplay(currentVisibility);
                    };
                    
                    // Hover effect
                    btn.onmouseenter = () => {
                        btn.style.transform = 'scale(1.02)';
                    };
                    btn.onmouseleave = () => {
                        btn.style.transform = 'scale(1)';
                    };
                });
            }
        }, 50);

        // Save handler
        container.querySelector('#modal-save').onclick = () => {
            const isVerified = container.querySelector('#wp-verified').checked;
            
            // Collect base data
            const data = {
                ...wp,
                name: container.querySelector('#wp-name').value || 'Unnamed Waypoint',
                type: selectedType,
                notes: container.querySelector('#wp-notes').value,
                verified: isVerified,
                confidence: currentConfidence,
                visibility: currentVisibility,
                photos: pendingPhotos  // Include photos
            };
            
            // Add creator info for community waypoints
            if (currentVisibility === 'community' && !wp.createdBy) {
                data.createdBy = 'You';
                data.source = 'local';
                data.sharedAt = new Date().toISOString();
            }
            
            // Update lastVerified if marking as verified
            if (isVerified && !wp.verified) {
                data.lastVerified = new Date().toISOString().split('T')[0];
            }
            
            // Collect type-specific field values
            const fieldValues = collectFieldValues(selectedType);
            Object.assign(data, fieldValues);
            
            // Clear fields from other types to avoid stale data
            Object.keys(Constants.WAYPOINT_TYPES).forEach(typeKey => {
                if (typeKey !== selectedType) {
                    const otherTypeConfig = Constants.WAYPOINT_TYPES[typeKey];
                    if (otherTypeConfig.fields) {
                        otherTypeConfig.fields.forEach(field => {
                            if (data[field.key] !== undefined && fieldValues[field.key] === undefined) {
                                delete data[field.key];
                            }
                        });
                    }
                }
            });

            if (isNew) {
                // Record for undo AFTER we have the final data but BEFORE adding
                if (typeof UndoModule !== 'undefined') {
                    UndoModule.recordWaypointAdd(data);
                }
                State.Waypoints.add(data);
                showToast('Waypoint added (Ctrl+Z to undo)', 'success');
            } else {
                // Record previous state for undo
                if (typeof UndoModule !== 'undefined') {
                    UndoModule.recordWaypointEdit(data, wp);
                }
                State.Waypoints.update(wp.id, data);
                showToast('Waypoint updated (Ctrl+Z to undo)', 'success');
            }

            State.persist();
            closeModal();
        };
        
        // Focus name input
        setTimeout(() => {
            const nameInput = container.querySelector('#wp-name');
            if (nameInput) {
                nameInput.focus();
            }
        }, 100);
        
        // Add keyboard support
        addKeyboardListener();
    }

    /**
     * Show delete confirmation dialog
     * @param {Object} wp - Waypoint to delete
     */
    function confirmDeleteWaypoint(wp) {
        const type = Constants.WAYPOINT_TYPES[wp.type] || Constants.WAYPOINT_TYPES.custom;
        
        // Show modal - update aria-hidden for accessibility
        container.setAttribute('aria-hidden', 'false');
        
        container.innerHTML = `
            <div class="modal-backdrop" id="modal-backdrop" role="presentation">
                <div class="modal" style="max-width:360px" role="alertdialog" aria-modal="true" aria-labelledby="delete-modal-title" aria-describedby="delete-modal-desc">
                    <div class="modal__header">
                        <h3 class="modal__title" id="delete-modal-title">Delete Waypoint?</h3>
                        <button class="modal__close" id="modal-close" aria-label="Close dialog">${Icons.get('close')}</button>
                    </div>
                    <div class="modal__body" style="text-align:center;padding:24px">
                        <div style="width:56px;height:56px;margin:0 auto 16px;background:${type.color}22;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:28px" aria-hidden="true">
                            ${type.icon}
                        </div>
                        <div style="font-size:16px;font-weight:500;margin-bottom:8px">${wp.name}</div>
                        <div id="delete-modal-desc" style="font-size:13px;color:rgba(255,255,255,0.5)">
                            Any routes using this waypoint will be affected.
                        </div>
                        <div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:8px">
                            Press Ctrl+Z to undo after deleting
                        </div>
                    </div>
                    <div class="modal__footer" style="justify-content:center">
                        <button class="btn btn--secondary" id="modal-cancel" style="min-width:100px">Cancel</button>
                        <button class="btn" id="modal-confirm-delete" style="min-width:100px;background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff" aria-label="Confirm delete ${wp.name}">Delete</button>
                    </div>
                </div>
            </div>
        `;

        container.querySelector('#modal-close').onclick = closeModal;
        container.querySelector('#modal-cancel').onclick = closeModal;
        container.querySelector('#modal-backdrop').onclick = (e) => { 
            if (e.target.id === 'modal-backdrop') closeModal(); 
        };

        container.querySelector('#modal-confirm-delete').onclick = () => {
            // Get the waypoint's index for potential restore at same position
            const waypoints = State.get('waypoints');
            const waypointIndex = waypoints.findIndex(w => w.id === wp.id);
            
            // Record for undo BEFORE making any changes
            if (typeof UndoModule !== 'undefined') {
                UndoModule.recordWaypointDelete(wp, waypointIndex);
            }
            
            // Check if waypoint is used in any routes
            const routes = State.get('routes');
            const affectedRoutes = routes.filter(r => 
                r.points?.some(p => p.waypointId === wp.id)
            );
            
            // Remove waypoint from routes
            if (affectedRoutes.length > 0) {
                affectedRoutes.forEach(route => {
                    const updatedPoints = route.points.map(p => {
                        if (p.waypointId === wp.id) {
                            // Keep the point but remove the waypoint link
                            const { waypointId, ...rest } = p;
                            return rest;
                        }
                        return p;
                    });
                    State.Routes.update(route.id, { points: updatedPoints });
                });
            }
            
            // Delete the waypoint
            State.Waypoints.remove(wp.id);
            Storage.Waypoints.delete(wp.id);
            State.persist();
            
            closeModal();
            showToast(`"${wp.name}" deleted (Ctrl+Z to undo)`, 'success');
        };
        
        // Add keyboard support
        addKeyboardListener();
    }

    function closeModal() {
        container.innerHTML = '';
        container.setAttribute('aria-hidden', 'true');
        currentWaypoint = null;
        pendingPhotos = [];  // Reset pending photos
        removeKeyboardListener();
    }

    let toastTimeout = null;
    
    function showToast(message, type = 'info', duration = 1200) {
        const toastContainer = document.getElementById('toast-container');
        
        // Clear any existing toasts immediately (prevents stacking on rapid clicks)
        while (toastContainer.firstChild) {
            toastContainer.firstChild.remove();
        }
        if (toastTimeout) {
            clearTimeout(toastTimeout);
            toastTimeout = null;
        }
        
        const toast = document.createElement('div');
        toast.className = `toast toast--${type}`;
        toast.innerHTML = `<span class="toast__icon">${Icons.get(type === 'success' ? 'check' : type === 'error' ? 'alert' : 'info')}</span><span class="toast__message">${message}</span>`;
        toast.style.cursor = 'pointer';
        toastContainer.appendChild(toast);
        
        // Click to dismiss
        toast.onclick = () => {
            if (toastTimeout) {
                clearTimeout(toastTimeout);
                toastTimeout = null;
            }
            toast.classList.add('toast--fading');
            setTimeout(() => toast.remove(), 200);
        };
        
        // Start fade-out animation before removal
        toastTimeout = setTimeout(() => {
            toast.classList.add('toast--fading');
            setTimeout(() => toast.remove(), 200);
            toastTimeout = null;
        }, duration);
    }

    return { init, openWaypointModal, confirmDeleteWaypoint, closeModal, showToast };
})();
window.ModalsModule = ModalsModule;
