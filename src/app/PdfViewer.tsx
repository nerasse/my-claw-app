/**
 * The module to import: `import { PdfViewer } from './PdfViewer'`.
 *
 * Metro never loads this file -- the platform siblings (`PdfViewer.native.tsx` for Android,
 * `PdfViewer.web.tsx` for react-native-web) win the resolution -- but tsc and Jest do, and the
 * re-export is what lets the shell typecheck against the real component.
 */
export { PdfViewer } from './PdfViewer.native';
