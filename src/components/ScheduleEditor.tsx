import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';
import {
  CRON_FIELDS,
  CRON_PRESETS,
  DAILY_TOKENS,
  cronFromTokens,
  cronTokens,
  dateFromIso,
  describeCron,
  formatDateShort,
  formatTimeShort,
  localIsoString,
  scheduleInvalid,
  tokenSummary,
  type CronField,
} from '../core/cron';

type Mode = 'once' | 'repeat' | 'custom';

function modeOf(value: string): Mode {
  const trimmed = value.trim();
  if (trimmed.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(trimmed)) return 'once';
  if (cronTokens(trimmed)) return 'repeat';
  return 'custom';
}

/** The date a new one-shot job would run: tomorrow at the same time. */
function defaultOnceDate(): Date {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date;
}

/**
 * The job schedule editor: a once/repeat/custom switch, exactly what the server's grammar
 * covers (ISO timestamp, cron expression, "every Xm/h/d"). Once and repeat build the string
 * from structured fields; custom is the raw text field for everything the menus cannot say.
 */
export function ScheduleEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (schedule: string) => void;
}): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const [mode, setMode] = useState<Mode>(() => modeOf(value));
  const [onceDate, setOnceDate] = useState<Date>(() => dateFromIso(value) ?? defaultOnceDate());
  const [tokens, setTokens] = useState<string[]>(() => cronTokens(value) ?? [...DAILY_TOKENS]);
  const [customText, setCustomText] = useState(value);
  /** Which native picker is up (Android renders it as a dialog on mount). */
  const [picking, setPicking] = useState<'date' | 'time' | null>(null);
  /** The field row whose value chips are expanded, if any. */
  const [openField, setOpenField] = useState<CronField['key'] | null>(null);

  const commitOnce = (date: Date): void => {
    setOnceDate(date);
    onChange(localIsoString(date));
  };

  const commitTokens = (next: string[]): void => {
    setTokens(next);
    onChange(cronFromTokens(next));
  };

  const setToken = (field: CronField, token: string): void => {
    const next = [...tokens];
    next[CRON_FIELDS.indexOf(field)] = token;
    commitTokens(next);
  };

  const switchMode = (next: Mode): void => {
    if (next === mode) return;
    // The live value moves with the user: a cron typed in custom survives the switch to the
    // menu, a one-shot date opens the once view, and a cron the menus cannot express yet can
    // always fall back to custom with the raw string.
    const live = mode === 'once' ? localIsoString(onceDate) : mode === 'repeat' ? cronFromTokens(tokens) : customText;
    if (next === 'once') {
      const parsed = dateFromIso(live);
      if (parsed) setOnceDate(parsed);
    } else if (next === 'repeat') {
      const parsed = cronTokens(live);
      if (parsed) setTokens(parsed);
    }
    setCustomText(live);
    setMode(next);
    setPicking(null);
    setOpenField(null);
  };

  const invalid = mode === 'custom' && scheduleInvalid(customText);
  const expr = cronFromTokens(tokens);

  const chip = (active: boolean): object => [styles.chip, active ? styles.chipActive : styles.chipIdle];

  return (
    <View style={styles.container}>
      <View style={styles.chips}>
        {(
          [
            ['once', 'Once'],
            ['repeat', 'Repeat'],
            ['custom', 'Custom'],
          ] as const
        ).map(([modeKey, label]) => (
          <Pressable
            key={modeKey}
            onPress={() => switchMode(modeKey)}
            style={chip(mode === modeKey)}
            accessibilityRole="button"
            accessibilityLabel={`Schedule mode ${label}`}
            accessibilityState={{ selected: mode === modeKey }}>
            <Text style={mode === modeKey ? styles.chipTextActive : styles.chipTextIdle}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {mode === 'once' ? (
        <View style={styles.card}>
          <Pressable
            style={[styles.row, styles.link]}
            onPress={() => setPicking('date')}
            accessibilityRole="button"
            accessibilityLabel="Pick a date">
            <Text style={styles.rowLabel}>Date</Text>
            <Text style={styles.rowValue}>{formatDateShort(onceDate)}</Text>
          </Pressable>
          <Pressable
            style={[styles.row, styles.link]}
            onPress={() => setPicking('time')}
            accessibilityRole="button"
            accessibilityLabel="Pick a time">
            <Text style={styles.rowLabel}>Time</Text>
            <Text style={styles.rowValue}>{formatTimeShort(onceDate)}</Text>
          </Pressable>
          <Text style={styles.note}>runs once, at this date and time</Text>
          {picking ? (
            <DateTimePicker
              value={onceDate}
              mode={picking}
              // Android pops the dialog itself; iOS keeps the spinner inline under the rows.
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(event, selected) => {
                if (event.type === 'set' && selected) commitOnce(selected);
                setPicking(null);
              }}
            />
          ) : null}
        </View>
      ) : null}

      {mode === 'repeat' ? (
        <View>
          <View style={styles.chips}>
            {CRON_PRESETS.map(preset => (
              <Pressable
                key={preset.expr}
                onPress={() => setTokens(cronTokens(preset.expr) ?? [...DAILY_TOKENS])}
                style={chip(expr === preset.expr)}
                accessibilityRole="button"
                accessibilityLabel={`Preset ${preset.label}`}
                accessibilityState={{ selected: expr === preset.expr }}>
                <Text style={expr === preset.expr ? styles.chipTextActive : styles.chipTextIdle}>
                  {preset.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.card}>
            {CRON_FIELDS.map((field, index) => (
              <Pressable
                key={field.key}
                style={[styles.row, styles.link]}
                onPress={() => setOpenField(openField === field.key ? null : field.key)}
                accessibilityRole="button"
                accessibilityLabel={`Field ${field.label}`}
                accessibilityState={{ expanded: openField === field.key }}>
                <Text style={styles.rowLabel}>{field.label}</Text>
                <Text style={styles.rowValue}>{tokenSummary(field, tokens[index])}</Text>
              </Pressable>
            ))}
          </View>
          {openField ? (
            <View style={styles.fieldPanel}>
              <View style={styles.chips}>
                <Pressable
                  onPress={() => setToken(CRON_FIELDS.find(field => field.key === openField)!, '*')}
                  style={chip(tokens[CRON_FIELDS.findIndex(field => field.key === openField)] === '*')}
                  accessibilityRole="button"
                  accessibilityLabel="Any value">
                  <Text
                    style={
                      tokens[CRON_FIELDS.findIndex(field => field.key === openField)] === '*'
                        ? styles.chipTextActive
                        : styles.chipTextIdle
                    }>
                    any
                  </Text>
                </Pressable>
                {CRON_FIELDS.find(field => field.key === openField)!.everySteps.map(step => (
                  <Pressable
                    key={step}
                    onPress={() =>
                      setToken(
                        CRON_FIELDS.find(field => field.key === openField)!,
                        `*/${step}`,
                      )
                    }
                    style={chip(tokens[CRON_FIELDS.findIndex(field => field.key === openField)] === `*/${step}`)}
                    accessibilityRole="button"
                    accessibilityLabel={`Every ${step}`}>
                    <Text
                      style={
                        tokens[CRON_FIELDS.findIndex(field => field.key === openField)] === `*/${step}`
                          ? styles.chipTextActive
                          : styles.chipTextIdle
                      }>
                      every {step}
                    </Text>
                  </Pressable>
                ))}
                {CRON_FIELDS.find(field => field.key === openField)!.values.map(option => (
                  <Pressable
                    key={option.token}
                    onPress={() =>
                      setToken(
                        CRON_FIELDS.find(field => field.key === openField)!,
                        option.token,
                      )
                    }
                    style={chip(tokens[CRON_FIELDS.findIndex(field => field.key === openField)] === option.token)}
                    accessibilityRole="button"
                    accessibilityLabel={`Value ${option.label}`}>
                    <Text
                      style={
                        tokens[CRON_FIELDS.findIndex(field => field.key === openField)] === option.token
                          ? styles.chipTextActive
                          : styles.chipTextIdle
                      }>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
          <Text style={styles.note}>{describeCron(expr)}</Text>
        </View>
      ) : null}

      {mode === 'custom' ? (
        <View>
          <TextInput
            style={[styles.input, invalid ? styles.inputInvalid : null]}
            value={customText}
            onChangeText={text => {
              setCustomText(text);
              onChange(text);
            }}
            placeholder="every 24h · 0 9 * * 1 · 2026-08-09T09:00"
            placeholderTextColor={styles.placeholder.color}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Job schedule"
          />
          {invalid ? (
            <Text style={styles.invalidHint}>
              the server would refuse this · use a cron expression, “every Xm/h/d”, or a date
            </Text>
          ) : (
            <Text style={styles.note}>cron expression · every 30m / 2h / 1d · ISO timestamp or duration</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (palette: Palette) =>
  StyleSheet.create({
    container: { gap: space.sm },
    chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.sm },
    chip: {
      paddingHorizontal: space.md,
      paddingVertical: space.xs,
      borderRadius: radius.md,
      borderWidth: 1,
    },
    chipActive: { backgroundColor: palette.accent, borderColor: palette.accent },
    chipIdle: { backgroundColor: palette.surface, borderColor: palette.border },
    chipTextActive: { color: palette.accentText, fontSize: font.body },
    chipTextIdle: { color: palette.text, fontSize: font.body },
    card: {
      backgroundColor: palette.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: palette.border,
      overflow: 'hidden' as const,
    },
    row: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
    },
    link: { backgroundColor: palette.surface },
    rowLabel: { color: palette.text, fontSize: font.body },
    rowValue: { color: palette.textMuted, fontSize: font.body },
    fieldPanel: {
      marginTop: space.xs,
      padding: space.sm,
      backgroundColor: palette.surfaceAlt,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: palette.border,
    },
    note: { color: palette.textMuted, fontSize: font.small },
    invalidHint: { color: palette.danger, fontSize: font.small },
    input: {
      color: palette.text,
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      fontSize: font.body,
    },
    inputInvalid: { borderColor: palette.danger },
    placeholder: { color: palette.textMuted },
  });
