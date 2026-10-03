import type { ServicesResultFrame } from './protocol';
import type { SettingsPage } from '../app/settingsPages';

/**
 * The first-run assistant: what a fresh install still needs, in order, each step opening the page
 * that sets it. Derived from what the server already answers, never stored: a step is done when
 * the thing it asks for exists, whichever page it was set from.
 */
export interface SetupStep {
  key: 'model' | 'services' | 'profile' | 'notifications' | 'devices';
  title: string;
  hint: string;
  page: SettingsPage;
  /** undefined: nothing to check, the step is a suggestion. */
  done?: boolean;
  /** Without it the agent cannot answer: the assistant opens until it is done. */
  essential: boolean;
}

export function setupSteps(input: { defaultModel: string; services: ServicesResultFrame | null }): SetupStep[] {
  const servicesMissing = input.services?.services.filter(s => s.missing.length > 0).length;
  return [
    {
      key: 'model',
      title: 'Pick a model',
      hint: input.defaultModel ? input.defaultModel : 'add a provider and its key, then choose the default model',
      page: 'providers',
      done: input.defaultModel !== '',
      essential: true,
    },
    {
      key: 'services',
      title: 'Voice, memory, search, browser',
      hint:
        servicesMissing === undefined
          ? 'cloud by default; this server or your own URL'
          : servicesMissing === 0
            ? 'every service has what it needs'
            : servicesMissing > 1 ? `${servicesMissing} services still need a key or a URL` : 'one service still needs a key or a URL',
      page: 'services',
      ...(servicesMissing === undefined ? {} : { done: servicesMissing === 0 }),
      essential: false,
    },
    { key: 'profile', title: 'Tell the agent who you are', hint: 'USER.md: your name, time zone, language', page: 'workspaces', essential: false },
    { key: 'notifications', title: 'Notifications', hint: 'when a run ends while the app is closed', page: 'notifications', essential: false },
    { key: 'devices', title: 'Your other devices', hint: 'pair a browser or another phone from here', page: 'devices', essential: false },
  ];
}
