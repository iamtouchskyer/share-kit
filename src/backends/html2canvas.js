// backends/html2canvas.js — optional html2canvas adapter.
//
// Kept out of the main entry on purpose:
//   * `import('html2canvas')` is a real module import, so your bundler ships the
//     library with your app. 0.1.x injected a <script> from jsdelivr at capture
//     time instead, which meant sharing broke whenever that CDN was blocked
//     (corporate proxies, mainland China) or offline.
//   * html2canvas stays optional: the default (zero-dependency) engine needs
//     nothing installed.
//
// Usage:
//   npm install html2canvas
//   import { exportToImage } from '@iamtouchskyer/share-kit';
//   import { html2canvasCapture } from '@iamtouchskyer/share-kit/backends/html2canvas';
//
//   const blob = await exportToImage(el, { capture: html2canvasCapture() });

let cached = null;

/**
 * Import html2canvas once and remember it.
 * @param {string} [specifier='html2canvas']
 */
export async function loadHtml2Canvas(specifier = 'html2canvas') {
  if (window.html2canvas) return window.html2canvas;
  if (cached) return cached;
  try {
    const mod = await import(/* @vite-ignore */ specifier);
    cached = mod.default || mod;
    return cached;
  } catch (error) {
    throw new Error(
      `share-kit: could not load "${specifier}" — install it (npm install html2canvas) `
      + 'or use the default zero-dependency engine by not passing a capture function.\n'
      + `Original error: ${error && error.message}`,
    );
  }
}

/**
 * Create a capture function that renders with html2canvas.
 *
 * @param {object} [options]
 * @param {Function} [options.html2canvas] - preloaded html2canvas (skips the dynamic import)
 * @param {string} [options.specifier] - module specifier to import
 * @param {boolean} [options.useCORS=true] - allow cross-origin images (the source must send CORS headers)
 * @param {boolean} [options.logging=false]
 * @returns {(element: HTMLElement, opts: object) => Promise<HTMLCanvasElement>}
 */
export function html2canvasCapture(options = {}) {
  const { html2canvas, specifier, useCORS = true, logging = false } = options;
  return async (element, opts = {}) => {
    const h2c = html2canvas || await loadHtml2Canvas(specifier);
    return h2c(element, {
      scale: opts.pixelRatio || opts.scale || 2,
      width: opts.width,
      height: opts.height || undefined,
      useCORS,
      logging,
      // Only fill when the caller asked for it; html2canvas paints transparent
      // otherwise, matching the default engine.
      backgroundColor: opts.background || null,
    });
  };
}
