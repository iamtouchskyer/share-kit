import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { analysePixels, ensureShotDir, openHarness, pngHeader } from './helpers.js';

// The rasterizer is the half of share-kit that cannot be verified by reading code:
// it either reproduces the page or it does not. These specs assert the *rendered*
// result — geometry, colour, alignment, alpha — plus the two properties that used
// to break silently (dropped computed styles, and clipping).

const BRAND = { name: 'brand-blue', rgb: [0, 113, 227] };
const RED = { name: 'red-swatch', rgb: [216, 70, 60] };
const GREEN = { name: 'bottom-probe', rgb: [0, 168, 107] };

test('rasterizes a fixture with faithful geometry, colour and alignment', async ({ page }) => {
  const shots = ensureShotDir();
  await openHarness(page);

  const fixtureHealth = await page.evaluate(() => {
    const red = document.getElementById('fixture-red');
    return { complete: red.complete, naturalWidth: red.naturalWidth, naturalHeight: red.naturalHeight };
  });
  expect(fixtureHealth).toEqual({ complete: true, naturalWidth: 60, naturalHeight: 40 });

  const shot = await page.evaluate(async () => {
    const { renderNodeToPng } = window.SK;
    const result = await renderNodeToPng(window.SK.fixture, {
      width: 400,
      background: '#ffffff',
    });
    const buffer = await result.blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return {
      base64: btoa(binary),
      width: result.width,
      height: result.height,
      ratio: result.ratio,
      pixelWidth: result.pixelWidth,
      pixelHeight: result.pixelHeight,
      type: result.blob.type,
    };
  });

  fs.writeFileSync(path.join(shots, 'fixture.png'), Buffer.from(shot.base64, 'base64'));
  console.log('RASTERIZE', JSON.stringify({ ...shot, base64: undefined }));

  expect(shot.type).toBe('image/png');
  expect(shot.pixelWidth).toBe(800);          // 400 CSS px × 2
  expect(shot.pixelHeight).toBe(shot.height * shot.ratio);

  const stats = await analysePixels(page, shot.base64, [BRAND, RED, GREEN]);
  console.log('PIXELS', JSON.stringify({
    whiteRatio: stats.whiteRatio.toFixed(3),
    inkRatio: stats.inkRatio.toFixed(3),
    inkCentroidX: stats.inkCentroidX?.toFixed(3),
    alphaBad: stats.alphaBad,
    topLeft: stats.topLeft,
    topRight: stats.topRight,
    targets: stats.targets,
  }));
  console.log(`PROFILE(40 bands)\n|${stats.profile}|`);

  expect(stats.alphaBad).toBe(0);                       // background filled, no transparent gaps
  expect(stats.whiteRatio).toBeGreaterThan(0.5);        // paper survived
  expect(stats.inkRatio).toBeGreaterThan(0.004);        // text really painted
  expect(stats.targets['brand-blue'].count).toBeGreaterThan(1000);
  expect(stats.targets['red-swatch'].count).toBeGreaterThan(500);   // <img> became a data URI
  expect(stats.targets['bottom-probe'].count).toBeGreaterThan(500); // nothing clipped at the tail

  // The 4px gradient bar: #007aff at x=0 → #5856d6 at x=width
  expect(stats.topLeft[0]).toBeLessThan(40);
  expect(stats.topLeft[2]).toBeGreaterThan(200);
  expect(stats.topRight[2]).toBeGreaterThan(180);
  expect(stats.topRight[0]).toBeGreaterThan(60);

  // Alignment contract: the blue bubble sits on the right, prose on the left.
  expect(stats.targets['brand-blue'].centroidX).toBeGreaterThan(0.6);
  expect(stats.inkCentroidX).toBeLessThan(0.5);
  expect(stats.profile.trim().length).toBeGreaterThan(5);
});

test('keeps every copied computed style (kebab-case regression guard)', async ({ page }) => {
  await openHarness(page);

  // getPropertyValue() only accepts CSS property names: passing camelCase
  // ('fontSize', 'alignItems') returns '' and silently drops every multi-word
  // property — the exported image then loses font sizes, radii and flex
  // alignment while still looking "kind of fine" in code review. This test is the
  // guard for that whole class of bug.
  const report = await page.evaluate(async () => {
    const { buildShareSvg } = window.SK;
    const fixture = window.SK.fixture;
    const built = await buildShareSvg(fixture, { width: 400, background: '#ffffff' });
    const doc = new DOMParser().parseFromString(built.svg, 'image/svg+xml');
    const clone = doc.querySelector('#fixture');
    if (!clone) return { parseFailed: true, head: built.svg.slice(0, 200) };

    const PROPS = [
      'font-size', 'font-weight', 'line-height', 'letter-spacing', 'font-family',
      'border-radius', 'border-bottom-right-radius', 'align-items', 'flex-direction',
      'justify-content', 'max-width', 'box-sizing', 'padding-left', 'margin-bottom',
      'text-align', 'white-space', 'overflow-wrap', 'display', 'list-style-type',
    ];
    const live = [fixture, ...fixture.querySelectorAll('*')];
    const cloned = [clone, ...clone.querySelectorAll('*')];
    const mismatches = [];
    for (let i = 0; i < live.length; i += 1) {
      const computed = getComputedStyle(live[i]);
      const declared = cloned[i] ? cloned[i].getAttribute('style') || '' : '';
      for (const prop of PROPS) {
        const value = computed.getPropertyValue(prop);
        if (!value || value === 'auto' || value === 'normal') continue;
        if (!declared.includes(`${prop}:${value}`)) {
          mismatches.push(`${live[i].id || live[i].className || live[i].tagName} { ${prop}: ${value} }`);
        }
      }
    }
    built.cleanup();
    return { elements: live.length, total: mismatches.length, mismatches: mismatches.slice(0, 10) };
  });

  console.log('FIDELITY', JSON.stringify(report));
  expect(report.parseFailed, JSON.stringify(report)).toBeFalsy();
  expect(report.elements).toBeGreaterThan(5);
  expect(report.mismatches, report.mismatches.join('\n')).toEqual([]);
});

test('hides images that cannot be inlined, keeps the ones that can', async ({ page }) => {
  await openHarness(page);

  const built = await page.evaluate(async () => {
    const { buildShareSvg } = window.SK;
    const result = await buildShareSvg(window.SK.fixture, { width: 400, background: '#ffffff' });
    const svg = result.svg;
    result.cleanup();
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const broken = doc.querySelector('#fixture-broken');
    const red = doc.querySelector('#fixture-red');
    return {
      svg,
      brokenStyle: broken ? broken.getAttribute('style') : null,
      brokenSrc: broken ? broken.getAttribute('src') : null,
      redSrc: red ? red.getAttribute('src') : null,
    };
  });

  // The 404 image must not be painted as a broken frame: it is hidden *and* its
  // src is disarmed so the isolated document stops requesting it.
  expect(built.brokenStyle).toContain('display:none');
  expect(built.brokenSrc).toContain('data:image/png;base64,');
  // ...while the inlineable one survives as a data URI.
  expect(built.redSrc).toContain('data:image/png;base64,');
});

test('never mutates the live element while capturing', async ({ page }) => {
  await openHarness(page);

  // 0.1.x resized the live element (width/min-height/overflow) for the duration of
  // the capture, which flashed a layout change in front of the user. The capture
  // stage is off-screen now; the node must come back untouched.
  const result = await page.evaluate(async () => {
    const { renderNodeToPng } = window.SK;
    const fixture = window.SK.fixture;
    const before = {
      style: fixture.getAttribute('style'),
      width: fixture.offsetWidth,
      height: fixture.offsetHeight,
      inlineWidth: fixture.style.width,
      inlineOverflow: fixture.style.overflow,
    };
    await renderNodeToPng(fixture, { width: 400, background: '#ffffff' });
    const after = {
      style: fixture.getAttribute('style'),
      width: fixture.offsetWidth,
      height: fixture.offsetHeight,
      inlineWidth: fixture.style.width,
      inlineOverflow: fixture.style.overflow,
    };
    return {
      before,
      after,
      strayStage: document.querySelectorAll('[data-share-kit-stage]').length,
    };
  });

  expect(result.after).toEqual(result.before);
  expect(result.strayStage).toBe(0);   // the off-screen stage is cleaned up
});

test('lowers the sampling ratio instead of failing when the budget is tight', async ({ page }) => {
  await openHarness(page);

  const fixtureHealth = await page.evaluate(() => {
    const red = document.getElementById('fixture-red');
    return { complete: red.complete, naturalWidth: red.naturalWidth, naturalHeight: red.naturalHeight };
  });
  expect(fixtureHealth).toEqual({ complete: true, naturalWidth: 60, naturalHeight: 40 });

  const shot = await page.evaluate(async () => {
    const { renderNodeToPng } = window.SK;
    const result = await renderNodeToPng(window.SK.fixture, {
      width: 400,
      pixelRatio: 4,
      // 400×175 CSS px ≈ 70k px²: at 4× that is 1.1M, so a 4M budget would never
      // bite. 200k forces the engine to trade sampling ratio for area.
      maxPixels: 200_000,
      background: '#ffffff',
    });
    return { ratio: result.ratio, pixelWidth: result.pixelWidth, pixelHeight: result.pixelHeight };
  });

  console.log('BUDGET', JSON.stringify(shot));
  expect(shot.ratio).toBeLessThan(2);
  expect(shot.pixelWidth * shot.pixelHeight).toBeLessThanOrEqual(200_000 * 1.1);
});

test('reports TOO_LONG when even 1x cannot fit', async ({ page }) => {
  await openHarness(page);

  const outcome = await page.evaluate(async () => {
    const { renderNodeToPng, isTooLong } = window.SK;
    try {
      await renderNodeToPng(window.SK.tall, { width: 300, maxPixels: 1000 });
      return { threw: false };
    } catch (error) {
      return { threw: true, code: error.code, isTooLong: isTooLong(error), message: error.message };
    }
  });

  console.log('TOO_LONG', JSON.stringify(outcome));
  expect(outcome.threw).toBe(true);
  expect(outcome.code).toBe('TOO_LONG');
  expect(outcome.isTooLong).toBe(true);
});
