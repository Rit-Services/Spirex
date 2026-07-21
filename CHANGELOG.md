# Changelog

## [0.3.0](https://github.com/Rit-Services/Spirex/compare/v0.2.0...v0.3.0) (2026-07-21)


### ✨ Features

* make the image registry configurable via SPIREX_REGISTRY ([1a35c32](https://github.com/Rit-Services/Spirex/commit/1a35c3266e3be22eefb212100833672f9b2fb672))


### 🐛 Bug Fixes

* **ci:** let the Docker Hub mirror run when its config is a secret ([88253d2](https://github.com/Rit-Services/Spirex/commit/88253d2a8b70de2ae336afce708f22d2a9174977))
* **ci:** let the Docker Hub mirror run when its config is a secret ([41dd904](https://github.com/Rit-Services/Spirex/commit/41dd904673370ecf1a05ce6934aaffe70fc23f3c))

## [0.2.0](https://github.com/Rit-Services/Spirex/compare/v0.1.0...v0.2.0) (2026-07-21)


### ✨ Features

* publish multi-arch docker images and automate releases ([0ccd248](https://github.com/Rit-Services/Spirex/commit/0ccd2489dda1a2c1c557286a4d13f00b264a4e58))
* publish multi-arch docker images and automate releases ([e72dcaf](https://github.com/Rit-Services/Spirex/commit/e72dcaf2ddaa107ac5fcb24dc5477c4826ccac92))


### 🐛 Bug Fixes

* **ci:** quote echo in secret-scan workflow (inner colon broke YAML parsing) ([f061934](https://github.com/Rit-Services/Spirex/commit/f0619347b2c18ab53af7bc83dc15918d5de6514a))
* **ci:** seed .env from the example before validating compose ([02d326a](https://github.com/Rit-Services/Spirex/commit/02d326a77cc6b93e6503ec741ddcd9ae75b7ff37))


### ♻️ Refactoring

* finish spirex rename and patch multer/nodemailer CVEs ([c7a44c0](https://github.com/Rit-Services/Spirex/commit/c7a44c0f82a31c1709e7520e195dc3fbef1e5b34))
