/**
 * GridDown Celestial Navigation Module - Phase 1: Celestial Almanac
 * 
 * Provides navigation-grade celestial body positions for:
 * - Sun (GHA, Declination, Semi-diameter)
 * - Moon (GHA, Declination, Horizontal Parallax, Semi-diameter)
 * - Planets (Venus, Mars, Jupiter, Saturn)
 * - 57 Navigation Stars
 * - Aries GHA (First Point of Aries)
 * 
 * All algorithms based on public domain astronomical formulas.
 * Accuracy: ~1 arcminute for sun/moon, ~2 arcminutes for planets
 * 
 * References:
 * - Jean Meeus, "Astronomical Algorithms" (mathematical formulas)
 * - US Naval Observatory Nautical Almanac (data validation)
 * - VSOP87 planetary theory (simplified)
 */
const CelestialModule = (function() {
    'use strict';
    
    // ==================== CONSTANTS ====================
    
    const DEG_TO_RAD = Math.PI / 180;
    const RAD_TO_DEG = 180 / Math.PI;
    const HOURS_TO_DEG = 15;  // 360° / 24h
    const DEG_TO_HOURS = 1 / 15;
    
    // J2000.0 epoch (January 1, 2000, 12:00 TT)
    const J2000 = 2451545.0;
    
    // Astronomical Unit in km
    const AU_KM = 149597870.7;
    
    // Earth's radius in km
    const EARTH_RADIUS_KM = 6371;
    
    // Sun's semi-diameter at 1 AU (arcminutes)
    const SUN_SD_1AU = 15.99;
    
    // Moon's semi-diameter at mean distance (arcminutes)  
    const MOON_SD_MEAN = 15.5;
    
    // Moon's horizontal parallax at mean distance (arcminutes)
    const MOON_HP_MEAN = 57.0;
    
    // ==================== 57 NAVIGATION STARS ====================
    // Sidereal Hour Angle (SHA) and Declination for epoch J2000.0
    // SHA = 360° - Right Ascension (converted from hours to degrees)
    
    const NAVIGATION_STARS = {
        // First magnitude stars (most important)
        'Alpheratz': { sha: 357.54, dec: 29.09, mag: 2.1, constellation: 'Andromeda' },
        'Ankaa': { sha: 353.26, dec: -42.31, mag: 2.4, constellation: 'Phoenix' },
        'Schedar': { sha: 349.52, dec: 56.54, mag: 2.2, constellation: 'Cassiopeia' },
        'Diphda': { sha: 349.07, dec: -17.98, mag: 2.0, constellation: 'Cetus' },
        'Achernar': { sha: 335.34, dec: -57.24, mag: 0.5, constellation: 'Eridanus' },
        'Hamal': { sha: 328.13, dec: 23.46, mag: 2.0, constellation: 'Aries' },
        'Polaris': { sha: 316.41, dec: 89.26, mag: 2.0, constellation: 'Ursa Minor' },
        'Acamar': { sha: 315.26, dec: -40.30, mag: 2.9, constellation: 'Eridanus' },
        'Menkar': { sha: 314.26, dec: 4.08, mag: 2.5, constellation: 'Cetus' },
        'Mirfak': { sha: 308.56, dec: 49.87, mag: 1.8, constellation: 'Perseus' },
        'Aldebaran': { sha: 291.03, dec: 16.51, mag: 0.9, constellation: 'Taurus' },
        'Rigel': { sha: 281.22, dec: -8.20, mag: 0.1, constellation: 'Orion' },
        'Capella': { sha: 280.50, dec: 46.00, mag: 0.1, constellation: 'Auriga' },
        'Bellatrix': { sha: 278.55, dec: 6.35, mag: 1.6, constellation: 'Orion' },
        'Elnath': { sha: 278.26, dec: 28.61, mag: 1.7, constellation: 'Taurus' },
        'Alnilam': { sha: 275.72, dec: -1.20, mag: 1.7, constellation: 'Orion' },
        'Betelgeuse': { sha: 271.13, dec: 7.41, mag: 0.4, constellation: 'Orion' },
        'Canopus': { sha: 264.01, dec: -52.70, mag: -0.7, constellation: 'Carina' },
        'Sirius': { sha: 258.44, dec: -16.72, mag: -1.5, constellation: 'Canis Major' },
        'Adhara': { sha: 255.21, dec: -28.97, mag: 1.5, constellation: 'Canis Major' },
        'Procyon': { sha: 245.18, dec: 5.22, mag: 0.4, constellation: 'Canis Minor' },
        'Pollux': { sha: 243.41, dec: 27.95, mag: 1.1, constellation: 'Gemini' },
        'Avior': { sha: 234.22, dec: -59.51, mag: 1.9, constellation: 'Carina' },
        'Suhail': { sha: 223.01, dec: -43.43, mag: 2.2, constellation: 'Vela' },
        'Miaplacidus': { sha: 221.59, dec: -69.72, mag: 1.7, constellation: 'Carina' },
        'Alphard': { sha: 218.06, dec: -8.66, mag: 2.0, constellation: 'Hydra' },
        'Regulus': { sha: 207.67, dec: 11.97, mag: 1.4, constellation: 'Leo' },
        'Dubhe': { sha: 194.05, dec: 61.75, mag: 1.8, constellation: 'Ursa Major' },
        'Denebola': { sha: 182.44, dec: 14.57, mag: 2.1, constellation: 'Leo' },
        'Gienah': { sha: 176.03, dec: -17.54, mag: 2.6, constellation: 'Corvus' },
        'Acrux': { sha: 173.21, dec: -63.10, mag: 0.8, constellation: 'Crux' },
        'Gacrux': { sha: 172.13, dec: -57.11, mag: 1.6, constellation: 'Crux' },
        'Alioth': { sha: 166.30, dec: 55.96, mag: 1.8, constellation: 'Ursa Major' },
        'Spica': { sha: 158.42, dec: -11.16, mag: 1.0, constellation: 'Virgo' },
        'Alkaid': { sha: 153.07, dec: 49.31, mag: 1.9, constellation: 'Ursa Major' },
        'Hadar': { sha: 148.82, dec: -60.37, mag: 0.6, constellation: 'Centaurus' },
        'Menkent': { sha: 148.19, dec: -36.37, mag: 2.1, constellation: 'Centaurus' },
        'Arcturus': { sha: 146.05, dec: 19.18, mag: -0.1, constellation: 'Boötes' },
        'Rigil Kent': { sha: 140.06, dec: -60.83, mag: -0.3, constellation: 'Centaurus' },
        'Zubenelgenubi': { sha: 137.17, dec: -16.04, mag: 2.8, constellation: 'Libra' },
        'Kochab': { sha: 137.19, dec: 74.16, mag: 2.1, constellation: 'Ursa Minor' },
        'Alphecca': { sha: 126.20, dec: 26.71, mag: 2.2, constellation: 'Corona Borealis' },
        'Antares': { sha: 112.41, dec: -26.43, mag: 1.0, constellation: 'Scorpius' },
        'Atria': { sha: 107.51, dec: -69.03, mag: 1.9, constellation: 'Triangulum Australe' },
        'Sabik': { sha: 102.25, dec: -15.72, mag: 2.4, constellation: 'Ophiuchus' },
        'Shaula': { sha: 96.36, dec: -37.10, mag: 1.6, constellation: 'Scorpius' },
        'Rasalhague': { sha: 96.05, dec: 12.56, mag: 2.1, constellation: 'Ophiuchus' },
        'Eltanin': { sha: 90.46, dec: 51.49, mag: 2.2, constellation: 'Draco' },
        'Kaus Australis': { sha: 83.76, dec: -34.38, mag: 1.8, constellation: 'Sagittarius' },
        'Vega': { sha: 80.74, dec: 38.78, mag: 0.0, constellation: 'Lyra' },
        'Nunki': { sha: 76.11, dec: -26.30, mag: 2.0, constellation: 'Sagittarius' },
        'Altair': { sha: 62.19, dec: 8.87, mag: 0.8, constellation: 'Aquila' },
        'Peacock': { sha: 53.36, dec: -56.74, mag: 1.9, constellation: 'Pavo' },
        'Deneb': { sha: 49.39, dec: 45.28, mag: 1.3, constellation: 'Cygnus' },
        'Enif': { sha: 33.97, dec: 9.88, mag: 2.4, constellation: 'Pegasus' },
        'Alnair': { sha: 27.87, dec: -46.96, mag: 1.7, constellation: 'Grus' },
        'Fomalhaut': { sha: 15.35, dec: -29.62, mag: 1.2, constellation: 'Piscis Austrinus' },
        'Markab': { sha: 13.49, dec: 15.21, mag: 2.5, constellation: 'Pegasus' }
    };
    
    // ==================== PLANET DATA ====================
    // Orbital elements for epoch J2000.0 and their rates of change
    // Based on simplified VSOP87 theory
    
    const PLANET_ELEMENTS = {
        mercury: {
            a: 0.38709927, a_rate: 0.00000037,  // Semi-major axis (AU)
            e: 0.20563593, e_rate: 0.00001906,  // Eccentricity
            I: 7.00497902, I_rate: -0.00594749, // Inclination (deg)
            L: 252.25032350, L_rate: 149472.67411175, // Mean longitude (deg)
            w: 77.45779628, w_rate: 0.16047689,  // Longitude of perihelion (deg)
            O: 48.33076593, O_rate: -0.12534081  // Longitude of ascending node (deg)
        },
        venus: {
            a: 0.72333566, a_rate: 0.00000390,
            e: 0.00677672, e_rate: -0.00004107,
            I: 3.39467605, I_rate: -0.00078890,
            L: 181.97909950, L_rate: 58517.81538729,
            w: 131.60246718, w_rate: 0.00268329,
            O: 76.67984255, O_rate: -0.27769418
        },
        earth: {
            a: 1.00000261, a_rate: 0.00000562,
            e: 0.01671123, e_rate: -0.00004392,
            I: -0.00001531, I_rate: -0.01294668,
            L: 100.46457166, L_rate: 35999.37244981,
            w: 102.93768193, w_rate: 0.32327364,
            O: 0.0, O_rate: 0.0
        },
        mars: {
            a: 1.52371034, a_rate: 0.00001847,
            e: 0.09339410, e_rate: 0.00007882,
            I: 1.84969142, I_rate: -0.00813131,
            L: -4.55343205, L_rate: 19140.30268499,
            w: -23.94362959, w_rate: 0.44441088,
            O: 49.55953891, O_rate: -0.29257343
        },
        jupiter: {
            a: 5.20288700, a_rate: -0.00011607,
            e: 0.04838624, e_rate: -0.00013253,
            I: 1.30439695, I_rate: -0.00183714,
            L: 34.39644051, L_rate: 3034.74612775,
            w: 14.72847983, w_rate: 0.21252668,
            O: 100.47390909, O_rate: 0.20469106
        },
        saturn: {
            a: 9.53667594, a_rate: -0.00125060,
            e: 0.05386179, e_rate: -0.00050991,
            I: 2.48599187, I_rate: 0.00193609,
            L: 49.95424423, L_rate: 1222.49362201,
            w: 92.59887831, w_rate: -0.41897216,
            O: 113.66242448, O_rate: -0.28867794
        }
    };
    
    // ==================== JULIAN DATE FUNCTIONS ====================
    
    /**
     * Convert Date to Julian Day Number
     * @param {Date} date - JavaScript Date object (UTC)
     * @returns {number} Julian Day Number
     */
    function dateToJD(date) {
        const year = date.getUTCFullYear();
        const month = date.getUTCMonth() + 1;
        const day = date.getUTCDate();
        const hour = date.getUTCHours() + date.getUTCMinutes() / 60 + 
                     date.getUTCSeconds() / 3600 + date.getUTCMilliseconds() / 3600000;
        
        let y = year;
        let m = month;
        
        if (m <= 2) {
            y -= 1;
            m += 12;
        }
        
        const A = Math.floor(y / 100);
        const B = 2 - A + Math.floor(A / 4);
        
        return Math.floor(365.25 * (y + 4716)) + 
               Math.floor(30.6001 * (m + 1)) + 
               day + hour / 24 + B - 1524.5;
    }
    
    /**
     * Convert Julian Day to Date
     * @param {number} jd - Julian Day Number
     * @returns {Date} JavaScript Date object (UTC)
     */
    function jdToDate(jd) {
        const Z = Math.floor(jd + 0.5);
        const F = jd + 0.5 - Z;
        
        let A;
        if (Z < 2299161) {
            A = Z;
        } else {
            const alpha = Math.floor((Z - 1867216.25) / 36524.25);
            A = Z + 1 + alpha - Math.floor(alpha / 4);
        }
        
        const B = A + 1524;
        const C = Math.floor((B - 122.1) / 365.25);
        const D = Math.floor(365.25 * C);
        const E = Math.floor((B - D) / 30.6001);
        
        const day = B - D - Math.floor(30.6001 * E) + F;
        const month = E < 14 ? E - 1 : E - 13;
        const year = month > 2 ? C - 4716 : C - 4715;
        
        const dayInt = Math.floor(day);
        const dayFrac = day - dayInt;
        const hours = dayFrac * 24;
        const hoursInt = Math.floor(hours);
        const minutes = (hours - hoursInt) * 60;
        const minutesInt = Math.floor(minutes);
        const seconds = (minutes - minutesInt) * 60;
        
        return new Date(Date.UTC(year, month - 1, dayInt, hoursInt, minutesInt, Math.floor(seconds)));
    }
    
    /**
     * Calculate Julian centuries from J2000.0
     * @param {number} jd - Julian Day Number
     * @returns {number} Julian centuries from J2000.0
     */
    function julianCenturies(jd) {
        return (jd - J2000) / 36525;
    }
    
    /**
     * Calculate Greenwich Mean Sidereal Time
     * @param {number} jd - Julian Day Number
     * @returns {number} GMST in degrees (0-360)
     */
    function getGMST(jd) {
        const T = julianCenturies(jd);
        
        // Mean sidereal time at Greenwich at 0h UT
        let gmst = 280.46061837 + 
                   360.98564736629 * (jd - J2000) + 
                   0.000387933 * T * T - 
                   T * T * T / 38710000;
        
        // Normalize to 0-360
        gmst = gmst % 360;
        if (gmst < 0) gmst += 360;
        
        return gmst;
    }
    
    /**
     * Calculate Greenwich Hour Angle of Aries (GHA Aries)
     * @param {Date} date - UTC date/time
     * @returns {number} GHA Aries in degrees (0-360)
     */
    function getAriesGHA(date) {
        const jd = dateToJD(date);
        return getGMST(jd);
    }
    
    // ==================== SOLAR CALCULATIONS ====================
    
    /**
     * Calculate Sun position for navigation
     * @param {Date} date - UTC date/time
     * @returns {Object} Sun position data
     */
    function getSunPosition(date) {
        const jd = dateToJD(date);
        const T = julianCenturies(jd);
        
        // Solar mean longitude
        let L0 = 280.4664567 + 36000.76982779 * T + 0.0003032028 * T * T;
        L0 = normalizeAngle(L0);
        
        // Solar mean anomaly
        let M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T * T;
        M = normalizeAngle(M);
        const Mrad = M * DEG_TO_RAD;
        
        // Equation of center
        const C = (1.9146000 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mrad) +
                  (0.019993 - 0.000101 * T) * Math.sin(2 * Mrad) +
                  0.00029 * Math.sin(3 * Mrad);
        
        // Sun's true longitude
        const sunLon = L0 + C;
        
        // Sun's true anomaly
        const v = M + C;
        
        // Sun's radius vector (distance in AU)
        const e = 0.016708634 - 0.000042037 * T;
        const R = (1.000001018 * (1 - e * e)) / (1 + e * Math.cos(v * DEG_TO_RAD));
        
        // Apparent longitude (corrected for nutation and aberration)
        const omega = 125.04 - 1934.136 * T;
        const lambda = sunLon - 0.00569 - 0.00478 * Math.sin(omega * DEG_TO_RAD);
        
        // Obliquity of ecliptic
        const eps0 = 23.439291 - 0.0130042 * T;
        const eps = eps0 + 0.00256 * Math.cos(omega * DEG_TO_RAD);
        
        // Convert to equatorial coordinates
        const lambdaRad = lambda * DEG_TO_RAD;
        const epsRad = eps * DEG_TO_RAD;
        
        // Right Ascension
        let RA = Math.atan2(Math.cos(epsRad) * Math.sin(lambdaRad), Math.cos(lambdaRad));
        RA = RA * RAD_TO_DEG;
        if (RA < 0) RA += 360;
        
        // Declination
        const dec = Math.asin(Math.sin(epsRad) * Math.sin(lambdaRad)) * RAD_TO_DEG;
        
        // Greenwich Hour Angle
        const gmst = getGMST(jd);
        let GHA = gmst - RA;
        if (GHA < 0) GHA += 360;
        if (GHA >= 360) GHA -= 360;
        
        // Semi-diameter (arcminutes)
        const SD = SUN_SD_1AU / R;
        
        // Equation of Time (minutes)
        const EoT = (L0 - 0.0057183 - RA + 180) % 360 - 180;
        const EoTminutes = EoT * 4; // degrees to minutes
        
        return {
            body: 'sun',
            GHA: GHA,
            dec: dec,
            RA: RA,
            SD: SD,  // Semi-diameter in arcminutes
            HP: 0.0024,  // Horizontal parallax (negligible for sun)
            distance: R,  // AU
            EoT: EoTminutes,  // Equation of time in minutes
            formatted: {
                GHA: formatAngle(GHA),
                dec: formatAngle(dec, true),
                SD: SD.toFixed(1) + "'",
                distance: R.toFixed(6) + ' AU'
            }
        };
    }
    
    // ==================== LUNAR CALCULATIONS ====================
    
    /**
     * Calculate Moon position for navigation
     * Based on simplified lunar theory (accuracy ~2 arcminutes)
     * @param {Date} date - UTC date/time
     * @returns {Object} Moon position data
     */
    function getMoonPosition(date) {
        const jd = dateToJD(date);
        const T = julianCenturies(jd);
        
        // Moon's mean longitude
        let Lm = 218.3164477 + 481267.88123421 * T - 0.0015786 * T * T;
        Lm = normalizeAngle(Lm);
        
        // Moon's mean elongation
        let D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T * T;
        D = normalizeAngle(D);
        const Drad = D * DEG_TO_RAD;
        
        // Sun's mean anomaly
        let Ms = 357.5291092 + 35999.0502909 * T;
        Ms = normalizeAngle(Ms);
        const Msrad = Ms * DEG_TO_RAD;
        
        // Moon's mean anomaly
        let Mm = 134.9633964 + 477198.8675055 * T + 0.0087414 * T * T;
        Mm = normalizeAngle(Mm);
        const Mmrad = Mm * DEG_TO_RAD;
        
        // Moon's argument of latitude
        let F = 93.2720950 + 483202.0175233 * T - 0.0036539 * T * T;
        F = normalizeAngle(F);
        const Frad = F * DEG_TO_RAD;
        
        // Longitude corrections (simplified)
        let dL = 6.288774 * Math.sin(Mmrad)
               + 1.274027 * Math.sin(2 * Drad - Mmrad)
               + 0.658314 * Math.sin(2 * Drad)
               + 0.213618 * Math.sin(2 * Mmrad)
               - 0.185116 * Math.sin(Msrad)
               - 0.114332 * Math.sin(2 * Frad)
               + 0.058793 * Math.sin(2 * Drad - 2 * Mmrad)
               + 0.057066 * Math.sin(2 * Drad - Msrad - Mmrad)
               + 0.053322 * Math.sin(2 * Drad + Mmrad)
               + 0.045758 * Math.sin(2 * Drad - Msrad);
        
        // Latitude corrections
        let dB = 5.128122 * Math.sin(Frad)
               + 0.280602 * Math.sin(Mmrad + Frad)
               + 0.277693 * Math.sin(Mmrad - Frad)
               + 0.173237 * Math.sin(2 * Drad - Frad)
               + 0.055413 * Math.sin(2 * Drad - Mmrad + Frad)
               + 0.046271 * Math.sin(2 * Drad - Mmrad - Frad);
        
        // Distance corrections (km)
        let dR = -20905.355 * Math.cos(Mmrad)
               - 3699.111 * Math.cos(2 * Drad - Mmrad)
               - 2955.968 * Math.cos(2 * Drad)
               - 569.925 * Math.cos(2 * Mmrad)
               + 48.888 * Math.cos(Msrad);
        
        // Moon's ecliptic longitude and latitude
        const moonLon = Lm + dL;
        const moonLat = dB;
        const moonDist = 385000.56 + dR; // km
        
        // Obliquity of ecliptic
        const omega = 125.04 - 1934.136 * T;
        const eps0 = 23.439291 - 0.0130042 * T;
        const eps = eps0 + 0.00256 * Math.cos(omega * DEG_TO_RAD);
        const epsRad = eps * DEG_TO_RAD;
        
        // Convert to equatorial coordinates
        const lonRad = moonLon * DEG_TO_RAD;
        const latRad = moonLat * DEG_TO_RAD;
        
        // Right Ascension
        let RA = Math.atan2(
            Math.sin(lonRad) * Math.cos(epsRad) - Math.tan(latRad) * Math.sin(epsRad),
            Math.cos(lonRad)
        ) * RAD_TO_DEG;
        if (RA < 0) RA += 360;
        
        // Declination
        const dec = Math.asin(
            Math.sin(latRad) * Math.cos(epsRad) + 
            Math.cos(latRad) * Math.sin(epsRad) * Math.sin(lonRad)
        ) * RAD_TO_DEG;
        
        // Greenwich Hour Angle
        const gmst = getGMST(jd);
        let GHA = gmst - RA;
        if (GHA < 0) GHA += 360;
        if (GHA >= 360) GHA -= 360;
        
        // Horizontal Parallax (arcminutes)
        const HP = Math.asin(EARTH_RADIUS_KM / moonDist) * RAD_TO_DEG * 60;
        
        // Semi-diameter (arcminutes)
        const SD = MOON_SD_MEAN * (385000 / moonDist);
        
        // Moon phase (0 = new, 0.5 = full)
        const phase = (1 - Math.cos(D * DEG_TO_RAD)) / 2;
        
        return {
            body: 'moon',
            GHA: GHA,
            dec: dec,
            RA: RA,
            SD: SD,  // Semi-diameter in arcminutes
            HP: HP,  // Horizontal parallax in arcminutes
            distance: moonDist,  // km
            phase: phase,
            eclipticLon: moonLon,
            eclipticLat: moonLat,
            formatted: {
                GHA: formatAngle(GHA),
                dec: formatAngle(dec, true),
                SD: SD.toFixed(1) + "'",
                HP: HP.toFixed(1) + "'",
                distance: Math.round(moonDist).toLocaleString() + ' km'
            }
        };
    }
    
    // ==================== PLANET CALCULATIONS ====================
    
    /**
     * Calculate planet position for navigation
     * Based on simplified VSOP87 (accuracy ~2 arcminutes)
     * @param {string} planet - Planet name (venus, mars, jupiter, saturn)
     * @param {Date} date - UTC date/time
     * @returns {Object} Planet position data
     */
    function getPlanetPosition(planet, date) {
        const elements = PLANET_ELEMENTS[planet.toLowerCase()];
        if (!elements) {
            return { error: `Unknown planet: ${planet}` };
        }
        
        const jd = dateToJD(date);
        const T = julianCenturies(jd);
        
        // Get Earth's position first
        const earthPos = calculateHeliocentricPosition('earth', T);
        
        // Get planet's heliocentric position
        const planetPos = calculateHeliocentricPosition(planet.toLowerCase(), T);
        
        // Convert to geocentric ecliptic coordinates
        const dx = planetPos.x - earthPos.x;
        const dy = planetPos.y - earthPos.y;
        const dz = planetPos.z - earthPos.z;
        
        // Distance from Earth (AU)
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        // Geocentric ecliptic longitude and latitude
        let lambda = Math.atan2(dy, dx) * RAD_TO_DEG;
        if (lambda < 0) lambda += 360;
        const beta = Math.asin(dz / distance) * RAD_TO_DEG;
        
        // Obliquity of ecliptic
        const omega = 125.04 - 1934.136 * T;
        const eps0 = 23.439291 - 0.0130042 * T;
        const eps = eps0 + 0.00256 * Math.cos(omega * DEG_TO_RAD);
        const epsRad = eps * DEG_TO_RAD;
        
        // Convert to equatorial coordinates
        const lambdaRad = lambda * DEG_TO_RAD;
        const betaRad = beta * DEG_TO_RAD;
        
        // Right Ascension
        let RA = Math.atan2(
            Math.sin(lambdaRad) * Math.cos(epsRad) - Math.tan(betaRad) * Math.sin(epsRad),
            Math.cos(lambdaRad)
        ) * RAD_TO_DEG;
        if (RA < 0) RA += 360;
        
        // Declination
        const dec = Math.asin(
            Math.sin(betaRad) * Math.cos(epsRad) + 
            Math.cos(betaRad) * Math.sin(epsRad) * Math.sin(lambdaRad)
        ) * RAD_TO_DEG;
        
        // Greenwich Hour Angle
        const gmst = getGMST(jd);
        let GHA = gmst - RA;
        if (GHA < 0) GHA += 360;
        if (GHA >= 360) GHA -= 360;
        
        // Semi-diameter (approximate, based on angular size)
        const SD = getPlanetSD(planet.toLowerCase(), distance);
        
        return {
            body: planet.toLowerCase(),
            GHA: GHA,
            dec: dec,
            RA: RA,
            SD: SD,
            HP: 0,  // Negligible for planets
            distance: distance,
            eclipticLon: lambda,
            eclipticLat: beta,
            formatted: {
                GHA: formatAngle(GHA),
                dec: formatAngle(dec, true),
                SD: SD.toFixed(1) + '"',
                distance: distance.toFixed(4) + ' AU'
            }
        };
    }
    
    /**
     * Calculate heliocentric position of a planet
     * @param {string} planet - Planet name
     * @param {number} T - Julian centuries from J2000
     * @returns {Object} Heliocentric x, y, z coordinates in AU
     */
    function calculateHeliocentricPosition(planet, T) {
        const elem = PLANET_ELEMENTS[planet];
        
        // Calculate current orbital elements
        const a = elem.a + elem.a_rate * T;
        const e = elem.e + elem.e_rate * T;
        const I = (elem.I + elem.I_rate * T) * DEG_TO_RAD;
        const L = normalizeAngle(elem.L + elem.L_rate * T);
        const w = normalizeAngle(elem.w + elem.w_rate * T);
        const O = normalizeAngle(elem.O + elem.O_rate * T);
        
        // Mean anomaly
        const M = normalizeAngle(L - w) * DEG_TO_RAD;
        
        // Eccentric anomaly (solve Kepler's equation)
        let E = M;
        for (let i = 0; i < 10; i++) {
            E = M + e * Math.sin(E);
        }
        
        // True anomaly
        const v = 2 * Math.atan2(
            Math.sqrt(1 + e) * Math.sin(E / 2),
            Math.sqrt(1 - e) * Math.cos(E / 2)
        );
        
        // Distance from Sun
        const r = a * (1 - e * Math.cos(E));
        
        // Position in orbital plane
        const xOrb = r * Math.cos(v);
        const yOrb = r * Math.sin(v);
        
        // Convert to ecliptic coordinates
        // Argument of perihelion (ω) = longitude of perihelion (ϖ) - longitude of ascending node (Ω)
        const argPeri = normalizeAngle(w - O);
        const wRad = argPeri * DEG_TO_RAD;
        const ORad = O * DEG_TO_RAD;
        
        const cosO = Math.cos(ORad);
        const sinO = Math.sin(ORad);
        const cosI = Math.cos(I);
        const sinI = Math.sin(I);
        const cosW = Math.cos(wRad);
        const sinW = Math.sin(wRad);
        
        const x = xOrb * (cosO * cosW - sinO * sinW * cosI) - 
                  yOrb * (cosO * sinW + sinO * cosW * cosI);
        const y = xOrb * (sinO * cosW + cosO * sinW * cosI) - 
                  yOrb * (sinO * sinW - cosO * cosW * cosI);
        const z = xOrb * sinW * sinI + yOrb * cosW * sinI;
        
        return { x, y, z, r };
    }
    
    /**
     * Get planet semi-diameter (arcseconds)
     */
    function getPlanetSD(planet, distance) {
        // Approximate angular radii at 1 AU
        const sdAt1AU = {
            mercury: 3.36,
            venus: 8.34,
            mars: 4.68,
            jupiter: 98.44,
            saturn: 82.73
        };
        
        const sd = sdAt1AU[planet] || 1;
        return sd / distance;
    }
    
    // ==================== STAR CALCULATIONS ====================
    
    /**
     * Get navigation star position
     * @param {string} starName - Star name from catalog
     * @param {Date} date - UTC date/time
     * @returns {Object} Star position data
     */
    function getStarPosition(starName, date) {
        const star = NAVIGATION_STARS[starName];
        if (!star) {
            return { error: `Unknown star: ${starName}. Use getStarCatalog() for available stars.` };
        }
        
        const jd = dateToJD(date);
        
        // GHA of Aries
        const ghaAries = getGMST(jd);
        
        // Star's GHA = GHA Aries + SHA (both in degrees)
        let GHA = ghaAries + star.sha;
        if (GHA >= 360) GHA -= 360;
        
        // Right Ascension from SHA
        let RA = 360 - star.sha;
        if (RA >= 360) RA -= 360;
        
        return {
            body: 'star',
            name: starName,
            GHA: GHA,
            dec: star.dec,
            SHA: star.sha,
            RA: RA,
            magnitude: star.mag,
            constellation: star.constellation,
            formatted: {
                GHA: formatAngle(GHA),
                dec: formatAngle(star.dec, true),
                SHA: formatAngle(star.sha)
            }
        };
    }
    
    /**
     * Get all navigation stars with current positions
     * @param {Date} date - UTC date/time
     * @returns {Array} Array of star positions
     */
    function getAllStarPositions(date) {
        return Object.keys(NAVIGATION_STARS).map(name => getStarPosition(name, date));
    }
    
    /**
     * Get star catalog (static data)
     */
    function getStarCatalog() {
        return { ...NAVIGATION_STARS };
    }
    
    // ==================== VISIBLE BODIES ====================
    
    /**
     * Calculate altitude and azimuth of a celestial body
     * @param {number} GHA - Greenwich Hour Angle (degrees)
     * @param {number} dec - Declination (degrees)
     * @param {number} lat - Observer latitude (degrees)
     * @param {number} lon - Observer longitude (degrees)
     * @returns {Object} Altitude and azimuth
     */
    function calculateAltAz(GHA, dec, lat, lon) {
        // Local Hour Angle
        let LHA = GHA + lon;
        if (LHA < 0) LHA += 360;
        if (LHA >= 360) LHA -= 360;
        
        const latRad = lat * DEG_TO_RAD;
        const decRad = dec * DEG_TO_RAD;
        const LHARad = LHA * DEG_TO_RAD;
        
        // Altitude
        const sinAlt = Math.sin(latRad) * Math.sin(decRad) + 
                       Math.cos(latRad) * Math.cos(decRad) * Math.cos(LHARad);
        const altitude = Math.asin(sinAlt) * RAD_TO_DEG;
        
        // Azimuth
        const cosAz = (Math.sin(decRad) - Math.sin(latRad) * sinAlt) / 
                      (Math.cos(latRad) * Math.cos(Math.asin(sinAlt)));
        let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAz))) * RAD_TO_DEG;
        
        if (Math.sin(LHARad) > 0) {
            azimuth = 360 - azimuth;
        }
        
        return {
            altitude: altitude,
            azimuth: azimuth,
            LHA: LHA,
            formatted: {
                altitude: altitude.toFixed(1) + '°',
                azimuth: azimuth.toFixed(1) + '°'
            }
        };
    }
    
    /**
     * Get all visible celestial bodies
     * @param {number} lat - Observer latitude
     * @param {number} lon - Observer longitude  
     * @param {Date} date - UTC date/time
     * @param {number} minAltitude - Minimum altitude to consider visible (default 5°)
     * @returns {Object} Lists of visible bodies
     */
    function getVisibleBodies(lat, lon, date, minAltitude = 5) {
        const visible = {
            sun: null,
            moon: null,
            planets: [],
            stars: []
        };
        
        // Sun
        const sun = getSunPosition(date);
        const sunAltAz = calculateAltAz(sun.GHA, sun.dec, lat, lon);
        if (sunAltAz.altitude >= minAltitude) {
            visible.sun = { ...sun, ...sunAltAz };
        }
        
        // Moon
        const moon = getMoonPosition(date);
        const moonAltAz = calculateAltAz(moon.GHA, moon.dec, lat, lon);
        if (moonAltAz.altitude >= minAltitude) {
            visible.moon = { ...moon, ...moonAltAz };
        }
        
        // Planets
        ['venus', 'mars', 'jupiter', 'saturn'].forEach(planet => {
            const pos = getPlanetPosition(planet, date);
            if (!pos.error) {
                const altAz = calculateAltAz(pos.GHA, pos.dec, lat, lon);
                if (altAz.altitude >= minAltitude) {
                    visible.planets.push({ ...pos, ...altAz });
                }
            }
        });
        
        // Stars (only if sun is low enough - twilight or darker)
        const sunActualAlt = sunAltAz.altitude;
        if (sunActualAlt < -6) {  // Below civil twilight
            Object.keys(NAVIGATION_STARS).forEach(name => {
                const star = getStarPosition(name, date);
                const altAz = calculateAltAz(star.GHA, star.dec, lat, lon);
                if (altAz.altitude >= minAltitude) {
                    visible.stars.push({ ...star, ...altAz });
                }
            });
            
            // Sort stars by magnitude (brightest first)
            visible.stars.sort((a, b) => a.magnitude - b.magnitude);
        }
        
        return visible;
    }
    
    /**
     * Get best bodies for observation (3 well-spaced bodies)
     * @param {number} lat - Observer latitude
     * @param {number} lon - Observer longitude
     * @param {Date} date - UTC date/time
     * @returns {Array} Recommended bodies for fix
     */
    function getRecommendedBodies(lat, lon, date) {
        const visible = getVisibleBodies(lat, lon, date, 15);  // Min 15° altitude
        const candidates = [];
        
        // Add sun/moon if visible
        if (visible.sun) candidates.push(visible.sun);
        if (visible.moon) candidates.push(visible.moon);
        
        // Add bright planets
        visible.planets.forEach(p => candidates.push(p));
        
        // Add brightest stars (up to 10)
        visible.stars.slice(0, 10).forEach(s => candidates.push(s));
        
        if (candidates.length < 3) {
            return candidates;  // Return whatever we have
        }
        
        // Select 3 bodies with best azimuth spread
        // Ideal: ~120° apart
        const selected = [candidates[0]];
        
        for (let i = 1; i < candidates.length && selected.length < 3; i++) {
            const candidate = candidates[i];
            let minSeparation = 180;
            
            for (const sel of selected) {
                let sep = Math.abs(candidate.azimuth - sel.azimuth);
                if (sep > 180) sep = 360 - sep;
                minSeparation = Math.min(minSeparation, sep);
            }
            
            if (minSeparation >= 30) {  // At least 30° from other selected
                selected.push(candidate);
            }
        }
        
        return selected;
    }
    
    // ==================== UTILITY FUNCTIONS ====================
    
    /**
     * Normalize angle to 0-360 range
     */
    function normalizeAngle(angle) {
        angle = angle % 360;
        if (angle < 0) angle += 360;
        return angle;
    }
    
    /**
     * Format angle as degrees and minutes
     * @param {number} angle - Angle in decimal degrees
     * @param {boolean} signed - Include N/S or +/- prefix
     * @returns {string} Formatted angle (e.g., "23° 26.5'")
     */
    function formatAngle(angle, signed = false) {
        const sign = angle < 0 ? -1 : 1;
        const absAngle = Math.abs(angle);
        const degrees = Math.floor(absAngle);
        const minutes = (absAngle - degrees) * 60;
        
        let prefix = '';
        if (signed) {
            prefix = angle >= 0 ? 'N ' : 'S ';
        }
        
        return `${prefix}${degrees}° ${minutes.toFixed(1)}'`;
    }
    
    /**
     * Parse angle from degrees-minutes format
     * @param {string} str - Angle string (e.g., "23° 26.5'" or "N 23° 26.5'")
     * @returns {number} Angle in decimal degrees
     */
    function parseAngle(str) {
        let negative = false;
        if (str.startsWith('S ') || str.startsWith('W ') || str.startsWith('-')) {
            negative = true;
        }
        
        const match = str.match(/(\d+)[°\s]+(\d+\.?\d*)['\s]*/);
        if (!match) return NaN;
        
        const degrees = parseInt(match[1]);
        const minutes = parseFloat(match[2]);
        let result = degrees + minutes / 60;
        
        return negative ? -result : result;
    }
    
    /**
     * Format time in HH:MM:SS
     */
    function formatTime(date) {
        return date.toISOString().substr(11, 8) + ' UTC';
    }
    
    /**
     * Get complete almanac data for a date/time
     * @param {Date} date - UTC date/time
     * @param {number} lat - Observer latitude (optional)
     * @param {number} lon - Observer longitude (optional)
     * @returns {Object} Complete almanac
     */
    function getAlmanac(date, lat = null, lon = null) {
        const almanac = {
            date: date,
            utc: formatTime(date),
            ghaAries: getAriesGHA(date),
            sun: getSunPosition(date),
            moon: getMoonPosition(date),
            planets: {
                venus: getPlanetPosition('venus', date),
                mars: getPlanetPosition('mars', date),
                jupiter: getPlanetPosition('jupiter', date),
                saturn: getPlanetPosition('saturn', date)
            }
        };
        
        // Add visible bodies if location provided
        if (lat !== null && lon !== null) {
            almanac.visible = getVisibleBodies(lat, lon, date);
            almanac.recommended = getRecommendedBodies(lat, lon, date);
        }
        
        return almanac;
    }
    
    // ==================== RENDERING ====================
    
    /**
     * Render almanac as HTML
     */
    function renderAlmanacWidget(date, options = {}) {
        const almanac = getAlmanac(date);
        
        return `
            <div class="celestial-almanac" style="padding:12px;background:var(--color-bg-elevated);border-radius:10px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                    <div style="font-size:14px;font-weight:600">🌟 Celestial Almanac</div>
                    <div style="font-size:11px;color:rgba(255,255,255,0.5)">${almanac.utc}</div>
                </div>
                
                <!-- GHA Aries -->
                <div style="padding:8px;background:rgba(139,92,246,0.1);border-radius:6px;margin-bottom:12px">
                    <div style="font-size:10px;color:rgba(255,255,255,0.5)">GHA Aries (♈)</div>
                    <div style="font-size:16px;font-weight:600">${formatAngle(almanac.ghaAries)}</div>
                </div>
                
                <!-- Sun -->
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
                    <div style="padding:8px;background:rgba(251,191,36,0.1);border-radius:6px">
                        <div style="font-size:10px;color:rgba(255,255,255,0.5)">☀️ Sun GHA</div>
                        <div style="font-size:14px;font-weight:600">${almanac.sun.formatted.GHA}</div>
                    </div>
                    <div style="padding:8px;background:rgba(251,191,36,0.1);border-radius:6px">
                        <div style="font-size:10px;color:rgba(255,255,255,0.5)">☀️ Sun Dec</div>
                        <div style="font-size:14px;font-weight:600">${almanac.sun.formatted.dec}</div>
                    </div>
                </div>
                
                <!-- Moon -->
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
                    <div style="padding:8px;background:rgba(148,163,184,0.1);border-radius:6px">
                        <div style="font-size:10px;color:rgba(255,255,255,0.5)">🌙 Moon GHA</div>
                        <div style="font-size:14px;font-weight:600">${almanac.moon.formatted.GHA}</div>
                    </div>
                    <div style="padding:8px;background:rgba(148,163,184,0.1);border-radius:6px">
                        <div style="font-size:10px;color:rgba(255,255,255,0.5)">🌙 Moon Dec</div>
                        <div style="font-size:14px;font-weight:600">${almanac.moon.formatted.dec}</div>
                    </div>
                </div>
                
                <!-- Planets -->
                <div style="font-size:11px;font-weight:600;margin:12px 0 8px">Planets</div>
                <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:6px;font-size:10px">
                    ${['venus', 'mars', 'jupiter', 'saturn'].map(p => {
                        const planet = almanac.planets[p];
                        const symbol = { venus: '♀', mars: '♂', jupiter: '♃', saturn: '♄' }[p];
                        return `
                            <div style="text-align:center;padding:6px;background:rgba(0,0,0,0.2);border-radius:4px">
                                <div style="font-size:14px">${symbol}</div>
                                <div style="color:rgba(255,255,255,0.6)">${planet.formatted.dec}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }
    
    /**
     * Render body position for sight planning
     */
    function renderBodyPosition(body) {
        const symbol = {
            sun: '☀️',
            moon: '🌙',
            venus: '♀️',
            mars: '♂️',
            jupiter: '♃',
            saturn: '♄',
            star: '⭐'
        }[body.body] || '•';
        
        return `
            <div style="display:grid;grid-template-columns:auto 1fr 1fr;gap:8px;align-items:center;padding:8px;background:rgba(0,0,0,0.2);border-radius:6px">
                <div style="font-size:18px">${symbol}</div>
                <div>
                    <div style="font-size:12px;font-weight:600">${body.name || body.body}</div>
                    <div style="font-size:10px;color:rgba(255,255,255,0.5)">
                        Alt: ${body.formatted?.altitude || '--'} Az: ${body.formatted?.azimuth || '--'}
                    </div>
                </div>
                <div style="text-align:right;font-size:10px">
                    <div>GHA: ${body.formatted.GHA}</div>
                    <div>Dec: ${body.formatted.dec}</div>
                </div>
            </div>
        `;
    }
    
    // ==================== PHASE 2: OBSERVATION INPUT ====================
    
    // Sight log - stores all observations
    let sightLog = [];
    let currentObservation = null;
    
    // Device sensor state
    let deviceSensorState = {
        available: false,
        calibrated: false,
        lastReading: null,
        accelerometer: null,
        gyroscope: null
    };
    
    // Correction tables
    
    /**
     * Atmospheric refraction correction (arcminutes)
     * Based on Bennett's formula (1982)
     * @param {number} apparentAltDeg - Apparent altitude in degrees
     * @param {number} tempC - Temperature in Celsius (default 10°C)
     * @param {number} pressureMb - Pressure in millibars (default 1010mb)
     * @returns {number} Refraction correction in arcminutes (always positive, subtract from Ha)
     */
    function calculateRefraction(apparentAltDeg, tempC = 10, pressureMb = 1010) {
        if (apparentAltDeg < -1) return 0;
        
        // Bennett's formula
        const altRad = (apparentAltDeg + 7.31 / (apparentAltDeg + 4.4)) * DEG_TO_RAD;
        let R = 1.02 / Math.tan(altRad);
        
        // Pressure and temperature corrections
        const pressureCorr = pressureMb / 1010;
        const tempCorr = 283 / (273 + tempC);
        R = R * pressureCorr * tempCorr;
        
        // At very low altitudes, use tabular values
        if (apparentAltDeg < 0) {
            R = 34.5;  // At horizon
        } else if (apparentAltDeg < 5) {
            // Interpolate for low altitudes
            const lowAltTable = [
                { alt: 0, ref: 34.5 },
                { alt: 1, ref: 24.6 },
                { alt: 2, ref: 18.3 },
                { alt: 3, ref: 14.4 },
                { alt: 4, ref: 11.8 },
                { alt: 5, ref: 9.9 }
            ];
            for (let i = 0; i < lowAltTable.length - 1; i++) {
                if (apparentAltDeg >= lowAltTable[i].alt && apparentAltDeg < lowAltTable[i + 1].alt) {
                    const t = (apparentAltDeg - lowAltTable[i].alt) / (lowAltTable[i + 1].alt - lowAltTable[i].alt);
                    R = lowAltTable[i].ref + t * (lowAltTable[i + 1].ref - lowAltTable[i].ref);
                    break;
                }
            }
        }
        
        return R;  // arcminutes
    }
    
    /**
     * Dip correction for height of eye (arcminutes)
     * @param {number} heightFt - Height of eye above sea level in feet
     * @returns {number} Dip correction in arcminutes (always positive, subtract from Hs)
     */
    function calculateDip(heightFt) {
        if (heightFt <= 0) return 0;
        // Dip = 0.97' × √height(ft) or 1.76' × √height(m)
        return 0.97 * Math.sqrt(heightFt);
    }
    
    /**
     * Calculate all altitude corrections
     * Converts Sextant Altitude (Hs) to Observed Altitude (Ho)
     * 
     * @param {number} Hs - Sextant altitude in degrees
     * @param {Object} options - Correction options
     * @param {number} options.indexError - Index error in arcminutes (+ if on, - if off)
     * @param {number} options.heightOfEyeFt - Height of eye in feet
     * @param {string} options.body - Body type: 'sun', 'moon', 'star', 'planet'
     * @param {string} options.limb - For sun/moon: 'lower', 'upper', 'center'
     * @param {number} options.SD - Semi-diameter in arcminutes (from almanac)
     * @param {number} options.HP - Horizontal parallax in arcminutes (moon only)
     * @param {number} options.temperature - Temperature in Celsius
     * @param {number} options.pressure - Pressure in millibars
     * @returns {Object} Corrected altitude and breakdown
     */
    function correctAltitude(Hs, options = {}) {
        const {
            indexError = 0,
            heightOfEyeFt = 6,
            body = 'star',
            limb = 'lower',
            SD = 0,
            HP = 0,
            temperature = 10,
            pressure = 1010
        } = options;
        
        const corrections = {
            Hs: Hs,
            indexError: -indexError / 60,  // Convert to degrees, sign convention
            dip: 0,
            refraction: 0,
            semiDiameter: 0,
            parallax: 0,
            total: 0,
            Ho: 0
        };
        
        // Step 1: Apply index error
        // Hs - IE = Ha (if IE is "on the arc" it's positive, subtract)
        let Ha = Hs - (indexError / 60);
        corrections.indexError = -indexError / 60;
        
        // Step 2: Apply dip correction (always subtract)
        const dipArcmin = calculateDip(heightOfEyeFt);
        Ha = Ha - (dipArcmin / 60);
        corrections.dip = -dipArcmin / 60;
        
        // Step 3: Apply refraction correction (always subtract)
        const refractionArcmin = calculateRefraction(Ha, temperature, pressure);
        let Ho = Ha - (refractionArcmin / 60);
        corrections.refraction = -refractionArcmin / 60;
        
        // Step 4: Apply semi-diameter correction (sun and moon only)
        if ((body === 'sun' || body === 'moon') && SD > 0) {
            if (limb === 'lower') {
                // Lower limb: add SD
                Ho = Ho + (SD / 60);
                corrections.semiDiameter = SD / 60;
            } else if (limb === 'upper') {
                // Upper limb: subtract SD
                Ho = Ho - (SD / 60);
                corrections.semiDiameter = -SD / 60;
            }
            // Center: no correction
        }
        
        // Step 5: Apply parallax correction (moon only, always add)
        if (body === 'moon' && HP > 0) {
            // Parallax in altitude = HP × cos(Ho)
            const parallaxArcmin = HP * Math.cos(Ho * DEG_TO_RAD);
            Ho = Ho + (parallaxArcmin / 60);
            corrections.parallax = parallaxArcmin / 60;
        }
        
        // Sun parallax (very small, ~0.15')
        if (body === 'sun') {
            const sunParallax = 0.15 * Math.cos(Ho * DEG_TO_RAD);
            Ho = Ho + (sunParallax / 60);
            corrections.parallax = sunParallax / 60;
        }
        
        // Calculate total correction
        corrections.total = Ho - Hs;
        corrections.Ho = Ho;
        
        // Add formatted outputs
        corrections.formatted = {
            Hs: formatAngle(Hs),
            Ho: formatAngle(Ho),
            indexError: (indexError >= 0 ? '+' : '') + indexError.toFixed(1) + "'",
            dip: (-dipArcmin).toFixed(1) + "'",
            refraction: (-refractionArcmin).toFixed(1) + "'",
            semiDiameter: (corrections.semiDiameter >= 0 ? '+' : '') + (corrections.semiDiameter * 60).toFixed(1) + "'",
            parallax: '+' + (corrections.parallax * 60).toFixed(1) + "'",
            total: (corrections.total >= 0 ? '+' : '') + (corrections.total * 60).toFixed(1) + "'"
        };
        
        return corrections;
    }
    
    /**
     * Start a new observation session
     * @param {string} bodyName - Name of celestial body
     * @param {Object} options - Observation options
     */
    function startObservation(bodyName, options = {}) {
        const now = new Date();
        
        // Get body position
        let bodyData;
        if (bodyName.toLowerCase() === 'sun') {
            bodyData = getSunPosition(now);
        } else if (bodyName.toLowerCase() === 'moon') {
            bodyData = getMoonPosition(now);
        } else if (['venus', 'mars', 'jupiter', 'saturn'].includes(bodyName.toLowerCase())) {
            bodyData = getPlanetPosition(bodyName, now);
        } else {
            bodyData = getStarPosition(bodyName, now);
        }
        
        currentObservation = {
            id: Date.now(),
            bodyName: bodyName,
            bodyType: bodyData.body,
            startTime: now,
            bodyData: bodyData,
            sights: [],
            status: 'active',
            options: {
                indexError: options.indexError || 0,
                heightOfEyeFt: options.heightOfEyeFt || 6,
                limb: options.limb || 'lower',
                temperature: options.temperature || 10,
                pressure: options.pressure || 1010,
                ...options
            }
        };
        
        return currentObservation;
    }
    
    /**
     * Record a sight (altitude measurement)
     * @param {number} altitude - Sextant altitude in degrees
     * @param {Date} time - Time of observation (default: now)
     * @param {Object} options - Override default options
     * @returns {Object} Recorded sight with corrections
     */
    function recordSight(altitude, time = null, options = {}) {
        if (!currentObservation) {
            return { error: 'No active observation. Call startObservation() first.' };
        }
        
        const sightTime = time || new Date();
        
        // Get body position at sight time
        let bodyData;
        const bodyName = currentObservation.bodyName;
        if (bodyName.toLowerCase() === 'sun') {
            bodyData = getSunPosition(sightTime);
        } else if (bodyName.toLowerCase() === 'moon') {
            bodyData = getMoonPosition(sightTime);
        } else if (['venus', 'mars', 'jupiter', 'saturn'].includes(bodyName.toLowerCase())) {
            bodyData = getPlanetPosition(bodyName, sightTime);
        } else {
            bodyData = getStarPosition(bodyName, sightTime);
        }
        
        // Merge options
        const correctionOptions = {
            ...currentObservation.options,
            ...options,
            body: currentObservation.bodyType,
            SD: bodyData.SD || 0,
            HP: bodyData.HP || 0
        };
        
        // Calculate corrections
        const corrections = correctAltitude(altitude, correctionOptions);
        
        const sight = {
            id: Date.now(),
            time: sightTime,
            utc: sightTime.toISOString(),
            Hs: altitude,
            Ho: corrections.Ho,
            corrections: corrections,
            bodyData: bodyData,
            GHA: bodyData.GHA,
            dec: bodyData.dec
        };
        
        currentObservation.sights.push(sight);
        
        return sight;
    }
    
    /**
     * Complete the current observation and add to sight log
     */
    function completeObservation() {
        if (!currentObservation) {
            return { error: 'No active observation' };
        }
        
        currentObservation.status = 'complete';
        currentObservation.endTime = new Date();
        
        // Calculate average if multiple sights
        if (currentObservation.sights.length > 1) {
            const avgHo = currentObservation.sights.reduce((sum, s) => sum + s.Ho, 0) / 
                         currentObservation.sights.length;
            const avgTime = new Date(
                currentObservation.sights.reduce((sum, s) => sum + s.time.getTime(), 0) / 
                currentObservation.sights.length
            );
            currentObservation.average = {
                Ho: avgHo,
                time: avgTime,
                count: currentObservation.sights.length
            };
        } else if (currentObservation.sights.length === 1) {
            currentObservation.average = {
                Ho: currentObservation.sights[0].Ho,
                time: currentObservation.sights[0].time,
                count: 1
            };
        }
        
        sightLog.push(currentObservation);
        const completed = currentObservation;
        currentObservation = null;
        
        return completed;
    }
    
    /**
     * Cancel current observation
     */
    function cancelObservation() {
        currentObservation = null;
    }
    
    /**
     * Get current observation status
     */
    function getCurrentObservation() {
        return currentObservation;
    }
    
    /**
     * Get all recorded observations
     * @param {number} limit - Maximum number to return (0 = all)
     */
    function getSightLog(limit = 0) {
        if (limit > 0) {
            return sightLog.slice(-limit);
        }
        return [...sightLog];
    }
    
    /**
     * Clear sight log
     */
    function clearSightLog() {
        sightLog = [];
    }
    
    /**
     * Delete a specific observation from the log
     */
    function deleteSight(id) {
        const index = sightLog.findIndex(s => s.id === id);
        if (index >= 0) {
            sightLog.splice(index, 1);
            return true;
        }
        return false;
    }
    
    // ==================== DEVICE SENSOR ALTITUDE ====================
    
    /**
     * Initialize device sensors for altitude measurement
     */
    async function initDeviceSensors() {
        try {
            // Check for DeviceOrientation API
            if (typeof DeviceOrientationEvent !== 'undefined') {
                // iOS 13+ requires permission
                if (typeof DeviceOrientationEvent.requestPermission === 'function') {
                    const permission = await DeviceOrientationEvent.requestPermission();
                    if (permission !== 'granted') {
                        return { success: false, error: 'Permission denied' };
                    }
                }
                
                deviceSensorState.available = true;
                
                // Start listening
                window.addEventListener('deviceorientation', handleDeviceOrientation);
                
                return { success: true, message: 'Device sensors initialized' };
            } else {
                return { success: false, error: 'DeviceOrientation API not available' };
            }
        } catch (e) {
            return { success: false, error: e.message };
        }
    }
    
    /**
     * Handle device orientation events
     */
    function handleDeviceOrientation(event) {
        // beta: front-to-back tilt (-180 to 180)
        // gamma: left-to-right tilt (-90 to 90)
        // alpha: compass direction (0 to 360)
        
        const beta = event.beta;   // Pitch
        const gamma = event.gamma; // Roll
        const alpha = event.alpha; // Compass heading
        
        if (beta !== null && gamma !== null) {
            // Calculate altitude based on device orientation
            // When device is held vertically (like sighting along the edge):
            // - Pointing at horizon: beta ≈ 0, altitude = 0°
            // - Pointing at zenith: beta ≈ 90, altitude = 90°
            
            // Adjust for how device is held
            // Assuming device is held with top edge pointing at object
            let altitude = beta;
            
            // Correct for roll (device not perfectly vertical)
            if (Math.abs(gamma) > 10) {
                altitude = Math.atan2(
                    Math.sin(beta * DEG_TO_RAD),
                    Math.sqrt(Math.cos(beta * DEG_TO_RAD) ** 2 + Math.sin(gamma * DEG_TO_RAD) ** 2)
                ) * RAD_TO_DEG;
            }
            
            deviceSensorState.lastReading = {
                altitude: altitude,
                beta: beta,
                gamma: gamma,
                alpha: alpha,
                timestamp: Date.now()
            };
        }
    }
    
    /**
     * Get current device-measured altitude
     * @returns {Object} Altitude reading or error
     */
    function getDeviceAltitude() {
        if (!deviceSensorState.available) {
            return { error: 'Device sensors not initialized. Call initDeviceSensors() first.' };
        }
        
        if (!deviceSensorState.lastReading) {
            return { error: 'No sensor reading available. Move device to trigger orientation event.' };
        }
        
        const reading = deviceSensorState.lastReading;
        const age = Date.now() - reading.timestamp;
        
        if (age > 5000) {
            return { error: 'Sensor reading stale. Move device.' };
        }
        
        return {
            altitude: reading.altitude,
            accuracy: 2,  // Estimated accuracy in degrees
            compass: reading.alpha,
            timestamp: reading.timestamp,
            age: age
        };
    }
    
    /**
     * Stop device sensor listening
     */
    function stopDeviceSensors() {
        window.removeEventListener('deviceorientation', handleDeviceOrientation);
        deviceSensorState.available = false;
        deviceSensorState.lastReading = null;
    }
    
    // ==================== OBSERVATION UI RENDERING ====================
    
    /**
     * Render observation input widget
     */
    function renderObservationWidget(options = {}) {
        const obs = currentObservation;
        const hasObs = obs !== null;
        
        return `
            <div class="celestial-observation" style="padding:12px;background:var(--color-bg-elevated);border-radius:10px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                    <div style="font-size:14px;font-weight:600">📐 Celestial Observation</div>
                    ${hasObs ? `<div style="font-size:11px;color:#22c55e">● Recording: ${obs.bodyName}</div>` : ''}
                </div>
                
                ${hasObs ? renderActiveObservation(obs) : renderStartObservation()}
            </div>
        `;
    }
    
    function renderStartObservation() {
        return `
            <div style="text-align:center;padding:20px">
                <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:12px">
                    Select a celestial body to observe
                </div>
                <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;margin-bottom:16px">
                    <button class="btn btn--secondary celestial-start-obs" data-body="sun" style="padding:12px">
                        ☀️<br><span style="font-size:10px">Sun</span>
                    </button>
                    <button class="btn btn--secondary celestial-start-obs" data-body="moon" style="padding:12px">
                        🌙<br><span style="font-size:10px">Moon</span>
                    </button>
                    <button class="btn btn--secondary celestial-start-obs" data-body="star" style="padding:12px">
                        ⭐<br><span style="font-size:10px">Star</span>
                    </button>
                </div>
                <div style="font-size:10px;color:rgba(255,255,255,0.4)">
                    Planets: Venus, Mars, Jupiter, Saturn also available
                </div>
            </div>
        `;
    }
    
    function renderActiveObservation(obs) {
        const lastSight = obs.sights.length > 0 ? obs.sights[obs.sights.length - 1] : null;
        
        return `
            <div style="margin-bottom:12px">
                <!-- Body info -->
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
                    <div style="padding:8px;background:rgba(0,0,0,0.2);border-radius:6px">
                        <div style="font-size:10px;color:rgba(255,255,255,0.5)">GHA</div>
                        <div style="font-size:14px;font-weight:600">${obs.bodyData.formatted.GHA}</div>
                    </div>
                    <div style="padding:8px;background:rgba(0,0,0,0.2);border-radius:6px">
                        <div style="font-size:10px;color:rgba(255,255,255,0.5)">Dec</div>
                        <div style="font-size:14px;font-weight:600">${obs.bodyData.formatted.dec}</div>
                    </div>
                </div>
                
                <!-- Altitude input -->
                <div style="margin-bottom:12px">
                    <label style="font-size:11px;color:rgba(255,255,255,0.6);display:block;margin-bottom:4px">
                        Sextant Altitude (Hs)
                    </label>
                    <div style="display:flex;gap:8px;align-items:center">
                        <input type="number" id="celestial-hs-deg" 
                               style="width:60px;padding:8px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white;text-align:center"
                               placeholder="deg" min="0" max="90" step="1">
                        <span style="color:rgba(255,255,255,0.5)">°</span>
                        <input type="number" id="celestial-hs-min" 
                               style="width:60px;padding:8px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white;text-align:center"
                               placeholder="min" min="0" max="59.9" step="0.1">
                        <span style="color:rgba(255,255,255,0.5)">'</span>
                        <button class="btn btn--primary" id="celestial-record-sight" style="padding:8px 16px">
                            Record
                        </button>
                    </div>
                </div>
                
                <!-- Device altitude -->
                <div style="margin-bottom:12px;padding:10px;background:rgba(59,130,246,0.1);border-radius:6px">
                    <div style="display:flex;justify-content:space-between;align-items:center">
                        <div>
                            <div style="font-size:10px;color:rgba(255,255,255,0.5)">Device Altitude</div>
                            <div style="font-size:16px;font-weight:600" id="celestial-device-alt">--°</div>
                        </div>
                        <button class="btn btn--secondary" id="celestial-use-device" style="padding:6px 12px;font-size:11px">
                            📱 Use
                        </button>
                    </div>
                    <div style="font-size:9px;color:rgba(255,255,255,0.4);margin-top:4px">
                        Point device top edge at celestial body
                    </div>
                </div>
                
                <!-- Recorded sights -->
                <div style="margin-bottom:12px">
                    <div style="font-size:11px;font-weight:600;margin-bottom:8px">
                        Recorded Sights (${obs.sights.length})
                    </div>
                    ${obs.sights.length === 0 ? `
                        <div style="font-size:10px;color:rgba(255,255,255,0.4);text-align:center;padding:12px">
                            No sights recorded yet
                        </div>
                    ` : `
                        <div style="max-height:120px;overflow-y:auto">
                            ${obs.sights.map((s, i) => `
                                <div style="display:flex;justify-content:space-between;padding:6px 8px;background:rgba(0,0,0,0.15);border-radius:4px;margin-bottom:4px;font-size:11px">
                                    <span>#${i + 1}: Hs ${formatAngle(s.Hs)}</span>
                                    <span style="color:#22c55e">Ho ${formatAngle(s.Ho)}</span>
                                    <span style="color:rgba(255,255,255,0.5)">${s.time.toISOString().substr(11, 8)}</span>
                                </div>
                            `).join('')}
                        </div>
                    `}
                </div>
                
                <!-- Last correction breakdown -->
                ${lastSight ? renderCorrectionBreakdown(lastSight.corrections) : ''}
                
                <!-- Actions -->
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                    <button class="btn btn--secondary" id="celestial-cancel-obs">Cancel</button>
                    <button class="btn btn--primary" id="celestial-complete-obs" 
                            ${obs.sights.length === 0 ? 'disabled' : ''}>
                        Complete Observation
                    </button>
                </div>
            </div>
        `;
    }
    
    /**
     * Render correction breakdown
     */
    function renderCorrectionBreakdown(corrections) {
        return `
            <div style="margin-bottom:12px;padding:10px;background:rgba(0,0,0,0.2);border-radius:6px">
                <div style="font-size:10px;font-weight:600;margin-bottom:8px;color:rgba(255,255,255,0.6)">
                    Altitude Corrections
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:10px">
                    <div>Sextant Alt (Hs):</div>
                    <div style="text-align:right">${corrections.formatted.Hs}</div>
                    
                    <div style="color:rgba(255,255,255,0.5)">Index Error:</div>
                    <div style="text-align:right;color:rgba(255,255,255,0.5)">${corrections.formatted.indexError}</div>
                    
                    <div style="color:rgba(255,255,255,0.5)">Dip:</div>
                    <div style="text-align:right;color:rgba(255,255,255,0.5)">${corrections.formatted.dip}</div>
                    
                    <div style="color:rgba(255,255,255,0.5)">Refraction:</div>
                    <div style="text-align:right;color:rgba(255,255,255,0.5)">${corrections.formatted.refraction}</div>
                    
                    <div style="color:rgba(255,255,255,0.5)">Semi-diameter:</div>
                    <div style="text-align:right;color:rgba(255,255,255,0.5)">${corrections.formatted.semiDiameter}</div>
                    
                    <div style="color:rgba(255,255,255,0.5)">Parallax:</div>
                    <div style="text-align:right;color:rgba(255,255,255,0.5)">${corrections.formatted.parallax}</div>
                    
                    <div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:4px;margin-top:4px;font-weight:600">
                        Total Correction:
                    </div>
                    <div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:4px;margin-top:4px;text-align:right;font-weight:600;color:#f59e0b">
                        ${corrections.formatted.total}
                    </div>
                    
                    <div style="font-weight:600;color:#22c55e">Observed Alt (Ho):</div>
                    <div style="text-align:right;font-weight:600;color:#22c55e">${corrections.formatted.Ho}</div>
                </div>
            </div>
        `;
    }
    
    /**
     * Render sight log widget
     */
    function renderSightLogWidget() {
        const log = getSightLog(10);
        
        return `
            <div class="celestial-sight-log" style="padding:12px;background:var(--color-bg-elevated);border-radius:10px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                    <div style="font-size:14px;font-weight:600">📋 Sight Log</div>
                    <div style="font-size:11px;color:rgba(255,255,255,0.5)">${sightLog.length} observation(s)</div>
                </div>
                
                ${log.length === 0 ? `
                    <div style="text-align:center;padding:20px;color:rgba(255,255,255,0.4);font-size:12px">
                        No observations recorded yet
                    </div>
                ` : `
                    <div style="max-height:300px;overflow-y:auto">
                        ${log.map(obs => `
                            <div style="padding:10px;background:rgba(0,0,0,0.2);border-radius:6px;margin-bottom:8px">
                                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                                    <div style="font-size:12px;font-weight:600">
                                        ${getBodyEmoji(obs.bodyType)} ${obs.bodyName}
                                    </div>
                                    <div style="font-size:10px;color:rgba(255,255,255,0.5)">
                                        ${obs.startTime.toLocaleTimeString()}
                                    </div>
                                </div>
                                ${obs.average ? `
                                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:10px">
                                        <div>
                                            <div style="color:rgba(255,255,255,0.5)">Ho</div>
                                            <div style="font-weight:600">${formatAngle(obs.average.Ho)}</div>
                                        </div>
                                        <div>
                                            <div style="color:rgba(255,255,255,0.5)">GHA</div>
                                            <div>${obs.bodyData.formatted.GHA}</div>
                                        </div>
                                        <div>
                                            <div style="color:rgba(255,255,255,0.5)">Dec</div>
                                            <div>${obs.bodyData.formatted.dec}</div>
                                        </div>
                                    </div>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                    
                    ${sightLog.length >= 2 ? `
                        <button class="btn btn--primary btn--full" id="celestial-calculate-fix" style="margin-top:12px">
                            🎯 Calculate Position Fix
                        </button>
                    ` : `
                        <div style="font-size:10px;color:rgba(255,255,255,0.4);text-align:center;margin-top:8px">
                            Need at least 2 observations for position fix
                        </div>
                    `}
                `}
            </div>
        `;
    }
    
    function getBodyEmoji(bodyType) {
        return {
            'sun': '☀️',
            'moon': '🌙',
            'star': '⭐',
            'venus': '♀️',
            'mars': '♂️',
            'jupiter': '♃',
            'saturn': '♄'
        }[bodyType] || '•';
    }
    
    /**
     * Render correction settings widget
     */
    function renderCorrectionSettingsWidget(currentSettings = {}) {
        const settings = {
            indexError: 0,
            heightOfEyeFt: 6,
            limb: 'lower',
            temperature: 10,
            pressure: 1010,
            ...currentSettings
        };
        
        return `
            <div class="celestial-settings" style="padding:12px;background:var(--color-bg-elevated);border-radius:10px">
                <div style="font-size:14px;font-weight:600;margin-bottom:12px">⚙️ Observation Settings</div>
                
                <div style="display:grid;gap:12px">
                    <!-- Index Error -->
                    <div>
                        <label style="font-size:11px;color:rgba(255,255,255,0.6);display:block;margin-bottom:4px">
                            Index Error (arcminutes)
                        </label>
                        <input type="number" id="celestial-index-error" value="${settings.indexError}"
                               style="width:100%;padding:8px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white"
                               step="0.1" placeholder="+ on arc, - off arc">
                    </div>
                    
                    <!-- Height of Eye -->
                    <div>
                        <label style="font-size:11px;color:rgba(255,255,255,0.6);display:block;margin-bottom:4px">
                            Height of Eye (feet)
                        </label>
                        <input type="number" id="celestial-height-eye" value="${settings.heightOfEyeFt}"
                               style="width:100%;padding:8px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white"
                               min="0" step="1">
                    </div>
                    
                    <!-- Limb -->
                    <div>
                        <label style="font-size:11px;color:rgba(255,255,255,0.6);display:block;margin-bottom:4px">
                            Limb (Sun/Moon only)
                        </label>
                        <select id="celestial-limb"
                                style="width:100%;padding:8px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white">
                            <option value="lower" ${settings.limb === 'lower' ? 'selected' : ''}>Lower Limb</option>
                            <option value="upper" ${settings.limb === 'upper' ? 'selected' : ''}>Upper Limb</option>
                            <option value="center" ${settings.limb === 'center' ? 'selected' : ''}>Center</option>
                        </select>
                    </div>
                    
                    <!-- Temperature & Pressure -->
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                        <div>
                            <label style="font-size:11px;color:rgba(255,255,255,0.6);display:block;margin-bottom:4px">
                                Temp (°C)
                            </label>
                            <input type="number" id="celestial-temp" value="${settings.temperature}"
                                   style="width:100%;padding:8px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white"
                                   step="1">
                        </div>
                        <div>
                            <label style="font-size:11px;color:rgba(255,255,255,0.6);display:block;margin-bottom:4px">
                                Pressure (mb)
                            </label>
                            <input type="number" id="celestial-pressure" value="${settings.pressure}"
                                   style="width:100%;padding:8px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white"
                                   step="1">
                        </div>
                    </div>
                </div>
                
                <div style="margin-top:12px;padding:10px;background:rgba(59,130,246,0.1);border-radius:6px;font-size:10px;color:rgba(255,255,255,0.6)">
                    <strong>Tip:</strong> Standard conditions are 10°C and 1010mb. Refraction is affected by non-standard conditions, especially at low altitudes.
                </div>
            </div>
        `;
    }
    
    // ==================== PHASE 3: SIGHT REDUCTION & LINE OF POSITION ====================
    
    // Lines of Position storage
    let linesOfPosition = [];
    
    /**
     * Perform sight reduction - calculate computed altitude (Hc) and azimuth (Zn)
     * from an assumed position (AP) and celestial body position
     * 
     * This is the core navigation calculation using spherical trigonometry:
     * sin(Hc) = sin(Lat) × sin(Dec) + cos(Lat) × cos(Dec) × cos(LHA)
     * 
     * @param {Object} assumedPosition - { lat, lon } in decimal degrees
     * @param {number} GHA - Greenwich Hour Angle of body in degrees
     * @param {number} dec - Declination of body in degrees
     * @returns {Object} Computed altitude and azimuth
     */
    function sightReduction(assumedPosition, GHA, dec) {
        const lat = assumedPosition.lat;
        const lon = assumedPosition.lon;
        
        // Calculate Local Hour Angle
        // LHA = GHA + Lon (east positive, west negative)
        let LHA = GHA + lon;
        
        // Normalize to 0-360
        while (LHA < 0) LHA += 360;
        while (LHA >= 360) LHA -= 360;
        
        // Convert to radians
        const latRad = lat * DEG_TO_RAD;
        const decRad = dec * DEG_TO_RAD;
        const LHARad = LHA * DEG_TO_RAD;
        
        // Calculate computed altitude (Hc)
        // sin(Hc) = sin(Lat) × sin(Dec) + cos(Lat) × cos(Dec) × cos(LHA)
        const sinHc = Math.sin(latRad) * Math.sin(decRad) + 
                      Math.cos(latRad) * Math.cos(decRad) * Math.cos(LHARad);
        
        // Clamp to valid range [-1, 1] to handle floating point errors
        const sinHcClamped = Math.max(-1, Math.min(1, sinHc));
        const Hc = Math.asin(sinHcClamped) * RAD_TO_DEG;
        
        // Calculate azimuth (Z)
        // cos(Z) = (sin(Dec) - sin(Lat) × sin(Hc)) / (cos(Lat) × cos(Hc))
        const cosHc = Math.cos(Hc * DEG_TO_RAD);
        
        let Zn;  // True azimuth (0-360, measured from north)
        
        if (Math.abs(cosHc) < 0.0001 || Math.abs(Math.cos(latRad)) < 0.0001) {
            // Body is at zenith or observer at pole
            Zn = 0;
        } else {
            const cosZ = (Math.sin(decRad) - Math.sin(latRad) * sinHcClamped) / 
                        (Math.cos(latRad) * cosHc);
            
            // Clamp to valid range
            const cosZClamped = Math.max(-1, Math.min(1, cosZ));
            let Z = Math.acos(cosZClamped) * RAD_TO_DEG;
            
            // Convert Z to true azimuth Zn (0-360 from north)
            // If LHA > 180°, body is east of meridian, Zn = 360 - Z
            // If LHA < 180°, body is west of meridian, Zn = Z
            if (LHA > 180) {
                Zn = 360 - Z;
            } else {
                Zn = Z;
            }
        }
        
        return {
            Hc: Hc,
            Zn: Zn,
            LHA: LHA,
            assumedPosition: { ...assumedPosition },
            formatted: {
                Hc: formatAngle(Hc),
                Zn: Zn.toFixed(1) + '°',
                LHA: formatAngle(LHA)
            }
        };
    }
    
    /**
     * Calculate intercept (difference between observed and computed altitude)
     * 
     * @param {number} Ho - Observed altitude in degrees
     * @param {number} Hc - Computed altitude in degrees
     * @returns {Object} Intercept data
     */
    function calculateIntercept(Ho, Hc) {
        // Intercept in nautical miles (1' of arc = 1 nm)
        const interceptDeg = Ho - Hc;
        const interceptNm = interceptDeg * 60;  // Convert degrees to nautical miles
        
        // Direction: Toward if positive, Away if negative
        const direction = interceptNm >= 0 ? 'toward' : 'away';
        
        return {
            intercept: interceptNm,
            interceptDeg: interceptDeg,
            direction: direction,
            Ho: Ho,
            Hc: Hc,
            formatted: {
                intercept: Math.abs(interceptNm).toFixed(1) + ' nm ' + direction.toUpperCase(),
                interceptShort: (interceptNm >= 0 ? 'T ' : 'A ') + Math.abs(interceptNm).toFixed(1)
            }
        };
    }
    
    /**
     * Generate a Line of Position from sight reduction
     * 
     * @param {Object} assumedPosition - { lat, lon }
     * @param {number} Zn - True azimuth to body
     * @param {number} intercept - Intercept in nautical miles
     * @returns {Object} Line of Position data
     */
    function generateLOP(assumedPosition, Zn, intercept) {
        // The LOP passes through a point offset from AP by the intercept
        // in the direction of the azimuth (if toward) or opposite (if away)
        
        // Calculate the intercept point
        // Move from AP toward/away from body by intercept distance
        const direction = intercept >= 0 ? Zn : (Zn + 180) % 360;
        const distanceNm = Math.abs(intercept);
        
        // Convert distance to degrees (1 nm ≈ 1/60 degree)
        const distanceDeg = distanceNm / 60;
        
        // Calculate intercept point
        const apLatRad = assumedPosition.lat * DEG_TO_RAD;
        const dirRad = direction * DEG_TO_RAD;
        
        // Simple approximation for short distances
        const dLat = distanceDeg * Math.cos(dirRad);
        const dLon = distanceDeg * Math.sin(dirRad) / Math.cos(apLatRad);
        
        const interceptPoint = {
            lat: assumedPosition.lat + dLat,
            lon: assumedPosition.lon + dLon
        };
        
        // The LOP is perpendicular to the azimuth, passing through intercept point
        // LOP bearing is Zn ± 90°
        const lopBearing1 = (Zn + 90) % 360;
        const lopBearing2 = (Zn + 270) % 360;
        
        // Generate line endpoints (extend ~60nm each direction for display)
        const extendNm = 60;
        const extendDeg = extendNm / 60;
        
        const bearing1Rad = lopBearing1 * DEG_TO_RAD;
        const bearing2Rad = lopBearing2 * DEG_TO_RAD;
        
        const ipLatRad = interceptPoint.lat * DEG_TO_RAD;
        
        const endpoint1 = {
            lat: interceptPoint.lat + extendDeg * Math.cos(bearing1Rad),
            lon: interceptPoint.lon + extendDeg * Math.sin(bearing1Rad) / Math.cos(ipLatRad)
        };
        
        const endpoint2 = {
            lat: interceptPoint.lat + extendDeg * Math.cos(bearing2Rad),
            lon: interceptPoint.lon + extendDeg * Math.sin(bearing2Rad) / Math.cos(ipLatRad)
        };
        
        return {
            interceptPoint: interceptPoint,
            bearing: lopBearing1,  // One of the perpendicular bearings
            azimuthToBody: Zn,
            intercept: intercept,
            assumedPosition: assumedPosition,
            endpoints: [endpoint1, endpoint2],
            formatted: {
                interceptPoint: `${formatAngle(interceptPoint.lat, true)}, ${formatAngle(interceptPoint.lon, false)}`,
                bearing: lopBearing1.toFixed(1) + '° / ' + lopBearing2.toFixed(1) + '°'
            }
        };
    }
    
    /**
     * Perform complete sight reduction from an observation
     * 
     * @param {Object} observation - Completed observation from sight log
     * @param {Object} assumedPosition - { lat, lon } - If null, uses GPS or map center
     * @returns {Object} Complete sight reduction with LOP
     */
    function reduceSight(observation, assumedPosition = null) {
        if (!observation || !observation.average) {
            return { error: 'Invalid observation - must have average Ho' };
        }
        
        // Get assumed position
        let AP = assumedPosition;
        if (!AP) {
            // Try to get from GPS
            if (typeof GPSModule !== 'undefined') {
                const gps = GPSModule.getPosition();
                if (gps && gps.lat && gps.lon) {
                    AP = { lat: gps.lat, lon: gps.lon };
                }
            }
            // Fall back to map center
            if (!AP && typeof MapModule !== 'undefined') {
                const center = MapModule.getCenter();
                if (center) {
                    AP = { lat: center.lat, lon: center.lon };
                }
            }
            // Default position if nothing else
            if (!AP) {
                AP = { lat: 0, lon: 0 };
            }
        }
        
        // Round AP to nearest whole minute for traditional sight reduction
        // This makes plotting easier and is standard practice
        const APRounded = {
            lat: Math.round(AP.lat * 60) / 60,
            lon: Math.round(AP.lon * 60) / 60
        };
        
        // Get body data at observation time
        const bodyData = observation.bodyData;
        const GHA = bodyData.GHA;
        const dec = bodyData.dec;
        const Ho = observation.average.Ho;
        
        // Perform sight reduction
        const reduction = sightReduction(APRounded, GHA, dec);
        
        // Calculate intercept
        const intercept = calculateIntercept(Ho, reduction.Hc);
        
        // Generate LOP
        const lop = generateLOP(APRounded, reduction.Zn, intercept.intercept);
        
        // Compile result
        const result = {
            id: Date.now(),
            observationId: observation.id,
            bodyName: observation.bodyName,
            bodyType: observation.bodyType,
            time: observation.average.time,
            
            // Input data
            assumedPosition: APRounded,
            Ho: Ho,
            GHA: GHA,
            dec: dec,
            
            // Calculated values
            Hc: reduction.Hc,
            Zn: reduction.Zn,
            LHA: reduction.LHA,
            intercept: intercept.intercept,
            interceptDirection: intercept.direction,
            
            // Line of Position
            lop: lop,
            
            // Formatted output
            formatted: {
                body: observation.bodyName,
                time: observation.average.time.toISOString().substr(11, 8) + ' UTC',
                AP: `${formatAngle(APRounded.lat, true)}, ${formatAngle(Math.abs(APRounded.lon))}${APRounded.lon >= 0 ? 'E' : 'W'}`,
                Ho: formatAngle(Ho),
                Hc: formatAngle(reduction.Hc),
                Zn: reduction.Zn.toFixed(1) + '°',
                intercept: intercept.formatted.intercept,
                interceptShort: intercept.formatted.interceptShort
            }
        };
        
        return result;
    }
    
    /**
     * Reduce all observations in the sight log
     * @param {Object} assumedPosition - AP for all reductions
     * @returns {Array} Array of sight reductions
     */
    function reduceAllSights(assumedPosition = null) {
        const log = getSightLog();
        const reductions = [];
        
        for (const obs of log) {
            const reduction = reduceSight(obs, assumedPosition);
            if (!reduction.error) {
                reductions.push(reduction);
            }
        }
        
        return reductions;
    }
    
    /**
     * Store a Line of Position for later use in fixing
     * @param {Object} lopData - LOP from reduceSight
     */
    function storeLOP(lopData) {
        if (!lopData || !lopData.lop) {
            return { error: 'Invalid LOP data' };
        }
        
        linesOfPosition.push({
            ...lopData,
            storedAt: new Date()
        });
        
        return { success: true, count: linesOfPosition.length };
    }
    
    /**
     * Get all stored Lines of Position
     */
    function getLOPs() {
        return [...linesOfPosition];
    }
    
    /**
     * Clear stored LOPs
     */
    function clearLOPs() {
        linesOfPosition = [];
    }
    
    /**
     * Delete a specific LOP
     */
    function deleteLOP(id) {
        const index = linesOfPosition.findIndex(l => l.id === id);
        if (index >= 0) {
            linesOfPosition.splice(index, 1);
            return true;
        }
        return false;
    }
    
    /**
     * Calculate where two LOPs intersect (simple fix)
     * @param {Object} lop1 - First Line of Position
     * @param {Object} lop2 - Second Line of Position
     * @returns {Object} Intersection point
     */
    function calculateLOPIntersection(lop1, lop2) {
        // Use the parametric line intersection formula
        const p1 = lop1.lop.endpoints[0];
        const p2 = lop1.lop.endpoints[1];
        const p3 = lop2.lop.endpoints[0];
        const p4 = lop2.lop.endpoints[1];
        
        const x1 = p1.lon, y1 = p1.lat;
        const x2 = p2.lon, y2 = p2.lat;
        const x3 = p3.lon, y3 = p3.lat;
        const x4 = p4.lon, y4 = p4.lat;
        
        const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        
        if (Math.abs(denom) < 0.0000001) {
            // Lines are parallel
            return { error: 'Lines are parallel - no intersection' };
        }
        
        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
        
        const intersectLon = x1 + t * (x2 - x1);
        const intersectLat = y1 + t * (y2 - y1);
        
        // Calculate angle between LOPs (for quality assessment)
        const bearing1 = lop1.lop.bearing;
        const bearing2 = lop2.lop.bearing;
        let angle = Math.abs(bearing1 - bearing2);
        if (angle > 90) angle = 180 - angle;
        
        return {
            lat: intersectLat,
            lon: intersectLon,
            angle: angle,
            quality: angle > 30 ? 'good' : angle > 15 ? 'fair' : 'poor',
            formatted: {
                position: `${formatAngle(intersectLat, true)}, ${formatAngle(Math.abs(intersectLon))}${intersectLon >= 0 ? 'E' : 'W'}`,
                angle: angle.toFixed(1) + '°',
                quality: angle > 30 ? 'Good (>30°)' : angle > 15 ? 'Fair (15-30°)' : 'Poor (<15°)'
            }
        };
    }
    
    // ==================== PHASE 3: RENDERING ====================
    
    /**
     * Render sight reduction result
     */
    function renderSightReduction(reduction) {
        if (reduction.error) {
            return `<div style="color:#ef4444;padding:12px">${reduction.error}</div>`;
        }
        
        const dirColor = reduction.interceptDirection === 'toward' ? '#22c55e' : '#f59e0b';
        
        return `
            <div class="sight-reduction" style="padding:12px;background:var(--color-bg-elevated);border-radius:10px;margin-bottom:12px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                    <div style="font-size:14px;font-weight:600">
                        ${getBodyEmoji(reduction.bodyType)} ${reduction.bodyName}
                    </div>
                    <div style="font-size:11px;color:rgba(255,255,255,0.5)">
                        ${reduction.formatted.time}
                    </div>
                </div>
                
                <!-- AP and Body Data -->
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;font-size:11px">
                    <div style="padding:8px;background:rgba(0,0,0,0.2);border-radius:6px">
                        <div style="color:rgba(255,255,255,0.5)">Assumed Position</div>
                        <div style="font-weight:600">${reduction.formatted.AP}</div>
                    </div>
                    <div style="padding:8px;background:rgba(0,0,0,0.2);border-radius:6px">
                        <div style="color:rgba(255,255,255,0.5)">LHA</div>
                        <div style="font-weight:600">${formatAngle(reduction.LHA)}</div>
                    </div>
                </div>
                
                <!-- Ho vs Hc -->
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px">
                    <div style="padding:10px;background:rgba(34,197,94,0.1);border-radius:6px;text-align:center">
                        <div style="font-size:10px;color:rgba(255,255,255,0.5)">Observed (Ho)</div>
                        <div style="font-size:16px;font-weight:700;color:#22c55e">${reduction.formatted.Ho}</div>
                    </div>
                    <div style="padding:10px;background:rgba(59,130,246,0.1);border-radius:6px;text-align:center">
                        <div style="font-size:10px;color:rgba(255,255,255,0.5)">Computed (Hc)</div>
                        <div style="font-size:16px;font-weight:700;color:#3b82f6">${reduction.formatted.Hc}</div>
                    </div>
                    <div style="padding:10px;background:rgba(139,92,246,0.1);border-radius:6px;text-align:center">
                        <div style="font-size:10px;color:rgba(255,255,255,0.5)">Azimuth (Zn)</div>
                        <div style="font-size:16px;font-weight:700;color:#8b5cf6">${reduction.formatted.Zn}</div>
                    </div>
                </div>
                
                <!-- Intercept -->
                <div style="padding:12px;background:rgba(${reduction.interceptDirection === 'toward' ? '34,197,94' : '245,158,11'},0.15);border-radius:8px;text-align:center;margin-bottom:12px">
                    <div style="font-size:10px;color:rgba(255,255,255,0.5)">Intercept</div>
                    <div style="font-size:20px;font-weight:700;color:${dirColor}">
                        ${reduction.formatted.intercept}
                    </div>
                    <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:4px">
                        ${reduction.interceptDirection === 'toward' ? 
                            'Move toward body from AP' : 
                            'Move away from body from AP'}
                    </div>
                </div>
                
                <!-- LOP Info -->
                <div style="padding:10px;background:rgba(0,0,0,0.2);border-radius:6px;font-size:11px">
                    <div style="font-weight:600;margin-bottom:8px">📍 Line of Position</div>
                    <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px">
                        <span style="color:rgba(255,255,255,0.5)">Intercept Point:</span>
                        <span>${reduction.lop.formatted.interceptPoint}</span>
                        <span style="color:rgba(255,255,255,0.5)">LOP Bearing:</span>
                        <span>${reduction.lop.formatted.bearing}</span>
                    </div>
                </div>
                
                <button class="btn btn--secondary btn--full celestial-store-lop" 
                        data-reduction-id="${reduction.id}" style="margin-top:12px">
                    💾 Store LOP for Fix
                </button>
            </div>
        `;
    }
    
    /**
     * Render LOPs list
     */
    function renderLOPsList() {
        const lops = getLOPs();
        
        if (lops.length === 0) {
            return `
                <div style="padding:20px;text-align:center;color:rgba(255,255,255,0.4);font-size:12px">
                    No Lines of Position stored.<br>
                    Reduce sights and store LOPs to calculate a fix.
                </div>
            `;
        }
        
        return `
            <div class="lops-list" style="padding:12px;background:var(--color-bg-elevated);border-radius:10px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                    <div style="font-size:14px;font-weight:600">📍 Stored LOPs (${lops.length})</div>
                    <button class="btn btn--secondary celestial-clear-lops" style="padding:4px 8px;font-size:10px">
                        Clear All
                    </button>
                </div>
                
                <div style="max-height:200px;overflow-y:auto;margin-bottom:12px">
                    ${lops.map((lop, i) => `
                        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:rgba(0,0,0,0.2);border-radius:6px;margin-bottom:6px;font-size:11px">
                            <div>
                                <div style="font-weight:600">${getBodyEmoji(lop.bodyType)} ${lop.bodyName}</div>
                                <div style="color:rgba(255,255,255,0.5)">
                                    Zn: ${lop.Zn.toFixed(1)}° | ${lop.formatted.interceptShort}
                                </div>
                            </div>
                            <button class="btn btn--secondary celestial-delete-lop" 
                                    data-lop-id="${lop.id}" style="padding:4px 8px;font-size:10px">
                                ✕
                            </button>
                        </div>
                    `).join('')}
                </div>
                
                ${lops.length >= 2 ? `
                    <button class="btn btn--primary btn--full celestial-calculate-fix">
                        🎯 Calculate Position Fix
                    </button>
                ` : `
                    <div style="font-size:10px;color:rgba(255,255,255,0.4);text-align:center">
                        Need at least 2 LOPs for a fix
                    </div>
                `}
            </div>
        `;
    }
    
    /**
     * Render sight reduction workflow widget
     */
    function renderSightReductionWidget(assumedPosition = null) {
        const log = getSightLog();
        const hasObs = log.length > 0;
        
        // Get AP
        let AP = assumedPosition;
        if (!AP) {
            if (typeof GPSModule !== 'undefined') {
                const gps = GPSModule.getPosition();
                if (gps && gps.lat && gps.lon) {
                    AP = { lat: gps.lat, lon: gps.lon };
                }
            }
            if (!AP && typeof MapModule !== 'undefined') {
                const center = MapModule.getCenter();
                if (center) {
                    AP = { lat: center.lat, lon: center.lon };
                }
            }
            if (!AP) {
                AP = { lat: 37.0, lon: -122.0 };
            }
        }
        
        return `
            <div class="sight-reduction-widget" style="padding:12px;background:var(--color-bg-elevated);border-radius:10px">
                <div style="font-size:14px;font-weight:600;margin-bottom:12px">📐 Sight Reduction</div>
                
                <!-- Assumed Position Input -->
                <div style="margin-bottom:12px">
                    <label style="font-size:11px;color:rgba(255,255,255,0.6);display:block;margin-bottom:4px">
                        Assumed Position
                    </label>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                        <div>
                            <input type="number" id="celestial-ap-lat" value="${AP.lat.toFixed(4)}"
                                   style="width:100%;padding:8px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white"
                                   step="0.0001" placeholder="Latitude">
                            <div style="font-size:9px;color:rgba(255,255,255,0.4);margin-top:2px">Latitude (+ N, - S)</div>
                        </div>
                        <div>
                            <input type="number" id="celestial-ap-lon" value="${AP.lon.toFixed(4)}"
                                   style="width:100%;padding:8px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white"
                                   step="0.0001" placeholder="Longitude">
                            <div style="font-size:9px;color:rgba(255,255,255,0.4);margin-top:2px">Longitude (+ E, - W)</div>
                        </div>
                    </div>
                    <button class="btn btn--secondary btn--full celestial-use-gps-ap" style="margin-top:8px;padding:6px">
                        📍 Use Current Location
                    </button>
                </div>
                
                ${!hasObs ? `
                    <div style="text-align:center;padding:20px;color:rgba(255,255,255,0.4);font-size:12px">
                        No observations to reduce.<br>
                        Record celestial observations first.
                    </div>
                ` : `
                    <!-- Observations to reduce -->
                    <div style="font-size:11px;font-weight:600;margin-bottom:8px">
                        Observations (${log.length})
                    </div>
                    <div style="max-height:150px;overflow-y:auto;margin-bottom:12px">
                        ${log.map(obs => `
                            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:rgba(0,0,0,0.2);border-radius:6px;margin-bottom:6px;font-size:11px">
                                <div>
                                    <span style="font-weight:600">${getBodyEmoji(obs.bodyType)} ${obs.bodyName}</span>
                                    <span style="color:rgba(255,255,255,0.5);margin-left:8px">
                                        Ho: ${formatAngle(obs.average.Ho)}
                                    </span>
                                </div>
                                <button class="btn btn--primary celestial-reduce-sight" 
                                        data-obs-id="${obs.id}" style="padding:4px 12px;font-size:10px">
                                    Reduce
                                </button>
                            </div>
                        `).join('')}
                    </div>
                    
                    <button class="btn btn--secondary btn--full celestial-reduce-all" style="margin-bottom:12px">
                        📊 Reduce All Sights
                    </button>
                `}
            </div>
        `;
    }
    
    /**
     * Render LOP on a canvas/map
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Function} latLonToPixel - Coordinate conversion function
     * @param {Object} lopData - LOP data from reduceSight
     * @param {Object} options - Rendering options
     */
    function renderLOPOnMap(ctx, latLonToPixel, lopData, options = {}) {
        const {
            color = '#f59e0b',
            lineWidth = 2,
            showLabel = true,
            dashPattern = [10, 5]
        } = options;
        
        const lop = lopData.lop;
        
        // Convert endpoints to pixels
        const p1 = latLonToPixel(lop.endpoints[0].lat, lop.endpoints[0].lon);
        const p2 = latLonToPixel(lop.endpoints[1].lat, lop.endpoints[1].lon);
        const ip = latLonToPixel(lop.interceptPoint.lat, lop.interceptPoint.lon);
        
        // Draw LOP line
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.setLineDash(dashPattern);
        
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        
        ctx.setLineDash([]);
        
        // Draw intercept point
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(ip.x, ip.y, 5, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw azimuth arrow
        const arrowLength = 30;
        const azRad = lopData.Zn * DEG_TO_RAD;
        const arrowEnd = {
            x: ip.x + arrowLength * Math.sin(azRad),
            y: ip.y - arrowLength * Math.cos(azRad)
        };
        
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(ip.x, ip.y);
        ctx.lineTo(arrowEnd.x, arrowEnd.y);
        ctx.stroke();
        
        // Arrow head
        const headLen = 8;
        const headAngle = 25 * DEG_TO_RAD;
        ctx.beginPath();
        ctx.moveTo(arrowEnd.x, arrowEnd.y);
        ctx.lineTo(
            arrowEnd.x - headLen * Math.sin(azRad - headAngle),
            arrowEnd.y + headLen * Math.cos(azRad - headAngle)
        );
        ctx.moveTo(arrowEnd.x, arrowEnd.y);
        ctx.lineTo(
            arrowEnd.x - headLen * Math.sin(azRad + headAngle),
            arrowEnd.y + headLen * Math.cos(azRad + headAngle)
        );
        ctx.stroke();
        
        // Label
        if (showLabel) {
            ctx.fillStyle = color;
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(lopData.bodyName, ip.x, ip.y - 12);
        }
        
        ctx.restore();
    }
    
    // ==================== PHASE 4: EMERGENCY POSITION FIX ====================
    
    /**
     * Calculate latitude from a noon sight (meridian passage)
     * 
     * At local apparent noon, the sun is on the observer's meridian (LHA = 0).
     * Latitude = 90° - Ho + Dec (when sun is south of zenith)
     * Latitude = 90° - Ho - Dec (when sun is north of zenith) [Southern hemisphere summer]
     * 
     * @param {number} Ho - Observed altitude of sun at meridian passage (degrees)
     * @param {number} dec - Sun's declination at time of observation (degrees)
     * @param {string} bearing - Direction to sun: 'south' or 'north'
     * @returns {Object} Latitude result
     */
    function calculateNoonSightLatitude(Ho, dec, bearing = 'south') {
        // Zenith distance = 90° - altitude
        const zenithDistance = 90 - Ho;
        
        let latitude;
        
        if (bearing === 'south') {
            // Sun bears south (observer in northern hemisphere, or southern hem winter)
            // Latitude = zenith distance + declination (if same name)
            // Latitude = zenith distance - declination (if contrary name)
            latitude = zenithDistance + dec;
        } else {
            // Sun bears north (observer in southern hemisphere summer)
            latitude = -zenithDistance + dec;
        }
        
        // Determine hemisphere
        const hemisphere = latitude >= 0 ? 'N' : 'S';
        
        return {
            latitude: latitude,
            zenithDistance: zenithDistance,
            declination: dec,
            bearing: bearing,
            hemisphere: hemisphere,
            formatted: {
                latitude: formatAngle(Math.abs(latitude), true).replace(/^[NS] /, '') + ' ' + hemisphere,
                zenithDistance: zenithDistance.toFixed(2) + '°',
                method: 'Noon Sight'
            }
        };
    }
    
    /**
     * Calculate time of local apparent noon (meridian passage)
     * 
     * @param {number} longitude - Observer's longitude (degrees, west negative)
     * @param {Date} date - Date for calculation
     * @returns {Object} Time of meridian passage
     */
    function calculateMeridianPassage(longitude, date) {
        // Get sun position at noon UTC to get equation of time
        const noonUTC = new Date(Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate(),
            12, 0, 0
        ));
        
        const sun = getSunPosition(noonUTC);
        const EoT = sun.EoT;  // Equation of time in minutes
        
        // Meridian passage = 12:00 - EoT - (longitude × 4 min/degree)
        // Longitude: east positive means sun passes earlier
        // We use west negative, so: 12:00 - EoT + (longitude × 4)
        const longitudeMinutes = longitude * 4;  // 4 minutes per degree
        const merPassMinutes = 12 * 60 - EoT - longitudeMinutes;
        
        // Convert to hours and minutes
        const hours = Math.floor(merPassMinutes / 60);
        const minutes = merPassMinutes % 60;
        
        // Create Date object for meridian passage (UTC)
        const merPassUTC = new Date(Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate(),
            hours,
            Math.floor(minutes),
            (minutes % 1) * 60
        ));
        
        return {
            timeUTC: merPassUTC,
            hoursUTC: hours + minutes / 60,
            EoT: EoT,
            sunDec: sun.dec,
            formatted: {
                timeUTC: `${String(hours).padStart(2, '0')}:${String(Math.floor(minutes)).padStart(2, '0')} UTC`,
                EoT: (EoT >= 0 ? '+' : '') + EoT.toFixed(1) + ' min',
                sunDec: formatAngle(sun.dec, true)
            }
        };
    }
    
    /**
     * Perform a complete noon sight observation
     * Records sun altitudes around meridian passage and finds maximum
     * 
     * @param {Array} altitudes - Array of { time: Date, Ho: number } observations
     * @param {number} estimatedLon - Estimated longitude for bearing determination
     * @returns {Object} Noon sight result with latitude
     */
    function processNoonSight(altitudes, estimatedLon = 0) {
        if (!altitudes || altitudes.length === 0) {
            return { error: 'No altitudes provided' };
        }
        
        // Find maximum altitude
        let maxAlt = { Ho: -90, time: null };
        for (const obs of altitudes) {
            if (obs.Ho > maxAlt.Ho) {
                maxAlt = obs;
            }
        }
        
        // Get sun declination at time of max altitude
        const sun = getSunPosition(maxAlt.time);
        
        // Determine bearing based on estimated position and sun dec
        // In northern hemisphere: sun bears south (usually)
        // In southern hemisphere: sun bears north (usually)
        const bearing = estimatedLon >= -180 && estimatedLon <= 180 ? 
            (sun.dec > 0 ? 'south' : 'north') : 'south';
        
        const result = calculateNoonSightLatitude(maxAlt.Ho, sun.dec, bearing);
        
        return {
            ...result,
            maxAltitude: maxAlt.Ho,
            timeOfMax: maxAlt.time,
            observations: altitudes.length,
            sunPosition: sun,
            formatted: {
                ...result.formatted,
                maxAltitude: formatAngle(maxAlt.Ho),
                timeOfMax: maxAlt.time.toISOString().substr(11, 8) + ' UTC'
            }
        };
    }
    
    /**
     * Calculate latitude from Polaris altitude
     * 
     * Polaris altitude approximately equals latitude, but small corrections apply:
     * Latitude = Ho - p × cos(LHA) + 0.5' × sin(LHA)² × tan(Lat)
     * 
     * Simplified for emergency use: Latitude ≈ Ho - 1° (rough correction)
     * 
     * @param {number} Ho - Observed altitude of Polaris (degrees)
     * @param {Date} date - Time of observation
     * @param {number} estimatedLon - Estimated longitude for LHA calculation
     * @param {boolean} applyCorrection - Apply full correction (default true)
     * @returns {Object} Latitude result
     */
    function calculatePolarisLatitude(Ho, date, estimatedLon = 0, applyCorrection = true) {
        // Get Polaris position
        const polaris = getStarPosition('Polaris', date);
        
        // Polaris declination is about 89.26°, not exactly 90°
        // The "polar distance" p = 90° - dec ≈ 0.74°
        const polarDistance = 90 - polaris.dec;
        
        // Calculate LHA of Aries
        const ghaAries = getAriesGHA(date);
        
        // LHA Polaris = GHA Aries + SHA Polaris + Longitude
        let lhaPolaris = ghaAries + polaris.SHA + estimatedLon;
        while (lhaPolaris < 0) lhaPolaris += 360;
        while (lhaPolaris >= 360) lhaPolaris -= 360;
        
        let latitude = Ho;
        let correction = 0;
        
        if (applyCorrection) {
            // First correction: -p × cos(LHA)
            const lhaRad = lhaPolaris * DEG_TO_RAD;
            correction = -polarDistance * Math.cos(lhaRad);
            
            // Second correction (small): 0.5' × sin²(LHA) × tan(Ho)
            // Only significant at low latitudes
            const correction2 = (0.5 / 60) * Math.pow(Math.sin(lhaRad), 2) * Math.tan(Ho * DEG_TO_RAD);
            
            latitude = Ho + correction + correction2;
        }
        
        // Polaris is only visible from northern hemisphere
        if (latitude < 0) {
            return { 
                error: 'Polaris not visible from southern hemisphere',
                latitude: latitude
            };
        }
        
        return {
            latitude: latitude,
            observedAltitude: Ho,
            correction: correction,
            lhaPolaris: lhaPolaris,
            polarDistance: polarDistance,
            polarisDec: polaris.dec,
            formatted: {
                latitude: formatAngle(latitude, true),
                correction: (correction >= 0 ? '+' : '') + (correction * 60).toFixed(1) + "'",
                lhaPolaris: formatAngle(lhaPolaris),
                method: 'Polaris Sight'
            }
        };
    }
    
    /**
     * Calculate longitude from time of meridian passage
     * 
     * If you know the exact UTC time when the sun reached its maximum altitude,
     * you can calculate longitude.
     * 
     * @param {Date} merPassTime - UTC time of observed meridian passage
     * @param {Date} date - Date of observation
     * @returns {Object} Longitude result
     */
    function calculateLongitudeFromNoon(merPassTime, date) {
        // Get equation of time for the date
        const noonUTC = new Date(Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate(),
            12, 0, 0
        ));
        const sun = getSunPosition(noonUTC);
        const EoT = sun.EoT;  // minutes
        
        // Time difference from 12:00 UTC
        const observedHours = merPassTime.getUTCHours() + 
                             merPassTime.getUTCMinutes() / 60 + 
                             merPassTime.getUTCSeconds() / 3600;
        
        // Time of meridian passage at Greenwich = 12:00 - EoT
        const greenwichNoon = 12 - EoT / 60;
        
        // Longitude = (Greenwich noon - observed noon) × 15°/hour
        const timeDiff = greenwichNoon - observedHours;
        const longitude = timeDiff * 15;
        
        // Normalize to -180 to +180
        let lonNormalized = longitude;
        if (lonNormalized > 180) lonNormalized -= 360;
        if (lonNormalized < -180) lonNormalized += 360;
        
        const hemisphere = lonNormalized >= 0 ? 'E' : 'W';
        
        return {
            longitude: lonNormalized,
            timeDifference: timeDiff,
            EoT: EoT,
            formatted: {
                longitude: formatAngle(Math.abs(lonNormalized)) + ' ' + hemisphere,
                timeDiff: (timeDiff >= 0 ? '+' : '') + (timeDiff * 60).toFixed(1) + ' min',
                method: 'Noon Time'
            }
        };
    }
    
    /**
     * Calculate a running fix from two observations of the same body
     * 
     * @param {Object} sight1 - First sight reduction
     * @param {Object} sight2 - Second sight reduction  
     * @param {number} course - Course made good between sights (degrees true)
     * @param {number} speed - Speed made good (knots)
     * @returns {Object} Running fix position
     */
    function calculateRunningFix(sight1, sight2, course, speed) {
        if (!sight1 || !sight2 || !sight1.lop || !sight2.lop) {
            return { error: 'Invalid sight data' };
        }
        
        // Calculate time difference
        const time1 = new Date(sight1.time);
        const time2 = new Date(sight2.time);
        const timeDiffHours = (time2 - time1) / (1000 * 60 * 60);
        
        if (timeDiffHours <= 0) {
            return { error: 'Second sight must be after first sight' };
        }
        
        // Calculate distance traveled
        const distanceNm = speed * timeDiffHours;
        
        // Advance first LOP by distance and course
        // Move the intercept point along the course
        const courseRad = course * DEG_TO_RAD;
        const distanceDeg = distanceNm / 60;  // 1nm ≈ 1 arcminute ≈ 1/60 degree
        
        const ip1 = sight1.lop.interceptPoint;
        const ip1Rad = ip1.lat * DEG_TO_RAD;
        
        // Calculate new position of first LOP
        const advancedLat = ip1.lat + distanceDeg * Math.cos(courseRad);
        const advancedLon = ip1.lon + distanceDeg * Math.sin(courseRad) / Math.cos(ip1Rad);
        
        // Create advanced LOP (same bearing, new position)
        const advancedLOP1 = {
            ...sight1,
            lop: {
                ...sight1.lop,
                interceptPoint: { lat: advancedLat, lon: advancedLon },
                endpoints: [
                    {
                        lat: advancedLat + (sight1.lop.endpoints[0].lat - ip1.lat),
                        lon: advancedLon + (sight1.lop.endpoints[0].lon - ip1.lon)
                    },
                    {
                        lat: advancedLat + (sight1.lop.endpoints[1].lat - ip1.lat),
                        lon: advancedLon + (sight1.lop.endpoints[1].lon - ip1.lon)
                    }
                ]
            }
        };
        
        // Calculate intersection of advanced LOP1 with LOP2
        const fix = calculateLOPIntersection(advancedLOP1, sight2);
        
        if (fix.error) {
            return fix;
        }
        
        return {
            ...fix,
            runningFix: true,
            timeDifference: timeDiffHours,
            course: course,
            speed: speed,
            distanceRun: distanceNm,
            sight1Body: sight1.bodyName,
            sight2Body: sight2.bodyName,
            formatted: {
                ...fix.formatted,
                position: fix.formatted.position,
                timeDiff: timeDiffHours.toFixed(1) + ' hours',
                distanceRun: distanceNm.toFixed(1) + ' nm',
                method: 'Running Fix'
            }
        };
    }
    
    /**
     * Emergency position estimate using sun only (AM/PM method)
     * Take two sun sights several hours apart and use running fix
     * 
     * @param {Object} amSight - Morning sun observation (reduced)
     * @param {Object} pmSight - Afternoon sun observation (reduced)
     * @param {number} course - Course made good
     * @param {number} speed - Speed made good
     * @returns {Object} Emergency fix
     */
    function calculateAMPMFix(amSight, pmSight, course, speed) {
        const result = calculateRunningFix(amSight, pmSight, course, speed);
        
        if (!result.error) {
            result.formatted.method = 'AM/PM Sun Fix';
        }
        
        return result;
    }
    
    // ==================== PHASE 4: EMERGENCY FIX UI ====================
    
    /**
     * Render noon sight helper widget
     */
    function renderNoonSightWidget(estimatedLon = 0) {
        const today = new Date();
        const merPass = calculateMeridianPassage(estimatedLon, today);
        
        return `
            <div class="emergency-noon-sight" style="padding:12px;background:var(--color-bg-elevated);border-radius:10px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                    <div style="font-size:14px;font-weight:600">☀️ Noon Sight (Latitude)</div>
                    <div style="font-size:11px;padding:4px 8px;background:rgba(34,197,94,0.2);border-radius:4px;color:#22c55e">
                        Emergency Method
                    </div>
                </div>
                
                <div style="padding:12px;background:rgba(251,191,36,0.1);border-radius:8px;margin-bottom:12px">
                    <div style="font-size:11px;color:rgba(255,255,255,0.6);margin-bottom:4px">
                        Today's Meridian Passage (Est. Lon: ${estimatedLon.toFixed(0)}°)
                    </div>
                    <div style="font-size:24px;font-weight:700;color:#fbbf24">
                        ${merPass.formatted.timeUTC}
                    </div>
                    <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-top:4px">
                        EoT: ${merPass.formatted.EoT} | Sun Dec: ${merPass.formatted.sunDec}
                    </div>
                </div>
                
                <div style="font-size:11px;color:rgba(255,255,255,0.6);margin-bottom:8px">
                    <strong>Instructions:</strong>
                    <ol style="margin:8px 0 0 16px;padding:0">
                        <li>Start observing ~15 min before predicted time</li>
                        <li>Record altitude every minute</li>
                        <li>Continue until altitude starts decreasing</li>
                        <li>Maximum altitude gives your latitude</li>
                    </ol>
                </div>
                
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
                    <div>
                        <label style="font-size:10px;color:rgba(255,255,255,0.5)">Max Altitude (Ho)</label>
                        <input type="number" id="noon-ho-deg" placeholder="deg" step="1" min="0" max="90"
                               style="width:100%;padding:8px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white">
                    </div>
                    <div>
                        <label style="font-size:10px;color:rgba(255,255,255,0.5)">Minutes</label>
                        <input type="number" id="noon-ho-min" placeholder="min" step="0.1" min="0" max="59.9"
                               style="width:100%;padding:8px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white">
                    </div>
                </div>
                
                <div style="margin-bottom:12px">
                    <label style="font-size:10px;color:rgba(255,255,255,0.5)">Sun Bearing at Noon</label>
                    <select id="noon-bearing" style="width:100%;padding:8px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white">
                        <option value="south">South (Northern Hemisphere)</option>
                        <option value="north">North (Southern Hemisphere)</option>
                    </select>
                </div>
                
                <button class="btn btn--primary btn--full" id="calculate-noon-latitude">
                    📍 Calculate Latitude
                </button>
                
                <div id="noon-result" style="margin-top:12px;display:none">
                </div>
            </div>
        `;
    }
    
    /**
     * Render Polaris latitude widget
     */
    function renderPolarisWidget(estimatedLon = 0) {
        const now = new Date();
        const polaris = getStarPosition('Polaris', now);
        
        // Check if Polaris is visible
        const polarisAltAz = calculateAltAz(polaris.GHA, polaris.dec, 40, estimatedLon);
        const isVisible = polarisAltAz.altitude > 5;
        
        return `
            <div class="emergency-polaris" style="padding:12px;background:var(--color-bg-elevated);border-radius:10px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                    <div style="font-size:14px;font-weight:600">⭐ Polaris (Latitude)</div>
                    <div style="font-size:11px;padding:4px 8px;background:rgba(34,197,94,0.2);border-radius:4px;color:#22c55e">
                        Emergency Method
                    </div>
                </div>
                
                <div style="padding:12px;background:rgba(139,92,246,0.1);border-radius:8px;margin-bottom:12px">
                    <div style="font-size:11px;color:rgba(255,255,255,0.6);margin-bottom:4px">
                        Polaris Altitude ≈ Your Latitude
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center">
                        <div>
                            <div style="font-size:10px;color:rgba(255,255,255,0.5)">Current GHA</div>
                            <div style="font-size:14px;font-weight:600">${polaris.formatted.GHA}</div>
                        </div>
                        <div>
                            <div style="font-size:10px;color:rgba(255,255,255,0.5)">Declination</div>
                            <div style="font-size:14px;font-weight:600">${polaris.formatted.dec}</div>
                        </div>
                        <div>
                            <div style="font-size:10px;color:rgba(255,255,255,0.5)">Status</div>
                            <div style="font-size:14px;font-weight:600;color:${isVisible ? '#22c55e' : '#ef4444'}">
                                ${isVisible ? '● Visible' : '○ Below Horizon'}
                            </div>
                        </div>
                    </div>
                </div>
                
                <div style="font-size:11px;color:rgba(255,255,255,0.6);margin-bottom:8px">
                    <strong>Finding Polaris:</strong><br>
                    Follow the "pointer stars" of the Big Dipper (Dubhe & Merak) 
                    about 5× their separation to find Polaris at the end of the Little Dipper's handle.
                </div>
                
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
                    <div>
                        <label style="font-size:10px;color:rgba(255,255,255,0.5)">Observed Altitude</label>
                        <input type="number" id="polaris-ho-deg" placeholder="deg" step="1" min="0" max="90"
                               style="width:100%;padding:8px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white">
                    </div>
                    <div>
                        <label style="font-size:10px;color:rgba(255,255,255,0.5)">Minutes</label>
                        <input type="number" id="polaris-ho-min" placeholder="min" step="0.1" min="0" max="59.9"
                               style="width:100%;padding:8px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white">
                    </div>
                </div>
                
                <div style="margin-bottom:12px">
                    <label style="font-size:10px;color:rgba(255,255,255,0.5)">Estimated Longitude (for correction)</label>
                    <input type="number" id="polaris-lon" value="${estimatedLon}" step="1" min="-180" max="180"
                           style="width:100%;padding:8px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white">
                </div>
                
                <button class="btn btn--primary btn--full" id="calculate-polaris-latitude">
                    📍 Calculate Latitude
                </button>
                
                <div id="polaris-result" style="margin-top:12px;display:none">
                </div>
                
                <div style="margin-top:12px;padding:8px;background:rgba(245,158,11,0.1);border-radius:6px;font-size:10px;color:rgba(255,255,255,0.6)">
                    <strong>Note:</strong> Polaris method only works in Northern Hemisphere. 
                    Quick approximation: Your latitude ≈ Polaris altitude (within ~1°).
                </div>
            </div>
        `;
    }
    
    /**
     * Render emergency fix result
     */
    function renderEmergencyFixResult(result, method = 'Latitude Fix') {
        if (result.error) {
            return `
                <div style="padding:12px;background:rgba(239,68,68,0.1);border-radius:8px;color:#ef4444">
                    <strong>Error:</strong> ${result.error}
                </div>
            `;
        }
        
        if (result.latitude !== undefined && result.longitude === undefined) {
            // Latitude only result
            return `
                <div style="padding:16px;background:rgba(34,197,94,0.1);border-radius:8px;text-align:center">
                    <div style="font-size:11px;color:rgba(255,255,255,0.6);margin-bottom:4px">
                        ${method}
                    </div>
                    <div style="font-size:28px;font-weight:700;color:#22c55e">
                        ${result.formatted.latitude}
                    </div>
                    ${result.correction !== undefined ? `
                        <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-top:4px">
                            Correction: ${result.formatted.correction}
                        </div>
                    ` : ''}
                </div>
            `;
        }
        
        if (result.longitude !== undefined && result.latitude === undefined) {
            // Longitude only result
            return `
                <div style="padding:16px;background:rgba(59,130,246,0.1);border-radius:8px;text-align:center">
                    <div style="font-size:11px;color:rgba(255,255,255,0.6);margin-bottom:4px">
                        ${method}
                    </div>
                    <div style="font-size:28px;font-weight:700;color:#3b82f6">
                        ${result.formatted.longitude}
                    </div>
                </div>
            `;
        }
        
        // Full position
        return `
            <div style="padding:16px;background:rgba(139,92,246,0.1);border-radius:8px;text-align:center">
                <div style="font-size:11px;color:rgba(255,255,255,0.6);margin-bottom:4px">
                    ${result.formatted?.method || method}
                </div>
                <div style="font-size:24px;font-weight:700;color:#8b5cf6">
                    ${result.formatted.position}
                </div>
                ${result.quality ? `
                    <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-top:4px">
                        Quality: ${result.formatted.quality}
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    /**
     * Render complete emergency navigation panel
     */
    function renderEmergencyNavWidget(estimatedLat = 37, estimatedLon = -122) {
        return `
            <div class="emergency-nav" style="padding:12px;background:var(--color-bg-elevated);border-radius:10px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                    <div style="font-size:16px;font-weight:700">🆘 Emergency Navigation</div>
                </div>
                
                <div style="padding:12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;margin-bottom:16px">
                    <div style="font-size:12px;font-weight:600;color:#ef4444;margin-bottom:4px">
                        When GPS is Unavailable
                    </div>
                    <div style="font-size:11px;color:rgba(255,255,255,0.7)">
                        These methods can determine your position using only celestial observations. 
                        Accuracy: typically within 5-15 nautical miles.
                    </div>
                </div>
                
                <!-- Method selector -->
                <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;margin-bottom:16px">
                    <button class="btn btn--secondary emergency-method-btn active" data-method="noon" 
                            style="padding:12px;display:flex;flex-direction:column;align-items:center;gap:4px">
                        <span style="font-size:20px">☀️</span>
                        <span style="font-size:10px">Noon Sight</span>
                    </button>
                    <button class="btn btn--secondary emergency-method-btn" data-method="polaris"
                            style="padding:12px;display:flex;flex-direction:column;align-items:center;gap:4px">
                        <span style="font-size:20px">⭐</span>
                        <span style="font-size:10px">Polaris</span>
                    </button>
                    <button class="btn btn--secondary emergency-method-btn" data-method="running"
                            style="padding:12px;display:flex;flex-direction:column;align-items:center;gap:4px">
                        <span style="font-size:20px">🔄</span>
                        <span style="font-size:10px">Running Fix</span>
                    </button>
                </div>
                
                <!-- Method content area -->
                <div id="emergency-method-content">
                    ${renderNoonSightWidget(estimatedLon)}
                </div>
            </div>
        `;
    }
    
    /**
     * Render running fix widget
     */
    function renderRunningFixWidget() {
        const log = getSightLog();
        
        return `
            <div class="emergency-running-fix" style="padding:12px;background:var(--color-bg-elevated);border-radius:10px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                    <div style="font-size:14px;font-weight:600">🔄 Running Fix</div>
                    <div style="font-size:11px;padding:4px 8px;background:rgba(34,197,94,0.2);border-radius:4px;color:#22c55e">
                        Emergency Method
                    </div>
                </div>
                
                <div style="font-size:11px;color:rgba(255,255,255,0.6);margin-bottom:12px">
                    Take two sights of the same or different bodies. The first LOP is 
                    advanced by your course and speed to intersect with the second LOP.
                </div>
                
                ${log.length < 2 ? `
                    <div style="padding:20px;text-align:center;background:rgba(0,0,0,0.2);border-radius:8px">
                        <div style="font-size:12px;color:rgba(255,255,255,0.5)">
                            Need at least 2 observations for running fix.
                        </div>
                        <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:4px">
                            ${log.length} observation(s) recorded
                        </div>
                    </div>
                ` : `
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
                        <div>
                            <label style="font-size:10px;color:rgba(255,255,255,0.5)">Course (°T)</label>
                            <input type="number" id="running-course" placeholder="000" step="1" min="0" max="359"
                                   style="width:100%;padding:8px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white">
                        </div>
                        <div>
                            <label style="font-size:10px;color:rgba(255,255,255,0.5)">Speed (kts)</label>
                            <input type="number" id="running-speed" placeholder="5.0" step="0.1" min="0"
                                   style="width:100%;padding:8px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white">
                        </div>
                    </div>
                    
                    <div style="margin-bottom:12px">
                        <label style="font-size:10px;color:rgba(255,255,255,0.5)">First Sight</label>
                        <select id="running-sight1" style="width:100%;padding:8px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white">
                            ${log.map((obs, i) => `
                                <option value="${obs.id}">${obs.bodyName} - ${obs.startTime.toLocaleTimeString()}</option>
                            `).join('')}
                        </select>
                    </div>
                    
                    <div style="margin-bottom:12px">
                        <label style="font-size:10px;color:rgba(255,255,255,0.5)">Second Sight</label>
                        <select id="running-sight2" style="width:100%;padding:8px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white">
                            ${log.map((obs, i) => `
                                <option value="${obs.id}" ${i === log.length - 1 ? 'selected' : ''}>
                                    ${obs.bodyName} - ${obs.startTime.toLocaleTimeString()}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                    
                    <button class="btn btn--primary btn--full" id="calculate-running-fix">
                        📍 Calculate Running Fix
                    </button>
                `}
                
                <div id="running-fix-result" style="margin-top:12px;display:none">
                </div>
            </div>
        `;
    }
    
    // ==================== PHASE 5: CELESTIAL TOOLS ====================
    
    // Star chart configuration
    const CONSTELLATION_LINES = {
        'Ursa Major': [['Dubhe', 'Merak'], ['Merak', 'Phecda'], ['Phecda', 'Megrez'], 
                       ['Megrez', 'Alioth'], ['Alioth', 'Mizar'], ['Mizar', 'Alkaid'],
                       ['Megrez', 'Dubhe']],
        'Ursa Minor': [['Polaris', 'Kochab']],
        'Orion': [['Betelgeuse', 'Bellatrix'], ['Rigel', 'Saiph'], 
                  ['Betelgeuse', 'Alnilam'], ['Bellatrix', 'Alnilam'],
                  ['Rigel', 'Alnilam'], ['Saiph', 'Alnilam']],
        'Scorpius': [['Antares', 'Shaula']],
        'Crux': [['Acrux', 'Gacrux']],
        'Cygnus': [['Deneb', 'Sadr'], ['Sadr', 'Gienah']]
    };
    
    // Additional stars for constellation drawing (not navigation stars)
    const CONSTELLATION_STARS = {
        'Merak': { ra: 165.46, dec: 56.38 },
        'Phecda': { ra: 178.46, dec: 53.69 },
        'Megrez': { ra: 183.86, dec: 57.03 },
        'Mizar': { ra: 200.98, dec: 54.93 },
        'Sadr': { ra: 305.56, dec: 40.26 },
        'Saiph': { ra: 86.94, dec: -9.67 }
    };
    
    /**
     * Generate star chart data for a given location and time
     * 
     * @param {number} lat - Observer latitude
     * @param {number} lon - Observer longitude
     * @param {Date} date - Observation time
     * @param {Object} options - Chart options
     * @returns {Object} Star chart data
     */
    function generateStarChart(lat, lon, date, options = {}) {
        const {
            minAltitude = -5,
            maxMagnitude = 3.0,
            includeConstellations = true,
            includePlanets = true,
            includeMoon = true
        } = options;
        
        const chartData = {
            observer: { lat, lon },
            time: date,
            center: { altitude: 90, azimuth: 0 },  // Zenith
            stars: [],
            planets: [],
            moon: null,
            sun: null,
            constellationLines: []
        };
        
        // Get all star positions
        const stars = getAllStarPositions(date);
        
        for (const star of stars) {
            // Filter by magnitude
            if (star.magnitude > maxMagnitude) continue;
            
            // Calculate alt/az
            const altAz = calculateAltAz(star.GHA, star.dec, lat, lon);
            
            // Filter by altitude
            if (altAz.altitude < minAltitude) continue;
            
            chartData.stars.push({
                name: star.name,
                magnitude: star.magnitude,
                constellation: star.constellation,
                altitude: altAz.altitude,
                azimuth: altAz.azimuth,
                GHA: star.GHA,
                dec: star.dec
            });
        }
        
        // Add planets if requested
        if (includePlanets) {
            const planets = ['venus', 'mars', 'jupiter', 'saturn'];
            for (const planet of planets) {
                const pos = getPlanetPosition(planet, date);
                if (!pos.error) {
                    const altAz = calculateAltAz(pos.GHA, pos.dec, lat, lon);
                    if (altAz.altitude > minAltitude) {
                        chartData.planets.push({
                            name: planet.charAt(0).toUpperCase() + planet.slice(1),
                            altitude: altAz.altitude,
                            azimuth: altAz.azimuth,
                            magnitude: pos.mag || 0
                        });
                    }
                }
            }
        }
        
        // Add moon if requested
        if (includeMoon) {
            const moon = getMoonPosition(date);
            const moonAltAz = calculateAltAz(moon.GHA, moon.dec, lat, lon);
            if (moonAltAz.altitude > minAltitude) {
                chartData.moon = {
                    altitude: moonAltAz.altitude,
                    azimuth: moonAltAz.azimuth,
                    phase: moon.phase,
                    illumination: Math.abs(Math.cos(moon.phase * Math.PI * 2)) * 100
                };
            }
        }
        
        // Check sun position (for twilight info)
        const sun = getSunPosition(date);
        const sunAltAz = calculateAltAz(sun.GHA, sun.dec, lat, lon);
        chartData.sun = {
            altitude: sunAltAz.altitude,
            azimuth: sunAltAz.azimuth,
            isDay: sunAltAz.altitude > 0,
            twilight: sunAltAz.altitude > -18 ? 
                (sunAltAz.altitude > -12 ? 
                    (sunAltAz.altitude > -6 ? 
                        (sunAltAz.altitude > 0 ? 'day' : 'civil') 
                        : 'nautical') 
                    : 'astronomical') 
                : 'night'
        };
        
        return chartData;
    }
    
    /**
     * Convert altitude/azimuth to chart X/Y coordinates (stereographic projection)
     * 
     * @param {number} altitude - Altitude in degrees
     * @param {number} azimuth - Azimuth in degrees
     * @param {number} radius - Chart radius in pixels
     * @returns {Object} X, Y coordinates
     */
    function altAzToChartXY(altitude, azimuth, radius) {
        // Stereographic projection from zenith
        // r = radius * cos(alt) for simple projection
        // or r = radius * (90 - alt) / 90 for linear
        const r = radius * (90 - altitude) / 90;
        const azRad = azimuth * DEG_TO_RAD;
        
        return {
            x: r * Math.sin(azRad),
            y: -r * Math.cos(azRad)  // North is up (negative Y)
        };
    }
    
    /**
     * Render star chart on canvas
     * 
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Object} chartData - Data from generateStarChart
     * @param {Object} options - Rendering options
     */
    function renderStarChartCanvas(ctx, chartData, options = {}) {
        const {
            centerX = 200,
            centerY = 200,
            radius = 180,
            showLabels = true,
            showGrid = true,
            showCardinals = true,
            backgroundColor = '#0a1628',
            gridColor = 'rgba(100, 150, 255, 0.2)',
            starColor = '#ffffff',
            planetColor = '#fbbf24',
            moonColor = '#e2e8f0'
        } = options;
        
        // Clear and fill background
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(centerX - radius - 20, centerY - radius - 20, 
                     (radius + 20) * 2, (radius + 20) * 2);
        
        // Draw horizon circle
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.stroke();
        
        // Draw altitude circles (grid)
        if (showGrid) {
            ctx.strokeStyle = gridColor;
            ctx.lineWidth = 1;
            for (let alt = 30; alt < 90; alt += 30) {
                const r = radius * (90 - alt) / 90;
                ctx.beginPath();
                ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
                ctx.stroke();
            }
            
            // Draw azimuth lines
            for (let az = 0; az < 360; az += 45) {
                const azRad = az * DEG_TO_RAD;
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.lineTo(
                    centerX + radius * Math.sin(azRad),
                    centerY - radius * Math.cos(azRad)
                );
                ctx.stroke();
            }
        }
        
        // Draw cardinal directions
        if (showCardinals) {
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            const cardinals = [
                { label: 'N', az: 0 },
                { label: 'E', az: 90 },
                { label: 'S', az: 180 },
                { label: 'W', az: 270 }
            ];
            
            for (const c of cardinals) {
                const azRad = c.az * DEG_TO_RAD;
                const labelR = radius + 15;
                ctx.fillText(c.label,
                    centerX + labelR * Math.sin(azRad),
                    centerY - labelR * Math.cos(azRad)
                );
            }
        }
        
        // Draw stars
        for (const star of chartData.stars) {
            const pos = altAzToChartXY(star.altitude, star.azimuth, radius);
            const x = centerX + pos.x;
            const y = centerY + pos.y;
            
            // Star size based on magnitude (brighter = larger)
            const size = Math.max(1, 4 - star.magnitude);
            
            ctx.fillStyle = starColor;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
            
            // Label bright stars
            if (showLabels && star.magnitude < 1.5) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                ctx.font = '10px sans-serif';
                ctx.textAlign = 'left';
                ctx.fillText(star.name, x + size + 3, y + 3);
            }
        }
        
        // Draw planets
        for (const planet of chartData.planets) {
            const pos = altAzToChartXY(planet.altitude, planet.azimuth, radius);
            const x = centerX + pos.x;
            const y = centerY + pos.y;
            
            ctx.fillStyle = planetColor;
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
            
            if (showLabels) {
                ctx.fillStyle = planetColor;
                ctx.font = '10px sans-serif';
                ctx.fillText(planet.name, x + 6, y + 3);
            }
        }
        
        // Draw moon
        if (chartData.moon) {
            const pos = altAzToChartXY(chartData.moon.altitude, chartData.moon.azimuth, radius);
            const x = centerX + pos.x;
            const y = centerY + pos.y;
            
            ctx.fillStyle = moonColor;
            ctx.beginPath();
            ctx.arc(x, y, 8, 0, Math.PI * 2);
            ctx.fill();
            
            // Draw phase shadow
            const phase = chartData.moon.phase;
            ctx.fillStyle = backgroundColor;
            ctx.beginPath();
            if (phase < 0.5) {
                // Waxing - shadow on left
                ctx.ellipse(x, y, 8 * (1 - phase * 2), 8, 0, -Math.PI/2, Math.PI/2);
            } else {
                // Waning - shadow on right
                ctx.ellipse(x, y, 8 * ((phase - 0.5) * 2), 8, 0, Math.PI/2, -Math.PI/2);
            }
            ctx.fill();
            
            if (showLabels) {
                ctx.fillStyle = moonColor;
                ctx.font = '10px sans-serif';
                ctx.fillText('Moon', x + 10, y + 3);
            }
        }
        
        // Draw zenith marker
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
        ctx.fill();
    }
    
    /**
     * Calculate sun compass direction
     * Uses sun position to determine cardinal directions
     * 
     * @param {number} lat - Observer latitude
     * @param {number} lon - Observer longitude
     * @param {Date} date - Current time
     * @returns {Object} Sun compass data
     */
    function calculateSunCompass(lat, lon, date) {
        const sun = getSunPosition(date);
        const sunAltAz = calculateAltAz(sun.GHA, sun.dec, lat, lon);
        
        // Sun must be above horizon for this to work
        if (sunAltAz.altitude < 0) {
            return {
                error: 'Sun is below horizon',
                altitude: sunAltAz.altitude
            };
        }
        
        // Direction to sun
        const sunAzimuth = sunAltAz.azimuth;
        
        // Calculate cardinal directions from sun position
        const cardinals = {
            north: normalizeAngle(sunAzimuth + 180),  // Opposite of sun bearing...
            east: normalizeAngle(sunAzimuth + 270),
            south: sunAzimuth,  // If sun is due south, this is south (NH noon)
            west: normalizeAngle(sunAzimuth + 90)
        };
        
        // Actually, we need to calculate true north based on sun position
        // The sun's azimuth tells us where the sun is; we can derive directions
        
        return {
            sunAzimuth: sunAzimuth,
            sunAltitude: sunAltAz.altitude,
            pointSunDirection: sunAzimuth,
            north: normalizeAngle(sunAzimuth - sunAzimuth + 0),  // True north is just 0°
            directions: {
                N: 0,
                NE: 45,
                E: 90,
                SE: 135,
                S: 180,
                SW: 225,
                W: 270,
                NW: 315
            },
            // How to find north: rotate (180 - sunAzimuth) degrees from sun
            rotationFromSun: normalizeAngle(360 - sunAzimuth),
            instructions: getSunCompassInstructions(sunAzimuth, sunAltAz.altitude, lat, date),
            formatted: {
                sunAzimuth: sunAzimuth.toFixed(1) + '°',
                sunAltitude: sunAltAz.altitude.toFixed(1) + '°',
                rotationFromSun: normalizeAngle(360 - sunAzimuth).toFixed(0) + '° clockwise from sun to North'
            }
        };
    }
    
    /**
     * Generate sun compass instructions based on conditions
     */
    function getSunCompassInstructions(sunAz, sunAlt, lat, date) {
        const instructions = [];
        
        // Basic method: shadow stick
        instructions.push({
            method: 'Shadow Stick',
            steps: [
                'Place a vertical stick in the ground',
                'Mark the tip of the shadow',
                'Wait 15-20 minutes',
                'Mark the new shadow tip',
                'Draw a line between marks - this is roughly East-West',
                'Perpendicular to this line is roughly North-South'
            ]
        });
        
        // Watch method (analog)
        if (lat >= 0) {
            // Northern hemisphere
            instructions.push({
                method: 'Watch Method (N. Hemisphere)',
                steps: [
                    'Point the hour hand at the sun',
                    'Bisect angle between hour hand and 12 o\'clock',
                    'This bisecting line points roughly South',
                    'Opposite direction is North'
                ]
            });
        } else {
            // Southern hemisphere
            instructions.push({
                method: 'Watch Method (S. Hemisphere)',
                steps: [
                    'Point 12 o\'clock at the sun',
                    'Bisect angle between 12 and hour hand',
                    'This bisecting line points roughly North'
                ]
            });
        }
        
        // Digital display method
        instructions.push({
            method: 'Using This Display',
            steps: [
                `Sun is currently at azimuth ${sunAz.toFixed(0)}°`,
                `Face the sun, then turn ${normalizeAngle(360 - sunAz).toFixed(0)}° clockwise`,
                'You are now facing North'
            ]
        });
        
        return instructions;
    }
    
    /**
     * Calculate Polaris finder data
     * Helps locate Polaris using the Big Dipper
     * 
     * @param {number} lat - Observer latitude
     * @param {number} lon - Observer longitude
     * @param {Date} date - Observation time
     * @returns {Object} Polaris finder data
     */
    function calculatePolarisFinder(lat, lon, date) {
        // Only works in northern hemisphere
        if (lat < 0) {
            return {
                error: 'Polaris not visible from Southern Hemisphere',
                alternative: 'Use Southern Cross (Crux) to find south'
            };
        }
        
        // Get positions of key stars
        const polaris = getStarPosition('Polaris', date);
        const dubhe = getStarPosition('Dubhe', date);  // Pointer star 1
        
        // Calculate alt/az
        const polarisAltAz = calculateAltAz(polaris.GHA, polaris.dec, lat, lon);
        const dubheAltAz = calculateAltAz(dubhe.GHA, dubhe.dec, lat, lon);
        
        // Check visibility
        const polarisVisible = polarisAltAz.altitude > 5;
        const dubheVisible = dubheAltAz.altitude > 5;
        
        // Get Big Dipper orientation
        const bigDipperStars = ['Dubhe', 'Merak', 'Alioth', 'Alkaid'];
        const dipperPositions = [];
        
        for (const starName of bigDipperStars) {
            const star = getStarPosition(starName, date);
            if (star && !star.error) {
                const altAz = calculateAltAz(star.GHA, star.dec, lat, lon);
                dipperPositions.push({
                    name: starName,
                    altitude: altAz.altitude,
                    azimuth: altAz.azimuth,
                    visible: altAz.altitude > 5
                });
            }
        }
        
        // Calculate pointer line from Merak through Dubhe to Polaris
        const merak = getStarPosition('Merak', date);
        const merakAltAz = calculateAltAz(merak.GHA, merak.dec, lat, lon);
        
        // Direction from Merak to Dubhe
        const pointerAzimuth = dubheAltAz.azimuth;
        
        return {
            polaris: {
                altitude: polarisAltAz.altitude,
                azimuth: polarisAltAz.azimuth,
                visible: polarisVisible
            },
            bigDipper: dipperPositions,
            pointer: {
                fromMerak: merakAltAz,
                toDubhe: dubheAltAz,
                direction: pointerAzimuth
            },
            instructions: [
                'Find the Big Dipper (Ursa Major)',
                'Locate the two "pointer stars" at the end of the bowl (Merak and Dubhe)',
                'Draw an imaginary line from Merak through Dubhe',
                'Extend this line about 5× the distance between the pointers',
                `Polaris is at altitude ${polarisAltAz.altitude.toFixed(0)}° (your latitude)`,
                `Look toward azimuth ${polarisAltAz.azimuth.toFixed(0)}° (roughly North)`
            ],
            yourLatitude: lat,
            formatted: {
                polarisAlt: formatAngle(polarisAltAz.altitude),
                polarisAz: polarisAltAz.azimuth.toFixed(1) + '°',
                visible: polarisVisible ? 'Yes' : 'Below horizon'
            }
        };
    }
    
    /**
     * Calculate Southern Cross finder for southern hemisphere
     * 
     * @param {number} lat - Observer latitude
     * @param {number} lon - Observer longitude
     * @param {Date} date - Observation time
     * @returns {Object} Southern Cross finder data
     */
    function calculateSouthernCrossFinder(lat, lon, date) {
        // Best from southern hemisphere
        if (lat > 25) {
            return {
                error: 'Southern Cross not well visible from this latitude',
                suggestion: 'Use Polaris for northern hemisphere navigation'
            };
        }
        
        // Get Crux stars
        const acrux = getStarPosition('Acrux', date);
        const gacrux = getStarPosition('Gacrux', date);
        
        const acruxAltAz = calculateAltAz(acrux.GHA, acrux.dec, lat, lon);
        const gacruxAltAz = calculateAltAz(gacrux.GHA, gacrux.dec, lat, lon);
        
        // Direction from Gacrux (top) through Acrux (bottom) points toward south pole
        // Extend 4.5× the length of the cross
        
        // Calculate the bearing from Gacrux to Acrux
        const dAz = acruxAltAz.azimuth - gacruxAltAz.azimuth;
        const crossBearing = acruxAltAz.azimuth;  // Roughly the direction to extend
        
        // South celestial pole direction (from observer)
        // It's at altitude = -(lat) and azimuth = 180
        const scpAltitude = -lat;  // For -35° latitude, SCP is at 35° altitude
        const scpAzimuth = 180;  // Due south
        
        return {
            acrux: {
                altitude: acruxAltAz.altitude,
                azimuth: acruxAltAz.azimuth,
                visible: acruxAltAz.altitude > 5
            },
            gacrux: {
                altitude: gacruxAltAz.altitude,
                azimuth: gacruxAltAz.azimuth,
                visible: gacruxAltAz.altitude > 5
            },
            southCelestialPole: {
                altitude: Math.abs(lat),  // SCP altitude = |latitude| in southern hem
                azimuth: scpAzimuth
            },
            instructions: [
                'Find the Southern Cross (Crux) - 4 bright stars in cross shape',
                'Identify the long axis (Gacrux at top, Acrux at bottom)',
                'Extend the long axis 4.5× its length toward the horizon',
                'This point marks roughly south',
                `South Celestial Pole is at altitude ${Math.abs(lat).toFixed(0)}°`
            ],
            formatted: {
                acruxAlt: formatAngle(acruxAltAz.altitude),
                gacruxAlt: formatAngle(gacruxAltAz.altitude),
                scpAlt: Math.abs(lat).toFixed(0) + '°'
            }
        };
    }
    
    /**
     * Calculate moon navigation data
     * Moon can be used for rough direction finding
     * 
     * @param {number} lat - Observer latitude
     * @param {number} lon - Observer longitude
     * @param {Date} date - Observation time
     * @returns {Object} Moon navigation data
     */
    function calculateMoonNavigation(lat, lon, date) {
        const moon = getMoonPosition(date);
        const moonAltAz = calculateAltAz(moon.GHA, moon.dec, lat, lon);
        
        if (moonAltAz.altitude < 0) {
            return {
                error: 'Moon is below horizon',
                altitude: moonAltAz.altitude,
                nextRise: 'Calculate moon rise time'  // Would need separate calculation
            };
        }
        
        // Moon phase determines illuminated side
        const phase = moon.phase;
        let phaseDescription;
        let illuminatedSide;
        
        if (phase < 0.03 || phase > 0.97) {
            phaseDescription = 'New Moon';
            illuminatedSide = 'none';
        } else if (phase < 0.22) {
            phaseDescription = 'Waxing Crescent';
            illuminatedSide = 'right';  // In northern hemisphere
        } else if (phase < 0.28) {
            phaseDescription = 'First Quarter';
            illuminatedSide = 'right';
        } else if (phase < 0.47) {
            phaseDescription = 'Waxing Gibbous';
            illuminatedSide = 'right';
        } else if (phase < 0.53) {
            phaseDescription = 'Full Moon';
            illuminatedSide = 'both';
        } else if (phase < 0.72) {
            phaseDescription = 'Waning Gibbous';
            illuminatedSide = 'left';
        } else if (phase < 0.78) {
            phaseDescription = 'Last Quarter';
            illuminatedSide = 'left';
        } else {
            phaseDescription = 'Waning Crescent';
            illuminatedSide = 'left';
        }
        
        // Direction finding using moon's horns
        // A line connecting the horns of a crescent moon, extended to horizon, 
        // points roughly north-south
        
        return {
            altitude: moonAltAz.altitude,
            azimuth: moonAltAz.azimuth,
            phase: phase,
            phaseDescription: phaseDescription,
            illumination: (1 - Math.abs(phase - 0.5) * 2) * 100,
            illuminatedSide: illuminatedSide,
            instructions: getMoonNavigationInstructions(phase, illuminatedSide, lat),
            formatted: {
                altitude: formatAngle(moonAltAz.altitude),
                azimuth: moonAltAz.azimuth.toFixed(1) + '°',
                phase: phaseDescription,
                illumination: ((1 - Math.abs(phase - 0.5) * 2) * 100).toFixed(0) + '%'
            }
        };
    }
    
    /**
     * Generate moon navigation instructions
     */
    function getMoonNavigationInstructions(phase, illuminatedSide, lat) {
        const instructions = [];
        
        if (illuminatedSide === 'none') {
            instructions.push('New moon - not useful for navigation');
            return instructions;
        }
        
        if (illuminatedSide === 'both') {
            instructions.push('Full moon rises at sunset, sets at sunrise');
            instructions.push('At midnight, full moon is roughly south (N. hemisphere) or north (S. hemisphere)');
            return instructions;
        }
        
        // Crescent moon method
        instructions.push('CRESCENT MOON METHOD:');
        instructions.push('Draw an imaginary line connecting the two "horns" of the crescent');
        instructions.push('Extend this line down to the horizon');
        instructions.push('This point is roughly south (in northern hemisphere)');
        
        if (lat >= 0) {
            if (illuminatedSide === 'right') {
                instructions.push('Moon is waxing - it will set in the west after midnight');
            } else {
                instructions.push('Moon is waning - it rose in the east before midnight');
            }
        }
        
        return instructions;
    }
    
    // ==================== PHASE 5: RENDERING ====================
    
    /**
     * Render star chart widget (HTML + Canvas placeholder)
     */
    function renderStarChartWidget(lat, lon, date = new Date()) {
        const chartData = generateStarChart(lat, lon, date, { maxMagnitude: 2.5 });
        const visibleStars = chartData.stars.length;
        const twilight = chartData.sun.twilight;
        
        return `
            <div class="star-chart-widget" style="padding:12px;background:var(--color-bg-elevated);border-radius:10px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                    <div style="font-size:14px;font-weight:600">🌟 Star Chart</div>
                    <div style="font-size:11px;padding:4px 8px;background:rgba(139,92,246,0.2);border-radius:4px;color:#a78bfa">
                        ${twilight === 'day' ? '☀️ Daytime' : twilight === 'night' ? '🌙 Night' : '🌅 Twilight'}
                    </div>
                </div>
                
                <div style="display:flex;justify-content:center;margin-bottom:12px">
                    <canvas id="star-chart-canvas" width="400" height="400" 
                            style="border-radius:50%;background:#0a1628;max-width:100%"></canvas>
                </div>
                
                <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;font-size:11px;margin-bottom:12px">
                    <div style="text-align:center;padding:8px;background:rgba(0,0,0,0.2);border-radius:6px">
                        <div style="color:rgba(255,255,255,0.5)">Stars</div>
                        <div style="font-size:16px;font-weight:600">${visibleStars}</div>
                    </div>
                    <div style="text-align:center;padding:8px;background:rgba(0,0,0,0.2);border-radius:6px">
                        <div style="color:rgba(255,255,255,0.5)">Planets</div>
                        <div style="font-size:16px;font-weight:600">${chartData.planets.length}</div>
                    </div>
                    <div style="text-align:center;padding:8px;background:rgba(0,0,0,0.2);border-radius:6px">
                        <div style="color:rgba(255,255,255,0.5)">Moon</div>
                        <div style="font-size:16px;font-weight:600">${chartData.moon ? '●' : '○'}</div>
                    </div>
                </div>
                
                ${chartData.sun.twilight !== 'day' ? `
                    <div style="font-size:11px;color:rgba(255,255,255,0.6)">
                        <strong>Brightest visible:</strong>
                        ${chartData.stars.slice(0, 5).map(s => s.name).join(', ')}
                    </div>
                ` : `
                    <div style="padding:12px;background:rgba(251,191,36,0.1);border-radius:6px;font-size:11px;color:rgba(255,255,255,0.7)">
                        ☀️ Daytime - stars not visible. Chart shows what will be visible after sunset.
                    </div>
                `}
            </div>
        `;
    }
    
    /**
     * Render sun compass widget
     */
    function renderSunCompassWidget(lat, lon, date = new Date()) {
        const compass = calculateSunCompass(lat, lon, date);
        
        if (compass.error) {
            return `
                <div class="sun-compass-widget" style="padding:12px;background:var(--color-bg-elevated);border-radius:10px">
                    <div style="font-size:14px;font-weight:600;margin-bottom:12px">☀️ Sun Compass</div>
                    <div style="padding:20px;text-align:center;background:rgba(100,100,100,0.1);border-radius:8px">
                        <div style="font-size:24px;margin-bottom:8px">🌙</div>
                        <div style="color:rgba(255,255,255,0.6)">${compass.error}</div>
                        <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:8px">
                            Sun altitude: ${compass.altitude?.toFixed(1) || 'N/A'}°
                        </div>
                    </div>
                </div>
            `;
        }
        
        return `
            <div class="sun-compass-widget" style="padding:12px;background:var(--color-bg-elevated);border-radius:10px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                    <div style="font-size:14px;font-weight:600">☀️ Sun Compass</div>
                </div>
                
                <!-- Compass display -->
                <div style="position:relative;width:200px;height:200px;margin:0 auto 16px;background:linear-gradient(135deg, #1e3a5f 0%, #0a1628 100%);border-radius:50%;border:3px solid rgba(255,255,255,0.2)">
                    <!-- Cardinal directions -->
                    <div style="position:absolute;top:8px;left:50%;transform:translateX(-50%);color:white;font-weight:bold">N</div>
                    <div style="position:absolute;bottom:8px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,0.6)">S</div>
                    <div style="position:absolute;left:8px;top:50%;transform:translateY(-50%);color:rgba(255,255,255,0.6)">W</div>
                    <div style="position:absolute;right:8px;top:50%;transform:translateY(-50%);color:rgba(255,255,255,0.6)">E</div>
                    
                    <!-- Sun position indicator -->
                    <div style="position:absolute;top:50%;left:50%;width:12px;height:12px;background:#fbbf24;border-radius:50%;transform:translate(-50%, -50%) rotate(${compass.sunAzimuth}deg) translateY(-70px);box-shadow:0 0 10px #fbbf24">
                    </div>
                    
                    <!-- Center point -->
                    <div style="position:absolute;top:50%;left:50%;width:8px;height:8px;background:white;border-radius:50%;transform:translate(-50%, -50%)"></div>
                </div>
                
                <!-- Sun position info -->
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
                    <div style="padding:10px;background:rgba(251,191,36,0.1);border-radius:6px;text-align:center">
                        <div style="font-size:10px;color:rgba(255,255,255,0.5)">Sun Azimuth</div>
                        <div style="font-size:18px;font-weight:700;color:#fbbf24">${compass.formatted.sunAzimuth}</div>
                    </div>
                    <div style="padding:10px;background:rgba(251,191,36,0.1);border-radius:6px;text-align:center">
                        <div style="font-size:10px;color:rgba(255,255,255,0.5)">Sun Altitude</div>
                        <div style="font-size:18px;font-weight:700;color:#fbbf24">${compass.formatted.sunAltitude}</div>
                    </div>
                </div>
                
                <!-- Instructions -->
                <div style="padding:12px;background:rgba(0,0,0,0.2);border-radius:8px">
                    <div style="font-size:11px;font-weight:600;margin-bottom:8px">Finding North:</div>
                    <div style="font-size:11px;color:rgba(255,255,255,0.7)">
                        <ol style="margin:0;padding-left:16px">
                            <li>Face the sun (azimuth ${compass.formatted.sunAzimuth})</li>
                            <li>Turn ${compass.formatted.rotationFromSun}</li>
                            <li>You are now facing North</li>
                        </ol>
                    </div>
                </div>
                
                <!-- Shadow stick method -->
                <div style="margin-top:12px;padding:10px;background:rgba(34,197,94,0.1);border-radius:6px;font-size:10px;color:rgba(255,255,255,0.6)">
                    <strong>Shadow Stick Method:</strong> Plant a stick vertically, mark shadow tip, 
                    wait 15 min, mark again. Line between marks = East-West.
                </div>
            </div>
        `;
    }
    
    /**
     * Render Polaris finder widget
     */
    function renderPolarisFinderWidget(lat, lon, date = new Date()) {
        const finder = calculatePolarisFinder(lat, lon, date);
        
        if (finder.error) {
            // Show Southern Cross instead
            const southCross = calculateSouthernCrossFinder(lat, lon, date);
            
            return `
                <div class="polaris-finder-widget" style="padding:12px;background:var(--color-bg-elevated);border-radius:10px">
                    <div style="font-size:14px;font-weight:600;margin-bottom:12px">✦ Southern Cross Finder</div>
                    
                    <div style="padding:12px;background:rgba(139,92,246,0.1);border-radius:8px;margin-bottom:12px">
                        <div style="font-size:11px;color:rgba(255,255,255,0.6)">
                            ${finder.error}
                        </div>
                        <div style="font-size:12px;margin-top:8px;color:#a78bfa">
                            ${finder.alternative}
                        </div>
                    </div>
                    
                    ${!southCross.error ? `
                        <div style="font-size:11px;color:rgba(255,255,255,0.7)">
                            <ol style="margin:8px 0;padding-left:20px">
                                ${southCross.instructions.map(i => `<li style="margin-bottom:4px">${i}</li>`).join('')}
                            </ol>
                        </div>
                    ` : ''}
                </div>
            `;
        }
        
        return `
            <div class="polaris-finder-widget" style="padding:12px;background:var(--color-bg-elevated);border-radius:10px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                    <div style="font-size:14px;font-weight:600">⭐ Polaris Finder</div>
                    <div style="font-size:11px;padding:4px 8px;background:${finder.polaris.visible ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'};border-radius:4px;color:${finder.polaris.visible ? '#22c55e' : '#ef4444'}">
                        ${finder.polaris.visible ? '● Visible' : '○ Below Horizon'}
                    </div>
                </div>
                
                <!-- Big Dipper diagram -->
                <div style="position:relative;height:180px;background:linear-gradient(180deg, #0a1628 0%, #1a365d 100%);border-radius:8px;margin-bottom:12px;overflow:hidden">
                    <!-- Simplified Big Dipper illustration -->
                    <svg viewBox="0 0 200 150" style="width:100%;height:100%">
                        <!-- Stars of Big Dipper (simplified positions) -->
                        <circle cx="40" cy="80" r="3" fill="#fff"/>  <!-- Alkaid -->
                        <circle cx="60" cy="70" r="3" fill="#fff"/>  <!-- Mizar -->
                        <circle cx="80" cy="65" r="3" fill="#fff"/>  <!-- Alioth -->
                        <circle cx="100" cy="70" r="3" fill="#fff"/> <!-- Megrez -->
                        <circle cx="110" cy="90" r="4" fill="#fff"/> <!-- Dubhe (pointer) -->
                        <circle cx="120" cy="110" r="3" fill="#fff"/> <!-- Merak (pointer) -->
                        <circle cx="95" cy="95" r="3" fill="#fff"/>  <!-- Phecda -->
                        
                        <!-- Connect the dipper -->
                        <path d="M40,80 L60,70 L80,65 L100,70 L110,90 L120,110 M100,70 L95,95 L120,110" 
                              stroke="rgba(255,255,255,0.3)" fill="none" stroke-width="1"/>
                        
                        <!-- Pointer line to Polaris -->
                        <line x1="120" y1="110" x2="110" y2="90" stroke="#fbbf24" stroke-width="1" stroke-dasharray="2,2"/>
                        <line x1="110" y1="90" x2="160" y2="30" stroke="#fbbf24" stroke-width="1" stroke-dasharray="4,4"/>
                        
                        <!-- Polaris -->
                        <circle cx="160" cy="30" r="5" fill="#fbbf24"/>
                        <text x="170" y="35" fill="#fbbf24" font-size="10">Polaris</text>
                        
                        <!-- Labels -->
                        <text x="105" y="85" fill="rgba(255,255,255,0.6)" font-size="8">Dubhe</text>
                        <text x="115" y="125" fill="rgba(255,255,255,0.6)" font-size="8">Merak</text>
                        <text x="20" y="95" fill="rgba(255,255,255,0.4)" font-size="8">Big Dipper</text>
                    </svg>
                </div>
                
                <!-- Polaris position -->
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
                    <div style="padding:10px;background:rgba(251,191,36,0.1);border-radius:6px;text-align:center">
                        <div style="font-size:10px;color:rgba(255,255,255,0.5)">Polaris Altitude</div>
                        <div style="font-size:18px;font-weight:700;color:#fbbf24">${finder.formatted.polarisAlt}</div>
                        <div style="font-size:9px;color:rgba(255,255,255,0.4)">≈ Your Latitude</div>
                    </div>
                    <div style="padding:10px;background:rgba(139,92,246,0.1);border-radius:6px;text-align:center">
                        <div style="font-size:10px;color:rgba(255,255,255,0.5)">Look Toward</div>
                        <div style="font-size:18px;font-weight:700;color:#a78bfa">${finder.formatted.polarisAz}</div>
                        <div style="font-size:9px;color:rgba(255,255,255,0.4)">Azimuth (≈ North)</div>
                    </div>
                </div>
                
                <!-- Instructions -->
                <div style="padding:12px;background:rgba(0,0,0,0.2);border-radius:8px;font-size:11px;color:rgba(255,255,255,0.7)">
                    <ol style="margin:0;padding-left:20px">
                        ${finder.instructions.map(i => `<li style="margin-bottom:4px">${i}</li>`).join('')}
                    </ol>
                </div>
            </div>
        `;
    }
    
    /**
     * Render moon navigation widget
     */
    function renderMoonNavigationWidget(lat, lon, date = new Date()) {
        const moonNav = calculateMoonNavigation(lat, lon, date);
        
        if (moonNav.error) {
            return `
                <div class="moon-nav-widget" style="padding:12px;background:var(--color-bg-elevated);border-radius:10px">
                    <div style="font-size:14px;font-weight:600;margin-bottom:12px">🌙 Moon Navigation</div>
                    <div style="padding:20px;text-align:center;background:rgba(100,100,100,0.1);border-radius:8px">
                        <div style="font-size:24px;margin-bottom:8px">🌑</div>
                        <div style="color:rgba(255,255,255,0.6)">${moonNav.error}</div>
                    </div>
                </div>
            `;
        }
        
        // Moon phase visual
        const phaseAngle = moonNav.phase * 360;
        
        return `
            <div class="moon-nav-widget" style="padding:12px;background:var(--color-bg-elevated);border-radius:10px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                    <div style="font-size:14px;font-weight:600">🌙 Moon Navigation</div>
                    <div style="font-size:11px;color:rgba(255,255,255,0.6)">
                        ${moonNav.phaseDescription}
                    </div>
                </div>
                
                <!-- Moon phase visual -->
                <div style="display:flex;justify-content:center;margin-bottom:16px">
                    <div style="position:relative;width:80px;height:80px;background:linear-gradient(90deg, #1a1a2e 50%, #e2e8f0 50%);border-radius:50%;overflow:hidden;transform:rotate(${moonNav.illuminatedSide === 'left' ? 180 : 0}deg)">
                        <div style="position:absolute;top:0;left:${moonNav.illumination / 2}%;width:${100 - moonNav.illumination}%;height:100%;background:#1a1a2e;border-radius:${moonNav.illumination < 50 ? '50%' : '0'}"></div>
                    </div>
                </div>
                
                <!-- Moon position -->
                <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;margin-bottom:12px">
                    <div style="padding:8px;background:rgba(0,0,0,0.2);border-radius:6px;text-align:center">
                        <div style="font-size:10px;color:rgba(255,255,255,0.5)">Altitude</div>
                        <div style="font-size:14px;font-weight:600">${moonNav.formatted.altitude}</div>
                    </div>
                    <div style="padding:8px;background:rgba(0,0,0,0.2);border-radius:6px;text-align:center">
                        <div style="font-size:10px;color:rgba(255,255,255,0.5)">Azimuth</div>
                        <div style="font-size:14px;font-weight:600">${moonNav.formatted.azimuth}</div>
                    </div>
                    <div style="padding:8px;background:rgba(0,0,0,0.2);border-radius:6px;text-align:center">
                        <div style="font-size:10px;color:rgba(255,255,255,0.5)">Illumination</div>
                        <div style="font-size:14px;font-weight:600">${moonNav.formatted.illumination}</div>
                    </div>
                </div>
                
                <!-- Navigation instructions -->
                <div style="padding:12px;background:rgba(0,0,0,0.2);border-radius:8px;font-size:11px;color:rgba(255,255,255,0.7)">
                    <div style="font-weight:600;margin-bottom:8px">Direction Finding:</div>
                    <ul style="margin:0;padding-left:16px">
                        ${moonNav.instructions.map(i => `<li style="margin-bottom:4px">${i}</li>`).join('')}
                    </ul>
                </div>
            </div>
        `;
    }
    
    /**
     * Render complete celestial tools panel
     */
    function renderCelestialToolsWidget(lat, lon, date = new Date()) {
        return `
            <div class="celestial-tools" style="padding:12px;background:var(--color-bg-elevated);border-radius:10px">
                <div style="font-size:16px;font-weight:700;margin-bottom:16px">🧭 Celestial Navigation Tools</div>
                
                <!-- Tool selector -->
                <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:8px;margin-bottom:16px">
                    <button class="btn btn--secondary celestial-tool-btn active" data-tool="starchart"
                            style="padding:12px;display:flex;flex-direction:column;align-items:center;gap:4px">
                        <span style="font-size:18px">🌟</span>
                        <span style="font-size:9px">Star Chart</span>
                    </button>
                    <button class="btn btn--secondary celestial-tool-btn" data-tool="suncompass"
                            style="padding:12px;display:flex;flex-direction:column;align-items:center;gap:4px">
                        <span style="font-size:18px">☀️</span>
                        <span style="font-size:9px">Sun Compass</span>
                    </button>
                    <button class="btn btn--secondary celestial-tool-btn" data-tool="polaris"
                            style="padding:12px;display:flex;flex-direction:column;align-items:center;gap:4px">
                        <span style="font-size:18px">⭐</span>
                        <span style="font-size:9px">Polaris</span>
                    </button>
                    <button class="btn btn--secondary celestial-tool-btn" data-tool="moon"
                            style="padding:12px;display:flex;flex-direction:column;align-items:center;gap:4px">
                        <span style="font-size:18px">🌙</span>
                        <span style="font-size:9px">Moon Nav</span>
                    </button>
                </div>
                
                <!-- Tool content area -->
                <div id="celestial-tool-content">
                    ${renderStarChartWidget(lat, lon, date)}
                </div>
            </div>
        `;
    }
    
    // ==================== PHASE 6: DEAD RECKONING INTEGRATION ====================
    
    // Dead reckoning state
    let drState = {
        lastFix: null,           // Last known position (fix or DR)
        fixTime: null,           // Time of last fix
        fixType: null,           // 'celestial', 'gps', 'dr', 'estimated'
        course: 0,               // Course in degrees true
        speed: 0,                // Speed in knots
        positions: [],           // Position log
        setAndDrift: null        // Current estimate of set and drift
    };
    
    /**
     * Initialize DR from a known position
     * 
     * @param {Object} position - { lat, lon }
     * @param {Date} time - Time of fix
     * @param {string} fixType - Type of fix ('celestial', 'gps', 'dr')
     * @param {Object} options - { course, speed }
     */
    function initializeDR(position, time = new Date(), fixType = 'manual', options = {}) {
        const { course = 0, speed = 0 } = options;
        
        drState.lastFix = { ...position };
        drState.fixTime = time;
        drState.fixType = fixType;
        drState.course = course;
        drState.speed = speed;
        
        // Add to position log
        drState.positions.push({
            lat: position.lat,
            lon: position.lon,
            time: time,
            type: fixType,
            course: course,
            speed: speed
        });
        
        return {
            position: drState.lastFix,
            time: drState.fixTime,
            type: drState.fixType,
            formatted: {
                position: `${formatAngle(position.lat, true)}, ${formatAngle(Math.abs(position.lon))}${position.lon >= 0 ? 'E' : 'W'}`,
                time: time.toISOString().substr(11, 8) + ' UTC'
            }
        };
    }
    
    /**
     * Update course and speed for DR
     * 
     * @param {number} course - New course in degrees true
     * @param {number} speed - New speed in knots
     */
    function updateCourseSpeed(course, speed) {
        drState.course = course;
        drState.speed = speed;
        
        return { course, speed };
    }
    
    /**
     * Calculate DR position at a given time
     * 
     * @param {Date} time - Time to calculate DR position for
     * @returns {Object} DR position
     */
    function calculateDRPosition(time = new Date()) {
        if (!drState.lastFix || !drState.fixTime) {
            return { error: 'No fix established - call initializeDR first' };
        }
        
        // Calculate time difference in hours
        const timeDiffMs = time - drState.fixTime;
        const timeDiffHours = timeDiffMs / (1000 * 60 * 60);
        
        if (timeDiffHours < 0) {
            return { error: 'Requested time is before last fix' };
        }
        
        // Calculate distance traveled
        const distanceNm = drState.speed * timeDiffHours;
        
        // Convert to degrees (1 nm ≈ 1 arcminute ≈ 1/60 degree)
        const distanceDeg = distanceNm / 60;
        
        // Calculate new position
        const courseRad = drState.course * DEG_TO_RAD;
        const latRad = drState.lastFix.lat * DEG_TO_RAD;
        
        // Simple rhumb line calculation for short distances
        const dLat = distanceDeg * Math.cos(courseRad);
        const dLon = distanceDeg * Math.sin(courseRad) / Math.cos(latRad);
        
        const drPosition = {
            lat: drState.lastFix.lat + dLat,
            lon: drState.lastFix.lon + dLon
        };
        
        // Normalize longitude
        while (drPosition.lon > 180) drPosition.lon -= 360;
        while (drPosition.lon < -180) drPosition.lon += 360;
        
        return {
            position: drPosition,
            time: time,
            type: 'dr',
            fromFix: drState.lastFix,
            fixTime: drState.fixTime,
            course: drState.course,
            speed: drState.speed,
            distance: distanceNm,
            elapsed: timeDiffHours,
            formatted: {
                position: `${formatAngle(drPosition.lat, true)}, ${formatAngle(Math.abs(drPosition.lon))}${drPosition.lon >= 0 ? 'E' : 'W'}`,
                distance: distanceNm.toFixed(1) + ' nm',
                elapsed: formatElapsedTime(timeDiffHours),
                course: drState.course.toFixed(0) + '°T',
                speed: drState.speed.toFixed(1) + ' kts'
            }
        };
    }
    
    /**
     * Format elapsed time as hours and minutes
     */
    function formatElapsedTime(hours) {
        const h = Math.floor(hours);
        const m = Math.round((hours - h) * 60);
        return `${h}h ${m}m`;
    }
    
    /**
     * Get current DR position (convenience function)
     */
    function getCurrentDRPosition() {
        return calculateDRPosition(new Date());
    }
    
    /**
     * Update fix from celestial observation
     * Compares celestial fix with DR position to calculate set and drift
     * 
     * @param {Object} celestialFix - Position from celestial fix { lat, lon }
     * @param {Date} time - Time of fix
     * @returns {Object} Fix result with set and drift
     */
    function updateFixFromCelestial(celestialFix, time = new Date()) {
        // Get DR position at same time
        const drPosition = calculateDRPosition(time);
        
        if (drPosition.error) {
            // No previous DR, just initialize
            return initializeDR(celestialFix, time, 'celestial', {
                course: drState.course,
                speed: drState.speed
            });
        }
        
        // Calculate set and drift (difference between celestial and DR)
        const setAndDrift = calculateSetAndDrift(
            drPosition.position,
            celestialFix,
            drPosition.elapsed
        );
        
        drState.setAndDrift = setAndDrift;
        
        // Update fix
        const result = initializeDR(celestialFix, time, 'celestial', {
            course: drState.course,
            speed: drState.speed
        });
        
        return {
            ...result,
            drPosition: drPosition.position,
            setAndDrift: setAndDrift,
            formatted: {
                ...result.formatted,
                set: setAndDrift.set.toFixed(0) + '°T',
                drift: setAndDrift.drift.toFixed(1) + ' kts',
                error: setAndDrift.distance.toFixed(1) + ' nm'
            }
        };
    }
    
    /**
     * Calculate set and drift from DR vs actual position
     * Set = direction of current/wind effect
     * Drift = speed of current/wind effect
     * 
     * @param {Object} drPosition - Dead reckoning position
     * @param {Object} actualPosition - Actual (fixed) position
     * @param {number} elapsedHours - Time between fixes
     * @returns {Object} Set and drift
     */
    function calculateSetAndDrift(drPosition, actualPosition, elapsedHours) {
        // Calculate difference
        const dLat = actualPosition.lat - drPosition.lat;
        const dLon = actualPosition.lon - drPosition.lon;
        
        // Convert to nautical miles
        const latMid = (actualPosition.lat + drPosition.lat) / 2;
        const dLatNm = dLat * 60;  // 1 degree = 60 nm
        const dLonNm = dLon * 60 * Math.cos(latMid * DEG_TO_RAD);
        
        // Calculate distance and bearing
        const distance = Math.sqrt(dLatNm * dLatNm + dLonNm * dLonNm);
        let bearing = Math.atan2(dLonNm, dLatNm) * RAD_TO_DEG;
        if (bearing < 0) bearing += 360;
        
        // Drift = distance / time
        const drift = elapsedHours > 0 ? distance / elapsedHours : 0;
        
        return {
            set: bearing,      // Direction current/wind is pushing you (degrees true)
            drift: drift,      // Speed of current/wind effect (knots)
            distance: distance, // Total error distance (nm)
            dLat: dLat,
            dLon: dLon
        };
    }
    
    /**
     * Calculate estimated position (EP) accounting for set and drift
     * 
     * @param {Date} time - Time to calculate EP for
     * @returns {Object} Estimated position
     */
    function calculateEstimatedPosition(time = new Date()) {
        const dr = calculateDRPosition(time);
        
        if (dr.error) {
            return dr;
        }
        
        // If we have set and drift data, apply it
        if (drState.setAndDrift && drState.setAndDrift.drift > 0.1) {
            const setDrift = drState.setAndDrift;
            const elapsedHours = dr.elapsed;
            
            // Calculate drift offset
            const driftDistance = setDrift.drift * elapsedHours;
            const driftDistanceDeg = driftDistance / 60;
            
            const setRad = setDrift.set * DEG_TO_RAD;
            const latRad = dr.position.lat * DEG_TO_RAD;
            
            const dLat = driftDistanceDeg * Math.cos(setRad);
            const dLon = driftDistanceDeg * Math.sin(setRad) / Math.cos(latRad);
            
            const epPosition = {
                lat: dr.position.lat + dLat,
                lon: dr.position.lon + dLon
            };
            
            return {
                position: epPosition,
                drPosition: dr.position,
                time: time,
                type: 'ep',
                setAndDrift: setDrift,
                formatted: {
                    position: `${formatAngle(epPosition.lat, true)}, ${formatAngle(Math.abs(epPosition.lon))}${epPosition.lon >= 0 ? 'E' : 'W'}`,
                    driftApplied: driftDistance.toFixed(1) + ' nm toward ' + setDrift.set.toFixed(0) + '°'
                }
            };
        }
        
        // No set/drift data, EP = DR
        return {
            ...dr,
            type: 'ep',
            note: 'No set/drift data - EP equals DR'
        };
    }
    
    /**
     * Advance a Line of Position to a new time using DR
     * 
     * @param {Object} lop - Original LOP from sight reduction
     * @param {Date} newTime - Time to advance LOP to
     * @returns {Object} Advanced LOP
     */
    function advanceLOP(lop, newTime) {
        if (!lop || !lop.lop) {
            return { error: 'Invalid LOP data' };
        }
        
        const originalTime = new Date(lop.time);
        const timeDiffMs = newTime - originalTime;
        const timeDiffHours = timeDiffMs / (1000 * 60 * 60);
        
        if (Math.abs(timeDiffHours) < 0.001) {
            return lop;  // Same time, no advancement needed
        }
        
        // Calculate distance to advance
        const distanceNm = drState.speed * Math.abs(timeDiffHours);
        const direction = timeDiffHours > 0 ? drState.course : (drState.course + 180) % 360;
        
        // Convert to degrees
        const distanceDeg = distanceNm / 60;
        const dirRad = direction * DEG_TO_RAD;
        
        // Advance the intercept point
        const ip = lop.lop.interceptPoint;
        const latRad = ip.lat * DEG_TO_RAD;
        
        const dLat = distanceDeg * Math.cos(dirRad);
        const dLon = distanceDeg * Math.sin(dirRad) / Math.cos(latRad);
        
        const advancedIP = {
            lat: ip.lat + dLat,
            lon: ip.lon + dLon
        };
        
        // Advance endpoints
        const advancedEndpoints = lop.lop.endpoints.map(ep => ({
            lat: ep.lat + dLat,
            lon: ep.lon + dLon
        }));
        
        return {
            ...lop,
            originalTime: originalTime,
            advancedTime: newTime,
            advancedBy: {
                hours: timeDiffHours,
                distance: distanceNm,
                course: drState.course,
                speed: drState.speed
            },
            lop: {
                ...lop.lop,
                interceptPoint: advancedIP,
                endpoints: advancedEndpoints
            },
            formatted: {
                ...lop.formatted,
                advancedBy: `${Math.abs(timeDiffHours).toFixed(1)}h at ${drState.course}°/${drState.speed}kts = ${distanceNm.toFixed(1)}nm`
            }
        };
    }
    
    /**
     * Get the DR position log
     */
    function getDRLog() {
        return [...drState.positions];
    }
    
    /**
     * Clear DR state
     */
    function clearDR() {
        drState = {
            lastFix: null,
            fixTime: null,
            fixType: null,
            course: 0,
            speed: 0,
            positions: [],
            setAndDrift: null
        };
    }
    
    /**
     * Get current DR state
     */
    function getDRState() {
        return {
            ...drState,
            currentDR: drState.lastFix ? calculateDRPosition(new Date()) : null
        };
    }
    
    /**
     * Calculate course and distance between two positions
     * 
     * @param {Object} from - { lat, lon }
     * @param {Object} to - { lat, lon }
     * @returns {Object} Course and distance
     */
    function calculateCourseDistance(from, to) {
        const dLat = to.lat - from.lat;
        const dLon = to.lon - from.lon;
        
        // Convert to nautical miles
        const latMid = (from.lat + to.lat) / 2;
        const dLatNm = dLat * 60;
        const dLonNm = dLon * 60 * Math.cos(latMid * DEG_TO_RAD);
        
        // Calculate distance
        const distance = Math.sqrt(dLatNm * dLatNm + dLonNm * dLonNm);
        
        // Calculate course (bearing)
        let course = Math.atan2(dLonNm, dLatNm) * RAD_TO_DEG;
        if (course < 0) course += 360;
        
        return {
            course: course,
            distance: distance,
            formatted: {
                course: course.toFixed(0) + '°T',
                distance: distance.toFixed(1) + ' nm'
            }
        };
    }
    
    /**
     * Calculate speed required to reach a point at a given time
     * 
     * @param {Object} from - Starting position
     * @param {Object} to - Target position
     * @param {number} hours - Time to reach target
     * @returns {Object} Required speed and course
     */
    function calculateRequiredSpeed(from, to, hours) {
        const cd = calculateCourseDistance(from, to);
        const requiredSpeed = cd.distance / hours;
        
        return {
            course: cd.course,
            distance: cd.distance,
            speed: requiredSpeed,
            hours: hours,
            formatted: {
                course: cd.formatted.course,
                distance: cd.formatted.distance,
                speed: requiredSpeed.toFixed(1) + ' kts',
                time: formatElapsedTime(hours)
            }
        };
    }
    
    /**
     * Calculate ETA to a waypoint
     * 
     * @param {Object} waypoint - { lat, lon }
     * @param {Object} fromPosition - Starting position (default: current DR)
     * @returns {Object} ETA information
     */
    function calculateETA(waypoint, fromPosition = null) {
        const from = fromPosition || (drState.lastFix ? calculateDRPosition(new Date()).position : null);
        
        if (!from) {
            return { error: 'No position established' };
        }
        
        const cd = calculateCourseDistance(from, waypoint);
        
        if (drState.speed < 0.1) {
            return { 
                error: 'Speed too low to calculate ETA',
                course: cd.course,
                distance: cd.distance
            };
        }
        
        const hoursToWaypoint = cd.distance / drState.speed;
        const etaTime = new Date(Date.now() + hoursToWaypoint * 60 * 60 * 1000);
        
        return {
            course: cd.course,
            distance: cd.distance,
            hoursToGo: hoursToWaypoint,
            eta: etaTime,
            speed: drState.speed,
            formatted: {
                course: cd.formatted.course,
                distance: cd.formatted.distance,
                timeToGo: formatElapsedTime(hoursToWaypoint),
                eta: etaTime.toISOString().substr(11, 5) + ' UTC'
            }
        };
    }
    
    // ==================== PHASE 6: RENDERING ====================
    
    /**
     * Render DR status widget
     */
    function renderDRStatusWidget() {
        const state = getDRState();
        
        if (!state.lastFix) {
            return `
                <div class="dr-status-widget" style="padding:12px;background:var(--color-bg-elevated);border-radius:10px">
                    <div style="font-size:14px;font-weight:600;margin-bottom:12px">📍 Dead Reckoning</div>
                    <div style="padding:20px;text-align:center;background:rgba(0,0,0,0.2);border-radius:8px">
                        <div style="color:rgba(255,255,255,0.5);font-size:12px">
                            No position established
                        </div>
                        <div style="color:rgba(255,255,255,0.4);font-size:10px;margin-top:8px">
                            Initialize from GPS or celestial fix
                        </div>
                    </div>
                </div>
            `;
        }
        
        const currentDR = state.currentDR;
        const ep = calculateEstimatedPosition(new Date());
        
        return `
            <div class="dr-status-widget" style="padding:12px;background:var(--color-bg-elevated);border-radius:10px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                    <div style="font-size:14px;font-weight:600">📍 Dead Reckoning</div>
                    <div style="font-size:11px;padding:4px 8px;background:rgba(59,130,246,0.2);border-radius:4px;color:#3b82f6">
                        ${state.fixType.toUpperCase()}
                    </div>
                </div>
                
                <!-- Last Fix -->
                <div style="padding:10px;background:rgba(34,197,94,0.1);border-radius:8px;margin-bottom:12px">
                    <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-bottom:4px">Last Fix</div>
                    <div style="font-size:14px;font-weight:600;color:#22c55e">
                        ${formatAngle(state.lastFix.lat, true)}, ${formatAngle(Math.abs(state.lastFix.lon))}${state.lastFix.lon >= 0 ? 'E' : 'W'}
                    </div>
                    <div style="font-size:10px;color:rgba(255,255,255,0.4)">
                        ${state.fixTime.toISOString().substr(11, 8)} UTC
                    </div>
                </div>
                
                <!-- Current DR -->
                ${currentDR && !currentDR.error ? `
                    <div style="padding:10px;background:rgba(59,130,246,0.1);border-radius:8px;margin-bottom:12px">
                        <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-bottom:4px">Current DR Position</div>
                        <div style="font-size:14px;font-weight:600;color:#3b82f6">
                            ${currentDR.formatted.position}
                        </div>
                        <div style="font-size:10px;color:rgba(255,255,255,0.4)">
                            ${currentDR.formatted.elapsed} elapsed | ${currentDR.formatted.distance} traveled
                        </div>
                    </div>
                ` : ''}
                
                <!-- Course and Speed -->
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
                    <div style="padding:10px;background:rgba(0,0,0,0.2);border-radius:6px;text-align:center">
                        <div style="font-size:10px;color:rgba(255,255,255,0.5)">Course</div>
                        <div style="font-size:20px;font-weight:700">${state.course.toFixed(0)}°T</div>
                    </div>
                    <div style="padding:10px;background:rgba(0,0,0,0.2);border-radius:6px;text-align:center">
                        <div style="font-size:10px;color:rgba(255,255,255,0.5)">Speed</div>
                        <div style="font-size:20px;font-weight:700">${state.speed.toFixed(1)} kts</div>
                    </div>
                </div>
                
                <!-- Set and Drift if available -->
                ${state.setAndDrift && state.setAndDrift.drift > 0.1 ? `
                    <div style="padding:10px;background:rgba(245,158,11,0.1);border-radius:8px;margin-bottom:12px">
                        <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-bottom:4px">Set & Drift</div>
                        <div style="display:flex;justify-content:space-around">
                            <div style="text-align:center">
                                <div style="font-size:16px;font-weight:600;color:#f59e0b">${state.setAndDrift.set.toFixed(0)}°</div>
                                <div style="font-size:9px;color:rgba(255,255,255,0.4)">Set</div>
                            </div>
                            <div style="text-align:center">
                                <div style="font-size:16px;font-weight:600;color:#f59e0b">${state.setAndDrift.drift.toFixed(1)} kts</div>
                                <div style="font-size:9px;color:rgba(255,255,255,0.4)">Drift</div>
                            </div>
                        </div>
                    </div>
                ` : ''}
                
                <!-- Controls -->
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                    <button class="btn btn--secondary dr-update-btn" style="padding:8px;font-size:11px">
                        ⚙️ Update C/S
                    </button>
                    <button class="btn btn--secondary dr-fix-btn" style="padding:8px;font-size:11px">
                        📍 New Fix
                    </button>
                </div>
            </div>
        `;
    }
    
    /**
     * Render DR input widget for course/speed
     */
    function renderDRInputWidget(currentCourse = 0, currentSpeed = 0) {
        return `
            <div class="dr-input-widget" style="padding:12px;background:var(--color-bg-elevated);border-radius:10px">
                <div style="font-size:14px;font-weight:600;margin-bottom:12px">⚙️ Course & Speed</div>
                
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
                    <div>
                        <label style="font-size:10px;color:rgba(255,255,255,0.5);display:block;margin-bottom:4px">
                            Course (°True)
                        </label>
                        <input type="number" id="dr-course" value="${currentCourse}" min="0" max="359" step="1"
                               style="width:100%;padding:10px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white;font-size:16px;text-align:center">
                    </div>
                    <div>
                        <label style="font-size:10px;color:rgba(255,255,255,0.5);display:block;margin-bottom:4px">
                            Speed (knots)
                        </label>
                        <input type="number" id="dr-speed" value="${currentSpeed}" min="0" max="50" step="0.1"
                               style="width:100%;padding:10px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white;font-size:16px;text-align:center">
                    </div>
                </div>
                
                <!-- Quick course buttons -->
                <div style="margin-bottom:12px">
                    <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-bottom:4px">Quick Course</div>
                    <div style="display:grid;grid-template-columns:repeat(8, 1fr);gap:4px">
                        ${[0, 45, 90, 135, 180, 225, 270, 315].map(c => `
                            <button class="btn btn--secondary dr-quick-course" data-course="${c}" 
                                    style="padding:6px;font-size:10px">${c}°</button>
                        `).join('')}
                    </div>
                </div>
                
                <button class="btn btn--primary btn--full dr-apply-cs" style="padding:10px">
                    ✓ Apply Course & Speed
                </button>
            </div>
        `;
    }
    
    /**
     * Render DR plot on canvas
     * 
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Function} latLonToPixel - Coordinate conversion function
     * @param {Object} options - Rendering options
     */
    function renderDRPlot(ctx, latLonToPixel, options = {}) {
        const {
            fixColor = '#22c55e',
            drColor = '#3b82f6',
            epColor = '#f59e0b',
            trackColor = 'rgba(59, 130, 246, 0.5)',
            showLabels = true
        } = options;
        
        const state = getDRState();
        
        if (!state.lastFix) return;
        
        // Draw track from last fix to current DR
        const currentDR = state.currentDR;
        if (currentDR && !currentDR.error) {
            const fixPx = latLonToPixel(state.lastFix.lat, state.lastFix.lon);
            const drPx = latLonToPixel(currentDR.position.lat, currentDR.position.lon);
            
            // Track line
            ctx.strokeStyle = trackColor;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(fixPx.x, fixPx.y);
            ctx.lineTo(drPx.x, drPx.y);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // Fix marker (circle with dot)
            ctx.fillStyle = fixColor;
            ctx.beginPath();
            ctx.arc(fixPx.x, fixPx.y, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(fixPx.x, fixPx.y, 3, 0, Math.PI * 2);
            ctx.fill();
            
            // DR marker (circle with X)
            ctx.fillStyle = drColor;
            ctx.beginPath();
            ctx.arc(drPx.x, drPx.y, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(drPx.x - 4, drPx.y - 4);
            ctx.lineTo(drPx.x + 4, drPx.y + 4);
            ctx.moveTo(drPx.x + 4, drPx.y - 4);
            ctx.lineTo(drPx.x - 4, drPx.y + 4);
            ctx.stroke();
            
            // Labels
            if (showLabels) {
                ctx.fillStyle = '#fff';
                ctx.font = '10px sans-serif';
                ctx.fillText('FIX', fixPx.x + 12, fixPx.y + 4);
                ctx.fillText('DR', drPx.x + 12, drPx.y + 4);
            }
            
            // EP marker if different from DR
            const ep = calculateEstimatedPosition(new Date());
            if (ep.type === 'ep' && ep.position) {
                const epPx = latLonToPixel(ep.position.lat, ep.position.lon);
                const dist = Math.sqrt(Math.pow(epPx.x - drPx.x, 2) + Math.pow(epPx.y - drPx.y, 2));
                
                if (dist > 5) {  // Only show if significantly different
                    ctx.fillStyle = epColor;
                    ctx.beginPath();
                    ctx.arc(epPx.x, epPx.y, 6, 0, Math.PI * 2);
                    ctx.fill();
                    
                    if (showLabels) {
                        ctx.fillStyle = '#fff';
                        ctx.fillText('EP', epPx.x + 10, epPx.y + 4);
                    }
                }
            }
        }
        
        // Draw position log
        if (state.positions.length > 1) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            
            for (let i = 0; i < state.positions.length; i++) {
                const pos = state.positions[i];
                const px = latLonToPixel(pos.lat, pos.lon);
                
                if (i === 0) {
                    ctx.moveTo(px.x, px.y);
                } else {
                    ctx.lineTo(px.x, px.y);
                }
            }
            ctx.stroke();
        }
    }
    
    /**
     * Render navigation planning widget
     */
    function renderNavigationPlanWidget(waypoint = null) {
        const state = getDRState();
        const currentPos = state.lastFix ? calculateDRPosition(new Date()).position : null;
        
        return `
            <div class="nav-plan-widget" style="padding:12px;background:var(--color-bg-elevated);border-radius:10px">
                <div style="font-size:14px;font-weight:600;margin-bottom:12px">🧭 Navigation Planning</div>
                
                <div style="margin-bottom:12px">
                    <label style="font-size:10px;color:rgba(255,255,255,0.5);display:block;margin-bottom:4px">
                        Waypoint
                    </label>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                        <input type="number" id="wp-lat" placeholder="Latitude" step="0.0001"
                               value="${waypoint ? waypoint.lat : ''}"
                               style="width:100%;padding:8px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white">
                        <input type="number" id="wp-lon" placeholder="Longitude" step="0.0001"
                               value="${waypoint ? waypoint.lon : ''}"
                               style="width:100%;padding:8px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white">
                    </div>
                </div>
                
                <button class="btn btn--primary btn--full calculate-eta-btn" style="margin-bottom:12px">
                    📊 Calculate Route
                </button>
                
                <div id="eta-result" style="display:none">
                </div>
                
                ${currentPos ? `
                    <div style="margin-top:12px;padding:10px;background:rgba(0,0,0,0.2);border-radius:6px;font-size:11px">
                        <div style="color:rgba(255,255,255,0.5);margin-bottom:4px">Current Position (DR)</div>
                        <div>${formatAngle(currentPos.lat, true)}, ${formatAngle(Math.abs(currentPos.lon))}${currentPos.lon >= 0 ? 'E' : 'W'}</div>
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    /**
     * Render ETA result
     */
    function renderETAResult(eta) {
        if (eta.error) {
            return `
                <div style="padding:12px;background:rgba(239,68,68,0.1);border-radius:8px;color:#ef4444">
                    ${eta.error}
                </div>
            `;
        }
        
        return `
            <div style="padding:12px;background:rgba(34,197,94,0.1);border-radius:8px">
                <div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:8px;margin-bottom:8px">
                    <div style="text-align:center">
                        <div style="font-size:10px;color:rgba(255,255,255,0.5)">Course</div>
                        <div style="font-size:18px;font-weight:700;color:#22c55e">${eta.formatted.course}</div>
                    </div>
                    <div style="text-align:center">
                        <div style="font-size:10px;color:rgba(255,255,255,0.5)">Distance</div>
                        <div style="font-size:18px;font-weight:700;color:#22c55e">${eta.formatted.distance}</div>
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:8px">
                    <div style="text-align:center">
                        <div style="font-size:10px;color:rgba(255,255,255,0.5)">Time to Go</div>
                        <div style="font-size:18px;font-weight:700">${eta.formatted.timeToGo}</div>
                    </div>
                    <div style="text-align:center">
                        <div style="font-size:10px;color:rgba(255,255,255,0.5)">ETA</div>
                        <div style="font-size:18px;font-weight:700">${eta.formatted.eta}</div>
                    </div>
                </div>
            </div>
        `;
    }
    
    // ==================== PHASE 7: TRAINING MODE ====================
    
    /**
     * Shadow Stick Method for finding East-West line
     * 
     * @param {Date} startTime - When first shadow was marked
     * @param {Date} endTime - When second shadow was marked
     * @param {number} lat - Observer latitude (for accuracy estimate)
     * @returns {Object} Shadow stick results
     */
    function calculateShadowStick(startTime, endTime, lat = 45) {
        const elapsedMs = endTime - startTime;
        const elapsedMinutes = elapsedMs / (1000 * 60);
        
        // Sun moves 15° per hour = 0.25° per minute
        const sunMovement = elapsedMinutes * 0.25;
        
        // Accuracy depends on time elapsed and latitude
        // Longer time = more accurate, but sun altitude changes
        // Best accuracy: 15-30 minutes
        let accuracy;
        if (elapsedMinutes < 10) {
            accuracy = 'poor';
        } else if (elapsedMinutes < 15) {
            accuracy = 'fair';
        } else if (elapsedMinutes <= 30) {
            accuracy = 'good';
        } else if (elapsedMinutes <= 60) {
            accuracy = 'fair';
        } else {
            accuracy = 'poor';
        }
        
        // At high latitudes near solstices, accuracy decreases
        const latFactor = Math.abs(lat) > 60 ? 'reduced at high latitude' : 'normal';
        
        return {
            elapsedMinutes: elapsedMinutes,
            sunMovement: sunMovement,
            accuracy: accuracy,
            latFactor: latFactor,
            instructions: [
                '1. Place a straight stick vertically in the ground',
                '2. Mark the tip of the shadow with a stone or stick',
                '3. Wait 15-30 minutes',
                '4. Mark the new shadow tip position',
                '5. Draw a line connecting the two marks',
                '6. This line runs roughly EAST-WEST',
                '7. First mark is WEST, second mark is EAST',
                '8. A perpendicular line points NORTH-SOUTH'
            ],
            formatted: {
                elapsed: elapsedMinutes.toFixed(0) + ' minutes',
                sunMovement: sunMovement.toFixed(1) + '°',
                accuracy: accuracy.charAt(0).toUpperCase() + accuracy.slice(1)
            }
        };
    }
    
    /**
     * Calculate solar noon time for a given location
     * Solar noon = when sun is highest (on meridian)
     * 
     * @param {number} longitude - Observer longitude
     * @param {Date} date - Date to calculate for
     * @returns {Object} Solar noon information
     */
    function calculateSolarNoon(longitude, date) {
        // Get equation of time
        const noonUTC = new Date(Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate(),
            12, 0, 0
        ));
        
        const sun = getSunPosition(noonUTC);
        const EoT = sun.EoT;  // Equation of time in minutes
        
        // Solar noon in UTC = 12:00 - EoT - (longitude/15) hours
        // longitude: east positive, west negative
        const longitudeHours = longitude / 15;
        const solarNoonUTC = 12 - (EoT / 60) - longitudeHours;
        
        // Convert to hours and minutes
        let hours = Math.floor(solarNoonUTC);
        let minutes = (solarNoonUTC - hours) * 60;
        
        // Handle day rollover
        if (hours < 0) {
            hours += 24;
        } else if (hours >= 24) {
            hours -= 24;
        }
        
        // Create Date object
        const solarNoonDate = new Date(Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate(),
            hours,
            Math.floor(minutes),
            (minutes % 1) * 60
        ));
        
        return {
            timeUTC: solarNoonDate,
            hoursUTC: solarNoonUTC,
            EoT: EoT,
            sunDec: sun.dec,
            sunAltitudeAtNoon: 90 - Math.abs(sun.dec - (longitude > -180 ? 0 : 0)),  // Simplified
            instructions: [
                'At solar noon, the sun is at its highest point',
                'Shadows point true North (N. hemisphere) or South (S. hemisphere)',
                'This is the most accurate time for shadow direction finding',
                `Today's solar noon at ${longitude.toFixed(1)}° longitude: ${String(hours).padStart(2, '0')}:${String(Math.floor(minutes)).padStart(2, '0')} UTC`
            ],
            formatted: {
                time: `${String(hours).padStart(2, '0')}:${String(Math.floor(minutes)).padStart(2, '0')} UTC`,
                EoT: (EoT >= 0 ? '+' : '') + EoT.toFixed(1) + ' min',
                sunDec: formatAngle(sun.dec, true)
            }
        };
    }
    
    /**
     * Calculate longitude from observed solar noon time
     * 
     * @param {Date} observedNoon - Observed time of solar noon (UTC)
     * @param {Date} date - Date of observation
     * @returns {Object} Calculated longitude
     */
    function calculateLongitudeFromSolarNoon(observedNoon, date) {
        // Get equation of time
        const noonUTC = new Date(Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate(),
            12, 0, 0
        ));
        const sun = getSunPosition(noonUTC);
        const EoT = sun.EoT;
        
        // Observed noon in decimal hours UTC
        const observedHours = observedNoon.getUTCHours() + 
                             observedNoon.getUTCMinutes() / 60 + 
                             observedNoon.getUTCSeconds() / 3600;
        
        // Longitude = (12:00 - EoT - observed_noon) × 15°
        const longitude = (12 - (EoT / 60) - observedHours) * 15;
        
        // Normalize to -180 to +180
        let lonNormalized = longitude;
        while (lonNormalized > 180) lonNormalized -= 360;
        while (lonNormalized < -180) lonNormalized += 360;
        
        return {
            longitude: lonNormalized,
            EoT: EoT,
            observedNoon: observedNoon,
            formatted: {
                longitude: formatAngle(Math.abs(lonNormalized)) + (lonNormalized >= 0 ? ' E' : ' W'),
                EoT: (EoT >= 0 ? '+' : '') + EoT.toFixed(1) + ' min'
            }
        };
    }
    
    /**
     * Watch Method for finding direction
     * Point hour hand at sun, bisect angle to 12 for south
     * 
     * @param {Date} time - Current time
     * @param {number} lat - Observer latitude
     * @returns {Object} Watch method instructions
     */
    function calculateWatchMethod(time, lat) {
        const hours = time.getHours() + time.getMinutes() / 60;
        
        // Convert to 12-hour format for watch
        const hour12 = hours % 12;
        
        // Angle of hour hand from 12 o'clock (degrees)
        const hourHandAngle = hour12 * 30;  // 30° per hour
        
        // Bisecting angle
        const bisectAngle = hourHandAngle / 2;
        
        // In northern hemisphere, bisect points south
        // In southern hemisphere, point 12 at sun, bisect points north
        const isNorthern = lat >= 0;
        
        return {
            hourHandAngle: hourHandAngle,
            bisectAngle: bisectAngle,
            hemisphere: isNorthern ? 'northern' : 'southern',
            instructions: isNorthern ? [
                '1. Hold watch flat, face up',
                '2. Point the HOUR HAND at the sun',
                `3. The hour hand is currently at ${hour12.toFixed(1)} o'clock position`,
                '4. Find the angle between the hour hand and 12 o\'clock',
                '5. Bisect (divide in half) this angle',
                '6. The bisecting line points SOUTH',
                '7. Opposite direction is NORTH',
                '',
                'Note: Use the CENTER of the sun, not the edge',
                'Note: Adjust for daylight saving time if needed'
            ] : [
                '1. Hold watch flat, face up',
                '2. Point 12 O\'CLOCK at the sun',
                '3. Find the angle between 12 and the hour hand',
                `4. Hour hand is at ${hour12.toFixed(1)} o'clock position`,
                '5. Bisect (divide in half) this angle',
                '6. The bisecting line points NORTH',
                '7. Opposite direction is SOUTH'
            ],
            formatted: {
                hourHand: hour12.toFixed(1) + ' o\'clock',
                bisect: bisectAngle.toFixed(0) + '° from 12',
                direction: isNorthern ? 'South' : 'North'
            }
        };
    }
    
    /**
     * Star Time Navigation - using star positions to tell time
     * 
     * @param {number} lat - Observer latitude
     * @param {number} lon - Observer longitude
     * @param {Date} date - Date for calculation
     * @returns {Object} Star time information
     */
    function calculateStarTime(lat, lon, date) {
        // Get sidereal time
        const gmst = getGMST(date);
        const lst = gmst + lon / 15;  // Local sidereal time in hours
        
        // Normalize to 0-24
        let lstNorm = lst % 24;
        if (lstNorm < 0) lstNorm += 24;
        
        // Convert to hours and minutes
        const lstHours = Math.floor(lstNorm);
        const lstMinutes = (lstNorm - lstHours) * 60;
        
        // Find which constellation is on the meridian
        // RA of meridian = LST
        const raOnMeridian = lstNorm * 15;  // Convert hours to degrees
        
        // Find the brightest star near the meridian
        const stars = getAllStarPositions(date);
        let meridianStar = null;
        let minRaDiff = 180;
        
        for (const star of stars) {
            if (star.magnitude > 2.0) continue;  // Only bright stars
            
            let raDiff = Math.abs(star.RA - raOnMeridian);
            if (raDiff > 180) raDiff = 360 - raDiff;
            
            if (raDiff < minRaDiff) {
                minRaDiff = raDiff;
                meridianStar = star;
            }
        }
        
        return {
            localSiderealTime: lstNorm,
            gmst: gmst,
            raOnMeridian: raOnMeridian,
            meridianStar: meridianStar,
            instructions: [
                'Local Sidereal Time (LST) tells which stars are overhead',
                'LST = 0h when Aries (vernal equinox) is on your meridian',
                'Stars with RA equal to LST are on your meridian',
                '',
                `Current LST: ${lstHours}h ${lstMinutes.toFixed(0)}m`,
                meridianStar ? `Bright star near meridian: ${meridianStar.name}` : ''
            ],
            formatted: {
                lst: `${lstHours}h ${lstMinutes.toFixed(0)}m`,
                meridianStar: meridianStar ? meridianStar.name : 'None bright'
            }
        };
    }
    
    /**
     * Estimate latitude from hand/fist measurements
     * 
     * @param {number} fists - Number of fist widths from horizon to Polaris
     * @param {number} fingers - Additional finger widths
     * @returns {Object} Estimated latitude
     */
    function calculateLatitudeFromHand(fists, fingers = 0) {
        // Average fist width at arm's length ≈ 10°
        // Average finger width ≈ 2°
        const FIST_DEGREES = 10;
        const FINGER_DEGREES = 2;
        
        const estimatedAltitude = (fists * FIST_DEGREES) + (fingers * FINGER_DEGREES);
        
        // Polaris altitude ≈ latitude (±1°)
        const estimatedLatitude = estimatedAltitude;
        
        return {
            fists: fists,
            fingers: fingers,
            estimatedAltitude: estimatedAltitude,
            estimatedLatitude: estimatedLatitude,
            accuracy: '±5-10°',
            instructions: [
                '1. Find Polaris (North Star) using the Big Dipper',
                '2. Extend your arm fully',
                '3. Make a fist - one fist width ≈ 10°',
                '4. Count fists from horizon to Polaris',
                '5. Use fingers for finer measurement (1 finger ≈ 2°)',
                '6. Your latitude ≈ Polaris altitude',
                '',
                'Calibration tip: The Big Dipper\'s pointer stars',
                'are about 5° apart (half a fist)'
            ],
            formatted: {
                measurement: `${fists} fist${fists !== 1 ? 's' : ''} + ${fingers} finger${fingers !== 1 ? 's' : ''}`,
                altitude: estimatedAltitude.toFixed(0) + '°',
                latitude: estimatedLatitude.toFixed(0) + '°N (estimated)'
            }
        };
    }
    
    /**
     * Kamal (latitude measuring stick) calculations
     * Traditional Arab navigation tool
     * 
     * @param {number} stringLength - Length of string in any unit
     * @param {number} plateWidth - Width of plate in same unit
     * @param {number} polaris Altitude - Measured altitude (notches or marks)
     * @returns {Object} Kamal instructions
     */
    function calculateKamal(stringLength, plateWidth, targetLatitude) {
        // The kamal works by: tan(angle) = plateWidth / stringLength
        // For small angles: angle ≈ plateWidth / stringLength (in radians)
        
        const angleRadians = Math.atan(plateWidth / stringLength);
        const angleDegrees = angleRadians * RAD_TO_DEG;
        
        // To reach a target latitude, how many plate widths needed?
        const platesNeeded = targetLatitude / angleDegrees;
        
        return {
            plateAngle: angleDegrees,
            platesForTarget: platesNeeded,
            targetLatitude: targetLatitude,
            instructions: [
                'THE KAMAL - Traditional Latitude Tool',
                '',
                '1. Cut a rectangular plate (wood or cardboard)',
                '2. Attach a string through the center',
                '3. Mark knots on the string for your home port',
                '4. To use: hold string in teeth',
                '5. Align plate bottom with horizon',
                '6. Plate top should touch Polaris',
                '7. The string length that works = your latitude',
                '',
                `With your dimensions: 1 plate width = ${angleDegrees.toFixed(1)}°`,
                `For ${targetLatitude}° latitude: ~${platesNeeded.toFixed(1)} plate widths`
            ],
            formatted: {
                plateAngle: angleDegrees.toFixed(1) + '°',
                platesNeeded: platesNeeded.toFixed(1)
            }
        };
    }
    
    /**
     * Equal altitude method for finding local noon
     * 
     * @param {Date} morningTime - Time of morning altitude measurement
     * @param {number} morningAlt - Morning sun altitude
     * @param {Date} afternoonTime - Time of afternoon measurement at same altitude
     * @returns {Object} Local noon calculation
     */
    function calculateEqualAltitudeNoon(morningTime, morningAlt, afternoonTime) {
        // Local noon is exactly halfway between equal altitude times
        const morningMs = morningTime.getTime();
        const afternoonMs = afternoonTime.getTime();
        
        const noonMs = (morningMs + afternoonMs) / 2;
        const localNoon = new Date(noonMs);
        
        // Time span
        const spanHours = (afternoonMs - morningMs) / (1000 * 60 * 60);
        
        return {
            localNoon: localNoon,
            morningTime: morningTime,
            afternoonTime: afternoonTime,
            altitude: morningAlt,
            spanHours: spanHours,
            instructions: [
                'EQUAL ALTITUDE METHOD',
                '',
                '1. In the morning, measure sun altitude',
                '2. Note the exact time',
                '3. In the afternoon, wait for sun to reach SAME altitude',
                '4. Note the exact time',
                '5. Local noon = exactly halfway between these times',
                '',
                'This method does not require knowing the sun\'s declination',
                'Works anywhere in the world with clear skies'
            ],
            formatted: {
                localNoon: localNoon.toISOString().substr(11, 8) + ' UTC',
                span: spanHours.toFixed(1) + ' hours between measurements',
                altitude: morningAlt.toFixed(1) + '°'
            }
        };
    }
    
    /**
     * Estimate distance to horizon
     * 
     * @param {number} heightFt - Height of eye in feet
     * @returns {Object} Horizon distance
     */
    function calculateHorizonDistance(heightFt) {
        // Distance to horizon in nautical miles ≈ 1.17 × √(height in feet)
        const distanceNm = 1.17 * Math.sqrt(heightFt);
        
        // Geographic range (seeing an object of height h2 from height h1)
        // Range = 1.17 × (√h1 + √h2)
        
        return {
            heightFt: heightFt,
            distanceNm: distanceNm,
            distanceKm: distanceNm * 1.852,
            distanceMi: distanceNm * 1.151,
            formula: '1.17 × √(height in feet) = nautical miles',
            examples: [
                { height: 6, distance: (1.17 * Math.sqrt(6)).toFixed(1) + ' nm (standing on deck)' },
                { height: 20, distance: (1.17 * Math.sqrt(20)).toFixed(1) + ' nm (small boat mast)' },
                { height: 50, distance: (1.17 * Math.sqrt(50)).toFixed(1) + ' nm (larger vessel)' },
                { height: 100, distance: (1.17 * Math.sqrt(100)).toFixed(1) + ' nm (high vantage)' }
            ],
            formatted: {
                distance: distanceNm.toFixed(1) + ' nm',
                distanceKm: (distanceNm * 1.852).toFixed(1) + ' km'
            }
        };
    }
    
    // ==================== PHASE 7: TRAINING UI ====================
    
    /**
     * Render shadow stick training widget
     */
    function renderShadowStickWidget(lat = 45) {
        const now = new Date();
        const solarNoon = calculateSolarNoon(0, now);  // Will need actual longitude
        
        return `
            <div class="shadow-stick-widget" style="padding:12px;background:var(--color-bg-elevated);border-radius:10px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                    <div style="font-size:14px;font-weight:600">📏 Shadow Stick Method</div>
                    <div style="font-size:11px;padding:4px 8px;background:rgba(34,197,94,0.2);border-radius:4px;color:#22c55e">
                        Training
                    </div>
                </div>
                
                <!-- Diagram -->
                <div style="background:linear-gradient(180deg, #87CEEB 0%, #87CEEB 60%, #8B4513 60%, #8B4513 100%);padding:20px;border-radius:8px;margin-bottom:12px;position:relative;height:120px">
                    <!-- Stick -->
                    <div style="position:absolute;bottom:40%;left:50%;width:4px;height:50px;background:#654321;transform:translateX(-50%)"></div>
                    <!-- Shadow 1 -->
                    <div style="position:absolute;bottom:40%;left:50%;width:40px;height:3px;background:rgba(0,0,0,0.3);transform:translateX(-100%) rotate(-10deg);transform-origin:right center"></div>
                    <!-- Shadow 2 -->
                    <div style="position:absolute;bottom:40%;left:50%;width:50px;height:3px;background:rgba(0,0,0,0.5);transform:translateX(0) rotate(10deg);transform-origin:left center"></div>
                    <!-- Markers -->
                    <div style="position:absolute;bottom:35%;left:30%;width:8px;height:8px;background:#ff6b6b;border-radius:50%"></div>
                    <div style="position:absolute;bottom:32%;left:65%;width:8px;height:8px;background:#ff6b6b;border-radius:50%"></div>
                    <!-- E-W Line -->
                    <div style="position:absolute;bottom:28%;left:28%;width:45%;height:2px;background:#fbbf24"></div>
                    <!-- Labels -->
                    <div style="position:absolute;bottom:20%;left:25%;color:#fbbf24;font-size:10px;font-weight:bold">W</div>
                    <div style="position:absolute;bottom:20%;left:70%;color:#fbbf24;font-size:10px;font-weight:bold">E</div>
                </div>
                
                <div style="font-size:11px;color:rgba(255,255,255,0.7);margin-bottom:12px">
                    <ol style="margin:0;padding-left:20px">
                        <li>Place a vertical stick in the ground</li>
                        <li>Mark the shadow tip (West mark)</li>
                        <li>Wait 15-30 minutes</li>
                        <li>Mark the new shadow tip (East mark)</li>
                        <li>Connect marks = East-West line</li>
                    </ol>
                </div>
                
                <!-- Timer -->
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
                    <button class="btn btn--primary shadow-mark-btn" data-mark="1" style="padding:10px">
                        📍 Mark West
                    </button>
                    <button class="btn btn--secondary shadow-mark-btn" data-mark="2" style="padding:10px" disabled>
                        📍 Mark East
                    </button>
                </div>
                
                <div id="shadow-timer" style="display:none;padding:12px;background:rgba(0,0,0,0.2);border-radius:8px;text-align:center">
                    <div style="font-size:10px;color:rgba(255,255,255,0.5)">Time Elapsed</div>
                    <div style="font-size:24px;font-weight:700" id="shadow-elapsed">00:00</div>
                    <div style="font-size:10px;color:rgba(255,255,255,0.4)">Recommended: 15-30 minutes</div>
                </div>
                
                <div style="margin-top:12px;padding:8px;background:rgba(245,158,11,0.1);border-radius:6px;font-size:10px;color:rgba(255,255,255,0.6)">
                    <strong>Best Results:</strong> Works best within 2 hours of solar noon. 
                    Accuracy: ±5-10° depending on time of day and latitude.
                </div>
            </div>
        `;
    }
    
    /**
     * Render solar noon widget
     */
    function renderSolarNoonWidget(longitude = -122) {
        const today = new Date();
        const solarNoon = calculateSolarNoon(longitude, today);
        
        return `
            <div class="solar-noon-widget" style="padding:12px;background:var(--color-bg-elevated);border-radius:10px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                    <div style="font-size:14px;font-weight:600">☀️ Solar Noon</div>
                    <div style="font-size:11px;padding:4px 8px;background:rgba(251,191,36,0.2);border-radius:4px;color:#fbbf24">
                        Longitude Tool
                    </div>
                </div>
                
                <div style="padding:16px;background:rgba(251,191,36,0.1);border-radius:8px;margin-bottom:12px;text-align:center">
                    <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-bottom:4px">
                        Solar Noon at ${longitude.toFixed(1)}° Longitude
                    </div>
                    <div style="font-size:32px;font-weight:700;color:#fbbf24">
                        ${solarNoon.formatted.time}
                    </div>
                    <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:4px">
                        Equation of Time: ${solarNoon.formatted.EoT}
                    </div>
                </div>
                
                <div style="font-size:11px;color:rgba(255,255,255,0.7);margin-bottom:12px">
                    <strong>At solar noon:</strong>
                    <ul style="margin:8px 0;padding-left:20px">
                        <li>Sun is at its highest point</li>
                        <li>Shadows point true North/South</li>
                        <li>Shortest shadow of the day</li>
                    </ul>
                </div>
                
                <!-- Longitude input -->
                <div style="margin-bottom:12px">
                    <label style="font-size:10px;color:rgba(255,255,255,0.5)">Estimate Longitude</label>
                    <input type="number" id="solar-noon-lon" value="${longitude}" step="1" min="-180" max="180"
                           style="width:100%;padding:8px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white">
                </div>
                
                <button class="btn btn--primary btn--full update-solar-noon">
                    🔄 Update Solar Noon Time
                </button>
                
                <div style="margin-top:12px;padding:10px;background:rgba(59,130,246,0.1);border-radius:6px;font-size:10px">
                    <strong>Finding Longitude:</strong><br>
                    If you observe solar noon at a different time than predicted, 
                    the difference tells you your actual longitude.
                    <br><br>
                    4 minutes difference = 1° longitude
                </div>
            </div>
        `;
    }
    
    /**
     * Render watch method widget
     */
    function renderWatchMethodWidget(lat = 45) {
        const now = new Date();
        const watchMethod = calculateWatchMethod(now, lat);
        
        return `
            <div class="watch-method-widget" style="padding:12px;background:var(--color-bg-elevated);border-radius:10px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                    <div style="font-size:14px;font-weight:600">⌚ Watch Method</div>
                    <div style="font-size:11px;padding:4px 8px;background:rgba(139,92,246,0.2);border-radius:4px;color:#a78bfa">
                        ${watchMethod.hemisphere === 'northern' ? 'N. Hemisphere' : 'S. Hemisphere'}
                    </div>
                </div>
                
                <!-- Watch diagram -->
                <div style="display:flex;justify-content:center;margin-bottom:16px">
                    <div style="position:relative;width:160px;height:160px;background:#1a1a2e;border-radius:50%;border:4px solid #4a4a6a">
                        <!-- Hour markers -->
                        ${[12, 3, 6, 9].map(h => {
                            const angle = (h % 12) * 30 - 90;
                            const x = 50 + 40 * Math.cos(angle * Math.PI / 180);
                            const y = 50 + 40 * Math.sin(angle * Math.PI / 180);
                            return `<div style="position:absolute;top:${y}%;left:${x}%;transform:translate(-50%,-50%);color:white;font-size:12px;font-weight:bold">${h}</div>`;
                        }).join('')}
                        
                        <!-- Hour hand -->
                        <div style="position:absolute;top:50%;left:50%;width:3px;height:45px;background:#fbbf24;transform-origin:bottom center;transform:translate(-50%, -100%) rotate(${watchMethod.hourHandAngle}deg);border-radius:2px"></div>
                        
                        <!-- Bisect line -->
                        <div style="position:absolute;top:50%;left:50%;width:2px;height:60px;background:#22c55e;transform-origin:bottom center;transform:translate(-50%, -100%) rotate(${watchMethod.bisectAngle}deg);border-radius:2px;opacity:0.7"></div>
                        
                        <!-- Center dot -->
                        <div style="position:absolute;top:50%;left:50%;width:8px;height:8px;background:white;border-radius:50%;transform:translate(-50%,-50%)"></div>
                        
                        <!-- Sun indicator -->
                        <div style="position:absolute;top:5px;left:50%;transform:translateX(-50%);font-size:20px">☀️</div>
                    </div>
                </div>
                
                <!-- Legend -->
                <div style="display:flex;justify-content:center;gap:16px;margin-bottom:12px;font-size:10px">
                    <div style="display:flex;align-items:center;gap:4px">
                        <div style="width:12px;height:3px;background:#fbbf24"></div>
                        <span>Hour hand</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:4px">
                        <div style="width:12px;height:3px;background:#22c55e"></div>
                        <span>${watchMethod.formatted.direction}</span>
                    </div>
                </div>
                
                <div style="font-size:11px;color:rgba(255,255,255,0.7)">
                    <ol style="margin:0;padding-left:20px">
                        ${watchMethod.instructions.slice(0, 7).map(i => `<li style="margin-bottom:4px">${i}</li>`).join('')}
                    </ol>
                </div>
                
                <div style="margin-top:12px;padding:8px;background:rgba(245,158,11,0.1);border-radius:6px;font-size:10px;color:rgba(255,255,255,0.6)">
                    <strong>Current:</strong> Hour hand at ${watchMethod.formatted.hourHand}, 
                    bisect ${watchMethod.formatted.bisect} points ${watchMethod.formatted.direction}
                </div>
            </div>
        `;
    }
    
    /**
     * Render hand measurement widget
     */
    function renderHandMeasurementWidget() {
        return `
            <div class="hand-measure-widget" style="padding:12px;background:var(--color-bg-elevated);border-radius:10px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                    <div style="font-size:14px;font-weight:600">✋ Hand Measurement</div>
                    <div style="font-size:11px;padding:4px 8px;background:rgba(34,197,94,0.2);border-radius:4px;color:#22c55e">
                        Latitude Tool
                    </div>
                </div>
                
                <!-- Hand diagram -->
                <div style="background:linear-gradient(180deg, #0a1628 0%, #1a365d 100%);padding:20px;border-radius:8px;margin-bottom:12px;text-align:center">
                    <div style="font-size:40px">✊</div>
                    <div style="font-size:10px;color:rgba(255,255,255,0.6);margin-top:8px">
                        1 fist at arm's length ≈ 10°
                    </div>
                    <div style="font-size:24px;margin-top:8px">☝️</div>
                    <div style="font-size:10px;color:rgba(255,255,255,0.6);margin-top:4px">
                        1 finger width ≈ 2°
                    </div>
                </div>
                
                <!-- Input -->
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
                    <div>
                        <label style="font-size:10px;color:rgba(255,255,255,0.5)">Fists to Polaris</label>
                        <input type="number" id="hand-fists" value="4" min="0" max="9" step="1"
                               style="width:100%;padding:8px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white;text-align:center">
                    </div>
                    <div>
                        <label style="font-size:10px;color:rgba(255,255,255,0.5)">+ Fingers</label>
                        <input type="number" id="hand-fingers" value="0" min="0" max="4" step="1"
                               style="width:100%;padding:8px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white;text-align:center">
                    </div>
                </div>
                
                <button class="btn btn--primary btn--full calculate-hand-lat">
                    📍 Estimate Latitude
                </button>
                
                <div id="hand-result" style="margin-top:12px;display:none">
                </div>
                
                <div style="margin-top:12px;padding:10px;background:rgba(0,0,0,0.2);border-radius:6px;font-size:10px;color:rgba(255,255,255,0.6)">
                    <strong>How to use:</strong><br>
                    1. Find Polaris (use Big Dipper pointers)<br>
                    2. Extend your arm fully<br>
                    3. Count fist widths from horizon to Polaris<br>
                    4. Your latitude ≈ Polaris altitude
                </div>
            </div>
        `;
    }
    
    /**
     * Render complete training mode panel
     */
    function renderTrainingModeWidget(lat = 45, lon = -122) {
        return `
            <div class="training-mode" style="padding:12px;background:var(--color-bg-elevated);border-radius:10px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                    <div style="font-size:16px;font-weight:700">🎓 Training Mode</div>
                </div>
                
                <div style="padding:12px;background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.3);border-radius:8px;margin-bottom:16px">
                    <div style="font-size:12px;font-weight:600;color:#a78bfa;margin-bottom:4px">
                        Primitive Navigation Methods
                    </div>
                    <div style="font-size:11px;color:rgba(255,255,255,0.7)">
                        These techniques work with minimal or no equipment. 
                        Practice these skills before you need them!
                    </div>
                </div>
                
                <!-- Method selector -->
                <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:8px;margin-bottom:16px">
                    <button class="btn btn--secondary training-method-btn active" data-method="shadow"
                            style="padding:12px;display:flex;flex-direction:column;align-items:center;gap:4px">
                        <span style="font-size:18px">📏</span>
                        <span style="font-size:9px">Shadow</span>
                    </button>
                    <button class="btn btn--secondary training-method-btn" data-method="watch"
                            style="padding:12px;display:flex;flex-direction:column;align-items:center;gap:4px">
                        <span style="font-size:18px">⌚</span>
                        <span style="font-size:9px">Watch</span>
                    </button>
                    <button class="btn btn--secondary training-method-btn" data-method="hand"
                            style="padding:12px;display:flex;flex-direction:column;align-items:center;gap:4px">
                        <span style="font-size:18px">✋</span>
                        <span style="font-size:9px">Hand</span>
                    </button>
                    <button class="btn btn--secondary training-method-btn" data-method="noon"
                            style="padding:12px;display:flex;flex-direction:column;align-items:center;gap:4px">
                        <span style="font-size:18px">☀️</span>
                        <span style="font-size:9px">Noon</span>
                    </button>
                </div>
                
                <!-- Method content area -->
                <div id="training-method-content">
                    ${renderShadowStickWidget(lat)}
                </div>
            </div>
        `;
    }
    
    /**
     * Render horizon distance calculator
     */
    function renderHorizonDistanceWidget() {
        return `
            <div class="horizon-widget" style="padding:12px;background:var(--color-bg-elevated);border-radius:10px">
                <div style="font-size:14px;font-weight:600;margin-bottom:12px">🌊 Horizon Distance</div>
                
                <div style="margin-bottom:12px">
                    <label style="font-size:10px;color:rgba(255,255,255,0.5)">Height of Eye (feet)</label>
                    <input type="number" id="horizon-height" value="6" min="1" max="1000" step="1"
                           style="width:100%;padding:8px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white">
                </div>
                
                <button class="btn btn--primary btn--full calculate-horizon">
                    📏 Calculate
                </button>
                
                <div id="horizon-result" style="margin-top:12px">
                </div>
                
                <div style="margin-top:12px;padding:10px;background:rgba(0,0,0,0.2);border-radius:6px;font-size:10px">
                    <strong>Quick Reference:</strong><br>
                    • Standing (6 ft): ~2.9 nm<br>
                    • Small boat mast (20 ft): ~5.2 nm<br>
                    • Ship bridge (50 ft): ~8.3 nm
                </div>
            </div>
        `;
    }
    
    /**
     * Render hand latitude result
     */
    function renderHandLatitudeResult(result) {
        return `
            <div style="padding:12px;background:rgba(34,197,94,0.1);border-radius:8px;text-align:center">
                <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-bottom:4px">
                    Estimated Latitude
                </div>
                <div style="font-size:28px;font-weight:700;color:#22c55e">
                    ${result.formatted.latitude}
                </div>
                <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:4px">
                    Based on ${result.formatted.measurement} = ${result.formatted.altitude}
                </div>
                <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:4px">
                    Accuracy: ${result.accuracy}
                </div>
            </div>
        `;
    }
    
    /**
     * Render horizon distance result
     */
    function renderHorizonDistanceResult(result) {
        return `
            <div style="padding:12px;background:rgba(59,130,246,0.1);border-radius:8px;text-align:center">
                <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-bottom:4px">
                    Distance to Horizon
                </div>
                <div style="font-size:28px;font-weight:700;color:#3b82f6">
                    ${result.formatted.distance}
                </div>
                <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:4px">
                    (${result.formatted.distanceKm})
                </div>
                <div style="font-size:9px;color:rgba(255,255,255,0.3);margin-top:8px">
                    Formula: ${result.formula}
                </div>
            </div>
        `;
    }
    
    // ==================== PHASE 8: INERTIAL NAVIGATION / PDR ====================
    
    /**
     * Inertial Navigation State
     * Tracks position using device sensors (accelerometer, gyroscope, magnetometer)
     */
    const inertialState = {
        // Tracking state
        isTracking: false,
        startTime: null,
        lastUpdateTime: null,
        
        // Position (relative to start or absolute if initialized)
        startPosition: null,      // { lat, lon } - starting fix
        currentPosition: null,    // { lat, lon } - current estimated position
        relativePosition: { x: 0, y: 0 },  // meters from start (x=east, y=north)
        
        // Movement
        heading: 0,               // degrees true (0-360)
        headingSource: 'none',    // 'gyro', 'magnetic', 'fused', 'none'
        speed: 0,                 // m/s instantaneous
        
        // Step tracking
        stepCount: 0,
        stepLength: 0.75,         // meters per step (default, calibratable)
        totalDistance: 0,         // meters traveled
        
        // Gyroscope integration
        gyroHeading: 0,           // heading from integrated gyro
        gyroBias: { x: 0, y: 0, z: 0 },  // estimated bias
        
        // Calibration
        isCalibrated: false,
        calibrationData: {
            stepLength: 0.75,
            gyroCalibrated: false,
            magneticDeclination: 0
        },
        
        // Sensor data
        lastAccel: null,
        lastGyro: null,
        lastMag: null,
        
        // History for analysis
        positionHistory: [],      // Track of positions
        stepTimes: [],            // Timestamps of detected steps
        
        // Confidence / drift estimation
        confidence: 1.0,          // 0-1, degrades over time without fixes
        estimatedDrift: 0,        // meters of estimated error
        timeSinceLastFix: 0,      // seconds
        
        // Sensor availability
        sensorsAvailable: {
            accelerometer: false,
            gyroscope: false,
            magnetometer: false
        },
        
        // Event handlers (store references for cleanup)
        motionHandler: null,
        orientationHandler: null
    };
    
    // Step detection parameters
    const STEP_DETECTION = {
        minStepInterval: 250,     // ms - minimum time between steps
        maxStepInterval: 2000,    // ms - maximum time between steps
        accelThreshold: 1.2,      // g - threshold for step detection
        peakWindow: 5,            // samples for peak detection
        lowPassAlpha: 0.3         // low-pass filter coefficient
    };
    
    // Drift estimation parameters
    const DRIFT_PARAMS = {
        driftRatePercent: 0.02,   // 2% of distance traveled
        minConfidence: 0.1,       // minimum confidence floor
        confidenceDecayRate: 0.001 // per second without fix
    };
    
    /**
     * Check which sensors are available on this device
     * @returns {Object} Sensor availability
     */
    function checkSensorAvailability() {
        const available = {
            accelerometer: false,
            gyroscope: false,
            magnetometer: false,
            deviceMotion: false,
            deviceOrientation: false
        };
        
        // Check for DeviceMotionEvent (accelerometer + gyroscope)
        if (typeof DeviceMotionEvent !== 'undefined') {
            available.deviceMotion = true;
            available.accelerometer = true;
            // Gyroscope availability checked when we get actual data
        }
        
        // Check for DeviceOrientationEvent (magnetometer/compass)
        if (typeof DeviceOrientationEvent !== 'undefined') {
            available.deviceOrientation = true;
            available.magnetometer = true;
        }
        
        return available;
    }
    
    /**
     * Request permission for motion sensors (required on iOS 13+)
     * @returns {Promise<boolean>} Whether permission was granted
     */
    async function requestSensorPermission() {
        // iOS 13+ requires explicit permission
        if (typeof DeviceMotionEvent !== 'undefined' && 
            typeof DeviceMotionEvent.requestPermission === 'function') {
            try {
                const permission = await DeviceMotionEvent.requestPermission();
                return permission === 'granted';
            } catch (e) {
                console.warn('Motion sensor permission request failed:', e);
                return false;
            }
        }
        
        // Android and older iOS don't need permission
        return true;
    }
    
    /**
     * Initialize inertial navigation system
     * @param {Object} options - Configuration options
     * @returns {Object} Initialization result
     */
    async function initInertialNav(options = {}) {
        const {
            startPosition = null,      // { lat, lon } - known starting position
            stepLength = 0.75,         // meters per step
            magneticDeclination = 0,   // degrees (east positive)
            useGyroHeading = true      // prefer gyro over magnetic
        } = options;
        
        // Check sensor availability
        const sensors = checkSensorAvailability();
        inertialState.sensorsAvailable = sensors;
        
        if (!sensors.deviceMotion && !sensors.deviceOrientation) {
            return {
                success: false,
                error: 'No motion sensors available on this device',
                sensors
            };
        }
        
        // Request permission if needed
        const permissionGranted = await requestSensorPermission();
        if (!permissionGranted) {
            return {
                success: false,
                error: 'Motion sensor permission denied',
                sensors
            };
        }
        
        // Set initial state
        inertialState.startPosition = startPosition;
        inertialState.currentPosition = startPosition ? { ...startPosition } : null;
        inertialState.relativePosition = { x: 0, y: 0 };
        inertialState.stepLength = stepLength;
        inertialState.calibrationData.stepLength = stepLength;
        inertialState.calibrationData.magneticDeclination = magneticDeclination;
        inertialState.stepCount = 0;
        inertialState.totalDistance = 0;
        inertialState.confidence = 1.0;
        inertialState.estimatedDrift = 0;
        inertialState.positionHistory = [];
        inertialState.stepTimes = [];
        
        return {
            success: true,
            sensors,
            message: 'Inertial navigation initialized',
            startPosition
        };
    }
    
    /**
     * Start tracking with inertial sensors
     * @returns {Object} Tracking status
     */
    function startInertialTracking() {
        if (inertialState.isTracking) {
            return { success: false, error: 'Already tracking' };
        }
        
        const now = Date.now();
        inertialState.isTracking = true;
        inertialState.startTime = now;
        inertialState.lastUpdateTime = now;
        
        // Accelerometer data buffer for step detection
        let accelBuffer = [];
        let lastStepTime = 0;
        let filteredAccel = 0;
        
        // Gyroscope integration
        let lastGyroTime = null;
        
        // Motion event handler (accelerometer + gyroscope)
        inertialState.motionHandler = (event) => {
            const now = Date.now();
            
            // Process accelerometer for step detection
            if (event.accelerationIncludingGravity) {
                const ax = event.accelerationIncludingGravity.x || 0;
                const ay = event.accelerationIncludingGravity.y || 0;
                const az = event.accelerationIncludingGravity.z || 0;
                
                // Calculate magnitude
                const accelMag = Math.sqrt(ax*ax + ay*ay + az*az) / 9.81;  // Convert to g
                
                // Low-pass filter
                filteredAccel = STEP_DETECTION.lowPassAlpha * accelMag + 
                               (1 - STEP_DETECTION.lowPassAlpha) * filteredAccel;
                
                // Store in buffer
                accelBuffer.push({ time: now, value: filteredAccel });
                if (accelBuffer.length > STEP_DETECTION.peakWindow * 2) {
                    accelBuffer.shift();
                }
                
                // Step detection - look for peak
                if (accelBuffer.length >= STEP_DETECTION.peakWindow) {
                    const midIdx = Math.floor(accelBuffer.length / 2);
                    const midVal = accelBuffer[midIdx].value;
                    
                    // Check if middle value is a peak
                    let isPeak = midVal > STEP_DETECTION.accelThreshold;
                    for (let i = 0; i < accelBuffer.length; i++) {
                        if (i !== midIdx && accelBuffer[i].value >= midVal) {
                            isPeak = false;
                            break;
                        }
                    }
                    
                    // Validate step timing
                    const timeSinceLastStep = now - lastStepTime;
                    if (isPeak && timeSinceLastStep > STEP_DETECTION.minStepInterval &&
                        timeSinceLastStep < STEP_DETECTION.maxStepInterval) {
                        // Step detected!
                        onStepDetected(now);
                        lastStepTime = now;
                    } else if (isPeak && lastStepTime === 0) {
                        // First step
                        onStepDetected(now);
                        lastStepTime = now;
                    }
                }
                
                inertialState.lastAccel = { x: ax, y: ay, z: az, magnitude: accelMag };
            }
            
            // Process gyroscope for heading
            if (event.rotationRate) {
                const alpha = event.rotationRate.alpha || 0;  // z-axis rotation (yaw)
                const beta = event.rotationRate.beta || 0;   // x-axis (pitch)
                const gamma = event.rotationRate.gamma || 0;  // y-axis (roll)
                
                inertialState.sensorsAvailable.gyroscope = true;
                
                if (lastGyroTime !== null) {
                    const dt = (now - lastGyroTime) / 1000;  // seconds
                    
                    // Integrate yaw rate for heading change
                    // rotationRate is in deg/s
                    const headingChange = alpha * dt;
                    
                    // Apply bias correction
                    const correctedChange = headingChange - (inertialState.gyroBias.z * dt);
                    
                    // Update gyro heading
                    inertialState.gyroHeading = (inertialState.gyroHeading + correctedChange + 360) % 360;
                }
                
                lastGyroTime = now;
                inertialState.lastGyro = { alpha, beta, gamma };
            }
        };
        
        // Orientation event handler (magnetometer/compass)
        inertialState.orientationHandler = (event) => {
            if (event.alpha !== null) {
                // Alpha is compass heading (0-360, 0 = north)
                // Note: This is magnetic north, need to apply declination
                const magneticHeading = event.alpha;
                const trueHeading = (magneticHeading + inertialState.calibrationData.magneticDeclination + 360) % 360;
                
                // Fuse with gyro heading if available
                if (inertialState.sensorsAvailable.gyroscope) {
                    // Complementary filter: trust gyro for short-term, mag for long-term
                    const alpha = 0.98;  // High trust in gyro
                    
                    // Handle wrap-around
                    let diff = trueHeading - inertialState.gyroHeading;
                    if (diff > 180) diff -= 360;
                    if (diff < -180) diff += 360;
                    
                    inertialState.heading = (inertialState.gyroHeading + (1 - alpha) * diff + 360) % 360;
                    inertialState.headingSource = 'fused';
                } else {
                    inertialState.heading = trueHeading;
                    inertialState.headingSource = 'magnetic';
                }
                
                inertialState.lastMag = { alpha: event.alpha, beta: event.beta, gamma: event.gamma };
            }
        };
        
        // Add event listeners
        if (typeof window !== 'undefined') {
            window.addEventListener('devicemotion', inertialState.motionHandler);
            window.addEventListener('deviceorientation', inertialState.orientationHandler);
        }
        
        return {
            success: true,
            message: 'Inertial tracking started',
            startTime: new Date(now).toISOString()
        };
    }
    
    /**
     * Handle detected step
     * @param {number} timestamp - Step timestamp
     */
    function onStepDetected(timestamp) {
        inertialState.stepCount++;
        inertialState.stepTimes.push(timestamp);
        
        // Keep only recent step times for cadence calculation
        const maxStepHistory = 20;
        if (inertialState.stepTimes.length > maxStepHistory) {
            inertialState.stepTimes.shift();
        }
        
        // Calculate distance traveled this step
        const stepDistance = inertialState.stepLength;
        inertialState.totalDistance += stepDistance;
        
        // Update relative position based on heading
        const headingRad = inertialState.heading * DEG_TO_RAD;
        const dx = stepDistance * Math.sin(headingRad);  // East component
        const dy = stepDistance * Math.cos(headingRad);  // North component
        
        inertialState.relativePosition.x += dx;
        inertialState.relativePosition.y += dy;
        
        // Update absolute position if we have a start position
        if (inertialState.startPosition) {
            updateAbsolutePosition();
        }
        
        // Update confidence/drift estimate
        updateDriftEstimate();
        
        // Record in history
        inertialState.positionHistory.push({
            time: timestamp,
            relative: { ...inertialState.relativePosition },
            absolute: inertialState.currentPosition ? { ...inertialState.currentPosition } : null,
            heading: inertialState.heading,
            stepCount: inertialState.stepCount,
            confidence: inertialState.confidence
        });
        
        // Limit history size
        if (inertialState.positionHistory.length > 1000) {
            inertialState.positionHistory = inertialState.positionHistory.slice(-500);
        }
    }
    
    /**
     * Update absolute lat/lon from relative position
     */
    function updateAbsolutePosition() {
        if (!inertialState.startPosition) return;
        
        const lat = inertialState.startPosition.lat;
        const lon = inertialState.startPosition.lon;
        
        // Convert meters to degrees
        // 1 degree latitude ≈ 111,111 meters
        // 1 degree longitude ≈ 111,111 * cos(lat) meters
        const metersPerDegreeLat = 111111;
        const metersPerDegreeLon = 111111 * Math.cos(lat * DEG_TO_RAD);
        
        const dLat = inertialState.relativePosition.y / metersPerDegreeLat;
        const dLon = inertialState.relativePosition.x / metersPerDegreeLon;
        
        inertialState.currentPosition = {
            lat: lat + dLat,
            lon: lon + dLon
        };
    }
    
    /**
     * Update drift/confidence estimate
     */
    function updateDriftEstimate() {
        // Drift grows with distance traveled
        inertialState.estimatedDrift = inertialState.totalDistance * DRIFT_PARAMS.driftRatePercent;
        
        // Confidence decreases with distance and time
        const distanceFactor = Math.max(0, 1 - (inertialState.totalDistance / 5000));  // 5km full degradation
        const timeFactor = Math.max(0, 1 - (inertialState.timeSinceLastFix * DRIFT_PARAMS.confidenceDecayRate));
        
        inertialState.confidence = Math.max(
            DRIFT_PARAMS.minConfidence,
            distanceFactor * timeFactor
        );
    }
    
    /**
     * Stop inertial tracking
     * @returns {Object} Final state summary
     */
    function stopInertialTracking() {
        if (!inertialState.isTracking) {
            return { success: false, error: 'Not currently tracking' };
        }
        
        // Remove event listeners
        if (typeof window !== 'undefined') {
            if (inertialState.motionHandler) {
                window.removeEventListener('devicemotion', inertialState.motionHandler);
            }
            if (inertialState.orientationHandler) {
                window.removeEventListener('deviceorientation', inertialState.orientationHandler);
            }
        }
        
        inertialState.isTracking = false;
        
        const duration = (Date.now() - inertialState.startTime) / 1000;
        
        return {
            success: true,
            summary: {
                duration: duration,
                stepCount: inertialState.stepCount,
                totalDistance: inertialState.totalDistance,
                averageSpeed: inertialState.totalDistance / duration,
                finalPosition: inertialState.currentPosition,
                relativePosition: inertialState.relativePosition,
                confidence: inertialState.confidence,
                estimatedDrift: inertialState.estimatedDrift
            }
        };
    }
    
    /**
     * Get current inertial navigation state
     * @returns {Object} Current state
     */
    function getInertialState() {
        const now = Date.now();
        const duration = inertialState.startTime ? (now - inertialState.startTime) / 1000 : 0;
        
        // Calculate current cadence (steps per minute)
        let cadence = 0;
        if (inertialState.stepTimes.length >= 2) {
            const recentSteps = inertialState.stepTimes.slice(-10);
            const timeSpan = (recentSteps[recentSteps.length - 1] - recentSteps[0]) / 1000;
            if (timeSpan > 0) {
                cadence = ((recentSteps.length - 1) / timeSpan) * 60;
            }
        }
        
        // Calculate current speed (m/s)
        const speed = cadence > 0 ? (cadence / 60) * inertialState.stepLength : 0;
        inertialState.speed = speed;
        
        return {
            isTracking: inertialState.isTracking,
            
            // Position
            startPosition: inertialState.startPosition,
            currentPosition: inertialState.currentPosition,
            relativePosition: { ...inertialState.relativePosition },
            
            // Movement
            heading: inertialState.heading,
            headingSource: inertialState.headingSource,
            speed: speed,
            cadence: cadence,
            
            // Steps
            stepCount: inertialState.stepCount,
            stepLength: inertialState.stepLength,
            totalDistance: inertialState.totalDistance,
            
            // Confidence
            confidence: inertialState.confidence,
            estimatedDrift: inertialState.estimatedDrift,
            
            // Timing
            duration: duration,
            timeSinceLastFix: inertialState.timeSinceLastFix,
            
            // Sensors
            sensorsAvailable: { ...inertialState.sensorsAvailable },
            
            // Formatted
            formatted: {
                position: inertialState.currentPosition ? 
                    `${inertialState.currentPosition.lat.toFixed(5)}°, ${inertialState.currentPosition.lon.toFixed(5)}°` : 
                    'No fix',
                relativePosition: `${inertialState.relativePosition.x.toFixed(1)}m E, ${inertialState.relativePosition.y.toFixed(1)}m N`,
                heading: `${inertialState.heading.toFixed(0)}° ${inertialState.headingSource}`,
                speed: `${(speed * 3.6).toFixed(1)} km/h`,
                speedKnots: `${(speed * 1.944).toFixed(1)} kts`,
                distance: `${inertialState.totalDistance.toFixed(0)} m`,
                distanceNm: `${(inertialState.totalDistance / 1852).toFixed(2)} nm`,
                steps: `${inertialState.stepCount} steps`,
                cadence: `${cadence.toFixed(0)} spm`,
                confidence: `${(inertialState.confidence * 100).toFixed(0)}%`,
                drift: `±${inertialState.estimatedDrift.toFixed(0)} m`,
                duration: formatDuration(duration)
            }
        };
    }
    
    /**
     * Format duration in seconds to human readable
     */
    function formatDuration(seconds) {
        if (seconds < 60) return `${Math.floor(seconds)}s`;
        if (seconds < 3600) return `${Math.floor(seconds/60)}m ${Math.floor(seconds%60)}s`;
        return `${Math.floor(seconds/3600)}h ${Math.floor((seconds%3600)/60)}m`;
    }
    
    /**
     * Calibrate step length using known distance
     * @param {number} knownDistance - Distance traveled in meters
     * @param {number} stepCount - Number of steps taken (optional, uses current count if not provided)
     * @returns {Object} Calibration result
     */
    function calibrateStepLength(knownDistance, stepCount = null) {
        const steps = stepCount !== null ? stepCount : inertialState.stepCount;
        
        if (steps < 10) {
            return {
                success: false,
                error: 'Need at least 10 steps for accurate calibration'
            };
        }
        
        const newStepLength = knownDistance / steps;
        
        // Sanity check (typical human step is 0.5-1.0m)
        if (newStepLength < 0.3 || newStepLength > 1.5) {
            return {
                success: false,
                error: `Calculated step length ${newStepLength.toFixed(2)}m is outside normal range (0.3-1.5m)`,
                calculatedLength: newStepLength
            };
        }
        
        inertialState.stepLength = newStepLength;
        inertialState.calibrationData.stepLength = newStepLength;
        inertialState.isCalibrated = true;
        
        return {
            success: true,
            previousLength: inertialState.calibrationData.stepLength,
            newLength: newStepLength,
            steps: steps,
            distance: knownDistance,
            formatted: {
                stepLength: `${(newStepLength * 100).toFixed(1)} cm`
            }
        };
    }
    
    /**
     * Calibrate gyroscope bias (call when device is stationary)
     * @param {number} duration - Calibration duration in seconds (default 5)
     * @returns {Promise<Object>} Calibration result
     */
    function calibrateGyroBias(duration = 5) {
        return new Promise((resolve) => {
            if (!inertialState.sensorsAvailable.gyroscope) {
                resolve({
                    success: false,
                    error: 'Gyroscope not available'
                });
                return;
            }
            
            const samples = [];
            const startTime = Date.now();
            
            const handler = (event) => {
                if (event.rotationRate) {
                    samples.push({
                        x: event.rotationRate.beta || 0,
                        y: event.rotationRate.gamma || 0,
                        z: event.rotationRate.alpha || 0
                    });
                }
            };
            
            window.addEventListener('devicemotion', handler);
            
            setTimeout(() => {
                window.removeEventListener('devicemotion', handler);
                
                if (samples.length < 10) {
                    resolve({
                        success: false,
                        error: 'Not enough samples collected'
                    });
                    return;
                }
                
                // Calculate average bias
                const avgBias = {
                    x: samples.reduce((a, b) => a + b.x, 0) / samples.length,
                    y: samples.reduce((a, b) => a + b.y, 0) / samples.length,
                    z: samples.reduce((a, b) => a + b.z, 0) / samples.length
                };
                
                inertialState.gyroBias = avgBias;
                inertialState.calibrationData.gyroCalibrated = true;
                
                resolve({
                    success: true,
                    bias: avgBias,
                    samples: samples.length,
                    duration: (Date.now() - startTime) / 1000,
                    formatted: {
                        bias: `x:${avgBias.x.toFixed(3)} y:${avgBias.y.toFixed(3)} z:${avgBias.z.toFixed(3)} °/s`
                    }
                });
            }, duration * 1000);
        });
    }
    
    /**
     * Update with external fix (GPS, celestial, etc.)
     * Resets drift and updates confidence
     * @param {Object} position - { lat, lon }
     * @param {string} fixType - 'gps', 'celestial', 'manual'
     * @returns {Object} Update result
     */
    function updateInertialFix(position, fixType = 'manual') {
        const previousPosition = inertialState.currentPosition;
        
        // Calculate error if we have a previous position
        let error = null;
        if (previousPosition) {
            const dLat = position.lat - previousPosition.lat;
            const dLon = position.lon - previousPosition.lon;
            const errorMeters = Math.sqrt(
                Math.pow(dLat * 111111, 2) + 
                Math.pow(dLon * 111111 * Math.cos(position.lat * DEG_TO_RAD), 2)
            );
            error = {
                meters: errorMeters,
                bearing: Math.atan2(dLon * Math.cos(position.lat * DEG_TO_RAD), dLat) * RAD_TO_DEG
            };
        }
        
        // Update position
        inertialState.currentPosition = { ...position };
        
        // If this is first fix, set as start position too
        if (!inertialState.startPosition) {
            inertialState.startPosition = { ...position };
        }
        
        // Reset relative position to match new fix
        if (inertialState.startPosition) {
            const dLat = position.lat - inertialState.startPosition.lat;
            const dLon = position.lon - inertialState.startPosition.lon;
            inertialState.relativePosition = {
                x: dLon * 111111 * Math.cos(inertialState.startPosition.lat * DEG_TO_RAD),
                y: dLat * 111111
            };
        }
        
        // Reset confidence
        inertialState.confidence = 1.0;
        inertialState.timeSinceLastFix = 0;
        inertialState.estimatedDrift = 0;
        
        return {
            success: true,
            fixType: fixType,
            position: position,
            error: error,
            formatted: {
                position: `${position.lat.toFixed(5)}°, ${position.lon.toFixed(5)}°`,
                error: error ? `${error.meters.toFixed(1)}m` : 'N/A'
            }
        };
    }
    
    /**
     * Perform Zero Velocity Update (ZUPT)
     * Call when device is known to be stationary
     * Helps calibrate sensors and reduce drift
     * @returns {Object} ZUPT result
     */
    function performZUPT() {
        // Mark current position as confirmed
        const currentState = getInertialState();
        
        // Reset speed-related drift
        inertialState.speed = 0;
        
        // Slight confidence boost for being stationary
        inertialState.confidence = Math.min(1.0, inertialState.confidence + 0.05);
        
        // If we have gyro data, use this moment to estimate bias
        if (inertialState.lastGyro) {
            // During ZUPT, any rotation rate is bias
            const alpha = 0.1;  // Slow adaptation
            inertialState.gyroBias.z = (1 - alpha) * inertialState.gyroBias.z + 
                                       alpha * inertialState.lastGyro.alpha;
        }
        
        return {
            success: true,
            message: 'Zero Velocity Update applied',
            position: currentState.currentPosition,
            confidence: inertialState.confidence,
            gyroBias: { ...inertialState.gyroBias }
        };
    }
    
    /**
     * Reset inertial navigation to a known position
     * @param {Object} position - { lat, lon } - new starting position (optional)
     */
    function resetInertialNav(position = null) {
        // Stop tracking if active
        if (inertialState.isTracking) {
            stopInertialTracking();
        }
        
        // Reset all state
        inertialState.startPosition = position;
        inertialState.currentPosition = position ? { ...position } : null;
        inertialState.relativePosition = { x: 0, y: 0 };
        inertialState.heading = 0;
        inertialState.headingSource = 'none';
        inertialState.speed = 0;
        inertialState.stepCount = 0;
        inertialState.totalDistance = 0;
        inertialState.gyroHeading = 0;
        inertialState.confidence = 1.0;
        inertialState.estimatedDrift = 0;
        inertialState.timeSinceLastFix = 0;
        inertialState.positionHistory = [];
        inertialState.stepTimes = [];
        
        return {
            success: true,
            message: 'Inertial navigation reset',
            startPosition: position
        };
    }
    
    /**
     * Get position history for plotting
     * @param {number} maxPoints - Maximum points to return
     * @returns {Array} Position history
     */
    function getInertialTrack(maxPoints = 100) {
        const history = inertialState.positionHistory;
        
        if (history.length <= maxPoints) {
            return history;
        }
        
        // Downsample
        const step = Math.ceil(history.length / maxPoints);
        const sampled = [];
        for (let i = 0; i < history.length; i += step) {
            sampled.push(history[i]);
        }
        
        // Always include last point
        if (sampled[sampled.length - 1] !== history[history.length - 1]) {
            sampled.push(history[history.length - 1]);
        }
        
        return sampled;
    }
    
    /**
     * Calculate estimated position uncertainty ellipse
     * @returns {Object} Uncertainty ellipse parameters
     */
    function getPositionUncertainty() {
        const drift = inertialState.estimatedDrift;
        const confidence = inertialState.confidence;
        
        // Uncertainty grows with distance and time
        // Semi-axes of uncertainty ellipse
        const alongTrackError = drift * 1.2;  // Larger error along direction of travel
        const crossTrackError = drift * 0.8;  // Smaller error perpendicular
        
        return {
            center: inertialState.currentPosition,
            semiMajor: alongTrackError,
            semiMinor: crossTrackError,
            orientation: inertialState.heading,  // Major axis along track
            confidence: confidence,
            formatted: {
                error: `±${drift.toFixed(0)}m`,
                confidence: `${(confidence * 100).toFixed(0)}%`
            }
        };
    }
    
    // ==================== PHASE 8: INERTIAL NAV UI ====================
    
    /**
     * Render inertial navigation status widget
     */
    function renderInertialStatusWidget() {
        const state = getInertialState();
        
        return `
            <div class="inertial-status-widget" style="padding:12px;background:var(--color-bg-elevated);border-radius:10px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                    <div style="font-size:14px;font-weight:600">📡 Inertial Navigation</div>
                    <div style="padding:4px 8px;border-radius:4px;font-size:10px;background:${state.isTracking ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'};color:${state.isTracking ? '#22c55e' : '#ef4444'}">
                        ${state.isTracking ? '● TRACKING' : '○ STOPPED'}
                    </div>
                </div>
                
                <!-- Sensors Status -->
                <div style="display:flex;gap:8px;margin-bottom:12px">
                    <div style="flex:1;padding:6px;background:rgba(0,0,0,0.2);border-radius:4px;text-align:center;font-size:10px">
                        <div style="opacity:${state.sensorsAvailable.accelerometer ? 1 : 0.3}">📱 Accel</div>
                    </div>
                    <div style="flex:1;padding:6px;background:rgba(0,0,0,0.2);border-radius:4px;text-align:center;font-size:10px">
                        <div style="opacity:${state.sensorsAvailable.gyroscope ? 1 : 0.3}">🔄 Gyro</div>
                    </div>
                    <div style="flex:1;padding:6px;background:rgba(0,0,0,0.2);border-radius:4px;text-align:center;font-size:10px">
                        <div style="opacity:${state.sensorsAvailable.magnetometer ? 1 : 0.3}">🧭 Mag</div>
                    </div>
                </div>
                
                ${state.isTracking ? `
                    <!-- Current Position -->
                    <div style="background:rgba(0,0,0,0.3);border-radius:8px;padding:12px;margin-bottom:12px">
                        <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-bottom:4px">Position</div>
                        <div style="font-size:14px;font-weight:600">${state.formatted.position}</div>
                        <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:2px">
                            Relative: ${state.formatted.relativePosition}
                        </div>
                    </div>
                    
                    <!-- Stats Grid -->
                    <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;margin-bottom:12px">
                        <div style="text-align:center;padding:8px;background:rgba(0,0,0,0.2);border-radius:6px">
                            <div style="font-size:18px;font-weight:700">${state.formatted.heading.split(' ')[0]}</div>
                            <div style="font-size:9px;color:rgba(255,255,255,0.5)">Heading</div>
                        </div>
                        <div style="text-align:center;padding:8px;background:rgba(0,0,0,0.2);border-radius:6px">
                            <div style="font-size:18px;font-weight:700">${state.formatted.speed}</div>
                            <div style="font-size:9px;color:rgba(255,255,255,0.5)">Speed</div>
                        </div>
                        <div style="text-align:center;padding:8px;background:rgba(0,0,0,0.2);border-radius:6px">
                            <div style="font-size:18px;font-weight:700">${state.stepCount}</div>
                            <div style="font-size:9px;color:rgba(255,255,255,0.5)">Steps</div>
                        </div>
                    </div>
                    
                    <div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:8px;margin-bottom:12px">
                        <div style="text-align:center;padding:8px;background:rgba(0,0,0,0.2);border-radius:6px">
                            <div style="font-size:16px;font-weight:600">${state.formatted.distance}</div>
                            <div style="font-size:9px;color:rgba(255,255,255,0.5)">Distance</div>
                        </div>
                        <div style="text-align:center;padding:8px;background:rgba(0,0,0,0.2);border-radius:6px">
                            <div style="font-size:16px;font-weight:600">${state.formatted.duration}</div>
                            <div style="font-size:9px;color:rgba(255,255,255,0.5)">Duration</div>
                        </div>
                    </div>
                    
                    <!-- Confidence -->
                    <div style="margin-bottom:12px">
                        <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:4px">
                            <span style="color:rgba(255,255,255,0.5)">Confidence</span>
                            <span>${state.formatted.confidence} (${state.formatted.drift})</span>
                        </div>
                        <div style="height:6px;background:rgba(0,0,0,0.3);border-radius:3px;overflow:hidden">
                            <div style="height:100%;width:${state.confidence * 100}%;background:${state.confidence > 0.5 ? '#22c55e' : state.confidence > 0.25 ? '#f59e0b' : '#ef4444'};border-radius:3px;transition:width 0.3s"></div>
                        </div>
                    </div>
                    
                    <!-- Controls -->
                    <div style="display:flex;gap:8px">
                        <button class="inertial-zupt btn btn--secondary" style="flex:1;padding:8px;font-size:11px">
                            ⏸️ ZUPT
                        </button>
                        <button class="inertial-stop btn btn--secondary" style="flex:1;padding:8px;font-size:11px;color:#ef4444">
                            ⏹️ Stop
                        </button>
                    </div>
                ` : `
                    <!-- Not Tracking -->
                    <div style="text-align:center;padding:20px;color:rgba(255,255,255,0.5)">
                        <div style="font-size:24px;margin-bottom:8px">📱</div>
                        <div style="font-size:12px;margin-bottom:16px">Start tracking to use device sensors for navigation</div>
                        <button class="inertial-start btn btn--primary" style="padding:10px 20px">
                            ▶️ Start Tracking
                        </button>
                    </div>
                `}
            </div>
        `;
    }
    
    /**
     * Render step length calibration widget
     */
    function renderInertialCalibrationWidget() {
        const state = getInertialState();
        
        return `
            <div class="inertial-calibration-widget" style="padding:12px;background:var(--color-bg-elevated);border-radius:10px">
                <div style="font-size:14px;font-weight:600;margin-bottom:12px">⚙️ Calibration</div>
                
                <!-- Current Step Length -->
                <div style="background:rgba(0,0,0,0.2);border-radius:8px;padding:12px;margin-bottom:12px">
                    <div style="display:flex;justify-content:space-between;align-items:center">
                        <div>
                            <div style="font-size:10px;color:rgba(255,255,255,0.5)">Step Length</div>
                            <div style="font-size:18px;font-weight:600">${(inertialState.stepLength * 100).toFixed(0)} cm</div>
                        </div>
                        <div style="padding:4px 8px;border-radius:4px;font-size:10px;background:${inertialState.isCalibrated ? 'rgba(34,197,94,0.2)' : 'rgba(251,191,36,0.2)'};color:${inertialState.isCalibrated ? '#22c55e' : '#f59e0b'}">
                            ${inertialState.isCalibrated ? '✓ Calibrated' : '⚠ Default'}
                        </div>
                    </div>
                </div>
                
                <!-- Calibration Input -->
                <div style="margin-bottom:12px">
                    <label style="font-size:10px;color:rgba(255,255,255,0.5);display:block;margin-bottom:4px">
                        Walk a known distance, then enter it:
                    </label>
                    <div style="display:flex;gap:8px">
                        <input type="number" id="calibration-distance" placeholder="Distance (m)" min="10" step="1"
                               style="flex:1;padding:8px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white">
                        <button class="calibrate-step-btn btn btn--primary" style="padding:8px 16px">
                            Calibrate
                        </button>
                    </div>
                    <div style="font-size:9px;color:rgba(255,255,255,0.4);margin-top:4px">
                        Current steps: ${state.stepCount} | Walk at least 10 steps
                    </div>
                </div>
                
                <!-- Gyro Calibration -->
                <div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:12px">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                        <div style="font-size:11px">Gyroscope Bias</div>
                        <div style="font-size:10px;color:rgba(255,255,255,0.5)">
                            ${inertialState.calibrationData.gyroCalibrated ? '✓ Calibrated' : 'Not calibrated'}
                        </div>
                    </div>
                    <button class="calibrate-gyro-btn btn btn--secondary btn--full" style="padding:8px">
                        🔄 Calibrate Gyro (hold still for 5s)
                    </button>
                </div>
                
                <!-- Magnetic Declination -->
                <div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:12px;margin-top:12px">
                    <label style="font-size:10px;color:rgba(255,255,255,0.5);display:block;margin-bottom:4px">
                        Magnetic Declination (°)
                    </label>
                    <input type="number" id="mag-declination" value="${inertialState.calibrationData.magneticDeclination}" step="0.1"
                           style="width:100%;padding:8px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white">
                    <div style="font-size:9px;color:rgba(255,255,255,0.4);margin-top:4px">
                        East positive, West negative. Get from local charts or declination calculator.
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * Render inertial track on canvas
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Function} meterToPixel - Function to convert meters to pixels
     * @param {Object} options - Rendering options
     */
    function renderInertialTrack(ctx, meterToPixel, options = {}) {
        const {
            showTrack = true,
            showUncertainty = true,
            trackColor = '#3b82f6',
            uncertaintyColor = 'rgba(59,130,246,0.2)'
        } = options;
        
        const track = getInertialTrack(200);
        if (track.length < 2) return;
        
        // Draw uncertainty ellipse at current position
        if (showUncertainty && track.length > 0) {
            const lastPoint = track[track.length - 1];
            const uncertainty = getPositionUncertainty();
            
            const center = meterToPixel(lastPoint.relative.x, lastPoint.relative.y);
            const majorPx = uncertainty.semiMajor * (meterToPixel(1, 0).x - meterToPixel(0, 0).x);
            const minorPx = uncertainty.semiMinor * (meterToPixel(1, 0).x - meterToPixel(0, 0).x);
            
            ctx.save();
            ctx.translate(center.x, center.y);
            ctx.rotate(-uncertainty.orientation * DEG_TO_RAD);
            
            ctx.fillStyle = uncertaintyColor;
            ctx.beginPath();
            ctx.ellipse(0, 0, Math.abs(majorPx), Math.abs(minorPx), 0, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.restore();
        }
        
        // Draw track
        if (showTrack) {
            ctx.strokeStyle = trackColor;
            ctx.lineWidth = 2;
            ctx.beginPath();
            
            for (let i = 0; i < track.length; i++) {
                const pt = meterToPixel(track[i].relative.x, track[i].relative.y);
                if (i === 0) {
                    ctx.moveTo(pt.x, pt.y);
                } else {
                    ctx.lineTo(pt.x, pt.y);
                }
            }
            ctx.stroke();
            
            // Draw current position marker
            const lastPt = track[track.length - 1];
            const pos = meterToPixel(lastPt.relative.x, lastPt.relative.y);
            
            // Heading indicator
            ctx.save();
            ctx.translate(pos.x, pos.y);
            ctx.rotate(lastPt.heading * DEG_TO_RAD);
            
            ctx.fillStyle = trackColor;
            ctx.beginPath();
            ctx.moveTo(0, -10);
            ctx.lineTo(6, 6);
            ctx.lineTo(0, 3);
            ctx.lineTo(-6, 6);
            ctx.closePath();
            ctx.fill();
            
            ctx.restore();
        }
    }
    
    /**
     * Render full inertial navigation widget (combines status + calibration)
     */
    function renderInertialNavWidget(lat = 37, lon = -122) {
        return `
            <div style="display:flex;flex-direction:column;gap:12px">
                ${renderInertialStatusWidget()}
                ${renderInertialCalibrationWidget()}
            </div>
        `;
    }
    
    let initialized = false;
    
    function init() {
        if (initialized) return;
        initialized = true;
        console.log('CelestialModule initialized - Full celestial navigation suite ready');
    }
    
    // ==================== PUBLIC API ====================
    
    return {
        init,
        
        // Phase 1: Julian Date functions
        dateToJD,
        jdToDate,
        julianCenturies,
        
        // Phase 1: GHA Aries
        getAriesGHA,
        getGMST,
        
        // Phase 1: Body positions
        getSunPosition,
        getMoonPosition,
        getPlanetPosition,
        getStarPosition,
        getAllStarPositions,
        getStarCatalog,
        
        // Phase 1: Altitude/Azimuth
        calculateAltAz,
        getVisibleBodies,
        getRecommendedBodies,
        
        // Phase 1: Almanac
        getAlmanac,
        
        // Phase 1: Formatting
        formatAngle,
        parseAngle,
        formatTime,
        
        // Phase 1: Rendering
        renderAlmanacWidget,
        renderBodyPosition,
        
        // Phase 2: Altitude Corrections
        calculateRefraction,
        calculateDip,
        correctAltitude,
        
        // Phase 2: Observation Management
        startObservation,
        recordSight,
        completeObservation,
        cancelObservation,
        getCurrentObservation,
        getSightLog,
        clearSightLog,
        deleteSight,
        
        // Phase 2: Device Sensors
        initDeviceSensors,
        getDeviceAltitude,
        stopDeviceSensors,
        
        // Phase 2: Rendering
        renderObservationWidget,
        renderCorrectionBreakdown,
        renderSightLogWidget,
        renderCorrectionSettingsWidget,
        
        // Phase 3: Sight Reduction
        sightReduction,
        calculateIntercept,
        generateLOP,
        reduceSight,
        reduceAllSights,
        
        // Phase 3: LOP Management
        storeLOP,
        getLOPs,
        clearLOPs,
        deleteLOP,
        calculateLOPIntersection,
        
        // Phase 3: Rendering
        renderSightReduction,
        renderLOPsList,
        renderSightReductionWidget,
        renderLOPOnMap,
        
        // Phase 4: Emergency Position Fix
        calculateNoonSightLatitude,
        calculateMeridianPassage,
        processNoonSight,
        calculatePolarisLatitude,
        calculateLongitudeFromNoon,
        calculateRunningFix,
        calculateAMPMFix,
        
        // Phase 4: Rendering
        renderNoonSightWidget,
        renderPolarisWidget,
        renderEmergencyFixResult,
        renderEmergencyNavWidget,
        renderRunningFixWidget,
        
        // Phase 5: Celestial Tools
        generateStarChart,
        altAzToChartXY,
        renderStarChartCanvas,
        calculateSunCompass,
        calculatePolarisFinder,
        calculateSouthernCrossFinder,
        calculateMoonNavigation,
        
        // Phase 5: Rendering
        renderStarChartWidget,
        renderSunCompassWidget,
        renderPolarisFinderWidget,
        renderMoonNavigationWidget,
        renderCelestialToolsWidget,
        
        // Phase 6: Dead Reckoning
        initializeDR,
        updateCourseSpeed,
        calculateDRPosition,
        getCurrentDRPosition,
        updateFixFromCelestial,
        calculateSetAndDrift,
        calculateEstimatedPosition,
        advanceLOP,
        getDRLog,
        clearDR,
        getDRState,
        calculateCourseDistance,
        calculateRequiredSpeed,
        calculateETA,
        
        // Phase 6: Rendering
        renderDRStatusWidget,
        renderDRInputWidget,
        renderDRPlot,
        renderNavigationPlanWidget,
        renderETAResult,
        
        // Phase 7: Training Mode - Primitive Methods
        calculateShadowStick,
        calculateSolarNoon,
        calculateLongitudeFromSolarNoon,
        calculateWatchMethod,
        calculateStarTime,
        calculateLatitudeFromHand,
        calculateKamal,
        calculateEqualAltitudeNoon,
        calculateHorizonDistance,
        
        // Phase 7: Rendering
        renderShadowStickWidget,
        renderSolarNoonWidget,
        renderWatchMethodWidget,
        renderHandMeasurementWidget,
        renderTrainingModeWidget,
        renderHorizonDistanceWidget,
        renderHandLatitudeResult,
        renderHorizonDistanceResult,
        
        // Phase 8: Inertial Navigation / PDR
        checkSensorAvailability,
        requestSensorPermission,
        initInertialNav,
        startInertialTracking,
        stopInertialTracking,
        getInertialState,
        calibrateStepLength,
        calibrateGyroBias,
        updateInertialFix,
        performZUPT,
        resetInertialNav,
        getInertialTrack,
        getPositionUncertainty,
        
        // Phase 8: Rendering
        renderInertialStatusWidget,
        renderInertialCalibrationWidget,
        renderInertialTrack,
        renderInertialNavWidget,
        
        // Constants
        NAVIGATION_STARS,
        PLANET_ELEMENTS,
        CONSTELLATION_LINES
    };
})();

window.CelestialModule = CelestialModule;
