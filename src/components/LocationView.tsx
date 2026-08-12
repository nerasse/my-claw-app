import React from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import type { LocationData } from '../core/protocol';
import { font, radius, space, useThemedStyles, type Palette } from '../theme';

function mapUrl(location: LocationData): string {
  const zoom = location.accuracyMeters <= 25 ? 18 : location.accuracyMeters <= 100 ? 16 : 13;
  return `https://www.openstreetmap.org/?mlat=${location.latitude}&mlon=${location.longitude}#map=${zoom}/${location.latitude}/${location.longitude}`;
}

export function LocationView({ location, onAccent }: { location: LocationData; onAccent?: boolean }): React.JSX.Element {
  const styles = useThemedStyles(createStyles);
  const address = location.address;
  return (
    <View style={[styles.card, onAccent && styles.cardOnAccent]}>
      <Text style={[styles.title, onAccent && styles.textOnAccent]}>Current location</Text>
      {address ? (
        <Text style={[styles.address, onAccent && styles.textOnAccent]} numberOfLines={3}>
          {address.formatted}
        </Text>
      ) : (
        <Text style={[styles.address, onAccent && styles.textOnAccent]}>Address unavailable</Text>
      )}
      <Text style={[styles.meta, onAccent && styles.metaOnAccent]}>
        Approximate · GPS accuracy +/- {Math.round(location.accuracyMeters)} m · {address?.level ?? 'coordinates'} level
      </Text>
      <Pressable
        style={[styles.button, onAccent && styles.buttonOnAccent]}
        onPress={() => Linking.openURL(mapUrl(location)).catch(() => {})}
        accessibilityRole="button"
        accessibilityLabel="Open shared location on OpenStreetMap">
        <Text style={[styles.buttonText, onAccent && styles.buttonTextOnAccent]}>Open in OpenStreetMap</Text>
      </Pressable>
      <Text style={[styles.attribution, onAccent && styles.metaOnAccent]}>Map data © OpenStreetMap contributors</Text>
    </View>
  );
}

const createStyles = (palette: Palette) => ({
  card: {
    alignSelf: 'stretch' as const,
    backgroundColor: palette.accentSoft,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm,
    gap: space.xs,
  },
  cardOnAccent: { backgroundColor: palette.onAccentTrack },
  title: { fontSize: font.meta, fontWeight: '600' as const, color: palette.text },
  address: { fontSize: font.body, color: palette.text },
  meta: { fontSize: font.small, color: palette.textMuted },
  metaOnAccent: { color: palette.onAccentMuted },
  textOnAccent: { color: palette.accentText },
  button: {
    alignSelf: 'flex-start' as const,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  buttonOnAccent: { borderColor: palette.onAccentMuted },
  buttonText: { fontSize: font.small, color: palette.accent },
  buttonTextOnAccent: { color: palette.accentText },
  attribution: { fontSize: font.micro, color: palette.textFaint },
});
