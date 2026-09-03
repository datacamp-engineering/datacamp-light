import { createMemoryVfs, createShellInterpreter } from './shellInterpreter';

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
${createShellInterpreter.toString()}

const jsFallbackShell = createShellInterpreter();
let wasmModule = null;
let wasmReadyPromise = null;
let stdoutBuffer = "";
let stderrBuffer = "";

function tokenize(command) {
  const tokens = [];
  let current = "";
  let inQuotes = false;
  let quoteChar = "";
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (inQuotes) {
      if (ch === quoteChar) {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuotes = true;
      quoteChar = ch;
    } else if (ch === " ") {
      if (current) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

function splitPipes(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  let quoteChar = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === quoteChar) inQuotes = false;
      current += ch;
    } else if (ch === '"' || ch === "'") {
      inQuotes = true;
      quoteChar = ch;
      current += ch;
    } else if (ch === "|" && line[i + 1] !== "|") {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

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
          const mod = await globalThis.EmscrJSR_busybox({
            locateFile: (p) => resolveAssetUrl(p),
            thisProgram: "busybox",
            noInitialRun: true,
            noExitRuntime: true,
            print: (t) => { stdoutBuffer += t + "\\n"; },
            printErr: (t) => { stderrBuffer += t + "\\n"; },
          });

          try { mod.FS.mkdir("/home"); } catch (e) {}
          try { mod.FS.mkdir("/home/repl"); } catch (e) {}
          mod.FS.chdir("/home/repl");
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

function runWasmApplet(mod, applet, args = []) {
  stdoutBuffer = "";
  stderrBuffer = "";
  let exitCode = 0;
  try {
    mod.callMain([applet, ...args]);
  } catch (e) {
    if (typeof e === "number") exitCode = e;
    else if (e && typeof e.status === "number") exitCode = e.status;
  }
  return {
    output: stdoutBuffer,
    error: stderrBuffer || undefined,
    exitCode,
  };
}

async function executeCommand(command) {
  const mod = await getWasmModule();
  if (!mod) {
    const res = jsFallbackShell.runCommand(command);
    return {
      output: res.output || "",
      error: res.error,
      cwd: jsFallbackShell.getCwd(),
    };
  }

  const trimmed = (command || "").trim();
  if (!trimmed) {
    return { output: "", cwd: mod.FS.cwd() };
  }

  const argv = tokenize(trimmed);
  if (argv.length === 0) {
    return { output: "", cwd: mod.FS.cwd() };
  }

  // Handle pipeline
  if (trimmed.includes("|")) {
    const stages = splitPipes(trimmed);
    let curData = "";
    for (let i = 0; i < stages.length; i++) {
      const stageTokens = tokenize(stages[i]);
      if (stageTokens.length === 0) continue;
      const stageCmd = stageTokens[0];
      const stageArgs = stageTokens.slice(1);
      const tempPipe = "/tmp/.dcl_pipe_" + i;
      if (i > 0) {
        mod.FS.writeFile(tempPipe, curData);
        stageArgs.push(tempPipe);
      }
      const stageRes = runWasmApplet(mod, stageCmd, stageArgs);
      curData = stageRes.output || "";
    }
    return { output: curData, cwd: mod.FS.cwd() };
  }

  // Handle redirection
  let stdoutFile = null;
  let stdoutAppend = false;
  const cleanArgv = [];
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === ">" && i + 1 < argv.length) {
      stdoutFile = argv[++i];
      stdoutAppend = false;
    } else if (t === ">>" && i + 1 < argv.length) {
      stdoutFile = argv[++i];
      stdoutAppend = true;
    } else {
      cleanArgv.push(t);
    }
  }

  if (cleanArgv.length === 0) {
    return { output: "", cwd: mod.FS.cwd() };
  }

  const cmd = cleanArgv[0];
  const args = cleanArgv.slice(1);

  function resolveFsPath(p) {
    if (!p) return mod.FS.cwd();
    if (p.startsWith("/")) return p;
    if (p === "~" || p.startsWith("~/")) return p.replace(/^~/, "/home/repl");
    const c = mod.FS.cwd();
    return (c === "/" ? "" : c) + "/" + p;
  }

  if (cmd === "cd") {
    const target = resolveFsPath(args[0] || "/home/repl");
    try {
      mod.FS.chdir(target);
      return { output: "", cwd: mod.FS.cwd() };
    } catch (err) {
      return { error: "cd: " + (args[0] || "") + ": No such file or directory\\n", cwd: mod.FS.cwd() };
    }
  }

  if (cmd === "pwd") {
    return { output: mod.FS.cwd() + "\\n", cwd: mod.FS.cwd() };
  }

  if (cmd === "touch") {
    const targetFiles = args.filter((a) => !a.startsWith("-"));
    if (targetFiles.length === 0) {
      return { error: "touch: missing file operand\\n", cwd: mod.FS.cwd() };
    }
    for (const f of targetFiles) {
      const full = resolveFsPath(f);
      try {
        if (!mod.FS.analyzePath(full).exists) {
          mod.FS.writeFile(full, "");
        }
      } catch (err) {
        return { error: "touch: cannot touch '" + f + "': No such file or directory\\n", cwd: mod.FS.cwd() };
      }
    }
    return { output: "", cwd: mod.FS.cwd() };
  }

  if (cmd === "mkdir") {
    const pFlag = args.includes("-p");
    const dirs = args.filter((a) => !a.startsWith("-"));
    if (dirs.length === 0) {
      return { error: "mkdir: missing operand\\n", cwd: mod.FS.cwd() };
    }
    for (const d of dirs) {
      const full = resolveFsPath(d);
      try {
        if (pFlag) {
          const parts = full.split("/").filter(Boolean);
          let cur = "";
          for (const part of parts) {
            cur += "/" + part;
            try { mod.FS.mkdir(cur); } catch (e) {}
          }
        } else {
          mod.FS.mkdir(full);
        }
      } catch (err) {
        return { error: "mkdir: cannot create directory '" + d + "': File exists\\n", cwd: mod.FS.cwd() };
      }
    }
    return { output: "", cwd: mod.FS.cwd() };
  }

  if (cmd === "rm") {
    const targets = args.filter((a) => !a.startsWith("-"));
    if (targets.length === 0) {
      return { error: "rm: missing operand\\n", cwd: mod.FS.cwd() };
    }
    for (const t of targets) {
      const full = resolveFsPath(t);
      try {
        const stat = mod.FS.stat(full);
        if (mod.FS.isDir(stat.mode)) {
          mod.FS.rmdir(full);
        } else {
          mod.FS.unlink(full);
        }
      } catch (err) {
        return { error: "rm: cannot remove '" + t + "': No such file or directory\\n", cwd: mod.FS.cwd() };
      }
    }
    return { output: "", cwd: mod.FS.cwd() };
  }

  if (cmd === "cp") {
    const nonFlags = args.filter((a) => !a.startsWith("-"));
    if (nonFlags.length < 2) {
      return { error: "cp: missing destination file operand\\n", cwd: mod.FS.cwd() };
    }
    const src = resolveFsPath(nonFlags[0]);
    const dst = resolveFsPath(nonFlags[1]);
    try {
      const data = mod.FS.readFile(src);
      mod.FS.writeFile(dst, data);
      return { output: "", cwd: mod.FS.cwd() };
    } catch (err) {
      return { error: "cp: cannot stat '" + nonFlags[0] + "': No such file or directory\\n", cwd: mod.FS.cwd() };
    }
  }

  if (cmd === "mv") {
    const nonFlags = args.filter((a) => !a.startsWith("-"));
    if (nonFlags.length < 2) {
      return { error: "mv: missing destination file operand\\n", cwd: mod.FS.cwd() };
    }
    const src = resolveFsPath(nonFlags[0]);
    const dst = resolveFsPath(nonFlags[1]);
    try {
      mod.FS.rename(src, dst);
      return { output: "", cwd: mod.FS.cwd() };
    } catch (err) {
      return { error: "mv: cannot stat '" + nonFlags[0] + "': No such file or directory\\n", cwd: mod.FS.cwd() };
    }
  }

  if (cmd === "clear") {
    return { output: "\\x1bc", cwd: mod.FS.cwd() };
  }

  const res = runWasmApplet(mod, cmd, args);

  if (stdoutFile) {
    const fullTarget = stdoutFile.startsWith("/") ? stdoutFile : mod.FS.cwd() + "/" + stdoutFile;
    const existing = stdoutAppend ? (function() { try { return mod.FS.readFile(fullTarget, { encoding: "utf8" }); } catch(e){ return ""; } })() : "";
    mod.FS.writeFile(fullTarget, existing + (res.output || ""));
    return { output: "", error: res.error, cwd: mod.FS.cwd() };
  }

  return {
    output: res.output || "",
    error: res.error,
    cwd: mod.FS.cwd(),
  };
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
      if (pec) await executeCommand(pec);
      self.postMessage({ jsonrpc: "2.0", id, result: { status: "ready", engine: mod ? "wasm" : "fallback" } });
      return;
    }

    if (method === "runCommand") {
      const { command } = params || {};
      const result = await executeCommand(command || "");
      self.postMessage({
        jsonrpc: "2.0",
        id,
        result: {
          output: result.output || "",
          error: result.error,
          cwd: result.cwd,
        },
      });
      return;
    }

    if (method === "runCode") {
      const { code } = params || {};
      const lines = (code || "").split("\\n").map((l) => l.trim()).filter(Boolean);
      const outputs = [];
      const errors = [];
      for (const line of lines) {
        const res = await executeCommand(line);
        if (res.output) outputs.push(res.output);
        if (res.error) errors.push(res.error);
      }
      const output = outputs.join("\\n");
      const error = errors.join("\\n");
      if (output) {
        self.postMessage({
          jsonrpc: "2.0",
          method: "session_output",
          params: { type: "output", payload: output },
        });
      }
      if (error) {
        self.postMessage({
          jsonrpc: "2.0",
          method: "session_output",
          params: { type: "error", payload: error },
        });
      }
      self.postMessage({ jsonrpc: "2.0", id, result: { output, error: error || undefined } });
      return;
    }

    if (method === "submitCode") {
      const { code, sct, pec } = params || {};
      if (pec) await executeCommand(pec);
      const lines = (code || "").split("\\n").map((l) => l.trim()).filter(Boolean);
      const outputs = [];
      const errors = [];
      for (const line of lines) {
        const res = await executeCommand(line);
        if (res.output) outputs.push(res.output);
        if (res.error) errors.push(res.error);
      }
      const output = outputs.join("\\n");
      const error = errors.join("\\n");

      let correct = !error;
      let message = correct
        ? "Great work! Your solution passed all tests."
        : error || "Incorrect command. Please review your input.";

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
        result: { correct, message, output },
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
      error: { code: -32603, message: err && err.message ? err.message : String(err) },
    });
  }
};
`;
