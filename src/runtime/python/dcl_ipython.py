import builtins
import inspect
import os
import pydoc
import re
import sys
import time

ANSI_ESCAPE_PATTERN = re.compile(r"\x1b\[[0-9;]*[a-zA-Z]|\x1b[a-zA-Z]")


def ipython_shell_escape(command_string):
    os.system(command_string)
    return None


def ipython_get_output_lines(command_string):
    result = builtins._dcl_execute_shell(command_string)
    raw_output = result.get("output", "") or ""
    output_string = ANSI_ESCAPE_PATTERN.sub("", raw_output) if raw_output else ""
    return output_string.split("\n") if output_string else []


def ipython_time_execution(target_function):
    start_time = time.perf_counter()
    result = target_function()
    end_time = time.perf_counter()
    duration_milliseconds = (end_time - start_time) * 1000
    if duration_milliseconds < 1:
        time_unit = f"{duration_milliseconds * 1000:.2f} µs"
    elif duration_milliseconds < 1000:
        time_unit = f"{duration_milliseconds:.2f} ms"
    else:
        time_unit = f"{duration_milliseconds / 1000:.2f} s"
    print(f"CPU times: total: {time_unit}")
    return result


def ipython_print_working_directory():
    current_working_directory = os.getcwd()
    print(repr(current_working_directory))
    return current_working_directory


def ipython_change_directory(path_string=""):
    target_directory = path_string.strip() if path_string else "/home/pyodide"
    try:
        os.chdir(target_directory)
        builtins._dcl_execute_shell(f"cd {target_directory}")
    except Exception as error:
        print(f"cd error: {error}")


def ipython_environment(argument_string=""):
    trimmed_argument = argument_string.strip()
    if not trimmed_argument:
        for key, value in sorted(os.environ.items()):
            print(f"{key}={value}")
    elif "=" in trimmed_argument:
        key, value = trimmed_argument.split("=", 1)
        os.environ[key.strip()] = value.strip()
    else:
        print(os.environ.get(trimmed_argument.strip(), ""))


def ipython_who(scope=None):
    if scope is None:
        try:
            scope = sys._getframe(1).f_globals
        except Exception:
            scope = globals()
    names = [
        key
        for key, value in scope.items()
        if not key.startswith("_")
        and not hasattr(value, "__call__")
        and type(value).__name__ != "module"
        and key
        not in (
            "sys",
            "os",
            "subprocess",
            "js",
            "json",
            "inspect",
            "pydoc",
            "time",
            "re",
            "builtins",
        )
    ]
    if names:
        print("  ".join(sorted(names)))
    else:
        print("Interactive namespace is empty.")


def ipython_whos(scope=None):
    if scope is None:
        try:
            scope = sys._getframe(1).f_globals
        except Exception:
            scope = globals()
    items = []
    for key, value in scope.items():
        if (
            key.startswith("_")
            or type(value).__name__ == "module"
            or key
            in (
                "sys",
                "os",
                "subprocess",
                "js",
                "json",
                "inspect",
                "pydoc",
                "time",
                "re",
                "builtins",
            )
        ):
            continue
        variable_type = type(value).__name__
        if hasattr(value, "shape"):
            information = f"{variable_type} with shape {value.shape}"
        elif hasattr(value, "__len__") and variable_type in (
            "list",
            "dict",
            "set",
            "tuple",
            "str",
        ):
            information = f"n={len(value)}"
        else:
            information = repr(value)
            if len(information) > 35:
                information = information[:32] + "..."
        items.append((key, variable_type, information))

    if not items:
        print("Interactive namespace is empty.")
        return

    print("Variable   Type   Data/Info")
    print("---------------------------")
    for variable_name, variable_type, information in items:
        print(f"{variable_name:<10} {variable_type:<6} {information}")


def ipython_help(target_name, detailed=False, scope=None):
    if scope is None:
        try:
            scope = sys._getframe(1).f_globals
        except Exception:
            scope = globals()
    try:
        resolved_object = eval(target_name, scope)
    except Exception as error:
        print(f"Object {target_name!r} not found: {error}")
        return

    documentation = (
        inspect.getdoc(resolved_object) or "No docstring available."
    )
    try:
        signature_string = str(inspect.signature(resolved_object))
        print(f"Signature: {target_name}{signature_string}")
    except Exception:
        pass
    print(f"Type:      {type(resolved_object).__name__}")
    print(f"Docstring:\n{documentation}")

    if detailed:
        try:
            source_code = inspect.getsource(resolved_object)
            print(f"\nSource:\n{source_code}")
        except Exception:
            pass


builtins._dcl_ipython_shell = ipython_shell_escape
builtins._dcl_ipython_getoutput = ipython_get_output_lines
builtins._dcl_ipython_time = ipython_time_execution
builtins._dcl_ipython_pwd = ipython_print_working_directory
builtins._dcl_ipython_cd = ipython_change_directory
builtins._dcl_ipython_env = ipython_environment
builtins._dcl_ipython_who = ipython_who
builtins._dcl_ipython_whos = ipython_whos
builtins._dcl_ipython_help = ipython_help


def dcl_transform_ipython(code_string):
    lines = code_string.split("\n")
    transformed_lines = []

    for line in lines:
        stripped_line = line.strip()
        indentation = line[: len(line) - len(line.lstrip())]

        if stripped_line.startswith("!"):
            command_content = stripped_line[1:].strip()
            transformed_lines.append(
                f"{indentation}_dcl_ipython_shell({command_content!r})"
            )
            continue

        assignment_match = re.match(
            r"^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*!(.+)$", stripped_line
        )
        if assignment_match:
            variable_name = assignment_match.group(1)
            command_content = assignment_match.group(2).strip()
            transformed_lines.append(
                f"{indentation}{variable_name} = _dcl_ipython_getoutput({command_content!r})"
            )
            continue

        if stripped_line == "%whos":
            transformed_lines.append(f"{indentation}_dcl_ipython_whos()")
            continue
        if stripped_line == "%who":
            transformed_lines.append(f"{indentation}_dcl_ipython_who()")
            continue
        if stripped_line == "%pwd":
            transformed_lines.append(f"{indentation}_dcl_ipython_pwd()")
            continue
        if stripped_line.startswith("%cd"):
            target_directory = stripped_line[3:].strip()
            transformed_lines.append(
                f"{indentation}_dcl_ipython_cd({target_directory!r})"
            )
            continue
        if stripped_line.startswith("%env"):
            environment_argument = stripped_line[4:].strip()
            transformed_lines.append(
                f"{indentation}_dcl_ipython_env({environment_argument!r})"
            )
            continue
        if stripped_line.startswith("%time "):
            timed_expression = stripped_line[6:].strip()
            transformed_lines.append(
                f"{indentation}_dcl_ipython_time(lambda: ({timed_expression}))"
            )
            continue

        if stripped_line.startswith("??") and len(stripped_line) > 2:
            target_identifier = stripped_line[2:].strip()
            transformed_lines.append(
                f"{indentation}_dcl_ipython_help({target_identifier!r}, detailed=True)"
            )
            continue
        if stripped_line.endswith("??") and len(stripped_line) > 2:
            target_identifier = stripped_line[:-2].strip()
            transformed_lines.append(
                f"{indentation}_dcl_ipython_help({target_identifier!r}, detailed=True)"
            )
            continue
        if stripped_line.startswith("?") and len(stripped_line) > 1:
            target_identifier = stripped_line[1:].strip()
            transformed_lines.append(
                f"{indentation}_dcl_ipython_help({target_identifier!r}, detailed=False)"
            )
            continue
        if stripped_line.endswith("?") and len(stripped_line) > 1:
            target_identifier = stripped_line[:-1].strip()
            transformed_lines.append(
                f"{indentation}_dcl_ipython_help({target_identifier!r}, detailed=False)"
            )
            continue

        transformed_lines.append(line)

    return "\n".join(transformed_lines)
