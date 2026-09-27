import { createContext } from 'react';

/**
 * What the run footers of a thread need to offer Continue -- docs/continue.md on the server.
 *
 * Provided by the chat screen rather than passed down: the footer is drawn in five places (under a
 * bubble, a fold, on its own row), and only the screen knows which run is the thread's last and
 * whether the thread is at rest.
 */
export interface RunContinueOffer {
  /** The id of the thread's last run: only that one is offered Continue. */
  lastRunId?: string;
  /** Set only while the thread is at rest and nothing was pressed yet. */
  onContinue?: () => void;
}

export const RunContinueContext = createContext<RunContinueOffer>({});
