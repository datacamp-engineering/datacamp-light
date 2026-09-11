FROM emscripten/emsdk:3.1.53 AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    bzip2 \
    curl \
    git \
    patch \
    unzip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

COPY Makefile.wasm32 /build/Makefile.wasm32
COPY emscripten_defconfig /build/emscripten_defconfig
COPY clang-flags.patch /build/clang-flags.patch
COPY build.sh /build/build.sh
RUN chmod +x /build/build.sh

RUN /build/build.sh

FROM alpine:latest
COPY --from=builder /build/dist/busybox.js /dist/busybox.js
COPY --from=builder /build/dist/busybox.wasm /dist/busybox.wasm
VOLUME /out
CMD ["sh", "-c", "cp /dist/* /out/"]