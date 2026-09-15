import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { axeSerious, ensureShotDir, openHarness, pngHeader } from './helpers.js';

// The built-in card UI: what a consumer gets from `createShareCard`. Covers the
// pickers (now real buttons), the download path end to end, and the a11y baseline.

async function mountCard(page, overrides = {}) {
  return page.evaluate(async (opts) => {
    const { createShareCard } = window.SK;
    const host = document.getElementById('card-host');
    host.textContent = '';
    const card = createShareCard(host, {
      branding: { name: 'Share Kit', domain: 'share-kit.test', tagline: 'share-kit.test' },
      content: {
        emoji: '✨',
        title: 'Long image export',
        subtitle: 'No CDN, no clipping, real pixels',
        stats: [
          { value: 1280, label: 'px wide' },
          { value: 2, label: 'x ratio' },
        ],
      },
      theme: opts.theme || 'light',
      preset: opts.preset || 'card',
      ...(opts.extra || {}),
    });
    window.__card = card;
    return { thumbs: host.querySelectorAll('button.sk-thumb-wrap').length };
  }, overrides);
}

test('renders the card with keyboard-reachable pickers', async ({ page }) => {
  const shots = ensureShotDir();
  await openHarness(page);
  const mounted = await mountCard(page);
  console.log('MOUNTED', JSON.stringify(mounted));

  // Themes + presets are buttons, not clickable divs: screen readers and keyboard
  // users can reach them, and the selected one reports its state.
  expect(mounted.thumbs).toBeGreaterThan(5);
  expect(await page.locator('#card-host button[data-theme][aria-pressed="true"]').count()).toBe(1);
  expect(await page.locator('#card-host button[data-preset][aria-pressed="true"]').count()).toBe(1);

  await page.locator('#card-host button[data-theme][data-theme="ocean"]').click();
  await expect(page.locator('#card-host button[data-theme="ocean"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.locator('#card-host button[data-theme][aria-pressed="true"]').count()).toBe(1);

  await page.locator('#card-host button[data-preset="card-long"]').click();
  await expect(page.locator('#card-host button[data-preset="card-long"]')).toHaveAttribute('aria-pressed', 'true');

  await page.screenshot({ path: path.join(shots, 'card-ui.png'), fullPage: true });
  const violations = await axeSerious(page, '#card-host');
  console.log('AXE', JSON.stringify(violations));
  expect(violations).toEqual([]);
});

// Every shipped theme, not just the default: a card is an image people read on a
// phone, so a token that only looks tasteful at 3.5:1 is a defect the theme list
// would otherwise hide. This is also the loop that catches a new theme added later.
for (const theme of ['light', 'dark', 'ocean', 'aurora', 'neon', 'academic']) {
  test(`theme "${theme}" keeps its card text readable (axe AA)`, async ({ page }) => {
    const shots = ensureShotDir();
    await openHarness(page);
    await mountCard(page, { theme });
    await page.screenshot({ path: path.join(shots, `theme-${theme}.png`), fullPage: false });

    const violations = await axeSerious(page, '#card-host');
    console.log(`THEME ${theme}`, JSON.stringify(violations));
    expect(violations, `theme ${theme}`).toEqual([]);
  });
}

test('the download button exports a real PNG through the default engine', async ({ page }) => {
  const shots = ensureShotDir();
  await openHarness(page);
  const external = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith('http://127.0.0.1:') && !url.startsWith('data:') && !url.startsWith('blob:')) external.push(url);
  });

  await mountCard(page, { preset: 'card' });
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#card-host button[data-action="export"]').click();
  const download = await downloadPromise;
  const saved = path.join(shots, download.suggestedFilename());
  await download.saveAs(saved);

  const header = pngHeader(saved);
  console.log('CARD DOWNLOAD', JSON.stringify({ file: path.basename(saved), ...header }));
  expect(header.width).toBe(420 * 2);
  // A numeric preset height is a floor, not a guillotine: the card's content is
  // ~2px taller than 540 at this font stack, and the export grows instead of
  // trimming it (0.1.x hid that overflow with `overflow:hidden`). Exact frames
  // stay available via `overflow: 'clip'`.
  expect(header.height).toBeGreaterThanOrEqual(540 * 2);
  expect(header.height).toBeLessThanOrEqual(540 * 2 + 10);
  expect(download.suggestedFilename()).toMatch(/^share-kit-share\.png$/);
  expect(external).toEqual([]);
});

test('programmatic export works with the controller API', async ({ page }) => {
  await openHarness(page);
  await mountCard(page, { preset: 'card-long' });

  const outcome = await page.evaluate(async () => {
    const host = document.getElementById('card-host');
    const card = window.__card;
    card.setTheme('dark');
    card.setContent({ title: 'Swapped content', subtitle: 'via setContent()' });
    const blob = await card.exportImage();
    const other = await card.exportFor('twitter');
    return {
      preset: card.getPresets()['card-long'],
      blobType: blob.type,
      blobSize: blob.size,
      otherType: other.type,
      cardText: host.textContent.includes('Swapped content'),
    };
  });

  console.log('CONTROLLER', JSON.stringify(outcome));
  expect(outcome.cardText).toBe(true);
  expect(outcome.blobType).toBe('image/png');
  expect(outcome.blobSize).toBeGreaterThan(1000);
  expect(outcome.otherType).toBe('image/png');
});

test('copies an exported image to the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openHarness(page);
  await mountCard(page);

  const outcome = await page.evaluate(async () => {
    const { exportToImage, copyImageToClipboard, canCopyImage } = window.SK;
    const blob = await exportToImage(window.SK.fixture, { preset: 'card-long', background: '#ffffff' });
    await copyImageToClipboard(blob);
    const items = await navigator.clipboard.read();
    return {
      canCopyImage: canCopyImage(),
      types: items.flatMap((item) => item.types),
      size: blob.size,
    };
  });

  console.log('CLIPBOARD', JSON.stringify(outcome));
  expect(outcome.canCopyImage).toBe(true);
  expect(outcome.types).toContain('image/png');
});
