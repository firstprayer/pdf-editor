import { degrees, PDFDocument, rgb, StandardFontEmbedder, StandardFonts } from "pdf-lib";
import { MAX_FILE_BYTES, MAX_PAGES, pageNeedsFlattening } from "./model.js";

export function pdfColor(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error("Choose a valid document color.");
  return rgb(...[1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255));
}

export async function inspectPdf(bytes) {
  if (!bytes.length || bytes.length > MAX_FILE_BYTES) {
    throw new Error("Choose a PDF smaller than 50 MB.");
  }
  let document;
  try {
    document = await PDFDocument.load(bytes);
  } catch {
    throw new Error("This PDF could not be opened. Try a valid, password-free copy.");
  }
  if (!document.getPageCount() || document.getPageCount() > MAX_PAGES) {
    throw new Error("Choose a PDF with 1 to 200 pages.");
  }
  return document.getPages().map((page, index) => ({
    index,
    width: page.getWidth(),
    height: page.getHeight(),
    rotation: 0,
  }));
}

const textEncoder = StandardFontEmbedder.for(StandardFonts.Helvetica);

export function validateText(text) {
  if (text.length > 10000) throw new Error("Keep each text box under 10,000 characters.");
  try {
    textEncoder.encodeText(text.replaceAll("\n", ""));
  } catch {
    throw new Error(
      "The built-in fonts support Latin text. Use supported characters in this version.",
    );
  }
}

export async function exportPdf({ sources, pages, renderFlattenedPage }) {
  if (!pages.length || pages.length > MAX_PAGES) throw new Error("Keep 1 to 200 pages.");
  const output = await PDFDocument.create();
  output.setProducer("PDF Editor");
  output.setCreator("PDF Editor");
  const loaded = new Map();
  const embeddedImages = new Map();
  async function embedImage(dataUrl) {
    if (!embeddedImages.has(dataUrl)) {
      const image = dataUrl.startsWith("data:image/png")
        ? await output.embedPng(dataUrl)
        : await output.embedJpg(dataUrl);
      await image.embed();
      embeddedImages.set(dataUrl, image);
    }
    return embeddedImages.get(dataUrl);
  }
  const fonts = {
    sans: await output.embedFont(StandardFonts.Helvetica),
    bold: await output.embedFont(StandardFonts.HelveticaBold),
    serif: await output.embedFont(StandardFonts.TimesRoman),
    mono: await output.embedFont(StandardFonts.Courier),
  };

  for (const descriptor of pages) {
    let page;
    let offsetX = 0;
    let offsetY = 0;
    let unitScale = 1;
    let flattenedAnnotations = false;
    if (!descriptor.sourceId) {
      page = output.addPage([descriptor.width, descriptor.height]);
      page.setRotation(degrees(descriptor.rotation));
    } else if (pageNeedsFlattening(descriptor)) {
      if (!renderFlattenedPage) throw new Error("The page renderer is not available. Try again.");
      const rendered = await renderFlattenedPage(descriptor);
      page = output.addPage([rendered.width, rendered.height]);
      const image = await output.embedPng(rendered.bytes);
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: rendered.width,
        height: rendered.height,
      });
      await image.embed();
      offsetX = rendered.offsetX;
      offsetY = rendered.offsetY;
      unitScale = rendered.unitScale;
      flattenedAnnotations = rendered.flattenAnnotations;
      page.setRotation(degrees((rendered.rotation + descriptor.rotation) % 360));
    } else {
      if (!loaded.has(descriptor.sourceId)) {
        loaded.set(descriptor.sourceId, await PDFDocument.load(sources[descriptor.sourceId].bytes));
      }
      const source = loaded.get(descriptor.sourceId);
      const [copied] = await output.copyPages(source, [descriptor.index]);
      page = output.addPage(copied);
      page.setRotation(degrees((page.getRotation().angle + descriptor.rotation) % 360));
    }

    if (flattenedAnnotations) continue;
    for (const annotation of descriptor.annotations) {
      if (annotation.type === "redact") continue;
      const color = pdfColor(annotation.color ?? "#253248");
      const x = ((annotation.x ?? 0) - offsetX) * unitScale;
      const y = ((annotation.y ?? 0) - offsetY) * unitScale;
      if (["text", "replace"].includes(annotation.type)) {
        validateText(annotation.text);
        const font = fonts[annotation.font ?? "sans"];
        annotation.text.split("\n").forEach((line, index) => {
          page.drawText(line, {
            x,
            y: y - index * annotation.size * 1.3 * unitScale,
            size: annotation.size * unitScale,
            font,
            color,
          });
        });
      } else if (annotation.type === "highlight") {
        page.drawRectangle({
          x,
          y,
          width: annotation.width * unitScale,
          height: annotation.height * unitScale,
          color,
          opacity: 0.3,
        });
      } else if (annotation.type === "draw") {
        annotation.points.slice(1).forEach((point, index) => {
          const previous = annotation.points[index];
          page.drawLine({
            start: {
              x: (previous[0] - offsetX) * unitScale,
              y: (previous[1] - offsetY) * unitScale,
            },
            end: { x: (point[0] - offsetX) * unitScale, y: (point[1] - offsetY) * unitScale },
            thickness: annotation.strokeWidth * unitScale,
            color,
          });
        });
      } else if (["image", "signature"].includes(annotation.type)) {
        const image = await embedImage(annotation.dataUrl);
        page.drawImage(image, {
          x,
          y,
          width: annotation.width * unitScale,
          height: annotation.height * unitScale,
        });
      }
    }
  }
  return output.save();
}

export async function renderRedactedPage(pdfPage, annotations, createCanvas, encode, loadImage) {
  const original = pdfPage.getViewport({ scale: 1, rotation: 0 });
  const scale = Math.min(
    3,
    8192 / original.width,
    8192 / original.height,
    Math.sqrt(16_000_000 / (original.width * original.height)),
  );
  const viewport = pdfPage.getViewport({ scale, rotation: 0 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext("2d");
  await pdfPage.render({ canvasContext: context, viewport }).promise;
  context.save();
  context.transform(...viewport.transform);
  for (const annotation of annotations) {
    if (annotation.type === "replace") {
      context.fillStyle = "#ffffff";
      context.fillRect(
        annotation.originalX,
        annotation.originalY - annotation.originalSize * 0.3,
        annotation.originalWidth + 1,
        annotation.originalSize * 1.4,
      );
    }
  }
  const flattenAnnotations = annotations.some((annotation) => annotation.type === "redact");
  if (flattenAnnotations) {
    for (const annotation of annotations.filter((item) => item.type !== "redact")) {
      context.save();
      context.fillStyle = annotation.color ?? "#253248";
      context.strokeStyle = annotation.color ?? "#253248";
      if (["text", "replace"].includes(annotation.type)) {
        validateText(annotation.text);
        const family =
          annotation.font === "serif"
            ? "Times New Roman"
            : annotation.font === "mono"
              ? "Courier New"
              : "Arial";
        context.font = `${annotation.font === "bold" ? "bold " : ""}${annotation.size}px "${family}"`;
        context.translate(annotation.x, annotation.y);
        context.scale(1, -1);
        annotation.text
          .split("\n")
          .forEach((line, index) => context.fillText(line, 0, index * annotation.size * 1.3));
      } else if (annotation.type === "highlight") {
        context.globalAlpha = 0.3;
        context.fillRect(annotation.x, annotation.y, annotation.width, annotation.height);
      } else if (annotation.type === "draw") {
        context.lineWidth = annotation.strokeWidth;
        context.lineCap = "round";
        context.lineJoin = "round";
        context.beginPath();
        annotation.points.forEach(([x, y], index) =>
          index ? context.lineTo(x, y) : context.moveTo(x, y),
        );
        context.stroke();
      } else if (["signature", "image"].includes(annotation.type)) {
        if (!loadImage) throw new Error("The image renderer is unavailable.");
        const image = await loadImage(annotation.dataUrl);
        context.translate(annotation.x, annotation.y + annotation.height);
        context.scale(1, -1);
        context.drawImage(image, 0, 0, annotation.width, annotation.height);
      }
      context.restore();
    }
    // Redact last and emit only sanitized pixels, never hidden source objects or annotations.
    for (const annotation of annotations.filter((item) => item.type === "redact")) {
      context.fillStyle = "#17202d";
      context.fillRect(annotation.x, annotation.y, annotation.width, annotation.height);
    }
  }
  context.restore();
  const bytes = await encode(canvas);
  canvas.width = 0;
  canvas.height = 0;
  return {
    bytes,
    width: original.width,
    height: original.height,
    offsetX: pdfPage.view[0],
    offsetY: pdfPage.view[1],
    rotation: pdfPage.rotate,
    unitScale: pdfPage.userUnit,
    flattenAnnotations,
  };
}
