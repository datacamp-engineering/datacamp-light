import { cachedAssetFetch } from './assetCache';
import { getAssetCandidates, resolveAssetUrl } from './assetResolver';
import {
  createBusyboxRunner,
  createEmscriptenVfs,
  type IShellVfs,
  type WasmAppletRunner,
} from './shellInterpreter';

export interface BusyboxRuntimeContext {
  module: any;
  virtualFileSystem: IShellVfs;
  runner: WasmAppletRunner;
}

export async function loadBusyboxScript(): Promise<void> {
  const globalScope = globalThis as any;
  if (typeof globalScope.EmscrJSR_busybox === 'function') {
    return;
  }

  const candidates = getAssetCandidates('busybox.js');
  for (const url of candidates) {
    try {
      const response = await cachedAssetFetch(url);
      if (response.ok) {
        const scriptCode = await response.text();
        const evaluator = new Function(
          scriptCode +
            '\nif (typeof EmscrJSR_busybox !== "undefined") { globalThis.EmscrJSR_busybox = EmscrJSR_busybox; }',
        );
        evaluator.call(globalThis);
        if (typeof globalScope.EmscrJSR_busybox === 'function') {
          return;
        }
      }
    } catch {}
  }
}

export async function initializeBusyboxRuntime(): Promise<BusyboxRuntimeContext | null> {
  await loadBusyboxScript();
  const globalScope = globalThis as any;

  if (typeof globalScope.EmscrJSR_busybox !== 'function') {
    return null;
  }

  let stdoutBuffer = '';
  let stderrBuffer = '';

  const emscriptenModule = await globalScope.EmscrJSR_busybox({
    locateFile: (path: string) => resolveAssetUrl(path),
    thisProgram: 'busybox',
    noInitialRun: true,
    noExitRuntime: true,
    print: (text: string) => {
      stdoutBuffer += (stdoutBuffer ? '\n' : '') + text;
    },
    printErr: (text: string) => {
      stderrBuffer += (stderrBuffer ? '\n' : '') + text;
    },
  });

  emscriptenModule.__resetBuffers = () => {
    stdoutBuffer = '';
    stderrBuffer = '';
  };
  emscriptenModule.__getStdout = () => stdoutBuffer;
  emscriptenModule.__getStderr = () => stderrBuffer;

  try { emscriptenModule.FS.mkdir('/home'); } catch {}
  try { emscriptenModule.FS.mkdir('/home/repl'); } catch {}
  try { emscriptenModule.FS.mkdir('/tmp'); } catch {}
  try { emscriptenModule.FS.chdir('/home/repl'); } catch {}

  const virtualFileSystem: IShellVfs = createEmscriptenVfs(emscriptenModule);
  const runner: WasmAppletRunner = createBusyboxRunner(emscriptenModule, virtualFileSystem);

  return {
    module: emscriptenModule,
    virtualFileSystem,
    runner,
  };
}

export async function loadShRunner(): Promise<boolean> {
  const globalScope = globalThis as any;
  if (typeof globalScope.dcl_run_sh_wasm === 'function') {
    return true;
  }

  try {
    // Only apply Node fs shims inside Worker contexts (where window is undefined)
    if (typeof window === 'undefined' && !globalScope.fs) {
      globalScope.fs = {
        constants: { O_WRONLY: -1, O_RDWR: -1, O_CREAT: -1, O_TRUNC: -1, O_APPEND: -1, O_EXCL: -1 },
        writeSync: (_fd: number, buffer: Uint8Array) => buffer.length,
        write: (
          _fd: number,
          _buffer: Uint8Array,
          _offset: number,
          length: number,
          _pos: number,
          callback: (error: any, length: number) => void,
        ) => callback(null, length),
        stat: (_path: string, callback: (error: any, stats: any) => void) => {
          callback(null, {
            dev: 0, ino: 0, mode: 0o040777, nlink: 1, uid: 0, gid: 0, rdev: 0, size: 0,
            blksize: 4096, blocks: 0, atimeMs: 0, mtimeMs: 0, ctimeMs: 0, birthtimeMs: 0,
            isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false,
          });
        },
        lstat: (_path: string, callback: (error: any, stats: any) => void) => {
          callback(null, {
            dev: 0, ino: 0, mode: 0o040777, nlink: 1, uid: 0, gid: 0, rdev: 0, size: 0,
            blksize: 4096, blocks: 0, atimeMs: 0, mtimeMs: 0, ctimeMs: 0, birthtimeMs: 0,
            isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false,
          });
        },
        open: (_path: string, _flags: any, _mode: any, callback: (error: any) => void) =>
          callback(new Error('ENOSYS')),
        close: (_fd: any, callback: (error: any) => void) => callback(null),
      };
    }

    if (typeof globalScope.Go !== 'function') {
      const candidates = getAssetCandidates('wasm_exec.js');
      for (const url of candidates) {
        try {
          const response = await cachedAssetFetch(url);
          if (response.ok) {
            const scriptCode = await response.text();
            const evaluator = new Function(scriptCode);
            evaluator.call(globalThis);
            if (typeof globalScope.Go === 'function') {
              break;
            }
          }
        } catch {}
      }
    }

    if (typeof globalScope.Go !== 'function') {
      return false;
    }

    const wasmCandidates = getAssetCandidates('sh-runner.wasm');
    for (const wasmUrl of wasmCandidates) {
      try {
        const wasmResponse = await cachedAssetFetch(wasmUrl);
        if (wasmResponse.ok) {
          const wasmBuffer = await wasmResponse.arrayBuffer();
          const goInstance = new globalScope.Go();
          const { instance } = await WebAssembly.instantiate(wasmBuffer, goInstance.importObject);
          goInstance.run(instance);
          if (typeof globalScope.dcl_run_sh_wasm === 'function') {
            return true;
          }
        }
      } catch {}
    }
  } catch (error) {
    console.warn('WASM parser unavailable (using js):', error);
  }

  return false;
}
