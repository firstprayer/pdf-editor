// End-to-end QA: uploads real files to every page, runs its main action,
// captures the download and validates it.
// Usage: node e2e.mjs <baseUrl> <workDir>
//   baseUrl: http://127.0.0.1:5186/pdf-editor/ (vite preview) or https://firstprayer.github.io/pdf-editor/
// Exits 1 if any case fails. Set CHROME to override the Chrome binary.
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import puppeteer from "puppeteer-core";
import { FIXTURES, writeFixtures } from "./fixtures.mjs";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const [base, work] = process.argv.slice(2);
if (!base || !work) throw new Error("Usage: node e2e.mjs <baseUrl> <workDir>");
const fixtures = await writeFixtures(`${work}/fixtures`);
const file = (name) => `${fixtures}/${name}`;

// Each case: page path, files to upload (input defaults to the page's file
// picker), optional setup clicks, the main button, an optional second button,
// and what the download must contain.
export const CASES = [
  {
    name: "edit",
    path: "",
    input: 'input[aria-label="Open PDF file"]',
    files: [FIXTURES.threePages],
    ready: 3, // the editor opens with a 2-page sample; wait for the uploaded 3 pages
    action: /^Download$/,
    expect: { pdfPages: 3 },
  },
  { name: "merge", path: "merge-pdf/", files: [FIXTURES.report, FIXTURES.appendix], action: /Merge and download/, expect: { pdfPages: 3 } },
  { name: "split (every page)", path: "split-pdf/", files: [FIXTURES.threePages], action: /Split and download/, expect: { zip: 3, ext: ".pdf" } },
  {
    name: "organize (delete page 3)",
    path: "organize-pdf/",
    files: [FIXTURES.threePages],
    setup: `document.querySelector('[aria-label="Delete page 3"]').click()`,
    action: /Save and download/,
    expect: { pdfPages: 2 },
  },
  {
    name: "rotate (page 1 clockwise)",
    path: "rotate-pdf/",
    files: [FIXTURES.threePages],
    setup: `document.querySelector('[aria-label="Turn page 1 clockwise"]').click()`,
    action: /Rotate and download/,
    expect: { pdfPages: 3, firstRotation: 90 },
  },
  { name: "compress (recommended)", path: "compress-pdf/", files: [FIXTURES.photos], action: /^Compress$/, then: /Download compressed PDF/, expect: { pdfPages: 1, smallerThan: FIXTURES.photos } },
  {
    name: "compress (strong)",
    path: "compress-pdf/",
    files: [FIXTURES.photos],
    setup: `document.querySelectorAll('.choice input')[2].click()`,
    action: /^Compress$/,
    then: /Download compressed PDF/,
    expect: { pdfPages: 1, smallerThan: FIXTURES.photos },
  },
  { name: "jpg to pdf", path: "jpg-to-pdf/", files: FIXTURES.images, action: /Convert and download/, expect: { pdfPages: 3 } },
  { name: "pdf to jpg", path: "pdf-to-jpg/", files: [FIXTURES.threePages], action: /Convert and download/, expect: { zip: 3, ext: ".jpg" } },
  { name: "page numbers", path: "add-page-numbers/", files: [FIXTURES.threePages], action: /Add numbers and download/, expect: { pdfPages: 3 } },
  { name: "watermark", path: "watermark-pdf/", files: [FIXTURES.threePages], action: /Add watermark and download/, expect: { pdfPages: 3 } },
];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
let failures = 0;
for (const testCase of CASES) {
  const folder = `${work}/downloads/${testCase.name.replace(/\W+/g, "-")}`;
  await rm(folder, { recursive: true, force: true });
  await mkdir(folder, { recursive: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const cdp = await page.createCDPSession();
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: folder });
  await page.setViewport({ width: 1440, height: 900 });
  let verdict = "";
  try {
    await page.goto(`${base}${testCase.path}`, { waitUntil: "networkidle0" });
    const hasSample = await page.evaluate(() =>
      [...document.querySelectorAll(".tool-shell button")].some((button) => /^Try/.test(button.textContent)),
    );
    if (hasSample) errors.push("tool page still shows a sample button");
    const picker = await page.$(testCase.input ?? 'input[type="file"]');
    await picker.uploadFile(...testCase.files.map(file));
    await page.waitForFunction(
      (count) => document.querySelectorAll(".sheet, .preview-paper, .page-thumbnail").length >= count,
      { timeout: 20000 },
      testCase.ready ?? 1,
    );
    await new Promise((resolve) => setTimeout(resolve, 600));
    if (testCase.setup) {
      await page.evaluate(testCase.setup);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    const click = (pattern) =>
      page.evaluate((source) => {
        const button = [...document.querySelectorAll(".command-actions button")].find(
          (item) => new RegExp(source).test(item.textContent.trim()) && !item.disabled,
        );
        button?.click();
        return !!button;
      }, pattern.source);
    if (!(await click(testCase.action))) throw new Error(`no enabled button ${testCase.action}`);
    if (testCase.then) {
      await page.waitForFunction(
        (source) =>
          [...document.querySelectorAll(".command-actions button")].some((item) => new RegExp(source).test(item.textContent)),
        { timeout: 60000 },
        testCase.then.source,
      );
      await click(testCase.then);
    }
    let files = [];
    for (let attempt = 0; attempt < 150 && !files.length; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      files = (await readdir(folder)).filter((name) => !name.endsWith(".crdownload"));
    }
    if (!files.length) throw new Error("nothing was downloaded");
    const bytes = await readFile(`${folder}/${files[0]}`);
    const { expect } = testCase;
    if (expect.zip) {
      const entries = Object.keys(unzipSync(new Uint8Array(bytes)));
      if (entries.length !== expect.zip || !entries.every((entry) => entry.endsWith(expect.ext))) {
        throw new Error(`zip holds ${entries.join(", ")}`);
      }
      verdict = `${files[0]}: ${entries.length} files`;
    } else {
      const pdf = await PDFDocument.load(bytes);
      if (pdf.getPageCount() !== expect.pdfPages) throw new Error(`${pdf.getPageCount()} pages, expected ${expect.pdfPages}`);
      const rotation = pdf.getPage(0).getRotation().angle;
      if (expect.firstRotation !== undefined && rotation !== expect.firstRotation) {
        throw new Error(`page 1 rotation ${rotation}, expected ${expect.firstRotation}`);
      }
      if (expect.smallerThan) {
        const original = (await readFile(file(expect.smallerThan))).length;
        if (bytes.length >= original) throw new Error(`${bytes.length} B is not smaller than ${original} B`);
      }
      verdict = `${files[0]}: ${pdf.getPageCount()} pages, ${bytes.length} B`;
    }
    if (errors.length) throw new Error(errors.join("; "));
    console.log(`PASS ${testCase.name}  ${verdict}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${testCase.name}  ${error.message}${errors.length ? ` | ${errors.join("; ")}` : ""}`);
  }
  await page.close();
}
await browser.close();
console.log(failures ? `${failures} of ${CASES.length} cases failed` : `All ${CASES.length} cases passed`);
process.exit(failures ? 1 : 0);
