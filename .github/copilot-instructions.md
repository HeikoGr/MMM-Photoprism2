# GitHub Copilot repository instructions (strict)

## Scope and safety

- Only change code and files inside this repository.
- Keep changes minimal and directly related to the request/issue.
- Do not introduce new dependencies unless explicitly required; if you do, update `package.json` (and existing lockfiles).
- Never commit secrets (tokens, API keys, session cookies, personal data).

## MagicMirror module conventions

- Preserve the standard MagicMirror module structure and naming (e.g., `MMM-*.js`, `node_helper.js`, `translations/`, `*.css`).
- Keep the public module API stable (`Module.register`, notification handling, config schema) unless the request requires a breaking change.
- Prefer predictable caching and clear logging for external API calls.

## This module's architecture

- Shared infrastructure comes from the `lib/mmm-shared` submodule (`createTransport`,
  `createLogger`, `createLifecycle`). Do not change it here.
- The backend owns the rotation (MODULE-PLAN C1-C3): the frontend sends `CONFIGURE` once and
  `SESSION_STATE` (active/paused); `lib/mmm-shared/backend-session.js` runs a `createLifecycle` per
  instance in `node_helper` and pushes each image as a `DATA` event. The frontend lifecycle
  has no `onFetch` - it only gates rendering (`lifecycle.render()`). Do not add own timers.
  `backend-session.js` comes from the `lib/mmm-shared` submodule (tests there); change it in the
  mmm-shared repo.
- Instances are keyed by the core-assigned `this.identifier` (unique per instance, stable across
  reloads). The `node_helper` keeps one state per instance: config, album index, tokens.
- `lib/album-index.js` caches the album listing (`albumIndexTtl`, default 60 min). A
  rotation step picks from that cache and costs no HTTP request; only a stale index
  triggers a paged listing (1000 photos per page, 30 s timeout per request).
- Images are loaded by the browser directly from PhotoPrism; nothing is cached on disk.
- File layout: `node_helper.js` only wires the hub and the loggers. `lib/image-source.js` holds
  the per-instance state and picks the next image, `lib/photoprism-api.js` does the paged
  listing (timeout, format check, error codes), `lib/album-index.js` the TTL cache. In the
  browser, `lib/thumbnail-size.js` resolves `thumbnailSize: "auto"` per display and appends it
  to the `thumbnailBase` of each image (the backend never sees the window size).
- PhotoPrism metadata (title, place label) is rendered with `textContent`, never `innerHTML`.

## Quality bar

- Follow the repository's existing Biome configuration.
- Avoid broad refactors “for cleanliness”; do focused edits.
- Run `node --run test` and `node --run lint` after every change.

## References

- GitHub Copilot repository instructions: https://docs.github.com/de/copilot/how-tos/configure-custom-instructions/add-repository-instructions
- MagicMirror² documentation: https://docs.magicmirror.builders/
- MagicMirror² module development: https://docs.magicmirror.builders/development/module-development.html
- MagicMirror² configuration reference: https://docs.magicmirror.builders/configuration/introduction.html
- Node.js documentation: https://nodejs.org/en/docs
- npm CLI documentation: https://docs.npmjs.com/cli/
- PhotoPrism docs: https://docs.photoprism.app/
