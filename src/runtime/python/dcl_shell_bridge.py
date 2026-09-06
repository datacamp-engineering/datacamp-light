import builtins
import json
import os
import re
import subprocess
import sys
import js

ANSI_ESCAPE_PATTERN = re.compile(r"\x1b\[[0-9;]*[a-zA-Z]|\x1b[a-zA-Z]")


def execute_shell_command(command_string):
    result_string = js.dcl_execute_shell(command_string)
    return json.loads(result_string)


def custom_os_system(command_string):
    result = execute_shell_command(command_string)
    if result.get("output"):
        clean_output = ANSI_ESCAPE_PATTERN.sub("", result["output"])
        sys.stdout.write(clean_output + "\n")
    if result.get("error"):
        clean_error = ANSI_ESCAPE_PATTERN.sub("", result["error"])
        sys.stderr.write(clean_error + "\n")
    return result.get("exitCode", 0)


os.system = custom_os_system


class CompletedProcess:
    def __init__(self, args, returncode, stdout=None, stderr=None):
        self.args = args
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr

    def check_returncode(self):
        if self.returncode != 0:
            raise subprocess.CalledProcessError(
                self.returncode, self.args, self.stdout, self.stderr
            )

    def __repr__(self):
        return f"CompletedProcess(args={self.args!r}, returncode={self.returncode!r})"


def custom_subprocess_run(
    args,
    *,
    stdin=None,
    input=None,
    capture_output=False,
    timeout=None,
    check=False,
    encoding=None,
    errors=None,
    text=None,
    env=None,
    universal_newlines=None,
    shell=False,
    **kwargs,
):
    if isinstance(args, (list, tuple)):
        command_string = " ".join(str(argument) for argument in args)
    else:
        command_string = str(args)

    result = execute_shell_command(command_string)
    returncode = result.get("exitCode", 0)
    raw_output = result.get("output", "") or ""
    raw_error = result.get("error", "") or ""
    output_string = ANSI_ESCAPE_PATTERN.sub("", raw_output) if raw_output else ""
    error_string = ANSI_ESCAPE_PATTERN.sub("", raw_error) if raw_error else ""

    is_text = bool(text or universal_newlines or encoding)

    stdout_value = (
        output_string
        if is_text
        else (output_string.encode("utf-8") if output_string else b"")
    )
    stderr_value = (
        error_string
        if is_text
        else (error_string.encode("utf-8") if error_string else b"")
    )

    if not capture_output:
        if output_string:
            sys.stdout.write(output_string + "\n")
        if error_string:
            sys.stderr.write(error_string + "\n")

    completed_process = CompletedProcess(
        args,
        returncode,
        stdout_value if capture_output else None,
        stderr_value if capture_output else None,
    )
    if check and returncode != 0:
        raise subprocess.CalledProcessError(
            returncode, args, stdout_value, stderr_value
        )
    return completed_process


def custom_subprocess_check_output(args, **kwargs):
    kwargs["capture_output"] = True
    kwargs["check"] = True
    completed_process = custom_subprocess_run(args, **kwargs)
    return completed_process.stdout


def custom_subprocess_getoutput(command_string):
    completed_process = custom_subprocess_run(
        command_string, shell=True, capture_output=True, text=True
    )
    return completed_process.stdout or completed_process.stderr or ""


subprocess.run = custom_subprocess_run
subprocess.check_output = custom_subprocess_check_output
subprocess.getoutput = custom_subprocess_getoutput
subprocess.CompletedProcess = CompletedProcess

standard_input_queue = []


def set_standard_input(lines=None):
    global standard_input_queue
    if isinstance(lines, str):
        standard_input_queue = [line for line in lines.split("\n") if line]
    elif lines is not None:
        try:
            standard_input_queue = [str(line) for line in list(lines)]
        except Exception:
            standard_input_queue = []
    else:
        standard_input_queue = []


def safe_input(prompt=""):
    global standard_input_queue
    if standard_input_queue:
        return standard_input_queue.pop(0)
    raise EOFError("EOF when reading a line")


builtins.input = safe_input
builtins._dcl_set_stdin = set_standard_input
builtins._dcl_execute_shell = execute_shell_command
builtins.os = os
builtins.subprocess = subprocess
