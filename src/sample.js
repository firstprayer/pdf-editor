import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

// A realistic two-page agreement for trying the editor. Every name and figure
// is fictional and the footer says so.
export async function createSamplePdf() {
  const document = await PDFDocument.create();
  document.setTitle("Sample project agreement");
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const serif = await document.embedFont(StandardFonts.TimesRoman);
  const ink = rgb(0.13, 0.15, 0.2);
  const muted = rgb(0.4, 0.43, 0.48);
  const page = document.addPage([595, 842]);
  const text = (value, x, y, size = 10.5, font = regular, color = ink) => {
    page.drawText(value, { x, y, size, font, color });
  };
  const line = (y, color = rgb(0.83, 0.84, 0.86)) =>
    page.drawLine({ start: { x: 54, y }, end: { x: 541, y }, color, thickness: 0.6 });

  text("Halden & Ruiz Studio", 54, 778, 12, bold);
  text("Agreement HR-2026-014", 432, 778, 9, regular, muted);
  line(760);
  text("Project agreement", 54, 712, 28, serif);
  text("Website redesign for Marlow Bakery Ltd.", 54, 688, 11, regular, muted);

  text("Client", 54, 648, 8.5, regular, muted);
  text("Marlow Bakery Ltd.", 54, 632, 11, bold);
  text("Project", 232, 648, 8.5, regular, muted);
  text("Website redesign", 232, 632, 11, bold);
  text("Date", 410, 648, 8.5, regular, muted);
  text("4 November 2026", 410, 632, 11);
  line(610);

  text("1. Scope", 54, 584, 11, bold);
  text("Redesign of the five-page marketing site, including copy edits and responsive", 54, 564);
  text("layouts for phone and desktop. Hosting and domain renewal are not included.", 54, 549);

  text("2. Fees", 54, 512, 11, bold);
  const rows = [
    ["Discovery and content audit", "$450.00"],
    ["Design and build", "$1,250.00"],
    ["Launch support (two weeks)", "$300.00"],
  ];
  rows.forEach(([label, amount], index) => {
    const y = 488 - index * 26;
    text(label, 54, y);
    text(amount, 541 - regular.widthOfTextAtSize(amount, 10.5), y);
  });
  line(416);
  text("Total", 54, 398, 11, bold);
  text("$2,000.00", 541 - bold.widthOfTextAtSize("$2,000.00", 11), 398, 11, bold);

  text("3. Payment", 54, 360, 11, bold);
  text("50% on signing and 50% on launch. Invoices are due within 14 days.", 54, 340);

  text("4. Acceptance", 54, 302, 11, bold);
  text("Sign and date below to accept this agreement.", 54, 282, 10.5, regular, muted);
  page.drawLine({
    start: { x: 54, y: 214 },
    end: { x: 310, y: 214 },
    color: muted,
    thickness: 0.6,
  });
  page.drawLine({
    start: { x: 365, y: 214 },
    end: { x: 541, y: 214 },
    color: muted,
    thickness: 0.6,
  });
  text("Client signature", 54, 198, 8.5, regular, muted);
  text("Date", 365, 198, 8.5, regular, muted);

  line(75);
  text("Sample document. All names and figures are fictional.", 54, 58, 8, regular, muted);
  text("1 / 2", 518, 58, 8, regular, muted);

  const second = document.addPage([595, 842]);
  const add = (value, x, y, size = 10.5, font = regular, color = ink) =>
    second.drawText(value, { x, y, size, font, color });
  add("Halden & Ruiz Studio", 54, 778, 12, bold);
  add("Agreement HR-2026-014", 432, 778, 9, regular, muted);
  second.drawLine({
    start: { x: 54, y: 760 },
    end: { x: 541, y: 760 },
    color: rgb(0.83, 0.84, 0.86),
    thickness: 0.6,
  });
  add("Project notes", 54, 712, 24, serif);
  add("Kick-off call, 28 October 2026", 54, 688, 11, regular, muted);
  const notes = [
    "Keep the current logo; refresh the colour palette.",
    "Menu page must be easy to update without a developer.",
    "Online ordering is out of scope for this phase.",
  ];
  notes.forEach((note, index) => add(`–  ${note}`, 54, 650 - index * 22));
  for (let y = 560; y >= 200; y -= 36) {
    second.drawLine({
      start: { x: 54, y },
      end: { x: 541, y },
      color: rgb(0.88, 0.89, 0.9),
      thickness: 0.5,
    });
  }
  add("Next review: 11 November 2026", 54, 150, 10.5, bold);
  second.drawLine({
    start: { x: 54, y: 75 },
    end: { x: 541, y: 75 },
    color: rgb(0.83, 0.84, 0.86),
    thickness: 0.6,
  });
  add("Sample document. All names and figures are fictional.", 54, 58, 8, regular, muted);
  add("2 / 2", 518, 58, 8, regular, muted);
  return document.save();
}
