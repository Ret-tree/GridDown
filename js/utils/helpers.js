/**
 * GridDown Helpers - Utility Functions
 */
const Helpers = (function() {
    'use strict';
    
    const generateId = () => Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    const formatDistance = (mi) => mi < 1 ? `${Math.round(mi * 5280)} ft` : `${mi.toFixed(1)} mi`;
    const formatDuration = (hr) => hr < 1 ? `${Math.round(hr * 60)} min` : `${Math.floor(hr)}h ${Math.round((hr % 1) * 60)}m`;
    const formatDate = (d) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const debounce = (fn, wait) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), wait); }; };
    const throttle = (fn, limit) => { let t; return (...a) => { if (!t) { fn(...a); t = true; setTimeout(() => t = false, limit); } }; };
    const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
    const isMobile = () => window.matchMedia('(max-width: 768px)').matches;
    const isTouch = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    const createElement = (tag, attrs = {}, children = []) => {
        const el = document.createElement(tag);
        Object.entries(attrs).forEach(([k, v]) => {
            if (k === 'className') el.className = v;
            else if (k === 'innerHTML') el.innerHTML = v;
            else if (k === 'textContent') el.textContent = v;
            else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
            else el.setAttribute(k, v);
        });
        children.forEach(c => el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
        return el;
    };
    
    const calcDistance = (lat1, lon1, lat2, lon2) => {
        const R = 3959, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    };
    
    const escapeHtml = (str) => {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };
    
    return { generateId, formatDistance, formatDuration, formatDate, debounce, throttle, clamp, isMobile, isTouch, createElement, calcDistance, escapeHtml };
})();
window.Helpers = Helpers;
