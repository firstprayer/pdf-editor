// Browser-only helpers for the tool pages: reading files, rendering pages,
// encoding images and handing results back to the user as downloads.
import { zipSync } from "fflate";
import { openRenderer } from "../rendering.js";
import { createSampleInvoice, createSamplePdf } from "../sample.js";
import { loadPdf, mergePdfs } from "./ops.js";

export async function readBytes(file) {
  return new Uint8Array(await file.arrayBuffer());
}

export function baseName(name) {
  return (name || "document")
    .replace(/\.[^.]+$/, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .slice(0, 80);
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function plural(count, word, many = `${word}s`) {
  return `${count} ${count === 1 ? word : many}`;
}

export function downloadBytes(bytes, name, type = "application/pdf") {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Downloads one file directly, or several as a ZIP. */
export function downloadFiles(files, zipName) {
  if (files.length === 1) {
    downloadBytes(files[0].bytes, files[0].name, files[0].type);
    return;
  }
  const entries = {};
  for (const file of files) entries[file.name] = [file.bytes, { level: 0 }];
  downloadBytes(zipSync(entries), zipName, "application/zip");
}

export async function openPdf(bytes) {
  return openRenderer(bytes);
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob)
          return reject(new Error("The image could not be created. Try a lower resolution."));
        resolve(new Uint8Array(await blob.arrayBuffer()));
      },
      type,
      quality,
    );
  });
}

/** Renders one page (zero-based) to an encoded image at the given DPI. */
export async function renderPageImage(
  pdf,
  index,
  { dpi = 150, type = "image/jpeg", quality = 0.86 } = {},
) {
  const page = await pdf.getPage(index + 1);
  const natural = page.getViewport({ scale: 1 });
  const limit = Math.min(
    dpi / 72,
    Math.sqrt(30_000_000 / (natural.width * natural.height)),
    10_000 / Math.max(natural.width, natural.height),
  );
  const viewport = page.getViewport({ scale: limit });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  // Print intent renders without waiting for animation frames, so exports keep
  // going in a background tab and match what the document prints.
  await page.render({ canvasContext: context, viewport, intent: "print" }).promise;
  const bytes = await canvasBlob(canvas, type, quality);
  const result = {
    bytes,
    width: natural.width,
    height: natural.height,
    pixels: [canvas.width, canvas.height],
  };
  canvas.width = 0;
  canvas.height = 0;
  page.cleanup();
  return result;
}

/** Re-encodes a JPEG at a lower size and quality. Returns null if it cannot be decoded. */
export function jpegReencoder({ maxDimension, quality }) {
  return async (jpegBytes) => {
    let bitmap;
    try {
      bitmap = await createImageBitmap(new Blob([jpegBytes], { type: "image/jpeg" }));
    } catch {
      return null;
    }
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const bytes = await canvasBlob(canvas, "image/jpeg", quality);
    const result = { bytes, width: canvas.width, height: canvas.height };
    canvas.width = 0;
    canvas.height = 0;
    return result;
  };
}

const IMAGE_TYPES = /^image\/(jpeg|png|webp|gif|bmp|avif|heic|heif)$/;
export const MAX_IMAGE_BYTES = 30 * 1024 * 1024;

export function isImageFile(file) {
  return (
    IMAGE_TYPES.test(file.type) || /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i.test(file.name)
  );
}

/** Prepares an image file for embedding: JPEG and PNG pass through, others become PNG. */
export async function imageForPdf(file) {
  const bytes = file.bytes ?? (await readBytes(file));
  let bitmap;
  try {
    bitmap = await createImageBitmap(new Blob([bytes], { type: file.type || "image/*" }));
  } catch {
    throw new Error(`${file.name} could not be read. Convert it to JPG or PNG first.`);
  }
  const { width, height } = bitmap;
  const isJpeg = file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name);
  const isPng = file.type === "image/png" || /\.png$/i.test(file.name);
  // The browser draws EXIF-rotated phone photos upright; PDF embeds raw pixels.
  // Pass JPEGs through untouched unless they carry a rotation.
  if ((isJpeg && jpegOrientation(bytes) === 1) || isPng) {
    bitmap.close();
    return { bytes, kind: isJpeg ? "jpg" : "png", width, height };
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0);
  bitmap.close();
  const encoded = isJpeg
    ? await canvasBlob(canvas, "image/jpeg", 0.92)
    : await canvasBlob(canvas, "image/png");
  canvas.width = 0;
  canvas.height = 0;
  return { bytes: encoded, kind: isJpeg ? "jpg" : "png", width, height };
}

/** Reads the EXIF orientation tag of a JPEG (1 when absent). */
export function jpegOrientation(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 1;
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset);
    const length = view.getUint16(offset + 2);
    if (marker === 0xffe1 && view.getUint32(offset + 4) === 0x45786966) {
      const tiff = offset + 10;
      if (tiff + 8 > view.byteLength) return 1;
      const little = view.getUint16(tiff) === 0x4949;
      const ifd = tiff + view.getUint32(tiff + 4, little);
      if (ifd + 2 > view.byteLength) return 1;
      const entries = view.getUint16(ifd, little);
      for (let entry = 0; entry < entries; entry += 1) {
        const at = ifd + 2 + entry * 12;
        if (at + 12 > view.byteLength) return 1;
        if (view.getUint16(at, little) === 0x0112) return view.getUint16(at + 8, little) || 1;
      }
      return 1;
    }
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return 1;
    offset += 2 + length;
  }
  return 1;
}

let nextId = 0;

/** Validates a PDF and opens it for previews. Accepts a File or {name, bytes}. */
export async function preparePdf(input) {
  const bytes = input.bytes ?? (await readBytes(input));
  const document = await loadPdf(bytes);
  const pdf = await openPdf(bytes);
  nextId += 1;
  return {
    id: `doc-${nextId}`,
    name: input.name,
    size: bytes.length,
    bytes,
    pdf,
    pageCount: document.getPageCount(),
  };
}

export async function samplePdfs() {
  return [
    { name: "project-agreement.pdf", bytes: await createSamplePdf() },
    { name: "invoice.pdf", bytes: await createSampleInvoice() },
  ];
}

/** A three-page sample: the agreement followed by the invoice. */
export async function samplePack() {
  const [agreement, invoice] = await samplePdfs();
  return { name: "sample-documents.pdf", bytes: await mergePdfs([agreement.bytes, invoice.bytes]) };
}
