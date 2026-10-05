import React from 'react';
import type { AccountKind } from '../core/protocol';
import { PROVIDER_SERVICES, type ProviderService } from '../core/providerServices';
import { LinkRow, Section, SettingsPageFrame } from './settingsParts';

/**
 * What the + of the providers opens: how the agent will reach a model, in three groups. A plan
 * signs in, a service takes a name and a key, and Custom is the whole form for anything else
 * (owner, 2026-10-05). A page rather than a sheet: thirteen rows do not fit a phone's sheet.
 */
export function ProviderAddScreen({
  onBack,
  onPlan,
  onService,
  onCustom,
}: {
  onBack: () => void;
  onPlan: (kind: AccountKind) => void;
  onService: (service: ProviderService) => void;
  onCustom: () => void;
}): React.JSX.Element {
  return (
    <SettingsPageFrame title="Add a provider" backLabel="Back to models" onBack={onBack}>
      <Section title="sign in, no key">
        <LinkRow title="ChatGPT plan" hint="your ChatGPT subscription" label="ChatGPT plan" onPress={() => onPlan('codex')} />
        <LinkRow title="Claude plan" hint="your Claude subscription" label="Claude plan" onPress={() => onPlan('claude')} />
      </Section>
      <Section title="paste an API key">
        {PROVIDER_SERVICES.map(service => (
          <LinkRow key={service.id} title={service.label} hint={service.hint} label={service.label} onPress={() => onService(service)} />
        ))}
      </Section>
      <Section title="other">
        <LinkRow title="Custom" hint="any OpenAI-compatible API: its address and its key" label="Custom" onPress={onCustom} />
      </Section>
    </SettingsPageFrame>
  );
}
