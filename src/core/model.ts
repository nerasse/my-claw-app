import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { connection } from './connection';
import {
  encodeModelEndpoints,
  encodeModelRefresh,
  encodeModelsRemove,
  encodeModelsUpsert,
  type ModelDeclaration,
  type ContextState,
  type EffortState,
  type ModelEndpoint,
  type ModelEndpointsResultFrame,
  type ModelListResultFrame,
  type ModelOption,
  type ModelRefreshResultFrame,
  type ModelResultFrame,
  type RouteSort,
} from './protocol';

type Listener = () => void;

const EMPTY: ModelListResultFrame = { type: 'model.list.result', models: [], defaultModel: '' };
Object.freeze(EMPTY);

/** The catalogue before the server answered: an empty default there means "not asked yet", not "none". */
export function catalogAnswered(catalog: ModelListResultFrame): boolean {
  return catalog !== EMPTY;
}

const NO_EFFORT: EffortState = { level: '', levels: [], supported: false };

/** Separates an endpoint pin from the model it routes. The grammar is the server's:
 *  docs/model-identity.md, `provider/apiId@endpoint`. */
const PIN = '@';

/** The reference without its route: what the catalogue lists, and what a label is read from. */
export function withoutEndpoint(ref: string): string {
  const at = ref.lastIndexOf(PIN);
  return at > 0 ? ref.slice(0, at) : ref;
}

/** The route a reference pins, if any. */
export function endpointOf(ref: string): string | undefined {
  const at = ref.lastIndexOf(PIN);
  return at > 0 ? ref.slice(at + 1) : undefined;
}

/**
 * A hand-fired discovery: whether one is running, and what the last one found. `outcome` is kept
 * after the pass so the screen can say what happened instead of the button just going quiet.
 */
export interface DiscoveryState {
  running: boolean;
  outcome: ModelRefreshResultFrame | null;
  error: string | null;
}

const IDLE_DISCOVERY: DiscoveryState = { running: false, outcome: null, error: null };
Object.freeze(IDLE_DISCOVERY);

/** Long enough for a provider that answers slowly, short enough to stop a spinner lying. */
const DISCOVERY_TIMEOUT_MS = 60_000;

/** The routes of one model, and whether the answer is in. `pending` is what the step shows. */
export interface EndpointState {
  pending: boolean;
  endpoints: ModelEndpoint[];
}

const PENDING: EndpointState = { pending: true, endpoints: [] };

/** Routes are cached per model *and* per ordering: the same model sorted two ways is two lists. */
function endpointKey(model: string, sort: RouteSort): string {
  return `${sort}\u0000${model}`;
}
Object.freeze(PENDING);

interface ThreadModel {
  /** What runs on the thread now: this chat's pick, an agent pin, or the configured default. */
  model: string;
  defaultModel: string;
  /** Which of the three, when the server says. */
  source?: 'session' | 'agent' | 'agent-file' | 'global';
  effort: EffortState;
  /** Absent on a server that predates the context step: the picker then skips it. */
  context?: ContextState;
}

/**
 * Model state of the open threads. The server owns the truth; this store only mirrors what
 * `model.list.result` and `model.result` frames say, so the picker never shows a choice that
 * disagrees with what the server will actually run.
 */
class ModelStoreImpl {
  private catalog: ModelListResultFrame = EMPTY;
  /** The catalogue keyed by id, rebuilt with it: naming a model is a lookup, not a scan. */
  private index = new Map<string, ModelOption>();
  private perThread = new Map<string, ThreadModel>();
  /** Routes per model, kept for the life of the connection: the server caches them too, and a
   *  picker walked back and forth would otherwise ask OpenRouter again on every visit. */
  private endpoints = new Map<string, EndpointState>();
  private discovery: DiscoveryState = IDLE_DISCOVERY;
  private discoveryTimer: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): ModelListResultFrame {
    return this.catalog;
  }

  catalogModel(id: string): string {
    const listed = this.index.get(id);
    if (listed) return listed.label;
    // A pinned reference is not listed: the catalogue holds the model, the pin is the route on
    // top of it, and the label has to say both or the header would name a model nobody picked.
    const bare = withoutEndpoint(id);
    const route = endpointOf(id);
    if (!route) return id;
    return `${this.index.get(bare)?.label ?? bare} @ ${route}`;
  }

  /** The routes of a model, as far as this store knows. Pending until the server answers. */
  endpointsOf(model: string, sort: RouteSort = 'price'): EndpointState {
    return this.endpoints.get(endpointKey(model, sort)) ?? PENDING;
  }

  /** Asks for the routes of a model, once per ordering. Called from an effect, never while rendering. */
  requestEndpoints(model: string, sort: RouteSort = 'price'): void {
    const key = endpointKey(model, sort);
    if (this.endpoints.has(key)) return;
    this.endpoints.set(key, PENDING);
    // `send` reports failure by resolving false, never by rejecting: the `.catch` this used to
    // carry could not fire, and a frame that never left spun `loading routes...` forever.
    connection.send(encodeModelEndpoints(model, sort)).then((delivered) => {
      if (delivered) return;
      // No answer is coming: drop the placeholder so entering the step again asks once more.
      this.endpoints.delete(key);
      this.emit();
    });
  }

  replaceEndpoints(frame: ModelEndpointsResultFrame): void {
    // Keyed by model *and* ordering, which is why the answer echoes the sort back: one key per
    // order, or reordering would read as the order before it since the list is already cached.
    this.endpoints.set(endpointKey(frame.model, frame.sort ?? 'price'), { pending: false, endpoints: frame.endpoints });
    this.emit();
  }

  threadModel(threadId: string | null): ThreadModel | null {
    if (!threadId) return null;
    return this.perThread.get(threadId) ?? null;
  }

  labelOf(threadId: string | null): string | undefined {
    const entry = this.threadModel(threadId);
    if (!entry) return undefined;
    return this.catalogModel(entry.model);
  }

  discoveryState(): DiscoveryState {
    return this.discovery;
  }

  /**
   * Asks the server to discover again. The button is what makes a provider's new models appear
   * without waiting six hours for the cycle, or restarting the server to force the boot pass.
   *
   * The timeout is not decoration: an older server drops the frame silently, and without it the
   * spinner would run until the screen closed.
   */
  refreshDiscovery(): void {
    if (this.discovery.running) return;
    this.discovery = { running: true, outcome: null, error: null };
    this.emit();
    connection.send(encodeModelRefresh()).then((delivered) => {
      if (delivered) return;
      this.failDiscovery('the server never received it, check the connection');
    });
    this.discoveryTimer = setTimeout(
      () => this.failDiscovery('no answer from the server, it may be too old for this'),
      DISCOVERY_TIMEOUT_MS,
    );
  }

  receiveDiscovery(frame: ModelRefreshResultFrame): void {
    this.clearDiscoveryTimer();
    this.discovery = { running: false, outcome: frame, error: null };
    this.emit();
  }

  failDiscovery(message: string): void {
    if (!this.discovery.running) return;
    this.clearDiscoveryTimer();
    this.discovery = { running: false, outcome: null, error: message };
    this.emit();
  }

  private clearDiscoveryTimer(): void {
    if (this.discoveryTimer === undefined) return;
    clearTimeout(this.discoveryTimer);
    this.discoveryTimer = undefined;
  }

  /** Test seam: back to "the server has not answered", as at launch. */
  reset(): void {
    this.perThread.clear();
    this.replaceCatalog(EMPTY);
  }

  replaceCatalog(frame: ModelListResultFrame): void {
    this.catalog = frame;
    this.index = new Map(frame.models.map(model => [model.id, model]));
    // A fresh catalogue can have renamed or dropped a model, and a route list is only ever read
    // against the model it belongs to: the cheapest correct answer is to ask again.
    this.endpoints.clear();
    this.emit();
  }

  replaceThread(frame: ModelResultFrame): void {
    this.perThread.set(frame.threadId, {
      model: frame.model,
      defaultModel: frame.defaultModel,
      ...(frame.source === undefined ? {} : { source: frame.source }),
      effort: frame.effort ?? NO_EFFORT,
      ...(frame.context === undefined ? {} : { context: frame.context }),
    });
    this.emit();
  }

  dropThread(threadId: string): void {
    if (!this.perThread.delete(threadId)) return;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const modelStore = new ModelStoreImpl();

const subscribeToModels = (listener: Listener): (() => void) => modelStore.subscribe(listener);

export function useModelCatalog(): ModelListResultFrame {
  return useSyncExternalStore(subscribeToModels, () => modelStore.getSnapshot());
}

/** Whether a discovery is running, and what the last one found. */
export function useDiscovery(): DiscoveryState {
  return useSyncExternalStore(subscribeToModels, () => modelStore.discoveryState());
}

/**
 * Models by id, rebuilt only when the catalogue is. A discovering provider brings hundreds of
 * them, and every screen that names one was reaching for it with a linear scan — the model
 * picker three times per render, the agents list once per row.
 */
export function useModelIndex(models: ModelOption[]): Map<string, ModelOption> {
  return useMemo(() => new Map(models.map(model => [model.id, model])), [models]);
}

/**
 * The routes of a model, requested on first read. `null` asks for nothing: the step is not open,
 * and a hook cannot be called conditionally.
 */
export function useModelEndpoints(model: string | null, sort: RouteSort = 'price'): EndpointState {
  const snapshot = useCallback(
    () => (model ? modelStore.endpointsOf(model, sort) : PENDING),
    [model, sort],
  );
  useEffect(() => {
    if (model) modelStore.requestEndpoints(model, sort);
  }, [model, sort]);
  return useSyncExternalStore(subscribeToModels, snapshot);
}

export function useThreadModel(threadId: string | null): ThreadModel | null {
  const snapshot = useCallback(() => modelStore.threadModel(threadId), [threadId]);
  return useSyncExternalStore(subscribeToModels, snapshot);
}

/**
 * Writes one declaration of `llm.models`, or deletes it. The catalogue is not patched here: the
 * server answers with a fresh `model.list.result`, which is the only copy any screen reads.
 */
export function declareModel(entry: ModelDeclaration): void {
  // `send` reports failure by resolving false, never by rejecting, and the answer to a write is
  // the fresh catalogue: nothing to do here on either outcome.
  connection.send(encodeModelsUpsert(entry)).catch(() => {});
}

export function undeclareModel(id: string): void {
  connection.send(encodeModelsRemove(id)).catch(() => {});
}
