import {
  createBusyboxRunner,
  createEmscriptenVfs,
  createMemoryVfs,
  createShellInterpreter,
} from './shellInterpreter';

/**
 * Shell Web Worker script.
 *
 * In browser environments, it lazily loads and initializes the prebuilt
 * WebAssembly BusyBox runtime (busybox.js + busybox.wasm) with in-memory MEMFS
 * (/home/repl) for true POSIX C binary execution.
 *
 * Asset base resolution (busybox.js / busybox.wasm):
 * 1. self.DCL_ASSET_BASE_URL if the host page injected one (production:
 *    fixed CDN base, dev: '' -> resolved against the dev-server origin).
 * 2. location.origin as a last-resort fallback (keeps local dev working when
 *    the host page does not inject a base).
 *
 * It embeds createShellInterpreter() as a fallback for test/mock environments
 * and for immediate responsiveness before WASM initialization.
 */
export const SHELL_WORKER_SCRIPT = `
${createMemoryVfs.toString()}
${createEmscriptenVfs.toString()}
${createBusyboxRunner.toString()}
${createShellInterpreter.toString()}

let activeShell = createShellInterpreter();
let wasmModule = null;
let wasmReadyPromise = null;

async function getWasmModule() {
  if (wasmReadyPromise) return wasmReadyPromise;

  wasmReadyPromise = (async () => {
    try {
      if (typeof importScripts === "function") {
        const resolveAssetUrl = (file) => {
          if (typeof self !== "undefined" && self.DCL_ASSET_BASE_URL) {
            return String(self.DCL_ASSET_BASE_URL).replace(/\\/+$/, "") + "/" + file;
          }
          const origin = (typeof location !== "undefined" && location.origin) ? location.origin : "";
          return (origin ? origin + "/" : "/") + file;
        };
        const scriptUrl = resolveAssetUrl("busybox.js");
        try {
          importScripts(scriptUrl);
        } catch (e) {
          // Fallback if importScripts failed
        }

        if (typeof globalThis.EmscrJSR_busybox === "function") {
          let stdoutBuffer = "";
          let stderrBuffer = "";

          const mod = await globalThis.EmscrJSR_busybox({
            locateFile: (p) => resolveAssetUrl(p),
            thisProgram: "busybox",
            noInitialRun: true,
            noExitRuntime: true,
            print: (text) => {
              stdoutBuffer += (stdoutBuffer ? "\\n" : "") + text;
            },
            printErr: (text) => {
              stderrBuffer += (stderrBuffer ? "\\n" : "") + text;
            },
          });

          mod.__resetBuffers = () => {
            stdoutBuffer = "";
            stderrBuffer = "";
          };
          mod.__getStdout = () => stdoutBuffer;
          mod.__getStderr = () => stderrBuffer;

          try { mod.FS.mkdir("/home"); } catch (e) {}
          try { mod.FS.mkdir("/home/repl"); } catch (e) {}
          try { mod.FS.mkdir("/tmp"); } catch (e) {}
          mod.FS.chdir("/home/repl");

          const wasmVfs = createEmscriptenVfs(mod);
          const wasmRunner = createBusyboxRunner(mod, wasmVfs);
          activeShell = createShellInterpreter({
            vfs: wasmVfs,
            wasmRunner,
            preferWasmOverBuiltins: true,
          });
          wasmModule = mod;
          return mod;
        }
      }
    } catch (err) {
      console.warn("BusyBox WASM init notice (using fallback):", err);
    }
    return null;
  })();

  return wasmReadyPromise;
}

self.onmessage = async function (e) {
  const message = e.data;
  if (!message || message.jsonrpc !== "2.0") return;
  const { id, method, params } = message;

  try {
    if (method === "initialize") {
      const { pec } = params || {};
      const mod = await getWasmModule();
      console.log("[DataCamp Light] Shell engine active:", mod ? "BusyBox WebAssembly (wasm)" : "JS fallback interpreter");
      if (pec) activeShell.runScript(pec);
      self.postMessage({ jsonrpc: "2.0", id, result: { status: "ready", engine: mod ? "wasm" : "fallback" } });
      return;
    }

    if (method === "runCommand") {
      const { command } = params || {};
      await getWasmModule();
      const result = activeShell.runCommand(command || "");
      self.postMessage({
        jsonrpc: "2.0",
        id,
        result: {
          output: result.output || "",
          error: result.error,
          cwd: activeShell.getCwd(),
        },
      });
      return;
    }

    if (method === "runCode") {
      const { code } = params || {};
      await getWasmModule();
      const res = activeShell.runScript(code || "");
      if (res.output) {
        self.postMessage({
          jsonrpc: "2.0",
          method: "session_output",
          params: { type: "output", payload: res.output },
        });
      }
      if (res.error) {
        self.postMessage({
          jsonrpc: "2.0",
          method: "session_output",
          params: { type: "error", payload: res.error },
        });
      }
      self.postMessage({ jsonrpc: "2.0", id, result: { output: res.output, error: res.error || undefined } });
      return;
    }

    if (method === "submitCode") {
      const { code, sct, pec } = params || {};
      await getWasmModule();
      if (pec) activeShell.runScript(pec);
      const res = activeShell.runScript(code || "");

      let correct = !res.error;
      let message = correct
        ? "Great work! Your solution passed all tests."
        : res.error || "Incorrect command. Please review your input.";

      if (sct && sct.trim() && correct) {
        const sctMatch = sct.match(/test_student_typed\\(\\s*r?['"](.+?)['"]/);
        if (sctMatch) {
          const regex = new RegExp(sctMatch[1]);
          if (!regex.test(code)) {
            correct = false;
            const msgMatch = sct.match(/msg\\s*=\\s*['"](.+?)['"]/);
            message = msgMatch ? msgMatch[1] : "Your command did not match the expected pattern.";
          }
        }
      }

      self.postMessage({
        jsonrpc: "2.0",
        method: "session_output",
        params: { type: "sct", payload: { correct, message } },
      });

      self.postMessage({
        jsonrpc: "2.0",
        id,
        result: { correct, message, output: res.output },
      });
      return;
    }

    self.postMessage({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: "Method not found: " + method },
    });
  } catch (err) {
    self.postMessage({
      jsonrpc: "2.0",
      id,
      error: { code: -32603, message: (err && err.message) || String(err) },
    });
  }
};
`;
