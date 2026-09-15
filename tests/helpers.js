// tests/helpers.js — shared spec helpers.
//
// Browser-only behaviour has to be judged in a browser, so the assertions here are
// deliberately *pixel* and *string* level rather than "a blob came back":
//   * pixel stats catch layout regressions (a flipped flex alignment, a clipped
//     bottom element, a missing image) that no unit test would notice;
//   * the SVG-string check catches the serializer dropping computed styles.

import fs from 'node:fs';
import path from 'node:path';

export const SHOT_DIR = path.join(import.meta.dirname, '__screenshots__');

export function ensureShotDir() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  return SHOT_DIR;
}

/** Read PNG header fields without decoding the image. */
export function pngHeader(file) {
  const buf = fs.readFileSync(file);
  if (buf.slice(1, 4).toString('ascii') !== 'PNG') {
    throw new Error(`${file} is not a PNG`);
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bytes: buf.length };
}

export async function openHarness(page) {
  await page.goto('/tests/harness.html');
  await page.waitForFunction(() => window.SK_READY === true);
}

/**
 * Decode a PNG in the page and report aggregate pixel facts.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} base64
 * @param {Array<{name: string, rgb: [number, number, number], tol?: number}>} [targets]
 */
export async function analysePixels(page, base64, targets = []) {
  return page.evaluate(async ({ data, targets: wanted }) => {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = `data:image/png;base64,${data}`;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data: px } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const at = (x, y) => {
      const i = (y * canvas.width + x) * 4;
      return [px[i], px[i + 1], px[i + 2], px[i + 3]];
    };
    const near = (p, [r, g, b], tol) => (
      Math.abs(p[0] - r) <= tol && Math.abs(p[1] - g) <= tol && Math.abs(p[2] - b) <= tol
    );

    const found = {};
    for (const target of wanted) found[target.name] = { count: 0, sumX: 0, sumY: 0, minX: 1e9, maxX: -1, minY: 1e9, maxY: -1 };

    let white = 0;
    let ink = 0;
    let inkX = 0;
    let inkY = 0;
    let alphaBad = 0;
    let samples = 0;
    const bands = 40;
    const bandInk = new Array(bands).fill(0);
    const bandTotal = new Array(bands).fill(0);

    for (let y = 0; y < canvas.height; y += 2) {
      const band = Math.min(bands - 1, Math.floor((y / canvas.height) * bands));
      for (let x = 0; x < canvas.width; x += 2) {
        const p = at(x, y);
        samples += 1;
        bandTotal[band] += 1;
        if (p[3] !== 255) alphaBad += 1;
        if (p[0] > 244 && p[1] > 244 && p[2] > 244) white += 1;
        else if (p[0] < 110 && p[1] < 110 && p[2] < 110) {
          ink += 1;
          inkX += x;
          inkY += y;
          bandInk[band] += 1;
        }
        for (const target of wanted) {
          if (!near(p, target.rgb, target.tol ?? 20)) continue;
          const item = found[target.name];
          item.count += 1;
          item.sumX += x;
          item.sumY += y;
          if (x < item.minX) item.minX = x;
          if (x > item.maxX) item.maxX = x;
          if (y < item.minY) item.minY = y;
          if (y > item.maxY) item.maxY = y;
        }
      }
    }

    const summary = {};
    for (const [name, item] of Object.entries(found)) {
      summary[name] = item.count === 0 ? { count: 0 } : {
        count: item.count,
        centroidX: item.sumX / item.count / canvas.width,
        centroidY: item.sumY / item.count / canvas.height,
        bbox: [item.minX, item.minY, item.maxX, item.maxY],
      };
    }

    const profile = bandInk.map((n, i) => {
      const ratio = n / Math.max(1, bandTotal[i]);
      if (ratio >= 0.10) return '#';
      if (ratio >= 0.05) return '+';
      if (ratio >= 0.02) return ':';
      if (ratio >= 0.004) return '.';
      return ' ';
    }).join('');

    return {
      width: canvas.width,
      height: canvas.height,
      whiteRatio: white / samples,
      inkRatio: ink / samples,
      inkCentroidX: ink ? inkX / ink / canvas.width : null,
      inkCentroidY: ink ? inkY / ink / canvas.height : null,
      alphaBad,
      topLeft: at(0, 0),
      topRight: at(canvas.width - 1, 0),
      bottomMid: at(Math.floor(canvas.width / 2), canvas.height - 1),
      targets: summary,
      profile,
    };
  }, { data: base64, targets });
}

/** Run axe and return the critical/serious violations as a printable summary. */
export async function axeSerious(page, include) {
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  let builder = new AxeBuilder({ page });
  if (include) builder = builder.include(include);
  const results = await builder.analyze();
  return results.violations
    .filter((v) => v.impact === 'critical' || v.impact === 'serious')
    .map((v) => ({ id: v.id, impact: v.impact, targets: v.nodes.map((n) => n.target) }));
}
