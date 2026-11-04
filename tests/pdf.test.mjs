import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import test from "node:test";
import { createCanvas, DOMMatrix, ImageData, loadImage, Path2D } from "@napi-rs/canvas";
import { degrees, PDFDocument, PDFName, PDFNumber, rgb, StandardFonts } from "pdf-lib";
import { exportPdf, inspectPdf, renderRedactedPage, validateText } from "../src/pdf.js";
import { createSamplePdf } from "../src/sample.js";

Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const require = createRequire(import.meta.url);
const library = dirname(require.resolve("pdfjs-dist/package.json"));

async function readPdf(bytes) {
  return pdfjs.getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    cMapUrl: `${library}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${library}/standard_fonts/`,
    wasmUrl: `${library}/wasm/`,
  }).promise;
}

async function textOn(bytes, pageNumber = 1) {
  const document = await readPdf(bytes);
  try {
    return (await (await document.getPage(pageNumber)).getTextContent()).items
      .map((item) => item.str)
      .join(" ");
  } finally {
    await document.loadingTask.destroy();
  }
}

function page(sourceId, index, annotations = [], rotation = 0) {
  return { id: `${sourceId}-${index}`, sourceId, index, rotation, annotations };
}

test("real PDF round trip merges, reorders, duplicates, rotates, and retains original searchable text", async () => {
  const sample = await createSamplePdf();
  const extra = await PDFDocument.create();
  extra.addPage([300, 400]).drawText("Imported appendix", { x: 20, y: 300 });
  const other = await extra.save();
  const output = await exportPdf({
    sources: { a: { bytes: sample }, b: { bytes: other } },
    pages: [
      page("b", 0),
      page("a", 1, [], 90),
      page("a", 0, [
        {
          type: "text",
          x: 54,
          y: 190,
          size: 12,
          font: "bold",
          color: "#24549a",
          text: "Approved for review\nSecond line",
        },
      ]),
      page("a", 0),
    ],
  });
  const document = await PDFDocument.load(output);
  assert.equal(document.getPageCount(), 4);
  assert.equal(document.getPages()[1].getRotation().angle, 90);
  assert.match(await textOn(output, 1), /Imported appendix/);
  assert.match(await textOn(output, 2), /Project notes/);
  assert.match(await textOn(output, 3), /Approved for review.*Second line/);
  assert.match(await textOn(output, 4), /Project agreement/);
});

test("signature, image, highlight and freehand drawing export as real PDF content", async () => {
  const canvas = createCanvas(100, 30);
  const context = canvas.getContext("2d");
  context.strokeStyle = "#253248";
  context.beginPath();
  context.moveTo(0, 20);
  context.lineTo(90, 5);
  context.stroke();
  const dataUrl = canvas.toDataURL("image/png");
  const output = await exportPdf({
    sources: { a: { bytes: await createSamplePdf() } },
    pages: [
      page("a", 0, [
        { type: "signature", dataUrl, x: 54, y: 140, width: 120, height: 36 },
        { type: "image", dataUrl, x: 250, y: 140, width: 100, height: 30 },
        { type: "highlight", x: 54, y: 490, width: 150, height: 16, color: "#f4ce5d" },
        {
          type: "draw",
          points: [
            [54, 120],
            [100, 130],
            [150, 120],
          ],
          strokeWidth: 2,
          color: "#24549a",
        },
      ]),
    ],
  });
  const document = await readPdf(output);
  const first = await document.getPage(1);
  const operatorList = await first.getOperatorList();
  assert.ok(
    operatorList.fnArray.filter((operator) => operator === pdfjs.OPS.paintImageXObject).length >= 2,
  );
  assert.match(await textOn(output), /Project agreement/);
  await document.loadingTask.destroy();
});

test("redaction removes original and newly added sensitive content, including hidden PDF objects", async () => {
  const original = await PDFDocument.create();
  const first = original.addPage([400, 300]);
  const font = await original.embedFont(StandardFonts.Helvetica);
  first.drawText("ORIGINAL-SENSITIVE-78391", { x: 40, y: 240, size: 16, font });
  first.drawText("Public information", { x: 40, y: 120, size: 16, font });
  const bytes = await original.save();
  const renderedSource = await readPdf(bytes);
  const descriptor = page("a", 0, [
    {
      type: "text",
      x: 40,
      y: 220,
      size: 12,
      font: "sans",
      color: "#253248",
      text: "NEW-SENSITIVE-18275",
    },
    { type: "redact", x: 30, y: 205, width: 350, height: 60 },
  ]);
  const output = await exportPdf({
    sources: { a: { bytes } },
    pages: [descriptor],
    renderFlattenedPage: async (item) =>
      renderRedactedPage(
        await renderedSource.getPage(1),
        item.annotations,
        createCanvas,
        (canvas) => canvas.encode("png"),
        loadImage,
      ),
  });
  assert.equal((await textOn(output)).trim(), "");
  const visible = await readPdf(output);
  const pdfPage = await visible.getPage(1);
  const canvas = createCanvas(400, 300);
  await pdfPage.render({
    canvasContext: canvas.getContext("2d"),
    viewport: pdfPage.getViewport({ scale: 1 }),
  }).promise;
  assert.deepEqual(
    Array.from(canvas.getContext("2d").getImageData(60, 60, 1, 1).data),
    [23, 32, 45, 255],
  );
  const libraryDoc = await PDFDocument.load(output);
  assert.ok(
    libraryDoc.context.enumerateIndirectObjects().length < 15,
    "sanitized file must not carry original page objects",
  );
  await renderedSource.loadingTask.destroy();
  await visible.loadingTask.destroy();
});

test("editing original text removes the old text and writes a searchable replacement", async () => {
  const bytes = await createSamplePdf();
  const source = await readPdf(bytes);
  const sourcePage = await source.getPage(1);
  const item = (await sourcePage.getTextContent()).items.find(
    (entry) => entry.str === "Website redesign",
  );
  const size = Math.hypot(item.transform[2], item.transform[3]);
  const replacement = {
    type: "replace",
    x: item.transform[4],
    y: item.transform[5],
    originalX: item.transform[4],
    originalY: item.transform[5],
    originalWidth: item.width,
    originalSize: size,
    size: 12,
    color: "#253248",
    font: "sans",
    text: "Updated project name",
  };
  const output = await exportPdf({
    sources: { a: { bytes } },
    pages: [page("a", 0, [replacement])],
    renderFlattenedPage: async (descriptor) =>
      renderRedactedPage(
        sourcePage,
        descriptor.annotations,
        createCanvas,
        (canvas) => canvas.encode("png"),
        loadImage,
      ),
  });
  const text = await textOn(output);
  assert.match(text, /Updated project name/);
  assert.doesNotMatch(text, /Your next project/);
  await source.loadingTask.destroy();
});

test("flattened pages preserve cropped coordinates and intrinsic plus user rotation", async () => {
  const original = await PDFDocument.create();
  const first = original.addPage([400, 400]);
  first.setCropBox(20, 40, 200, 250);
  first.setRotation(degrees(90));
  first.drawText("Private", { x: 30, y: 250, color: rgb(0, 0, 0) });
  const bytes = await original.save();
  const source = await readPdf(bytes);
  const output = await exportPdf({
    sources: { a: { bytes } },
    pages: [
      page(
        "a",
        0,
        [
          {
            type: "replace",
            originalX: 30,
            originalY: 250,
            originalWidth: 90,
            originalSize: 24,
            x: 70,
            y: 100,
            text: "New",
            size: 12,
            color: "#253248",
            font: "sans",
          },
        ],
        90,
      ),
    ],
    renderFlattenedPage: async (descriptor) =>
      renderRedactedPage(
        await source.getPage(1),
        descriptor.annotations,
        createCanvas,
        (canvas) => canvas.encode("png"),
        loadImage,
      ),
  });
  const document = await PDFDocument.load(output);
  assert.equal(document.getPages()[0].getWidth(), 200);
  assert.equal(document.getPages()[0].getHeight(), 250);
  assert.equal(document.getPages()[0].getRotation().angle, 180);
  const parsed = await readPdf(output);
  const entry = (await (await parsed.getPage(1)).getTextContent()).items.find(
    (item) => item.str === "New",
  );
  assert.equal(entry.transform[4], 50);
  assert.equal(entry.transform[5], 60);
  await source.loadingTask.destroy();
  await parsed.loadingTask.destroy();
});

test("non-default PDF user units preserve the physical position and size of replacement text", async () => {
  const original = await PDFDocument.create();
  const first = original.addPage([400, 400]);
  first.setCropBox(20, 40, 200, 250);
  first.node.set(PDFName.of("UserUnit"), PDFNumber.of(2));
  first.drawText("Private", { x: 30, y: 250 });
  const bytes = await original.save();
  const source = await readPdf(bytes);
  const output = await exportPdf({
    sources: { a: { bytes } },
    pages: [
      page("a", 0, [
        {
          type: "replace",
          originalX: 30,
          originalY: 250,
          originalWidth: 90,
          originalSize: 24,
          x: 70,
          y: 100,
          text: "New",
          size: 12,
          color: "#253248",
          font: "sans",
        },
      ]),
    ],
    renderFlattenedPage: async (descriptor) =>
      renderRedactedPage(
        await source.getPage(1),
        descriptor.annotations,
        createCanvas,
        (canvas) => canvas.encode("png"),
        loadImage,
      ),
  });
  const document = await readPdf(output);
  const pdfPage = await document.getPage(1);
  const entry = (await pdfPage.getTextContent()).items.find((item) => item.str === "New");
  assert.equal(pdfPage.getViewport({ scale: 1 }).width, 400);
  assert.equal(entry.transform[4], 100);
  assert.equal(entry.transform[5], 120);
  assert.equal(entry.transform[0], 24);
  await source.loadingTask.destroy();
  await document.loadingTask.destroy();
});

test("invalid, oversized and unsupported-text inputs fail without generating a corrupt output", async () => {
  await assert.rejects(inspectPdf(new Uint8Array()), /50 MB/);
  await assert.rejects(inspectPdf(new Uint8Array(50 * 1024 * 1024 + 1)), /50 MB/);
  await assert.rejects(inspectPdf(new TextEncoder().encode("not a pdf")), /password-free/);
  await assert.rejects(exportPdf({ sources: {}, pages: [] }), /1 to 200/);
  assert.throws(() => validateText("\u4e2d"), /Latin text/);
  assert.doesNotThrow(() => validateText("Caf\u00e9 \u2014 approved \u20ac20"));
});
