# Security Policy

## Supported versions

Only the latest release on `main` receives fixes.

## Reporting a vulnerability

Please do **not** open a public issue for a security problem. Report it privately through GitHub:
**Security → Report a vulnerability** on
[this repository](https://github.com/HeikoGr/MMM-Photoprism2/security/advisories/new).

Include what an attacker can reach (the mirror's web port, the local machine, the PhotoPrism
library), the steps to reproduce and the module version. Never attach your `config.js`, API key,
image URLs or unredacted logs.

You will get an answer within two weeks. Fixes are released as a patch version, and the advisory is
published once a fixed version is available.

## Sensitive data the module handles

- the PhotoPrism API key; give it read access to the shown album only, if your PhotoPrism version
  allows that
- the image URLs the mirror's browser loads carry a PhotoPrism preview token (thumbnails) or download
  token (full size), so anyone who can open the mirror page can load those images; the module keeps
  these URLs out of its logs
- the photos of the album and their titles and places

See [Configuration](https://github.com/HeikoGr/MMM-Photoprism2/wiki/Configuration) in the wiki for
the options.
