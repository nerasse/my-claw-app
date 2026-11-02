import React from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import type { LocationData } from '../core/protocol';
import { font, radius, scaleFont, space, useThemedStyles, type Palette } from '../theme';

export function locationMapUrl(location: LocationData): string {
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
        onPress={() => Linking.openURL(locationMapUrl(location)).catch(() => {})}
        accessibilityRole="button"
        accessibilityLabel="Open shared location on OpenStreetMap">
        <Text style={[styles.buttonText, onAccent && styles.buttonTextOnAccent]}>Open in OpenStreetMap</Text>
      </Pressable>
      <Text style={[styles.attribution, onAccent && styles.metaOnAccent]}>{address?.provider === 'geoapify' ? 'Geocoding by Geoapify · ' : ''}Map data © OpenStreetMap contributors</Text>
    </View>
  );
}

const createStyles = (palette: Palette, _dark: boolean, scale: number) => ({
  card: {
    alignSelf: 'stretch' as const,
    backgroundColor: palette.accentSoft,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm,
    gap: space.xs,
  },
  cardOnAccent: { backgroundColor: palette.surfaceRaised },
  title: { fontSize: scaleFont(font.meta, scale), fontWeight: '600' as const, color: palette.text },
  address: { fontSize: scaleFont(font.body, scale), color: palette.text },
  meta: { fontSize: scaleFont(font.small, scale), color: palette.textMuted },
  metaOnAccent: { color: palette.textMuted },
  textOnAccent: { color: palette.bubbleUserText },
  button: {
    alignSelf: 'flex-start' as const,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  buttonOnAccent: { borderColor: palette.border },
  buttonText: { fontSize: scaleFont(font.small, scale), color: palette.accent },
  buttonTextOnAccent: { color: palette.accent },
  attribution: { fontSize: scaleFont(font.micro, scale), color: palette.textFaint },
});
