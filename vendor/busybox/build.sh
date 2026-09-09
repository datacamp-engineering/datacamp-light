#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUSYBOX_VERSION="c8eb8614068a662271a5187d4876df1d8439a0ae"
DIST_DIR="${SCRIPT_DIR}/dist"
mkdir -p "${DIST_DIR}"

export CC=emcc
export CXX=emcc

WORK_DIR="${SCRIPT_DIR}/busybox_src"
if [ ! -d "${WORK_DIR}" ]; then
    echo "Downloading BusyBox (${BUSYBOX_VERSION})..."
    curl -sL "https://github.com/vda-linux/busybox_mirror/archive/${BUSYBOX_VERSION}.zip" -o "${SCRIPT_DIR}/busybox.zip"
    unzip -q "${SCRIPT_DIR}/busybox.zip" -d "${SCRIPT_DIR}"
    mv "${SCRIPT_DIR}/busybox_mirror-${BUSYBOX_VERSION}" "${WORK_DIR}"
    rm -f "${SCRIPT_DIR}/busybox.zip"
fi

cd "${WORK_DIR}"

mkdir -p arch/wasm32/
cp "${SCRIPT_DIR}/Makefile.wasm32" arch/wasm32/Makefile
cp "${SCRIPT_DIR}/emscripten_defconfig" configs/emscripten_defconfig
patch -p1 < "${SCRIPT_DIR}/clang-flags.patch" || true

mkdir -p build/
emmake make O=build/ ARCH=wasm32 emscripten_defconfig

echo "Compiling BusyBox WASM with ash shell..."
NCPU=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)
emmake make O=build/ ARCH=wasm32 -j${NCPU} wasm busybox.links

cp build/busybox.js "${DIST_DIR}/busybox.js"
cp build/busybox.wasm "${DIST_DIR}/busybox.wasm"

echo "Build successful: ${DIST_DIR}/busybox.js and ${DIST_DIR}/busybox.wasm"
