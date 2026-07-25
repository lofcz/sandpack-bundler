import { Bundler } from '../bundler/bundler';
import { showErrorOverlay } from '../errors/overlay';
import * as logger from '../utils/logger';
import { getStackFrames } from './get-stack-frames';
import { permanentRegisterConsole, registerReactStack } from './proxy-console';
import StackFrame from './stack-frame';
import { registerStackTraceLimit } from './stack-trace-limit';
import { registerUnhandledError } from './unhandled-error';
import { registerUnhandledRejection } from './unhandled-rejection';
import { warningMessage } from './warnings';

const CONTEXT_SIZE: number = 3;

export interface ErrorRecord {
  error: Error;
  unhandledRejection: boolean;
  contextSize: number;
  stackFrames: StackFrame[];
}

export const crashWithFrames = (bundler: Bundler, crash: (record: ErrorRecord) => void) => {
  return (error: Error, unhandledRejection = false) => {
    getStackFrames(bundler, error, CONTEXT_SIZE)
      .then((stackFrames) => {
        const record: ErrorRecord = {
          error,
          unhandledRejection,
          contextSize: CONTEXT_SIZE,
          stackFrames: stackFrames ?? [],
        };
        // Draw the in-sandbox overlay FIRST (independent of the parent bus), so
        // the failure is visible in the preview even if messaging is torn down.
        const first = record.stackFrames[0];
        showErrorOverlay({
          title: unhandledRejection ? 'Unhandled Rejection' : 'Runtime Exception',
          message: error.message || String(error),
          path: (error as { path?: string }).path ?? first?._originalFileName ?? first?.fileName ?? undefined,
          line: first?._originalLineNumber ?? first?.lineNumber ?? undefined,
          column: first?._originalColumnNumber ?? first?.columnNumber ?? undefined,
          stack: error.stack,
          frames: record.stackFrames as unknown as never,
        });
        crash(record);
      })
      .catch((e) => {
        logger.error('Could not get the stack frames of error:', e);
      });
  };
};

/**
 * React Fast Refresh failures (a broken edit applied via performReactRefresh)
 * arrive on a debounce timer with no module context, so window.onerror can't
 * map them. The refresh helper dispatches `sandpack:refresh-error` with the
 * real error object instead — route it through the same crash pipeline.
 */
function registerRefreshError(target: EventTarget, handler: (error: Error) => void) {
  const listener = (evt: Event) => {
    const err = (evt as CustomEvent<{ error?: unknown }>).detail?.error;
    handler(err instanceof Error ? err : new Error(String(err ?? 'React refresh failed')));
  };
  target.addEventListener('sandpack:refresh-error', listener as EventListener);
  return () => {
    target.removeEventListener('sandpack:refresh-error', listener as EventListener);
  };
}

export function listenToRuntimeErrors(
  bundler: Bundler,
  crash: (record: ErrorRecord) => void,
  filename: string = '/bundle.js'
) {
  const crashWithFramesRunTime = crashWithFrames(bundler, crash);

  const unregisterError = registerUnhandledError(window, (error) => crashWithFramesRunTime(error, false));
  const unregisterUnhandledRejection = registerUnhandledRejection(window, (error) =>
    crashWithFramesRunTime(error, true)
  );
  const unregisterRefreshError = registerRefreshError(window, (error) =>
    crashWithFramesRunTime(error, false)
  );
  registerStackTraceLimit();
  const unregisterReactStack = registerReactStack();
  permanentRegisterConsole('error', (warning, stack) => {
    const data = warningMessage(warning, stack);
    crashWithFramesRunTime(
      {
        message: data.message,
        stack: data.stack,
        // @ts-ignore
        __unmap_source: filename,
      },
      false
    );
  });

  return () => {
    unregisterUnhandledRejection();
    unregisterError();
    unregisterRefreshError();
    unregisterReactStack();
  };
}
