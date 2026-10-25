import type {
  InstructionEntry,
  ServiceId,
  ServicesResultFrame,
  ServiceView,
} from './protocol';
import type { SettingsPage } from '../app/settingsPages';

/**
 * The first-run assistant: everything an install can be set up with, in order. Derived from what
 * the server already answers, never stored, except the steps the owner skipped on this device: a
 * step is done when the thing it asks for exists, whichever page set it.
 */
export type SetupState = 'done' | 'todo' | 'skipped' | 'unknown';

export interface SetupStep {
  key: string;
  title: string;
  hint: string;
  state: SetupState;
  /** A service set right on the assistant, its card unfolded under the row. */
  service?: ServiceId;
  /** Otherwise the page the row opens. */
  page?: SettingsPage;
}

export interface SetupInput {
  defaultModel: string;
  services: ServicesResultFrame | null;
  instructions: InstructionEntry[];
  /** This device, to find it among the ones registered for push. */
  deviceId: string | null;
  /** Push exists on this device at all (not in a browser). */
  pushSupported: boolean;
  skipped: string[];
  /** Configured providers; unknown (null) until the agents config answered. */
  providers: number | null;
  /** The default model is known but cannot run (its key is missing, its provider gone). */
  defaultUnavailable: boolean;
}

/**
 * Whether the agent can answer: a default model that runs. What the first-run gate waits for.
 */
export function modelReady(defaultModel: string, unavailable: Array<{ id: string }> | undefined): boolean {
  return defaultModel !== '' && !(unavailable ?? []).some(m => m.id === defaultModel);
}

/**
 * Whether a send is held back for the setup assistant. Only on the server's word: a catalogue that
 * has not answered yet carries an empty default too, and reading that as "no model" closed every
 * send for the life of a socket the resume never ran on (2026-10-06). If the server truly has no
 * model, it says so on the send itself.
 */
export function sendNeedsModel(
  answered: boolean,
  defaultModel: string,
  unavailable: Array<{ id: string }> | undefined,
): boolean {
  return answered && !modelReady(defaultModel, unavailable);
}

const SERVICE_STEPS: Array<{ id: ServiceId; title: string; hint: string }> = [
  {
    id: 'stt',
    title: 'Voice notes to text',
    hint: 'a Groq key, or Whisper on this server',
  },
  {
    id: 'tts',
    title: 'Spoken answers',
    hint: 'Edge in the cloud, no key, or Piper',
  },
  {
    id: 'location',
    title: 'Location',
    hint: 'a Geoapify key turns a shared GPS position into an address',
  },
  { id: 'search', title: 'Web search', hint: 'the URL of a SearXNG instance' },
  {
    id: 'embeddings',
    title: 'Memory by meaning',
    hint: 'a model from a provider you already use — no second key',
  },
  {
    id: 'browser',
    title: 'Browser',
    hint: 'the agent opening pages and filling forms',
  },
];

/** On, with nothing missing and nothing broken: an engine that does not answer is not set up. */
function serviceDone(view: ServiceView): boolean {
  return (
    view.source !== 'off' &&
    view.missing.length === 0 &&
    view.health !== 'down' &&
    view.local?.state !== 'failed'
  );
}

function stateOf(
  done: boolean | undefined,
  key: string,
  skipped: string[],
): SetupState {
  if (done) return 'done';
  if (skipped.includes(key)) return 'skipped';
  return done === undefined ? 'unknown' : 'todo';
}

export function setupSteps(input: SetupInput): SetupStep[] {
  const { services, skipped } = input;
  const user = input.instructions.find(
    e => e.workspace === 'default' && e.file === 'USER.md',
  );
  // The default workspace's USER.md, the one every workspace inherits: written once it is no longer
  // the shipped template. An older server sends no verdict, and none is drawn.
  const profileDone = user?.template === undefined ? undefined : !user.template;
  const pushDone =
    services?.pushDevices === undefined || !input.deviceId
      ? undefined
      : services.pushDevices.includes(input.deviceId);
  const devicesDone =
    services?.pairedDevices === undefined
      ? undefined
      : services.pairedDevices > 1;

  const steps: SetupStep[] = [
    {
      key: 'model',
      title: 'Pick a model',
      hint:
        input.defaultModel && !input.defaultUnavailable
          ? input.defaultModel
          : input.defaultModel
            ? `${input.defaultModel} cannot run (its key is missing?): pick another`
            : input.providers === 0
              ? 'sign in with a ChatGPT or Claude plan, or paste an API key'
              : 'choose the model the agent answers with',
      state: stateOf(input.defaultModel !== '' && !input.defaultUnavailable, 'model', skipped),
      // No provider yet: the provider form first. One there: straight to the default-model picker,
      // the step a newcomer could not find from the providers page.
      page: input.providers ? 'model-picker' : 'models',
    },
    ...SERVICE_STEPS.flatMap(({ id, title, hint }) => {
      const view = services?.services.find(s => s.id === id);
      // A server that does not know the service (older than location) leaves it out.
      if (services && !view) return [];
      return [
        {
          key: id,
          title,
          hint,
          state: stateOf(view ? serviceDone(view) : undefined, id, skipped),
          service: id,
        },
      ];
    }),
    {
      key: 'profile',
      title: 'Tell the agent who you are',
      hint: profileDone
        ? 'USER.md of the default workspace is written'
        : 'USER.md of the default workspace: your name, time zone, language',
      state: stateOf(profileDone, 'profile', skipped),
      page: 'instruction',
    },
    ...(input.pushSupported
      ? [
          {
            key: 'notifications',
            title: 'Notifications',
            hint: pushDone
              ? 'this phone receives them'
              : 'when a run ends while the app is closed: allow them here',
            state: stateOf(pushDone, 'notifications', skipped),
            page: 'notifications' as const,
          },
        ]
      : []),
    {
      key: 'devices',
      title: 'Your other devices',
      hint: devicesDone
        ? `${services?.pairedDevices} devices paired`
        : 'invite a phone or a computer from here',
      state: stateOf(devicesDone, 'devices', skipped),
      page: 'devices',
    },
  ];
  return steps;
}

/** Done or skipped: what the owner no longer has to look at. */
export function setupSettled(steps: SetupStep[]): number {
  return steps.filter(s => s.state === 'done' || s.state === 'skipped').length;
}
