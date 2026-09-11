#!/bin/sh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="${SCRIPT_DIR}/../../public"
mkdir -p "${DIST_DIR}"

if command -v docker >/dev/null 2>&1; then
    echo "Building sh-runner.wasm with Docker..."
    docker build -t dcl-sh-runner "${SCRIPT_DIR}"
    docker run --rm -v "${DIST_DIR}:/out" dcl-sh-runner
    cp "${DIST_DIR}/sh-runner.wasm" "${SCRIPT_DIR}/sh-runner.wasm"
    cp "${DIST_DIR}/wasm_exec.js" "${SCRIPT_DIR}/wasm_exec.js"
    echo "Successfully generated ${DIST_DIR}/sh-runner.wasm and ${DIST_DIR}/wasm_exec.js"
else
    echo "Error: Docker not found in PATH." >&2
    exit 1
fi
