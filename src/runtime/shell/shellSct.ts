export interface ShellSctEvaluationResult {
  correct: boolean;
  message: string;
}

export function evaluateShellSubmission(
  code: string,
  submissionCorrectnessTest?: string,
  executionError?: string,
): ShellSctEvaluationResult {
  let isCorrect = !executionError;
  let feedbackMessage = isCorrect
    ? 'Great work! Your solution passed all tests.'
    : executionError || 'Incorrect command. Please review your input.';

  if (submissionCorrectnessTest && submissionCorrectnessTest.trim() && isCorrect) {
    const typedPatternMatch = submissionCorrectnessTest.match(
      /test_student_typed\(\s*r?['"](.+?)['"]/,
    );
    if (typedPatternMatch) {
      try {
        const regex = new RegExp(typedPatternMatch[1]);
        if (!regex.test(code)) {
          isCorrect = false;
          const messageMatch = submissionCorrectnessTest.match(/msg\s*=\s*['"](.+?)['"]/);
          feedbackMessage = messageMatch
            ? messageMatch[1]
            : 'Your command did not match the expected pattern.';
        }
      } catch {
        // Fall back to student typed substring search if regex construction fails
        if (!code.includes(typedPatternMatch[1])) {
          isCorrect = false;
          feedbackMessage = 'Your command did not match the expected pattern.';
        }
      }
    }
  }

  return {
    correct: isCorrect,
    message: feedbackMessage,
  };
}
