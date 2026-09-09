# Vendor Provenance

This directory (`/vendor`) holds verbatim, byte-for-byte copies of third-party files from
external upstream sources. Never hand-edit anything in here: changes must land upstream
first, or ship as patch files that the build scripts under `/scripts` apply at build time.
Re-sync from the pinned upstream refs with:

    node scripts/update-vendor.mjs

Generated from `scripts/vendor-manifest.json` — do not edit by hand.

| path                  | source                                      | ref                                                 | license      | notes                                                                                                                  |
| --------------------- | ------------------------------------------- | --------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| public/busybox.js     | BusyBox                                     | commit c8eb8614068a662271a5187d4876df1d8439a0ae     | GPL-2.0      | https://github.com/vda-linux/busybox_mirror — copyright BusyBox contributors                                           |
| public/busybox.wasm   | BusyBox                                     | commit c8eb8614068a662271a5187d4876df1d8439a0ae     | GPL-2.0      | https://github.com/vda-linux/busybox_mirror — copyright BusyBox contributors                                           |
| public/wasm_exec.js   | Go toolchain                                | go1.22 (misc/wasm/wasm_exec.js)                     | BSD-3-Clause | https://github.com/golang/go — copyright The Go Authors                                                                |
| public/sh-runner.wasm | mvdan/sh runner                             | mvdan.cc/sh/v3 (see scripts/build-sh-runner/go.mod) | BSD-3-Clause | https://github.com/mvdan/sh — copyright mvdan-sh authors; The Go Authors                                               |
| vendor/busybox        | cryptool-org/busybox-wasm (verbatim copies) | 277e7cb2ff5e94f6df681ff06f665710f3983148            | Apache-2.0   | https://github.com/cryptool-org/busybox-wasm — synced by scripts/update-vendor.mjs, built via scripts/build-busybox.sh |
