import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export async function createSamplePdf() {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const serif = await document.embedFont(StandardFonts.TimesRoman);
  const ink = rgb(0.15, 0.18, 0.22);
  const muted = rgb(0.4, 0.43, 0.47);
  const accent = rgb(0.65, 0.24, 0.18);
  const page = document.addPage([595, 842]);
  const text = (value, x, y, size = 11, font = regular, color = ink) => {
    page.drawText(value, { x, y, size, font, color });
  };
  const line = (y) =>
    page.drawLine({
      start: { x: 54, y },
      end: { x: 541, y },
      color: rgb(0.83, 0.84, 0.85),
      thickness: 0.6,
    });
  text("Sample Studio", 54, 778, 13, bold);
  text("EXAMPLE DOCUMENT", 420, 778, 8, regular, muted);
  line(756);
  text("A good project starts", 54, 702, 32, serif);
  text("with a little clarity.", 54, 663, 32, serif);
  text("Project agreement", 54, 614, 11, bold, accent);
  text("Prepared for", 54, 574, 9, regular, muted);
  text("Your next project", 54, 555, 12, bold);
  text("Reference", 352, 574, 9, regular, muted);
  text("SAMPLE-001", 352, 555, 12);
  line(530);
  text("1. The work", 54, 498, 12, bold);
  text("A thoughtful plan, clear communication, and a finished result.", 54, 476);
  text("Use this sample to try editing a line, adding a note, or signing below.", 54, 458);
  text("2. The details", 54, 414, 12, bold);
  const rows = [
    ["Planning and preparation", "$450.00"],
    ["Design and delivery", "$1,250.00"],
    ["Final review", "$300.00"],
  ];
  rows.forEach(([label, amount], index) => {
    text(label, 54, 382 - index * 32);
    text(amount, 467, 382 - index * 32);
  });
  line(296);
  text("Project total", 54, 274, 12, bold);
  text("$2,000.00", 465, 274, 12, bold);
  text("3. Let's make it official", 54, 228, 12, bold);
  text("Add your signature and date in the spaces below.", 54, 207, 10, regular, muted);
  page.drawLine({
    start: { x: 54, y: 135 },
    end: { x: 310, y: 135 },
    color: muted,
    thickness: 0.6,
  });
  page.drawLine({
    start: { x: 365, y: 135 },
    end: { x: 541, y: 135 },
    color: muted,
    thickness: 0.6,
  });
  text("Signature", 54, 117, 9, regular, muted);
  text("Date", 365, 117, 9, regular, muted);
  line(75);
  text(
    "Sample document for trying PDF Workspace. All details are illustrative.",
    54,
    54,
    8,
    regular,
    muted,
  );
  text("1 / 2", 516, 54, 8, regular, muted);

  const second = document.addPage([595, 842]);
  const add = (value, x, y, size = 11, font = regular) =>
    second.drawText(value, { x, y, size, font, color: ink });
  add("Room for the details.", 54, 742, 30, serif);
  add("Project notes", 54, 695, 12, bold);
  add("Every good agreement leaves space for questions and a clear next step.", 54, 670);
  for (let y = 620; y >= 200; y -= 38) {
    second.drawLine({
      start: { x: 54, y },
      end: { x: 541, y },
      color: rgb(0.87, 0.88, 0.89),
      thickness: 0.5,
    });
  }
  add("Try adding a note, highlighting a line, or drawing on this page.", 54, 145, 10);
  add("Sample document for trying PDF Workspace.", 54, 54, 8);
  add("2 / 2", 516, 54, 8);
  return document.save();
}
