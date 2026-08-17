# Configuration

## Core Options

| Option | Description | Default |
| --- | --- | --- |
| `apiUrl` | PhotoPrism base URL. | `http://localhost:2342` |
| `apiKey` | PhotoPrism API key. | `""` |
| `albumId` | Album ID to draw images from. | `""` |
| `updateInterval` | How often the displayed image changes, in milliseconds. Picking the next image reuses the cached album listing and costs no HTTP request. | `300000` |
| `albumIndexTtl` | How long the node helper reuses a cached album listing before re-listing the album. | `3600000` |
| `backgroundRefresh` | Keep rotating images while the module is hidden (e.g. under MMM-Carousel), so a fresh image is ready the moment it becomes visible. | `true` |
| `quietHours` | Optional window without any polling, e.g. `{ from: "23:00", to: "06:00" }`. | `null` |
| `fadeSpeed` | Fade duration in milliseconds. | `1000` |
| `maxWidth` | Maximum image width. | `100%` |
| `maxHeight` | Maximum image height. | `100%` |

## Thumbnail And Preload Options

| Option | Description | Default |
| --- | --- | --- |
| `useThumbnails` | Request PhotoPrism thumbnails instead of full-size images. | `true` |
| `thumbnailSize` | Named thumbnail size such as `fit_1920` or `tile_500`. Use `auto` for automatic sizing. | `auto` |
| `preloadInBrowser` | Preload the next image in the browser cache. | `true` |
| `logLevel` | Frontend console verbosity: `error`, `warn`, `info`, `debug`. | `info` |

## Sizing Recommendations

- `fit_720` for smaller displays
- `fit_1280` for tablets or smaller HD screens
- `fit_1920` for most Full HD TVs
- `fit_3840` for 4K screens

If possible, keep the requested thumbnail size close to the actual displayed size to avoid unnecessary browser scaling.

## CSS Example

```css
.MMM-Photoprism2 .photoprism-container {
  display: flex;
  justify-content: center;
  align-items: center;
  left: 12.5vw;
  right: 12.5vw;
  max-height: 75vh;
  max-width: 75vw;
}

.MMM-Photoprism2 .photoprism-image {
  max-height: 100%;
  max-width: 100%;
}
```