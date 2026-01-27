# RF Line-of-Sight Tool Specification

## Overview

The RF Line-of-Sight (LOS) Tool enables users to analyze radio communication paths between two points, determining whether direct line-of-sight exists and evaluating Fresnel zone clearance for optimal radio propagation. This feature directly supports GridDown's tactical communications capabilities (Meshtastic, APRS) by helping users plan reliable radio links.

## Commercial Licensing Analysis

### ✅ NO LICENSING ISSUES - All Components Free for Commercial Use

| Component | Source | License | Status |
|-----------|--------|---------|--------|
| **Elevation Data** | Open-Meteo API (Copernicus DEM GLO-90) | Free license, requires DOI citation | ✅ Already in use by GridDown |
| **Fresnel Zone Formula** | Physics/Mathematics | No license (mathematical formula) | ✅ Public domain |
| **Earth Curvature** | Physics/Mathematics | No license (mathematical formula) | ✅ Public domain |
| **Free-Space Path Loss** | Friis Transmission Equation | No license (published formula) | ✅ Public domain |
| **Longley-Rice/ITM Model** | NTIA (US Government) | Public domain with attribution | ✅ Free for any use |

### Data Source Details

**Elevation (Already Integrated)**
- GridDown uses: `https://api.open-meteo.com/v1/elevation`
- Based on: Copernicus DEM 2021 GLO-90 (90m resolution)
- License: Free worldwide, citation requested
- Citation: `https://doi.org/10.5270/ESA-c5d3d65`

**Propagation Algorithms**
- All formulas are published physics/engineering equations
- No proprietary code or GPL-licensed software required
- We implement from first principles, not from SPLAT! or other GPL tools

---

## Feature Specification

### 1. User Interface

#### 1.1 Access Points
- **Weather Panel** → New "RF Link Analysis" section
- **Map Context Menu** → "Analyze RF Path To Here" (after selecting first point)
- **Keyboard Shortcut** → `Ctrl+L` to toggle LOS drawing mode

#### 1.2 Point Selection
```
Method 1: Click-to-click
- Click first point on map → marker appears
- Click second point → path drawn, analysis runs

Method 2: Coordinate entry
- Manual lat/lon input for precise positioning
- Support for MGRS, UTM, decimal degrees

Method 3: Use existing markers
- Select from waypoints, team positions, or POIs
```

#### 1.3 Analysis Panel UI
```
┌─────────────────────────────────────────────┐
│ 📡 RF Path Analysis                      [×]│
├─────────────────────────────────────────────┤
│ Point A: 39.7392° N, 104.9903° W           │
│ Elevation: 1,609 m (5,280 ft)              │
│ Antenna Height: [10] m                      │
├─────────────────────────────────────────────┤
│ Point B: 39.8561° N, 104.6737° W           │
│ Elevation: 1,724 m (5,656 ft)              │
│ Antenna Height: [10] m                      │
├─────────────────────────────────────────────┤
│ Distance: 32.4 km (20.1 mi)                │
│ Bearing: 67° (ENE)                         │
├─────────────────────────────────────────────┤
│ Frequency: [915] MHz  [Meshtastic ▾]       │
├─────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────┐ │
│ │     Elevation Profile with Fresnel     │ │
│ │  ▄▄▄▄▄▄                                │ │
│ │ █████████▄▄▄▄▄▄▄▄▄▄▄▄▄▄               │ │
│ │ A────────────────────────────────────B │ │
│ └─────────────────────────────────────────┘ │
├─────────────────────────────────────────────┤
│ Status: ✅ CLEAR - 60% Fresnel clearance   │
│                                             │
│ Fresnel Zone Radius: 18.3 m at midpoint    │
│ Minimum Clearance: 11.0 m (60%)            │
│ Obstruction: None detected                 │
│                                             │
│ Free-Space Path Loss: 112.4 dB             │
│ Estimated Range: Good for 1W @ -120dBm     │
├─────────────────────────────────────────────┤
│ [Swap A↔B] [Save Path] [Export] [Clear]    │
└─────────────────────────────────────────────┘
```

#### 1.4 Visual Indicators on Map
- **Green line**: Clear LOS with >60% Fresnel clearance
- **Yellow line**: Marginal LOS (40-60% Fresnel clearance)
- **Red line**: Obstructed (LOS blocked or <40% clearance)
- **Dashed ellipse**: Fresnel zone visualization (optional toggle)
- **Red markers**: Obstruction points along path

---

### 2. Technical Implementation

#### 2.1 Core Algorithms

**Earth Curvature Correction**
```javascript
// Earth radius with 4/3 refraction factor for radio waves
const EARTH_RADIUS_M = 6371000;
const K_FACTOR = 4/3;  // Standard atmospheric refraction
const EFFECTIVE_RADIUS = EARTH_RADIUS_M * K_FACTOR;

function earthCurvatureDrop(distanceM) {
    // Drop in meters due to earth curvature at given distance
    return (distanceM * distanceM) / (2 * EFFECTIVE_RADIUS);
}
```

**Fresnel Zone Calculation**
```javascript
function fresnelRadius(distanceToPointM, totalDistanceM, frequencyMHz) {
    // First Fresnel zone radius at a point along the path
    // Formula: r = sqrt((n * λ * d1 * d2) / (d1 + d2))
    // where n=1 for first Fresnel zone, λ = c/f
    
    const wavelengthM = 299.792458 / frequencyMHz;  // c in m/s ÷ MHz
    const d1 = distanceToPointM;
    const d2 = totalDistanceM - distanceToPointM;
    
    if (d1 <= 0 || d2 <= 0) return 0;
    
    return Math.sqrt((wavelengthM * d1 * d2) / totalDistanceM);
}
```

**Free-Space Path Loss**
```javascript
function freeSpacePathLoss(distanceKm, frequencyMHz) {
    // FSPL (dB) = 20*log10(d) + 20*log10(f) + 32.44
    // where d is in km and f is in MHz
    return 20 * Math.log10(distanceKm) + 
           20 * Math.log10(frequencyMHz) + 32.44;
}
```

**LOS Analysis Core**
```javascript
async function analyzeLOSPath(pointA, pointB, antennaHeightA, antennaHeightB, frequencyMHz) {
    // 1. Calculate great-circle distance and bearing
    const distance = haversineDistance(pointA, pointB);
    const bearing = calculateBearing(pointA, pointB);
    
    // 2. Interpolate points along path (every 100m or terrain-dependent)
    const numSamples = Math.max(50, Math.ceil(distance / 100));
    const pathPoints = interpolateGreatCircle(pointA, pointB, numSamples);
    
    // 3. Fetch elevation for all points (batch API call)
    const elevations = await ElevationModule.fetchElevations(pathPoints);
    
    // 4. Calculate LOS line with earth curvature and antenna heights
    const losLine = calculateLOSLine(
        elevations[0] + antennaHeightA,
        elevations[elevations.length - 1] + antennaHeightB,
        distance
    );
    
    // 5. Check each point for Fresnel zone clearance
    let minClearance = Infinity;
    let obstructions = [];
    
    for (let i = 1; i < pathPoints.length - 1; i++) {
        const distFromA = (i / (pathPoints.length - 1)) * distance;
        
        // LOS height at this point (accounting for earth curvature)
        const losHeight = interpolateLOS(losLine, distFromA, distance);
        const curvatureDrop = earthCurvatureDrop(distFromA);
        const effectiveLOS = losHeight - curvatureDrop;
        
        // Terrain height
        const terrainHeight = elevations[i];
        
        // Fresnel radius at this point
        const fresnelR = fresnelRadius(distFromA, distance, frequencyMHz);
        
        // Required clearance (60% of first Fresnel zone is ideal)
        const requiredClearance = fresnelR * 0.6;
        
        // Actual clearance
        const actualClearance = effectiveLOS - terrainHeight;
        
        // Track minimum and obstructions
        const clearancePercent = (actualClearance / fresnelR) * 100;
        if (clearancePercent < minClearance) {
            minClearance = clearancePercent;
        }
        
        if (actualClearance < 0) {
            obstructions.push({
                point: pathPoints[i],
                distance: distFromA,
                penetration: -actualClearance,
                elevation: terrainHeight
            });
        }
    }
    
    // 6. Calculate path loss
    const fspl = freeSpacePathLoss(distance / 1000, frequencyMHz);
    
    return {
        distance,
        bearing,
        elevationProfile: elevations.map((e, i) => ({
            distance: (i / (elevations.length - 1)) * distance,
            elevation: e,
            point: pathPoints[i]
        })),
        fresnel: {
            frequency: frequencyMHz,
            midpointRadius: fresnelRadius(distance / 2, distance, frequencyMHz),
            minClearancePercent: minClearance
        },
        obstructions,
        pathLoss: {
            freeSpace: fspl,
            estimated: fspl + (obstructions.length > 0 ? 20 : 0)  // Add knife-edge estimate
        },
        status: obstructions.length > 0 ? 'obstructed' : 
                minClearance >= 60 ? 'clear' : 'marginal'
    };
}
```

#### 2.2 Elevation Profile Rendering

Extend existing `ElevationModule` canvas rendering to show:
1. Terrain profile (filled area)
2. LOS line (straight line accounting for earth curvature)
3. Fresnel zone (ellipse around LOS)
4. Obstruction markers (red dots)
5. Clearance annotations

```javascript
function renderLOSProfile(ctx, analysis, width, height) {
    const { elevationProfile, fresnel, obstructions } = analysis;
    const padding = { top: 40, bottom: 60, left: 60, right: 20 };
    
    // ... standard chart setup ...
    
    // Draw Fresnel zone ellipse
    ctx.strokeStyle = 'rgba(255, 165, 0, 0.5)';
    ctx.fillStyle = 'rgba(255, 165, 0, 0.1)';
    ctx.beginPath();
    // Draw upper and lower Fresnel boundaries
    for (let i = 0; i < elevationProfile.length; i++) {
        const x = toX(elevationProfile[i].distance);
        const losY = getLOSY(i);
        const fresnelR = fresnelRadius(
            elevationProfile[i].distance, 
            analysis.distance, 
            fresnel.frequency
        );
        const fresnelPx = fresnelR * yScale;  // Convert to pixels
        
        if (i === 0) ctx.moveTo(x, losY - fresnelPx);
        else ctx.lineTo(x, losY - fresnelPx);
    }
    // Return path for lower boundary...
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Draw LOS line
    ctx.strokeStyle = analysis.status === 'clear' ? '#22c55e' :
                      analysis.status === 'marginal' ? '#eab308' : '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(startElev + antennaA));
    ctx.lineTo(toX(analysis.distance), toY(endElev + antennaB));
    ctx.stroke();
    
    // Mark obstructions
    ctx.fillStyle = '#ef4444';
    for (const obs of obstructions) {
        const x = toX(obs.distance);
        const y = toY(obs.elevation);
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
    }
}
```

---

### 3. Frequency Presets

Built-in presets for common tactical radio frequencies:

```javascript
const FREQUENCY_PRESETS = {
    // Meshtastic LoRa bands
    'meshtastic_us': { freq: 915, name: 'Meshtastic US (915 MHz)' },
    'meshtastic_eu': { freq: 868, name: 'Meshtastic EU (868 MHz)' },
    'meshtastic_jp': { freq: 920, name: 'Meshtastic JP (920 MHz)' },
    
    // Amateur VHF/UHF
    'vhf_2m': { freq: 146, name: '2m Amateur (146 MHz)' },
    'uhf_70cm': { freq: 446, name: '70cm Amateur (446 MHz)' },
    
    // GMRS/FRS
    'gmrs': { freq: 462, name: 'GMRS (462 MHz)' },
    'frs': { freq: 467, name: 'FRS (467 MHz)' },
    
    // MURS
    'murs': { freq: 151, name: 'MURS (151 MHz)' },
    
    // Marine VHF
    'marine_16': { freq: 156.8, name: 'Marine Ch 16 (156.8 MHz)' },
    
    // CB Radio
    'cb': { freq: 27, name: 'CB Radio (27 MHz)' },
    
    // Custom
    'custom': { freq: null, name: 'Custom Frequency' }
};
```

---

### 4. Data Persistence

#### 4.1 Saved Paths
Store analyzed paths in IndexedDB for offline review:

```javascript
const savedPath = {
    id: 'path_12345',
    created: Date.now(),
    name: 'Base to Relay Point Alpha',
    pointA: { lat: 39.7392, lon: -104.9903, antennaHeight: 10 },
    pointB: { lat: 39.8561, lon: -104.6737, antennaHeight: 15 },
    frequency: 915,
    analysis: { /* cached results */ },
    notes: 'Primary link, tested 2024-01-15'
};
```

#### 4.2 Export Formats
- **GPX**: Path as route with waypoints
- **KML**: Includes Fresnel zone visualization
- **JSON**: Full analysis data
- **PNG**: Elevation profile chart

---

### 5. Integration Points

#### 5.1 Meshtastic Module
```javascript
// When connected to Meshtastic device, offer to analyze paths to nodes
MeshtasticModule.onNodeDiscovered((node) => {
    if (node.position) {
        // Show "Analyze Path" option in node info panel
        showAnalyzePathOption(currentPosition, node.position);
    }
});
```

#### 5.2 Team Positions
```javascript
// Analyze communication paths between team members
TeamModule.onPositionUpdate((members) => {
    // Optionally show LOS status between members on map
    if (settings.showTeamLOS) {
        renderTeamLOSOverlay(members);
    }
});
```

#### 5.3 Waypoint/POI Integration
```javascript
// Add "Analyze RF Path" to waypoint context menu
WaypointContextMenu.addOption({
    label: 'Analyze RF Path Here',
    icon: '📡',
    action: (waypoint) => startLOSAnalysis(currentPosition, waypoint)
});
```

---

### 6. Module Structure

```
js/modules/rflos.js
├── Constants
│   ├── EARTH_RADIUS
│   ├── K_FACTOR
│   └── FREQUENCY_PRESETS
├── Core Functions
│   ├── earthCurvatureDrop()
│   ├── fresnelRadius()
│   ├── freeSpacePathLoss()
│   ├── calculateLOSLine()
│   └── analyzeLOSPath()
├── Rendering
│   ├── renderLOSProfile()
│   ├── renderLOSOnMap()
│   └── renderFresnelZone()
├── UI
│   ├── showAnalysisPanel()
│   ├── handlePointSelection()
│   └── renderControls()
├── Persistence
│   ├── savePath()
│   ├── loadPath()
│   └── exportPath()
└── Public API
    ├── init()
    ├── startAnalysis()
    ├── clearAnalysis()
    └── getPresets()
```

---

### 7. Error Handling

```javascript
const LOS_ERRORS = {
    ELEVATION_FETCH_FAILED: 'Could not retrieve elevation data. Check internet connection.',
    POINTS_TOO_CLOSE: 'Points must be at least 100m apart for meaningful analysis.',
    POINTS_TOO_FAR: 'Path exceeds 500km. Analysis may be less accurate at this range.',
    INVALID_FREQUENCY: 'Frequency must be between 1 MHz and 100 GHz.',
    INVALID_ANTENNA_HEIGHT: 'Antenna height must be between 0 and 1000 meters.'
};
```

---

### 8. Performance Considerations

1. **Elevation Caching**: Use existing `ElevationModule` cache
2. **Debounced Recalculation**: When adjusting antenna heights, debounce 300ms
3. **Progressive Rendering**: Show terrain first, then Fresnel overlay
4. **Sample Resolution**: Adaptive sampling (more points in complex terrain)
5. **Offline Support**: Cache analyzed paths; provide degraded mode without live elevation

---

### 9. Future Enhancements (Post-MVP)

1. **Multi-hop Analysis**: Analyze relay chains (A → B → C)
2. **Coverage Maps**: Generate radio coverage from a single point
3. **Atmospheric Conditions**: Temperature/humidity refraction adjustments
4. **Knife-Edge Diffraction**: More accurate obstruction loss estimates
5. **Link Budget Calculator**: Full Tx power → Rx sensitivity analysis
6. **Terrain Clutter**: Vegetation/urban attenuation factors

---

## Implementation Priority

| Phase | Features | Effort |
|-------|----------|--------|
| **MVP** | Point-to-point LOS, Fresnel zone, basic profile chart | 2-3 days |
| **v1.1** | Frequency presets, save/export, map overlay | 1-2 days |
| **v1.2** | Meshtastic/Team integration, multi-hop | 2-3 days |

---

## Attribution Requirements

When displaying results, include:

```
Elevation data: Copernicus DEM GLO-90 © ESA
Propagation model based on published Fresnel zone and FSPL formulas
```

---

## Summary

The RF LOS Tool can be commercially deployed with **zero licensing concerns**:
- Elevation data from Copernicus (free license)  
- All algorithms are published physics formulas
- No GPL or proprietary code dependencies
- Original implementation, not derived from SPLAT! or other tools

This feature fills a significant gap in tactical mapping applications and directly supports GridDown's core mission of infrastructure-independent communications planning.
