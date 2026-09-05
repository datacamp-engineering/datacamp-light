import ast
import inspect
import json
import re
import sys
import types


def _extract_static_symbols(code):
    symbols = {}
    if not code or not code.strip():
        return symbols

    def add_symbol(name, symbol_type, detail="", documentation="", boost=88):
        if not name or name.startswith("_"):
            return
        if name not in symbols or symbols[name]["boost"] < boost:
            symbols[name] = {
                "label": name,
                "type": symbol_type,
                "detail": detail,
                "info": documentation,
                "boost": boost,
            }

    tree = None
    try:
        tree = ast.parse(code)
    except SyntaxError:
        valid_lines = []
        for line in code.splitlines():
            valid_lines.append(line)
            try:
                tree = ast.parse("\n".join(valid_lines))
            except SyntaxError:
                pass

    if tree:
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                doc = ast.get_docstring(node) or ""
                args = [a.arg for a in node.args.args]
                sig = "(" + ", ".join(args) + ")"
                add_symbol(node.name, "function", sig, doc, boost=90)
            elif isinstance(node, ast.ClassDef):
                doc = ast.get_docstring(node) or ""
                add_symbol(node.name, "class", "class", doc, boost=90)
            elif isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        add_symbol(target.id, "variable", "variable", boost=88)
                    elif isinstance(target, (ast.Tuple, ast.List)):
                        for element in target.elts:
                            if isinstance(element, ast.Name):
                                add_symbol(element.id, "variable", "variable", boost=88)
            elif isinstance(node, ast.AnnAssign):
                if isinstance(node.target, ast.Name):
                    add_symbol(node.target.id, "variable", "variable", boost=88)
            elif isinstance(node, ast.NamedExpr):
                if isinstance(node.target, ast.Name):
                    add_symbol(node.target.id, "variable", "variable", boost=88)
            elif isinstance(node, ast.Import):
                for alias in node.names:
                    name = alias.asname or alias.name
                    add_symbol(name, "module", "module", boost=86)
            elif isinstance(node, ast.ImportFrom):
                for alias in node.names:
                    name = alias.asname or alias.name
                    add_symbol(name, "variable", "imported", boost=86)

    pattern = re.compile(
        r"^\s*(?:def\s+([a-zA-Z_]\w*)|class\s+([a-zA-Z_]\w*)|([a-zA-Z_]\w*)\s*(?::\s*[^=]+)?\s*[:=])"
    )
    for line in code.splitlines():
        match = pattern.match(line)
        if match:
            func_name, class_name, var_name = match.groups()
            if func_name:
                add_symbol(func_name, "function", "(function)", boost=82)
            elif class_name:
                add_symbol(class_name, "class", "class", boost=82)
            elif var_name:
                add_symbol(var_name, "variable", "variable", boost=82)

    return symbols


def dcl_introspect(code, line, column, prefix, trigger):
    results = []
    global_environment = {}

    # 1. Live executed scope from Pyodide interactive shell / active locals
    active_locals = globals().get("_dcl_active_locals")
    if active_locals is not None and isinstance(active_locals, dict):
        global_environment.update(active_locals)

    if "__main__" in sys.modules:
        global_environment.update(sys.modules["__main__"].__dict__)
    global_environment.update(globals())

    # Try to find pyodide_backend interactive shell user namespace if available
    try:
        from pyodide_backend.process import WasmProcess

        for process_instance in getattr(WasmProcess, "PROCESSES", []):
            if hasattr(process_instance, "shell"):
                shell = getattr(process_instance, "shell")
                if hasattr(shell, "locals") and isinstance(shell.locals, dict):
                    global_environment.update(shell.locals)
                elif hasattr(shell, "user_ns") and isinstance(shell.user_ns, dict):
                    global_environment.update(shell.user_ns)
    except Exception:
        pass

    trigger_character = trigger or ""
    if trigger_character == "." or "." in prefix:
        parts = prefix.split(".")
        target_name = parts[0]
        attribute_prefix = parts[1] if len(parts) > 1 else ""
        target = global_environment.get(target_name)
        if target is None:
            if target_name in sys.modules:
                target = sys.modules[target_name]
            elif target_name == "np" and "numpy" in sys.modules:
                target = sys.modules["numpy"]
            elif target_name == "pd" and "pandas" in sys.modules:
                target = sys.modules["pandas"]
            elif target_name == "plt" and "matplotlib.pyplot" in sys.modules:
                target = sys.modules["matplotlib.pyplot"]

        if target is not None:
            for attribute in dir(target):
                if attribute.startswith("_") and not attribute_prefix.startswith("_"):
                    continue
                if attribute.lower().startswith(attribute_prefix.lower()):
                    try:
                        value = getattr(target, attribute)
                        is_callable = callable(value)
                        documentation = inspect.getdoc(value) or ""
                        signature = ""
                        if is_callable:
                            try:
                                signature = str(inspect.signature(value))
                            except (TypeError, ValueError):
                                signature = ""
                        results.append(
                            {
                                "label": attribute,
                                "type": "function" if is_callable else "property",
                                "detail": signature[:80] if signature else type(value).__name__,
                                "info": documentation.split("\n\n")[0][:300] if documentation else "",
                                "boost": 95 if attribute.startswith(attribute_prefix) else 80,
                            }
                        )
                    except Exception:
                        results.append({"label": attribute, "type": "property", "boost": 70})
        return json.dumps(results)

    # Add live runtime objects
    seen_labels = set()
    for name, value in global_environment.items():
        if name.startswith("_"):
            continue
        if not name.lower().startswith(prefix.lower()):
            continue
        seen_labels.add(name)
        value_type = "function" if callable(value) else "variable"
        if isinstance(value, types.ModuleType):
            value_type = "module"
        elif isinstance(value, type):
            value_type = "class"
        documentation = inspect.getdoc(value) or ""
        signature = type(value).__name__
        if callable(value):
            try:
                signature = str(inspect.signature(value))
            except (TypeError, ValueError):
                signature = type(value).__name__
        results.append(
            {
                "label": name,
                "type": value_type,
                "detail": signature[:80],
                "info": documentation.split("\n\n")[0][:300] if documentation else "",
                "boost": 96 if name.startswith(prefix) else 82,
            }
        )

    # 2. Add static in-code symbols from editor text (without execution)
    static_symbols = _extract_static_symbols(code)
    for name, symbol in static_symbols.items():
        if name in seen_labels:
            continue
        if not name.lower().startswith(prefix.lower()):
            continue
        results.append(symbol)

    return json.dumps(results)
