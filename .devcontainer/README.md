# Development Container

This devcontainer provides a MagicMirror module development environment for MMM-Photoprism2.

## Base Image

- Shared base image: `ghcr.io/heikogr/mmm-devcontainer:node24-trixie-slim`
- Node.js 24
- MagicMirror² preinstalled at `/opt/magic_mirror`
- Playwright, `playwright-mcp`, Chrome, `MMM-Cursor`, `MMM-Carousel`, and `MMM-KeyBindings` are already included in the shared image

## Repo-Specific Layer

- This repo uses a thin local Dockerfile on top of the shared base image
- The local image only copies `entrypoint.sh` and `ecosystem.config.js`

## Lifecycle

1. `postCreate.sh`
   - Prepares `/tmp/playwright-mcp`
   - Verifies that `playwright-mcp` is available

2. `entrypoint.sh`
   - Creates config symlinks into `/opt/magic_mirror`
   - Loads `.env` when present
   - Installs missing module-local dependencies
   - Starts MagicMirror via `pm2-runtime`

3. `postStartCommand`
   - Prints the local MagicMirror URL
   - Reminds that Playwright MCP is configured via `.vscode/mcp.json`

## Environment

Configured in `devcontainer.json`:

- `IN_DEVCONTAINER=1`

## Rebuilding

After changing `Dockerfile`:

```bash
docker build -f .devcontainer/Dockerfile -t mmm-photoprism2-devcontainer .devcontainer
```

After changing `postCreate.sh`:

```bash
/bin/sh .devcontainer/postCreate.sh
```