// rasterize.js — DOM → PNG with zero dependencies.
//
// Why this engine exists next to the html2canvas path:
//
//   1. **Fidelity.** html2canvas re-implements a layout engine. Flex alignment,
//      border-radius, letter-spacing, CSS gradients, webfonts and CJK line
//      breaking are all things it approximates. This engine clones the node,
//      inlines every element's *computed* style, then hands the result to
//      <svg><foreignObject> and lets the browser paint it — so the output is the
//      layout the user actually saw, not a re-derivation of it.
//   2. **No network.** The previous export path fetched html2canvas from a CDN at
//      capture time, so an unreachable CDN (corporate proxy, mainland China,
//      offline PWA) meant sharing silently failed. This path loads nothing.
//   3. **Variable height.** Long-form output (a transcript, a changelog, a whole
//      document) is not a fixed aspect ratio. Presets here can declare
//      `height: 'auto'` and the canvas grows to the content instead of clipping.
//
// Known boundaries, all handled explicitly below:
//
//   1. Computed styles do not include pseudo-elements (::before/::after), so a
//      card must not draw content with them. (Decorative pseudo-elements that
//      only paint a background are also lost — use a real element.)
//   2. Stylesheets do not cascade into the SVG document, which is why every
//      element's computed style is written inline (see COPIED_PROPERTIES).
//   3. Fonts: an SVG loaded as an image is its own document and cannot see the
//      page's @font-face rules. Text therefore lands on the system stack unless
//      the caller embeds a font itself. We still await document.fonts.ready so a
//      late font swap cannot change the height we measured.
//   4. <img> must be a data: URI, otherwise the isolated document fails to load
//      it and paints nothing. Images are converted; ones that cannot be fetched
//      are hidden rather than left as broken frames.
//   5. Canvas area is capped by the browser (Safari ≈ 16M px, Chrome 16384px per
//      side). We downscale first and throw TOO_LONG when even 1× would not fit —
//      a caller can catch that and ask the user to select less content.
//   6. Transparent regions stay transparent. The `background` option decides what
//      the canvas is filled with; keep it null for drop-shadowed cards, set a
//      solid colour for documents (a transparent long image pasted into a dark
//      chat client is unreadable).

export const DEFAULT_MAX_PIXELS = 32e6;

// 1×1 transparent PNG, used to disarm an <img> whose source could not be inlined.
const TRANSPARENT_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';   // ≈ 16M (Safari) with headroom for Chrome
const DEFAULT_PIXEL_RATIO = 2;

/**
 * Error code thrown when the requested capture cannot fit in one canvas.
 * @type {string}
 */
export const SHARE_TOO_LONG = 'TOO_LONG';

/** @param {unknown} error */
export function isTooLong(error) {
  return Boolean(error && typeof error === 'object' && error.code === SHARE_TOO_LONG);
}

// Computed style properties carried from the page into the SVG.
//
// These MUST be kebab-case: getPropertyValue() takes CSS property names, and
// passing camelCase ('fontSize', 'alignItems') silently returns an empty string.
// That failure mode is worth spelling out because it is invisible in code review
// and only shows up in the rendered image: every multi-word property is dropped,
// so font-size falls back to 16px, border-radius disappears, and flex alignment
// collapses to the start edge — with no error anywhere. There is a regression
// test for exactly this in tests/rasterize.spec.js ("keeps every copied computed
// style").
const COPIED_PROPERTIES = [
  'align-items', 'align-self',
  'background', 'background-color', 'background-image', 'background-position',
  'background-repeat', 'background-size',
  'border', 'border-bottom', 'border-bottom-left-radius', 'border-bottom-right-radius',
  'border-collapse', 'border-left', 'border-radius', 'border-right', 'border-spacing',
  'border-top', 'border-top-left-radius', 'border-top-right-radius',
  'box-shadow', 'box-sizing',
  'color', 'column-gap', 'display',
  'flex-basis', 'flex-direction', 'flex-grow', 'flex-shrink', 'flex-wrap',
  'font-family', 'font-size', 'font-style', 'font-variant', 'font-weight',
  'gap', 'height', 'justify-content',
  'letter-spacing', 'line-height', 'list-style-position', 'list-style-type',
  'margin', 'margin-bottom', 'margin-left', 'margin-right', 'margin-top',
  'max-height', 'max-width', 'min-height', 'min-width',
  'object-fit', 'opacity', 'overflow', 'overflow-wrap',
  'padding', 'padding-bottom', 'padding-left', 'padding-right', 'padding-top',
  'row-gap', 'text-align', 'text-decoration', 'text-indent', 'text-overflow',
  'text-transform', 'vertical-align', 'white-space', 'width', 'word-break',
];

// 'auto' is a legal value for these, but writing it back is pointless and would
// fight the explicit width/height the wrapper imposes on the capture root.
const AUTO_SKIPPABLE = new Set(['width', 'height', 'min-width', 'min-height']);

function tooLongError(message) {
  const error = new Error(message || 'share-kit: content is too large for a single canvas');
  error.code = SHARE_TOO_LONG;
  return error;
}

function copyComputedStyles(sourceRoot, targetRoot) {
  const sources = [sourceRoot, ...sourceRoot.querySelectorAll('*')];
  const targets = [targetRoot, ...targetRoot.querySelectorAll('*')];
  if (sources.length !== targets.length) {
    throw new Error('share-kit: clone tree does not match source tree');
  }
  for (let i = 0; i < sources.length; i += 1) {
    const computed = window.getComputedStyle(sources[i]);
    const parts = [];
    for (const prop of COPIED_PROPERTIES) {
      const value = computed.getPropertyValue(prop);
      if (!value) continue;
      if (value === 'auto' && AUTO_SKIPPABLE.has(prop)) continue;
      // url() backgrounds cannot be loaded inside the isolated SVG document.
      if (prop === 'background-image' && value.includes('url(')) continue;
      parts.push(`${prop}:${value}`);
    }
    targets[i].setAttribute('style', parts.join(';'));
  }
}

function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('share-kit: image read failed'));
    reader.readAsDataURL(blob);
  });
}

async function fetchAsDataUrl(url) {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error(`share-kit: image ${response.status}`);
  return readAsDataUrl(await response.blob());
}

function decodeImage(node) {
  // data: URIs still need a decode tick; SVG rasterization does not wait for them.
  if (typeof node.decode === 'function') return node.decode().catch(() => {});
  return Promise.resolve();
}

async function inlineImages(sourceRoot, targetRoot) {
  const sources = sourceRoot.querySelectorAll('img');
  const targets = targetRoot.querySelectorAll('img');
  for (let i = 0; i < sources.length; i += 1) {
    const src = sources[i].currentSrc || sources[i].getAttribute('src') || '';
    if (!src) continue;
    if (src.startsWith('data:')) {
      await decodeImage(sources[i]);
      continue;
    }
    try {
      targets[i].setAttribute('src', await fetchAsDataUrl(src));
    } catch {
      // Hiding beats a broken-image frame burned into a shared image — and the src
      // is replaced too, so the isolated document does not keep requesting a URL
      // that already failed.
      targets[i].setAttribute('src', TRANSPARENT_PIXEL);
      const holder = targets[i].closest('figure, .sk-images, .sk-image') || targets[i];
      holder.setAttribute('style', `${holder.getAttribute('style') || ''};display:none`);
    }
  }
}

/**
 * Mount a styled clone off-screen at a fixed width so it can be measured.
 *
 * visibility:hidden (not display:none) keeps layout running, and the host is
 * pushed far off-screen and made inert, so the user never sees the capture
 * stage — the old export path resized the *live* element instead, which flashed
 * a layout change in front of the user and raced with any render in flight.
 *
 * @returns {HTMLElement} the host element; remove it when done.
 */
function mountOffscreen(stage) {
  const host = document.createElement('div');
  host.setAttribute('data-share-kit-stage', '');
  host.style.cssText = [
    'position:fixed',
    'left:-100000px',
    'top:0',
    'visibility:hidden',
    'pointer-events:none',
    'z-index:-1',
    'contain:layout style',
  ].join(';');
  host.appendChild(stage);
  document.body.appendChild(host);
  return host;
}

/**
 * Build the capture stage: a styled clone held at `width`, measured for height.
 *
 * @returns {Promise<{stage: HTMLElement, clone: HTMLElement, height: number, cleanup: () => void}>}
 */
async function prepareStage(node, { width, minHeight = 0, height = null }) {
  if (!node) throw new Error('share-kit: no node to capture');
  const targetWidth = Math.ceil(width || node.offsetWidth || node.scrollWidth || 0);
  if (!targetWidth) throw new Error('share-kit: node has no measurable width');

  const clone = node.cloneNode(true);
  copyComputedStyles(node, clone);
  await inlineImages(node, clone);

  // The requested width wins over whatever the live node happens to be: presets
  // exist precisely so the same markup can be exported at several sizes.
  //
  // minHeight is applied to the clone itself (not just to the measuring stage) so
  // a card stretches to the preset frame the way 0.1.x did, instead of leaving a
  // transparent band under content that is shorter than the preset.
  const rootRules = ['margin:0', 'max-width:none', `width:${targetWidth}px`];
  if (minHeight) rootRules.push(`min-height:${Math.round(minHeight)}px`);
  clone.setAttribute('style', `${clone.getAttribute('style') || ''};${rootRules.join(';')}`);

  const stage = document.createElement('div');
  stage.style.cssText = minHeight
    ? `width:${targetWidth}px;min-height:${Math.round(minHeight)}px;margin:0;padding:0`
    : `width:${targetWidth}px;margin:0;padding:0`;
  stage.appendChild(clone);

  const host = mountOffscreen(stage);
  const measured = height || Math.max(
    Math.ceil(clone.scrollHeight || 0),
    Math.ceil(clone.offsetHeight || 0),
    minHeight,
  );

  return {
    stage,
    clone,
    width: targetWidth,
    height: measured,
    cleanup() { host.remove(); },
  };
}

function svgDataUrl(svg) {
  // encodeURIComponent, not btoa: cards are full of non-Latin-1 text and btoa
  // throws on it.
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('share-kit: SVG rasterization failed'));
    image.src = src;
  });
}

function canvasToBlob(canvas, format = 'png', quality = 0.92) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('share-kit: canvas encoding failed (canvas may be tainted)'));
    }, `image/${format}`, quality);
  });
}

/**
 * Measure a node and pick a sampling ratio that fits the canvas budget.
 *
 * @param {HTMLElement} node
 * @param {{pixelRatio?: number, maxPixels?: number}} [options]
 * @returns {{width: number, height: number, ratio: number}}
 */
export function measureNode(node, options = {}) {
  const { pixelRatio = DEFAULT_PIXEL_RATIO, maxPixels = DEFAULT_MAX_PIXELS } = options;
  const width = Math.ceil(node.offsetWidth || node.scrollWidth || 0);
  const height = Math.ceil(Math.max(node.offsetHeight || 0, node.scrollHeight || 0));
  return { width, height, ratio: pickRatio(width, height, pixelRatio, maxPixels) };
}

function pickRatio(width, height, pixelRatio, maxPixels) {
  const pixels = Math.max(1, width * height);
  if (pixels > maxPixels) throw tooLongError();
  const ratio = Math.min(pixelRatio, Math.sqrt(maxPixels / pixels));
  // One decimal is plenty; 1.9374× is noise, not precision.
  return Math.max(1, Math.round(ratio * 10) / 10);
}

function wrapSvg(clone, { width, height, background }) {
  const bg = background ? `background:${background};` : '';
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"`,
    ` viewBox="0 0 ${width} ${height}">`,
    `<foreignObject x="0" y="0" width="${width}" height="${height}">`,
    // xmlns belongs on this inner div: the HTML fragment lives in the XHTML
    // namespace even though its container is SVG (Safari enforces it).
    `<div xmlns="http://www.w3.org/1999/xhtml" style="margin:0;padding:0;`,
    `width:${width}px;height:${height}px;${bg}overflow:${height ? 'hidden' : 'visible'};">`,
    new XMLSerializer().serializeToString(clone),
    '</div></foreignObject></svg>',
  ].join('');
}

/**
 * Serialize a node into an SVG image source (clone → inline styles → inline images).
 *
 * Split out from rendering because this half is *assertable*: rasterization can
 * only be judged by a browser, but "did the clone keep the page's computed
 * styles" is a pure string question — and it is the half that silently breaks.
 *
 * @param {HTMLElement} node
 * @param {{width?: number, height?: number, minHeight?: number, background?: string|null}} [options]
 * @returns {Promise<{svg: string, width: number, height: number, clone: HTMLElement, cleanup: () => void}>}
 */
export async function buildShareSvg(node, options = {}) {
  const { background = null } = options;
  await waitForFonts();
  const stage = await prepareStage(node, options);
  try {
    const svg = wrapSvg(stage.clone, {
      width: stage.width,
      height: stage.height,
      background,
    });
    return { svg, width: stage.width, height: stage.height, clone: stage.clone, cleanup: stage.cleanup };
  } catch (error) {
    stage.cleanup();
    throw error;
  }
}

async function waitForFonts() {
  if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
    await document.fonts.ready.catch(() => {});
  }
}

/**
 * Rasterize a DOM node to a PNG blob using the browser's own paint pipeline.
 *
 * @param {HTMLElement} node
 * @param {object} [options]
 * @param {number} [options.width] - capture width (defaults to the node's own width)
 * @param {number|null} [options.height] - exact height (clips content); omit to grow with content
 * @param {number} [options.minHeight] - grow-with-content floor, e.g. a preset height
 * @param {number} [options.pixelRatio=2] - sampling ratio; auto-reduced to fit maxPixels
 * @param {number} [options.maxPixels=32e6] - canvas area budget
 * @param {string|null} [options.background=null] - canvas fill; null keeps transparency
 * @param {string} [options.format='png'] - 'png' | 'jpeg' | 'webp'
 * @param {number} [options.quality=0.92] - for jpeg/webp
 * @returns {Promise<{blob: Blob, width: number, height: number, ratio: number, pixelWidth: number, pixelHeight: number}>}
 *   width/height are CSS pixels; pixelWidth/pixelHeight are the bitmap size.
 *   Throws an error with `code === SHARE_TOO_LONG` when the content cannot fit.
 */
export async function renderNodeToPng(node, options = {}) {
  const {
    pixelRatio = DEFAULT_PIXEL_RATIO,
    maxPixels = DEFAULT_MAX_PIXELS,
    background = null,
    format = 'png',
    quality = 0.92,
  } = options;

  await waitForFonts();
  const stage = await prepareStage(node, options);
  try {
    const ratio = pickRatio(stage.width, stage.height, pixelRatio, maxPixels);
    const svg = wrapSvg(stage.clone, {
      width: stage.width,
      height: stage.height,
      background,
    });

    const image = await loadImage(svgDataUrl(svg));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(stage.width * ratio));
    canvas.height = Math.max(1, Math.round(stage.height * ratio));
    const ctx = canvas.getContext('2d');
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    return {
      blob: await canvasToBlob(canvas, format, quality),
      width: stage.width,
      height: stage.height,
      ratio,
      pixelWidth: canvas.width,
      pixelHeight: canvas.height,
    };
  } finally {
    stage.cleanup();
  }
}
