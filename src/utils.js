// utils.js — shared browser helpers (no dependencies)

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Copy text to clipboard with a fallback for older/non-secure contexts.
 * @param {string} text
 * @returns {Promise<boolean>} whether the copy is believed to have succeeded
 */
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Whether the async clipboard can accept an image (Chrome/Edge/Safari, secure context). */
export function canCopyImage() {
  return Boolean(
    typeof window !== 'undefined'
    && window.ClipboardItem
    && navigator.clipboard
    && navigator.clipboard.write,
  );
}

/**
 * Copy an image blob to the clipboard so it can be pasted straight into a chat
 * client or a document. Throws with a descriptive message when the browser cannot
 * do it — callers should offer a download instead.
 *
 * @param {Blob} blob
 * @param {string} [mimeType='image/png']
 */
export async function copyImageToClipboard(blob, mimeType = 'image/png') {
  if (!canCopyImage()) {
    throw new Error('share-kit: this browser cannot copy images to the clipboard — offer a download instead');
  }
  await navigator.clipboard.write([new window.ClipboardItem({ [mimeType]: blob })]);
}

/**
 * Trigger a file download for a blob.
 * @param {Blob} blob
 * @param {string} [filename='share-card.png']
 */
export function downloadBlob(blob, filename = 'share-card.png') {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Delay revoke: Safari needs the URL alive while the download starts.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/**
 * Build a filename from a brand/app name plus an optional identifier.
 * @param {string} [name='share']
 * @param {{id?: string|number, date?: Date, ext?: string}} [options]
 */
export function buildFilename(name = 'share', options = {}) {
  const { id, date = new Date(), ext = 'png' } = options;
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
  ].join('');
  const slug = String(name).trim().replace(/\s+/g, '-').toLowerCase() || 'share';
  return [slug, id, stamp].filter(Boolean).join('-') + `.${ext}`;
}
