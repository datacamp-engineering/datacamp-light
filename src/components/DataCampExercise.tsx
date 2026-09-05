import '../i18n';
import { theme } from '@datacamp/waffles/theme';
import { tokens } from '@datacamp/waffles/tokens';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  checkIsUserSignedIn,
  explainCode,
  fixAndExplainCode,
  parseFixAndExplainResponse,
} from '../ai/aiClient';
import { isFirstPartyDomain } from '../ai/aiConfig';
import { computeLineDiff } from '../ai/lineDiff';
import type { LineChange } from '../ai/lineDiff';
import type { ISessionOutputNotification, ISessionStatus } from '../jsonrpc/types';
import { acquireSession } from '../runtime/sessionPool';
import { useResolvedTheme } from '../theme/themeManager';
import { ActionBar } from './ActionBar';
import { AiExplanationPanel } from './AiExplanationPanel';
import { AiUpsellBanner } from './AiUpsellBanner';
import { CodeEditor } from './CodeEditor';
import { DCLWidgetShell } from './DCLWidgetShell';
import { FeedbackBanner } from './FeedbackBanner';
import { Footer } from './Footer';
import { OutputConsole } from './OutputConsole';
import type { ConsoleEntry } from './OutputConsole';
import { PlotCanvas } from './PlotCanvas';
import { ResizeHandle } from './ResizeHandle';
import { TerminalConsole } from './TerminalConsole';

export interface DataCampExerciseProps {
  id?: string;
  language?: string;
  theme?: 'light' | 'dark';
  sampleCode?: string;
  preExerciseCode?: string;
  solution?: string;
  sct?: string;
  hint?: string;
  packages?: string[];
  height?: number | string;
  showRunButton?: boolean;
  showAi?: boolean;
  mockAi?: boolean | string;
  autocomplete?: boolean;
  sharedEnvironment?: boolean | string;
  utmSource?: string;
  utmCampaign?: string;
  impactTrackingLink?: string;
  onRun?: (code: string) => void;
  onSubmit?: (code: string) => void;
  onFeedback?: (correct: boolean, message: string) => void;
}

const HintPanel: React.FC<{ hint: string }> = ({ hint }) => (
  <div
    css={{
      backgroundColor: theme.background.secondary,
      borderTop: `${tokens.borderWidth.thin} solid ${theme.border.main}`,
      color: theme.text.secondary,
      fontSize: tokens.fontSizes.medium,
      padding: `${tokens.spacingNew.small} ${tokens.spacingNew.medium}`,
    }}
    dangerouslySetInnerHTML={{ __html: hint }}
  />
);

/**
 * Shell exercises have no code editor / solution in the legacy DataCamp
 * Light product - interaction happens purely through a terminal, with the
 * SCT checked against whatever the learner has typed so far. The terminal
 * executes commands freely (runCode) so exploring with ls/cd/pwd works
 * like a real shell; submission (submitCode) only happens on an explicit
 * "Submit Answer" press so the SCT isn't run against every keystroke.
 */
const ShellExercise: React.FC<{
  hint: string;
  preExerciseCode: string;
  sct: string;
  height: number | string;
  theme?: 'light' | 'dark';
  sharedEnvironment?: boolean | string;
  utmSource?: string;
  utmCampaign?: string;
  impactTrackingLink?: string;
  onSubmit?: (code: string) => void;
  onFeedback?: (correct: boolean, message: string) => void;
}> = ({
  hint,
  preExerciseCode,
  sct,
  height,
  theme: themeMode,
  sharedEnvironment,
  utmSource,
  utmCampaign,
  impactTrackingLink,
  onSubmit,
  onFeedback,
}) => {
  const { theme: activeTheme, toggleTheme } = useResolvedTheme(themeMode);
  const [showingHint, setShowingHint] = useState(false);
  const [feedback, setFeedback] = useState<{ correct: boolean; message: string } | null>(null);
  const [typedHistory, setTypedHistory] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<ISessionStatus>({ status: 'none' });
  const [resetCounter, setResetCounter] = useState(0);
  const initialHeight = typeof height === 'number' ? height : 300;
  const [terminalHeight, setTerminalHeight] = useState<number>(initialHeight);

  const { session, release } = useMemo(
    () => acquireSession('shell', sharedEnvironment),
    [sharedEnvironment],
  );

  useEffect(() => {
    const unsubscribeStatus = session.onStatusChange((newStatus: ISessionStatus) => {
      setStatus(newStatus);
    });

    session
      .initialize({ pec: preExerciseCode, sct, language: 'shell' })
      .catch((initializationError: any) => {
        console.warn('DataCamp Light shell initialization warning:', initializationError);
      });

    return () => {
      unsubscribeStatus();
      release();
    };
  }, [session, release, preExerciseCode, sct]);

  // Terminal commands execute freely - no SCT on every line. Each keystroke
  // runs exactly one command via runCommand (never the replayed history), so
  // shared state like the working directory persists and silent commands such
  // as cd still report their new cwd back to the terminal.
  const handleExecuteShellCommand = useCallback(
    async (
      command: string,
    ): Promise<{ output?: string; error?: string; cwd?: string }> => {
      setTypedHistory((previousHistory) => {
        const nextHistory = [...previousHistory, command];
        onSubmit?.(nextHistory.join('\n'));
        return nextHistory;
      });
      setFeedback(null);

      try {
        const result = await session.runCommand({ command });
        return result;
      } catch (executionError: any) {
        return { error: executionError.message || 'Execution error' };
      }
    },
    [session, onSubmit],
  );

  // SCT grading only on explicit submit, against the full typed history.
  const handleSubmit = async () => {
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const result = await session.submitCode({
        code: typedHistory.join('\n'),
        sct,
        pec: preExerciseCode,
      });
      setFeedback({ correct: result.correct, message: result.message });
      onFeedback?.(result.correct, result.message);
    } catch (evaluationError: any) {
      setFeedback({
        correct: false,
        message: evaluationError.message || 'Evaluation error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setTypedHistory([]);
    setFeedback(null);
    setShowingHint(false);
    setResetCounter((previousCounter) => previousCounter + 1);
    session
      .initialize({ pec: preExerciseCode, sct, language: 'shell' })
      .catch((initializationError: any) => {
        console.warn('DataCamp Light shell reset warning:', initializationError);
      });
  };

  const handleIntrospect = useCallback(
    async (code: string, column: number) => {
      try {
        const result: any = await session.request('introspect', {
          code,
          line: 0,
          column,
          language: 'shell',
        });
        return result?.completions || [];
      } catch {
        return [];
      }
    },
    [session],
  );

  return (
    <DCLWidgetShell theme={activeTheme}>
      <ActionBar
        onSubmit={handleSubmit}
        onReset={handleReset}
        onToggleHint={hint ? () => setShowingHint((previous) => !previous) : undefined}
        isExecuting={isSubmitting}
        executingAction={isSubmitting ? 'submit' : null}
        hasHint={Boolean(hint)}
        showingHint={showingHint}
        hasSct={Boolean(sct && sct.trim())}
        showRunButton={false}
        status={status}
        borderTop={false}
        resetAriaLabel="Reset terminal"
      />

      {showingHint && hint && <HintPanel hint={hint} />}

      {feedback && (
        <FeedbackBanner
          correct={feedback.correct}
          message={feedback.message}
          onClose={() => setFeedback(null)}
        />
      )}

      <TerminalConsole
        onExecuteCommand={handleExecuteShellCommand}
        onIntrospect={handleIntrospect}
        prompt="$ "
        height={terminalHeight}
        resetKey={resetCounter}
        theme={activeTheme}
      />

      <ResizeHandle
        ariaLabel="Resize terminal"
        onResize={(deltaY) =>
          setTerminalHeight((previous) => Math.max(120, Math.min(800, previous + deltaY)))
        }
      />

      <Footer
        theme={activeTheme}
        onToggleTheme={toggleTheme}
        utmSource={utmSource}
        utmCampaign={utmCampaign}
        impactTrackingLink={impactTrackingLink}
      />
    </DCLWidgetShell>
  );
};

const CodeExercise: React.FC<DataCampExerciseProps> = ({
  language = 'python',
  theme: propTheme,
  sampleCode = '',
  preExerciseCode = '',
  solution = '',
  sct = '',
  hint = '',
  packages = [],
  height = 'auto',
  showRunButton = true,
  showAi = true,
  mockAi = false,
  autocomplete = true,
  sharedEnvironment,
  utmSource,
  utmCampaign,
  impactTrackingLink,
  onRun,
  onSubmit,
  onFeedback,
}) => {
  const { theme: activeTheme, toggleTheme } = useResolvedTheme(propTheme);
  const [code, setCode] = useState(sampleCode);
  const [showingSolution, setShowingSolution] = useState(false);
  const [showingHint, setShowingHint] = useState(false);
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
  const [plots, setPlots] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<{ correct: boolean; message: string } | null>(null);
  const [executingAction, setExecutingAction] = useState<'run' | 'submit' | null>(null);
  const [status, setStatus] = useState<ISessionStatus>({ status: 'none' });

  const [aiState, setAiState] = useState<{
    visible: boolean;
    type: 'explain' | 'fix' | 'upsell';
    upsellVariant?: 'third-party' | 'signed-out';
    title?: string;
    explanation: string;
    diff?: LineChange[];
    proposedCode?: string;
    isLoading: boolean;
    error: string | null;
  }>({
    visible: false,
    type: 'explain',
    explanation: '',
    isLoading: false,
    error: null,
  });

  const initialEditorHeight = typeof height === 'number' ? height : 240;
  const [editorHeight, setEditorHeight] = useState<number>(initialEditorHeight);
  const [outputHeight, setOutputHeight] = useState<number>(140);
  const [plotHeight, setPlotHeight] = useState<number>(400);

  const { session, release } = useMemo(
    () => acquireSession(language, sharedEnvironment),
    [language, sharedEnvironment],
  );

  const prompt = language === 'r' ? '> ' : '>>> ';

  useEffect(() => {
    const unsubscribeStatus = session.onStatusChange((newStatus: ISessionStatus) => {
      setStatus(newStatus);
    });

    const unsubscribeOutput = session.onOutput((notification: ISessionOutputNotification) => {
      if (notification.type === 'output' && typeof notification.payload === 'string') {
        setConsoleEntries((previous) => [
          ...previous,
          { type: 'output', text: notification.payload as string },
        ]);
      } else if (notification.type === 'graph' && typeof notification.payload === 'string') {
        setPlots((previous) => [...previous, notification.payload as string]);
      } else if (notification.type === 'error' && typeof notification.payload === 'string') {
        setConsoleEntries((previous) => [
          ...previous,
          { type: 'error', text: notification.payload as string },
        ]);
      }
    });

    session
      .initialize({
        pec: preExerciseCode,
        solution,
        sct,
        packages,
        language,
      })
      .catch((initializationError: any) => {
        console.warn('DataCamp Light initialization warning:', initializationError);
      });

    return () => {
      unsubscribeStatus();
      unsubscribeOutput();
      release();
    };
  }, [session, release, preExerciseCode, solution, sct, packages, language]);

  const handleRun = async () => {
    setExecutingAction('run');
    setFeedback(null);
    onRun?.(code);

    try {
      await session.runCode({ code });
    } catch (executionError: any) {
      setConsoleEntries((previous) => [
        ...previous,
        { type: 'error', text: executionError.message || 'Execution error' },
      ]);
    } finally {
      setExecutingAction(null);
    }
  };

  const handleSubmit = async () => {
    setExecutingAction('submit');
    setFeedback(null);
    onSubmit?.(code);

    try {
      const result = await session.submitCode({
        code,
        sct,
        pec: preExerciseCode,
        solution,
      });

      setFeedback({
        correct: result.correct,
        message: result.message,
      });
      onFeedback?.(result.correct, result.message);
    } catch (evaluationError: any) {
      setFeedback({
        correct: false,
        message: evaluationError.message || 'Evaluation error',
      });
    } finally {
      setExecutingAction(null);
    }
  };

  const handleExecuteConsoleCommand = async (command: string) => {
    setConsoleEntries((previous) => [...previous, { type: 'input', text: command }]);
    setExecutingAction('run');

    try {
      await session.runCode({ code: command });
    } catch (executionError: any) {
      setConsoleEntries((previous) => [
        ...previous,
        { type: 'error', text: executionError.message || 'Execution error' },
      ]);
    } finally {
      setExecutingAction(null);
    }
  };

  const handleReset = () => {
    setCode(sampleCode);
    setShowingSolution(false);
    setShowingHint(false);
    setConsoleEntries([]);
    setPlots([]);
    setFeedback(null);
    setAiState((previous) => ({ ...previous, visible: false }));
    session
      .initialize({
        pec: preExerciseCode,
        solution,
        sct,
        packages,
        language,
      })
      .catch((initializationError: any) => {
        console.warn('DataCamp Light reset warning:', initializationError);
      });
  };

  const handleToggleSolution = () => {
    if (showingSolution) {
      setCode(sampleCode);
      setShowingSolution(false);
    } else {
      setCode(solution);
      setShowingSolution(true);
    }
  };

  const handleToggleHint = () => {
    setShowingHint((previous) => !previous);
  };

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

    setAiState({
      visible: true,
      type: 'explain',
      title: 'Code Explanation',
      explanation: '',
      isLoading: true,
      error: null,
    });

    const isSignedIn = await checkIsUserSignedIn(mockAi);
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

  const handleFixAndExplain = async () => {
    if (!showAi) return;

    const lastErrorEntry = consoleEntries
      .slice()
      .reverse()
      .find((entry) => entry.type === 'error');
    const errorMessage = lastErrorEntry?.text || feedback?.message || 'Error occurred';

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

    setAiState({
      visible: true,
      type: 'fix',
      title: 'Fix & Explain',
      explanation: '',
      isLoading: true,
      error: null,
    });

    const isSignedIn = await checkIsUserSignedIn(mockAi);
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

    try {
      const result = await fixAndExplainCode({
        code,
        error: errorMessage,
        language,
        mockAi,
        onChunk: (chunk) => {
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

      const diff = result.updatedCode ? computeLineDiff(code, result.updatedCode) : undefined;

      setAiState((previous) => ({
        ...previous,
        diff,
        explanation: result.explanation || previous.explanation,
        isLoading: false,
        proposedCode: result.updatedCode,
      }));
    } catch (fixError: any) {
      setAiState((previous) => ({
        ...previous,
        isLoading: false,
        error: fixError.message || 'Failed to generate fix and explanation',
      }));
    }
  };

  const handleAcceptFix = () => {
    if (aiState.proposedCode) {
      setCode(aiState.proposedCode);
    }
    setAiState((previous) => ({ ...previous, visible: false }));
  };

  const handleRejectFix = () => {
    setAiState((previous) => ({ ...previous, visible: false }));
  };

  const handleCloseAi = () => {
    setAiState((previous) => ({ ...previous, visible: false }));
  };

  return (
    <DCLWidgetShell theme={activeTheme}>
      <CodeEditor
        code={code}
        onChange={setCode}
        height={editorHeight}
        language={language}
        session={session}
        autocomplete={autocomplete}
      />

      <ResizeHandle
        ariaLabel="Resize code editor"
        onResize={(deltaY) =>
          setEditorHeight((previous) => Math.max(100, Math.min(800, previous + deltaY)))
        }
      />

      <ActionBar
        onRun={handleRun}
        onSubmit={handleSubmit}
        onReset={handleReset}
        onToggleSolution={solution ? handleToggleSolution : undefined}
        onToggleHint={hint ? handleToggleHint : undefined}
        onExplainCode={handleExplainCode}
        isExecuting={executingAction !== null}
        executingAction={executingAction}
        isExplainingCode={aiState.isLoading && aiState.type === 'explain'}
        hasSolution={Boolean(solution)}
        showingSolution={showingSolution}
        hasHint={Boolean(hint)}
        showingHint={showingHint}
        hasSct={Boolean(sct && sct.trim())}
        showRunButton={showRunButton}
        showAi={showAi}
        status={status}
      />

      {showingHint && hint && <HintPanel hint={hint} />}

      {aiState.visible && aiState.type === 'upsell' && (
        <AiUpsellBanner
          code={code}
          impactTrackingLink={impactTrackingLink}
          language={language}
          onClose={handleCloseAi}
          utmCampaign={utmCampaign}
          utmSource={utmSource}
          variant={aiState.upsellVariant || 'third-party'}
        />
      )}

      {aiState.visible && aiState.type !== 'upsell' && (
        <AiExplanationPanel
          diff={aiState.diff}
          error={aiState.error}
          explanation={aiState.explanation}
          isLoading={aiState.isLoading}
          onAcceptFix={handleAcceptFix}
          onClose={handleCloseAi}
          onRejectFix={handleRejectFix}
          title={aiState.title}
        />
      )}

      {feedback && (
        <FeedbackBanner
          correct={feedback.correct}
          message={feedback.message}
          onClose={() => setFeedback(null)}
        />
      )}

      <OutputConsole
        entries={consoleEntries}
        prompt={prompt}
        onExecuteCommand={handleExecuteConsoleCommand}
        onFixAndExplain={handleFixAndExplain}
        isExecuting={executingAction !== null}
        isFixingAndExplaining={aiState.isLoading && aiState.type === 'fix'}
        showAi={showAi}
        height={outputHeight}
      />

      <ResizeHandle
        ariaLabel="Resize output console"
        onResize={(deltaY) =>
          setOutputHeight((previous) => Math.max(80, Math.min(600, previous + deltaY)))
        }
      />

      {plots.length > 0 && (
        <>
          <PlotCanvas height={plotHeight} plots={plots} />
          <ResizeHandle
            ariaLabel="Resize plot section"
            onResize={(deltaY) =>
              setPlotHeight((previous) => Math.max(150, Math.min(800, previous + deltaY)))
            }
          />
        </>
      )}

      <Footer
        code={code}
        impactTrackingLink={impactTrackingLink}
        language={language}
        onToggleTheme={toggleTheme}
        theme={activeTheme}
        utmCampaign={utmCampaign}
        utmSource={utmSource}
      />
    </DCLWidgetShell>
  );
};

export const DataCampExercise: React.FC<DataCampExerciseProps> = (props) => {
  const {
    language = 'python',
    theme,
    hint = '',
    preExerciseCode = '',
    sct = '',
    height = 'auto',
    showAi = true,
    utmSource,
    utmCampaign,
    impactTrackingLink,
    onSubmit,
    onFeedback,
  } = props;

  if (language === 'shell') {
    return (
      <ShellExercise
        height={height}
        hint={hint}
        impactTrackingLink={impactTrackingLink}
        onFeedback={onFeedback}
        onSubmit={onSubmit}
        preExerciseCode={preExerciseCode}
        sct={sct}
        sharedEnvironment={props.sharedEnvironment}
        theme={theme}
        utmCampaign={utmCampaign}
        utmSource={utmSource}
      />
    );
  }

  return (
    <CodeExercise
      {...props}
      impactTrackingLink={impactTrackingLink}
      mockAi={props.mockAi}
      sharedEnvironment={props.sharedEnvironment}
      showAi={showAi}
      theme={theme}
    />
  );
};
