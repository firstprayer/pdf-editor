// Writes the QA input files. Usage: node fixtures.mjs <outDir>
// Every file is generated, so runs are reproducible and contain no real data.
import { mkdir, writeFile } from "node:fs/promises";
import { createCanvas } from "@napi-rs/canvas";
import { PDFDocument, StandardFonts } from "pdf-lib";

export const FIXTURES = {
  report: "report.pdf", // 2 text pages: "report page 1", "report page 2"
  appendix: "appendix.pdf", // 1 text page
  threePages: "three-pages.pdf", // 3 text pages, the default input for single-PDF tools
  photos: "photos.pdf", // 1 page with a 2000x1400 JPEG at quality 95 (about 200 KB)
  images: ["photo-1.jpg", "photo-2.jpg", "photo-3.jpg"], // 2000x1400 JPEGs at quality 95
};

async function textPdf(path, label, pages) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < pages; index += 1) {
    document
      .addPage([595, 842])
      .drawText(`${label} page ${index + 1}`, { x: 60, y: 760, size: 24, font });
  }
  await writeFile(path, await document.save());
}

function photo(seed) {
  const canvas = createCanvas(2000, 1400);
  const context = canvas.getContext("2d");
  for (let index = 0; index < 400; index += 1) {
    context.fillStyle = `hsl(${(index + seed * 40) % 360}, 50%, ${30 + (index % 40)}%)`;
    context.fillRect((index * 37) % 2000, (index * 91) % 1400, 120, 90);
  }
  return canvas.toBuffer("image/jpeg", 95);
}

export async function writeFixtures(dir) {
  await mkdir(dir, { recursive: true });
  await textPdf(`${dir}/${FIXTURES.report}`, "report", 2);
  await textPdf(`${dir}/${FIXTURES.appendix}`, "appendix", 1);
  await textPdf(`${dir}/${FIXTURES.threePages}`, "three-pages", 3);
  const document = await PDFDocument.create();
  const image = await document.embedJpg(photo(0));
  document.addPage([595, 842]).drawImage(image, { x: 50, y: 300, width: 495, height: 346 });
  await writeFile(`${dir}/${FIXTURES.photos}`, await document.save());
  for (const [index, name] of FIXTURES.images.entries()) {
    await writeFile(`${dir}/${name}`, photo(index + 1));
  }
  return dir;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  if (!dir) throw new Error("Usage: node fixtures.mjs <outDir>");
  await writeFixtures(dir);
  console.log(`Fixtures written to ${dir}`);
}
