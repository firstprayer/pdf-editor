---
name: qa
description: Release QA for the PDF Editor suite (editor plus nine tools). Use before every deploy, after changing any tool, the shared shell, styles or the page generator, and after a deploy to verify the live site. Covers static checks, real-upload end-to-end tests with fixed input files, visual review with hallmark and impeccable, and live checks for GA4 and Search Console.
---

# QA for the PDF Editor suite

Run every step in order and report the result of each. A step that was not run
is reported as not run, never as passed. Fix failures and re-run the step.

The suite: Edit (`/`), Merge, Split, Organize, Rotate, Compress, JPG to PDF,
PDF to JPG, Add page numbers, Watermark. Everything runs in the browser, so
every check works on a static build.

## Rules learned the hard way

- **Always test with real uploaded files.** Do not rely on sample buttons or
  in-memory bytes. Sample paths once hid a bug where every real upload failed.
  `Blob.prototype.bytes()` exists in current browsers, so `file.bytes ?? read(file)`
  took the method instead of the file's contents.
- **Validate the downloaded file, not the UI message.** Parse every download
  (page count, rotation, ZIP entries, size).
- **Headless Chrome traffic is filtered out of GA4** as a bot. Use a real browser
  for analytics checks (step 9).
- **A hidden browser pane pauses `requestAnimationFrame`.** PDF.js display
  renders then stall and screenshots look blank. Use the headless scripts here
  for screenshots; exports use `intent: "print"` so they never wait on frames.

## Setup

- Node 24 (`.nvmrc`). Run `npm ci` once.
- Google Chrome at `/Applications/Google Chrome.app` (set `CHROME=/path` otherwise).
  `puppeteer-core` is a dev dependency and drives it headless.
- Scripts live in `.claude/skills/qa/scripts/`. Use a scratch folder outside the
  repo as `<work>`; the scripts write fixtures, downloads and screenshots there.

## 1. Static checks

```sh
npm run lint
npm run format:check
npm test
```

Pass: lint and format clean, and all Node tests pass (27 at the time of
writing). `npm test` also fails if the generated pages are stale (run
`npm run pages`). The tests cover:
- the editor's export, redaction and text replacement;
- every tool operation in `src/tools/ops.js`: merge, page ranges, split, page
  assembly with rotation, page numbers (including rotated pages), watermarks,
  images to PDF, photo recompression and pages to JPEG.

## 2. Production build and local server

```sh
BASE_PATH=/pdf-editor/ npm run build
BASE_PATH=/pdf-editor/ npx vite preview --port 5186 --strictPort   # run in the background
```

The base URL for the next steps is `http://127.0.0.1:5186/pdf-editor/`. Check that
`dist/` has `index.html` plus one folder per tool, `sitemap.xml`, and
`google3e645556460c9e98.html`.

## 3. Test input files

`scripts/fixtures.mjs` generates them (the e2e and screenshot scripts call it
automatically). All content is synthetic.

| File | Content | Used by |
| --- | --- | --- |
| `report.pdf` | 2 A4 pages of text: "report page 1", "report page 2" | Merge (first file) |
| `appendix.pdf` | 1 A4 page of text | Merge (second file) |
| `three-pages.pdf` | 3 A4 pages of text: "three-pages page 1" to 3 | Edit, Split, Organize, Rotate, PDF to JPG, Page numbers, Watermark |
| `photos.pdf` | 1 A4 page holding a 2000×1400 JPEG at quality 95 (about 200 KB) | Compress |
| `photo-1.jpg` to `photo-3.jpg` | 2000×1400 JPEGs at quality 95 | JPG to PDF |

To create them alone: `node .claude/skills/qa/scripts/fixtures.mjs <work>/fixtures`.

## 4. End-to-end test (automated)

```sh
node .claude/skills/qa/scripts/e2e.mjs http://127.0.0.1:5186/pdf-editor/ <work>
```

Each case opens the page and checks that no tool page shows a sample button.
It then uploads the files through the page's own file picker, runs the
actions, captures the download and validates it. The script exits 1 if any
case fails.

| Case | Page | Upload | Actions | Download must be |
| --- | --- | --- | --- | --- |
| edit | `/` | `three-pages.pdf` via "Open PDF file" (replaces the 2-page sample) | Download | PDF, 3 pages |
| merge | `/merge-pdf/` | `report.pdf`, `appendix.pdf` | Merge and download | PDF, 3 pages |
| split (every page) | `/split-pdf/` | `three-pages.pdf` | Split and download (default method: every page) | ZIP with 3 `.pdf` files |
| organize | `/organize-pdf/` | `three-pages.pdf` | Delete page 3, Save and download | PDF, 2 pages |
| rotate | `/rotate-pdf/` | `three-pages.pdf` | Turn page 1 clockwise, Rotate and download | PDF, 3 pages, page 1 rotation 90 |
| compress (recommended) | `/compress-pdf/` | `photos.pdf` | Compress, then Download compressed PDF | PDF, 1 page, smaller than the input (about 87 KB from 199 KB) |
| compress (strong) | `/compress-pdf/` | `photos.pdf` | Choose Strong, Compress, Download compressed PDF | PDF, 1 page, smaller than the input (about 44 KB) |
| jpg to pdf | `/jpg-to-pdf/` | `photo-1.jpg` to `photo-3.jpg` | Convert and download (A4, Auto, Small margin) | PDF, 3 pages |
| pdf to jpg | `/pdf-to-jpg/` | `three-pages.pdf` | Convert and download (JPG, 150 DPI, all pages) | ZIP with 3 `.jpg` files |
| page numbers | `/add-page-numbers/` | `three-pages.pdf` | Add numbers and download (bottom centre, "1, 2, 3") | PDF, 3 pages |
| watermark | `/watermark-pdf/` | `three-pages.pdf` | Add watermark and download ("CONFIDENTIAL", diagonal) | PDF, 3 pages |

Pass: `All 11 cases passed`, with no page errors.

## 5. Manual checks per tool

These depend on judgment or interaction the script does not cover. Run them in a
visible browser on the local build, using the same input files. Expected messages
are quoted from the code; if the code changes, update this list.

- **Every tool:**
  - Drop a `.txt` or `.png` on a PDF tool. Expect "Choose PDF files only."
  - Upload a password-protected PDF. Expect "This PDF is password-protected. Unlock it first, then try again."
  - Make a change, then click another tool in the nav. The browser should warn about leaving.
  - Check that the nav marks the current tool and, on a phone, scrolls it into view.
- **Merge:**
  - Drag a file to a new position, then use its arrows; the order shown is the merge order.
  - "Remove all" asks before discarding.
  - Merging 2 or more files is enabled; with 1 file, the button is disabled and a hint asks for another.
- **Split:**
  - Page ranges `1-2, 3` gives 2 files, and the "File 1"/"File 2" labels match.
  - `9` shows "“9” is outside pages 1 to 3."
  - Selected pages: pick pages 1 and 3 to get one 2-page PDF.
  - A 1-page PDF shows "This PDF has one page, so there is nothing to split."
- **Organize:**
  - Drag pages to reorder.
  - Rotate, copy and delete pages; Reset restores the original.
  - "Add PDF" appends `appendix.pdf`; each page then shows its source file name.
- **Rotate:**
  - Clicking a page turns it 90° and shows the angle badge.
  - "All pages: Left/Right" turns every page.
  - With no rotation, the download button is disabled.
- **Compress:** Basic on a text-only PDF reports "not smaller" and says to keep the original. The stage bar shows the before and after sizes.
- **JPG to PDF:**
  - Try A4, Letter and Fit image; the previews change shape.
  - A phone photo with EXIF rotation comes out upright.
  - A `.txt` file shows "Choose JPG, PNG or WebP images."
- **PDF to JPG:**
  - Deselect a page; the count and the ZIP contents follow.
  - 300 DPI shows the pixel size of page 1; PNG output works.
- **Page numbers:**
  - All six positions appear in the preview at the right edge.
  - First numbered page `2` leaves page 1 bare.
  - `9` shows "Choose a first numbered page from 1 to 3." and disables download.
- **Watermark:**
  - Text, colour, size, opacity, angle and Once/Tiled all update the preview.
  - Text in a non-Latin script, such as `秘密`, shows "Use Latin letters, numbers and common punctuation in the watermark."
- **Edit:** open a PDF, add text, sign, highlight and redact; download, and confirm the redacted text is gone from the downloaded file.

## 6. Screenshots

```sh
node .claude/skills/qa/scripts/screenshots.mjs http://127.0.0.1:5186/pdf-editor/ <work>
```

This writes 40 PNGs to `<work>/shots`: every page, empty and loaded, at
1440×900 and 390×844. Look at them all and check:
- the nav and command bar are identical across tools, and nothing overflows on a phone;
- previews fit in view, so marks at the page's top and bottom edges are visible;
- the selected option is clearly visible;
- there are no blank thumbnails.

Pass: `No page errors`.

## 7. Hallmark sweep

The hallmark skill is at `~/.codex/skills/hallmark` (read its `SKILL.md`). Run
the static and render tiers on every page:

```sh
H=~/.codex/skills/hallmark/scripts/sloplint.mjs
for slug in "" merge-pdf split-pdf organize-pdf rotate-pdf compress-pdf jpg-to-pdf pdf-to-jpg add-page-numbers watermark-pdf; do
  node $H src/styles.css src/site.css src/base.css src/tokens.css ${slug:-.}/index.html src/tools src/App.jsx \
    --scope app --genre modern-minimal --render --url http://127.0.0.1:5186/pdf-editor/$slug${slug:+/}
done
```

Pass: `0 FAIL` and `0 WARN` on every page. Waivers and dismissals live in the
stamp at the top of `src/styles.css`. Currently they are F4 (one filled primary
recipe), 42 (the site bar is the tool switcher) and 39b (editor thumbnails). Add
a new one only with a real reason, in the format the stamp already uses.

## 8. Impeccable review

Get a review that is not anchored on whoever made the change: start a fresh
subagent with no history. Give it:
- the impeccable skill at `~/.claude/skills/impeccable/` (`SKILL.md` and
  `reference/critique.md`, `audit.md`, `craft-floor.md`, `mode-operate.md`). Tell
  it to read the docs directly, not run the launcher;
- the screenshots from step 6;
- the code paths: `src/tokens.css`, `src/base.css`, `src/styles.css`,
  `src/site.css`, `src/tools/`, `site/catalog.mjs`, `scripts/build-pages.mjs`;
- the running local URL.

Ask for a ship or fix-first verdict per tool, then ranked findings with file:line
and the exact fix: accessibility, responsive layout, consistency across tools,
copy, and anything that looks generic or machine-made. It must not edit files.
Fix each finding, or record why not, then re-run steps 4, 6 and 7.

## 9. After deploy (live site)

Deploys run on push to `main` (`.github/workflows/deploy.yml`). Wait for the run to
finish (`gh run list -R firstprayer/pdf-editor -L 1`), then:

1. Check that every page and file returns 200:
   ```sh
   for p in "" merge-pdf/ split-pdf/ organize-pdf/ rotate-pdf/ compress-pdf/ jpg-to-pdf/ pdf-to-jpg/ add-page-numbers/ watermark-pdf/ sitemap.xml google3e645556460c9e98.html; do
     printf "%s /%s\n" "$(curl -s -o /dev/null -w '%{http_code}' https://firstprayer.github.io/pdf-editor/$p)" "$p"
   done
   ```
   The sitemap must list 10 `<loc>` entries.
2. Run the end-to-end test on production:
   `node .claude/skills/qa/scripts/e2e.mjs https://firstprayer.github.io/pdf-editor/ <work>`.
3. **GA4:** property "PDF Editor", ID `G-KG29EMDGX2`, account `a411435088`, property
   `p562332431`. In a real (non-headless) browser, open a tool page, run the snippet
   below in the console, then use the tool. It stops the actual file download but
   keeps the event:
   ```js
   HTMLAnchorElement.prototype.click = function () { window.__download = this.download; };
   ```
   `window.dataLayer` must contain `["event","tool_run",{tool:…}]`, and a
   `google-analytics.com/g/collect` request must go out. GA4 Realtime ("Event count by
   Event name") should show `tool_run` within about a minute. Custom dimensions
   Tool (`tool`) and Tool option (`method`) are already registered.
4. **Search Console:** the property `https://firstprayer.github.io/pdf-editor/` is verified by
   `public/google3e645556460c9e98.html`; never delete that file. When pages are added,
   resubmit `sitemap.xml` under Sitemaps.

## Report

Give one line per step: `passed`, `failed` (with the failing output) or
`not run` (with the reason). Then list what changed since the last run and anything
still open.
