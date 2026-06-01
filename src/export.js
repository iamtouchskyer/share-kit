// export.js — DOM → canvas → PNG pipeline
// Lazy-loads html2canvas from CDN (same pattern as memex)
// Supports platform presets with predefined aspect ratios

let html2canvasPromise = null;

function lazyLoadHtml2Canvas(cdnUrl) {
  if (typeof window !== 'undefined' && window.html2canvas) {
    return Promise.resolve(window.html2canvas);
  }
  if (html2canvasPromise) return html2canvasPromise;
  html2canvasPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = cdnUrl || 'https://cdn.jsdelivr.net/npm/html2canvas@1/dist/html2canvas.min.js';
    s.onload = () => resolve(window.html2canvas);
    s.onerror = () => reject(new Error('Failed to load html2canvas'));
    document.head.appendChild(s);
  });
  return html2canvasPromise;
}

/**
 * Platform presets — predefined export sizes for social media / messaging.
 * Each defines exact width × height in pixels.
 */
export const presets = {
  // Square
  'instagram-post': { width: 1080, height: 1080, label: 'Instagram Post (1:1)' },
  'wechat-chat': { width: 600, height: 600, label: 'WeChat Chat (1:1)' },
  'card-square': { width: 420, height: 420, label: 'Square (1:1)' },
  // Portrait
  'instagram-story': { width: 1080, height: 1920, label: 'Instagram Story (9:16)' },
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
};

/**
 * Get dimensions for a preset.
 * @param {string|object} preset - preset name or { width, height } object
 * @returns {{ width: number, height: number }}
 */
export function getPresetSize(preset) {
  if (typeof preset === 'object' && preset.width && preset.height) {
    return { width: preset.width, height: preset.height };
  }
  const p = presets[preset] || presets['card'];
  return { width: p.width, height: p.height };
}

/**
 * Export a DOM element to a PNG blob.
 * @param {HTMLElement} element - The element to capture
 * @param {object} options
 * @param {number} options.scale - DPI scale (default 2)
 * @param {string} options.format - 'png' | 'jpeg' | 'webp'
 * @param {number} options.quality - JPEG/WebP quality (0-1)
 * @param {string} options.html2canvasUrl - custom CDN URL
 * @param {string|object} options.preset - platform preset name or { width, height }
 * @param {number} options.width - explicit width override (px)
 * @param {number} options.height - explicit height override (px)
 * @returns {Promise<Blob>}
 */
export async function exportToImage(element, options = {}) {
  const {
    scale = 2,
    format = 'png',
    quality = 0.92,
    html2canvasUrl,
    preset = 'card',
    width: explicitWidth,
    height: explicitHeight,
  } = options;

  // Resolve dimensions
  let targetWidth, targetHeight;
  if (explicitWidth) {
    targetWidth = explicitWidth;
    targetHeight = explicitHeight || null; // null = auto height
  } else {
    const size = getPresetSize(preset);
    targetWidth = size.width;
    targetHeight = size.height;
  }

  // Apply fixed dimensions for capture
  const origWidth = element.style.width;
  const origHeight = element.style.height;
  const origMinHeight = element.style.minHeight;
  const origOverflow = element.style.overflow;

  element.style.width = targetWidth + 'px';
  if (targetHeight) {
    element.style.minHeight = targetHeight + 'px';
    element.style.overflow = 'hidden';
  }

  const h2c = await lazyLoadHtml2Canvas(html2canvasUrl);
  const canvas = await h2c(element, {
    scale,
    useCORS: true,
    backgroundColor: null,
    width: targetWidth,
    height: targetHeight || undefined,
  });

  // Restore
  element.style.width = origWidth;
  element.style.height = origHeight;
  element.style.minHeight = origMinHeight;
  element.style.overflow = origOverflow;

  return new Promise((resolve) => {
    canvas.toBlob(resolve, `image/${format}`, quality);
  });
}

/**
 * Download a blob as a file.
 */
export function downloadBlob(blob, filename = 'share-card.png') {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
