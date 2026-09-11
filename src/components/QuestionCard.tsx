import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { QuestionAskFrame, QuestionInfoFrame } from '../core/protocol';
import { questionStore, useQuestionDraft, type QuestionDraft } from '../core/questionStore';
import { useQuestionKeys } from '../core/questionKeys';
import {
  advancesOnPick,
  draftAnsweredCount,
  draftAnswers,
  draftEditing,
  draftGoto,
  draftHas,
  draftPage,
  draftSelect,
  draftStep,
  draftSummary,
  draftText,
  draftToggleCustom,
  draftWriteCustom,
  isPaged,
  isRecapPage,
  questionAllowsCustom,
} from '../core/questionState';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';

/** How long a picked option stays on screen before the form moves on. */
const AUTO_NEXT_MS = 250;

/** Lines of an answer shown in the recap before it is cut. */
const RECAP_LINES = 3;

/**
 * The questions of one `question` tool call, drawn inside the conversation.
 *
 * It sits on the running tool card the ask belongs to, so it is at the point of the thread where
 * the run stopped, and it is a row of the chat like any other: the owner can scroll the history,
 * open a file, walk to another conversation and come back, and the form is still here with what
 * was already picked -- the draft lives in `questionStore`, not in this component, because the
 * list unmounts rows that scroll away. That includes which page he was on.
 *
 * One question per page, then a recap that is the only place Send lives: six questions at once
 * were a wall in the middle of a conversation, and an answer sent without being seen as a whole
 * is an answer nobody checked. A lone question skips both -- it is the page, and it sends.
 */
export function QuestionCard({
  request,
  onReply,
  onRevealField,
}: {
  request: QuestionAskFrame;
  onReply: (id: string, answers: string[][]) => void;
  /**
   * Called when the free-text field takes focus, so the surface holding this card can bring it
   * above the keyboard. The card cannot do it: it does not know it is in a list, and Android
   * stopped doing it for us -- the app draws edge to edge, so `adjustResize` never resizes the
   * window and the native scroll-the-focused-view-into-view never fires.
   */
  onRevealField?: () => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const draft = useQuestionDraft(request.id);
  const total = request.questions.length;
  const paged = isPaged(request);
  const page = draftPage(draft, request);
  const recap = isRecapPage(request, page);
  const answered = draftAnsweredCount(draft, request);

  /**
   * The pending auto-advance. One at a time and cleared on unmount: two quick picks would
   * otherwise stack two hops, and a timer surviving the card would page a form the owner has
   * already scrolled away from.
   */
  const hop = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelHop = useCallback(() => {
    if (hop.current === null) return;
    clearTimeout(hop.current);
    hop.current = null;
  }, []);
  useEffect(() => cancelHop, [cancelHop]);

  const step = useCallback(
    (delta: number) => {
      cancelHop();
      questionStore.patch(request.id, current => draftStep(current, request, delta));
    },
    [cancelHop, request],
  );

  const goto = useCallback(
    (target: number) => {
      cancelHop();
      questionStore.patch(request.id, current => draftGoto(current, request, target));
    },
    [cancelHop, request],
  );

  /** A pick on a single-choice question carries the owner forward on its own. */
  const onPicked = useCallback(
    (question: QuestionInfoFrame) => {
      if (!paged || !advancesOnPick(question)) return;
      cancelHop();
      hop.current = setTimeout(() => {
        hop.current = null;
        questionStore.patch(request.id, current => draftStep(current, request, 1));
      }, AUTO_NEXT_MS);
    },
    [cancelHop, paged, request],
  );

  const send = useCallback(() => {
    if (draft.submitting) return;
    cancelHop();
    const answers = draftAnswers(draft, request);
    // The card goes read-only here and a watchdog is armed in the store: the frame can be accepted
    // by a socket that is already dead and never arrive, and nothing else would ever say so.
    questionStore.beginReply(request.id);
    onReply(request.id, answers);
  }, [cancelHop, draft, onReply, request]);

  // Web only, and only while the form actually pages: bare Left/Right walk it, unless the caret
  // is in a field. A phone binds nothing.
  useQuestionKeys(paged && !draft.submitting, {
    onPrev: () => step(-1),
    onNext: () => step(1),
  });

  const title = !paged ? 'Question' : recap ? 'Review' : `Question ${page + 1} of ${total}`;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.waiting}>waiting for you</Text>
      </View>

      {recap ? (
        <Recap request={request} draft={draft} onEdit={goto} styles={styles} />
      ) : (
        <QuestionBlock
          // Keyed by page: the free-text field of question 2 must not be re-seeded with the text
          // of question 1 (`defaultValue` is read once, at mount).
          key={page}
          id={request.id}
          question={request.questions[page] as QuestionInfoFrame}
          index={page}
          draft={draft}
          onPicked={onPicked}
          onRevealField={onRevealField}
          styles={styles}
        />
      )}

      <View style={styles.foot}>
        {paged && page > 0 ? (
          <Pressable
            onPress={() => step(-1)}
            disabled={draft.submitting}
            style={styles.walk}
            accessibilityRole="button"
            accessibilityLabel="Previous question">
            <Text style={styles.walkLabel}>‹ Back</Text>
          </Pressable>
        ) : (
          <View style={styles.walkSpacer} />
        )}

        <Text style={[styles.progress, draft.failed ? styles.failed : null]}>
          {draft.failed
            ? 'Not sent · tap Send to try again'
            : recap || !paged ? `${answered}/${total} answered` : ''}
        </Text>

        {recap || !paged ? (
          <Pressable
            onPress={send}
            disabled={draft.submitting}
            style={[styles.send, draft.submitting ? styles.sendBusy : null]}
            accessibilityRole="button"
            accessibilityLabel="Send the answers">
            <Text style={styles.sendLabel}>{draft.submitting ? 'Sending…' : 'Send'}</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => step(1)}
            disabled={draft.submitting}
            style={styles.send}
            accessibilityRole="button"
            accessibilityLabel={page === total - 1 ? 'Review the answers' : 'Next question'}>
            <Text style={styles.sendLabel}>{page === total - 1 ? 'Review ›' : 'Next ›'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/**
 * Everything about to be sent, on one page, before it is.
 *
 * An answer is cut to three lines: a pasted paragraph is a legitimate answer and it would
 * otherwise bury the five questions around it. Tapping a line opens it in place; the pencil goes
 * back to the question itself. Which lines are open is deliberately not in the draft -- it is a
 * reading state, worth nothing once the card is gone, and the store is for what gets sent.
 */
function Recap({
  request,
  draft,
  onEdit,
  styles,
}: {
  request: QuestionAskFrame;
  draft: QuestionDraft;
  onEdit: (index: number) => void;
  styles: ReturnType<typeof createStyles>;
}): React.JSX.Element {
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set());
  const rows = draftSummary(draft, request);

  const toggle = (index: number): void =>
    setOpen(current => {
      const next = new Set(current);
      if (!next.delete(index)) next.add(index);
      return next;
    });

  return (
    <View style={styles.recap}>
      {rows.map((row, index) => (
        <View key={index} style={styles.recapRow}>
          <View style={styles.recapHead}>
            <Text style={styles.header}>{row.header}</Text>
            <Pressable
              onPress={() => onEdit(index)}
              disabled={draft.submitting}
              accessibilityRole="button"
              accessibilityLabel={`Edit the answer to ${row.header}`}>
              <Text style={styles.edit}>edit</Text>
            </Pressable>
          </View>
          {row.answered ? (
            <Pressable
              onPress={() => toggle(index)}
              accessibilityRole="button"
              accessibilityState={{ expanded: open.has(index) }}
              accessibilityLabel={`The answer to ${row.header}`}>
              <Text
                style={styles.recapAnswer}
                numberOfLines={open.has(index) ? undefined : RECAP_LINES}>
                {row.text}
              </Text>
            </Pressable>
          ) : (
            <Text style={styles.recapBlank}>unanswered</Text>
          )}
        </View>
      ))}
    </View>
  );
}

function QuestionBlock({
  id,
  question,
  index,
  draft,
  onPicked,
  onRevealField,
  styles,
}: {
  id: string;
  question: QuestionInfoFrame;
  index: number;
  draft: QuestionDraft;
  onPicked: (question: QuestionInfoFrame) => void;
  onRevealField?: () => void;
  styles: ReturnType<typeof createStyles>;
}): React.JSX.Element {
  const custom = questionAllowsCustom(question);
  const editing = draftEditing(draft, index);
  const multiple = question.multiple === true;

  return (
    <View style={styles.block}>
      <Text style={styles.header}>{question.header}</Text>
      <Text style={styles.question}>
        {question.question}
        {multiple ? ' (select all that apply)' : ''}
      </Text>

      {question.options.map((option, optionIndex) => {
        const hit = draftHas(draft, index, option.label);
        return (
          <Pressable
            key={optionIndex}
            onPress={() => {
              if (draft.submitting) return;
              questionStore.patch(id, current => draftSelect(current, question, index, option.label));
              onPicked(question);
            }}
            style={[styles.option, hit ? styles.optionHit : null]}
            accessibilityRole={multiple ? 'checkbox' : 'radio'}
            accessibilityState={{ checked: hit }}
            accessibilityLabel={option.label}>
            <View style={styles.optionRow}>
              {/* A drawn box, never a glyph: U+2610/2611 are absent from many device fonts and
                  render as tofu, which is what the first version shipped. */}
              {multiple ? (
                <View style={[styles.checkBox, hit ? styles.checkBoxHit : null]}>
                  {hit ? <Text style={styles.checkMark}>✓</Text> : null}
                </View>
              ) : (
                <View style={[styles.radioRing, hit ? styles.radioRingHit : null]}>
                  {hit ? <View style={styles.radioDot} /> : null}
                </View>
              )}
              <Text style={[styles.optionLabel, hit ? styles.optionLabelHit : null]}>{option.label}</Text>
            </View>
            {option.description ? <Text style={styles.optionDescription}>{option.description}</Text> : null}
          </Pressable>
        );
      })}

      {custom ? (
        <Pressable
          onPress={() => {
            if (draft.submitting) return;
            questionStore.patch(id, current => draftToggleCustom(current, index, !editing));
          }}
          style={[styles.option, editing ? styles.optionHit : null]}
          accessibilityRole="button"
          accessibilityState={{ expanded: editing }}
          accessibilityLabel="Type your own answer">
          <View style={styles.optionRow}>
            <View style={[styles.checkBox, editing ? styles.checkBoxHit : null]}>
              {editing ? <Text style={styles.checkMark}>✓</Text> : null}
            </View>
            <Text style={[styles.customLabel, editing ? styles.optionLabelHit : null]}>
              {draftText(draft, index) && !editing
                ? draftText(draft, index)
                : 'Type your own answer'}
            </Text>
          </View>
        </Pressable>
      ) : null}

      {custom && editing ? (
        <CustomField
          id={id}
          question={question}
          index={index}
          draft={draft}
          onRevealField={onRevealField}
          styles={styles}
        />
      ) : null}
    </View>
  );
}

/**
 * The free-text field, uncontrolled on purpose: the text is recorded in the store on every
 * keystroke, but the native input keeps its own value. A field driven by the store round-trips
 * every character through a chat-wide notification, which is how a cursor ends up jumping to the
 * end of the line on Android. `defaultValue` re-seeds it when the row is remounted after a scroll.
 */
function CustomField({
  id,
  question,
  index,
  draft,
  onRevealField,
  styles,
}: {
  id: string;
  question: QuestionInfoFrame;
  index: number;
  draft: QuestionDraft;
  onRevealField?: () => void;
  styles: ReturnType<typeof createStyles>;
}): React.JSX.Element {
  return (
    <TextInput
      style={styles.customInput}
      defaultValue={draftText(draft, index)}
      onChangeText={text => questionStore.patch(id, current => draftWriteCustom(current, question, index, text))}
      placeholder="Your answer"
      placeholderTextColor="#888"
      autoFocus
      multiline
      onFocus={onRevealField}
      accessibilityLabel={`Free-form answer to ${question.header}`}
    />
  );
}

const createStyles = (palette: Palette) =>
  StyleSheet.create({
    card: {
      borderWidth: 1,
      borderColor: palette.accent,
      borderRadius: radius.md,
      backgroundColor: palette.surface,
      padding: space.sm,
      gap: space.sm,
    },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { fontSize: font.body, fontWeight: '600', color: palette.accent },
    waiting: { fontSize: font.small, color: palette.textMuted },
    block: { gap: space.xs },
    header: { fontSize: font.small, color: palette.textMuted, textTransform: 'uppercase' },
    question: { fontSize: font.body, color: palette.text, marginBottom: space.xs },
    option: {
      paddingVertical: space.sm,
      paddingHorizontal: space.sm,
      borderRadius: radius.sm,
      backgroundColor: palette.surfaceAlt,
      marginBottom: space.xs,
    },
    optionHit: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.accent },
    optionRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    optionLabel: { fontSize: font.body, color: palette.text, flexShrink: 1 },
    optionLabelHit: { color: palette.accent },
    optionDescription: { fontSize: font.small, color: palette.textMuted, marginTop: 2 },
    checkBox: {
      width: 20,
      height: 20,
      borderRadius: 4,
      borderWidth: 1.5,
      borderColor: palette.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.surface,
    },
    checkBoxHit: { borderColor: palette.accent, backgroundColor: palette.accent },
    checkMark: { fontSize: 13, color: palette.surface, fontWeight: '700' as const, lineHeight: 15 },
    radioRing: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: palette.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.surface,
    },
    radioRingHit: { borderColor: palette.accent },
    radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.accent },
    customLabel: { fontSize: font.body, color: palette.textMuted, flexShrink: 1 },
    customInput: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: radius.sm,
      padding: space.sm,
      color: palette.text,
      fontSize: font.body,
      minHeight: 40,
      marginBottom: space.xs,
    },
    recap: { gap: space.sm },
    recapRow: { gap: 2 },
    recapHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    recapAnswer: { fontSize: font.body, color: palette.text },
    recapBlank: { fontSize: font.body, color: palette.textMuted, fontStyle: 'italic' },
    edit: { fontSize: font.small, color: palette.accent },
    foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    walk: { paddingVertical: space.sm, paddingHorizontal: space.sm },
    walkLabel: { fontSize: font.body, color: palette.accent },
    walkSpacer: { width: space.sm },
    progress: { fontSize: font.small, color: palette.textMuted },
    /** The send did not land: same place as the progress line, in the palette's warning tone. */
    failed: { color: palette.warn },
    send: {
      paddingVertical: space.sm,
      paddingHorizontal: space.md,
      borderRadius: radius.sm,
      backgroundColor: palette.accent,
    },
    sendBusy: { opacity: 0.6 },
    sendLabel: { fontSize: font.body, color: palette.surface, fontWeight: '600' },
  });