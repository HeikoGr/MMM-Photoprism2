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
- The backend owns the schedule (`lib/mmm-shared/backend-session.js`, shared with the
  other modules of this author). The frontend sends its config once (`CONFIGURE`) and
  reports whether it is visible (`SESSION_STATE`); `node_helper` runs one
  `createLifecycle` from `lib/mmm-shared` per instance on the server - interval, jitter,
  `quietHours`, backoff - and pushes each image as a `DATA` event. With the default
  `backgroundRefresh: true` it keeps refreshing while the module is hidden; with `false` it
  pauses while every display of the instance is hidden. A failed refresh is retried with a
  growing backoff (1, 2, 4 … 30 min) instead of waiting for the next interval.
- The backend knows which displays are connected: an instance whose browser socket is gone
  for 10 minutes is released and no longer fetched. A new connection is greeted with
  `INIT_REQUIRED`, so a display registers again after a server restart without a reload.
- Two displays of one instance share its schedule. The first `CONFIGURE` decides; a later
  one with different credentials is refused (`CONFIG_REJECTED`), other differences are only
  logged.
- The thumbnail size is resolved in the browser, per display (it depends on the window):
  the backend sends one image per instance with `thumbnailBase`, and each display appends the
  size that fits its own window (`lib/thumbnail-size.js`). `CONFIGURE` carries the configured
  value (`auto`), so displays of different sizes send the same config. Image data itself
  remains in the browser cache; the module does not cache files on disk.