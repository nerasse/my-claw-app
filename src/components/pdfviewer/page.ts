/**
 * The PDF page, loaded in a WebView with the server's origin as its base URL.
 *
 * Why a page at all: a phone has no PDF renderer to hand. Why the base URL: pdf.js fetches the
 * document itself, and a page loaded from `about:blank` or `file://` has the origin `null`, so the
 * request to `/media/<id>` would be a cross-origin one and the server sends no CORS headers. Loaded
 * with `baseUrl = http(s)://<server>`, the page is same-origin with the media route, and the fetch
 * is an ordinary one -- no bytes ever cross the React Native bridge, and a 50 MB file costs no
 * more than a small one.
 *
 * The worker is inlined and handed to pdf.js as a blob URL, so nothing is fetched beside the
 * document. If the browser refuses a module worker, pdf.js falls back to its own main-thread
 * worker: slower, and it still draws.
 *
 * The page talks to its host through `ReactNativeWebView.postMessage`, which is the only channel
 * upward; the host talks down by calling `window.__openPdf(url)`.
 */

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerSource from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?text';

declare global {
  interface Window {
    __openPdf?: (url: string) => void;
  }
}

type HostMessage = { type: 'ready' | 'progress' | 'done' | 'error'; pages?: number; page?: number; detail?: string };

function report(message: HostMessage): void {
  const bridge = (window as unknown as { ReactNativeWebView?: { postMessage(value: string): void } }).ReactNativeWebView;
  bridge?.postMessage(JSON.stringify(message));
}

try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(
    new Blob([workerSource], { type: 'text/javascript' }),
  );
} catch {
  // A browser that refuses the blob URL still renders through pdf.js's own fallback worker.
}

const stage = document.getElementById('stage')!;

/** Draws every page at the width it has, one after the other, reporting as it goes. */
async function draw(url: string): Promise<void> {
  stage.innerHTML = '';
  const document_ = await pdfjsLib.getDocument({ url }).promise;
  report({ type: 'ready', pages: document_.numPages });
  const ratio = window.devicePixelRatio || 1;
  const width = stage.clientWidth || window.innerWidth;
  for (let number = 1; number <= document_.numPages; number++) {
    const page = await document_.getPage(number);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: (width / base.width) * ratio });
    const canvas = document.createElement('canvas');
    canvas.className = 'page';
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${Math.floor(viewport.width / ratio)}px`;
    canvas.style.height = `${Math.floor(viewport.height / ratio)}px`;
    stage.appendChild(canvas);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no 2d context');
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    report({ type: 'progress', page: number });
  }
  report({ type: 'done' });
}

window.__openPdf = (url: string): void => {
  draw(url).catch(error => {
    report({ type: 'error', detail: error instanceof Error ? error.message : String(error) });
  });
};
