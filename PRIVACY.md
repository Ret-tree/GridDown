# Privacy Policy

**GridDown by BlackDot Technology**

Last updated: January 2026

## Summary

GridDown is designed with privacy as a core principle. We collect no personal data, require no accounts, and operate primarily offline.

## Data Collection

**We do not collect:**
- Personal information
- Location data
- Usage analytics
- Cookies or tracking data

## Data Storage

All data you create in GridDown (waypoints, routes, settings, received SSTV images) is stored **locally on your device** using your browser's IndexedDB storage. This data:

- Never leaves your device unless you explicitly export it
- Is not accessible to BlackDot Technology
- Is not synced to any cloud service
- Can be deleted at any time by clearing your browser data

## Device Permissions

GridDown may request the following device permissions. All are optional and only used when you initiate the relevant feature:

| Permission | Feature | Purpose |
|------------|---------|---------|
| **Location** | GPS tracking, navigation | Show your position on map, calculate distances |
| **Microphone** | SSTV receive | Decode SSTV audio signals from radio |
| **Camera** | SSTV transmit | Capture photos for SSTV transmission |
| **Bluetooth** | APRS, Meshtastic, RadiaCode | Connect to external radio/sensor devices |
| **Serial Port** | TNC devices | Connect to serial APRS equipment |

**Important**: 
- Audio from your microphone is processed **locally** for SSTV decoding and is never transmitted over the internet
- Camera images are stored **locally** and only transmitted as SSTV audio through your radio when you explicitly click "Transmit"
- No audio, images, or device data is sent to BlackDot Technology or any third party

## External Services

GridDown connects to the following external services **only when you have internet connectivity**:

| Service | Purpose | Data Sent |
|---------|---------|-----------|
| Map tile providers (OSM, USGS, Esri) | Display map imagery | Tile coordinates only |
| NASA GIBS | Satellite imagery overlays | Tile coordinates only |
| Iowa Environmental Mesonet | NEXRAD radar imagery | Tile coordinates only |
| Open-Meteo | Weather forecasts | Coordinates for forecast location |
| Nominatim | Location search | Search query text |
| USGS Water Services | Stream gauge data | Gauge station IDs |
| Google Fonts | Typography | Standard font requests |

No personal information is sent to these services.

## Offline Operation

When operating offline:
- No network requests are made
- All functionality uses locally cached data
- No data is transmitted anywhere

## Hardware Connections

When you connect devices (RadiaCode, Meshtastic, APRS TNC):
- Connections are direct via Web Bluetooth or Web Serial
- Data stays between your device and the connected hardware
- No data is sent to BlackDot Technology or any third party

## RF Sentinel

If you use RF Sentinel integration:
- Connections are made to your own local RF Sentinel hardware
- Data flows directly between GridDown and your RF Sentinel instance
- No data passes through BlackDot Technology servers

## SSTV (Slow Scan Television)

When using SSTV features:
- **Receiving**: Audio from your microphone is decoded locally into images
- **Transmitting**: Images are encoded locally into audio tones played through your speaker
- **Storage**: Received images are stored in your browser's local storage
- **No cloud processing**: All encoding, decoding, and AI enhancement runs entirely on your device
- **Amateur radio compliance**: You are responsible for ensuring proper licensing and identification when transmitting

## Export & Sharing

When you export plans or data:
- Exported files are created locally on your device
- Optional encryption uses AES-256-GCM (passphrase never transmitted)
- Sharing is peer-to-peer; we have no access to shared files

## Your Rights

You can:
- Use GridDown without providing any personal information
- Delete all stored data by clearing your browser's site data
- Operate completely offline after initial setup
- Export all your data at any time
- Revoke device permissions at any time through browser settings

## Children's Privacy

GridDown does not knowingly collect information from children under 13. The application does not require or request any personal information.

## Changes to This Policy

We may update this policy as features are added. Significant changes will be noted in the changelog.

## Contact

Questions about this privacy policy can be directed to:

**BlackDot Technology**

---

*GridDown is dual-licensed software. See [LICENSE](LICENSE) for details.*
