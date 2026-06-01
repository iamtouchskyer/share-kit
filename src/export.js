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
 * Platform presets — predefined sizes for social media / messaging.
 * Each defines width (px) and aspect ratio.
 * Height is calculated from width * ratio.
 */
export const presets = {
  // Square formats
  'instagram-post': { width: 1080, ratio: 1, label: 'Instagram Post (1:1)' },
  'instagram-story': { width: 1080, ratio: 16 / 9, label: 'Instagram Story (9:16)', portrait: true },
  // Wide formats
  'twitter': { width: 1200, ratio: 1200 / 628, label: 'Twitter Card (1.91:1)' },
  'og': { width: 1200, ratio: 1200 / 630, label: 'Open Graph (1.91:1)' },
  'linkedin': { width: 1200, ratio: 1200 / 627, label: 'LinkedIn Post (1.91:1)' },
  'facebook': { width: 1200, ratio: 1200 / 630, label: 'Facebook Share (1.91:1)' },
  // Messaging / mobile
  'wechat': { width: 900, ratio: 900 / 500, label: 'WeChat Moments (9:5)' },
  'wechat-chat': { width: 600, ratio: 1, label: 'WeChat Chat (1:1)' },
  'whatsapp': { width: 800, ratio: 800 / 418, label: 'WhatsApp Preview (1.91:1)' },
  // Compact
  'card': { width: 420, ratio: 420 / 540, label: 'Standard Card (7:9)' },
  'card-wide': { width: 600, ratio: 600 / 340, label: 'Wide Card (16:9)' },
  'card-square': { width: 420, ratio: 1, label: 'Square Card (1:1)' },
  // Custom override — user provides exact width+height
  'custom': { width: 420, ratio: null, label: 'Custom' },
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
  const width = p.width;
  const height = p.portrait ? width * p.ratio : Math.round(width / p.ratio);
  return { width, height };
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
