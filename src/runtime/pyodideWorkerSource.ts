import dclIpythonSource from './python/dcl_ipython.py?raw';
import dclPackageManagerSource from './python/dcl_package_manager.py?raw';
import dclShellBridgeSource from './python/dcl_shell_bridge.py?raw';
import dclShellwhatParserSource from './python/dcl_shellwhat_parser.py?raw';
import {
  createBusyboxRunner,
  createEmscriptenVfs,
  createMemoryVfs,
  createShellInterpreter,
} from './shellInterpreter';
import { SHELLWHAT_PY_SOURCES } from './shellwhatSources';

export const PYODIDE_WORKER_SCRIPT = `
${createMemoryVfs.toString()}
${createEmscriptenVfs.toString()}
${createBusyboxRunner.toString()}
${createShellInterpreter.toString()}

let pyodide = null;
let pyodideReadyPromise = null;
let exercise = null;
let activeShell = null;
const loadedPackages = new Set();
const SHELLWHAT_SOURCES = ${JSON.stringify(SHELLWHAT_PY_SOURCES)};

const DCL_PACKAGE_MANAGER_SOURCE = ${JSON.stringify(dclPackageManagerSource)};
const DCL_SHELLWHAT_PARSER_SOURCE = ${JSON.stringify(dclShellwhatParserSource)};
const DCL_SHELL_BRIDGE_SOURCE = ${JSON.stringify(dclShellBridgeSource)};
const DCL_IPYTHON_SOURCE = ${JSON.stringify(dclIpythonSource)};

const PYODIDE_INDEX_URL = (typeof self !== "undefined" && self.DCL_PYODIDE_URL)
  ? self.DCL_PYODIDE_URL
  : "https://cdn.jsdelivr.net/pyodide/v0.27.3/full/";

// Pure-Python packages already prebuilt in Pyodide's own package registry -
// fast to load via pyodide.loadPackage(), no network round-trip to PyPI.
const PYTHONWHAT_BUILTIN_DEPENDENCIES = [
  "jinja2",
  "markupsafe",
  "asttokens",
  "six",
  "click",
  "packaging",
  "setuptools",
];

// Packages NOT bundled with Pyodide. Only the top-level package is listed
// here - micropip resolves the full transitive dependency graph itself
// (protowhat, dill, markdown2, jinja2, asttokens) from PyPI's metadata.
const PYTHONWHAT_MICROPIP_DEPENDENCIES = ["pyodide_backend", "bashlex"];

async function initPyodide() {
  if (pyodideReadyPromise) {
    return pyodideReadyPromise;
  }

  pyodideReadyPromise = (async () => {
    if (typeof importScripts === "function") {
      try {
        importScripts(PYODIDE_INDEX_URL + "pyodide.js");
      } catch (e) {}
    }
    const loadPyodideFunction = typeof globalThis.loadPyodide === "function" ? globalThis.loadPyodide : (typeof loadPyodide === "function" ? loadPyodide : null);
    if (!loadPyodideFunction) {
      throw new Error("Pyodide loader not available");
    }
    pyodide = await loadPyodideFunction({
      indexURL: PYODIDE_INDEX_URL,
      packages: ["micropip"]
    });

    // Install dcl_package_manager shim for legacy DataCamp Light v3 embeds
    await pyodide.runPythonAsync(DCL_PACKAGE_MANAGER_SOURCE);

    await pyodide.loadPackage(PYTHONWHAT_BUILTIN_DEPENDENCIES);

    const micropip = pyodide.pyimport("micropip");
    await micropip.install(PYTHONWHAT_MICROPIP_DEPENDENCIES);

    // Mount real shellwhat package sources into Pyodide virtual filesystem
    try { pyodide.FS.mkdirTree("/lib/python3.12/site-packages/shellwhat/checks"); } catch (e) {}
    for (const [filePath, content] of Object.entries(SHELLWHAT_SOURCES)) {
      pyodide.FS.writeFile("/lib/python3.12/site-packages/shellwhat/" + filePath, content);
    }

    try { pyodide.FS.mkdir("/home"); } catch (e) {}
    try { pyodide.FS.mkdir("/home/pyodide"); } catch (e) {}
    try { pyodide.FS.mkdir("/tmp"); } catch (e) {}
    try { pyodide.FS.chdir("/home/pyodide"); } catch (e) {}

    const wasmVirtualFileSystem = createEmscriptenVfs(pyodide);
    activeShell = createShellInterpreter({ vfs: wasmVirtualFileSystem });

    (async () => {
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
          } catch (e) {}

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

            const wasmRunner = createBusyboxRunner(mod, wasmVirtualFileSystem);
            activeShell = createShellInterpreter({
              vfs: wasmVirtualFileSystem,
              wasmRunner,
              preferWasmOverBuiltins: true,
            });
          }
        }
      } catch (e) {}
    })();

    globalThis.dcl_execute_shell = (commandString) => {
      if (!activeShell) return JSON.stringify({ output: "", error: "Shell not initialized", exitCode: 1 });
      const commandResult = activeShell.runCommand(commandString || "");
      return JSON.stringify(commandResult);
    };

    // Load ShellWhat parser and shims
    await pyodide.runPythonAsync(DCL_SHELLWHAT_PARSER_SOURCE);

    // Load POSIX Shell bridge hooking os.system and subprocess
    await pyodide.runPythonAsync(DCL_SHELL_BRIDGE_SOURCE);

    // Load IPython transformer and magics
    await pyodide.runPythonAsync(DCL_IPYTHON_SOURCE);

    return pyodide;
  })();

  return pyodideReadyPromise;
}

function transformCode(code) {
  if (!pyodide || !code) return code || "";
  try {
    const transformPythonFunction = pyodide.globals.get("dcl_transform_ipython");
    if (transformPythonFunction) {
      return transformPythonFunction(code);
    }
  } catch (error) {
    console.warn("IPython transform warning:", error);
  }
  return code || "";
}

async function loadPackagesForCode(code) {
  if (!pyodide || !code) return;
  try {
    const transformed = transformCode(code);
    await pyodide.loadPackagesFromImports(transformed);
  } catch (error) {
    console.warn("Could not auto-load packages from imports:", error);
  }
}

async function loadExplicitPackages(packages) {
  if (!pyodide || !packages || packages.length === 0) return;
  const packagesToLoad = [];
  for (const packageName of packages) {
    const normalizedPackageName = packageName.split("==")[0].trim();
    if (normalizedPackageName && !loadedPackages.has(normalizedPackageName)) {
      packagesToLoad.push(normalizedPackageName);
      loadedPackages.add(normalizedPackageName);
    }
  }
  if (packagesToLoad.length > 0) {
    try {
      await pyodide.loadPackage(packagesToLoad);
    } catch (error) {
      console.warn("Falling back to micropip for packages:", packagesToLoad, error);
      try {
        const micropip = pyodide.pyimport("micropip");
        for (const packageName of packagesToLoad) {
          await micropip.install(packageName);
        }
      } catch (micropipError) {
        console.error("Failed to install package via micropip:", micropipError);
      }
    }
  }
}

function graphPayloadToDataUrl(base64Svg) {
  return "data:image/svg+xml;base64," + base64Svg;
}

// Maps pyodide_backend's raw output entries into session_output notification shape.
function emitOutputEntries(entries) {
  const outputs = [];
  const errors = [];
  const graphs = [];

  for (const entry of entries) {
    if (entry.type === "graph") {
      const dataUrl = graphPayloadToDataUrl(entry.payload);
      graphs.push(dataUrl);
      self.postMessage({
        jsonrpc: "2.0",
        method: "session_output",
        params: { type: "graph", payload: dataUrl },
      });
    } else if (entry.type === "error") {
      errors.push(entry.payload);
      self.postMessage({
        jsonrpc: "2.0",
        method: "session_output",
        params: { type: "error", payload: entry.payload },
      });
    } else if (entry.type === "output" || entry.type === "result") {
      outputs.push(String(entry.payload));
      self.postMessage({
        jsonrpc: "2.0",
        method: "session_output",
        params: { type: "output", payload: String(entry.payload) },
      });
    } else if (entry.type === "script-output") {
      const text = entry.payload && entry.payload.output;
      if (text) {
        outputs.push(text);
        self.postMessage({
          jsonrpc: "2.0",
          method: "session_output",
          params: { type: "output", payload: text },
        });
      }
    }
  }

  return {
    output: outputs.join("\\n"),
    error: errors.length > 0 ? errors.join("\\n") : undefined,
    graph: graphs.length > 0 ? graphs[graphs.length - 1] : undefined,
  };
}

self.onmessage = async function (e) {
  const message = e.data;
  if (!message || message.jsonrpc !== "2.0") return;

  const { id, method, params } = message;

  try {
    await initPyodide();

    if (method === "initialize") {
      const { pec, solution, sct, packages } = params || {};
      if (packages && Array.isArray(packages)) {
        await loadExplicitPackages(packages);
      }
      const combinedForImportScan = [pec, solution].filter(Boolean).join("\\n");
      await loadPackagesForCode(combinedForImportScan);

      const PyodideExercise = pyodide.pyimport("pyodide_backend").PyodideExercise;
      exercise = PyodideExercise(pec || "", solution || "", sct || "");

      const initResultJson = exercise.run_init();
      const initEntries = JSON.parse(initResultJson);
      emitOutputEntries(initEntries);

      self.postMessage({
        jsonrpc: "2.0",
        id,
        result: { status: "ready" }
      });
      return;
    }

    if (method === "runCode") {
      const { code, height, width, stdin } = params || {};
      const transformedCode = transformCode(code);
      await loadPackagesForCode(transformedCode);

      try {
        const setStandardInputPythonFunction = pyodide.globals.get("_dcl_set_stdin");
        if (setStandardInputPythonFunction) setStandardInputPythonFunction(stdin || null);
      } catch (e) {}

      if (!exercise) {
        const PyodideExercise = pyodide.pyimport("pyodide_backend").PyodideExercise;
        exercise = PyodideExercise("", "", "");
      }

      const resultJson = exercise.run_code(transformedCode || "", height || 320, width || 320);
      const entries = JSON.parse(resultJson);
      const aggregated = emitOutputEntries(entries);

      self.postMessage({
        jsonrpc: "2.0",
        id,
        result: aggregated
      });
      return;
    }

    if (method === "submitCode") {
      const { code, height, width, stdin } = params || {};
      const transformedCode = transformCode(code);
      await loadPackagesForCode(transformedCode);

      try {
        const setStandardInputPythonFunction = pyodide.globals.get("_dcl_set_stdin");
        if (setStandardInputPythonFunction) setStandardInputPythonFunction(stdin || null);
      } catch (e) {}

      if (!exercise) {
        self.postMessage({
          jsonrpc: "2.0",
          id,
          error: { code: -32603, message: "Session was not initialized before submitCode" },
        });
        return;
      }

      let resultJson;
      try {
        resultJson = exercise.run_submit(transformedCode || "", height || 320, width || 320);
      } catch (submitError) {
        console.error("[DataCamp Light SCT Exception]", submitError);
        const rawErrorString = String(submitError && submitError.message ? submitError.message : submitError);
        let sanitizedErrorMessage = rawErrorString;

        if (rawErrorString.indexOf("InstructorError:") !== -1) {
          const parts = rawErrorString.split("InstructorError:")[1];
          const desc = parts.split("Debug on error:")[0].split("\\n")[0].trim();
          sanitizedErrorMessage = "SCT Error: " + desc;
        } else if (rawErrorString.indexOf("SyntaxError:") !== -1) {
          const parts = rawErrorString.split("SyntaxError:")[1];
          sanitizedErrorMessage = "SCT SyntaxError: " + parts.split("\\n")[0].trim();
        } else if (rawErrorString.indexOf("NameError:") !== -1) {
          const parts = rawErrorString.split("NameError:")[1];
          sanitizedErrorMessage = "SCT NameError: " + parts.split("\\n")[0].trim();
        } else {
          const lines = rawErrorString.split("\\n").map((l) => l.trim()).filter(Boolean);
          sanitizedErrorMessage = lines[lines.length - 1] || "Error during SCT evaluation.";
        }

        self.postMessage({
          jsonrpc: "2.0",
          method: "session_output",
          params: { type: "sct", payload: { correct: false, message: sanitizedErrorMessage } },
        });

        self.postMessage({
          jsonrpc: "2.0",
          id,
          result: {
            correct: false,
            message: sanitizedErrorMessage,
            output: "",
          },
        });
        return;
      }

      const entries = JSON.parse(resultJson);

      const sctEntry = entries.find((entry) => entry.type === "sct");
      const outputEntries = entries.filter((entry) => entry.type !== "sct");
      const aggregated = emitOutputEntries(outputEntries);

      const correct = sctEntry ? Boolean(sctEntry.payload.correct) : false;
      const sctMessage = sctEntry ? sctEntry.payload.message : "No SCT was evaluated.";

      self.postMessage({
        jsonrpc: "2.0",
        method: "session_output",
        params: { type: "sct", payload: { correct, message: sctMessage } },
      });

      self.postMessage({
        jsonrpc: "2.0",
        id,
        result: {
          correct,
          message: sctMessage,
          output: aggregated.output,
          graph: aggregated.graph,
        }
      });
      return;
    }

    if (method === "evaluateShellwhat") {
      const { sct, student_code, student_result, pec, solution } = params || {};
      await initPyodide();
      const evaluateShellwhatPy = pyodide.globals.get("evaluate_shellwhat");
      if (!evaluateShellwhatPy) {
        throw new Error("shellwhat evaluation function not initialized in Pyodide");
      }
      const rawRes = evaluateShellwhatPy(
        sct || "",
        student_code || "",
        student_result || "",
        pec || "",
        solution || ""
      );
      const res = JSON.parse(rawRes);
      self.postMessage({
        jsonrpc: "2.0",
        id,
        result: res,
      });
      return;
    }

    self.postMessage({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: "Method not found: " + method }
    });
  } catch (error) {
    self.postMessage({
      jsonrpc: "2.0",
      id,
      error: { code: -32603, message: (error && error.message) || String(error) }
    });
  }
};
`;
