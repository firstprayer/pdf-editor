// Captures every page with real files loaded, at 1440x900 and 390x844, for
// visual review (hallmark/impeccable). Usage: node screenshots.mjs <baseUrl> <workDir>
import { mkdir } from "node:fs/promises";
import puppeteer from "puppeteer-core";
import { FIXTURES, writeFixtures } from "./fixtures.mjs";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const [base, work] = process.argv.slice(2);
if (!base || !work) throw new Error("Usage: node screenshots.mjs <baseUrl> <workDir>");
const fixtures = await writeFixtures(`${work}/fixtures`);
const shots = `${work}/shots`;
await mkdir(shots, { recursive: true });
const PAGES = [
  ["edit", "", [FIXTURES.threePages], 'input[aria-label="Open PDF file"]'],
  ["merge-pdf", "merge-pdf/", [FIXTURES.report, FIXTURES.appendix]],
  ["split-pdf", "split-pdf/", [FIXTURES.threePages]],
  ["organize-pdf", "organize-pdf/", [FIXTURES.threePages]],
  ["rotate-pdf", "rotate-pdf/", [FIXTURES.threePages]],
  ["compress-pdf", "compress-pdf/", [FIXTURES.photos]],
  ["jpg-to-pdf", "jpg-to-pdf/", FIXTURES.images],
  ["pdf-to-jpg", "pdf-to-jpg/", [FIXTURES.threePages]],
  ["add-page-numbers", "add-page-numbers/", [FIXTURES.threePages]],
  ["watermark-pdf", "watermark-pdf/", [FIXTURES.threePages]],
];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const errors = [];
for (const [width, height, tag] of [
  [1440, 900, "desk"],
  [390, 844, "phone"],
]) {
  for (const [name, path, files, input] of PAGES) {
    for (const state of ["empty", "loaded"]) {
      const page = await browser.newPage();
      page.on("pageerror", (error) => errors.push(`${name} ${tag}: ${error.message}`));
      await page.setViewport({ width, height });
      await page.goto(`${base}${path}`, { waitUntil: "networkidle0" });
      if (state === "loaded") {
        await (await page.$(input ?? 'input[type="file"]')).uploadFile(...files.map((f) => `${fixtures}/${f}`));
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
      await page.screenshot({ path: `${shots}/${tag}-${name}-${state}.png` });
      await page.close();
    }
  }
}
await browser.close();
console.log(errors.length ? errors.join("\n") : `No page errors. Screenshots in ${shots}`);
