#!/bin/bash

BUSYBOX_VERSION="c8eb8614068a662271a5187d4876df1d8439a0ae"  # commit after release of 1.37 with required fixes
BUSYBOX_DIR="busybox"

DIST_DIR="dist"
mkdir -p "${DIST_DIR}"

DEBUG=0
CLEAN=0
BUILD_BUSYBOX=1

while [ $# -gt 0 ]; do
  if [[ $1 == "help" ]]; then
    echo "usage: $0 help"
    echo "       $0 debug|clean|busybox"
    exit 0
  fi
  if [[ $1 == "debug" ]]; then
    DEBUG=1
  fi
  if [[ $1 == "clean" ]]; then
    CLEAN=1
    BUILD_BUSYBOX=$(( ${BUILD_BUSYBOX} - 1 ))
  fi
  if [[ $1 == "busybox" ]] && [ ${BUILD_BUSYBOX} -le 1 ]; then
    BUILD_BUSYBOX=$(( ${BUILD_BUSYBOX} + 1 ))
  fi
  shift
done

# Configure build tools
export CC=emcc
export CXX=emcc

# =============
# Build busybox
# =============
function build_busybox() {
  # Clean old build artifacts
  if [ -d "${BUSYBOX_DIR}" ]; then
    rm -rf "${BUSYBOX_DIR}"
  fi

  echo "====================="
  echo "=== Build busybox ==="
  echo "====================="
  echo ""

  # Download sources
  if [ ! -f ${BUSYBOX_VERSION}.zip ]; then
    curl -L -O "https://github.com/vda-linux/busybox_mirror/archive/${BUSYBOX_VERSION}.zip"
  fi

  # Extract sources
  unzip "${BUSYBOX_VERSION}.zip"
  mv "busybox_mirror-${BUSYBOX_VERSION}" "${BUSYBOX_DIR}"
  pushd "${BUSYBOX_DIR}" || exit 1

  # Configure environment
  if [ ${DEBUG} -gt 0 ]; then
    export LDFLAGS="${LDFLAGS} -s ASSERTIONS=1" # For logging purposes.
  fi

  # Apply patches
  mkdir -p arch/wasm32/
  cp ../Makefile.wasm32 arch/wasm32/Makefile
  cp ../emscripten_defconfig configs/emscripten_defconfig
  patch -up1 Makefile.flags ../clang-flags.patch

  # Apply configuration
  mkdir -p build/
  emmake make O=build/ ARCH=wasm32 emscripten_defconfig

  # Compile busybox
  emmake make O=build/ ARCH=wasm32 -j$(nproc) wasm busybox.links|| exit 1
  popd

  # Copy binaries to dist folder
  cp ${BUSYBOX_DIR}/build/busybox.js ${DIST_DIR}/busybox.js
  cp ${BUSYBOX_DIR}/build/busybox.wasm ${DIST_DIR}/busybox.wasm

  # create links for applets
  applets=$( sort ${BUSYBOX_DIR}/build/busybox.links | uniq )
  for app in ${applets}; do
    app=$( basename "$app" )
    echo "busybox" > ${DIST_DIR}/${app}.lnk
  done
}

# Select build targets
if [ ${CLEAN} -gt 0 ]; then
  echo "Clean build files"
  rm -rf "${BUSYBOX_DIR}" "${BUSYBOX_VERSION}.zip"
fi

if [ ${BUILD_BUSYBOX} -gt 0 ] && [ ${BUILD_BUSYBOX} -ge ${BUILD_BUSYBOX} ]; then
  build_busybox
fi
