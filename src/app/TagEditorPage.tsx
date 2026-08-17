import React from 'react';
import { connection } from '../core/connection';
import { useModelCatalog } from '../core/model';
import { useTags } from '../core/tags';
import {
  encodeAgentsConfigGet,
  encodeModelList,
  encodeTagsUpsert,
} from '../core/protocol';
import { ModelPickerPage, type PickerState } from '../components/ModelSheet';

/**
 * The tag editor page: one pass over the three things a tag pins (model, effort, context
 * ceiling), applied as a single upsert on the confirmation step. Leaving the flow early
 * changes nothing, and the cap row on the tags page stays for a value the graduations do
 * not offer. Like the agent picker, it is a full page: the tags list is replaced entirely.
 */
export function TagEditorPage({
  name,
  state,
  onStateChange,
  onBack,
}: {
  name: string;
  state: PickerState;
  onStateChange: (state: PickerState) => void;
  /** Leaves the page; the flow's own back entry walks the steps first. */
  onBack: () => void;
}): React.JSX.Element {
  const catalog = useModelCatalog();
  const { tags } = useTags();
  const tag = tags?.find(entry => entry.name === name) ?? null;

  return (
    <ModelPickerPage
      title={`Tag ${name}`}
      backLabel="Back to the tags list"
      // No tag entries: a tag pinning a tag reference is how cycles are born (self-pins crash
      // the server's resolver). Real provider models only; agents may still pin tags elsewhere.
      models={catalog.models.filter(model => !model.id.startsWith('tag:'))}
      activeId={tag?.model ?? ''}
      state={state}
      onStateChange={onStateChange}
      onClose={onBack}
      onCommit={choice => {
        // undefined keeps the tag's own pin, null clears it, a level pins it. The upsert
        // replaces the whole entry, so an omitted effort key is how a tag returns to "default".
        const effort = choice.effort === undefined ? tag?.effort : (choice.effort ?? undefined);
        // "full" means the tag pins no ceiling of its own, which is an absent contextCap.
        const cap =
          choice.context === undefined
            ? tag?.contextCap
            : choice.context === 'full'
              ? undefined
              : choice.context;
        connection.send(encodeTagsUpsert(name, choice.model, effort, cap)).catch(() => {});
        // The Tags group of the picker catalog and the provider-list row follow the server state.
        connection.send(encodeModelList()).catch(() => {});
        connection.send(encodeAgentsConfigGet()).catch(() => {});
      }}
      skipPinsOnTag
      effort={{ current: tag?.effort ?? '' }}
      context={{ ...(tag?.contextCap === undefined ? {} : { current: tag.contextCap }) }}
    />
  );
}
