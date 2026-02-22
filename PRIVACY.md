# Privacy Policy

**GridDown by BlackAtlas LLC**

Last updated: February 2025

---

## Summary

GridDown is designed with **privacy as a core principle**. We:

- ✅ Collect **no personal data**
- ✅ Require **no accounts or registration**
- ✅ Operate **primarily offline**
- ✅ Store all data **locally on your device**
- ✅ Have **no analytics or tracking**
- ✅ Run **no backend servers**

**Your data stays on your device. Period.**

---

## Data Collection

### What We Do NOT Collect

BlackAtlas LLC does not collect:

| Data Type | Collected? |
|-----------|------------|
| Personal information (name, email, etc.) | ❌ No |
| Location/GPS data | ❌ No |
| Usage analytics | ❌ No |
| Crash reports | ❌ No |
| Cookies or tracking data | ❌ No |
| Device identifiers | ❌ No |
| IP addresses | ❌ No |
| Browsing history | ❌ No |

### What Stays on Your Device

All data you create or interact with in GridDown is stored **locally** on your device:

| Data Type | Storage Location |
|-----------|------------------|
| Waypoints and routes | IndexedDB (browser) |
| Settings and preferences | localStorage (browser) |
| Search history and favorites | localStorage (browser) |
| Offline map tiles | Cache API (browser) |
| SSTV images | IndexedDB (browser) |
| Radiation tracks | IndexedDB (browser) |
| Team/comm plans | IndexedDB (browser) |

This data:
- Never leaves your device unless you explicitly export it
- Is not accessible to BlackAtlas LLC
- Is not synced to any cloud service
- Can be deleted at any time by clearing browser site data

---

## Device Permissions

GridDown may request device permissions. **All are optional** and only activated when you use the relevant feature:

### Location (GPS)

| Feature | Purpose |
|---------|---------|
| Map centering | Show your position on the map |
| Navigation | Calculate distance and bearing |
| Weather | Get forecast for your location |
| Air quality | Get AQI for your location |
| Waypoint creation | Save current position |

**Your location is never transmitted to BlackAtlas LLC.** It may be sent to third-party APIs (weather, AQI) as coordinates only—see External Services below.

### Microphone

| Feature | Purpose |
|---------|---------|
| SSTV Receive | Decode SSTV audio from radio |

**Audio is processed entirely on your device.** It is never recorded, stored long-term, or transmitted over the internet.

### Camera

| Feature | Purpose |
|---------|---------|
| SSTV Transmit | Capture photos for radio transmission |
| Star Identification | Point at sky to identify stars |
| Camera Sextant | Measure celestial body altitude |

**Images are stored locally** and only transmitted as audio tones through your radio speaker when you explicitly initiate transmission.

### Bluetooth

| Feature | Purpose |
|---------|---------|
| RadiaCode | Connect to radiation detector |
| Meshtastic | Connect to mesh radio device |
| APRS | Connect to TNC/radio |

**Connections are direct** between your device and the hardware. No data passes through any server.

### Serial Port (USB)

| Feature | Purpose |
|---------|---------|
| APRS TNC | Connect to serial radio equipment |
| AtlasRF | Connect to SDR hardware |

**Connections are local** USB connections to your own hardware.

### Motion Sensors

| Feature | Purpose |
|---------|---------|
| Compass | Determine device heading |
| Inertial Navigation | Dead reckoning when GPS unavailable |

**Sensor data is processed locally** for navigation calculations. It is never stored long-term or transmitted.

### Vibration

| Feature | Purpose |
|---------|---------|
| Haptic Feedback | Tactile response for buttons and alerts |
| Navigation Alerts | Vibration for turn notifications |

**Vibration is a local device function** with no data transmission.

---

## External Services

GridDown connects to third-party services **only when you have internet connectivity** and use features that require external data.

### Map Tile Providers

| Provider | Data Sent | Purpose |
|----------|-----------|---------|
| OpenStreetMap | Tile coordinates | Street maps |
| USGS National Map | Tile coordinates | Topographic maps |
| USFS | Tile coordinates | Forest service maps |
| Esri | Tile coordinates | Satellite imagery |
| OpenTopoMap | Tile coordinates | Topographic overlay |
| NASA GIBS | Tile coordinates | Satellite imagery |

**Only tile coordinates are sent** (e.g., zoom level, x, y). No personal information is transmitted.

### Weather and Environmental

| Service | Data Sent | Purpose |
|---------|-----------|---------|
| Open-Meteo | Coordinates | Weather forecast |
| Iowa Environmental Mesonet | Tile coordinates | NEXRAD radar |
| EPA AirNow | Coordinates, API key | Air quality index |
| USGS Water Services | Gauge station IDs | Stream water levels |

**Coordinates are sent** to get localized data. No other personal information is included.

### Search and Geocoding

| Service | Data Sent | Purpose |
|---------|-----------|---------|
| OpenStreetMap Nominatim | Search query text | Location search |

**Only your search query** is sent. No device or user identifiers are included.

### No Data Sent To

- BlackAtlas LLC servers (we have none)
- Analytics services
- Advertising networks
- Social media platforms
- Any data brokers

---

## Offline Operation

When operating offline, GridDown:

- Makes **no network requests**
- Uses **locally cached** map tiles and data
- Processes all features **on-device**
- Transmits **nothing** over the internet

**GridDown is designed to work fully offline** after initial setup and map downloading.

---

## Feature-Specific Privacy Details

### Global Search (Ctrl+K)

- Search history stored **locally** in localStorage
- Favorites stored **locally** in localStorage
- **No search queries sent to any server**
- Landmark database is **bundled with app** (no network lookup)

### Situation Wizard (F1)

- Decision tree processed **entirely locally**
- **No data collection or transmission**
- No analytics on wizard usage

### Mobile Features

| Feature | Privacy Impact |
|---------|----------------|
| Battery Status | Local API only—not transmitted |
| Connection Status | Local API only—not transmitted |
| PWA Install | Standard browser PWA—no tracking |
| Haptic Feedback | Local vibration—no data |

### SSTV (Slow Scan Television)

- **Receiving**: Audio decoded locally into images
- **Transmitting**: Images encoded locally to audio tones
- **AI Enhancement**: Runs entirely on your device (WebGPU/WASM)
- **Storage**: Images saved in browser IndexedDB
- **No cloud processing**: Everything runs locally

### RadiaCode Integration

- **Direct Bluetooth connection** to your detector
- Radiation readings processed and stored **locally**
- Track exports are **local files** you control
- **No data sent to any server**

### AtlasRF Integration

- Connects to **your own local** AtlasRF hardware
- Data flows between GridDown and your AtlasRF only
- **No data passes through BlackAtlas LLC**

### Celestial Navigation

- Star calculations run **locally** using bundled algorithms
- Camera star identification processed **on-device**
- **No images or observations transmitted**

### Meshtastic / APRS

*APRS® is a registered trademark of Bob Bruninga, WB4APR (SK).*

- Connect directly to **your hardware**
- Messages sent over **your radio network**
- GridDown does not relay or store network traffic
- **You control your radio communications**

### CoT Bridge (Cursor on Target)

**IMPORTANT: Position Sharing Disclosure**

The CoT Bridge feature enables bidirectional communication with CoT-compatible tactical applications (such as ATAK or WinTAK). When you enable **position sharing**:

| Data Shared | When | To Whom |
|-------------|------|---------|
| GPS coordinates | When sharing is active | All devices on the CoT network |
| Callsign | When sharing is active | All devices on the CoT network |
| Team color | When sharing is active | All devices on the CoT network |
| Speed/heading | When sharing is active | All devices on the CoT network |

**Key Privacy Considerations:**

1. **Explicit Consent Required**: Position sharing is disabled by default. You must explicitly consent and enable it.

2. **Local Network Only**: Data is transmitted via UDP multicast on your local network (typically WiFi). It does not traverse the internet unless you configure your network to relay it.

3. **No Server Involvement**: BlackAtlas LLC does not receive, store, or process any CoT data. All communication is peer-to-peer on your local network.

4. **You Control Transmission**: 
   - Sharing is off by default
   - You must consent before enabling
   - You can stop sharing at any time
   - You can revoke consent at any time

5. **Visibility Warning**: When sharing is enabled, your position is visible to **all devices** on the CoT multicast network. This may include devices you don't control.

**To disable position sharing:**
- Click "Stop Sharing" in the CoT Bridge panel
- Or click "Revoke sharing consent"
- Or disconnect from the CoT Bridge
- Sharing automatically stops when you close GridDown

**The CoT Bridge does NOT:**
- Send data to BlackAtlas LLC
- Send data over the internet (unless you configure routing)
- Store your position history on any server
- Share data with any third party

---

## Hardware Connections

When you connect external devices:

| Connection Type | Privacy Model |
|-----------------|---------------|
| Web Bluetooth | Direct device-to-device |
| Web Serial | Direct USB connection |
| WebSocket (AtlasRF) | Local network to your hardware |

**No hardware data is transmitted to BlackAtlas LLC or any third party.**

---

## Data Export and Sharing

### Exporting Your Data

- Exported files (GPX, KML, JSON) are created **locally**
- Files are saved to **your device**
- You control where exports go

### Encrypted Plan Sharing

- Uses **AES-256-GCM** encryption
- Passphrase **never transmitted**—stays on your device
- Sharing is **peer-to-peer** (you share the file directly)
- BlackAtlas LLC has **no access** to shared files

### What You Can Export

- All waypoints and routes
- Settings and preferences
- Radiation tracks
- Team/communication plans
- SSTV image gallery

---

## Your Privacy Rights

You have complete control over your data:

| Right | How to Exercise |
|-------|-----------------|
| **Access your data** | View in app or export |
| **Delete your data** | Clear browser site data |
| **Export your data** | Use export features |
| **Operate offline** | Download maps, disable network |
| **Revoke permissions** | Browser settings → Site permissions |
| **Use anonymously** | No account required |

### Deleting All Data

To completely remove all GridDown data:

1. **Browser Settings** → Privacy/Security
2. **Clear browsing data** or **Clear site data**
3. Select the GridDown site/origin
4. Clear storage (IndexedDB, localStorage, Cache)

Or use: **Settings** → **Clear All Data** within GridDown

---

## Children's Privacy

GridDown:
- Does not knowingly collect information from children under 13
- Does not require any personal information
- Does not have age verification (none needed)
- Is suitable for all ages as a navigation/planning tool

---

## International Users

GridDown operates the same way globally:

- **No data leaves your device** to our servers (we have none)
- **Third-party APIs** may have their own privacy policies
- **GDPR/CCPA compliance**: We collect no personal data to regulate
- **Data residency**: Your data stays on your device in your jurisdiction

---

## Changes to This Policy

We may update this policy as features are added. Changes will be:

- Documented in the [CHANGELOG](CHANGELOG.md)
- Reflected in the "Last updated" date above
- Available for review in the source repository

**Continued use after changes constitutes acceptance.**

---

## Third-Party Privacy Policies

For external services GridDown connects to, see their privacy policies:

| Service | Privacy Policy |
|---------|----------------|
| OpenStreetMap | https://wiki.osmfoundation.org/wiki/Privacy_Policy |
| Esri | https://www.esri.com/en-us/privacy/overview |
| Open-Meteo | https://open-meteo.com/en/terms |
| EPA AirNow | https://www.epa.gov/privacy |
| USGS | https://www.usgs.gov/privacy-policy |
| NASA | https://www.nasa.gov/privacy/ |

---

## Contact

Questions about this privacy policy:

**BlackAtlas LLC**
- **Privacy Inquiries**: privacy@blackdot.tech
- **General Contact**: info@blackdot.tech

---

## Related Documents

- [Terms of Service](TERMS_OF_SERVICE.md) - Usage terms
- [Disclaimer](DISCLAIMER.md) - Safety information
- [Security Policy](SECURITY.md) - Vulnerability reporting
- [License](LICENSE) - Software licensing

---

**© 2025 BlackAtlas LLC. All Rights Reserved.**

*GridDown is dual-licensed software. See [LICENSE](LICENSE) for details.*
