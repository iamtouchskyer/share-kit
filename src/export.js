// export.js — DOM → canvas → PNG pipeline
// Lazy-loads html2canvas from CDN (same pattern as memex)

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
 * Export a DOM element to a PNG blob.
 * @param {HTMLElement} element - The element to capture
 * @param {object} options - { scale, format, quality, html2canvasUrl, fixedWidth }
 * @returns {Promise<Blob>}
 */
export async function exportToImage(element, options = {}) {
  const {
    scale = 2,
    format = 'png',
    quality = 0.92,
    html2canvasUrl,
    fixedWidth = 420,
  } = options;

  // Fix width for consistent export
  const origWidth = element.style.width;
  if (fixedWidth) element.style.width = fixedWidth + 'px';

  const h2c = await lazyLoadHtml2Canvas(html2canvasUrl);
  const canvas = await h2c(element, {
    scale,
    useCORS: true,
    backgroundColor: null,
  });

  if (fixedWidth) element.style.width = origWidth;

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
