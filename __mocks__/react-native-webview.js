/**
 * react-native-webview is a native module: the tests render the shell, which now reaches the
 * system files page and through it the CodeMirror host, and the real package asks the TurboModule
 * registry for a module no Jest process has. What matters here is that the page mounts and that a
 * message can be delivered to it, not that a WebView draws.
 *
 * The stub forwards what the host needs: `onMessage` for the editor's replies, `source` so a test
 * can read the page the host built, and an imperative `ref` carrying `postMessage` -- the three
 * things `CodeEditor.native.tsx` actually calls. Every test that wants to drive the editor mocks
 * `../components/CodeEditor` instead; this only keeps the import graph mountable.
 */
const React = require('react');

const WebView = React.forwardRef(function WebView(props, ref) {
  React.useImperativeHandle(ref, () => ({
    postMessage: () => {},
    injectJavaScript: () => {},
    requestFocus: () => {},
    reload: () => {},
    stopLoading: () => {},
  }));

  return React.createElement('WebView', {
    testID: props.testID,
    // Kept reachable so a test can assert on the page that was built without rendering it.
    source: props.source,
    onMessage: props.onMessage,
    onLoad: props.onLoad,
  });
});

module.exports = { WebView, default: WebView };
