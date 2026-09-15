/**
 * The editor's contracts, in the order they break: the anti-loop rule (a `value` prop that is our
 * own echo must not touch the document; one that is not replaces it and empties the undo stack),
 * the file-name to language mapping both hosts draw from, and the Android host actually carrying
 * `value`/`language`/`readOnly` across the bridge -- plus the keyboard lift, which is the one
 * piece of this that cannot be seen from a unit test on a desk.
 *
 * The WebView is mocked (a real one needs the device), but the *host* is the real component: the
 * mock only stands in for the native view, so every assertion here is about what crosses the
 * bridge, not about what a stub would do.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter, Keyboard } from 'react-native';
import { CodeEditor } from '../CodeEditor';
import type { CodeEditorHandle, CodeEditorProps } from '../CodeEditor';
import {
  LANGUAGE_BY_EXTENSION,
  LANGUAGE_BY_FILENAME,
  languageForFile,
  shouldReplaceDocument,
} from '../codeeditor/document';
import { LANGUAGE_IDS, languageExtension } from '../codeeditor/languages';
import { parseEditorEvent } from '../codeeditor/protocol';

jest.mock('react-native-webview', () => {
  const ReactMock = require('react');
  const { View } = require('react-native');
  // The stand-in records what the host injects and replays what the page would post back.
  const state: { props: Record<string, unknown> | null; injected: string[] } = {
    props: null,
    injected: [],
  };
  class MockWebView extends ReactMock.Component {
    injectJavaScript = (code: string): void => {
      state.injected.push(code);
    };
    requestFocus = (): void => {};
    render(): React.ReactElement {
      state.props = this.props as Record<string, unknown>;
      return ReactMock.createElement(View, null);
    }
  }
  return {
    __esModule: true,
    WebView: MockWebView,
    default: MockWebView,
    __state: state,
  };
});

jest.mock('../../core/revealField', () => ({
  measureOnScreen: jest.fn(),
}));

type Tree = ReactTestRenderer.ReactTestRenderer;

type WebViewMock = { props: Record<string, unknown>; injected: string[] };

const webview = (): WebViewMock =>
  (jest.requireMock('react-native-webview') as { __state: WebViewMock })
    .__state;

function mount(props: CodeEditorProps): Tree {
  let tree!: Tree;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<CodeEditor {...props} />);
  });
  mounted.push(tree);
  return tree;
}

/**
 * Every mounted host, so each test starts clean. A host left mounted keeps its `Keyboard`
 * subscriptions, and an event emitted by the keyboard test would then be answered by every host
 * the file has ever created.
 */
const mounted: Tree[] = [];

function rerender(tree: Tree, props: CodeEditorProps): void {
  ReactTestRenderer.act(() => {
    tree.update(<CodeEditor {...props} />);
  });
}

/** Replay what the page posts through `window.ReactNativeWebView.postMessage`. */
function pageEvent(message: unknown): void {
  const { props } = webview();
  ReactTestRenderer.act(() => {
    (props.onMessage as (event: unknown) => void)({
      nativeEvent: { data: JSON.stringify(message) },
    });
  });
}

/** The JSON body of the last `init`/`request` call the host injected. */
function lastCall(call: 'init' | 'request'): Record<string, unknown> {
  const { injected } = webview();
  const line = injected.filter(entry => entry.includes(`.${call}(`)).pop();
  if (line === undefined) throw new Error(`nothing was injected for ${call}`);
  const marker = `.${call}(`;
  return JSON.parse(
    line.slice(line.indexOf(marker) + marker.length, line.lastIndexOf(')')),
  );
}

const requestsSent = (): string[] =>
  webview().injected.filter(entry => entry.includes('.request('));

/** Wait for the page to say it is up and to have built its editor. */
function boot(): void {
  pageEvent({ type: 'ready' });
  pageEvent({ type: 'initialized' });
}

/** Run a handle call and answer its request, the way the page would. */
async function delivered<T>(
  call: () => Promise<T>,
  result: unknown = null,
): Promise<T> {
  let promise!: Promise<T>;
  await ReactTestRenderer.act(async () => {
    promise = call();
    answerLastRequest(result);
    await promise;
  });
  return promise;
}

/**
 * Answer the last request the host injected. A request nothing answers is a timeout timer left
 * running, which is what keeps Jest from exiting at the end of the run.
 */
function answerLastRequest(result: unknown = null): void {
  const body = lastCall('request');
  pageEvent({ type: 'response', id: body.id, result });
}

function keyboardShows(screenY: number, height: number): Promise<void> {
  return ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('keyboardDidShow', {
      endCoordinates: { screenX: 0, screenY, width: 1080, height },
      duration: 0,
      easing: 'keyboard',
    });
    // The lift waits on a measurement; one microtask turn is what that promise needs.
    await Promise.resolve();
  });
}

beforeEach(() => {
  webview().injected.length = 0;
});

afterEach(() => {
  for (const tree of mounted.splice(0)) {
    ReactTestRenderer.act(() => tree.unmount());
  }
});

describe('the anti-loop rule', () => {
  test('an echo of the typing leaves the document alone; a new value replaces it without history', () => {
    const changes: string[] = [];
    const onChange = (value: string): void => {
      changes.push(value);
    };
    const tree = mount({ value: 'file A', onChange });
    boot();
    const afterInit = requestsSent().length;

    // The user types: the page reports the document it now holds.
    pageEvent({ type: 'change', value: 'file A!' });
    expect(changes).toEqual(['file A!']);

    // The page echoes that through the prop, as any controlled parent does. Nothing may cross
    // the bridge -- a replacement here rewrites the line under the caret.
    rerender(tree, { value: 'file A!', onChange });
    expect(requestsSent().length).toBe(afterInit);

    // Then another file is opened: the prop no longer matches what the document holds.
    rerender(tree, { value: 'file B', onChange });
    expect(lastCall('request')).toMatchObject({
      method: 'setValue',
      value: 'file B',
      keepHistory: false,
    });
    answerLastRequest();

    // And the echo of *that* replacement is recognised too, or every write would reset the undo
    // stack of the file it just wrote.
    rerender(tree, { value: 'file B', onChange });
    expect(requestsSent().length).toBe(afterInit + 1);
  });

  test('the rule itself, spelled out', () => {
    // Nothing to replace before a document exists: the initial value travels in the init payload.
    expect(shouldReplaceDocument('anything', null)).toBe(false);
    expect(shouldReplaceDocument('same', 'same')).toBe(false);
    expect(shouldReplaceDocument('other', 'same')).toBe(true);
  });
});

describe('the handle', () => {
  test('setValue empties the undo stack unless the caller asks to keep it', async () => {
    const handles: CodeEditorHandle[] = [];
    const onReady = (handle: CodeEditorHandle): void => {
      handles.push(handle);
    };
    mount({ value: 'file A', onReady });
    boot();
    expect(handles).toHaveLength(1);
    const handle = handles[0];

    await delivered(() => handle.setValue('opened'), null);
    expect(lastCall('request')).toMatchObject({
      method: 'setValue',
      value: 'opened',
      keepHistory: false,
    });

    await delivered(
      () => handle.setValue('reloaded', { keepHistory: true }),
      null,
    );
    expect(lastCall('request')).toMatchObject({
      method: 'setValue',
      value: 'reloaded',
      keepHistory: true,
    });
  });

  test('language, font size, history, scroll and focus all reach the page', async () => {
    const handles: CodeEditorHandle[] = [];
    const onReady = (handle: CodeEditorHandle): void => {
      handles.push(handle);
    };
    mount({ value: 'file A', onReady });
    boot();
    const handle = handles[0];

    await delivered(() => handle.setLanguage('python'), null);
    expect(lastCall('request')).toMatchObject({
      method: 'configure',
      patch: { language: 'python' },
    });

    await delivered(() => handle.setFontSize(18), null);
    expect(lastCall('request')).toMatchObject({
      method: 'configure',
      patch: { fontSize: 18 },
    });

    await delivered(() => handle.undo(), null);
    expect(lastCall('request')).toMatchObject({ method: 'undo' });

    await delivered(() => handle.redo(), null);
    expect(lastCall('request')).toMatchObject({ method: 'redo' });

    await delivered(() => handle.scrollToCursor(), null);
    expect(lastCall('request')).toMatchObject({ method: 'scrollToCursor' });

    await delivered(() => handle.focus(), null);
    expect(lastCall('request')).toMatchObject({ method: 'focus' });

    const value = await delivered(() => handle.getValue(), 'the document');
    expect(value).toBe('the document');
  });

  test('a language the page was born with is not sent again', async () => {
    const handles: CodeEditorHandle[] = [];
    const onReady = (handle: CodeEditorHandle): void => {
      handles.push(handle);
    };
    mount({ value: 'file A', language: 'rust', onReady });
    boot();
    // Nothing crosses the bridge, so there is no request to answer either.
    await ReactTestRenderer.act(async () => {
      await handles[0].setLanguage('rust');
    });
    expect(requestsSent()).toHaveLength(0);
  });
});

describe('the Android host and its page', () => {
  test('mounting hands value, language and readOnly to the page, then reports ready', () => {
    const cursors: number[] = [];
    const handles: CodeEditorHandle[] = [];
    const onCursor = (line: number): void => {
      cursors.push(line);
    };
    const onReady = (handle: CodeEditorHandle): void => {
      handles.push(handle);
    };
    mount({
      value: 'const x = 1;',
      language: 'typescript',
      readOnly: true,
      dark: true,
      fontSize: 16,
      onReady,
      onCursor,
    });

    // Nothing is sent before the page says it is up: the asset is what triggers the handshake.
    expect(webview().injected).toEqual([]);
    expect(webview().props.source).toEqual({
      uri: 'file:///android_asset/codeditor/index.html',
    });

    pageEvent({ type: 'ready' });
    expect(lastCall('init')).toEqual({
      value: 'const x = 1;',
      language: 'typescript',
      readOnly: true,
      dark: true,
      fontSize: 16,
    });

    expect(handles).toHaveLength(0);
    pageEvent({ type: 'initialized' });
    expect(handles).toHaveLength(1);

    pageEvent({ type: 'cursor', line: 42 });
    expect(cursors).toEqual([42]);
  });

  test('a prop that moved while the WebView was still loading lands right after init', () => {
    const tree = mount({ value: 'file A' });
    pageEvent({ type: 'ready' });
    // The page's state arrives while the init payload is in flight.
    rerender(tree, { value: 'file C' });
    pageEvent({ type: 'initialized' });
    expect(lastCall('request')).toMatchObject({
      method: 'setValue',
      value: 'file C',
      keepHistory: false,
    });
    answerLastRequest();
  });

  test('a message the host does not know is dropped, not walked into', () => {
    const errors: unknown[] = [];
    const onError = (error: unknown): void => {
      errors.push(error);
    };
    mount({ value: 'file A', onError });
    boot();
    const after = webview().injected.length;
    pageEvent({ type: 'somethingNew', payload: { deep: [] } });
    pageEvent({ type: 'change' });
    expect(webview().injected.length).toBe(after);
    expect(errors).toEqual([]);
  });

  /**
   * The editor is inside the shell's `KeyboardAvoidingView`, which already shrinks every page by
   * what the keyboard covers (`docs/keyboard-avoidance.md`: only what sits *outside* that view
   * pads itself). Padding here as well made the editor a second owner of the same inset: it
   * measured a frame the first owner had not moved yet, and the WebView was resized by the sum.
   * The editor therefore owns no keyboard at all -- what keeps the caret visible is the page,
   * which CodeMirror scrolls into view when the WebView's own resize reaches it.
   */
  test('the editor does not lift itself: the keyboard belongs to the shell', async () => {
    const listened = jest.spyOn(Keyboard, 'addListener');
    try {
      mount({ value: 'file A' });
      boot();
      const before = webview().injected.length;

      await keyboardShows(500, 300);
      // Nothing crossed the bridge: the editor answers the keyboard by doing nothing at all.
      expect(webview().injected.length).toBe(before);
      expect(listened).not.toHaveBeenCalled();
    } finally {
      listened.mockRestore();
    }
  });
});

describe('the language mapping', () => {
  test('file names map to the ids the hosts load', () => {
    expect(languageForFile('src/components/CodeEditor.native.tsx')).toBe('tsx');
    expect(languageForFile('/home/neras/dev/app/src/index.ts')).toBe(
      'typescript',
    );
    expect(languageForFile('app.json')).toBe('json');
    expect(languageForFile('README.md')).toBe('markdown');
    expect(languageForFile('Dockerfile')).toBe('dockerfile');
    expect(languageForFile('.zshrc')).toBe('shell');
    expect(languageForFile('docker-compose.yml')).toBe('yaml');
    expect(languageForFile('schema.plsql')).toBe('plsql');
    expect(languageForFile('styles.module.scss')).toBe('scss');
    expect(languageForFile('lib.rs')).toBe('rust');
    expect(languageForFile('CMakeLists.txt')).toBeNull();
    expect(languageForFile('LICENSE')).toBeNull();
  });

  test('every id the mapping hands out is one the hosts can load', () => {
    const loadable = new Set(LANGUAGE_IDS);
    const mapped = [
      ...Object.values(LANGUAGE_BY_EXTENSION),
      ...Object.values(LANGUAGE_BY_FILENAME),
    ];
    expect(mapped.filter(id => !loadable.has(id))).toEqual([]);
  });

  test('every language in the bundle is reachable from a file name', () => {
    const reachable = new Set([
      ...Object.values(LANGUAGE_BY_EXTENSION),
      ...Object.values(LANGUAGE_BY_FILENAME),
    ]);
    expect(LANGUAGE_IDS.filter(id => !reachable.has(id))).toEqual([]);
  });

  test('a known id gets an extension, an unknown one gets plain text', () => {
    expect(languageExtension('javascript')).toBeTruthy();
    expect(languageExtension('tsx')).toBeTruthy();
    expect(languageExtension(null)).toEqual([]);
    expect(languageExtension('cobol')).toEqual([]);
  });

  test('every advertised id actually builds an extension', () => {
    // `[]` is truthy, so an id with no loader cannot be caught by a truthiness check: the empty
    // array is exactly what `languageExtension` answers for something it does not know.
    const broken = LANGUAGE_IDS.filter(id => {
      const extension = languageExtension(id) as unknown;
      if (Array.isArray(extension)) return extension.length === 0;
      return extension === null || extension === undefined;
    });
    expect(broken).toEqual([]);
  });
});

describe('the wire', () => {
  test('the page is parsed through a whitelist', () => {
    expect(parseEditorEvent('not json')).toBeNull();
    expect(parseEditorEvent('[]')).toBeNull();
    expect(parseEditorEvent('{"type":"somethingNew"}')).toBeNull();
    expect(parseEditorEvent('{"type":"change"}')).toBeNull();
    expect(parseEditorEvent('{"type":"change","value":5}')).toBeNull();
    expect(parseEditorEvent('{"type":"cursor","line":"12"}')).toBeNull();
    expect(parseEditorEvent('{"type":"response","id":"3"}')).toBeNull();

    expect(parseEditorEvent('{"type":"ready"}')).toEqual({ type: 'ready' });
    expect(parseEditorEvent('{"type":"initialized"}')).toEqual({
      type: 'initialized',
    });
    expect(parseEditorEvent('{"type":"change","value":"text"}')).toEqual({
      type: 'change',
      value: 'text',
    });
    expect(parseEditorEvent('{"type":"cursor","line":12}')).toEqual({
      type: 'cursor',
      line: 12,
    });
    expect(parseEditorEvent('{"type":"error","message":"boom"}')).toEqual({
      type: 'error',
      message: 'boom',
    });
    expect(
      parseEditorEvent('{"type":"response","id":3,"result":"doc"}'),
    ).toEqual({
      type: 'response',
      id: 3,
      result: 'doc',
    });
    expect(
      parseEditorEvent('{"type":"response","id":3,"error":"boom"}'),
    ).toEqual({
      type: 'response',
      id: 3,
      error: 'boom',
    });
  });
});
