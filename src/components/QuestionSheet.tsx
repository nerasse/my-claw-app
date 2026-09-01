import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ActionSheet } from './ActionSheet';
import type { QuestionAskFrame } from '../core/protocol';
import {
  createQuestionBodyState,
  questionAnswered,
  questionBack,
  questionCanProceed,
  questionConfirm,
  questionCustom,
  questionInfo,
  questionNext,
  questionSaveCustom,
  questionSelectOption,
  questionSteps,
  questionStoreCustom,
  questionSubmit,
  questionSync,
  questionToggle,
  type QuestionBodyState,
} from '../core/questionState';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';

function safeAnswers(answers: string[][]): string[][] {
  return answers.map((item) => (Array.isArray(item) ? item.filter((s): s is string => typeof s === 'string') : []));
}

/**
 * The question sheet: one ask, N questions, tap through, recap, send.
 *
 * Each question is one step, options are tappable rows (multiple toggles, single advances),
 * "Type your own answer" opens an inline field, and the last step is the recap where everything
 * is reviewed and submitted as one `question.reply`. Dismissing is not an answer: the question
 * stays pending server-side until the owner answers, stops (cancel), or types a message (also
 * cancel) -- the `question.resolved` frame closes this sheet everywhere.
 */
export function QuestionSheet({
  request,
  pending,
  onReply,
  onDismiss,
}: {
  request: QuestionAskFrame;
  /** Asks waiting behind this one, so a batch does not look like a single question. */
  pending: number;
  onReply: (answers: string[][]) => void;
  onDismiss: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const [state, setState] = useState<QuestionBodyState>(() => createQuestionBodyState(request.id));

  useEffect(() => {
    setState(prev => questionSync(prev, request.id));
  }, [request.id]);

  const info = questionInfo(request, state);
  const confirm = questionConfirm(request, state);
  const steps = questionSteps(request);
  const custom = info ? questionCustom(request, state) : false;
  const canProceed = questionCanProceed(request, state);
  const answersSoFar = useMemo(() => safeAnswers(state.answers), [state.answers]);

  const send = (answers: string[][]) => {
    setState(prev => ({ ...prev, submitting: true }));
    onReply(answers);
  };

  const tapOption = (label: string) => {
    if (state.submitting) return;
    if (info?.multiple === true) {
      setState(prev => questionToggle(prev, label));
      return;
    }
    const step = questionSelectOption(state, request, { label });
    setState(step.state);
    if (step.answers) send(step.answers);
  };

  const next = () => {
    if (!canProceed || state.submitting) return;
    const step = questionNext(state, request);
    setState(step.state);
    if (step.answers) send(step.answers);
  };

  const back = () => {
    if (state.submitting) return;
    setState(prev => questionBack(prev));
  };

  const saveCustom = () => {
    if (state.submitting) return;
    const text = state.custom[state.tab] ?? '';
    const step = questionSaveCustom(state, request, text);
    setState(step.state);
    if (step.answers) send(step.answers);
  };

  return (
    <ActionSheet preview={`Questions · ${steps - 1}·${state.tab + 1}`} options={[]} onClose={onDismiss}>
      <View style={styles.body}>
        <View style={styles.metaRow}>
          <Text style={styles.waiting}>the run is waiting for your answers</Text>
          {pending > 0 ? <Text style={styles.queued}>{pending} more waiting</Text> : null}
        </View>

        <View style={styles.dots}>
          {request.questions.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                index === state.tab ? styles.dotActive : null,
                questionAnswered(request, state, index) && index !== state.tab ? styles.dotDone : null,
              ]}
            />
          ))}
        </View>

        {confirm ? (
          <ScrollView style={styles.confirmBox} nestedScrollEnabled>
            <Text style={styles.heading}>Review</Text>
            {request.questions.map((q, index) => {
              const value = answersSoFar[index]?.join(', ') ?? '';
              return (
                <View key={index} style={styles.confirmRow}>
                  <Text style={styles.confirmQuestion}>{q.header}</Text>
                  <Text style={value ? styles.confirmAnswer : styles.confirmMissing}>
                    {value || '(not answered)'}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        ) : (
          <>
            <Text style={styles.questionText}>
              {info?.question}
              {info?.multiple ? ' (select all that apply)' : ''}
            </Text>
            <ScrollView style={styles.optionsBox} nestedScrollEnabled>
              {info?.options.map((option, index) => {
                const hit = state.answers[state.tab]?.includes(option.label) ?? false;
                return (
                  <Pressable
                    key={index}
                    onPress={() => tapOption(option.label)}
                    style={[styles.option, hit ? styles.optionHit : null]}>
                    <Text style={[styles.optionLabel, hit ? styles.optionLabelHit : null]}>
                      {info.multiple ? (hit ? '☑ ' : '☐ ') : hit ? '✓ ' : '· '}
                      {option.label}
                    </Text>
                    {option.description ? (
                      <Text style={styles.optionDescription}>{option.description}</Text>
                    ) : null}
                  </Pressable>
                );
              })}

              {custom ? (
                <Pressable
                  onPress={() => {
                    if (state.submitting) return;
                    setState(prev => ({ ...prev, editing: true }));
                  }}
                  style={[styles.option, state.editing ? styles.optionHit : null]}>
                  <Text style={[styles.customLabel, state.editing ? styles.optionLabelHit : null]}>
                    Type your own answer
                  </Text>
                </Pressable>
              ) : null}

              {state.editing && custom ? (
                <TextInput
                  style={styles.customInput}
                  value={state.custom[state.tab] ?? ''}
                  onChangeText={text => setState(prev => questionStoreCustom(prev, prev.tab, text))}
                  onSubmitEditing={saveCustom}
                  placeholder="Type your own answer"
                  placeholderTextColor="#888"
                  autoFocus
                  returnKeyType="done"
                  blurOnSubmit
                />
              ) : null}
            </ScrollView>

            <View style={styles.navRow}>
              {state.tab > 0 ? (
                <Pressable onPress={back} style={styles.navButton} accessibilityRole="button">
                  <Text style={styles.navLabel}>Back</Text>
                </Pressable>
              ) : (
                <View />
              )}
              <Pressable
                onPress={next}
                disabled={state.submitting || !canProceed}
                style={[styles.navButton, styles.navPrimary, !canProceed ? styles.navDisabled : null]}
                accessibilityRole="button">
                <Text style={styles.navPrimaryLabel}>{state.submitting ? 'Sending…' : 'Next'}</Text>
              </Pressable>
            </View>
          </>
        )}

        {confirm ? (
          <View style={styles.navRow}>
            <Pressable onPress={back} style={styles.navButton} accessibilityRole="button">
              <Text style={styles.navLabel}>Back</Text>
            </Pressable>
            <Pressable
              onPress={() => send(questionSubmit(request, state))}
              disabled={state.submitting}
              style={[styles.navButton, styles.navPrimary]}
              accessibilityRole="button">
              <Text style={styles.navPrimaryLabel}>
                {state.submitting ? 'Sending…' : 'Send answers'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </ActionSheet>
  );
}

const createStyles = (palette: Palette) =>
  StyleSheet.create({
    body: { gap: space.sm },
    metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    waiting: { fontSize: font.small, color: palette.textMuted },
    queued: { fontSize: font.small, color: palette.textMuted },
    dots: { flexDirection: 'row', gap: 6 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.surfaceAlt },
    dotActive: { backgroundColor: palette.accent },
    dotDone: { backgroundColor: palette.textFaint },
    questionText: { fontSize: font.body, color: palette.text },
    optionsBox: { maxHeight: 260 },
    option: {
      paddingVertical: space.sm,
      paddingHorizontal: space.sm,
      borderRadius: radius.sm,
      backgroundColor: palette.surfaceAlt,
      marginBottom: space.xs,
    },
    optionHit: { backgroundColor: palette.surface },
    optionLabel: { fontSize: font.body, color: palette.text },
    optionLabelHit: { color: palette.accent },
    optionDescription: { fontSize: font.small, color: palette.textMuted, marginTop: 2 },
    customLabel: { fontSize: font.body, color: palette.textMuted },
    customInput: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: radius.sm,
      padding: space.sm,
      color: palette.text,
      fontSize: font.body,
    },
    navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    navButton: {
      paddingVertical: space.sm,
      paddingHorizontal: space.md,
      borderRadius: radius.sm,
      backgroundColor: palette.surfaceAlt,
    },
    navPrimary: { backgroundColor: palette.accent },
    navDisabled: { opacity: 0.5 },
    navLabel: { fontSize: font.body, color: palette.text },
    navPrimaryLabel: { fontSize: font.body, color: palette.surface },
    confirmBox: { maxHeight: 260 },
    heading: { fontSize: font.body, fontWeight: '600', color: palette.text, marginBottom: space.sm },
    confirmRow: { marginBottom: space.sm },
    confirmQuestion: { fontSize: font.small, color: palette.textMuted },
    confirmAnswer: { fontSize: font.body, color: palette.text },
    confirmMissing: { fontSize: font.body, color: palette.danger },
  });
