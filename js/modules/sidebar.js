/**
 * GridDown Sidebar Module - Navigation
 */
const SidebarModule = (function() {
    'use strict';
    let el;

    function init() {
        el = document.getElementById('sidebar');
        if (!el) return;
        render();
        State.subscribe(render, ['activePanel', 'isOffline']);
    }

    function render() {
        const active = State.get('activePanel');
        const offline = State.get('isOffline');
        
        // Preserve nav scroll position across innerHTML rebuild
        const navEl = el ? el.querySelector('.sidebar__nav') : null;
        const savedScroll = navEl ? navEl.scrollTop : 0;
        
        el.innerHTML = `
            <div class="sidebar__logo" role="img" aria-label="GridDown logo">${Icons.get('compass')}</div>
            <button class="sidebar__search" id="sidebar-search" title="Search (Ctrl+K)" aria-label="Search. Keyboard shortcut: Control plus K" aria-keyshortcuts="Control+K">
                ${Icons.get('search')}
            </button>
            <nav class="sidebar__nav" role="menubar" aria-label="Main navigation">
                ${(() => {
                    let lastCategory = '';
                    let menuIndex = 0;
                    return Constants.NAV_ITEMS.map((item) => {
                        let divider = '';
                        if (item.category && item.category !== lastCategory) {
                            // Skip divider before first category (EMERGENCY is visually distinct)
                            if (lastCategory !== '') {
                                divider = `<div class="sidebar__divider" role="separator" aria-hidden="true"><span class="sidebar__divider-label">${item.category}</span></div>`;
                            }
                            lastCategory = item.category;
                        }
                        const idx = menuIndex++;
                        return divider + `
                    <button class="sidebar__nav-item ${active === item.id ? 'sidebar__nav-item--active' : ''}" 
                            data-panel="${item.id}"
                            role="menuitem"
                            aria-current="${active === item.id ? 'page' : 'false'}"
                            aria-label="${item.label} panel"
                            tabindex="${idx === 0 ? '0' : '-1'}">
                        <span aria-hidden="true">${Icons.get(item.icon)}</span>
                        <span class="sidebar__nav-label">${item.label}</span>
                    </button>`;
                    }).join('');
                })()}
            </nav>
            <div class="sidebar__spacer"></div>
            <div class="sidebar__status" role="status" aria-live="polite" aria-label="Connection status">
                <div class="sidebar__status-dot ${offline ? 'sidebar__status-dot--offline' : 'sidebar__status-dot--online'}" aria-hidden="true"></div>
                <span class="sidebar__status-label">${offline ? 'OFFLINE' : 'ONLINE'}</span>
            </div>
            <button class="sidebar__settings" data-panel="settings" aria-label="Settings" title="Settings">${Icons.get('settings')}</button>
        `;
        
        // Search button handler
        const searchBtn = el.querySelector('#sidebar-search');
        if (searchBtn) {
            searchBtn.onclick = () => {
                if (typeof SearchModule !== 'undefined') {
                    SearchModule.open();
                }
            };
        }
        
        // Add keyboard navigation for menubar
        const navItems = el.querySelectorAll('[role="menuitem"]');
        navItems.forEach((btn, index) => {
            btn.addEventListener('keydown', (e) => {
                let nextIndex;
                if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    nextIndex = (index + 1) % navItems.length;
                } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                    e.preventDefault();
                    nextIndex = (index - 1 + navItems.length) % navItems.length;
                } else if (e.key === 'Home') {
                    e.preventDefault();
                    nextIndex = 0;
                } else if (e.key === 'End') {
                    e.preventDefault();
                    nextIndex = navItems.length - 1;
                }
                if (nextIndex !== undefined) {
                    navItems[index].setAttribute('tabindex', '-1');
                    navItems[nextIndex].setAttribute('tabindex', '0');
                    navItems[nextIndex].focus();
                }
            });
        });
        
        el.querySelectorAll('[data-panel]').forEach(btn => {
            btn.onclick = () => {
                State.UI.setActivePanel(btn.dataset.panel);
                Events.emit(Events.EVENTS.PANEL_CHANGE, { panel: btn.dataset.panel });
                State.UI.openPanel();
            };
        });
        
        // Restore nav scroll position
        if (savedScroll > 0) {
            const newNavEl = el.querySelector('.sidebar__nav');
            if (newNavEl) newNavEl.scrollTop = savedScroll;
        }
    }

    return { init, render };
})();
window.SidebarModule = SidebarModule;
