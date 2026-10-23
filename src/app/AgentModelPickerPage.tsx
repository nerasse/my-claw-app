import React from 'react';
import { connection } from '../core/connection';
import { useModelCatalog } from '../core/model';
import {
  encodeAgentsContextCapSet,
  encodeAgentsFallbackSet,
  encodeAgentsModelClear,
  encodeAgentsModelSet,
  type AgentsConfigResultFrame,
} from '../core/protocol';
import { ModelPickerPage, type PickerState } from '../components/ModelSheet';

/**
 * The model picker pointed at the server config instead of a session: "global" edits
 * llm.defaultModel, "fallback" edits llm.visionFallback, an agent key edits agents.<key>.llm.
 * The root option hands an agent back to its inheritance (clear), which is the "Use default"
 * of the chat picker in reverse.
 *
 * An agent pins its effort next to its model, and a window too, so the flow is model then
 * effort then window then confirm. Both steps are skipped when the staged model is a tag: the
 * tag pins the effort and the ceiling itself, so either one set here would be dead config, and
 * the confirmation names the tag's pin instead. Picking the full window removes the agent's own
 * cap, which is how it returns to the standing policy.
 *
 * The fallback target is the reverse of the default: it exists so image runs have somewhere
 * to go when the resolved model cannot take images, so plain models are offered only when they
 * are vision-capable. Tags are all offered: a tag names a route, and the resolver reads the
 * capability of the model it lands on at run time, so an image tag is a valid pin and a route
 * that later moves to a text-only model simply stops applying.
 *
 * An agent's window is chosen under the global cap, which is the ceiling it inherits when it has
 * none of its own: passing it to the flow keeps the number the owner set on the list instead of
 * hiding it behind Custom.
 *
 * Rendered as a full settings page: the picker replaces the agents list entirely, and its own
 * back entry walks the flow before leaving the page, so no config ever peeks over the list.
 */
export function AgentModelPickerPage({
  target,
  config,
  state,
  onStateChange,
  onBack,
}: {
  /** "global", "fallback" or an agent key. */
  target: string;
  config: AgentsConfigResultFrame | null;
  state: PickerState;
  onStateChange: (state: PickerState) => void;
  /** Leaves the page; the flow's own back entry walks the steps first. */
  onBack: () => void;
}): React.JSX.Element {
  const catalog = useModelCatalog();
  const isFallback = target === 'fallback';
  const agent = !isFallback && target !== 'global' ? (config?.agents.find(entry => entry.key === target) ?? null) : null;
  const activeId = agent ? agent.model : isFallback ? config?.fallback ?? '' : config?.defaultModel ?? '';
  const defaultLabel =
    catalog.models.find(model => model.id === config?.defaultModel)?.label ??
    config?.defaultModel ??
    'global default';
  const orchestratorLabel =
    config?.agents.find(entry => entry.key === 'orchestrator')?.model ?? defaultLabel;
  const globalCap = config?.contextCap ? config.contextCap.value ?? config.contextCap.default : undefined;

  return (
    <ModelPickerPage
      title={agent ? `Model for ${agent.label}` : isFallback ? 'Fallback model' : 'Default model'}
      backLabel={agent ? 'Back to the agent' : 'Back to the agents list'}
      models={isFallback ? catalog.models.filter(model => model.id.startsWith('tag:') || model.vision === true) : catalog.models}
      activeId={activeId}
      state={state}
      onStateChange={onStateChange}
      onClose={onBack}
      onCommit={choice => {
        if (isFallback) {
          connection.send(encodeAgentsFallbackSet(choice.model)).catch(() => {});
          return;
        }
        // undefined keeps the target's effort, null clears it, a level pins it.
        const effort = choice.effort === undefined ? undefined : choice.effort ?? '';
        connection.send(encodeAgentsModelSet(target, choice.model, effort)).catch(() => {});
        if (agent && choice.context !== undefined) {
          connection
            .send(encodeAgentsContextCapSet(agent.key, choice.context === 'full' ? null : choice.context))
            .catch(() => {});
        }
      }}
      rootOption={
        agent
          ? {
              label:
                agent.inheritsFrom === 'orchestrator'
                  ? `Inherit orchestrator (${orchestratorLabel})`
                  : `Follow global default (${defaultLabel})`,
              selected: !agent.pinned,
              onPress: () => {
                connection.send(encodeAgentsModelClear(agent.key)).catch(() => {});
                onBack();
              },
            }
          : isFallback
            ? {
                label: 'No fallback',
                selected: !config?.fallback,
                onPress: () => {
                  connection.send(encodeAgentsFallbackSet('')).catch(() => {});
                  onBack();
                },
              }
            : null
      }
      effort={isFallback ? null : { current: agent ? agent.effort ?? '' : config?.defaultEffort ?? '' }}
      context={
        agent
          ? {
              ...(agent.contextCap === null || agent.contextCap === undefined || agent.contextCap === 0
                ? {}
                : { current: agent.contextCap }),
              ...(globalCap === undefined || globalCap <= 0 ? {} : { cap: globalCap }),
            }
          : null
      }
    />
  );
}
