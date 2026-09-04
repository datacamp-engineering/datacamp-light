import {
  EXPLAIN_CODE_MODEL_TAG,
  FIX_AND_EXPLAIN_DELIMITER,
  FIX_AND_EXPLAIN_MODEL_TAG,
  getAiApiBaseUrl,
  getMainAppBaseUrl,
  isFirstPartyDomain,
  isMockAiEnabled,
} from './aiConfig';

let cachedSignedInStatus: boolean | null = null;

export async function checkIsUserSignedIn(mockAiProp?: boolean): Promise<boolean> {
  if (isMockAiEnabled(mockAiProp)) {
    return true;
  }

  if (!isFirstPartyDomain()) {
    return false;
  }

  if (cachedSignedInStatus !== null) {
    return cachedSignedInStatus;
  }

  try {
    const response = await fetch(
      `${getMainAppBaseUrl()}/api/users/signed_in.json`,
      {
        credentials: 'include',
        method: 'HEAD',
      },
    );
    const isSignedIn = response.status === 200;
    cachedSignedInStatus = isSignedIn;
    return isSignedIn;
  } catch {
    return false;
  }
}

export function clearCachedSignedInStatus(): void {
  cachedSignedInStatus = null;
}

async function simulateStream(
  fullText: string,
  onChunk: (accumulated: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const words = fullText.split(/(\s+)/);
  let accumulated = '';

  for (const word of words) {
    if (signal?.aborted) {
      throw new Error('Streaming request aborted');
    }
    accumulated += word;
    onChunk(accumulated);
    await new Promise((resolve) => setTimeout(resolve, 30));
  }

  return accumulated;
}

interface GeneratePredictionOptions {
  input: Record<string, string>;
  modelTag: string;
  onChunk: (textChunk: string) => void;
  signal?: AbortSignal;
}

export async function generatePredictionStream({
  input,
  modelTag,
  onChunk,
  signal,
}: GeneratePredictionOptions): Promise<string> {
  const response = await fetch(
    `${getAiApiBaseUrl()}/learn/v1/prediction/generate/${modelTag}`,
    {
      body: JSON.stringify({
        input,
        shouldStream: true,
        trigger: {
          _tag: 'datacampLight',
        },
      }),
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal,
    },
  );

  if (!response.ok) {
    throw new Error(`AI prediction request failed with status ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('AI prediction response body is not readable');
  }

  const decoder = new TextDecoder();
  let accumulatedText = '';
  let partialLine = '';

  const processLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const jsonChunk = JSON.parse(trimmed);
      if (
        jsonChunk.type === 'gpt-partial-answer' &&
        Array.isArray(jsonChunk.choices) &&
        jsonChunk.choices[0]?.text
      ) {
        const textDelta = jsonChunk.choices[0].text;
        accumulatedText += textDelta;
        onChunk(accumulatedText);
      }
    } catch {
      // Ignore keep-alives or malformed lines
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    if (value) {
      const chunkText = decoder.decode(value, { stream: true });
      partialLine += chunkText;

      const lines = partialLine.split('\n');
      partialLine = lines.pop() ?? '';

      for (const line of lines) {
        processLine(line);
      }
    }
  }

  if (partialLine.trim()) {
    processLine(partialLine);
  }

  return accumulatedText;
}

export interface FixAndExplainResult {
  updatedCode: string;
  explanation: string;
}

export function parseFixAndExplainResponse(fullResponse: string): FixAndExplainResult {
  const delimiterIndex = fullResponse.indexOf(FIX_AND_EXPLAIN_DELIMITER);
  if (delimiterIndex === -1) {
    return {
      updatedCode: '',
      explanation: fullResponse.trim(),
    };
  }

  const updatedCode = fullResponse.substring(0, delimiterIndex).trim();
  const explanation = fullResponse
    .substring(delimiterIndex + FIX_AND_EXPLAIN_DELIMITER.length)
    .trim();

  return {
    updatedCode,
    explanation,
  };
}

export async function explainCode({
  code,
  language = 'python',
  userLanguage = 'English',
  mockAi = false,
  onChunk,
  signal,
}: {
  code: string;
  language?: string;
  userLanguage?: string;
  mockAi?: boolean;
  onChunk: (accumulatedExplanation: string) => void;
  signal?: AbortSignal;
}): Promise<string> {
  if (isMockAiEnabled(mockAi)) {
    const languageName = language.charAt(0).toUpperCase() + language.slice(1);
    const mockExplanation =
      `This code calculates values in **${languageName}** using defined variables and operations.\n\n` +
      `Each statement is evaluated sequentially and standard outputs or graphics are displayed in the results area.`;
    return simulateStream(mockExplanation, onChunk, signal);
  }

  return generatePredictionStream({
    input: {
      code,
      language,
      userLanguage,
    },
    modelTag: EXPLAIN_CODE_MODEL_TAG,
    onChunk,
    signal,
  });
}

export async function fixAndExplainCode({
  code,
  error,
  language = 'python',
  userLanguage = 'English',
  mockAi = false,
  onChunk,
  signal,
}: {
  code: string;
  error: string;
  language?: string;
  userLanguage?: string;
  mockAi?: boolean;
  onChunk: (accumulatedResponse: string) => void;
  signal?: AbortSignal;
}): Promise<FixAndExplainResult> {
  if (isMockAiEnabled(mockAi)) {
    let fixedCode = code;
    if (code.includes('rad') && !code.includes('radius')) {
      fixedCode = code.replace(/rad\b/g, 'radius');
    } else if (code.includes('=')) {
      fixedCode = code.replace(/([a-zA-Z_]+)\s*=\s*$/, '$1 = 5');
    }
    if (fixedCode === code) {
      fixedCode = code.replace(/Area:\s*\{area\}/g, 'Area: {area}') + '\n# Verified calculation';
    }

    const mockPayload = `${fixedCode}${FIX_AND_EXPLAIN_DELIMITER}Corrected the code statement to resolve the error and ensure valid calculation.`;
    const streamedResponse = await simulateStream(
      mockPayload,
      (chunk) => {
        const parsed = parseFixAndExplainResponse(chunk);
        if (parsed.explanation) {
          onChunk(parsed.explanation);
        }
      },
      signal,
    );

    return parseFixAndExplainResponse(streamedResponse);
  }

  const rawResponse = await generatePredictionStream({
    input: {
      code,
      error: error || 'No error message provided',
      language,
      userLanguage,
    },
    modelTag: FIX_AND_EXPLAIN_MODEL_TAG,
    onChunk,
    signal,
  });

  return parseFixAndExplainResponse(rawResponse);
}
