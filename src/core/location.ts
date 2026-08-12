import { PermissionsAndroid, Platform } from 'react-native';
import { deviceBridge, type CurrentLocationNative } from './nativeBridge';
import type { LocationInput } from './protocol';

const ANDROID_LOCATION_PERMISSIONS = [
  PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
];

function optional(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function fromNative(location: CurrentLocationNative): LocationInput {
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    accuracyMeters: location.accuracyMeters,
    capturedAt: location.capturedAt,
    ...(optional(location.altitudeMeters) === undefined ? {} : { altitudeMeters: optional(location.altitudeMeters) }),
    ...(optional(location.headingDegrees) === undefined ? {} : { headingDegrees: optional(location.headingDegrees) }),
    ...(optional(location.speedMetersPerSecond) === undefined ? {} : { speedMetersPerSecond: optional(location.speedMetersPerSecond) }),
  };
}

async function requestAndroidLocationPermission(): Promise<void> {
  const precise = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  if (precise) return;
  const result = await PermissionsAndroid.requestMultiple(ANDROID_LOCATION_PERMISSIONS);
  const granted = Object.values(result).some(value => value === PermissionsAndroid.RESULTS.GRANTED);
  if (!granted) throw new Error('Location permission denied');
}

function browserLocation(): Promise<LocationInput> {
  const geolocation = (globalThis as {
    navigator?: {
      geolocation?: {
        getCurrentPosition: (
          success: (position: { coords: { latitude: number; longitude: number; accuracy: number; altitude: number | null; heading: number | null; speed: number | null }; timestamp: number }) => void,
          error: (reason: { message?: string }) => void,
          options: { enableHighAccuracy: boolean; maximumAge: number; timeout: number },
        ) => void;
      };
    };
  }).navigator?.geolocation;
  if (!geolocation) return Promise.reject(new Error('Location is not available on this device'));
  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(
      position => {
        const coords = position.coords;
        resolve({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracyMeters: coords.accuracy,
          capturedAt: new Date(position.timestamp).toISOString(),
          ...(optional(coords.altitude) === undefined ? {} : { altitudeMeters: optional(coords.altitude) }),
          ...(optional(coords.heading) === undefined ? {} : { headingDegrees: optional(coords.heading) }),
          ...(optional(coords.speed) === undefined ? {} : { speedMetersPerSecond: optional(coords.speed) }),
        });
      },
      error => reject(new Error(error.message || 'Location unavailable')),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
    );
  });
}

/** Captures a foreground one-shot fix; the native side waits for its best short-lived measurement. */
export async function getCurrentLocation(): Promise<LocationInput> {
  if (Platform.OS === 'android') await requestAndroidLocationPermission();
  if (Platform.OS === 'web') return browserLocation();
  return fromNative(await deviceBridge.getCurrentLocation());
}
