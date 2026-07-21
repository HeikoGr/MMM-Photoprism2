# MMM-Photoprism2

MagicMirror module that displays random photos from PhotoPrism albums.

## Installation

```bash
cd ~/MagicMirror/modules
git clone https://github.com/HeikoGr/MMM-Photoprism2.git
cd MMM-Photoprism2
npm install
```

## Minimal Example

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

## Documentation

User-facing documentation now lives in the project wiki:

- [Wiki Home](https://github.com/HeikoGr/MMM-Photoprism2/wiki)
- [Installation](https://github.com/HeikoGr/MMM-Photoprism2/wiki/Installation)
- [Update](https://github.com/HeikoGr/MMM-Photoprism2/wiki/Update)
- [Quick Start](https://github.com/HeikoGr/MMM-Photoprism2/wiki/Quick-Start)
- [Configuration](https://github.com/HeikoGr/MMM-Photoprism2/wiki/Configuration)
- [Troubleshooting](https://github.com/HeikoGr/MMM-Photoprism2/wiki/Troubleshooting)

Technical and development documentation remains in `docs/`:

- [docs/README.md](docs/README.md)
- [docs/DEVCONTAINER.md](docs/DEVCONTAINER.md)
