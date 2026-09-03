import '../i18n';
import { Button } from '@datacamp/waffles/button';
import { theme } from '@datacamp/waffles/theme';
import { tokens } from '@datacamp/waffles/tokens';
import React, { useEffect, useMemo, useState } from 'react';
import type { ISessionStatus } from '../jsonrpc/types';
import { createSessionForLanguage } from '../runtime/createSessionForLanguage';
import { ActionBar } from './ActionBar';
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
  sampleCode?: string;
  preExerciseCode?: string;
  solution?: string;
  sct?: string;
  hint?: string;
  packages?: string[];
  height?: number | string;
  showRunButton?: boolean;
  utmSource?: string;
  utmCampaign?: string;
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
  utmSource?: string;
  utmCampaign?: string;
  onSubmit?: (code: string) => void;
  onFeedback?: (correct: boolean, message: string) => void;
}> = ({ hint, preExerciseCode, sct, height, utmSource, utmCampaign, onSubmit, onFeedback }) => {
  const [showingHint, setShowingHint] = useState(false);
  const [feedback, setFeedback] = useState<{ correct: boolean; message: string } | null>(null);
  const [typedHistory, setTypedHistory] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const initialHeight = typeof height === 'number' ? height : 300;
  const [terminalHeight, setTerminalHeight] = useState<number>(initialHeight);

  const session = useMemo(() => createSessionForLanguage('shell'), []);

  useEffect(() => {
    session.initialize({ pec: preExerciseCode, sct, language: 'shell' }).catch((err) => {
      console.warn('DataCamp Light shell initialisation warning:', err);
    });

    return () => {
      session.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Terminal commands execute freely - no SCT on every line. Each keystroke
  // runs exactly one command via runCommand (never the replayed history), so
  // shared state like the working directory persists and silent commands such
  // as cd still report their new cwd back to the terminal.
  const handleExecuteShellCommand = async (
    command: string,
  ): Promise<{ output?: string; error?: string; cwd?: string }> => {
    const nextHistory = [...typedHistory, command];
    setTypedHistory(nextHistory);
    setFeedback(null);

    try {
      const result = await session.runCommand({ command });
      onSubmit?.(nextHistory.join('\n'));
      return result;
    } catch (err: any) {
      return { error: err.message || 'Execution error' };
    }
  };

  // SCT grading only on explicit submit, against the full typed history.
  const handleSubmit = async () => {
    setSubmitting(true);
    setFeedback(null);
    try {
      const result = await session.submitCode({
        code: typedHistory.join('\n'),
        sct,
        pec: preExerciseCode,
      });
      setFeedback({ correct: result.correct, message: result.message });
      onFeedback?.(result.correct, result.message);
    } catch (err: any) {
      setFeedback({ correct: false, message: err.message || 'Evaluation error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setTypedHistory([]);
    setFeedback(null);
    setShowingHint(false);
  };

  return (
    <DCLWidgetShell>
      <div
        css={{
          alignItems: 'center',
          backgroundColor: theme.background.secondary,
          display: 'flex',
          gap: tokens.spacingNew.xsmall,
          justifyContent: 'flex-end',
          padding: `${tokens.spacingNew.xsmall} ${tokens.spacingNew.medium}`,
        }}
      >
        {hint && (
          <Button
            onClick={() => setShowingHint((prev) => !prev)}
            size="small"
            variant="plain"
          >
            {showingHint ? 'Hide Hint' : 'Show Hint'}
          </Button>
        )}
        <Button
          disabled={submitting}
          isLoading={submitting}
          onClick={handleSubmit}
          size="small"
          variant="regularOutline"
        >
          Submit Answer
        </Button>
        <Button aria-label="Reset terminal" onClick={handleReset} size="small" variant="plain">
          Reset
        </Button>
      </div>

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
        prompt="$ "
        height={terminalHeight}
      />

      <ResizeHandle
        ariaLabel="Resize terminal"
        onResize={(deltaY) =>
          setTerminalHeight((prev) => Math.max(120, Math.min(800, prev + deltaY)))
        }
      />

      <Footer utmSource={utmSource} utmCampaign={utmCampaign} />
    </DCLWidgetShell>
  );
};

const CodeExercise: React.FC<DataCampExerciseProps> = ({
  language = 'python',
  sampleCode = '',
  preExerciseCode = '',
  solution = '',
  sct = '',
  hint = '',
  packages = [],
  height = 'auto',
  showRunButton = true,
  utmSource,
  utmCampaign,
  onRun,
  onSubmit,
  onFeedback,
}) => {
  const [code, setCode] = useState(sampleCode);
  const [showingSolution, setShowingSolution] = useState(false);
  const [showingHint, setShowingHint] = useState(false);
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
  const [plots, setPlots] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<{ correct: boolean; message: string } | null>(null);
  const [executingAction, setExecutingAction] = useState<'run' | 'submit' | null>(null);
  const [status, setStatus] = useState<ISessionStatus>({ status: 'none' });

  const initialEditorHeight = typeof height === 'number' ? height : 240;
  const [editorHeight, setEditorHeight] = useState<number>(initialEditorHeight);
  const [outputHeight, setOutputHeight] = useState<number>(140);
  const [plotHeight, setPlotHeight] = useState<number>(400);

  const session = useMemo(() => createSessionForLanguage(language), [language]);

  const prompt = language === 'r' ? '> ' : '>>> ';

  useEffect(() => {
    const unsubStatus = session.onStatusChange((newStatus) => {
      setStatus(newStatus);
    });

    const unsubOutput = session.onOutput((notif) => {
      if (notif.type === 'output' && typeof notif.payload === 'string') {
        setConsoleEntries((prev) => [...prev, { type: 'output', text: notif.payload as string }]);
      } else if (notif.type === 'graph' && typeof notif.payload === 'string') {
        setPlots((prev) => [...prev, notif.payload as string]);
      } else if (notif.type === 'error' && typeof notif.payload === 'string') {
        setConsoleEntries((prev) => [...prev, { type: 'error', text: notif.payload as string }]);
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
      .catch((err) => {
        console.warn('DataCamp Light initialisation warning:', err);
      });

    return () => {
      unsubStatus();
      unsubOutput();
      session.destroy();
    };
  }, [session, preExerciseCode, solution, sct, language]);

  const handleRun = async () => {
    setExecutingAction('run');
    setFeedback(null);
    onRun?.(code);

    try {
      await session.runCode({ code });
    } catch (err: any) {
      setConsoleEntries((prev) => [
        ...prev,
        { type: 'error', text: err.message || 'Execution error' },
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
    } catch (err: any) {
      setFeedback({
        correct: false,
        message: err.message || 'Evaluation error',
      });
    } finally {
      setExecutingAction(null);
    }
  };

  const handleExecuteConsoleCommand = async (command: string) => {
    setConsoleEntries((prev) => [...prev, { type: 'input', text: command }]);
    setExecutingAction('run');

    try {
      await session.runCode({ code: command });
    } catch (err: any) {
      setConsoleEntries((prev) => [
        ...prev,
        { type: 'error', text: err.message || 'Execution error' },
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
    setShowingHint((prev) => !prev);
  };

  return (
    <DCLWidgetShell>
      <CodeEditor
        code={code}
        onChange={setCode}
        height={editorHeight}
        language={language}
      />

      <ResizeHandle
        ariaLabel="Resize code editor"
        onResize={(deltaY) =>
          setEditorHeight((prev) => Math.max(100, Math.min(800, prev + deltaY)))
        }
      />

      <ActionBar
        onRun={handleRun}
        onSubmit={handleSubmit}
        onReset={handleReset}
        onToggleSolution={solution ? handleToggleSolution : undefined}
        onToggleHint={hint ? handleToggleHint : undefined}
        isExecuting={executingAction !== null}
        executingAction={executingAction}
        hasSolution={Boolean(solution)}
        showingSolution={showingSolution}
        hasHint={Boolean(hint)}
        showingHint={showingHint}
        showRunButton={showRunButton}
        status={status}
      />

      {showingHint && hint && <HintPanel hint={hint} />}

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
        isExecuting={executingAction !== null}
        height={outputHeight}
      />

      <ResizeHandle
        ariaLabel="Resize output console"
        onResize={(deltaY) =>
          setOutputHeight((prev) => Math.max(80, Math.min(600, prev + deltaY)))
        }
      />

      {plots.length > 0 && (
        <>
          <PlotCanvas height={plotHeight} plots={plots} />
          <ResizeHandle
            ariaLabel="Resize plot section"
            onResize={(deltaY) =>
              setPlotHeight((prev) => Math.max(150, Math.min(800, prev + deltaY)))
            }
          />
        </>
      )}

      <Footer utmSource={utmSource} utmCampaign={utmCampaign} />
    </DCLWidgetShell>
  );
};

export const DataCampExercise: React.FC<DataCampExerciseProps> = (props) => {
  const {
    language = 'python',
    hint = '',
    preExerciseCode = '',
    sct = '',
    height = 'auto',
    utmSource,
    utmCampaign,
    onSubmit,
    onFeedback,
  } = props;

  if (language === 'shell') {
    return (
      <ShellExercise
        hint={hint}
        preExerciseCode={preExerciseCode}
        sct={sct}
        height={height}
        utmSource={utmSource}
        utmCampaign={utmCampaign}
        onSubmit={onSubmit}
        onFeedback={onFeedback}
      />
    );
  }

  return <CodeExercise {...props} />;
};
