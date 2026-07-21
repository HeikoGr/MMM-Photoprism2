# Quick Start

Add a minimal block like this to your MagicMirror `config/config.js`:

```js
{
  module: "MMM-Photoprism2",
  position: "middle_center",
  config: {
    apiUrl: "http://your-photoprism-server:2342",
    apiKey: "your-api-key",
    albumId: "your-album-id",
    updateInterval: 5 * 60 * 1000,
  },
}
```

## Getting An API Key

1. Log in to PhotoPrism.
2. Open `Settings` > `Advanced`.
3. Generate a new API key.
4. Paste it into the module config.

## Multi-Instance Notes

If you run multiple albums in parallel, give each module block a clear MagicMirror `identifier` so the setup stays understandable.