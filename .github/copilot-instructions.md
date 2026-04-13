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

## Quality bar

- Follow the repository's existing Biome configuration.
- Avoid broad refactors “for cleanliness”; do focused edits.

## References

- GitHub Copilot repository instructions: https://docs.github.com/de/copilot/how-tos/configure-custom-instructions/add-repository-instructions
- MagicMirror² documentation: https://docs.magicmirror.builders/
- MagicMirror² module development: https://docs.magicmirror.builders/development/module-development.html
- MagicMirror² configuration reference: https://docs.magicmirror.builders/configuration/introduction.html
- Node.js documentation: https://nodejs.org/en/docs
- npm CLI documentation: https://docs.npmjs.com/cli/
- PhotoPrism docs: https://docs.photoprism.app/
