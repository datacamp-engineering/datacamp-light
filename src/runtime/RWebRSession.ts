import type {
  IInitializeParams,
  IIntrospectCompletion,
  IIntrospectParams,
  IIntrospectResult,
  IReadFileParams,
  IReadFileResult,
  IRunCodeParams,
  IRunCodeResult,
  ISessionStatus,
  ISubmitCodeParams,
  ISubmitCodeResult,
  IWriteFileParams,
  IWriteFileResult,
} from '../jsonrpc/types';
import { SessionLifecycle } from './sessionLifecycle';
import type { OutputListener, StatusListener } from './sessionLifecycle';
import { TESTWHAT_R_SOURCES } from './testwhatSources';

/**
 * webR-backed session for R exercises.
 *
 * webR (https://github.com/r-wasm/webr) is R compiled to WebAssembly. The
 * standard browser pattern (used by the official webR REPL) is to import
 * webr.mjs on the main thread - webR spawns its own internal R worker for
 * computation, so the UI thread stays responsive.
 *
 * Full `testwhat` SCT support is built-in: testwhat's pure-R sources are
 * injected directly into the webR virtual environment alongside pre-compiled
 * CRAN WASM dependencies (`evaluate`, `stringdist`, `R6`, `magrittr`, `praise`).
 */
const WEBR_LATEST_URL = 'https://webr.r-wasm.org/latest/webr.mjs';

const TESTWHAT_CRAN_DEPS = ['evaluate', 'R6', 'magrittr', 'stringdist', 'praise', 'markdown'];

type WebRImage = {
  width: number;
  height: number;
  toDataURL: () => string;
};

type WebROutputEntry = {
  type: string;
  data: unknown;
};

function imageBitmapToDataUrl(bitmap: WebRImage): string {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, bitmap.width, bitmap.height);
    context.drawImage(bitmap as unknown as CanvasImageSource, 0, 0);
  }
  return canvas.toDataURL('image/png');
}

export class RWebRSession {
  private lifecycle = new SessionLifecycle();
  private webRPromise: Promise<any> | null = null;
  private testwhatReadyPromise: Promise<void> | null = null;

  private async getWebR(): Promise<any> {
    if (this.webRPromise == null) {
      this.webRPromise = (async () => {
        const { WebR } = await import(/* @vite-ignore */ WEBR_LATEST_URL);
        const webR = new WebR();
        await webR.init();
        return webR;
      })();
    }
    return this.webRPromise;
  }

  private async ensureTestwhatInstalled(webR: any): Promise<void> {
    if (this.testwhatReadyPromise != null) {
      return this.testwhatReadyPromise;
    }

    this.testwhatReadyPromise = (async () => {
      // 1. Install prebuilt CRAN WASM dependencies from repo.r-wasm.org
      try {
        await webR.installPackages(TESTWHAT_CRAN_DEPS);
      } catch (err) {
        console.warn('Failed to install some testwhat CRAN dependencies:', err);
      }

      // 2. Load dependencies into R and create testwhat namespace environment
      await webR.evalRVoid(`
        suppressPackageStartupMessages({
          if (requireNamespace("evaluate", quietly = TRUE)) library(evaluate)
          if (requireNamespace("R6", quietly = TRUE)) library(R6)
          if (requireNamespace("magrittr", quietly = TRUE)) library(magrittr)
          if (requireNamespace("stringdist", quietly = TRUE)) library(stringdist)
          if (requireNamespace("praise", quietly = TRUE)) library(praise)
          if (requireNamespace("markdown", quietly = TRUE)) library(markdown)
        })

        if (!exists(".tw_ns", envir = .GlobalEnv)) {
          .tw_ns <- new.env(parent = as.environment("package:stats"))
        }
      `);

      // 3. Define all testwhat R files directly into .tw_ns and .GlobalEnv
      for (const [filename, source] of Object.entries(TESTWHAT_R_SOURCES)) {
        try {
          await webR.evalRVoid(source);
        } catch (fileErr) {
          console.warn(`Warning loading testwhat file ${filename}:`, fileErr);
        }
      }

      // 4. Export symbols from testwhat namespace to globalenv and register S3 methods
      await webR.evalRVoid(`
        suppressWarnings({
          # Register S3 methods in global dispatch
          .S3method("check_equal", "default", check_equal.default)
          .S3method("check_equal", "ObjectState", check_equal.ObjectState)
          .S3method("check_equal", "ObjectColumnState", check_equal.ObjectColumnState)
          .S3method("check_equal", "ObjectElementState", check_equal.ObjectElementState)
          .S3method("check_equal", "ArgumentState", check_equal.ArgumentState)
          .S3method("check_equal", "ExprResultState", check_equal.ExprResultState)
          .S3method("check_equal", "ExprOutputState", check_equal.ExprOutputState)
          .S3method("check_equal", "ExprErrorState", check_equal.ExprErrorState)
          .S3method("check_result", "default", check_result.default)
          .S3method("check_result", "ExprState", check_result.ExprState)
          .S3method("check_result", "FunctionState", check_result.FunctionState)
          .S3method("check_result", "OperationState", check_result.OperationState)
          .S3method("check_error", "default", check_error.default)
          .S3method("check_error", "ExprState", check_error.ExprState)
          .S3method("check_output", "default", check_output.default)
          .S3method("check_output", "ExprState", check_output.ExprState)
          .S3method("build_message", "default", build_message.default)
          .S3method("build_message", "object", build_message.object)
          .S3method("build_message", "column", build_message.column)
          .S3method("build_message", "element", build_message.element)
          .S3method("build_message", "function", build_message.function)
          .S3method("build_message", "operator", build_message.operator)
          .S3method("build_message", "argument", build_message.argument)
          .S3method("build_message", "typed", build_message.typed)
          .S3method("build_message", "fundef", build_message.fundef)
          .S3method("build_message", "expr", build_message.expr)
          .S3method("build_message", "output", build_message.output)
          .S3method("get_diff", "default", get_diff.default)
          .S3method("get_diff", "logical", get_diff.logical)
          .S3method("get_diff", "numeric", get_diff.numeric)
          .S3method("get_diff", "character", get_diff.character)
          .S3method("get_diff", "data.frame", get_diff.data.frame)
          .S3method("is_equal", "default", is_equal.default)
          .S3method("is_equal", "formula", is_equal.formula)

          # Global override of check_that and throw_sct_failure
          throw_sct_failure <<- function(message, feedback, call = sys.call(-1)) {
            cond <- structure(
              list(message = message, call = call),
              class = c("sct_failure", "error", "condition"),
              feedback = feedback
            )
            stop(cond)
          }

          check_that <<- function(code, feedback, env = parent.frame()) {
            if (is.character(feedback)) {
              feedback <- list(list(message = feedback))
            }
            res <- tryCatch(eval(code, envir = env), error = function(e) FALSE)
            if (!isTRUE(res)) {
              msg <- build_feedback_message(feedback)
              throw_sct_failure(feedback = feedback, message = msg)
            }
          }
        })
      `);
    })();

    return this.testwhatReadyPromise;
  }

  public async initialize(params: IInitializeParams): Promise<void> {
    this.lifecycle.setStatus('starting');
    try {
      const webR = await this.getWebR();
      const pec = params.pec || '';
      if (pec.trim()) {
        await webR.evalRVoid(pec);
      }
      this.lifecycle.setStatus('ready');
    } catch (err: any) {
      this.lifecycle.setStatus('broken', err?.message || 'Failed to initialize R session');
      throw err;
    }
  }

  public async runCode(params: IRunCodeParams): Promise<IRunCodeResult> {
    this.lifecycle.setStatus('busy');
    try {
      const webR = await this.getWebR();

      const { output, images } = await webR.globalShelter.captureR(params.code || '');

      const stdout: string[] = [];
      const stderr: string[] = [];

      for (const entry of output as WebROutputEntry[]) {
        if (entry.type === 'stdout') {
          stdout.push(String(entry.data));
          this.lifecycle.emitOutput({ type: 'output', payload: String(entry.data) });
        } else if (entry.type === 'stderr') {
          stderr.push(String(entry.data));
          this.lifecycle.emitOutput({ type: 'error', payload: String(entry.data) });
        }
      }

      let lastGraphDataUrl: string | undefined;
      for (const image of images as WebRImage[]) {
        const dataUrl = imageBitmapToDataUrl(image);
        lastGraphDataUrl = dataUrl;
        this.lifecycle.emitOutput({ type: 'graph', payload: dataUrl });
      }

      this.lifecycle.setStatus('ready');
      return {
        output: stdout.join('\n'),
        error: stderr.length > 0 ? stderr.join('\n') : undefined,
        graph: lastGraphDataUrl,
      };
    } catch (err: any) {
      this.lifecycle.setStatus('broken', err?.message);
      throw err;
    }
  }

  /**
   * Executes a Submission Correctness Test for an R exercise using `testwhat`.
   *
   * Automatically prepares student and solution environments and runs
   * `testwhat::test_exercise(...)` with full support for `test_object()`,
   * `test_function()`, `test_error()`, and pipe chains (`ex() %>% check_object() ...`).
   * Falls back to basic assertion testing if testwhat is not used in the SCT.
   */
  public async submitCode(params: ISubmitCodeParams): Promise<ISubmitCodeResult> {
    this.lifecycle.setStatus('busy');
    try {
      const webR = await this.getWebR();
      const sct = params.sct || '';
      const pec = params.pec || '';
      const code = params.code || '';
      const solution = params.solution || '';

      // Check if SCT uses testwhat syntax (ex() %>% ..., test_object, test_function, etc.)
      const isTestwhatSct =
        /\b(ex\s*\(\s*\)|check_object|check_function|check_error|check_output|check_code|test_object|test_function|test_output_contains|test_data_frame|success_msg)\b/.test(
          sct,
        );

      if (isTestwhatSct) {
        await this.ensureTestwhatInstalled(webR);

        // Escape R strings safely
        const escapeRString = (str: string) => JSON.stringify(str);

        const evalHarness = `
          local({
            pec_code <- ${escapeRString(pec)}
            student_code <- ${escapeRString(code)}
            solution_code <- ${escapeRString(solution)}
            sct_code <- ${escapeRString(sct)}

            student_env <- new.env(parent = .GlobalEnv)
            solution_env <- new.env(parent = .GlobalEnv)

            if (nchar(trimws(pec_code)) > 0) {
              eval(parse(text = pec_code), envir = student_env)
              eval(parse(text = pec_code), envir = solution_env)
            }

            if (nchar(trimws(solution_code)) > 0) {
              eval(parse(text = solution_code), envir = solution_env)
            }

            output_list <- list()
            if (requireNamespace("evaluate", quietly = TRUE)) {
              raw_output <- evaluate::evaluate(student_code, envir = student_env)
              output_list <- lapply(raw_output, function(item) {
                if (inherits(item, "source")) {
                  list(type = "code", payload = gsub("\\n+$", "", item$src))
                } else if (inherits(item, "message")) {
                  list(type = "r-message", payload = gsub("\\n+$", "", item$message))
                } else if (inherits(item, "warning")) {
                  list(type = "r-warning", payload = paste0("Warning message: ", item$message))
                } else if (inherits(item, "error")) {
                  list(type = "r-error", payload = paste0("Error: ", item$message))
                } else {
                  list(type = "output", payload = gsub("\\n+$", "", item))
                }
              })
            } else {
              eval(parse(text = student_code), envir = student_env)
            }

            testwhat_result <- test_exercise(sct = sct_code,
                                             ex_type = "NormalExercise",
                                             pec = pec_code,
                                             student_code = student_code,
                                             solution_code = solution_code,
                                             student_env = student_env,
                                             solution_env = solution_env,
                                             output_list = output_list,
                                             allow_errors = FALSE,
                                             force_diagnose = FALSE,
                                             seed = 42)

            text_outputs <- character(0)
            for (item in output_list) {
              if (is.list(item) && !is.null(item$type) && item$type %in% c("output", "r-message", "r-warning", "r-error")) {
                text_outputs <- c(text_outputs, item$payload)
              }
            }

            list(correct = testwhat_result$correct,
                 message = if (is.null(testwhat_result$message)) "Great work!" else testwhat_result$message,
                 output = paste(text_outputs, collapse = "\n"))
          })
        `;

        try {
          const evaluationResultObject = await webR.evalR(evalHarness);
          const unpackedResult: any = await evaluationResultObject.toJs();
          console.log('[r-sct] testwhat result:', unpackedResult);

          let correct = false;
          let message = '';
          let output = '';

          if (unpackedResult && typeof unpackedResult === 'object') {
            if (Array.isArray(unpackedResult.names) && Array.isArray(unpackedResult.values)) {
              const correctIndex = unpackedResult.names.indexOf('correct');
              const messageIndex = unpackedResult.names.indexOf('message');
              const outputIndex = unpackedResult.names.indexOf('output');
              if (correctIndex !== -1) {
                const targetValueObject = unpackedResult.values[correctIndex];
                correct = Array.isArray(targetValueObject?.values)
                  ? Boolean(targetValueObject.values[0])
                  : Boolean(targetValueObject);
              }
              if (messageIndex !== -1) {
                const targetValueObject = unpackedResult.values[messageIndex];
                message = Array.isArray(targetValueObject?.values)
                  ? String(targetValueObject.values[0] ?? '')
                  : String(targetValueObject ?? '');
              }
              if (outputIndex !== -1) {
                const targetValueObject = unpackedResult.values[outputIndex];
                output = Array.isArray(targetValueObject?.values)
                  ? String(targetValueObject.values[0] ?? '')
                  : String(targetValueObject ?? '');
              }
            } else {
              if ('correct' in unpackedResult) {
                correct = Array.isArray(unpackedResult.correct)
                  ? Boolean(unpackedResult.correct[0])
                  : Boolean(unpackedResult.correct);
              }
              if ('message' in unpackedResult) {
                message = Array.isArray(unpackedResult.message)
                  ? String(unpackedResult.message[0] ?? '')
                  : String(unpackedResult.message ?? '');
              }
              if ('output' in unpackedResult) {
                output = Array.isArray(unpackedResult.output)
                  ? String(unpackedResult.output[0] ?? '')
                  : String(unpackedResult.output ?? '');
              }
            }
          }

          if (output) {
            this.lifecycle.emitOutput({ type: 'output', payload: output });
          }

          message = message.trim();
          if (!message) {
            message = correct
              ? 'Great work! Your solution passed all tests.'
              : 'Incorrect solution.';
          }

          this.lifecycle.setStatus('ready');
          return { correct, message, output };
        } catch (testwhatError: any) {
          console.error('[DataCamp Light R SCT Exception]', testwhatError);
          const rawErrorMessage = String(testwhatError?.message || testwhatError || '');
          const sanitizedMessage =
            rawErrorMessage.replace(/^Error in [^:]+:\s*/, 'SCT Error: ') ||
            'Error during R SCT evaluation.';
          this.lifecycle.setStatus('ready');
          return { correct: false, message: sanitizedMessage, output: '' };
        }
      }

      // Base R fallback / direct execution
      if (pec.trim()) {
        await webR.evalRVoid(pec);
      }
      const { output: capturedOutput, images } = await webR.globalShelter.captureR(code || '');
      const stdout: string[] = [];
      const stderr: string[] = [];

      for (const entry of capturedOutput as WebROutputEntry[]) {
        if (entry.type === 'stdout') {
          stdout.push(String(entry.data));
          this.lifecycle.emitOutput({ type: 'output', payload: String(entry.data) });
        } else if (entry.type === 'stderr') {
          stderr.push(String(entry.data));
          this.lifecycle.emitOutput({ type: 'error', payload: String(entry.data) });
        }
      }

      for (const image of images as WebRImage[]) {
        const dataUrl = imageBitmapToDataUrl(image);
        this.lifecycle.emitOutput({ type: 'graph', payload: dataUrl });
      }

      let message = 'Great work! Your solution passed all tests.';
      let correct = true;

      if (sct.trim()) {
        try {
          await webR.evalRVoid(sct.trim());
        } catch (err: any) {
          correct = false;
          message = String(err?.message || err || 'Incorrect solution.');
        }
      }

      const combinedOutput = stdout.join('\n');
      this.lifecycle.setStatus('ready');
      return { correct, message, output: combinedOutput };
    } catch (err: any) {
      this.lifecycle.setStatus('broken', err?.message);
      throw err;
    }
  }

  public async introspect(params: IIntrospectParams): Promise<IIntrospectResult> {
    try {
      const webR = await this.getWebR();
      const escapeRString = (text: string) => JSON.stringify(text);
      const prefix = params.prefix || '';
      const triggerCharacter = params.triggerCharacter || '';

      const introspectionCode = `
        local({
          r_prefix <- ${escapeRString(prefix)}
          r_trigger <- ${escapeRString(triggerCharacter)}
          r_escape_json <- function(value) {
            value <- as.character(value)
            value <- gsub("\\\\", "\\\\\\\\", value, fixed = TRUE)
            value <- gsub('"', '\\\\"', value)
            value <- gsub("\\n", "\\\\n", value, fixed = TRUE)
            value <- gsub("\\r", "\\\\r", value, fixed = TRUE)
            value <- gsub("\\t", "\\\\t", value, fixed = TRUE)
            value
          }
          r_results <- list()
          if (nchar(r_trigger) > 0 && (r_trigger == "$" || grepl("$", r_prefix, fixed = TRUE))) {
            r_parts <- strsplit(r_prefix, "$", fixed = TRUE)[[1]]
            r_object_name <- r_parts[1]
            r_member_prefix <- if (length(r_parts) > 1) r_parts[2] else ""
            if (exists(r_object_name, envir = .GlobalEnv, inherits = FALSE)) {
              r_object_value <- get(r_object_name, envir = .GlobalEnv, inherits = FALSE)
              r_member_names <- names(r_object_value)
              if (is.null(r_member_names) && is.list(r_object_value)) r_member_names <- names(r_object_value)
              if (length(r_member_names) > 0) {
                for (r_member_name in r_member_names) {
                  if (nchar(r_member_prefix) == 0 || startsWith(tolower(r_member_name), tolower(r_member_prefix))) {
                    r_member_value <- r_object_value[[r_member_name]]
                    r_is_function <- is.function(r_member_value) || is.primitive(r_member_value)
                    r_member_type <- if (r_is_function) "function" else "property"
                    r_member_detail <- if (r_is_function) "function" else paste(class(r_member_value), collapse = ", ")
                    r_results[[length(r_results) + 1]] <- list(label = r_member_name, type = r_member_type, detail = r_member_detail, boost = 90)
                  }
                }
              }
            }
          } else {
            r_globals <- ls(envir = .GlobalEnv)
            for (r_global in r_globals) {
              if (nchar(r_prefix) > 0 && !startsWith(tolower(r_global), tolower(r_prefix))) next
              r_global_value <- tryCatch(get(r_global, envir = .GlobalEnv, inherits = FALSE), error = function(error) NULL)
              if (is.null(r_global_value)) next
              r_global_type <- "variable"
              if (is.function(r_global_value) || is.primitive(r_global_value)) r_global_type <- "function"
              r_global_detail <- ""
              if (is.function(r_global_value)) {
                r_global_detail <- tryCatch(paste(names(formals(r_global_value)), collapse = ","), error = function(error) "")
              } else {
                r_global_detail <- paste(class(r_global_value), collapse = ",")
              }
              r_results[[length(r_results) + 1]] <- list(label = r_global, type = r_global_type, detail = r_global_detail, boost = 95)
            }
          }
          r_serialized <- lapply(r_results, function(r_item) {
            r_label <- r_escape_json(if (is.null(r_item$label)) "" else r_item$label)
            r_type_value <- r_escape_json(if (is.null(r_item$type)) "variable" else r_item$type)
            r_detail_value <- r_escape_json(if (is.null(r_item$detail)) "" else r_item$detail)
            r_boost <- if (is.null(r_item$boost)) 80 else as.numeric(r_item$boost)
            paste0('{"label":"', r_label, '","type":"', r_type_value, '","detail":"', r_detail_value, '","boost":', r_boost, '}')
          })
          paste0('[', paste(r_serialized, collapse = ","), ']')
        })
      `;

      const rawResult = await webR.evalR(introspectionCode);
      const jsResult: any = await rawResult.toJs();
      const outputString = String(jsResult || '');
      let completions: IIntrospectCompletion[] = [];
      try {
        const parsed = JSON.parse(outputString);
        if (Array.isArray(parsed)) completions = parsed;
      } catch {
        completions = [];
      }
      return { completions };
    } catch (error) {
      return { completions: [] };
    }
  }

  public async writeFile(params: IWriteFileParams): Promise<IWriteFileResult> {
    const webR = await this.getWebR();
    webR.FS.writeFile(params.path || '', params.data || '');
    return { cwd: webR.FS.cwd?.() };
  }

  public async readFile(params: IReadFileParams): Promise<IReadFileResult> {
    const webR = await this.getWebR();
    const content = webR.FS.readFile(params.path || '', { encoding: 'utf8' });
    return { content: String(content || ''), cwd: webR.FS.cwd?.() };
  }

  public async request<TResult = unknown, TParams = Record<string, unknown>>(
    method: string,
    params?: TParams,
  ): Promise<TResult> {
    if (method === 'initialize') {
      await this.initialize(params as any);
      return undefined as TResult;
    }
    if (method === 'runCode') {
      return (await this.runCode(params as any)) as TResult;
    }
    if (method === 'submitCode') {
      return (await this.submitCode(params as any)) as TResult;
    }
    if (method === 'introspect') {
      return (await this.introspect(params as IIntrospectParams)) as unknown as TResult;
    }
    if (method === 'writeFile') {
      await this.writeFile(params as IWriteFileParams);
      return undefined as TResult;

    }
    if (method === 'readFile') {
      return (await this.readFile(params as IReadFileParams)) as unknown as TResult;

    }
    throw new Error(`Method not implemented in RWebRSession: ${method}`);
  }

  public onStatusChange(listener: StatusListener): () => void {
    return this.lifecycle.onStatusChange(listener);
  }

  public onOutput(listener: OutputListener): () => void {
    return this.lifecycle.onOutput(listener);
  }

  public getStatus(): ISessionStatus {
    return this.lifecycle.getStatus();
  }

  public destroy(): void {
    this.lifecycle.destroy();
  }
}
