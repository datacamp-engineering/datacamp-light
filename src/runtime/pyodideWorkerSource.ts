import { SHELLWHAT_PY_SOURCES } from './shellwhatSources';

export const PYODIDE_WORKER_SCRIPT = `
let pyodide = null;
let pyodideReadyPromise = null;
let exercise = null;
const loadedPackages = new Set();
const SHELLWHAT_SOURCES = ${JSON.stringify(SHELLWHAT_PY_SOURCES)};

const PYODIDE_INDEX_URL = "https://cdn.jsdelivr.net/pyodide/v0.27.3/full/";

// Pure-Python packages already prebuilt in Pyodide's own package registry -
// fast to load via pyodide.loadPackage(), no network round-trip to PyPI.
const PYTHONWHAT_BUILTIN_DEPS = [
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
// Do NOT hand-list transitive deps here: some of them are pinned exactly
// by protowhat (e.g. markdown2==2.5.3), and separately requesting an
// unpinned "markdown2" first causes micropip to grab the newest release
// and then fail with a version conflict once protowhat's exact pin is
// resolved. Let the resolver own the whole graph from one entry point.
const PYTHONWHAT_MICROPIP_DEPS = ["pyodide_backend", "bashlex"];

async function initPyodide() {
  if (pyodideReadyPromise) {
    return pyodideReadyPromise;
  }

  pyodideReadyPromise = (async () => {
    importScripts(PYODIDE_INDEX_URL + "pyodide.js");
    pyodide = await loadPyodide({
      indexURL: PYODIDE_INDEX_URL,
      packages: ["micropip"]
    });

    // Install dcl_package_manager shim for legacy DataCamp Light v3 embeds
    // that inject "from dcl_package_manager import install_packages, ..."
    // into pre-exercise-code via getPackages(). Actual package loading
    // happens on the JS side (loadExplicitPackages/loadPackagesForCode)
    // before this Python code runs, so these are safe no-ops.
    await pyodide.runPythonAsync(\`
import sys
import types

dcl_pm = types.ModuleType("dcl_package_manager")

def install_packages(packages):
    pass

def print_packages():
    pass

def get_packages(registry=None):
    return []

def get_registry():
    return {"packages": {}}

dcl_pm.install_packages = install_packages
dcl_pm.print_packages = print_packages
dcl_pm.get_packages = get_packages
dcl_pm.get_registry = get_registry
sys.modules["dcl_package_manager"] = dcl_pm
\`);

    await pyodide.loadPackage(PYTHONWHAT_BUILTIN_DEPS);

    const micropip = pyodide.pyimport("micropip");
    await micropip.install(PYTHONWHAT_MICROPIP_DEPS);

    await pyodide.runPythonAsync(\`
import json
import types
import collections
import collections.abc
for attr in ["Mapping", "MutableMapping", "Sequence", "Iterable", "Callable"]:
    if not hasattr(collections, attr):
        setattr(collections, attr, getattr(collections.abc, attr))

import markupsafe
if not hasattr(markupsafe, "soft_unicode"):
    markupsafe.soft_unicode = markupsafe.soft_str

# Provide antlr_ast.ast.Speaker shim in sys.modules so shellwhat/parsers.py imports cleanly
antlr_ast = types.ModuleType("antlr_ast")
antlr_ast_ast = types.ModuleType("antlr_ast.ast")

class Speaker:
    def __init__(self, nodes=None):
        self.nodes = nodes or {}
    def describe(self, node, fmt=None, field=None, **kwargs):
        if fmt:
            return fmt
        return getattr(node, "name", type(node).__name__)

antlr_ast_ast.Speaker = Speaker
antlr_ast.ast = antlr_ast_ast
sys.modules["antlr_ast"] = antlr_ast
sys.modules["antlr_ast.ast"] = antlr_ast_ast
\`);

    // Mount real shellwhat package sources into Pyodide virtual filesystem
    try { pyodide.FS.mkdirTree("/lib/python3.12/site-packages/shellwhat/checks"); } catch (e) {}
    for (const [filePath, content] of Object.entries(SHELLWHAT_SOURCES)) {
      pyodide.FS.writeFile("/lib/python3.12/site-packages/shellwhat/" + filePath, content);
    }

    await pyodide.runPythonAsync(\`
import bashlex
import shellwhat
import shellwhat.parsers
import shellwhat.State
import shellwhat.test_exercise
from protowhat.utils_ast import AstNode, AstModule

class BashNode(AstNode):
    position = ((1, 0), (1, 0))
    text = ""
    _fields = ("child", "words", "parts", "children", "token")
    @property
    def name(self):
        return type(self).__name__
    def get_text(self, full_text=None):
        return getattr(self, "text", "") or getattr(self, "val", "")
    def get_position(self):
        return getattr(self, "position", ((1, 0), (1, 0)))

class BashParser(AstModule):
    AstNode = BashNode
    speaker = Speaker(nodes={})

    @classmethod
    def load(cls, node):
        obj = super().load(node)
        if isinstance(obj, cls.AstNode):
            obj.text = node.get("text", "")
            obj.position = node.get("position", ((1, 0), (1, 0)))
        return obj

    @classmethod
    def parse(cls, code, strict=True):
        if not code or not code.strip():
            return cls.load({"type": "Sentence", "data": {"child": None}})
        try:
            nodes = bashlex.parse(code)
        except Exception as e:
            raise cls.ParseError(str(e))

        def convert_node(n):
            kind = getattr(n, "kind", None)
            pos = getattr(n, "pos", (0, 0))
            if kind == "command":
                words = [convert_node(p) for p in getattr(n, "parts", []) if p.kind == "word"]
                return {"type": "SimpleCommand", "text": code[pos[0]:pos[1]], "position": pos, "data": {"words": words}}
            elif kind == "word":
                parts = []
                for sp in getattr(n, "parts", []):
                    if sp.kind == "parameter":
                        raw = code[sp.pos[0]:sp.pos[1]]
                        is_braced = raw.startswith("\\\${")
                        parts.append({
                            "type": "BracedVarSub" if is_braced else "SimpleVarSub",
                            "text": raw,
                            "position": sp.pos,
                            "data": {"token": {"type": "Token", "data": {"val": "$" + sp.value if not is_braced else sp.value}}}
                        })
                if not parts:
                    parts.append({"type": "Literal", "text": n.word, "position": pos, "data": {"token": {"type": "Token", "data": {"val": n.word}}}})
                return {"type": "CompoundWord", "text": n.word, "position": pos, "data": {"parts": parts}}
            elif kind == "pipeline":
                children = [convert_node(p) for p in getattr(n, "parts", []) if p.kind != "pipe"]
                return {"type": "Pipeline", "text": code[pos[0]:pos[1]], "position": pos, "data": {"children": children}}
            elif kind == "list":
                children = [convert_node(p) for p in getattr(n, "parts", []) if p.kind != "operator"]
                return {"type": "CommandList", "text": code[pos[0]:pos[1]], "position": pos, "data": {"children": children}}
            return {"type": "Literal", "text": str(n), "position": pos, "data": {"token": {"type": "Token", "data": {"val": str(n)}}}}

        converted = [convert_node(n) for n in nodes]
        child = converted[0] if len(converted) == 1 else {"type": "CommandList", "text": code, "position": (0, len(code)), "data": {"children": converted}}
        return cls.load({"type": "Sentence", "text": code, "position": (0, len(code)), "data": {"child": child}})

# Plug in the external BashParser on pristine shellwhat
shellwhat.State.DEFAULT_PARSER = BashParser

class PyodideShellConnection:
    def __init__(self, execute_fn=None):
        self.execute_fn = execute_fn
    def run_command(self, cmd):
        if not self.execute_fn:
            return ""
        try:
            res = self.execute_fn(cmd)
            return getattr(res, "output", "") or ""
        except Exception:
            return ""

def evaluate_shellwhat(sct, student_code, student_result, pec="", solution=""):
    conn = PyodideShellConnection()
    try:
        result = shellwhat.test_exercise.test_exercise(
            sct=sct,
            student_code=student_code or "",
            student_result=student_result or "",
            student_conn=conn,
            solution_code=solution or "",
            solution_result="",
            solution_conn=conn,
            pre_exercise_code=pec or "",
            ex_type="ShellExercise",
            error=[],
        )
        return json.dumps({
            "correct": bool(result.get("correct", False)),
            "message": result.get("message", "Submission evaluated.")
        })
    except Exception as err:
        return json.dumps({
            "correct": False,
            "message": str(err)
        })
\`);

    return pyodide;
  })();

  return pyodideReadyPromise;
}

async function loadPackagesForCode(code) {
  if (!pyodide || !code) return;
  try {
    await pyodide.loadPackagesFromImports(code);
  } catch (err) {
    console.warn("Could not auto-load packages from imports:", err);
  }
}

async function loadExplicitPackages(packages) {
  if (!pyodide || !packages || packages.length === 0) return;
  const packagesToLoad = [];
  for (const pkg of packages) {
    const cleanPkg = pkg.split("==")[0].trim();
    if (cleanPkg && !loadedPackages.has(cleanPkg)) {
      packagesToLoad.push(cleanPkg);
      loadedPackages.add(cleanPkg);
    }
  }
  if (packagesToLoad.length > 0) {
    try {
      await pyodide.loadPackage(packagesToLoad);
    } catch (err) {
      console.warn("Falling back to micropip for packages:", packagesToLoad, err);
      try {
        const micropip = pyodide.pyimport("micropip");
        for (const pkg of packagesToLoad) {
          await micropip.install(pkg);
        }
      } catch (mpErr) {
        console.error("Failed to install package via micropip:", mpErr);
      }
    }
  }
}

// pyodide_backend's WasmProcess unconditionally runs
// "matplotlib.use('module://pyodide_backend.matplotlib_custom_backend')" on
// every process creation. That call is caught and swallowed internally if
// matplotlib isn't installed (InteractiveShell.run_cell never raises), so
// it's safe to only load matplotlib when the student's code actually
// references it - detected the same way as any other on-demand package.

function graphPayloadToDataUrl(base64Svg) {
  return "data:image/svg+xml;base64," + base64Svg;
}

// Maps pyodide_backend's raw output entries (see exercise.py/task.py) into
// this worker's session_output notification shape.
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
      // run_submit() maps plain "output" entries into this shape.
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
      const { code, height, width } = params || {};
      await loadPackagesForCode(code);

      if (!exercise) {
        // No pre-exercise-code/solution/sct configured; still allow ad-hoc
        // execution via a bare exercise instance.
        const PyodideExercise = pyodide.pyimport("pyodide_backend").PyodideExercise;
        exercise = PyodideExercise("", "", "");
      }

      const resultJson = exercise.run_code(code || "", height || 320, width || 320);
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
      const { code, height, width } = params || {};
      await loadPackagesForCode(code);

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
        resultJson = exercise.run_submit(code || "", height || 320, width || 320);
      } catch (submitErr) {
        console.error("[DataCamp Light SCT Exception]", submitErr);
        const rawErrStr = String(submitErr && submitErr.message ? submitErr.message : submitErr);
        let cleanMsg = rawErrStr;

        if (rawErrStr.indexOf("InstructorError:") !== -1) {
          const parts = rawErrStr.split("InstructorError:")[1];
          const desc = parts.split("Debug on error:")[0].split("\\n")[0].trim();
          cleanMsg = "SCT Error: " + desc;
        } else if (rawErrStr.indexOf("SyntaxError:") !== -1) {
          const parts = rawErrStr.split("SyntaxError:")[1];
          cleanMsg = "SCT SyntaxError: " + parts.split("\\n")[0].trim();
        } else if (rawErrStr.indexOf("NameError:") !== -1) {
          const parts = rawErrStr.split("NameError:")[1];
          cleanMsg = "SCT NameError: " + parts.split("\\n")[0].trim();
        } else {
          const lines = rawErrStr.split("\\n").map((l) => l.trim()).filter(Boolean);
          cleanMsg = lines[lines.length - 1] || "Error during SCT evaluation.";
        }

        self.postMessage({
          jsonrpc: "2.0",
          method: "session_output",
          params: { type: "sct", payload: { correct: false, message: cleanMsg } },
        });

        self.postMessage({
          jsonrpc: "2.0",
          id,
          result: {
            correct: false,
            message: cleanMsg,
            output: "",
          },
        });
        return;
      }

      const entries = JSON.parse(resultJson);

      // The SCT result is the last entry; everything before it is output.
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

    // Method not found
    self.postMessage({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: "Method not found: " + method }
    });
  } catch (err) {
    self.postMessage({
      jsonrpc: "2.0",
      id,
      error: { code: -32603, message: (err && err.message) || String(err) }
    });
  }
};
`;
