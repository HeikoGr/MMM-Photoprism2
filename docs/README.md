# MMM-Photoprism2 Documentation

User-facing installation, configuration, sizing, and troubleshooting documentation now lives in the project wiki.

- Wiki: <https://github.com/HeikoGr/MMM-Photoprism2/wiki>

This directory contains additional documentation for development and infrastructure.

## Contents

- [DEVCONTAINER.md](DEVCONTAINER.md): Devcontainer setup, lifecycle, and preinstalled tools

## Architecture Notes

- Each module instance is addressed by its core-assigned `identifier`, which is unique per
  instance and stable across browser reloads. Several instances can therefore run side by
  side against the same PhotoPrism server; size them with `maxWidth`/`maxHeight`.
- The `node_helper` keeps configuration, tokens, and album listings separate per instance.
  Album listings are paged (1000 photos per request, 30 s timeout per request).
- The frontend lifecycle comes from `lib/mmm-shared` (`createLifecycle`). With the default
  `backgroundRefresh: true` the image timer keeps running while the module is hidden, so a
  fresh image is ready on the next `resume()`. Only with `backgroundRefresh: false` do
  `suspend()`/`resume()` stop and restart the timer. Image data itself remains in the browser
  cache; the module does not cache files on disk.