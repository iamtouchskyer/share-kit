import { test, expect } from '@playwright/test';
import { analysePixels, openHarness } from './helpers.js';

// export.js is the compatibility surface: presets, the height contract, the
// engine dispatch. These specs pin the behaviour that 0.1.x got wrong (silent
// clipping, a CDN fetch at capture time) and the behaviour that must not change
// (preset geometry, a pluggable engine, format conversion).

test('a fixed preset keeps its frame when the content is shorter', async ({ page }) => {
  await openHarness(page);

  const shot = await page.evaluate(async () => {
    const { exportToImage } = window.SK;
    const node = document.createElement('div');
    node.style.cssText = 'width:200px;height:100px;background:#0071e3';
    document.body.appendChild(node);
    const blob = await exportToImage(node, { preset: 'card', scale: 2 });
    node.remove();
    return { type: blob.type, size: blob.size, base64: await window.SK.blobToBase64(blob) };
  });

  const dims = await page.evaluate(async (b64) => {
    const img = new Image();
    await new Promise((resolve) => { img.onload = resolve; img.src = `data:image/png;base64,${b64}`; });
    return { width: img.width, height: img.height };
  }, shot.base64);

  console.log('FIXED PRESET', JSON.stringify(dims));
  expect(shot.type).toBe('image/png');
  expect(dims.width).toBe(420 * 2);
  // The preset height is a floor: short content is padded to the frame, not stretched.
  expect(dims.height).toBe(540 * 2);
});

test('grows instead of clipping when content is taller than the preset', async ({ page }) => {
  await openHarness(page);

  const shot = await page.evaluate(async () => {
    const { exportToImage } = window.SK;
    const blob = await exportToImage(window.SK.tall, { preset: 'card', scale: 2, background: '#ffffff' });
    return { base64: await window.SK.blobToBase64(blob) };
  });

  const stats = await analysePixels(page, shot.base64, [{ name: 'tail', rgb: [216, 70, 60] }]);
  console.log('GROW', JSON.stringify({ height: stats.height, tail: stats.targets.tail }));

  // 0.1.x set overflow:hidden and cut the tail off. The tail colour must be present.
  expect(stats.height).toBeGreaterThan(540 * 2);
  expect(stats.targets.tail.count).toBeGreaterThan(500);
});

test('overflow:"clip" restores the fixed frame, explicitly losing the tail', async ({ page }) => {
  await openHarness(page);

  const shot = await page.evaluate(async () => {
    const { exportToImage } = window.SK;
    const blob = await exportToImage(window.SK.tall, {
      preset: 'card',
      scale: 2,
      overflow: 'clip',
      background: '#ffffff',
    });
    return { base64: await window.SK.blobToBase64(blob) };
  });

  const stats = await analysePixels(page, shot.base64, [{ name: 'tail', rgb: [216, 70, 60] }]);
  console.log('CLIP', JSON.stringify({ height: stats.height, tail: stats.targets.tail.count }));

  expect(stats.height).toBe(540 * 2);
  expect(stats.targets.tail.count).toBe(0);   // documented loss, not a silent surprise
});

test('the card-long preset grows to the content at 640px wide', async ({ page }) => {
  await openHarness(page);

  const shot = await page.evaluate(async () => {
    const { exportToImage, getPresetSize } = window.SK;
    const blob = await exportToImage(window.SK.tall, { preset: 'card-long', scale: 2, background: '#ffffff' });
    return { preset: getPresetSize('card-long'), base64: await window.SK.blobToBase64(blob) };
  });

  const stats = await analysePixels(page, shot.base64, [{ name: 'tail', rgb: [216, 70, 60] }]);
  console.log('LONG', JSON.stringify({ preset: shot.preset, width: stats.width, height: stats.height }));

  expect(shot.preset).toEqual({ width: 640, height: null, label: 'Long card (auto height)' });
  expect(stats.width).toBe(1280);
  expect(stats.height).toBeGreaterThan(1280);          // taller than it is wide — a real long image
  expect(stats.targets.tail.count).toBeGreaterThan(500);
});

test('captures without touching the network', async ({ page }) => {
  await openHarness(page);

  const external = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith('http://127.0.0.1:') && !url.startsWith('data:') && !url.startsWith('blob:')) {
      external.push(url);
    }
  });

  await page.evaluate(async () => {
    const { exportToImage } = window.SK;
    const node = document.createElement('div');
    node.style.cssText = 'width:200px;height:80px;background:#5856d6';
    document.body.appendChild(node);
    await exportToImage(node, { preset: 'card', scale: 2 });
    node.remove();
  });

  // 0.1.x fetched html2canvas from cdn.jsdelivr.net at capture time; that is the
  // regression this test exists to prevent from ever coming back.
  console.log('EXTERNAL REQUESTS', JSON.stringify(external));
  expect(external).toEqual([]);
});

test('engine is pluggable: a custom capture function wins', async ({ page }) => {
  await openHarness(page);

  const outcome = await page.evaluate(async () => {
    const { exportToImage } = window.SK;
    let called = null;
    const blob = await exportToImage(window.SK.fixture, {
      preset: 'card',
      capture: async (element, opts) => {
        called = { width: opts.width, pixelRatio: opts.pixelRatio };
        const canvas = document.createElement('canvas');
        canvas.width = 10;
        canvas.height = 10;
        canvas.getContext('2d').fillRect(0, 0, 10, 10);
        return canvas;
      },
    });
    return { called, type: blob.type, size: blob.size };
  });

  console.log('CUSTOM CAPTURE', JSON.stringify(outcome));
  expect(outcome.called.width).toBe(420);
  expect(outcome.type).toBe('image/png');
  expect(outcome.size).toBeGreaterThan(0);
});

test('the removed CDN option explains itself instead of failing silently', async ({ page }) => {
  await openHarness(page);

  const errors = await page.evaluate(async () => {
    const { exportToImage } = window.SK;
    const out = {};
    try {
      await exportToImage(window.SK.fixture, { html2canvasUrl: 'https://cdn.jsdelivr.net/npm/html2canvas' });
      out.url = 'no error';
    } catch (error) {
      out.url = error.message;
    }
    try {
      await exportToImage(window.SK.fixture, { backend: 'html2canvas' });
      out.backend = 'no error';
    } catch (error) {
      out.backend = error.message;
    }
    return out;
  });

  expect(errors.url).toContain('removed in 0.2.0');
  expect(errors.url).toContain('CDN');
  expect(errors.backend).toContain('npm install html2canvas');
});

test('format conversion and preset helpers behave', async ({ page }) => {
  await openHarness(page);

  const outcome = await page.evaluate(async () => {
    const { exportToImage, getPresetSize, presets } = window.SK;
    const jpeg = await exportToImage(window.SK.fixture, { preset: 'card', format: 'jpeg', quality: 0.8 });
    return {
      jpegType: jpeg.type,
      auto: getPresetSize('card-long'),
      numeric: getPresetSize('twitter'),
      custom: getPresetSize({ width: 320, height: 'auto' }),
      unknown: getPresetSize('nope'),
      count: Object.keys(presets).length,
    };
  });

  expect(outcome.jpegType).toBe('image/jpeg');
  expect(outcome.auto.height).toBeNull();
  expect(outcome.numeric).toEqual({ width: 1200, height: 628, label: 'Twitter Card (1200×628)' });
  expect(outcome.custom).toEqual({ width: 320, height: null, label: undefined });
  expect(outcome.unknown.width).toBe(420);
  expect(outcome.count).toBeGreaterThan(10);
});
