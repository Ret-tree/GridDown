/**
 * GridDown Coordinates - Coordinate Format Conversions
 * Supports DD, DMS, UTM, and MGRS formats
 */
const Coordinates = (function() {
    'use strict';

    // Available coordinate formats
    const FORMATS = {
        DD: 'dd',       // Decimal Degrees: 37.4215° N, 119.1892° W
        DMS: 'dms',     // Degrees Minutes Seconds: 37° 25' 17.4" N
        DDM: 'ddm',     // Degrees Decimal Minutes: 37° 25.290' N
        UTM: 'utm',     // Universal Transverse Mercator: 11S 318234 4143234
        MGRS: 'mgrs'    // Military Grid Reference: 11S LA 18234 43234
    };

    // Current selected format (default to DD)
    let currentFormat = FORMATS.DD;

    // UTM zone letters
    const UTM_ZONE_LETTERS = 'CDEFGHJKLMNPQRSTUVWXX';
    
    // MGRS 100k grid letters
    const MGRS_SET_1 = 'ABCDEFGH';
    const MGRS_SET_2 = 'JKLMNPQR';
    const MGRS_SET_3 = 'STUVWXYZ';
    const MGRS_E100K = ['ABCDEFGH', 'JKLMNPQR', 'STUVWXYZ', 'ABCDEFGH', 'JKLMNPQR', 'STUVWXYZ'];
    const MGRS_N100K = ['ABCDEFGHJKLMNPQRSTUV', 'FGHJKLMNPQRSTUVABCDE'];

    /**
     * Set the current coordinate format
     */
    function setFormat(format) {
        if (Object.values(FORMATS).includes(format)) {
            currentFormat = format;
            // Save preference
            if (typeof Storage !== 'undefined') {
                Storage.Settings.set('coordinateFormat', format);
            }
            // Emit event for UI updates
            if (typeof Events !== 'undefined') {
                Events.emit('coords:formatChanged', { format });
            }
        }
    }

    /**
     * Get the current coordinate format
     */
    function getFormat() {
        return currentFormat;
    }

    /**
     * Load saved format preference
     */
    async function loadPreference() {
        try {
            if (typeof Storage !== 'undefined') {
                const saved = await Storage.Settings.get('coordinateFormat');
                if (saved && Object.values(FORMATS).includes(saved)) {
                    currentFormat = saved;
                }
            }
        } catch (e) {
            console.warn('Could not load coordinate format preference');
        }
    }

    // ==================== Decimal Degrees (DD) ====================

    /**
     * Format lat/lon as Decimal Degrees
     * @returns "37.4215° N, 119.1892° W"
     */
    function toDD(lat, lon, precision = 4) {
        const latDir = lat >= 0 ? 'N' : 'S';
        const lonDir = lon >= 0 ? 'E' : 'W';
        return `${Math.abs(lat).toFixed(precision)}° ${latDir}, ${Math.abs(lon).toFixed(precision)}° ${lonDir}`;
    }

    /**
     * Format as compact DD (no spaces)
     * @returns "37.4215°N 119.1892°W"
     */
    function toDDCompact(lat, lon, precision = 4) {
        const latDir = lat >= 0 ? 'N' : 'S';
        const lonDir = lon >= 0 ? 'E' : 'W';
        return `${Math.abs(lat).toFixed(precision)}°${latDir} ${Math.abs(lon).toFixed(precision)}°${lonDir}`;
    }

    // ==================== Degrees Minutes Seconds (DMS) ====================

    /**
     * Convert decimal degrees to DMS components
     */
    function ddToDMSParts(dd) {
        const sign = dd < 0 ? -1 : 1;
        const abs = Math.abs(dd);
        const deg = Math.floor(abs);
        const minFloat = (abs - deg) * 60;
        const min = Math.floor(minFloat);
        const sec = (minFloat - min) * 60;
        return { deg, min, sec, sign };
    }

    /**
     * Format lat/lon as Degrees Minutes Seconds
     * @returns "37° 25' 17.4" N, 119° 11' 21.1" W"
     */
    function toDMS(lat, lon, secPrecision = 1) {
        const latParts = ddToDMSParts(lat);
        const lonParts = ddToDMSParts(lon);
        const latDir = lat >= 0 ? 'N' : 'S';
        const lonDir = lon >= 0 ? 'E' : 'W';
        
        return `${latParts.deg}° ${latParts.min}' ${latParts.sec.toFixed(secPrecision)}" ${latDir}, ` +
               `${lonParts.deg}° ${lonParts.min}' ${lonParts.sec.toFixed(secPrecision)}" ${lonDir}`;
    }

    /**
     * Format as compact DMS
     * @returns "37°25'17.4"N 119°11'21.1"W"
     */
    function toDMSCompact(lat, lon, secPrecision = 1) {
        const latParts = ddToDMSParts(lat);
        const lonParts = ddToDMSParts(lon);
        const latDir = lat >= 0 ? 'N' : 'S';
        const lonDir = lon >= 0 ? 'E' : 'W';
        
        return `${latParts.deg}°${latParts.min}'${latParts.sec.toFixed(secPrecision)}"${latDir} ` +
               `${lonParts.deg}°${lonParts.min}'${lonParts.sec.toFixed(secPrecision)}"${lonDir}`;
    }

    // ==================== Degrees Decimal Minutes (DDM) ====================

    /**
     * Format lat/lon as Degrees Decimal Minutes
     * @returns "37° 25.290' N, 119° 11.352' W"
     */
    function toDDM(lat, lon, minPrecision = 3) {
        const latAbs = Math.abs(lat);
        const lonAbs = Math.abs(lon);
        const latDeg = Math.floor(latAbs);
        const lonDeg = Math.floor(lonAbs);
        const latMin = (latAbs - latDeg) * 60;
        const lonMin = (lonAbs - lonDeg) * 60;
        const latDir = lat >= 0 ? 'N' : 'S';
        const lonDir = lon >= 0 ? 'E' : 'W';
        
        return `${latDeg}° ${latMin.toFixed(minPrecision)}' ${latDir}, ` +
               `${lonDeg}° ${lonMin.toFixed(minPrecision)}' ${lonDir}`;
    }

    /**
     * Format as compact DDM
     */
    function toDDMCompact(lat, lon, minPrecision = 3) {
        const latAbs = Math.abs(lat);
        const lonAbs = Math.abs(lon);
        const latDeg = Math.floor(latAbs);
        const lonDeg = Math.floor(lonAbs);
        const latMin = (latAbs - latDeg) * 60;
        const lonMin = (lonAbs - lonDeg) * 60;
        const latDir = lat >= 0 ? 'N' : 'S';
        const lonDir = lon >= 0 ? 'E' : 'W';
        
        return `${latDeg}°${latMin.toFixed(minPrecision)}'${latDir} ` +
               `${lonDeg}°${lonMin.toFixed(minPrecision)}'${lonDir}`;
    }

    // ==================== UTM (Universal Transverse Mercator) ====================

    /**
     * Convert lat/lon to UTM
     * @returns { zone, letter, easting, northing }
     */
    function latLonToUTM(lat, lon) {
        // Constants
        const a = 6378137; // WGS84 semi-major axis
        const f = 1 / 298.257223563; // WGS84 flattening
        const k0 = 0.9996; // UTM scale factor
        
        const e = Math.sqrt(2 * f - f * f); // eccentricity
        const e2 = e * e;
        const ep2 = e2 / (1 - e2); // e prime squared
        
        // Zone calculation
        let zone = Math.floor((lon + 180) / 6) + 1;
        
        // Handle Norway/Svalbard exceptions
        if (lat >= 56 && lat < 64 && lon >= 3 && lon < 12) zone = 32;
        if (lat >= 72 && lat < 84) {
            if (lon >= 0 && lon < 9) zone = 31;
            else if (lon >= 9 && lon < 21) zone = 33;
            else if (lon >= 21 && lon < 33) zone = 35;
            else if (lon >= 33 && lon < 42) zone = 37;
        }
        
        // Central meridian
        const lon0 = (zone - 1) * 6 - 180 + 3;
        
        // Convert to radians
        const latRad = lat * Math.PI / 180;
        const lonRad = lon * Math.PI / 180;
        const lon0Rad = lon0 * Math.PI / 180;
        
        const N = a / Math.sqrt(1 - e2 * Math.sin(latRad) * Math.sin(latRad));
        const T = Math.tan(latRad) * Math.tan(latRad);
        const C = ep2 * Math.cos(latRad) * Math.cos(latRad);
        const A = Math.cos(latRad) * (lonRad - lon0Rad);
        
        const M = a * (
            (1 - e2/4 - 3*e2*e2/64 - 5*e2*e2*e2/256) * latRad -
            (3*e2/8 + 3*e2*e2/32 + 45*e2*e2*e2/1024) * Math.sin(2*latRad) +
            (15*e2*e2/256 + 45*e2*e2*e2/1024) * Math.sin(4*latRad) -
            (35*e2*e2*e2/3072) * Math.sin(6*latRad)
        );
        
        const easting = k0 * N * (A + (1-T+C)*A*A*A/6 + (5-18*T+T*T+72*C-58*ep2)*A*A*A*A*A/120) + 500000;
        
        let northing = k0 * (M + N * Math.tan(latRad) * (
            A*A/2 + (5-T+9*C+4*C*C)*A*A*A*A/24 +
            (61-58*T+T*T+600*C-330*ep2)*A*A*A*A*A*A/720
        ));
        
        if (lat < 0) northing += 10000000; // Southern hemisphere offset
        
        // Zone letter
        const letter = getUTMZoneLetter(lat);
        
        return {
            zone,
            letter,
            easting: Math.round(easting),
            northing: Math.round(northing)
        };
    }

    /**
     * Get UTM zone letter for latitude
     */
    function getUTMZoneLetter(lat) {
        if (lat >= -80 && lat < 84) {
            const index = Math.floor((lat + 80) / 8);
            return UTM_ZONE_LETTERS[Math.min(index, 20)];
        }
        return 'Z'; // Outside UTM limits
    }

    /**
     * Format as UTM string
     * @returns "11S 318234 4143234"
     */
    function toUTM(lat, lon) {
        const utm = latLonToUTM(lat, lon);
        return `${utm.zone}${utm.letter} ${utm.easting} ${utm.northing}`;
    }

    /**
     * Convert UTM to lat/lon
     */
    function utmToLatLon(zone, letter, easting, northing) {
        const a = 6378137;
        const f = 1 / 298.257223563;
        const k0 = 0.9996;
        
        const e = Math.sqrt(2 * f - f * f);
        const e2 = e * e;
        const ep2 = e2 / (1 - e2);
        const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
        
        // Determine hemisphere from letter
        const isNorth = letter.toUpperCase() >= 'N';
        
        const x = easting - 500000;
        const y = isNorth ? northing : northing - 10000000;
        
        const lon0 = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180;
        
        const M = y / k0;
        const mu = M / (a * (1 - e2/4 - 3*e2*e2/64 - 5*e2*e2*e2/256));
        
        const phi1 = mu + 
            (3*e1/2 - 27*e1*e1*e1/32) * Math.sin(2*mu) +
            (21*e1*e1/16 - 55*e1*e1*e1*e1/32) * Math.sin(4*mu) +
            (151*e1*e1*e1/96) * Math.sin(6*mu);
        
        const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) * Math.sin(phi1));
        const T1 = Math.tan(phi1) * Math.tan(phi1);
        const C1 = ep2 * Math.cos(phi1) * Math.cos(phi1);
        const R1 = a * (1 - e2) / Math.pow(1 - e2 * Math.sin(phi1) * Math.sin(phi1), 1.5);
        const D = x / (N1 * k0);
        
        const lat = phi1 - (N1 * Math.tan(phi1) / R1) * (
            D*D/2 - (5 + 3*T1 + 10*C1 - 4*C1*C1 - 9*ep2) * D*D*D*D/24 +
            (61 + 90*T1 + 298*C1 + 45*T1*T1 - 252*ep2 - 3*C1*C1) * D*D*D*D*D*D/720
        );
        
        const lon = lon0 + (
            D - (1 + 2*T1 + C1) * D*D*D/6 +
            (5 - 2*C1 + 28*T1 - 3*C1*C1 + 8*ep2 + 24*T1*T1) * D*D*D*D*D/120
        ) / Math.cos(phi1);
        
        return {
            lat: lat * 180 / Math.PI,
            lon: lon * 180 / Math.PI
        };
    }

    // ==================== MGRS (Military Grid Reference System) ====================

    /**
     * Convert lat/lon to MGRS
     * @returns { zone, letter, col, row, easting, northing }
     */
    function latLonToMGRS(lat, lon, precision = 5) {
        const utm = latLonToUTM(lat, lon);
        
        // Get 100km grid square
        const set = (utm.zone - 1) % 6;
        const e100k = Math.floor(utm.easting / 100000);
        const n100k = Math.floor(utm.northing / 100000) % 20;
        
        const col = MGRS_E100K[set][e100k - 1] || 'A';
        const row = MGRS_N100K[set % 2][n100k] || 'A';
        
        // Get numeric portion
        const e = utm.easting % 100000;
        const n = utm.northing % 100000;
        
        // Format to precision
        const divisor = Math.pow(10, 5 - precision);
        const eStr = String(Math.floor(e / divisor)).padStart(precision, '0');
        const nStr = String(Math.floor(n / divisor)).padStart(precision, '0');
        
        return {
            zone: utm.zone,
            letter: utm.letter,
            col,
            row,
            easting: eStr,
            northing: nStr
        };
    }

    /**
     * Format as MGRS string
     * @returns "11S LA 18234 43234" (precision 5) or "11S LA 182 432" (precision 3)
     */
    function toMGRS(lat, lon, precision = 5) {
        const mgrs = latLonToMGRS(lat, lon, precision);
        return `${mgrs.zone}${mgrs.letter} ${mgrs.col}${mgrs.row} ${mgrs.easting} ${mgrs.northing}`;
    }

    /**
     * Format as compact MGRS (no spaces)
     * @returns "11SLA1823443234"
     */
    function toMGRSCompact(lat, lon, precision = 5) {
        const mgrs = latLonToMGRS(lat, lon, precision);
        return `${mgrs.zone}${mgrs.letter}${mgrs.col}${mgrs.row}${mgrs.easting}${mgrs.northing}`;
    }

    /**
     * Parse MGRS string to lat/lon
     */
    function mgrsToLatLon(mgrsString) {
        // Remove spaces and parse
        const clean = mgrsString.replace(/\s+/g, '').toUpperCase();
        
        // Parse zone number (1-2 digits)
        const zoneMatch = clean.match(/^(\d{1,2})([A-Z])([A-Z]{2})(\d+)$/);
        if (!zoneMatch) {
            throw new Error('Invalid MGRS format');
        }
        
        const zone = parseInt(zoneMatch[1]);
        const letter = zoneMatch[2];
        const grid = zoneMatch[3];
        const coords = zoneMatch[4];
        
        if (coords.length % 2 !== 0) {
            throw new Error('MGRS coordinates must have even length');
        }
        
        const precision = coords.length / 2;
        const eStr = coords.substring(0, precision);
        const nStr = coords.substring(precision);
        
        // Convert to full easting/northing
        const multiplier = Math.pow(10, 5 - precision);
        const col = grid[0];
        const row = grid[1];
        
        // Find 100k square
        const set = (zone - 1) % 6;
        const e100k = MGRS_E100K[set].indexOf(col) + 1;
        const n100k = MGRS_N100K[set % 2].indexOf(row);
        
        const easting = e100k * 100000 + parseInt(eStr) * multiplier;
        let northing = n100k * 100000 + parseInt(nStr) * multiplier;
        
        // Adjust northing for latitude band
        const latBand = UTM_ZONE_LETTERS.indexOf(letter);
        if (latBand > 10) { // Northern hemisphere reference
            // May need to add 2000000 for proper northing
        }
        
        return utmToLatLon(zone, letter, easting, northing);
    }

    // ==================== Format Selection ====================

    /**
     * Format coordinates using current selected format
     */
    function format(lat, lon, options = {}) {
        const fmt = options.format || currentFormat;
        const compact = options.compact || false;
        
        switch (fmt) {
            case FORMATS.DMS:
                return compact ? toDMSCompact(lat, lon) : toDMS(lat, lon);
            case FORMATS.DDM:
                return compact ? toDDMCompact(lat, lon) : toDDM(lat, lon);
            case FORMATS.UTM:
                return toUTM(lat, lon);
            case FORMATS.MGRS:
                return compact ? toMGRSCompact(lat, lon) : toMGRS(lat, lon);
            case FORMATS.DD:
            default:
                return compact ? toDDCompact(lat, lon) : toDD(lat, lon);
        }
    }

    /**
     * Format for display (shorter version for UI)
     */
    function formatShort(lat, lon) {
        switch (currentFormat) {
            case FORMATS.DMS:
                return toDMSCompact(lat, lon, 0);
            case FORMATS.DDM:
                return toDDMCompact(lat, lon, 2);
            case FORMATS.UTM:
                return toUTM(lat, lon);
            case FORMATS.MGRS:
                return toMGRS(lat, lon, 4);
            case FORMATS.DD:
            default:
                return toDDCompact(lat, lon, 4);
        }
    }

    // ==================== Parsing ====================

    /**
     * Parse coordinate string in any supported format
     * @returns { lat, lon } or null if invalid
     */
    function parse(coordString) {
        const clean = coordString.trim();
        
        // Try MGRS first (most specific pattern)
        if (/^\d{1,2}[A-Z]\s*[A-Z]{2}\s*\d+$/i.test(clean)) {
            try {
                return mgrsToLatLon(clean);
            } catch (e) {
                // Continue to other formats
            }
        }
        
        // Try UTM: "11S 318234 4143234"
        const utmMatch = clean.match(/^(\d{1,2})([A-Z])\s+(\d+)\s+(\d+)$/i);
        if (utmMatch) {
            try {
                return utmToLatLon(
                    parseInt(utmMatch[1]),
                    utmMatch[2],
                    parseInt(utmMatch[3]),
                    parseInt(utmMatch[4])
                );
            } catch (e) {
                // Continue
            }
        }
        
        // Try DMS: "37° 25' 17.4" N, 119° 11' 21.1" W"
        const dmsMatch = clean.match(/(\d+)[°]\s*(\d+)[′']\s*([\d.]+)[″"]?\s*([NS])[,\s]+(\d+)[°]\s*(\d+)[′']\s*([\d.]+)[″"]?\s*([EW])/i);
        if (dmsMatch) {
            let lat = parseInt(dmsMatch[1]) + parseInt(dmsMatch[2])/60 + parseFloat(dmsMatch[3])/3600;
            let lon = parseInt(dmsMatch[5]) + parseInt(dmsMatch[6])/60 + parseFloat(dmsMatch[7])/3600;
            if (dmsMatch[4].toUpperCase() === 'S') lat = -lat;
            if (dmsMatch[8].toUpperCase() === 'W') lon = -lon;
            return { lat, lon };
        }
        
        // Try DDM: "37° 25.290' N, 119° 11.352' W"
        const ddmMatch = clean.match(/(\d+)[°]\s*([\d.]+)[′']?\s*([NS])[,\s]+(\d+)[°]\s*([\d.]+)[′']?\s*([EW])/i);
        if (ddmMatch) {
            let lat = parseInt(ddmMatch[1]) + parseFloat(ddmMatch[2])/60;
            let lon = parseInt(ddmMatch[4]) + parseFloat(ddmMatch[5])/60;
            if (ddmMatch[3].toUpperCase() === 'S') lat = -lat;
            if (ddmMatch[6].toUpperCase() === 'W') lon = -lon;
            return { lat, lon };
        }
        
        // Try DD: "37.4215° N, 119.1892° W" or "37.4215, -119.1892"
        const ddMatch1 = clean.match(/([\d.]+)[°]?\s*([NS])[,\s]+([\d.]+)[°]?\s*([EW])/i);
        if (ddMatch1) {
            let lat = parseFloat(ddMatch1[1]);
            let lon = parseFloat(ddMatch1[3]);
            if (ddMatch1[2].toUpperCase() === 'S') lat = -lat;
            if (ddMatch1[4].toUpperCase() === 'W') lon = -lon;
            return { lat, lon };
        }
        
        // Simple decimal: "37.4215, -119.1892"
        const ddMatch2 = clean.match(/^([-\d.]+)[,\s]+([-\d.]+)$/);
        if (ddMatch2) {
            const lat = parseFloat(ddMatch2[1]);
            const lon = parseFloat(ddMatch2[2]);
            if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
                return { lat, lon };
            }
        }
        
        return null;
    }

    /**
     * Validate if a string is a valid coordinate in any format
     */
    function isValid(coordString) {
        return parse(coordString) !== null;
    }

    // ==================== Distance/Bearing ====================

    /**
     * Calculate distance between two points (Haversine)
     * @returns distance in miles
     */
    function distance(lat1, lon1, lat2, lon2) {
        const R = 3959; // Earth radius in miles
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) ** 2 + 
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
                  Math.sin(dLon/2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    /**
     * Calculate initial bearing from point 1 to point 2
     * @returns bearing in degrees (0-360)
     */
    function bearing(lat1, lon1, lat2, lon2) {
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;
        
        const y = Math.sin(Δλ) * Math.cos(φ2);
        const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
        
        let θ = Math.atan2(y, x) * 180 / Math.PI;
        return (θ + 360) % 360;
    }

    /**
     * Format bearing as compass direction
     * @returns "N", "NE", "E", etc.
     */
    function bearingToCompass(deg) {
        const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 
                          'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
        const index = Math.round(deg / 22.5) % 16;
        return directions[index];
    }

    /**
     * Format bearing with both degrees and compass
     * @returns "045° (NE)"
     */
    function formatBearing(deg) {
        return `${Math.round(deg).toString().padStart(3, '0')}° (${bearingToCompass(deg)})`;
    }

    // Public API
    return {
        FORMATS,
        setFormat,
        getFormat,
        loadPreference,
        
        // Individual format functions
        toDD,
        toDDCompact,
        toDMS,
        toDMSCompact,
        toDDM,
        toDDMCompact,
        toUTM,
        toMGRS,
        toMGRSCompact,
        
        // Conversion functions
        latLonToUTM,
        utmToLatLon,
        latLonToMGRS,
        mgrsToLatLon,
        
        // Generic format/parse
        format,
        formatShort,
        parse,
        isValid,
        
        // Distance/Bearing
        distance,
        bearing,
        bearingToCompass,
        formatBearing
    };
})();

window.Coordinates = Coordinates;
