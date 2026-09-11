# Vendor Provenance

This directory (`/vendor`) holds verbatim, byte-for-byte copies of third-party files from
external upstream sources. Never hand-edit anything in here: changes must land upstream
first, or ship as patch files that the build scripts under `/scripts` apply at build time.
Re-sync from the pinned upstream refs with:

    node scripts/update-vendor.mjs

## Runtime assets (served from public/)

| path                  | source          | ref                                                 | license      | notes                                                                        |
| --------------------- | --------------- | --------------------------------------------------- | ------------ | ---------------------------------------------------------------------------- |
| public/busybox.js     | BusyBox         | commit c8eb8614068a662271a5187d4876df1d8439a0ae     | GPL-2.0      | https://github.com/vda-linux/busybox_mirror — copyright BusyBox contributors |
| public/busybox.wasm   | BusyBox         | commit c8eb8614068a662271a5187d4876df1d8439a0ae     | GPL-2.0      | https://github.com/vda-linux/busybox_mirror — copyright BusyBox contributors |
| public/wasm_exec.js   | Go toolchain    | go1.22 (misc/wasm/wasm_exec.js)                     | BSD-3-Clause | https://github.com/golang/go — copyright The Go Authors                      |
| public/sh-runner.wasm | mvdan/sh runner | mvdan.cc/sh/v3 (see scripts/build-sh-runner/go.mod) | BSD-3-Clause | https://github.com/mvdan/sh — copyright mvdan-sh authors; The Go Authors     |

## Vendored files under /vendor

| path                                | source                                      | ref                                                        | license      | notes                                                                                                                                                                                                                                |
| ----------------------------------- | ------------------------------------------- | ---------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| vendor/busybox/README.md            | cryptool-org/busybox-wasm (verbatim copies) | 277e7cb2ff5e94f6df681ff06f665710f3983148                   | Apache-2.0   | Synced by scripts/update-vendor.mjs — BusyBox build recipe, built via scripts/build-busybox.sh                                                                                                                                       |
| vendor/busybox/build.sh             | cryptool-org/busybox-wasm (verbatim copies) | 277e7cb2ff5e94f6df681ff06f665710f3983148                   | Apache-2.0   | Synced by scripts/update-vendor.mjs — BusyBox build recipe, built via scripts/build-busybox.sh                                                                                                                                       |
| vendor/busybox/Makefile.wasm32      | cryptool-org/busybox-wasm (verbatim copies) | 277e7cb2ff5e94f6df681ff06f665710f3983148                   | Apache-2.0   | Synced by scripts/update-vendor.mjs — BusyBox build recipe, built via scripts/build-busybox.sh                                                                                                                                       |
| vendor/busybox/emscripten_defconfig | cryptool-org/busybox-wasm (verbatim copies) | 277e7cb2ff5e94f6df681ff06f665710f3983148                   | Apache-2.0   | Synced by scripts/update-vendor.mjs — BusyBox build recipe, built via scripts/build-busybox.sh                                                                                                                                       |
| vendor/busybox/clang-flags.patch    | cryptool-org/busybox-wasm (verbatim copies) | 277e7cb2ff5e94f6df681ff06f665710f3983148                   | Apache-2.0   | Synced by scripts/update-vendor.mjs — BusyBox build recipe, built via scripts/build-busybox.sh                                                                                                                                       |
| vendor/busybox/LICENSE.GPL-2.0      | cryptool-org/busybox-wasm                   | 277e7cb2ff5e94f6df681ff06f665710f3983148                   | GPL-2.0      | Upstream BusyBox GPL-2.0 license, distributed with the busybox.js/busybox.wasm binaries — fetched verbatim from https://raw.githubusercontent.com/cryptool-org/busybox-wasm/277e7cb2ff5e94f6df681ff06f665710f3983148/LICENSE.GPL-2.0 |
| vendor/busybox/LICENSE.APACHE-2.0   | cryptool-org/busybox-wasm                   | 277e7cb2ff5e94f6df681ff06f665710f3983148                   | Apache-2.0   | License of the BusyBox build recipe (scripts/build-busybox/) — fetched verbatim from https://raw.githubusercontent.com/cryptool-org/busybox-wasm/277e7cb2ff5e94f6df681ff06f665710f3983148/LICENSE.APACHE-2.0                         |
| vendor/golang-go/LICENSE            | golang/go                                   | go1.22.0 (commit a10e42f219abb9c5bc4e7d86d9464700a42c7d57) | BSD-3-Clause | License of the Go toolchain (public/wasm_exec.js runtime shim for sh-runner.wasm) — fetched verbatim from https://raw.githubusercontent.com/golang/go/go1.22.0/LICENSE                                                               |
| vendor/mvdan-sh/LICENSE             | mvdan/sh                                    | v3.8.0 (tag, per scripts/build-sh-runner/go.mod)           | BSD-3-Clause | License of mvdan.cc/sh/v3 (public/sh-runner.wasm shell parser) — fetched verbatim from https://raw.githubusercontent.com/mvdan/sh/v3.8.0/LICENSE                                                                                     |

Generated from `scripts/vendor-manifest.json` — do not edit by hand.
