import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { QuestionAskFrame, QuestionInfoFrame } from '../core/protocol';
import { questionStore, useQuestionDraft, type QuestionDraft } from '../core/questionStore';
import {
  draftAnsweredCount,
  draftAnswers,
  draftEditing,
  draftHas,
  draftSelect,
  draftSubmitting,
  draftText,
  draftToggleCustom,
  draftWriteCustom,
  questionAllowsCustom,
} from '../core/questionState';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';

/**
 * The questions of one `question` tool call, drawn inside the conversation.
 *
 * It sits on the running tool card the ask belongs to, so it is at the point of the thread where
 * the run stopped, and it is a row of the chat like any other: the owner can scroll the history,
 * open a file, walk to another conversation and come back, and the form is still here with what
 * was already picked -- the draft lives in `questionStore`, not in this component, because the
 * list unmounts rows that scroll away.
 *
 * All the questions at once rather than a stepper: there is no reason to hide question 3 while
 * answering question 2 when the whole thread is readable underneath. Send is always allowed --
 * a question left blank is sent as unanswered, which is a legitimate answer to give a model.
 */
export function QuestionCard({
  request,
  onReply,
}: {
  request: QuestionAskFrame;
  onReply: (id: string, answers: string[][]) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const draft = useQuestionDraft(request.id);
  const answered = draftAnsweredCount(draft, request);
  const total = request.questions.length;

  const send = useCallback(() => {
    if (draft.submitting) return;
    const answers = draftAnswers(draft, request);
    questionStore.patch(request.id, draftSubmitting);
    onReply(request.id, answers);
  }, [draft, onReply, request]);

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{total > 1 ? `${total} questions` : 'Question'}</Text>
        <Text style={styles.waiting}>waiting for you</Text>
      </View>

      {request.questions.map((question, index) => (
        <QuestionBlock
          key={index}
          id={request.id}
          question={question}
          index={index}
          draft={draft}
          styles={styles}
        />
      ))}

      <View style={styles.foot}>
        <Text style={styles.progress}>
          {answered}/{total} answered
        </Text>
        <Pressable
          onPress={send}
          disabled={draft.submitting}
          style={[styles.send, draft.submitting ? styles.sendBusy : null]}
          accessibilityRole="button"
          accessibilityLabel="Send the answers">
          <Text style={styles.sendLabel}>{draft.submitting ? 'Sending…' : 'Send'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function QuestionBlock({
  id,
  question,
  index,
  draft,
  styles,
}: {
  id: string;
  question: QuestionInfoFrame;
  index: number;
  draft: QuestionDraft;
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

      {custom && editing ? <CustomField id={id} question={question} index={index} draft={draft} styles={styles} /> : null}
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
  styles,
}: {
  id: string;
  question: QuestionInfoFrame;
  index: number;
  draft: QuestionDraft;
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
    foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    progress: { fontSize: font.small, color: palette.textMuted },
    send: {
      paddingVertical: space.sm,
      paddingHorizontal: space.md,
      borderRadius: radius.sm,
      backgroundColor: palette.accent,
    },
    sendBusy: { opacity: 0.6 },
    sendLabel: { fontSize: font.body, color: palette.surface, fontWeight: '600' },
  });
