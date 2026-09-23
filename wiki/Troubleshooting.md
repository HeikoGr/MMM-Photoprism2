# Troubleshooting

## Common Issues

### No images are shown

- Check `apiUrl`, `apiKey`, and `albumId` first.
- Make sure the API key has access to the chosen album.
- Confirm the PhotoPrism instance is reachable from the MagicMirror host.

### Image changes are slow

- Keep `useThumbnails` enabled when possible.
- Use `thumbnailSize: "auto"` or a size close to your actual display.
- Avoid large CSS upscaling on low-power devices.

### Need more logs

Debug output (browser console and `pm2 logs`) appears when the global `logLevel` in `config.js` contains `DEBUG` and this module's `logLevel` is unset or `debug`.

### Why the module uses a node_helper

PhotoPrism APIs are commonly blocked by browser CORS rules. The backend helper avoids that by performing API requests server-side.