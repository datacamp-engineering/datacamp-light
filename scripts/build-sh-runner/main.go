package main

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"strings"
	"syscall/js"

	"mvdan.cc/sh/v3/interp"
	"mvdan.cc/sh/v3/syntax"
)

func main() {
	c := make(chan struct{}, 0)
	js.Global().Set("dcl_run_sh_wasm", js.FuncOf(runShell))
	<-c
}

func runShell(this js.Value, args []js.Value) any {
	if len(args) == 0 {
		return map[string]any{"output": "", "exitCode": 0}
	}

	script := args[0].String()
	var execCallback js.Value
	if len(args) > 1 && !args[1].IsNull() && !args[1].IsUndefined() {
		execCallback = args[1]
	}

	parser := syntax.NewParser(syntax.Variant(syntax.LangBash))
	file, err := parser.Parse(strings.NewReader(script), "")
	if err != nil {
		return map[string]any{
			"output":   "",
			"error":    fmt.Sprintf("sh: syntax error: %v", err),
			"exitCode": 2,
		}
	}

	var stdoutBuf, stderrBuf bytes.Buffer

	execHandler := func(ctx context.Context, execArgs []string) error {
		if len(execArgs) == 0 {
			return nil
		}

		if !execCallback.IsUndefined() && !execCallback.IsNull() {
			jsArgs := make([]any, len(execArgs))
			for i, a := range execArgs {
				jsArgs[i] = a
			}

			hc := interp.HandlerCtx(ctx)
			var stdinStr string
			if hc.Stdin != nil {
				var inBuf bytes.Buffer
				io.Copy(&inBuf, hc.Stdin)
				stdinStr = inBuf.String()
			}

			res := execCallback.Invoke(js.ValueOf(execArgs[0]), js.ValueOf(jsArgs[1:]), js.ValueOf(stdinStr))
			if res.Type() == js.TypeObject {
				out := res.Get("output").String()
				errMsg := res.Get("error").String()
				code := res.Get("exitCode").Int()

				if out != "" {
					io.WriteString(hc.Stdout, out)
				}
				if errMsg != "" {
					io.WriteString(hc.Stderr, errMsg)
				}
				if code != 0 {
					return interp.NewExitStatus(uint8(code))
				}
				return nil
			}
		}

		return fmt.Errorf("%s: command not found", execArgs[0])
	}

	runner, err := interp.New(
		interp.Dir("/home/repl"),
		interp.StdIO(nil, &stdoutBuf, &stderrBuf),
		interp.ExecHandler(execHandler),
	)
	if err != nil {
		return map[string]any{
			"output":   "",
			"error":    err.Error(),
			"exitCode": 1,
		}
	}

	ctx := context.Background()
	err = runner.Run(ctx, file)

	exitCode := 0
	var errStr string
	if err != nil {
		if status, ok := interp.IsExitStatus(err); ok {
			exitCode = int(status)
		} else {
			exitCode = 1
			errStr = err.Error()
		}
	}

	if stderrBuf.Len() > 0 {
		if errStr != "" {
			errStr += "\n"
		}
		errStr += stderrBuf.String()
	}

	resMap := map[string]any{
		"output":   stdoutBuf.String(),
		"exitCode": exitCode,
	}
	if errStr != "" {
		resMap["error"] = strings.TrimSpace(errStr)
	}

	return js.ValueOf(resMap)
}
