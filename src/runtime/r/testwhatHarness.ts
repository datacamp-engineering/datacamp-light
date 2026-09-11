export interface UnpackedRTestwhatResult {
  correct: boolean;
  message: string;
  output: string;
}

export function escapeRString(stringToEscape: string): string {
  return JSON.stringify(stringToEscape);
}

export function buildTestwhatEvaluationScript(options: {
  preExerciseCode: string;
  studentCode: string;
  solutionCode: string;
  submissionCorrectnessTest: string;
}): string {
  const {
    preExerciseCode,
    studentCode,
    solutionCode,
    submissionCorrectnessTest,
  } = options;

  return `
    local({
      pec_code <- ${escapeRString(preExerciseCode)}
      student_code <- ${escapeRString(studentCode)}
      solution_code <- ${escapeRString(solutionCode)}
      sct_code <- ${escapeRString(submissionCorrectnessTest)}

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
}

export function unpackRListResult(unpackedResult: any): UnpackedRTestwhatResult {
  let isCorrect = false;
  let feedbackMessage = '';
  let commandOutput = '';

  if (unpackedResult && typeof unpackedResult === 'object') {
    if (Array.isArray(unpackedResult.names) && Array.isArray(unpackedResult.values)) {
      const correctIndex = unpackedResult.names.indexOf('correct');
      const messageIndex = unpackedResult.names.indexOf('message');
      const outputIndex = unpackedResult.names.indexOf('output');
      if (correctIndex !== -1) {
        const targetValueObject = unpackedResult.values[correctIndex];
        isCorrect = Array.isArray(targetValueObject?.values)
          ? Boolean(targetValueObject.values[0])
          : Boolean(targetValueObject);
      }
      if (messageIndex !== -1) {
        const targetValueObject = unpackedResult.values[messageIndex];
        feedbackMessage = Array.isArray(targetValueObject?.values)
          ? String(targetValueObject.values[0] ?? '')
          : String(targetValueObject ?? '');
      }
      if (outputIndex !== -1) {
        const targetValueObject = unpackedResult.values[outputIndex];
        commandOutput = Array.isArray(targetValueObject?.values)
          ? String(targetValueObject.values[0] ?? '')
          : String(targetValueObject ?? '');
      }
    } else {
      if ('correct' in unpackedResult) {
        isCorrect = Array.isArray(unpackedResult.correct)
          ? Boolean(unpackedResult.correct[0])
          : Boolean(unpackedResult.correct);
      }
      if ('message' in unpackedResult) {
        feedbackMessage = Array.isArray(unpackedResult.message)
          ? String(unpackedResult.message[0] ?? '')
          : String(unpackedResult.message ?? '');
      }
      if ('output' in unpackedResult) {
        commandOutput = Array.isArray(unpackedResult.output)
          ? String(unpackedResult.output[0] ?? '')
          : String(unpackedResult.output ?? '');
      }
    }
  }

  feedbackMessage = feedbackMessage.trim();
  if (!feedbackMessage) {
    feedbackMessage = isCorrect
      ? 'Great work! Your solution passed all tests.'
      : 'Incorrect solution.';
  }

  return {
    correct: isCorrect,
    message: feedbackMessage,
    output: commandOutput,
  };
}

export function buildRIntrospectionScript(
  targetObject: string,
  triggerCharacter: string,
): string {
  if (triggerCharacter === '$' || triggerCharacter === '.') {
    return `
      local({
        target <- tryCatch(eval(parse(text = ${escapeRString(targetObject)})), error = function(e) NULL)
        if (is.null(target)) {
          character(0)
        } else if (is.data.frame(target) || is.list(target)) {
          names(target)
        } else if (is.environment(target)) {
          ls(envir = target)
        } else {
          character(0)
        }
      })
    `;
  }

  return `
    local({
      objects <- ls(envir = .GlobalEnv)
      loaded_packages <- search()
      package_exports <- character(0)
      for (pkg in loaded_packages[grepl("^package:", loaded_packages)]) {
        package_exports <- c(package_exports, ls(pkg))
      }
      unique(c(objects, package_exports))
    })
  `;
}
