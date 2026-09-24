/**
 * `?text` is the esbuild plugin in `scripts/build-pdfviewer.js`: the module's source as a string,
 * which is how the pdf.js worker is inlined into the page. TypeScript has no idea what the suffix
 * means, so the shape is declared here.
 */
declare module '*?text' {
  const content: string;
  export default content;
}
