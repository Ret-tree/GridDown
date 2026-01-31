# Data Source Attributions & Licensing

**GridDown by BlackDot Technology**

Last updated: January 2025

This document lists all external data sources used by GridDown, their licensing terms, and attribution requirements.

---

## Summary

| Source | License | Commercial Use | Attribution Required |
|--------|---------|----------------|---------------------|
| OpenStreetMap | ODbL 1.0 | ✅ Yes | ✅ Yes |
| OpenTopoMap | CC-BY-SA 3.0 | ✅ Yes | ✅ Yes |
| USGS National Map | Public Domain | ✅ Yes | Requested |
| USFS Topo | Public Domain | ✅ Yes | Requested |
| NASA GIBS | Public Domain | ✅ Yes | ✅ Yes |
| NOAA NEXRAD (via IEM) | Public Domain | ✅ Yes | Requested |
| EPA AirNow | Public Domain | ✅ Yes | ✅ Yes |
| Open-Meteo | CC BY 4.0 | ✅ Yes | ✅ Yes |
| Nominatim/OSM | ODbL 1.0 | ✅ Yes | ✅ Yes |
| USGS Water Services | Public Domain | ✅ Yes | Requested |
| Esri Basemaps | Esri ToS | ⚠️ Non-commercial only | ✅ Yes |
| APRS Protocol | Trademark | ✅ Yes | ✅ Yes |

---

## Map Tile Providers

### OpenStreetMap (OSM)

**License**: Open Database License (ODbL) 1.0  
**URL**: https://www.openstreetmap.org/copyright  
**Commercial Use**: ✅ Permitted with attribution  

**Required Attribution**:
```
© OpenStreetMap contributors
```

**Terms Summary**:
- Free to use, copy, distribute, and adapt
- Must attribute OpenStreetMap and its contributors
- Share-alike: derivative databases must use ODbL
- Produced work (maps/images) can use any license

---

### OpenTopoMap

**License**: CC-BY-SA 3.0 (map tiles), ODbL (data)  
**URL**: https://opentopomap.org/about  
**Commercial Use**: ✅ Permitted with attribution  

**Required Attribution**:
```
© OpenTopoMap (CC-BY-SA)
```

**Terms Summary**:
- Map style is CC-BY-SA, data is from OSM (ODbL)
- Must attribute both OpenTopoMap and OpenStreetMap
- Share-alike applies to derivative works

---

### USGS National Map

**License**: Public Domain (US Government Work)  
**URL**: https://www.usgs.gov/faqs/what-are-terms-uselicensing-map-services-and-data-national-map  
**Commercial Use**: ✅ Permitted  

**Requested Attribution**:
```
© USGS The National Map
```

**Terms Summary**:
- US Government works are not subject to copyright
- No restrictions on use, modification, or redistribution
- Attribution requested but not legally required

**Layers**:
- USGS Topo
- USGS Imagery
- USGS Imagery Topo
- USGS Shaded Relief

---

### USFS Topo (US Forest Service)

**License**: Public Domain (US Government Work)  
**URL**: https://www.fs.usda.gov/  
**Commercial Use**: ✅ Permitted  

**Requested Attribution**:
```
© US Forest Service
```

---

### Esri Basemaps

**License**: Esri Terms of Use  
**URL**: https://www.esri.com/en-us/legal/terms/web-site-service  
**Commercial Use**: ⚠️ Non-commercial only (without paid license)  

**Required Attribution**:
```
© Esri, [Data Providers]
Powered by Esri
```

**Terms Summary**:
- Free for personal, educational, and non-commercial use
- Commercial use requires a paid Esri license
- Attribution to Esri and data providers required
- Esri reserves right to determine commercial vs non-commercial

**Layers Affected**:
- Esri World Imagery (Satellite)
- Esri World Ocean Base
- Esri World Terrain Base
- Esri Light/Dark Gray Canvas
- National Geographic World Map

**⚠️ IMPORTANT**: For commercial distribution of GridDown (e.g., selling pre-loaded tablets), either remove Esri layers or obtain a commercial license from Esri.

---

## Satellite & Weather Imagery

### NASA GIBS (Global Imagery Browse Services)

**License**: Public Domain (US Government Work)  
**URL**: https://earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs  
**Commercial Use**: ✅ Permitted  

**Required Attribution**:
```
We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS).
```

**Short Attribution** (for map display):
```
NASA GIBS / NOAA
```

**Terms Summary**:
- Free and open access
- No authentication required
- Attribution requested
- Products include VIIRS, MODIS, and other satellite imagery

**Layers**:
- VIIRS True Color (Suomi NPP)
- MODIS Terra Corrected Reflectance
- MODIS Aqua Corrected Reflectance

---

### NOAA NEXRAD Radar (via Iowa Environmental Mesonet)

**License**: Public Domain (US Government Work)  
**URL**: https://mesonet.agron.iastate.edu/  
**Commercial Use**: ✅ Permitted  

**Requested Attribution**:
```
© Iowa Environmental Mesonet, NOAA NWS
```

**Terms Summary**:
- NEXRAD data is US Government public domain
- IEM provides free tile service
- No authentication required
- Attribution requested

---

## Weather & Environmental Data

### EPA AirNow (Air Quality Index)

**License**: Public Domain (US Government Work)  
**URL**: https://docs.airnowapi.org/  
**Commercial Use**: ✅ Permitted  

**Required Attribution**:
```
Air quality data provided by the U.S. EPA AirNow program and participating 
federal, state, local, and tribal air quality agencies.
Data is preliminary and subject to change.
```

**Terms Summary** (from EPA Data Use Guidelines):
- Data is public domain (US Government work)
- Commercial use permitted
- Attribution required to EPA and participating agencies
- Data should not be altered
- Must indicate data is preliminary when displayed
- Register for free API key at https://docs.airnowapi.org/account/request/

**Data Provided**:
- Real-time Air Quality Index (AQI)
- Pollutant-specific readings (PM2.5, PM10, O3, CO, NO2, SO2)
- Coverage: United States, Canada, Mexico

**Notes**:
- API key required (free registration)
- Updates hourly
- Users outside coverage area see graceful fallback message

---

### Open-Meteo

**License**: CC BY 4.0  
**URL**: https://open-meteo.com/en/terms  
**Commercial Use**: ✅ Permitted with attribution  

**Required Attribution**:
```
Weather data by Open-Meteo.com
```

**Terms Summary**:
- Free for non-commercial use
- Commercial use permitted with attribution
- API data sourced from national weather services
- Rate limits apply

**Data Provided**:
- Weather forecasts
- Historical weather data
- Elevation data

---

### USGS Water Services (Stream Gauges)

**License**: Public Domain (US Government Work)  
**URL**: https://waterservices.usgs.gov/  
**Commercial Use**: ✅ Permitted  

**Requested Attribution**:
```
Data provided by USGS National Water Information System
```

**Terms Summary**:
- US Government works are public domain
- No restrictions on use
- Real-time and historical streamflow data

---

## Geocoding & Search

### OpenStreetMap Nominatim

**License**: ODbL 1.0 (data), terms of use apply to service  
**URL**: https://operations.osmfoundation.org/policies/nominatim/  
**Commercial Use**: ✅ Permitted with restrictions  

**Required Attribution**:
```
Search powered by OpenStreetMap Nominatim
© OpenStreetMap contributors
```

**Terms Summary**:
- Results are ODbL licensed (same as OSM)
- Bulk geocoding requires own Nominatim instance
- Rate limiting: max 1 request/second
- Must provide valid User-Agent
- Caching results is permitted and encouraged

---

## Third-Party Libraries

### APRS (Automatic Packet Reporting System)

**Copyright**: Bob Bruninga, WB4APR (SK)  
**Contact**: wb4apr@amsat.org  
**Organization**: TAPR (Tucson Amateur Packet Radio Corporation)  
**URL**: http://www.aprs.org/  

**Attribution**:
```
APRS is a registered trademark of APRS Software and Bob Bruninga, WB4APR.
Automatic Packet Reporting System (APRS) Copyright © Bob Bruninga WB4APR (SK).
```

**Terms Summary**:
- APRS is an amateur radio-based system for real-time communication
- The APRS protocol and trademark are the property of Bob Bruninga's estate
- GridDown's APRS integration is for amateur radio operators with valid licenses
- Users must comply with all amateur radio regulations when using APRS features

**Note**: Bob Bruninga, WB4APR, the inventor of APRS, became a Silent Key (SK) on February 7, 2022. His contributions to amateur radio and the APRS community are gratefully acknowledged.

---

### RadiaCode BLE Protocol

**License**: MIT  
**Sources**: 
- https://github.com/cdump/radiacode
- https://github.com/mkgeiger/RadiaCode

**Attribution**:
```
RadiaCode BLE protocol implementation based on work by cdump and mkgeiger (MIT License)
```

---

### MQTT.js

**License**: MIT  
**URL**: https://github.com/mqttjs/MQTT.js  

---

## Fonts

### Google Fonts

**License**: Various open source licenses (typically OFL or Apache 2.0)  
**URL**: https://fonts.google.com/  
**Commercial Use**: ✅ Permitted  

---

## Commercial Distribution Checklist

If you plan to distribute GridDown commercially (e.g., pre-installed on devices for sale), ensure:

1. ✅ **OpenStreetMap**: Include attribution
2. ✅ **OpenTopoMap**: Include attribution
3. ✅ **USGS/USFS**: No restrictions (attribution appreciated)
4. ✅ **NASA GIBS**: Include attribution
5. ✅ **NEXRAD/IEM**: No restrictions (attribution appreciated)
6. ✅ **EPA AirNow**: Include attribution and preliminary data disclaimer
7. ✅ **Open-Meteo**: Include attribution
8. ✅ **APRS**: Include trademark attribution to Bob Bruninga, WB4APR
9. ⚠️ **Esri Basemaps**: Either remove from commercial builds OR obtain Esri commercial license

---

## How Attribution is Displayed

GridDown displays data source attributions in:

1. **Map View**: Bottom attribution bar shows current tile provider
2. **Weather Panel**: Source attribution in footer
3. **About/Settings**: Full attribution list
4. **This Document**: Complete licensing details

---

## Contact

For questions about data licensing or attribution:

- **Esri Licensing**: https://www.esri.com/en-us/legal/terms/licensing
- **NASA GIBS**: support@earthdata.nasa.gov
- **OpenStreetMap**: https://wiki.openstreetmap.org/wiki/Contact

**GridDown Licensing**: licensing@blackdot.tech

---

**© 2025 BlackDot Technology. All Rights Reserved.**

*GridDown is dual-licensed software. See [LICENSE](LICENSE) for details.*
