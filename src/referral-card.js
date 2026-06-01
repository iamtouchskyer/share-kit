// referral-card.js — Framework-agnostic referral card component
// Same factory pattern as share-card.

import { resolveTheme } from './themes.js';
import { escapeHtml, copyToClipboard } from './utils.js';

const REFERRAL_STYLES = `
.sk-ref-root { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
.sk-ref-card { border-radius: 12px; padding: 24px; max-width: 400px; }
.sk-ref-title { font-size: 16px; font-weight: 700; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
.sk-ref-desc { font-size: 13px; margin-bottom: 16px; }
.sk-ref-code-row { display: flex; gap: 8px; margin-bottom: 16px; }
.sk-ref-code-input {
  flex: 1; padding: 8px 12px; border-radius: 8px; font-size: 14px; font-family: monospace;
  border: 1px solid rgba(0,0,0,0.1); background: rgba(0,0,0,0.02);
}
.sk-ref-copy-btn {
  padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px;
  font-weight: 600; cursor: pointer; transition: all 0.15s;
}
.sk-ref-stats { display: flex; gap: 24px; }
.sk-ref-stat { text-align: center; }
.sk-ref-stat-value { font-size: 24px; font-weight: 700; }
.sk-ref-stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
`;

/**
 * createReferralCard — factory function for referral invitation card.
 *
 * @param {HTMLElement} container
 * @param {object} config
 * @param {string} config.code - referral code
 * @param {object} config.stats - { totalReferred, rewardEarned? }
 * @param {object} config.reward - { amount, unit, description }
 * @param {object} config.branding - { name, domain }
 * @param {string|object} config.theme - theme name or object
 * @param {function} config.onCopy - (code, url) => void
 * @returns {{ render, updateStats, destroy }}
 */
export function createReferralCard(container, config = {}) {
  const {
    code = '',
    stats = { totalReferred: 0 },
    reward = { amount: 7, unit: 'days', description: 'Pro access' },
    branding = { name: 'App', domain: 'example.com' },
    theme: initialTheme = 'light',
    onCopy = null,
  } = config;

  let currentStats = { ...stats };
  let t = resolveTheme(initialTheme);

  // Inject styles once
  if (!document.getElementById('sk-ref-styles')) {
    const style = document.createElement('style');
    style.id = 'sk-ref-styles';
    style.textContent = REFERRAL_STYLES;
    document.head.appendChild(style);
  }

  function render() {
    const url = `https://${branding.domain}/?ref=${code}`;
    container.innerHTML = `
      <div class="sk-ref-root">
        <div class="sk-ref-card" style="background:${t.contentBg};border:1px solid ${t.cardBorder}">
          <div class="sk-ref-title" style="color:${t.text}">🎁 Invite Friends</div>
          <div class="sk-ref-desc" style="color:${t.secondary}">
            Invite friends and both get ${escapeHtml(String(reward.amount))} ${escapeHtml(reward.unit)} ${escapeHtml(reward.description)}!
          </div>
          <div class="sk-ref-code-row">
            <input class="sk-ref-code-input" value="${escapeHtml(url)}" readonly />
            <button class="sk-ref-copy-btn" style="background:${t.accent};color:${t.accentText}" data-action="copy">Copy</button>
          </div>
          <div class="sk-ref-stats">
            <div class="sk-ref-stat">
              <div class="sk-ref-stat-value" style="color:${t.accent}">${currentStats.totalReferred}</div>
              <div class="sk-ref-stat-label" style="color:${t.secondary}">Friends Invited</div>
            </div>
          </div>
        </div>
      </div>
    `;
    container.querySelector('[data-action="copy"]')?.addEventListener('click', () => {
      if (onCopy) onCopy(code, url);
      else copyToClipboard(url);
    });
  }

  render();

  return {
    render,
    updateStats(newStats) {
      currentStats = { ...currentStats, ...newStats };
      render();
    },
    setTheme(name) {
      t = resolveTheme(name);
      render();
    },
    destroy() { container.textContent = ''; },
  };
}
