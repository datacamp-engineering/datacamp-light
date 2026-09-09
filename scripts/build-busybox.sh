#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

OUT_DIR="${1:-${ROOT_DIR}/public}"
mkdir -p "${OUT_DIR}"
OUT_DIR="$(cd "${OUT_DIR}" && pwd)"

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is required to build busybox.wasm but was not found in PATH." >&2
  echo "Install Docker (https://docs.docker.com/get-docker/) and retry." >&2
  exit 1
fi

echo "Building busybox.wasm with Docker (vendored cryptool-org/busybox-wasm recipe)..."
docker build -t dcl-busybox-builder -f "${SCRIPT_DIR}/build-busybox/Dockerfile" "${ROOT_DIR}/vendor/busybox"
docker run --rm -v "${OUT_DIR}:/out" dcl-busybox-builder
echo "Wrote ${OUT_DIR}/busybox.js and ${OUT_DIR}/busybox.wasm"