import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import test from "node:test";
import { createCanvas, DOMMatrix, ImageData, loadImage, Path2D } from "@napi-rs/canvas";
import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib";
import {
  addPageNumbers,
  addWatermark,
  assemblePages,
  checkPdfFiles,
  compressImages,
  compressLossless,
  imagesToPdf,
  mergePdfs,
  numberLabel,
  pagesFromJpegs,
  parseRanges,
  splitPdf,
  visualFrame,
} from "../src/tools/ops.js";
import { createSamplePdf } from "../src/sample.js";

Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const library = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));

async function withPdf(bytes, read) {
  const document = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    cMapUrl: `${library}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${library}/standard_fonts/`,
    wasmUrl: `${library}/wasm/`,
  }).promise;
  try {
    return await read(document);
  } finally {
    await document.loadingTask.destroy();
  }
}

const textItems = (bytes, pageNumber = 1) =>
  withPdf(
    bytes,
    async (document) => (await (await document.getPage(pageNumber)).getTextContent()).items,
  );
const text = async (bytes, pageNumber) =>
  (await textItems(bytes, pageNumber)).map((item) => item.str).join(" ");

async function numberedPdf(count, rotation = 0) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < count; index += 1) {
    const page = document.addPage([400, 600]);
    page.drawText(`Body ${index + 1}`, { x: 50, y: 300, size: 20, font });
    if (rotation) page.setRotation(degrees(rotation));
  }
  return document.save();
}

// A one-page invoice to pair with the agreement in multi-file samples.
async function createSampleInvoice() {
  const document = await PDFDocument.create();
  document.setTitle("Sample invoice");
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const serif = await document.embedFont(StandardFonts.TimesRoman);
  const ink = rgb(0.13, 0.15, 0.2);
  const muted = rgb(0.4, 0.43, 0.48);
  const rule = rgb(0.83, 0.84, 0.86);
  const page = document.addPage([595, 842]);
  const text = (value, x, y, size = 10.5, font = regular, color = ink) =>
    page.drawText(value, { x, y, size, font, color });
  const right = (value, y, size = 10.5, font = regular) =>
    text(value, 541 - font.widthOfTextAtSize(value, size), y, size, font);
  const line = (y) =>
    page.drawLine({ start: { x: 54, y }, end: { x: 541, y }, color: rule, thickness: 0.6 });

  text("Halden & Ruiz Studio", 54, 778, 12, bold);
  text("Invoice HR-INV-0381", 440, 778, 9, regular, muted);
  line(760);
  text("Invoice", 54, 712, 28, serif);
  text("Deposit for agreement HR-2026-014", 54, 688, 11, regular, muted);
  text("Billed to", 54, 648, 8.5, regular, muted);
  text("Marlow Bakery Ltd.", 54, 632, 11, bold);
  text("Issued", 232, 648, 8.5, regular, muted);
  text("4 November 2026", 232, 632, 11);
  text("Due", 410, 648, 8.5, regular, muted);
  text("18 November 2026", 410, 632, 11);
  line(610);
  text("Description", 54, 584, 8.5, regular, muted);
  right("Amount", 584, 8.5);
  [
    ["Deposit: 50% of $2,000.00", "$1,000.00"],
    ["Sales tax (0%)", "$0.00"],
  ].forEach(([label, amount], index) => {
    text(label, 54, 556 - index * 26);
    right(amount, 556 - index * 26);
  });
  line(486);
  text("Amount due", 54, 466, 11, bold);
  right("$1,000.00", 466, 11, bold);
  text(
    "Pay by bank transfer within 14 days and quote the invoice number.",
    54,
    420,
    10.5,
    regular,
    muted,
  );
  line(75);
  text("Sample document. All names and figures are fictional.", 54, 58, 8, regular, muted);
  return document.save();
}

test("checkPdfFiles enforces type, size and count", () => {
  const pdf = { name: "a.pdf", type: "application/pdf", size: 1000 };
  assert.doesNotThrow(() => checkPdfFiles([pdf]));
  assert.throws(
    () => checkPdfFiles([{ name: "a.png", type: "image/png", size: 10 }]),
    /PDF files only/,
  );
  assert.throws(() => checkPdfFiles([{ ...pdf, size: 60 * 1024 * 1024 }]), /50 MB/);
  assert.throws(() => checkPdfFiles(Array(21).fill(pdf)), /up to 20/);
});

test("mergePdfs keeps every page in order", async () => {
  const merged = await mergePdfs([await createSamplePdf(), await createSampleInvoice()]);
  const document = await PDFDocument.load(merged);
  assert.equal(document.getPageCount(), 3);
  assert.match(await text(merged, 1), /Project agreement/);
  assert.match(await text(merged, 2), /Project notes/);
  assert.match(await text(merged, 3), /Invoice/);
  await assert.rejects(mergePdfs([merged]), /at least two/);
});

test("parseRanges reads ranges, open ends and reports mistakes", () => {
  assert.deepEqual(parseRanges("1-3, 5", 6), [[0, 1, 2], [4]]);
  assert.deepEqual(parseRanges("5-", 6), [[4, 5]]);
  assert.deepEqual(parseRanges("2 to 3; 6", 6), [[1, 2], [5]]);
  assert.throws(() => parseRanges("", 6), /Enter page ranges/);
  assert.throws(() => parseRanges("4-2", 6), /outside pages 1 to 6/);
  assert.throws(() => parseRanges("9", 6), /outside/);
  assert.throws(() => parseRanges("a-b", 6), /not a page range/);
});

test("splitPdf makes one file per group", async () => {
  const source = await numberedPdf(5);
  const results = await splitPdf(source, parseRanges("1-2, 5", 5));
  assert.equal(results.length, 2);
  assert.equal((await PDFDocument.load(results[0].bytes)).getPageCount(), 2);
  assert.match(await text(results[1].bytes, 1), /Body 5/);
});

test("assemblePages reorders, drops and rotates pages", async () => {
  const source = await numberedPdf(3);
  const output = await assemblePages(
    [source],
    [
      { source: 0, index: 2, rotation: 90 },
      { source: 0, index: 0, rotation: -90 },
    ],
  );
  const document = await PDFDocument.load(output);
  assert.equal(document.getPageCount(), 2);
  assert.equal(document.getPage(0).getRotation().angle, 90);
  assert.equal(document.getPage(1).getRotation().angle, 270);
  assert.match(await text(output, 1), /Body 3/);
});

test("numberLabel supports formats, offsets and skipped pages", () => {
  assert.equal(numberLabel({ format: "pageOf" }, 2, 5), "Page 2 of 5");
  assert.equal(numberLabel({ format: "slash", from: 2, start: 1 }, 1, 5), "");
  assert.equal(numberLabel({ format: "slash", from: 2, start: 1 }, 2, 5), "1 / 4");
  assert.equal(numberLabel({ format: "plain", start: 10 }, 3, 5), "12");
});

test("addPageNumbers writes upright, positioned numbers on every page", async () => {
  const output = await addPageNumbers(await numberedPdf(3), {
    position: "bottom-right",
    format: "pageOf",
    size: 10,
    margin: 28,
  });
  const items = await textItems(output, 3);
  const label = items.find((item) => item.str === "Page 3 of 3");
  assert.ok(label, "label is present");
  const [, , , , x, y] = label.transform;
  assert.equal(Math.round(y), 28);
  assert.ok(x > 300 && x < 372, `right aligned, x=${x}`);
  await assert.rejects(addPageNumbers(await numberedPdf(1), { from: 3 }), /between 1 and 1/);
});

test("page numbers sit at the visual bottom of rotated pages", async () => {
  const output = await addPageNumbers(await numberedPdf(1, 90), { position: "bottom-center" });
  const frame = visualFrame((await PDFDocument.load(output)).getPage(0));
  assert.equal(frame.width, 600);
  assert.equal(frame.height, 400);
  await withPdf(output, async (document) => {
    const page = await document.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const item = (await page.getTextContent()).items.find((entry) => entry.str === "1");
    const [vx, vy] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
    assert.ok(Math.abs(vy - (400 - 28)) < 2, `baseline near the visual bottom, y=${vy}`);
    assert.ok(vx > 280 && vx < 310, `centred horizontally, x=${vx}`);
  });
});

test("addWatermark stamps every page and validates text", async () => {
  const output = await addWatermark(await numberedPdf(2), { text: "DRAFT", layout: "single" });
  assert.match(await text(output, 2), /DRAFT/);
  const tiled = await addWatermark(await numberedPdf(1), {
    text: "COPY",
    layout: "tile",
    size: 30,
  });
  assert.ok((await textItems(tiled, 1)).filter((item) => item.str === "COPY").length > 4);
  await assert.rejects(addWatermark(await numberedPdf(1), { text: "  " }), /Type the watermark/);
  await assert.rejects(addWatermark(await numberedPdf(1), { text: "秘密" }), /Latin/);
});

function pngOf(width, height) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.fillStyle = "#3366aa";
  context.fillRect(0, 0, width, height);
  return { bytes: canvas.toBuffer("image/png"), kind: "png", width, height };
}

test("imagesToPdf sizes pages and keeps image proportions", async () => {
  const output = await imagesToPdf([pngOf(800, 600), pngOf(300, 900)], {
    pageSize: "a4",
    orientation: "auto",
    margin: "small",
  });
  const document = await PDFDocument.load(output);
  assert.equal(document.getPageCount(), 2);
  assert.ok(
    document.getPage(0).getWidth() > document.getPage(0).getHeight(),
    "landscape for wide image",
  );
  assert.ok(
    document.getPage(1).getWidth() < document.getPage(1).getHeight(),
    "portrait for tall image",
  );
  const fit = await PDFDocument.load(
    await imagesToPdf([pngOf(400, 200)], { pageSize: "fit", margin: "none" }),
  );
  assert.equal(Math.round(fit.getPage(0).getWidth() / fit.getPage(0).getHeight()), 2);
});

test("compressLossless produces a valid, equivalent PDF", async () => {
  const output = await compressLossless(await createSamplePdf());
  assert.match(await text(output, 1), /Project agreement/);
});

async function photoPdf() {
  const canvas = createCanvas(2000, 1400);
  const context = canvas.getContext("2d");
  for (let index = 0; index < 400; index += 1) {
    context.fillStyle = `hsl(${index % 360}, 50%, ${30 + (index % 40)}%)`;
    context.fillRect((index * 37) % 2000, (index * 91) % 1400, 120, 90);
  }
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const page = document.addPage([595, 842]);
  page.drawText("Caption text", { x: 50, y: 800, size: 12, font });
  const image = await document.embedJpg(canvas.toBuffer("image/jpeg", 95));
  page.drawImage(image, { x: 50, y: 300, width: 495, height: 346 });
  return document.save();
}

test("compressImages shrinks photos and keeps text", async () => {
  const source = await photoPdf();
  const reencode = async (jpeg) => {
    const image = await loadImage(Buffer.from(jpeg));
    const scale = 800 / Math.max(image.width, image.height);
    const canvas = createCanvas(Math.round(image.width * scale), Math.round(image.height * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    return { bytes: canvas.toBuffer("image/jpeg", 60), width: canvas.width, height: canvas.height };
  };
  const result = await compressImages(source, reencode);
  assert.equal(result.images, 1);
  assert.equal(result.replaced, 1);
  assert.ok(
    result.bytes.length < source.length * 0.5,
    `${result.bytes.length} vs ${source.length}`,
  );
  assert.match(await text(result.bytes, 1), /Caption text/);
  await withPdf(result.bytes, async (document) => {
    const page = await document.getPage(1);
    const canvas = createCanvas(300, 424);
    await page.render({
      canvasContext: canvas.getContext("2d"),
      viewport: page.getViewport({ scale: 0.5 }),
    }).promise;
  });
  const untouched = await compressImages(source, async () => null);
  assert.equal(untouched.replaced, 0);
});

test("pagesFromJpegs builds one image page per entry", async () => {
  const canvas = createCanvas(100, 140);
  canvas.getContext("2d").fillRect(0, 0, 50, 50);
  const output = await pagesFromJpegs([
    { bytes: canvas.toBuffer("image/jpeg", 80), width: 595, height: 842 },
    { bytes: canvas.toBuffer("image/jpeg", 80), width: 842, height: 595 },
  ]);
  const document = await PDFDocument.load(output);
  assert.equal(document.getPageCount(), 2);
  assert.equal(Math.round(document.getPage(1).getWidth()), 842);
});
