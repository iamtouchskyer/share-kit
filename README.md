# @iamtouchskyer/share-kit

Reusable **share card + referral** kit: a framework-agnostic core, optional React
bindings, and an optional FastAPI backend.

The part worth reading about is the export engine: **any DOM node → PNG with zero
dependencies**, clipped to nothing, and no CDN in the capture path.

```bash
npm install @iamtouchskyer/share-kit
```

## Share card

```js
import { createShareCard, downloadBlob } from '@iamtouchskyer/share-kit';

const card = createShareCard(document.getElementById('mount'), {
  branding: { name: 'Acme', domain: 'acme.com', tagline: 'acme.com' },
  content: { emoji: '✨', title: 'Shipped it', subtitle: '14 days in a row' },
  theme: 'light',            // light | dark | ocean | aurora | neon | academic
  preset: 'card',            // or 'card-long', 'twitter', 'xiaohongshu', …
  actions: {
    onExport: async (blob, preset) => upload(blob, preset),   // default: download
  },
});

await card.exportImage();     // → Blob
await card.exportFor('og');   // → Blob at 1200×630 without changing the preview
```

## Exporting an arbitrary node

`exportToImage` works on any element, so a transcript, an article, or a diff can be
shared the same way:

```js
import { exportToImage, copyImageToClipboard } from '@iamtouchskyer/share-kit';

const blob = await exportToImage(document.querySelector('#article'), {
  preset: 'card-long',        // fixed width, height follows the content
  background: '#ffffff',      // documents want paper, cards can stay transparent
});
await copyImageToClipboard(blob);   // paste straight into a chat or a doc
```

### How it renders

Clone the node → write every element's **computed style** inline → hand the result
to `<svg><foreignObject>` → let the browser paint it. The output is the layout that
was on screen, not a re-derivation of it, so flex alignment, gradients,
`border-radius`, `letter-spacing`, CJK line breaking and webfont metrics all
survive. The clone is staged off-screen for measuring, so the live DOM is never
resized or re-rendered in front of the user.

### Height contract

| Preset height | Behaviour |
| --- | --- |
| `'auto'` (e.g. `card-long`) | The canvas grows with the content |
| number (e.g. `540`) | A **floor**: content is never clipped, the canvas grows when it needs to |
| number + `overflow: 'clip'` | The exact frame you asked for — content beyond it is cut |

`overflow: 'grow'` is the default on purpose: silently trimming the last paragraph
of a shared document is worse than an image 2px taller than the platform preset.

## Export engines

| Engine | Install | Notes |
| --- | --- | --- |
| `foreignObject` (**default**) | nothing | Faithful, no network, variable height |
| `html2canvas` | `npm i html2canvas` | Opt-in adapter, bundled by your build |
| anything else | — | `capture: (element, opts) => Promise<Blob \| HTMLCanvasElement>` |

```js
import { exportToImage } from '@iamtouchskyer/share-kit';
import { html2canvasCapture } from '@iamtouchskyer/share-kit/backends/html2canvas';

const blob = await exportToImage(el, { capture: html2canvasCapture() });
```

## Limits (handled, but know about them)

- **Pseudo-elements are not captured.** Computed styles carry no `::before`/`::after`,
  so a card must not draw content with them.
- **Fonts** land on the system stack: an SVG loaded as an image is its own document
  and cannot see the page's `@font-face` rules. Export waits for `document.fonts.ready`
  first so the measured height cannot shift after a font swap.
- **Images** must be same-origin or CORS-readable; they are converted to data URIs
  before capture. Ones that cannot be fetched are hidden instead of leaving a broken
  frame in the shared image.
- **Canvas area** is capped by the browser (Safari ≈ 16M px). The sampling ratio is
  reduced automatically; if even 1× does not fit, the call rejects with
  `error.code === 'TOO_LONG'` (check it with `isTooLong(error)`) so the UI can ask
  the user to select less.
- **Transparency** is preserved unless you pass `background`. Set it for documents.

## Presets

`card`, `card-long`, `card-square`, `card-wide`, `twitter`, `og`, `facebook`,
`linkedin`, `whatsapp`, `instagram-post`, `instagram-story`, `wechat`, `wechat-chat`,
`xiaohongshu`. Resolve one (or a `{ width, height }` object) with
`getPresetSize(preset)`; an `'auto'` height resolves to `null`.

## Testing

```bash
npm install
npm test          # Playwright + axe, no build step (a tiny node static server serves the harness)
```

The suite asserts rendered pixels (gradient endpoints, ink coverage, left/right
alignment), that nothing is clipped, that **the capture makes no network request**,
that the serializer keeps every copied computed style, and that every shipped theme
passes axe AA. Those are the failures that otherwise ship silently.

## Python backend (FastAPI)

Share + referral endpoints, all project-specific behaviour injected through
`ShareKitConfig` — table names, user fields, the reward strategy, and the DB
driver's placeholder style.

```python
from share_kit import ShareKitConfig, create_share_router

config = ShareKitConfig(
    paramstyle="format",            # 'qmark' (sqlite3) | 'format' (psycopg) | 'numeric' (asyncpg)
    get_db=get_db_dependency,
    get_current_user=current_user_dependency,
    branding={"name": "Acme", "domain": "acme.com"},
    allowed_share_types=["streak", "result"],
    reward_strategy=my_reward_strategy,
)
app.include_router(create_share_router(config))
```

Statements are written once with neutral `?` placeholders and translated per
`paramstyle` (`share_kit/sql.py`). 0.1.x hard-coded `?`, so this backend could not
run against Postgres — the driver style is now configuration, not a dialect
decision baked into the SQL.

```bash
cd python && pip install -e ".[dev]" && pytest    # no database required
```

## Migration 0.1.x → 0.2.0

- `html2canvasUrl` is gone: the CDN fetch at capture time meant sharing failed
  whenever that CDN was unreachable. Install html2canvas and pass a `capture`
  function (above), or keep the default engine and install nothing.
- Content taller than a numeric preset is no longer silently clipped; it grows.
  Pass `overflow: 'clip'` for the old behaviour.
- The live element is no longer mutated during capture.
- Picker thumbs are `<button>`s with `aria-pressed`, so they are keyboard reachable.
- Python: the distribution is now `share-kit` and the import is `share_kit` (was
  `suri-share-kit` / `suri_share_kit`), and the DB driver's placeholder style is
  configuration (`ShareKitConfig(paramstyle=...)`) instead of hard-coded `?`.

## Layout

```
src/            framework-agnostic core (index, share-card, rasterize, export, themes, utils)
src/backends/   optional html2canvas adapter
react/          React bindings (@iamtouchskyer/share-kit-react)
python/         FastAPI share + referral router (share_kit) with its own tests/
tests/          Playwright suite + harness
```

MIT
