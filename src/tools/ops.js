// PDF operations shared by the tool pages. Pure pdf-lib, no DOM, so every
// function here runs in Node tests. Browser-only steps (rendering, image
// decoding) are passed in as callbacks.
import {
  degrees,
  PDFArray,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  StandardFonts,
} from "pdf-lib";
import { MAX_FILE_BYTES, MAX_PAGES, MAX_WORKSPACE_BYTES } from "../model.js";
import { pdfColor } from "../pdf.js";

export const MAX_FILES = 20;
export const PAGE_SIZES = { a4: [595.28, 841.89], letter: [612, 792] };

function stamp(document) {
  document.setProducer("PDF Editor");
  document.setCreator("PDF Editor");
  return document;
}

export function isPdfFile(file) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

export function checkPdfFiles(files, existingBytes = 0, existingCount = 0) {
  if (!files.length) throw new Error("Choose at least one PDF.");
  if (files.some((file) => !isPdfFile(file))) throw new Error("Choose PDF files only.");
  if (files.some((file) => file.size > MAX_FILE_BYTES)) {
    throw new Error("Choose PDF files smaller than 50 MB each.");
  }
  if (existingCount + files.length > MAX_FILES) throw new Error(`Add up to ${MAX_FILES} files.`);
  if (existingBytes + files.reduce((sum, file) => sum + file.size, 0) > MAX_WORKSPACE_BYTES) {
    throw new Error("Keep your files within 100 MB combined.");
  }
}

export async function loadPdf(bytes) {
  if (!bytes.length || bytes.length > MAX_FILE_BYTES) {
    throw new Error("Choose a PDF smaller than 50 MB.");
  }
  let document;
  try {
    document = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (error) {
    if (/encrypted/i.test(String(error?.message))) {
      throw new Error("This PDF is password-protected. Unlock it first, then try again.", {
        cause: error,
      });
    }
    throw new Error("This PDF could not be opened. Try a valid, password-free copy.", {
      cause: error,
    });
  }
  if (!document.getPageCount()) throw new Error("This PDF has no pages.");
  if (document.getPageCount() > MAX_PAGES) throw new Error("Choose a PDF with up to 200 pages.");
  return document;
}

/**
 * Builds a new PDF from pages of one or more sources.
 * @param {Uint8Array[]} sources
 * @param {{source: number, index: number, rotation?: number}[]} pages
 */
export async function assemblePages(sources, pages) {
  if (!pages.length) throw new Error("Keep at least one page.");
  if (pages.length > MAX_PAGES) throw new Error("Keep the result within 200 pages.");
  const output = stamp(await PDFDocument.create());
  const loaded = new Map();
  for (const { source, index, rotation = 0 } of pages) {
    if (!loaded.has(source)) loaded.set(source, await loadPdf(sources[source]));
    const [copied] = await output.copyPages(loaded.get(source), [index]);
    const page = output.addPage(copied);
    if (rotation)
      page.setRotation(degrees((((page.getRotation().angle + rotation) % 360) + 360) % 360));
  }
  return output.save({ useObjectStreams: true });
}

export async function mergePdfs(sources) {
  if (sources.length < 2) throw new Error("Add at least two PDFs to merge.");
  const pages = [];
  for (const [source, bytes] of sources.entries()) {
    const count = (await loadPdf(bytes)).getPageCount();
    for (let index = 0; index < count; index += 1) pages.push({ source, index });
  }
  return assemblePages(sources, pages);
}

/** Parses "1-3, 5, 8-" into groups of zero-based page indices. */
export function parseRanges(text, pageCount) {
  const parts = text
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) throw new Error("Enter page ranges, such as 1-3, 4, 5-10.");
  return parts.map((part) => {
    const match = /^(\d+)?\s*(?:(-|–|to)\s*(\d+)?)?$/i.exec(part);
    if (!match || (!match[1] && !match[3])) {
      throw new Error(`“${part}” is not a page range. Use numbers such as 2 or 4-7.`);
    }
    const first = match[1] ? Number(match[1]) : 1;
    const last = match[2] ? (match[3] ? Number(match[3]) : pageCount) : first;
    if (first < 1 || last > pageCount || first > last) {
      throw new Error(`“${part}” is outside pages 1 to ${pageCount}.`);
    }
    return Array.from({ length: last - first + 1 }, (_, offset) => first - 1 + offset);
  });
}

export async function splitPdf(bytes, groups) {
  if (!groups.length) throw new Error("Choose the pages to split.");
  const results = [];
  for (const group of groups) {
    results.push({
      pages: group,
      bytes: await assemblePages(
        [bytes],
        group.map((index) => ({ source: 0, index })),
      ),
    });
  }
  return results;
}

/** Maps a point in the page as displayed (rotation applied) back to PDF user space. */
export function visualFrame(page) {
  const rotation = ((page.getRotation().angle % 360) + 360) % 360;
  const box = page.getCropBox();
  const { x: x0, y: y0, width: w, height: h } = box;
  const turned = rotation === 90 || rotation === 270;
  const toUser = (vx, vy) => {
    if (rotation === 90) return { x: x0 + w - vy, y: y0 + vx };
    if (rotation === 180) return { x: x0 + w - vx, y: y0 + h - vy };
    if (rotation === 270) return { x: x0 + vy, y: y0 + h - vx };
    return { x: x0 + vx, y: y0 + vy };
  };
  return { width: turned ? h : w, height: turned ? w : h, rotation, toUser };
}

export const NUMBER_FORMATS = {
  plain: (n) => `${n}`,
  page: (n) => `Page ${n}`,
  pageOf: (n, total) => `Page ${n} of ${total}`,
  slash: (n, total) => `${n} / ${total}`,
};

export const NUMBER_POSITIONS = [
  "top-left",
  "top-center",
  "top-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

export function numberLabel({ format = "plain", start = 1, from = 1 }, pageNumber, pageCount) {
  if (pageNumber < from) return "";
  const n = start + (pageNumber - from);
  const total = start + (pageCount - from);
  return NUMBER_FORMATS[format](n, total);
}

export async function addPageNumbers(bytes, options) {
  const {
    position = "bottom-center",
    size = 11,
    margin = 28,
    color = "#253248",
    from = 1,
    start = 1,
  } = options;
  if (!NUMBER_POSITIONS.includes(position)) throw new Error("Choose a position for the numbers.");
  if (!Number.isInteger(start) || start < 0 || start > 99999) {
    throw new Error("Start at a whole number from 0 to 99999.");
  }
  const document = stamp(await loadPdf(bytes));
  if (!Number.isInteger(from) || from < 1 || from > document.getPageCount()) {
    throw new Error(`Number from a page between 1 and ${document.getPageCount()}.`);
  }
  const font = await document.embedFont(StandardFonts.Helvetica);
  const ink = pdfColor(color);
  const pages = document.getPages();
  pages.forEach((page, index) => {
    const label = numberLabel({ ...options, start, from }, index + 1, pages.length);
    if (!label) return;
    const frame = visualFrame(page);
    const spot = numberOrigin(frame, position, font.widthOfTextAtSize(label, size), size, margin);
    const origin = frame.toUser(spot.x, spot.y);
    page.drawText(label, {
      ...origin,
      size,
      font,
      color: ink,
      rotate: degrees(frame.rotation),
    });
  });
  return document.save({ useObjectStreams: true });
}

/** Centres of each watermark copy, in displayed-page points (origin bottom left). */
export function watermarkCentres({ width, height }, textWidth, size, layout) {
  if (layout !== "tile") return [[width / 2, height / 2]];
  const centres = [];
  const stepX = textWidth * 1.15 + size;
  const stepY = size * 4;
  for (let row = -2; row * stepY < height + stepY * 2; row += 1) {
    for (let column = -2; column * stepX < width + stepX * 2; column += 1) {
      centres.push([column * stepX + (Math.abs(row) % 2) * (stepX / 2), row * stepY]);
    }
  }
  return centres;
}

/** Where a page number's baseline starts, in displayed-page points. */
export function numberOrigin(frame, position, textWidth, size, margin) {
  const [vertical, horizontal] = position.split("-");
  const x =
    horizontal === "left"
      ? margin
      : horizontal === "right"
        ? frame.width - margin - textWidth
        : (frame.width - textWidth) / 2;
  const y = vertical === "top" ? frame.height - margin - size * 0.72 : margin;
  return { x, y };
}

export async function addWatermark(bytes, options) {
  const {
    text,
    size = 64,
    opacity = 0.18,
    angle = 45,
    color = "#b54836",
    layout = "single",
    bold = true,
  } = options;
  const value = (text ?? "").trim();
  if (!value) throw new Error("Type the watermark text.");
  if (value.length > 80) throw new Error("Keep the watermark under 80 characters.");
  const document = stamp(await loadPdf(bytes));
  const font = await document.embedFont(
    bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica,
  );
  try {
    font.encodeText(value);
  } catch {
    throw new Error("Use Latin letters, numbers and common punctuation in the watermark.");
  }
  const ink = pdfColor(color);
  const radians = (angle * Math.PI) / 180;
  const textWidth = font.widthOfTextAtSize(value, size);
  const capHeight = font.heightAtSize(size, { descender: false });
  for (const page of document.getPages()) {
    const frame = visualFrame(page);
    for (const [cx, cy] of watermarkCentres(frame, textWidth, size, layout)) {
      const dx = (Math.cos(radians) * textWidth) / 2 - (Math.sin(radians) * capHeight) / 2;
      const dy = (Math.sin(radians) * textWidth) / 2 + (Math.cos(radians) * capHeight) / 2;
      const origin = frame.toUser(cx - dx, cy - dy);
      page.drawText(value, {
        ...origin,
        size,
        font,
        color: ink,
        opacity,
        rotate: degrees(frame.rotation + angle),
      });
    }
  }
  return document.save({ useObjectStreams: true });
}

export const MARGINS = { none: 0, small: 24, large: 56 };

/**
 * @param {{bytes: Uint8Array, kind: "jpg" | "png", width: number, height: number}[]} images
 */
export async function imagesToPdf(
  images,
  { pageSize = "a4", orientation = "auto", margin = "small" } = {},
) {
  if (!images.length) throw new Error("Add at least one image.");
  if (images.length > MAX_PAGES) throw new Error("Add up to 200 images.");
  const output = stamp(await PDFDocument.create());
  const inset = MARGINS[margin] ?? 0;
  for (const image of images) {
    const embedded =
      image.kind === "jpg"
        ? await output.embedJpg(image.bytes)
        : await output.embedPng(image.bytes);
    const landscapeImage = image.width > image.height;
    let width;
    let height;
    if (pageSize === "fit") {
      const scale = 841.89 / Math.max(image.width, image.height);
      width = image.width * scale + inset * 2;
      height = image.height * scale + inset * 2;
    } else {
      [width, height] = PAGE_SIZES[pageSize] ?? PAGE_SIZES.a4;
      const landscape = orientation === "landscape" || (orientation === "auto" && landscapeImage);
      if (landscape) [width, height] = [height, width];
    }
    const page = output.addPage([width, height]);
    const scale = Math.min((width - inset * 2) / image.width, (height - inset * 2) / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    page.drawImage(embedded, {
      x: (width - drawWidth) / 2,
      y: (height - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight,
    });
  }
  return output.save({ useObjectStreams: true });
}

/** Lossless: rewrites the file with object streams. Content is untouched. */
export async function compressLossless(bytes) {
  const document = await loadPdf(bytes);
  return document.save({ useObjectStreams: true });
}

function nameOf(value) {
  if (value instanceof PDFName) return value.asString();
  if (value instanceof PDFArray && value.size() === 1) return nameOf(value.get(0));
  return null;
}

function recompressible(document, dict) {
  if (nameOf(dict.get(PDFName.of("Subtype"))) !== "/Image") return false;
  if (nameOf(dict.get(PDFName.of("Filter"))) !== "/DCTDecode") return false;
  if (dict.get(PDFName.of("ImageMask")) || dict.get(PDFName.of("Decode"))) return false;
  if (dict.get(PDFName.of("Mask")) || dict.get(PDFName.of("SMaskInData"))) return false;
  const bits = dict.get(PDFName.of("BitsPerComponent"));
  if (!(bits instanceof PDFNumber) || bits.asNumber() !== 8) return false;
  const space = document.context.lookup(dict.get(PDFName.of("ColorSpace")));
  const spaceName = nameOf(space);
  if (spaceName === "/DeviceRGB" || spaceName === "/DeviceGray") return true;
  if (space instanceof PDFArray && nameOf(space.get(0)) === "/ICCBased") {
    const profile = document.context.lookup(space.get(1));
    const channels = profile?.dict?.get(PDFName.of("N"));
    return channels instanceof PDFNumber && [1, 3].includes(channels.asNumber());
  }
  return false;
}

/**
 * Recompresses JPEG photos inside the PDF and keeps everything else (text,
 * vectors, fonts) as it is.
 * @param reencode async (jpegBytes) => ({bytes, width, height}) | null
 */
export async function compressImages(bytes, reencode, onProgress = () => {}) {
  const document = await loadPdf(bytes);
  const candidates = document.context
    .enumerateIndirectObjects()
    .filter(
      ([, object]) => object instanceof PDFRawStream && recompressible(document, object.dict),
    );
  let replaced = 0;
  for (const [position, [ref, stream]] of candidates.entries()) {
    onProgress(position + 1, candidates.length);
    const result = await reencode(stream.getContents()).catch(() => null);
    if (!result || result.bytes.length >= stream.getContents().length * 0.9) continue;
    const dict = stream.dict.clone(document.context);
    dict.set(PDFName.of("Width"), PDFNumber.of(result.width));
    dict.set(PDFName.of("Height"), PDFNumber.of(result.height));
    dict.set(PDFName.of("ColorSpace"), PDFName.of("DeviceRGB"));
    dict.set(PDFName.of("Filter"), PDFName.of("DCTDecode"));
    dict.delete(PDFName.of("DecodeParms"));
    dict.set(PDFName.of("Length"), PDFNumber.of(result.bytes.length));
    document.context.assign(ref, PDFRawStream.of(dict, result.bytes));
    replaced += 1;
  }
  return {
    bytes: await document.save({ useObjectStreams: true }),
    images: candidates.length,
    replaced,
  };
}

/**
 * Strong compression: every page becomes one JPEG.
 * @param {{bytes: Uint8Array, width: number, height: number}[]} pages width/height in points
 */
export async function pagesFromJpegs(pages) {
  const output = stamp(await PDFDocument.create());
  for (const rendered of pages) {
    const image = await output.embedJpg(rendered.bytes);
    const page = output.addPage([rendered.width, rendered.height]);
    page.drawImage(image, { x: 0, y: 0, width: rendered.width, height: rendered.height });
  }
  return output.save({ useObjectStreams: true });
}
