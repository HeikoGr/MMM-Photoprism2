# Changelog

## [1.2.0](https://github.com/HeikoGr/MMM-Photoprism2/compare/v1.1.0...v1.2.0) (2026-09-25)


### 🔌 Features

* backend-owned rotation, split helper, quieter logs through MagicMirror's Log ([98ffb10](https://github.com/HeikoGr/MMM-Photoprism2/commit/98ffb10857e342fa45980959a5da4a1a22aecfcc))


### 🐛 Fixes

* enhance devcontainer setup with git configuration and mounts ([0d49647](https://github.com/HeikoGr/MMM-Photoprism2/commit/0d496479246f2997a9e2ab4872ee1cd425aa9aad))
* **photos:** center the photo inside its container ([a09e28e](https://github.com/HeikoGr/MMM-Photoprism2/commit/a09e28e13f9eec42d4c5fb81d7842448c38b0cbf))
* pick the thumbnail size per display instead of per instance ([8dfef23](https://github.com/HeikoGr/MMM-Photoprism2/commit/8dfef239209ed28e0164271592950b9c84e06e84))
* re-report paused state on backend restart, drop image URLs from logs ([1b90000](https://github.com/HeikoGr/MMM-Photoprism2/commit/1b900006d369cdd60bc57724764b476eaf29b82a))
* run several instances side by side against one PhotoPrism server ([5be7019](https://github.com/HeikoGr/MMM-Photoprism2/commit/5be7019af52c9c499a60f60d17cac1f20b90e043))
* show the newest image only, keep rotating when the album listing fails ([#30](https://github.com/HeikoGr/MMM-Photoprism2/issues/30)) ([17b9d00](https://github.com/HeikoGr/MMM-Photoprism2/commit/17b9d00b57103632cd51698917bf7f5e42737c9c))
* update screenshot link to use raw GitHub URL ([e8ba073](https://github.com/HeikoGr/MMM-Photoprism2/commit/e8ba0737362e921e16984275c657086203e84949))


### 🧱 Refactoring

* load backend-session.js from the mmm-shared submodule (S5) ([05c4d9d](https://github.com/HeikoGr/MMM-Photoprism2/commit/05c4d9da7933cefa9d593822b0b5de59a4fca2e5))


### 📚 Documentation

* add a neutral screenshot under img/ ([4b9d32b](https://github.com/HeikoGr/MMM-Photoprism2/commit/4b9d32b1a038a24d6f3b6c8602f6760f0c24571d))


### 📦 Build & Dependencies

* **deps-dev:** bump @biomejs/biome from 2.5.11 to 2.5.12 ([#20](https://github.com/HeikoGr/MMM-Photoprism2/issues/20)) ([03f81f4](https://github.com/HeikoGr/MMM-Photoprism2/commit/03f81f45bf3795ac199a28fa8f693d0e57237f33))
* **deps-dev:** bump @biomejs/biome from 2.5.12 to 2.5.13 ([#23](https://github.com/HeikoGr/MMM-Photoprism2/issues/23)) ([758477e](https://github.com/HeikoGr/MMM-Photoprism2/commit/758477e73517e52070027eab01ca39c499b0bcf8))
* **deps-dev:** bump @biomejs/biome from 2.5.13 to 2.5.14 ([#24](https://github.com/HeikoGr/MMM-Photoprism2/issues/24)) ([fd7e29f](https://github.com/HeikoGr/MMM-Photoprism2/commit/fd7e29f596365e2d5875571c0e137be795ecaf7b))
* **deps-dev:** bump @commitlint/cli from 21.2.2 to 21.2.3 ([#26](https://github.com/HeikoGr/MMM-Photoprism2/issues/26)) ([f644382](https://github.com/HeikoGr/MMM-Photoprism2/commit/f64438214b394b21d6e4a3d1d756f909bd910b44))
* **deps-dev:** bump @commitlint/config-conventional ([#25](https://github.com/HeikoGr/MMM-Photoprism2/issues/25)) ([628e7bf](https://github.com/HeikoGr/MMM-Photoprism2/commit/628e7bf3788df9b91dacccbe843693443e990774))
* **deps-dev:** bump lint-staged from 17.4.1 to 17.5.0 ([#21](https://github.com/HeikoGr/MMM-Photoprism2/issues/21)) ([5901e25](https://github.com/HeikoGr/MMM-Photoprism2/commit/5901e255e8b532309cf5216ac2fda11211ef34c0))
* **deps-dev:** bump lint-staged from 17.5.0 to 17.5.1 ([#22](https://github.com/HeikoGr/MMM-Photoprism2/issues/22)) ([a4fc475](https://github.com/HeikoGr/MMM-Photoprism2/commit/a4fc475f8e3305a0a9ccf8460ae8336fab562f57))
* **deps-dev:** bump simple-git-hooks from 2.13.1 to 2.14.0 ([#19](https://github.com/HeikoGr/MMM-Photoprism2/issues/19)) ([794974c](https://github.com/HeikoGr/MMM-Photoprism2/commit/794974c35ca2652d55428ae6cd04d7e55bb5890b))
* **deps:** drop unused prettier plugin, require MagicMirror's node version, keep test to tests ([5d5a622](https://github.com/HeikoGr/MMM-Photoprism2/commit/5d5a62214f0b5343529df8d2f9f215f757de2992))


### 🔧 Tooling

* assign release-please's PR to HeikoGr ([602bb7d](https://github.com/HeikoGr/MMM-Photoprism2/commit/602bb7dc41568907493100affd2f442a6f279cb1))
* develop branch model and PR title check ([e0a208a](https://github.com/HeikoGr/MMM-Photoprism2/commit/e0a208a3dcf6c1aa5b7fad1db3af8b1648f1555a))
* open the release PR to the default branch automatically, use RELEASE_TOKEN ([6fb9155](https://github.com/HeikoGr/MMM-Photoprism2/commit/6fb9155d8bb4a9997ec26b3753b4be9e910f9308))
* open the release PR to the default branch automatically, use RELEASE_TOKEN ([8107304](https://github.com/HeikoGr/MMM-Photoprism2/commit/81073046a98853849cec9b67b30e376106f9d786))
* prepare releases on develop, ship them with one merge to the default branch ([#28](https://github.com/HeikoGr/MMM-Photoprism2/issues/28)) ([6362feb](https://github.com/HeikoGr/MMM-Photoprism2/commit/6362feb58422c21e537e7413656816872ce860bb))
* run the unit tests ([1471680](https://github.com/HeikoGr/MMM-Photoprism2/commit/147168012d36f01d7c095321e3e7649d25a59d00))

## [1.1.0](https://github.com/HeikoGr/MMM-Photoprism2/compare/v1.0.16...v1.1.0) (2026-08-20)


### 🔌 Features

* **config:** add new options for album index TTL and background refresh ([f88248f](https://github.com/HeikoGr/MMM-Photoprism2/commit/f88248f7c6fa55eb88b41dd36b9445055a492602))
* **devcontainer:** add postStart script for credential handling and SSH setup ([6f4938f](https://github.com/HeikoGr/MMM-Photoprism2/commit/6f4938f21ee0af248f41935b7ad48eaaf391658e))
* **devcontainer:** enhance Playwright MCP configuration and credential handling ([f88248f](https://github.com/HeikoGr/MMM-Photoprism2/commit/f88248f7c6fa55eb88b41dd36b9445055a492602))
* **photos:** refactor image fetching logic to use cached album index ([f88248f](https://github.com/HeikoGr/MMM-Photoprism2/commit/f88248f7c6fa55eb88b41dd36b9445055a492602))


### 📚 Documentation

* update configuration documentation with new options ([f88248f](https://github.com/HeikoGr/MMM-Photoprism2/commit/f88248f7c6fa55eb88b41dd36b9445055a492602))


### 🧪 Testing

* add unit tests for album index functionality ([f88248f](https://github.com/HeikoGr/MMM-Photoprism2/commit/f88248f7c6fa55eb88b41dd36b9445055a492602))


### 📦 Build & Dependencies

* **deps:** bump @biomejs/biome to version 2.5.9 ([e10343b](https://github.com/HeikoGr/MMM-Photoprism2/commit/e10343b209b55538cc6e33e5f772a539df8aa529))

## [1.0.16](https://github.com/HeikoGr/MMM-Photoprism2/compare/v1.0.15...v1.0.16) (2026-08-17)


### 📦 Build & Dependencies

* **deps:** bump googleapis/release-please-action from 4 to 5 ([fd06e8e](https://github.com/HeikoGr/MMM-Photoprism2/commit/fd06e8eaa085bcc40ef17059dc6a941bf0f012a9))
* **deps:** bump googleapis/release-please-action from 4 to 5 ([2af1ce0](https://github.com/HeikoGr/MMM-Photoprism2/commit/2af1ce042816be1630e74dd6bafa96b58687e39d))

## [1.0.15](https://github.com/HeikoGr/MMM-Photoprism2/compare/v1.0.14...v1.0.15) (2026-08-15)


### 📦 Build & Dependencies

* **deps:** bump @biomejs/biome to version 2.5.8 ([2944ad7](https://github.com/HeikoGr/MMM-Photoprism2/commit/2944ad79c4459437f44a483ee4274becfe7e5ec5))


### 🔧 Tooling

* update Node.js version to 22.22.2 in CI workflow ([2b70421](https://github.com/HeikoGr/MMM-Photoprism2/commit/2b7042101cbff0f1c51c87ae559e40e6452d63e9))

## Changelog

I will do my best to keep this file updated. The commit logs might be more helpful to be honest.
