# MMM-Photoprism2 Documentation

The main entry point for installation, configuration, and usage is [../README.md](../README.md). This directory contains additional documentation for development and infrastructure.

## Contents

- [DEVCONTAINER.md](DEVCONTAINER.md): Devcontainer setup, lifecycle, and preinstalled tools

## Architecture Notes

- The frontend creates a dedicated `instanceId` for each module instance.
- The `node_helper` keeps configuration, tokens, and image lists separate per instance.
- `suspend()` and `resume()` only stop/start the frontend timer; image data remains in the browser cache.