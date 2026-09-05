import inspect
import json
import sys
import types


def dcl_introspect(code, line, column, prefix, trigger):
    results = []
    global_environment = {}
    if "__main__" in sys.modules:
        global_environment.update(sys.modules["__main__"].__dict__)
    global_environment.update(globals())

    # Try to find pyodide_backend interactive shell user namespace if available
    try:
        from pyodide_backend.process import WasmProcess
        for process_instance in WasmProcess.PROCESSES:
            if hasattr(process_instance, "shell") and hasattr(process_instance.shell, "user_ns"):
                global_environment.update(process_instance.shell.user_ns)
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
                                "boost": 85 if attribute.startswith(attribute_prefix) else 70,
                            }
                        )
                    except Exception:
                        results.append({"label": attribute, "type": "property", "boost": 60})
        return json.dumps(results)

    for name, value in global_environment.items():
        if name.startswith("_"):
            continue
        if not name.lower().startswith(prefix.lower()):
            continue
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
                "boost": 95 if name.startswith(prefix) else 80,
            }
        )
    return json.dumps(results)
