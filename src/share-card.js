// share-card.js — Framework-agnostic share card component
// Zero dependencies. Follows memex createShareCard() pattern.
// Factory function returns controller object with render/setTheme/export/destroy.

import { resolveTheme, themes } from './themes.js';
import { exportToImage, downloadBlob, presets, getPresetSize } from './export.js';
import { escapeHtml, copyToClipboard } from './utils.js';

const STYLES = `
.sk-root { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
.sk-picker { display: flex; gap: 8px; margin-top: 16px; justify-content: center; flex-wrap: wrap; }
.sk-thumb-wrap {
  display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer;
  /* button reset — the thumbs are real buttons so they are reachable by keyboard */
  background: none; border: 0; padding: 2px; font: inherit; color: inherit; border-radius: 8px;
}
.sk-thumb-wrap:focus-visible { outline: 2px solid #007aff; outline-offset: 2px; }
.sk-btn:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
.sk-thumb {
  width: 48px; height: 36px; border-radius: 6px; padding: 5px; cursor: pointer;
  border: 2px solid transparent; transition: border-color 0.15s, transform 0.15s;
  display: flex; flex-direction: column; gap: 2px; box-sizing: border-box;
}
.sk-thumb:hover { transform: scale(1.08); }
.sk-thumb.active { border-color: #007aff; }
.sk-thumb-label { font-size: 10px; color: #565659; font-weight: 500; text-align: center; }
.sk-card {
  max-width: 420px; width: 100%; border-radius: 16px; overflow: hidden;
  box-shadow: 0 8px 32px rgba(0,0,0,0.12);
  display: flex; flex-direction: column;
}
.sk-card-inner {
  padding: 30px; overflow-wrap: break-word;
  flex: 1; display: flex; flex-direction: column; justify-content: center;
}
.sk-emoji { font-size: 48px; text-align: center; margin-bottom: 12px; }
.sk-title { font-size: 24px; font-weight: 700; text-align: center; line-height: 1.4; margin-bottom: 8px; }
.sk-subtitle { font-size: 14px; text-align: center; margin-bottom: 16px; }
.sk-stats { display: flex; justify-content: center; gap: 24px; margin-bottom: 16px; }
.sk-stat { text-align: center; }
.sk-stat-value { font-size: 28px; font-weight: 700; }
.sk-stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
.sk-divider { height: 1px; margin: 16px 0; }
.sk-footer { display: flex; justify-content: space-between; align-items: center; }
.sk-tagline { font-size: 11px; }
.sk-brand { font-size: 12px; font-weight: 600; }
.sk-actions { display: flex; gap: 8px; justify-content: center; margin-top: 16px; }
.sk-btn {
  padding: 8px 20px; border: none; border-radius: 8px;
  font-size: 13px; font-weight: 600; cursor: pointer;
  font-family: inherit; transition: all 0.15s;
}
.sk-btn.primary { background: #0071e3; color: #fff; }   /* white on #0071e3 = 4.7:1 */
.sk-btn.primary:hover { background: #0060c4; }
.sk-btn.secondary { background: rgba(0,0,0,0.06); color: #4a4a4d; }
.sk-btn.secondary:hover { background: rgba(0,0,0,0.1); }
`;


function buildSkeleton(t) {
  const barColor = t.isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.12)';
  return `
    <div style="width:50%;height:3px;background:${barColor};border-radius:1px;margin-bottom:3px"></div>
    <div style="width:100%;height:2px;background:${barColor};border-radius:1px;margin-bottom:2px"></div>
    <div style="width:80%;height:2px;background:${barColor};border-radius:1px"></div>
  `;
}

/**
 * createShareCard — factory function for share card component.
 *
 * @param {HTMLElement} container - DOM element to render into
 * @param {object} config
 * @param {object} config.branding - { name, domain, tagline?, logo? }
 * @param {object} config.content - { type, title, subtitle?, emoji?, stats?: [{value, label}] }
 * @param {string|object} config.theme - theme name or custom theme object
 * @param {string|object} config.preset - platform preset name or { width, height }
 * @param {object} config.actions - { buildShareUrl?, onCopyLink?, onExport?, onTwitter? }
 * @param {function} config.contentRenderer - (content) => HTMLString (⚠️ MUST return sanitized HTML — output is used as innerHTML)
 * @param {boolean} config.readonly - if true, skip picker/actions (for public embed views)
 * @returns {{ render, setTheme, setContent, exportImage, destroy }}
 */
export function createShareCard(container, config = {}) {
  const {
    branding = { name: 'App', domain: 'example.com' },
    content = {},
    theme: initialTheme = 'light',
    preset: initialPreset = 'card',
    actions = {},
    contentRenderer = null,
    readonly = false,
  } = config;

  let currentTheme = resolveTheme(initialTheme);
  let currentThemeName = typeof initialTheme === 'string' ? initialTheme : 'light';
  let currentContent = { ...content };
  let currentPreset = initialPreset;

  // Inject styles once
  if (!document.getElementById('sk-share-styles')) {
    const style = document.createElement('style');
    style.id = 'sk-share-styles';
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  function renderCard() {
    const t = currentTheme;
    const size = getPresetSize(currentPreset);
    const bgStyle = `background:${t.cardBg}`;
    // A preset with height:'auto' (long-form) has no floor height — emitting
    // `min-height:nullpx` would be invalid and silently ignored by the browser.
    const sizeStyle = size.height
      ? `max-width:${size.width}px;min-height:${size.height}px`
      : `max-width:${size.width}px`;

    let bodyHtml;
    if (contentRenderer) {
      bodyHtml = contentRenderer(currentContent);
    } else {
      const emoji = currentContent.emoji ? `<div class="sk-emoji">${escapeHtml(currentContent.emoji)}</div>` : '';
      const title = currentContent.title ? `<div class="sk-title" style="color:${t.text}">${escapeHtml(currentContent.title)}</div>` : '';
      const subtitle = currentContent.subtitle ? `<div class="sk-subtitle" style="color:${t.secondary}">${escapeHtml(currentContent.subtitle)}</div>` : '';
      const stats = (currentContent.stats || []).map(s =>
        `<div class="sk-stat"><div class="sk-stat-value" style="color:${t.accent}">${escapeHtml(s.value)}</div><div class="sk-stat-label" style="color:${t.secondary}">${escapeHtml(s.label)}</div></div>`
      ).join('');
      const statsHtml = stats ? `<div class="sk-stats">${stats}</div>` : '';
      bodyHtml = `${emoji}${title}${subtitle}${statsHtml}`;
    }

    return `
      <div class="sk-card" style="${bgStyle};border:1px solid ${t.cardBorder};${sizeStyle};${t.cardShadow ? `box-shadow:${t.cardShadow}` : ''}">
        <div class="sk-card-inner">
          ${bodyHtml}
          <div class="sk-divider" style="background:${t.cardBorder}"></div>
          <div class="sk-footer">
            <span class="sk-tagline" style="color:${t.brand}">${escapeHtml(branding.tagline || branding.domain)}</span>
            <span class="sk-brand" style="color:${t.brand}">${escapeHtml(branding.name)}</span>
          </div>
        </div>
      </div>
    `;
  }

  function renderPicker() {
    let html = '<div class="sk-picker">';
    for (const [key, t] of Object.entries(themes)) {
      const needsBorder = !t.isDark && !t.cardBg.includes('gradient');
      const borderStyle = needsBorder ? 'border:1px solid rgba(0,0,0,0.1);' : '';
      const pressed = key === currentThemeName;
      html += `<button type="button" class="sk-thumb-wrap" data-theme="${key}" aria-pressed="${pressed}"><span class="sk-thumb${pressed ? ' active' : ''}" data-theme="${key}" style="background:${t.cardBg};${borderStyle}">${buildSkeleton(t)}</span><span class="sk-thumb-label">${t.name}</span></button>`;
    }
    html += '</div>';
    return html;
  }

  function renderPresetPicker() {
    // Keep long-form and CN-platform presets reachable from the UI, not just from
    // the API — a preset nobody can click is a preset that does not exist.
    const common = [
      'card', 'card-long', 'card-square', 'card-wide',
      'twitter', 'instagram-post', 'wechat', 'xiaohongshu',
    ];
    let html = '<div class="sk-picker" style="margin-top:8px">';
    for (const key of common) {
      const p = presets[key];
      if (!p) continue;
      const active = key === currentPreset ? ' active' : '';
      const ratio = `${p.width}×${p.height === 'auto' ? 'auto' : p.height}`;
      const shortLabel = key.replace('card-', '').replace('instagram-', 'ig-');
      html += `<button type="button" class="sk-thumb-wrap" data-preset="${key}" aria-pressed="${key === currentPreset}" aria-label="${escapeHtml(p.label || key)}"><span class="sk-thumb${active}" data-preset="${key}" style="background:#f0f0f0;border:1px solid rgba(0,0,0,0.1);justify-content:center;align-items:center;font-size:7px;color:#666">${ratio}</span><span class="sk-thumb-label">${shortLabel}</span></button>`;
    }
    html += '</div>';
    return html;
  }

  function render() {
    const cardHtml = renderCard();
    if (readonly) {
      container.innerHTML = `<div class="sk-root">${cardHtml}</div>`;
      return;
    }
    const pickerHtml = renderPicker();
    const presetHtml = renderPresetPicker();
    const actionsHtml = `<div class="sk-actions">
      ${actions.onCopyLink ? '<button class="sk-btn secondary" data-action="copy">Copy Link</button>' : ''}
      ${actions.onTwitter ? '<button class="sk-btn secondary" data-action="twitter">Twitter</button>' : ''}
      <button class="sk-btn primary" data-action="export">Download</button>
    </div>`;
    container.innerHTML = `<div class="sk-root">${cardHtml}${pickerHtml}${presetHtml}${actionsHtml}</div>`;
    bindEvents();
  }

  function bindEvents() {
    container.querySelectorAll('button.sk-thumb-wrap[data-theme]').forEach(wrap => {
      wrap.addEventListener('click', () => {
        const name = wrap.dataset.theme;
        currentThemeName = name;
        currentTheme = resolveTheme(name);
        container.querySelectorAll('button.sk-thumb-wrap[data-theme]').forEach(other => {
          const on = other === wrap;
          other.setAttribute('aria-pressed', String(on));
          other.querySelector('.sk-thumb').classList.toggle('active', on);
        });
        const cardEl = container.querySelector('.sk-card');
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = renderCard();
        cardEl.replaceWith(tempDiv.firstElementChild);
      });
    });
    container.querySelectorAll('button.sk-thumb-wrap[data-preset]').forEach(wrap => {
      wrap.addEventListener('click', () => {
        currentPreset = wrap.dataset.preset;
        container.querySelectorAll('button.sk-thumb-wrap[data-preset]').forEach(other => {
          const on = other === wrap;
          other.setAttribute('aria-pressed', String(on));
          other.querySelector('.sk-thumb').classList.toggle('active', on);
        });
        const cardEl = container.querySelector('.sk-card');
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = renderCard();
        cardEl.replaceWith(tempDiv.firstElementChild);
      });
    });
    container.querySelector('[data-action="export"]')?.addEventListener('click', doExport);
    container.querySelector('[data-action="copy"]')?.addEventListener('click', () => {
      if (actions.onCopyLink) actions.onCopyLink({ copyToClipboard });
    });
    container.querySelector('[data-action="twitter"]')?.addEventListener('click', () => {
      if (actions.onTwitter) actions.onTwitter();
    });
  }

  async function doExport() {
    const cardEl = container.querySelector('.sk-card');
    if (!cardEl) return;
    const blob = await exportToImage(cardEl, { preset: currentPreset });
    if (actions.onExport) {
      actions.onExport(blob, currentPreset);
    } else {
      downloadBlob(blob, `${branding.name.replace(/\s+/g, '-').toLowerCase()}-share.png`);
    }
    // Returned so `card.exportImage()` is usable programmatically, not only as a
    // download trigger.
    return blob;
  }

  render();

  return {
    render,
    setTheme(name) {
      currentThemeName = name;
      currentTheme = resolveTheme(name);
      render();
    },
    setContent(newContent) {
      currentContent = { ...newContent };
      render();
    },
    setPreset(preset) {
      currentPreset = preset;
      render();
    },
    exportImage: doExport,
    /** Export for a specific platform preset without changing the preview */
    async exportFor(preset) {
      const cardEl = container.querySelector('.sk-card');
      if (!cardEl) return null;
      return exportToImage(cardEl, { preset });
    },
    getPresets() { return presets; },
    destroy() { container.textContent = ''; },
  };
}
