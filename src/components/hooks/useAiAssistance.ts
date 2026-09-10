import { useState } from 'react';
import {
  checkIsUserSignedIn,
  explainCode,
  fixAndExplainCode,
  parseFixAndExplainResponse,
} from '../../ai/aiClient';
import { FIX_AND_EXPLAIN_DELIMITER, isFirstPartyDomain } from '../../ai/aiConfig';
import { computeLineDiff, type LineChange } from '../../ai/lineDiff';

export interface AiAssistanceState {
  visible: boolean;
  type: 'explain' | 'fix' | 'upsell';
  upsellVariant?: 'third-party' | 'signed-out';
  title?: string;
  explanation: string;
  diff?: LineChange[];
  replacementCode?: string;
  isLoading: boolean;
  error: string | null;
}

export function useAiAssistance(options: {
  showAi?: boolean;
  mockAi?: boolean | string;
  code: string;
  language?: string;
  onApplyReplacementCode?: (replacementCode: string) => void;
}) {
  const { showAi, mockAi, code, language, onApplyReplacementCode } = options;

  const [aiState, setAiState] = useState<AiAssistanceState>({
    visible: false,
    type: 'explain',
    explanation: '',
    isLoading: false,
    error: null,
  });

  const handleExplainCode = async () => {
    if (!showAi) return;

    if (!isFirstPartyDomain(mockAi)) {
      setAiState({
        visible: true,
        type: 'upsell',
        upsellVariant: 'third-party',
        explanation: '',
        isLoading: false,
        error: null,
      });
      return;
    }

    let isSignedIn = false;
    try {
      isSignedIn = await checkIsUserSignedIn(mockAi);
    } catch {
      isSignedIn = false;
    }

    if (!isSignedIn) {
      setAiState({
        visible: true,
        type: 'upsell',
        upsellVariant: 'signed-out',
        explanation: '',
        isLoading: false,
        error: null,
      });
      return;
    }

    setAiState({
      visible: true,
      type: 'explain',
      title: 'Code Explanation',
      explanation: '',
      isLoading: true,
      error: null,
    });

    try {
      await explainCode({
        code,
        language,
        mockAi,
        onChunk: (chunk) => {
          setAiState((previous) => ({
            ...previous,
            explanation: chunk,
            isLoading: false,
          }));
        },
      });
      setAiState((previous) => ({ ...previous, isLoading: false }));
    } catch (explanationError: any) {
      setAiState((previous) => ({
        ...previous,
        isLoading: false,
        error: explanationError.message || 'Failed to generate code explanation',
      }));
    }
  };

  const handleFixAndExplain = async (errorMessage?: string) => {
    if (!showAi) return;

    if (!isFirstPartyDomain(mockAi)) {
      setAiState({
        visible: true,
        type: 'upsell',
        upsellVariant: 'third-party',
        explanation: '',
        isLoading: false,
        error: null,
      });
      return;
    }

    let isSignedIn = false;
    try {
      isSignedIn = await checkIsUserSignedIn(mockAi);
    } catch {
      isSignedIn = false;
    }

    if (!isSignedIn) {
      setAiState({
        visible: true,
        type: 'upsell',
        upsellVariant: 'signed-out',
        explanation: '',
        isLoading: false,
        error: null,
      });
      return;
    }

    setAiState({
      visible: true,
      type: 'fix',
      title: 'Fix & Explain',
      explanation: '',
      diff: undefined,
      isLoading: true,
      error: null,
    });

    try {
      const result = await fixAndExplainCode({
        code,
        language,
        error: errorMessage || 'Error occurred',
        mockAi,
        onChunk: (chunk) => {
          // The response streams as `<updated code><delimiter><explanation>`.
          // Before the delimiter arrives, the accumulated text is the raw
          // fixed code — never render it as the explanation, or markdown
          // parsing would turn `#` comment lines inside the code into h1
          // headings (the panel then flips to the diff once streaming
          // completes).
          if (!chunk.includes(FIX_AND_EXPLAIN_DELIMITER)) {
            return;
          }
          const parsed = parseFixAndExplainResponse(chunk);
          if (parsed.explanation) {
            setAiState((previous) => ({
              ...previous,
              explanation: parsed.explanation,
              isLoading: false,
            }));
          }
        },
      });

      const computedDiff = result.updatedCode
        ? computeLineDiff(code, result.updatedCode)
        : undefined;

      setAiState((previous) => ({
        ...previous,
        explanation: result.explanation || previous.explanation,
        replacementCode: result.updatedCode || undefined,
        diff: computedDiff,
        isLoading: false,
      }));
    } catch (fixError: any) {
      setAiState((previous) => ({
        ...previous,
        isLoading: false,
        error: fixError.message || 'Failed to generate code fix',
      }));
    }
  };

  const handleCloseAiPanel = () => {
    setAiState((previous) => ({ ...previous, visible: false }));
  };

  const handleApplyAiDiff = () => {
    if (aiState.replacementCode) {
      onApplyReplacementCode?.(aiState.replacementCode);
    }
    setAiState((previous) => ({ ...previous, visible: false }));
  };

  const handleRejectAiDiff = () => {
    setAiState((previous) => ({ ...previous, visible: false }));
  };

  return {
    aiState,
    setAiState,
    handleExplainCode,
    handleFixAndExplain,
    handleCloseAiPanel,
    handleApplyAiDiff,
    handleRejectAiDiff,
  };
}
