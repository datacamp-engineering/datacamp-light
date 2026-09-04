import collections
import collections.abc
import json
import sys
import types
import bashlex
import markupsafe
from protowhat.utils_ast import AstModule, AstNode
import shellwhat
import shellwhat.parsers
import shellwhat.State
import shellwhat.test_exercise

for attribute_name in ["Mapping", "MutableMapping", "Sequence", "Iterable", "Callable"]:
    if not hasattr(collections, attribute_name):
        setattr(collections, attribute_name, getattr(collections.abc, attribute_name))

if not hasattr(markupsafe, "soft_unicode"):
    markupsafe.soft_unicode = markupsafe.soft_str

antlr_ast = types.ModuleType("antlr_ast")
antlr_ast_ast = types.ModuleType("antlr_ast.ast")


class Speaker:
    def __init__(self, nodes=None):
        self.nodes = nodes or {}

    def describe(self, node, format_string=None, field=None, **kwargs):
        if format_string:
            return format_string
        return getattr(node, "name", type(node).__name__)


antlr_ast_ast.Speaker = Speaker
antlr_ast.ast = antlr_ast_ast
sys.modules["antlr_ast"] = antlr_ast
sys.modules["antlr_ast.ast"] = antlr_ast_ast


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
        loaded_object = super().load(node)
        if isinstance(loaded_object, cls.AstNode):
            loaded_object.text = node.get("text", "")
            loaded_object.position = node.get("position", ((1, 0), (1, 0)))
        return loaded_object

    @classmethod
    def parse(cls, code, strict=True):
        if not code or not code.strip():
            return cls.load({"type": "Sentence", "data": {"child": None}})
        try:
            nodes = bashlex.parse(code)
        except Exception as error:
            raise cls.ParseError(str(error))

        def convert_node(current_node):
            node_kind = getattr(current_node, "kind", None)
            position = getattr(current_node, "pos", (0, 0))
            if node_kind == "command":
                words = [
                    convert_node(part)
                    for part in getattr(current_node, "parts", [])
                    if part.kind == "word"
                ]
                return {
                    "type": "SimpleCommand",
                    "text": code[position[0]:position[1]],
                    "position": position,
                    "data": {"words": words},
                }
            elif node_kind == "word":
                parts = []
                for subpart in getattr(current_node, "parts", []):
                    if subpart.kind == "parameter":
                        raw_text = code[subpart.pos[0]:subpart.pos[1]]
                        is_braced = raw_text.startswith("${")
                        parameter_value = "$" + subpart.value if not is_braced else subpart.value
                        parts.append({
                            "type": "BracedVarSub" if is_braced else "SimpleVarSub",
                            "text": raw_text,
                            "position": subpart.pos,
                            "data": {
                                "token": {"type": "Token", "data": {"val": parameter_value}}
                            },
                        })
                if not parts:
                    parts.append({
                        "type": "Literal",
                        "text": current_node.word,
                        "position": position,
                        "data": {
                            "token": {"type": "Token", "data": {"val": current_node.word}}
                        },
                    })
                return {
                    "type": "CompoundWord",
                    "text": current_node.word,
                    "position": position,
                    "data": {"parts": parts},
                }
            elif node_kind == "pipeline":
                children = [
                    convert_node(part)
                    for part in getattr(current_node, "parts", [])
                    if part.kind != "pipe"
                ]
                return {
                    "type": "Pipeline",
                    "text": code[position[0]:position[1]],
                    "position": position,
                    "data": {"children": children},
                }
            elif node_kind == "list":
                children = [
                    convert_node(part)
                    for part in getattr(current_node, "parts", [])
                    if part.kind != "operator"
                ]
                return {
                    "type": "CommandList",
                    "text": code[position[0]:position[1]],
                    "position": position,
                    "data": {"children": children},
                }
            return {
                "type": "Literal",
                "text": str(current_node),
                "position": position,
                "data": {"token": {"type": "Token", "data": {"val": str(current_node)}}},
            }

        converted = [convert_node(node_item) for node_item in nodes]
        child = (
            converted[0]
            if len(converted) == 1
            else {
                "type": "CommandList",
                "text": code,
                "position": (0, len(code)),
                "data": {"children": converted},
            }
        )
        return cls.load({
            "type": "Sentence",
            "text": code,
            "position": (0, len(code)),
            "data": {"child": child},
        })


shellwhat.State.DEFAULT_PARSER = BashParser


class PyodideShellConnection:
    def __init__(self, execute_function=None):
        self.execute_function = execute_function

    def run_command(self, command):
        if not self.execute_function:
            return ""
        try:
            result = self.execute_function(command)
            return getattr(result, "output", "") or ""
        except Exception:
            return ""


def evaluate_shellwhat(
    sct, student_code, student_result, pre_exercise_code="", solution=""
):
    connection = PyodideShellConnection()
    try:
        result = shellwhat.test_exercise.test_exercise(
            sct=sct,
            student_code=student_code or "",
            student_result=student_result or "",
            student_conn=connection,
            solution_code=solution or "",
            solution_result="",
            solution_conn=connection,
            pre_exercise_code=pre_exercise_code or "",
            ex_type="ShellExercise",
            error=[],
        )
        return json.dumps({
            "correct": bool(result.get("correct", False)),
            "message": result.get("message", "Submission evaluated."),
        })
    except Exception as error:
        return json.dumps({"correct": False, "message": str(error)})
