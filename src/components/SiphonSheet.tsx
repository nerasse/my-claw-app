import React from 'react';
import { connection } from '../core/connection';
import { useModelCatalog, useThreadModel } from '../core/model';
import { encodeModelSiphonSet, type ModelOption } from '../core/protocol';
import { ModelPickerSheet, type PickerState } from './ModelSheet';

/**
 * Siphon: one model for a whole tree -- docs/siphon.md server side.
 *
 * The same model picker as everywhere else, cut to the one decision this mode makes: which model.
 * The effort and window steps are not offered, because the pin is a model and not a combo -- an
 * answer that also pinned an effort would change what the sub-agents under it inherit, which is a
 * different promise from "run this model".
 *
 * There is no Apply screen: the last decision applies, exactly like every other picker (rule of
 * 23/10). The row above the list is how the mode is turned off, since a pin has no "default" to
 * fall back to -- off is the default.
 */
export function SiphonSheet({
  threadId,
  state,
  onStateChange,
  onClose,
}: {
  threadId: string;
  state: PickerState;
  onStateChange: (state: PickerState) => void;
  onClose: () => void;
}): React.JSX.Element {
  const catalog = useModelCatalog();
  const thread = useThreadModel(threadId);
  const pin = thread?.siphon;
  // The pinned model is what the list marks; with no pin, the model the conversation runs now is
  // the one the owner is most likely to want everywhere.
  const active = pin ?? thread?.model ?? catalog.defaultModel;
  // A tag is phase 2: it names a route, and walking that route by quota is a different mode. The
  // catalogue lists tags as models, so they are the one thing this sheet filters out.
  const models: ModelOption[] = catalog.models.filter(model => !model.id.startsWith('tag:'));

  return (
    <ModelPickerSheet
      title="Siphon"
      models={models}
      activeId={active}
      state={state}
      onStateChange={onStateChange}
      onClose={onClose}
      onCommit={choice => {
        connection.send(encodeModelSiphonSet(threadId, choice.model)).catch(() => {});
      }}
      effort={null}
      context={null}
      rootOption={
        state.stage === 'model' && state.path.length === 0 && pin !== undefined
          ? {
              label: 'Turn Siphon off',
              selected: false,
              onPress: () => {
                connection.send(encodeModelSiphonSet(threadId)).catch(() => {});
                onClose();
              },
            }
          : null
      }
    />
  );
}
