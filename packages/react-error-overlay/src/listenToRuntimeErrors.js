/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/* @flow */
import {
  register as registerError,
  unregister as unregisterError,
} from './effects/unhandledError';
import {
  register as registerPromise,
  unregister as unregisterPromise,
} from './effects/unhandledRejection';
import {
  register as registerStackTraceLimit,
  unregister as unregisterStackTraceLimit,
} from './effects/stackTraceLimit';
import {
  permanentRegister as permanentRegisterConsole,
  registerReactStack,
  unregisterReactStack,
} from './effects/proxyConsole';
import { massage as massageWarning } from './utils/warnings';
import getStackFrames from './utils/getStackFrames';

import type { StackFrame } from './utils/stack-frame';

const CONTEXT_SIZE: number = 3;

export type ErrorRecord = {|
  error: Error,
  unhandledRejection: boolean,
  contextSize: number,
  stackFrames: StackFrame[],
|};

export const crashWithFrames = (crash: ErrorRecord => void) => (
  error: Error,
  unhandledRejection = false
) => {
  // We want React error boundaries to run before we display the crash. That way
  // they can set `disableReactErrorOverlay` to disable the error overlay.
  //
  // React error boundaries will run soon after `crashWithFrames` is
  // called so use a macrotask to schedule this code to run _after_ the
  // remaining React code.
  setTimeout(() => {
    if (error.disableReactErrorOverlay) {
      return;
    }
    getStackFrames(error, unhandledRejection, CONTEXT_SIZE)
      .then(stackFrames => {
        if (stackFrames == null) {
          return;
        }
        crash({
          error,
          unhandledRejection,
          contextSize: CONTEXT_SIZE,
          stackFrames,
        });
      })
      .catch(e => {
        console.log('Could not get the stack frames of error:', e);
      });
  }, 0);
};

export function listenToRuntimeErrors(
  crash: ErrorRecord => void,
  filename: string = '/static/js/bundle.js'
) {
  const crashWithFramesRunTime = crashWithFrames(crash);

  registerError(window, error => crashWithFramesRunTime(error, false));
  registerPromise(window, error => crashWithFramesRunTime(error, true));
  registerStackTraceLimit();
  registerReactStack();
  permanentRegisterConsole('error', (warning, stack) => {
    const data = massageWarning(warning, stack);
    crashWithFramesRunTime(
      // $FlowFixMe
      {
        message: data.message,
        stack: data.stack,
        __unmap_source: filename,
      },
      false
    );
  });

  return function stopListening() {
    unregisterStackTraceLimit();
    unregisterPromise(window);
    unregisterError(window);
    unregisterReactStack();
  };
}
