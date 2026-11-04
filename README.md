# PDF Editor

**Live site: https://firstprayer.github.io/pdf-editor/**

A standalone, browser-local PDF editor.
Open the included sample or a PDF from your device, make changes, and download
a new PDF. Documents are never uploaded, and there is no account or watermark.

## Run locally

Use Node.js 22.13 or newer (`.nvmrc` pins 24).

```sh
cd pdf-editor
npm ci
npm run dev
```

Open the printed localhost URL, normally `http://127.0.0.1:5184`.
`npm run build` creates the static application in `dist/`;
`npm run preview` serves that build locally. The preparation script copies
PDF.js fonts, character maps, and WebAssembly resources from the pinned npm
package into ignored build inputs. No document is sent to the local server.

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml`: lint, format check,
tests, then `npm run build` with `BASE_PATH=/pdf-editor/`, and publishes `dist/`
to GitHub Pages. The site is fully static; documents never leave the browser.
To build for another host path, set `BASE_PATH` (default `/`).

## Analytics and SEO

The production build loads Google Analytics 4 only on
`firstprayer.github.io/pdf-editor/`, and only when `.env.production` sets
`VITE_GA_MEASUREMENT_ID`. `src/analytics.js` drops query strings and fragments,
keeps referrers to their origin, disables Google signals and ad personalization,
and allows only counts and tool names as event parameters (`pdf_open`,
`pdf_insert`, `tool_select`, `pdf_download` and the matching failure events).
File names, document text, signatures and images are never sent. Local
development never loads analytics.

`index.html` carries the title, description, canonical URL, Open Graph and
Twitter cards (`public/og-image.png`), WebApplication and FAQPage structured
data, and a static, crawlable description of the editor below the app.
`public/sitemap.xml` lists the page for Search Console. To refresh the share
image, capture the running app at 1200×630.

## Editing

- Replace horizontal, selectable original text, or add independent text boxes.
- Draw or type a visual signature and place PNG or JPEG images.
- Highlight, draw, and permanently redact selected page areas.
- Merge PDFs; add blank pages; rotate, reorder, duplicate, and delete pages.
- Select edits with the pointer or the properties selector. Use arrow keys on
  the focused page to move a selection; hold Shift for larger movements.
- Undo and redo the last 50 changes. Download creates a separate edited file.

The editing tools have single-key shortcuts shown in Help. Command/Control S
downloads, Command/Control Z undoes, and Command/Control Shift Z redoes.
The page supports keyboard placement with Enter after choosing an insertion
tool. The original-text dropdown provides a keyboard alternative to clicking
existing text.

## Document behavior and limits

Documents are held in tab memory. Download before closing or refreshing. The
original file on disk is never modified. Imports are limited to 50 MB per PDF,
100 MB combined source files, and 200 pages. Inserted images must be PNG/JPEG,
under 10 MB, and under 40 million pixels.

Ordinary edits preserve original PDF pages and searchable original text. Editing
original text uses a white mask and standard PDF fonts, not original font
reconstruction or paragraph reflow. The affected original page becomes an image;
replacement text remains searchable. Source text with rotation, skew, or reversed
axes is excluded from replacement. Add independent text for those cases.

Redaction creates a new PDF page from sanitized pixels, including existing
annotations. Redaction is applied last. Original text, original image objects,
and underlying annotation text are not copied into the exported redacted page.
All content on that page becomes an image, so its original text and links are
not searchable or interactive. Rasterization uses up to 216 dpi, capped at
16 million pixels and 8,192 pixels per dimension. Other pages keep their original
content. PDF coordinate offsets, rotations, and non-default user units are
preserved through this conversion.

New text uses standard PDF fonts with Latin/Windows-1252 support. OCR,
password-protected PDF decryption, native form-field editing, and
certificate-backed signatures are outside this version. A drawn or typed
signature is a visual mark. Editing an already digitally signed PDF does not
preserve its signature's validity. Review the downloaded document before use.

## Local checks

```sh
npm run test
npm run lint
npm run format:check
npm run build
```

Tests exercise actual PDF generation and independent PDF.js parsing/rendering,
including redaction, original-text replacement, signatures, merged page order,
cropped/rotated geometry, and PDF user units. No test uses live documents or
external accounts. Browser acceptance and screenshots are separate checks.
