// Redaction check: proves that text under a redaction is gone from the
// downloaded PDF, not just covered.
// Usage: node redaction.mjs <baseUrl> <workDir>
//   baseUrl: http://127.0.0.1:5186/pdf-editor/ or https://firstprayer.github.io/pdf-editor/
//
// The input PDF puts one marker string in each place text can hide: the page
// text under the redaction, a sticky-note annotation on that page, the
// document title, subject and keywords, and a bookmark. The script first
// confirms every marker is findable in the input, then redacts the marker
// line in the editor, downloads, and searches the output with PDF.js (text,
// annotations, metadata, outline) and in every decompressed object, as plain
// text and as the hex strings pdf-lib writes. Exits 1 if any marker survives.
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import {
  PDFArray,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFString,
  StandardFonts,
} from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import puppeteer from "puppeteer-core";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const [base, work] = process.argv.slice(2);
if (!base || !work) throw new Error("Usage: node redaction.mjs <baseUrl> <workDir>");

const MARKERS = {
  pageText: "SECRETBODY4417",
  annotation: "SECRETNOTE5521",
  title: "SECRETTITLE6630",
  subject: "SECRETSUBJECT7741",
  keywords: "SECRETKEYWORD8852",
  bookmark: "SECRETBOOKMARK9963",
};
const KEPT = "PAGETWOKEPT"; // text on page 2, which is not redacted
const SIZE = [612, 792];
const LINE_Y = 700; // baseline of the marker line, in PDF points from the bottom

async function inputPdf() {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const first = document.addPage(SIZE);
  first.drawText(`Account ${MARKERS.pageText}`, { x: 72, y: LINE_Y, size: 18, font });
  first.drawText("Text below the redaction", { x: 72, y: 600, size: 18, font });
  document.addPage(SIZE).drawText(KEPT, { x: 72, y: LINE_Y, size: 18, font });
  // A third page tells the upload apart from the editor's 2-page sample.
  document.addPage(SIZE).drawText("Page three", { x: 72, y: LINE_Y, size: 18, font });
  document.setTitle(MARKERS.title);
  document.setSubject(MARKERS.subject);
  document.setKeywords([MARKERS.keywords]);

  const context = document.context;
  const note = context.register(
    context.obj({
      Type: "Annot",
      Subtype: "Text",
      Rect: [72, 650, 92, 670],
      Contents: PDFString.of(MARKERS.annotation),
    }),
  );
  first.node.set(PDFName.of("Annots"), context.obj([note]));

  const outlines = context.nextRef();
  const item = context.register(
    context.obj({
      Title: PDFString.of(MARKERS.bookmark),
      Parent: outlines,
      Dest: [first.ref, PDFName.of("XYZ"), null, null, null],
    }),
  );
  context.assign(
    outlines,
    context.obj({ Type: "Outlines", First: item, Last: item, Count: PDFNumber.of(1) }),
  );
  document.catalog.set(PDFName.of("Outlines"), outlines);
  return document.save({ useObjectStreams: false });
}

// Every place a marker could be, as one searchable string per source.
async function haystacks(bytes) {
  const found = {};
  const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false });
  const pdf = await task.promise;
  const text = [];
  const notes = [];
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const page = await pdf.getPage(number);
    text.push((await page.getTextContent()).items.map((entry) => entry.str).join(" "));
    notes.push(JSON.stringify(await page.getAnnotations()));
  }
  found.text = text;
  found.annotations = notes.join(" ");
  found.metadata = JSON.stringify(await pdf.getMetadata());
  found.outline = JSON.stringify(await pdf.getOutline());
  await task.destroy();

  // Raw objects, with Flate streams decompressed.
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  const raw = [];
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    if (object instanceof PDFRawStream) {
      const filter = object.dict.get(PDFName.of("Filter"));
      const flate = filter?.toString() === "/FlateDecode";
      try {
        raw.push(Buffer.from(flate ? inflateSync(object.contents) : object.contents).toString("latin1"));
      } catch {
        raw.push(Buffer.from(object.contents).toString("latin1"));
      }
      raw.push(object.dict.toString());
    } else {
      raw.push(object.toString());
    }
  }
  found.raw = raw.join("\n");
  return found;
}

function locate(found, marker) {
  const hex = PDFHexString.fromText(marker).asString(); // UTF-16 form
  const plainHex = Buffer.from(marker, "latin1").toString("hex");
  const places = [];
  found.text.forEach((pageText, index) => pageText.includes(marker) && places.push(`text p${index + 1}`));
  if (found.annotations.includes(marker)) places.push("annotations");
  if (found.metadata.includes(marker)) places.push("metadata");
  if (found.outline.includes(marker)) places.push("outline");
  const raw = found.raw.toLowerCase();
  if (found.raw.includes(marker)) places.push("raw");
  if (raw.includes(plainHex) || raw.includes(hex.toLowerCase())) places.push("raw hex");
  return places;
}

await mkdir(work, { recursive: true });
const inputPath = `${work}/redaction-input.pdf`;
const input = await inputPdf();
await writeFile(inputPath, input);

// Positive control: every marker must be findable in the input.
const before = await haystacks(new Uint8Array(input));
let failures = 0;
for (const [name, marker] of Object.entries(MARKERS)) {
  const places = locate(before, marker);
  console.log(`input  ${name.padEnd(10)} ${marker}: ${places.join(", ") || "NOT FOUND"}`);
  if (!places.length) failures += 1;
}
if (failures) {
  console.log("The input check failed, so the output check would prove nothing.");
  process.exit(1);
}

const folder = `${work}/downloads/redaction`;
await rm(folder, { recursive: true, force: true });
await mkdir(folder, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const cdp = await page.createCDPSession();
await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: folder });
await page.setViewport({ width: 1440, height: 1000 });
await page.goto(base, { waitUntil: "networkidle0" });
await (await page.$('input[aria-label="Open PDF file"]')).uploadFile(inputPath);
// The editor opens with a 2-page sample; wait for the 3 uploaded pages.
await page.waitForFunction(() => document.querySelectorAll(".page-thumbnail").length >= 3, {
  timeout: 20000,
});
await new Promise((resolve) => setTimeout(resolve, 1000));
await page.evaluate(() =>
  [...document.querySelectorAll(".tool-list button")]
    .find((button) => button.textContent.trim() === "Redact")
    .click(),
);
const layer = await page.$(".annotation-layer");
const box = await layer.boundingBox();
const top = (SIZE[1] - LINE_Y - 22) / SIZE[1];
const bottom = (SIZE[1] - LINE_Y + 8) / SIZE[1];
await page.mouse.move(box.x + box.width * 0.05, box.y + box.height * top);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.95, box.y + box.height * bottom, { steps: 12 });
await page.mouse.up();
await new Promise((resolve) => setTimeout(resolve, 500));
await page.evaluate(() =>
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent.trim() === "Download")
    .click(),
);
let files = [];
for (let attempt = 0; attempt < 150 && !files.length; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 200));
  files = (await readdir(folder)).filter((name) => !name.endsWith(".crdownload"));
}
await browser.close();
if (!files.length) {
  console.log(`FAIL nothing was downloaded ${errors.join("; ")}`);
  process.exit(1);
}

const output = new Uint8Array(await readFile(`${folder}/${files[0]}`));
const after = await haystacks(output);
console.log(`output ${files[0]}, ${output.length} B`);
for (const [name, marker] of Object.entries(MARKERS)) {
  const places = locate(after, marker);
  console.log(`output ${name.padEnd(10)} ${marker}: ${places.length ? `FOUND in ${places.join(", ")}` : "gone"}`);
  if (places.length) failures += 1;
}
// Controls: the unredacted page keeps its text, so extraction itself works.
const keptPlaces = locate(after, KEPT);
console.log(`output kept text  ${KEPT}: ${keptPlaces.join(", ") || "NOT FOUND"}`);
if (!keptPlaces.includes("text p2")) failures += 1;
console.log(`output page 1 extractable text: ${JSON.stringify(after.text[0])}`);
if (errors.length) {
  console.log(`page errors: ${errors.join("; ")}`);
  failures += 1;
}
console.log(failures ? `FAIL ${failures} check(s)` : "PASS every marker is gone from the download");
process.exit(failures ? 1 : 0);
