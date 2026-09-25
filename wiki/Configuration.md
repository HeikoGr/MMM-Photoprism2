# Configuration

## Core Options

| Option | Description | Default |
| --- | --- | --- |
| `apiUrl` | PhotoPrism base URL. | `http://localhost:2342` |
| `apiKey` | PhotoPrism API key. | `""` |
| `albumId` | Album ID to draw images from. | `""` |
| `updateInterval` | How often the displayed image changes, in milliseconds. Picking the next image reuses the cached album listing and costs no HTTP request. | `300000` |
| `albumIndexTtl` | How long the node helper reuses a cached album listing before re-listing the album. If re-listing fails, the rotation continues with the previous listing and tries again on the next image. | `3600000` |
| `backgroundRefresh` | Keep rotating images while the module is hidden (e.g. under MMM-Carousel), so a fresh image is ready the moment it becomes visible. | `true` |
| `quietHours` | Optional window without any polling, e.g. `{ from: "23:00", to: "06:00" }`. | `null` |
| `fadeSpeed` | Fade duration in milliseconds. | `1000` |
| `maxWidth` | Maximum width of this instance (any CSS length, e.g. `40vw`). Needed when several instances share the screen. | `100%` |
| `maxHeight` | Maximum height of this instance (any CSS length, e.g. `50vh`). | `100%` |

## Thumbnail And Preload Options

| Option | Description | Default |
| --- | --- | --- |
| `useThumbnails` | Request PhotoPrism thumbnails instead of full-size images. | `true` |
| `thumbnailSize` | Named thumbnail size such as `fit_1920` or `tile_500`. Use `auto` for automatic sizing based on the browser window; with several displays of one instance, each display picks the size for its own window. | `auto` |
| `preloadInBrowser` | Preload the next image in the browser cache. | `true` |
| `logLevel` | Optional: `none`, `error`, `warn`, `info`, `debug`. Output (browser console and `pm2 logs`) goes through MagicMirror's `Log`, so the global `logLevel` in `config.js` decides; this option can only narrow it for this module. | unset (global level) |

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

## Multiple Instances

Several instances can run at the same time, also against the same PhotoPrism server and with
different albums. Each instance keeps its own album listing in the node helper. Give each
instance its own position and limit its size:

```js
{
  module: "MMM-Photoprism2",
  position: "top_right",
  config: { apiUrl: "http://photoprism.local:2342", apiKey: "…", albumId: "album-one", maxWidth: "35vw", maxHeight: "45vh" },
},
{
  module: "MMM-Photoprism2",
  position: "bottom_right",
  config: { apiUrl: "http://photoprism.local:2342", apiKey: "…", albumId: "album-two", maxWidth: "35vw", maxHeight: "45vh" },
},
```

Rules on `.MMM-Photoprism2 …` in `custom.css` (like the CSS example above) apply to every
instance. To style a single instance, give it a class via the module's `classes` option
(e.g. `classes: "photo-left"`) and target `.photo-left .photoprism-container`.
