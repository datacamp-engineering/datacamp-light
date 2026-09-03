BusyBox Web
==========

Compile busybox with Emscripten to WebAssembly.

### Building from source

You can build the provided [binaries](./dist/) using the provided [`build.sh`](./build.sh) script.

#### Option 1: Using emsdk

Setup the [Emscripten toolchain](https://emscripten.org/docs/getting_started/downloads.html) using the [`emsdk`](https://emscripten.org/docs/tools_reference/emsdk.html) tool.
Make sure `emconfigure`, `emmake`, and `emcc` are available in your `$PATH` and run the following command:
```console
$ ./build.sh
```

> On Windows, you might want to use the [Docker variant](#option-2-using-docker) instead.

#### Option 2: Using Docker

If you don't want to set up Emscripten on your machine you can use docker with the following command:
```console
$ docker run --rm -v $(pwd):$(pwd) -w $(pwd) -u $(id -u):$(id -g) --platform linux/amd64 emscripten/emsdk /bin/bash ./build.sh
```

# License

- The [BusyBox sources](https://busybox.net) is licensed under the [GNU GPLv2](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html).

As a result, the provided [binaries](./dist/) are in turn also licensed under the [GNU GPLv2](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html).
All other files are licensed under the [Apache License v2](https://www.apache.org/licenses/LICENSE-2.0). This mainly requests to keep the name of the original authors and give according credit to them if you change or redistribute the sources.
