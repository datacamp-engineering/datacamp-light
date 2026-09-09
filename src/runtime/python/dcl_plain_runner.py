import ast
import base64
import io
import json
import logging
import os
import sys
import traceback
import warnings

os.environ["MPLBACKEND"] = "Agg"
warnings.filterwarnings("ignore", message=".*FigureCanvasAgg is non-interactive.*")
warnings.filterwarnings("ignore", message=".*Matplotlib is building the font cache.*")
warnings.filterwarnings("ignore", message=".*fontconfig.*")

logging.getLogger("matplotlib").setLevel(logging.ERROR)
logging.getLogger("matplotlib.font_manager").setLevel(logging.ERROR)


def _dcl_run_plain_code(code_string):
    old_stdout = sys.stdout
    old_stderr = sys.stderr
    stdout_buf = io.StringIO()
    stderr_buf = io.StringIO()
    sys.stdout = stdout_buf
    sys.stderr = stderr_buf
    error_msg = None

    main_mod = sys.modules.get("__main__")
    exec_globals = main_mod.__dict__ if main_mod is not None else globals()

    if "matplotlib" in sys.modules or "matplotlib.pyplot" in sys.modules:
        try:
            import matplotlib

            matplotlib.use("Agg")
            matplotlib.rcParams.update(
                {
                    "figure.dpi": 100,
                    "font.family": "sans-serif",
                    "font.sans-serif": [
                        "DejaVu Sans",
                        "Helvetica",
                        "Arial",
                        "sans-serif",
                    ],
                    "svg.fonttype": "path",
                }
            )
            import matplotlib.pyplot as plt

            plt.show = lambda *args, **kwargs: None
        except Exception:
            pass

    try:
        parsed = ast.parse(code_string)
        if parsed.body and isinstance(parsed.body[-1], ast.Expr):
            last_expr = parsed.body.pop()
            if parsed.body:
                exec(compile(parsed, "<input>", "exec"), exec_globals)
            res = eval(
                compile(ast.Expression(last_expr.value), "<input>", "eval"),
                exec_globals,
            )
            if res is not None:
                sys.stdout.write(repr(res) + "\n")
        else:
            exec(code_string, exec_globals)
    except Exception:
        error_msg = traceback.format_exc()
    finally:
        sys.stdout = old_stdout
        sys.stderr = old_stderr

    entries = []
    out_val = stdout_buf.getvalue()
    err_val = stderr_buf.getvalue()
    if out_val:
        entries.append({"type": "output", "payload": out_val})
    if err_val:
        entries.append({"type": "error", "payload": err_val})
    if error_msg:
        entries.append({"type": "error", "payload": error_msg})

    if "matplotlib" in sys.modules or "matplotlib.pyplot" in sys.modules:
        try:
            import matplotlib.pyplot as plt

            for fig_num in plt.get_fignums():
                fig = plt.figure(fig_num)
                img_buf = io.BytesIO()
                fig.savefig(img_buf, format="svg", bbox_inches="tight")
                svg_b64 = base64.b64encode(img_buf.getvalue()).decode("utf-8")
                entries.append({"type": "graph", "payload": svg_b64})
            plt.close("all")
        except Exception:
            pass

    return json.dumps(entries)

