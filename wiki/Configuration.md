# Configuration

## Core Options

| Option | Description | Default |
| --- | --- | --- |
| `apiUrl` | PhotoPrism base URL. | `http://localhost:2342` |
| `apiKey` | PhotoPrism API key. | `""` |
| `albumId` | Album ID to draw images from. | `""` |
| `updateInterval` | Refresh interval in milliseconds. | `300000` |
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