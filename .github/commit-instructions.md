# Commit message instructions

Write the commit message as a Conventional Commit. The repository enforces these rules with
commitlint and `scripts/check-commit-scope.js`, so a message that ignores them is rejected by the
`commit-msg` hook.

## Format

```
type(scope): subject

body

footer
```

- `type` is required and must come from the list below.
- `scope` is optional. Use it when the change is confined to one area, omit it for repo-wide
  changes. Never invent a scope that is not in the list.
- `subject` is required: imperative mood ("add", not "added" or "adds"), lowercase first letter,
  no trailing period.
- The whole first line must be at most 100 characters.
- Leave one blank line before the body and before the footer.
- Wrap body lines at 140 characters.

## Types

| Type       | Use when                                                        |
| ---------- | --------------------------------------------------------------- |
| `feat`     | user-visible behavior was added                                   |
| `fix`      | a user-visible defect was corrected                               |
| `perf`     | same behavior, but faster or lighter                              |
| `refactor` | internal restructuring with no behavior change                    |
| `docs`     | documentation only                                                |
| `test`     | tests only                                                        |
| `build`    | dependencies, packaging, devcontainer                             |
| `ci`       | workflows and automation                                          |
| `chore`    | housekeeping that touches no runtime source                       |
| `revert`   | reverting an earlier commit                                       |

## Choosing the type from the diff

`chore`, `docs`, `style`, `ci`, `build` and `test` promise that nothing user-visible changed. They
are rejected when the diff contains non-formatting changes to runtime source:

- `node_helper.js`, `MMM-Photoprism2.js`, `MMM-Photoprism2.css`

If the diff changes those files, pick `feat` or `fix` when the behavior changed, or `refactor` or
`perf` when it genuinely did not. Markdown files do not count as runtime source.

Judge the type from what the code actually does after the change, not from which files were
touched. A dependency bump that also fixes a bug is a `fix`, not a `build`.

## Scopes

`photos`, `cache`, `config`, `deps`, `devcontainer`

## Subject content

Describe the effect of the change, not the editing process. The reader wants to know what is
different now.

- Good: `fix(photos): fall back to the download URL when no preview token is issued`
- Bad: `fix(photos): update node_helper.js`
- Bad: `fix(photos): various fixes and improvements`

Do not enumerate the changed files, do not mention line counts, and do not write "update X, update
Y, update Z". One commit describes one change; summarize it in a single clause.

## Body

Add a body only when the subject leaves an obvious question open. Explain **why** the change was
made and what the previous behavior was — the diff already shows what changed. Skip the body for
self-explanatory changes such as dependency bumps.

## Breaking changes

Mark them with `!` after the type or scope and add a `BREAKING CHANGE:` footer explaining what
users must do:

```
feat(config)!: require apiKey and albumId to be set explicitly

BREAKING CHANGE: the module no longer starts with an empty apiKey/albumId. Set both in
config.js or the module will show a configuration error instead of an empty container.
```

## Examples from this repository

```
fix(photos): select a new random image when the album returns zero results
feat(cache): evict cached images older than cacheRetentionDays on startup
fix(config): derive thumbnailSize from window size when set to "auto"
perf(photos): reuse the preview token across requests instead of refetching it
build(devcontainer): install the GitHub CLI
docs: document how to obtain a PhotoPrism API key with curl
```
