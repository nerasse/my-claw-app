import { connection } from './connection';
import { encodeLocationPreview, type LocationData, type LocationInput } from './protocol';
import { uuid } from './utils';

const PREVIEW_TIMEOUT_MS = 6_000;

/**
 * One-shot server-side geocoding for a staged location. The key never reaches the client:
 * the app sends coordinates, the server answers with the enriched value. Nothing is persisted,
 * and a missing answer resolves with the raw input so the composer never blocks on the preview.
 */
class LocationPreviewStore {
  private pending = new Map<string, { resolve: (location: LocationData) => void; timer: ReturnType<typeof setTimeout> }>();

  request(location: LocationInput): Promise<LocationData> {
    const id = uuid();
    return new Promise(resolve => {
      const settle = (value: LocationData) => {
        const entry = this.pending.get(id);
        if (entry) clearTimeout(entry.timer);
        this.pending.delete(id);
        resolve(value);
      };
      const timer = setTimeout(() => settle(location), PREVIEW_TIMEOUT_MS);
      // Node-only: an unanswered preview must never keep a test process alive.
      (timer as unknown as { unref?: () => void }).unref?.();
      this.pending.set(id, { resolve: settle, timer });
      connection
        .send(encodeLocationPreview(id, location))
        .catch(() => settle(location));
    });
  }

  receive(id: string, location: LocationData): void {
    const entry = this.pending.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(id);
    entry.resolve(location);
  }
}

export const locationPreview = new LocationPreviewStore();
