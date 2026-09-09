FROM emscripten/emsdk:3.1.53

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

ENTRYPOINT ["/build/build.sh"]
