#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

OUT_DIR="${1:-${ROOT_DIR}/public}"
mkdir -p "${OUT_DIR}"
OUT_DIR="$(cd "${OUT_DIR}" && pwd)"

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is required to build sh-runner.wasm but was not found in PATH." >&2
  echo "Install Docker (https://docs.docker.com/get-docker/) and retry." >&2
  exit 1
fi

echo "Building sh-runner.wasm with Docker (golang:1.22-alpine)..."
docker build -t dcl-sh-runner-builder -f "${SCRIPT_DIR}/build-sh-runner/Dockerfile" "${SCRIPT_DIR}/build-sh-runner"
docker run --rm -v "${OUT_DIR}:/out" dcl-sh-runner-builder
echo "Wrote ${OUT_DIR}/sh-runner.wasm and ${OUT_DIR}/wasm_exec.js"