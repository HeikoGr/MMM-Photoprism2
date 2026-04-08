# MMM-Photoprism2

A MagicMirror module that displays random photos from your PhotoPrism albums. The module will automatically fetch a new random photo every 5 minutes from a specified album.

![visualisation with custom css file](screenshot.png)

Please keep in mind this is mostly vibe-coded. I was happy to have a working example

> **Note:** This project is based on the original [MMM-Photoprism](https://github.com/Brtrnd/MMM-Photoprism) by Brtrnd. Thank you for the great foundation!

## Requirements

- Node.js `>=20.18.1`
- A reachable PhotoPrism instance
- A PhotoPrism API key with access to the target album

## Features

- Displays random photos from a specified PhotoPrism album
- Automatic updates every 5 minutes
- Smooth fade transitions between photos
- Displays photo titles (if available)
- Uses browser-side preloading to keep image switches smooth
- Detailed logging for troubleshooting
- Instance-aware backend/frontend communication for multiple module instances
- `suspend()` / `resume()` support to stop timers while the module is hidden

## Installation

1. Clone this repository into your MagicMirror modules directory:
```bash
cd ~/MagicMirror/modules
git clone https://github.com/HeikoGr/MMM-Photoprism2.git
```

2. Install the required dependencies:
```bash
cd MMM-Photoprism2
npm install
```

## Update

```bash
cd ~/MagicMirror/modules/MMM-Photoprism2
git pull
npm install
```

## Configuration

Add the following configuration block to your MagicMirror config.js file:

```javascript
{
    module: "MMM-Photoprism2",
    position: "middle_center", // This can be any of the MagicMirror positions
    config: {
        apiUrl: "http://your-photoprism-server:2342", // Your PhotoPrism server URL
        apiKey: "your-api-key", // Your PhotoPrism API key
        albumId: "your-album-id", // The ID of the album to display
        updateInterval: 5 * 60 * 1000, // Update interval in milliseconds (default: 5 minutes)
        fadeSpeed: 1000, // Fade transition speed in milliseconds
        maxWidth: "100%", // Maximum width of the image
        maxHeight: "100%" // Maximum height of the image
    }
},
```

### Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `apiUrl` | The URL of your PhotoPrism server | "http://localhost:2342" |
| `apiKey` | Your PhotoPrism API key | "" |
| `albumId` | The ID of the album to display photos from | "" |
| `updateInterval` | How often to fetch a new photo (in milliseconds) | 300000 (5 minutes) |
| `fadeSpeed` | Speed of the fade transition between photos (in milliseconds) | 1000 |
| `maxWidth` | Maximum width of the displayed image | "100%" |
| `maxHeight` | Maximum height of the displayed image | "100%" |
| `useThumbnails` | Whether to request PhotoPrism thumbnails instead of full images (recommended for performance) | `true` |
| `thumbnailSize` | Named thumbnail size to request from PhotoPrism (e.g. `fit_1920`, `tile_500`). Use `auto` to pick a size based on the display (recommended). | `auto` |
| `preloadInBrowser` | Preload images into the browser cache (hidden `<img>`) so switching is instant and works while module is suspended | `true` |
| `logLevel` | Browser console verbosity. One of `error`, `warn`, `info`, `debug` (less → more). Use `error` to quiet the console. | `info` |

## Multi-Instance Behavior

Multiple `MMM-Photoprism2` instances can now run in parallel without overwriting each other's backend state. Each frontend instance generates its own `instanceId`, and the `node_helper` keeps configuration, tokens, and image selection state isolated per instance.

If you run multiple albums side by side, give each module block a clear MagicMirror `identifier` in your `config.js` so the overall setup stays understandable.

## Lifecycle Behavior

- On startup, the frontend sends its effective config once so the backend can prepare the first image early.
- While the module is visible, the refresh timer requests a new image at `updateInterval`.
- During `suspend()`, the timer is stopped.
- During `resume()`, the module requests a fresh image immediately and restarts the timer.

## Getting Your PhotoPrism API Key

1. Log in to your PhotoPrism instance
2. Go to Settings > Advanced
3. Generate a new API key
4. Copy the key and use it in the module configuration

## Architecture: Why a node_helper?

This module uses a `node_helper.js` backend component instead of making API calls directly from the frontend. The primary reason is **CORS (Cross-Origin Resource Sharing)**.

PhotoPrism APIs typically don't include permissive CORS headers that would allow a browser-based MagicMirror module to make direct requests. The browser would block these requests due to the same-origin policy. By using a Node.js-based `node_helper`, the module:

- Bypasses CORS restrictions (Node.js is not subject to browser CORS policies)
- Acts as a server-side proxy between MagicMirror and PhotoPrism
- Follows the standard MagicMirror module architecture pattern

## Troubleshooting

The module includes configurable logging. Set `logLevel` in the module config (frontend) to control browser console output. Valid values: `error`, `warn`, `info`, `debug`.

For node-side logging, the node helper will inherit the `logLevel` value sent from the frontend config. This replaces the old `DEBUG = true` flag.

When enabled, logs may show:
- API request details
- Response data
- Image selection process
- Download status
- Any errors that occur

## Documentation

Additional development and devcontainer documentation is collected in [docs/README.md](docs/README.md).

## Code Quality

This module includes an ESLint configuration (`.eslintrc.json`) that was automatically generated to match common MagicMirror module standards. The configuration is provided as-is without any specific expertise in ESLint. It's included to help maintain code quality and consistency, but may need adjustments based on your specific needs or preferences.

## Thumbnail sizes and recommendations

PhotoPrism provides a set of named thumbnail sizes that are preferred to raw pixel parameters. Examples include `tile_500`, `fit_1280`, `fit_1920`, `fit_3840`, and many more. Using these named sizes is more predictable and aligns with PhotoPrism's caching and generation strategy.

Recommended values:
- `fit_720` — small screens or low-bandwidth devices
- `fit_1280` — typical tablets or small HD displays
- `fit_1920` — Full HD displays (good default for most TVs)
- `fit_3840` — 4K displays

The module supports `thumbnailSize: "auto"` (default). When set to `auto` the frontend will calculate a sensible `fit_<N>` value based on the browser window size and the devicePixelRatio and send that to the node helper. This avoids downloading thumbnails much larger than the display resolution while still keeping quality high on high-DPI screens.

If you prefer to force a specific size, set `thumbnailSize: "fit_1920"` (or any other named size from PhotoPrism's sizes list).

### Performance and image quality on low-power devices

On devices with limited GPU/CPU resources (e.g., Raspberry Pi or similar SBCs), rendering thumbnails that must be up- or downscaled in the browser can sometimes result in visible banding or a reduced effective bit depth due to how scaling, compositing, and color conversion are implemented in the browser/driver stack. To minimize this:

- Match the requested thumbnail size to the actual displayed size as closely as possible.
- Prefer `thumbnailSize: "auto"` so the module chooses a `fit_<N>` close to your window size and devicePixelRatio.
- Avoid scaling images significantly in CSS (e.g., large differences between thumbnail and displayed size via `maxWidth`/`maxHeight`).
- For Full HD displays, `fit_1920` is a good default; for 4K, `fit_3840` is recommended.

In short: the displayed size should always match the thumbnails to avoid unnecessary client-side scaling, which can degrade perceived quality on low-power devices.

### Example: Centered and scaled image (CSS)

Below is an example showing how to center the image and constrain it within a safe area of the screen. This avoids excessive scaling in the browser and keeps performance good on low-power devices. See the note above on scaling in “Performance and image quality on low-power devices”.

```css
body {
    margin: 0px;
    position: absolute;
    height: calc(100%);
    width: calc(100%);
    overflow: hidden;
}

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
    display: block;
    left: auto;
    right: auto;
    max-height: 100%;
    max-width: 100%;
}
```

Tip: Adjust the `max-width`/`max-height` and the side insets (`left` / `right`) to fit your display. If you force the image to be much smaller or larger than the requested thumbnail size, the browser will scale it, which may impact quality (see section above).

## License

This project is licensed under the MIT License - see the LICENSE file for details.
