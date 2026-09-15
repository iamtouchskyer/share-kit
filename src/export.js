// export.js — presets + the export entry point.
//
// Export engines are pluggable:
//
//   * default  — the zero-dependency rasterizer in ./rasterize.js
//                (clone → inline computed styles → <svg><foreignObject>).
//                Nothing is fetched at capture time.
//   * html2canvas — opt in by installing it and importing the adapter:
//                `import { html2canvasCapture } from '@touchskyer/share-kit/backends/html2canvas'`
//                It is bundled by *your* build, i.e. it ships with the app
//                instead of being pulled from a CDN at capture time.
//   * anything else — pass `capture: (element, opts) => Promise<Blob|HTMLCanvasElement>`
//                to plug modern-screenshot, snapdom, a server round-trip, …
//
// Migration from 0.1.x: `html2canvasUrl` (a CDN URL) is gone on purpose — an
// unreachable CDN used to kill sharing entirely. Passing it now throws with the
// migration path spelled out.

import {
  DEFAULT_MAX_PIXELS,
  renderNodeToPng,
  SHARE_TOO_LONG,
  isTooLong,
} from './rasterize.js';
import { downloadBlob } from './utils.js';

/**
 * Platform presets — exact export geometry.
 *
 * `height: 'auto'` means "grow with the content": use it for long-form output
 * (a conversation, a changelog, an article) where clipping would silently cut
 * off the reader's last paragraph. Numeric heights are treated as a *floor* by
 * default, so content is never lost; pass `overflow: 'clip'` if you really want
 * the fixed frame.
 */
export const presets = {
  // Square
  'instagram-post': { width: 1080, height: 1080, label: 'Instagram Post (1:1)' },
  'wechat-chat': { width: 600, height: 600, label: 'WeChat Chat (1:1)' },
  'card-square': { width: 420, height: 420, label: 'Square (1:1)' },
  // Portrait
  'instagram-story': { width: 1080, height: 1920, label: 'Instagram Story (9:16)' },
  'xiaohongshu': { width: 1242, height: 1656, label: 'Xiaohongshu (3:4)' },
  // Landscape — social OG (≈1.91:1)
  'twitter': { width: 1200, height: 628, label: 'Twitter Card (1200×628)' },
  'og': { width: 1200, height: 630, label: 'Open Graph (1200×630)' },
  'linkedin': { width: 1200, height: 627, label: 'LinkedIn (1200×627)' },
  'facebook': { width: 1200, height: 630, label: 'Facebook (1200×630)' },
  'whatsapp': { width: 800, height: 418, label: 'WhatsApp (800×418)' },
  // Landscape — other
  'wechat': { width: 900, height: 500, label: 'WeChat Moments (9:5)' },
  'card-wide': { width: 600, height: 338, label: 'Wide Card (16:9)' },
  // Tall card (default)
  'card': { width: 420, height: 540, label: 'Card (7:9)' },
  // Long-form: fixed width, content-driven height
  'card-long': { width: 640, height: 'auto', label: 'Long card (auto height)' },
};

/**
 * Resolve a preset (or a {width, height} object) to numbers.
 * An `'auto'`/missing height resolves to `null`, meaning "grow with content".
 *
 * @param {string|{width: number, height?: number|'auto'}} preset
 * @returns {{width: number, height: number|null, label?: string}}
 */
export function getPresetSize(preset) {
  if (preset && typeof preset === 'object' && preset.width) {
    const height = preset.height === 'auto' || preset.height == null ? null : preset.height;
    return { width: preset.width, height, label: preset.label };
  }
  const found = presets[preset] || presets.card;
  return {
    width: found.width,
    height: found.height === 'auto' ? null : found.height,
    label: found.label,
  };
}

export { downloadBlob, SHARE_TOO_LONG, isTooLong, DEFAULT_MAX_PIXELS };

function unsupportedEngineMessage() {
  return [
    'share-kit: no html2canvas engine available.',
    "0.1.x fetched html2canvas from a CDN, which broke sharing whenever that CDN was unreachable.",
    'Bundle it instead:',
    '  npm install html2canvas',
    "  import { html2canvasCapture } from '@touchskyer/share-kit/backends/html2canvas';",
    "  await exportToImage(el, { capture: html2canvasCapture() });",
    'Or keep the zero-dependency engine (the default) and install nothing.',
  ].join('\n');
}

async function toBlob(result, { format, quality }) {
  if (!result) throw new Error('share-kit: capture returned nothing');
  if (typeof result === 'object' && typeof result.arrayBuffer === 'function' && result.type) {
    return result;  // already a Blob/File
  }
  // An HTMLCanvasElement (what html2canvas returns) or an ImageBitmap-ish source.
  const canvas = typeof result.getContext === 'function' ? result : null;
  if (!canvas) throw new Error('share-kit: capture must return a Blob or a canvas');
  if (format === 'png') {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('share-kit: canvas encoding failed'))), 'image/png');
    });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('share-kit: canvas encoding failed'))), `image/${format}`, quality);
  });
}

async function convertFormat(blob, format, quality) {
  if (format === 'png' || !blob || blob.type === `image/${format}`) return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (next) => (next ? resolve(next) : reject(new Error('share-kit: format conversion failed'))),
      `image/${format}`,
      quality,
    );
  });
}

/**
 * Export a DOM element to an image blob.
 *
 * @param {HTMLElement} element
 * @param {object} [options]
 * @param {string|object} [options.preset='card'] - preset name or {width, height}
 * @param {number} [options.width] - explicit width; defaults to the preset (or the element)
 * @param {number} [options.height] - explicit height (implies clipping to that frame)
 * @param {number} [options.scale=2] - sampling ratio (alias: pixelRatio)
 * @param {string} [options.format='png'] - 'png' | 'jpeg' | 'webp'
 * @param {number} [options.quality=0.92] - for jpeg/webp
 * @param {string|null} [options.background=null] - canvas fill; null keeps transparency
 * @param {'grow'|'clip'} [options.overflow='grow'] - 'grow' keeps tall content, 'clip' cuts it
 * @param {number} [options.maxPixels=32e6] - canvas area budget
 * @param {string} [options.backend='auto'] - accepted for compatibility; the zero-dep engine is used unless `capture` is given
 * @param {Function} [options.capture] - (element, resolved) => Promise<Blob|HTMLCanvasElement>
 * @param {Function} [options.html2canvas] - legacy: a preloaded html2canvas function
 * @param {string} [options.html2canvasUrl] - removed in 0.2.0 (throws)
 * @returns {Promise<Blob>}
 */
export async function exportToImage(element, options = {}) {
  const {
    preset = 'card',
    width: explicitWidth,
    height: explicitHeight,
    scale = 2,
    pixelRatio,
    format = 'png',
    quality = 0.92,
    background = null,
    overflow = 'grow',
    maxPixels = DEFAULT_MAX_PIXELS,
    capture,
    html2canvas: legacyHtml2Canvas,
    html2canvasUrl,
    backend = 'auto',
  } = options;

  if (html2canvasUrl) {
    throw new Error(
      'share-kit: `html2canvasUrl` was removed in 0.2.0 — share-kit no longer loads an export engine from a CDN.\n'
      + unsupportedEngineMessage(),
    );
  }

  const engine = capture
    || legacyHtml2Canvas
    || (backend === 'html2canvas' && typeof window !== 'undefined' ? window.html2canvas : null);

  if (backend === 'html2canvas' && !engine) throw new Error(unsupportedEngineMessage());
  if (backend !== 'auto' && backend !== 'foreignObject' && backend !== 'html2canvas' && !engine) {
    throw new Error(`share-kit: unknown backend "${backend}" — pass a \`capture\` function instead.`);
  }

  const size = getPresetSize(preset);
  const targetWidth = Math.ceil(explicitWidth || size.width || element.offsetWidth || 0);
  if (!targetWidth) throw new Error('share-kit: element has no measurable width');

  // Height contract:
  //   explicit height            → exact frame (content may be clipped)
  //   overflow:'clip' + preset   → exact preset frame (0.1.x behaviour, opt-in)
  //   otherwise                  → grow with content, preset height as the floor
  let exactHeight = null;
  let minHeight = 0;
  if (explicitHeight) {
    exactHeight = explicitHeight;
  } else if (size.height) {
    if (overflow === 'clip') exactHeight = size.height;
    else minHeight = size.height;
  }

  const ratio = pixelRatio || scale || 2;
  const common = {
    width: targetWidth,
    height: exactHeight,
    minHeight,
    pixelRatio: ratio,
    maxPixels,
    background,
  };

  if (engine) {
    const canvas = await engine(element, { ...common, format, quality, pixelRatio: ratio });
    return toBlob(canvas, { format, quality });
  }

  try {
    const shot = await renderNodeToPng(element, { ...common, format: 'png' });
    return await convertFormat(shot.blob, format, quality);
  } catch (error) {
    if (isTooLong(error)) throw error;
    throw error;
  }
}
