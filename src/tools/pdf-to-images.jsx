import React, { useState } from "react";
import { Download } from "lucide-react";
import { checkPdfFiles } from "./ops.js";
import {
  baseName,
  downloadFiles,
  formatBytes,
  plural,
  preparePdf,
  renderPageImage,
  samplePack,
} from "./browser.js";
import { mountTool, Segmented, Sheet, ToolShell, useMessages } from "./ui.jsx";
import { track } from "../analytics.js";

const RESOLUTIONS = [
  { value: 72, label: "72 DPI" },
  { value: 150, label: "150 DPI" },
  { value: 300, label: "300 DPI" },
];

function PdfToImagesTool() {
  const [doc, setDoc] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [format, setFormat] = useState("jpg");
  const [dpi, setDpi] = useState(150);
  const [firstSize, setFirstSize] = useState(null);
  const [busy, setBusy] = useState("");
  const { message, fail, note, clear } = useMessages();

  async function open(inputs) {
    clear();
    setBusy("Opening PDF…");
    try {
      if (inputs[0] instanceof File) checkPdfFiles(inputs.slice(0, 1));
      const prepared = await preparePdf(inputs[0]);
      const page = await prepared.pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      setFirstSize({ width: viewport.width, height: viewport.height });
      setDoc(prepared);
      setSelected(new Set(Array.from({ length: prepared.pageCount }, (_, index) => index)));
      if (inputs.length > 1)
        note("PDF to JPG works on one PDF at a time. The first file was opened.");
    } catch (error) {
      fail(error);
    } finally {
      setBusy("");
    }
  }

  const toggle = (index) => {
    const next = new Set(selected);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelected(next);
  };

  async function convert() {
    clear();
    const indices = [...selected].sort((a, b) => a - b);
    const base = baseName(doc.name);
    const digits = String(doc.pageCount).length;
    const type = format === "png" ? "image/png" : "image/jpeg";
    try {
      const files = [];
      let total = 0;
      for (const [position, index] of indices.entries()) {
        setBusy(`Converting page ${position + 1} of ${indices.length}…`);
        const image = await renderPageImage(doc.pdf, index, { dpi, type, quality: 0.88 });
        total += image.bytes.length;
        files.push({
          name: `${base}-page-${String(index + 1).padStart(digits, "0")}.${format}`,
          bytes: image.bytes,
          type,
        });
      }
      downloadFiles(files, `${base}-${format}.zip`);
      track("tool_run", { tool: "pdf-to-jpg", pages: files.length, method: `${format}-${dpi}` });
      note(
        files.length > 1
          ? `Saved ${plural(files.length, "image")} (${formatBytes(total)}) in one ZIP file.`
          : `Saved one image (${formatBytes(total)}).`,
      );
    } catch (error) {
      fail(error);
      track("tool_failed", { tool: "pdf-to-jpg" });
    } finally {
      setBusy("");
    }
  }

  const pixels = firstSize
    ? `${Math.round((firstSize.width * dpi) / 72)} × ${Math.round((firstSize.height * dpi) / 72)} px`
    : "";

  return (
    <ToolShell
      name="PDF to JPG"
      meta={doc ? `${doc.name}, ${plural(doc.pageCount, "page")}` : null}
      onFiles={open}
      addLabel="Open another PDF"
      busy={busy}
      message={message}
      onDismiss={clear}
      empty={!doc}
      emptyState={{
        title: "Choose the PDF to convert",
        body: "Drop a PDF here, or choose one from your device. Pages are turned into images in this tab.",
        pickLabel: "Choose PDF",
        onSample: async () => open([await samplePack()]),
      }}
      primary={{
        label: "Convert and download",
        icon: <Download size={17} />,
        disabled: !selected.size,
        onClick: convert,
      }}
      inspector={
        <>
          <Segmented
            label="Format"
            value={format}
            onChange={setFormat}
            options={[
              { value: "jpg", label: "JPG" },
              { value: "png", label: "PNG" },
            ]}
          />
          <Segmented label="Resolution" value={dpi} onChange={setDpi} options={RESOLUTIONS} />
          <dl className="summary">
            <div>
              <dt>Pages</dt>
              <dd>
                {selected.size} of {doc?.pageCount ?? 0}
              </dd>
            </div>
            <div>
              <dt>Page 1 size</dt>
              <dd>{pixels}</dd>
            </div>
            <div>
              <dt>Download as</dt>
              <dd>{selected.size > 1 ? "ZIP" : format.toUpperCase()}</dd>
            </div>
          </dl>
          <p className="helper">
            {format === "jpg"
              ? "JPG keeps files small and suits photos and scans."
              : "PNG keeps text edges sharp but makes larger files."}{" "}
            Every selected page becomes one image; select a page again to leave it out.
          </p>
        </>
      }
    >
      {doc && (
        <>
          <div className="stage-bar">
            <p>{plural(selected.size, "page")} selected.</p>
            <div className="stage-actions">
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  setSelected(new Set(Array.from({ length: doc.pageCount }, (_, index) => index)))
                }
              >
                Select all
              </button>
              <button type="button" className="text-button" onClick={() => setSelected(new Set())}>
                Clear
              </button>
            </div>
          </div>
          <ol className="sheet-grid">
            {Array.from({ length: doc.pageCount }, (_, index) => (
              <Sheet
                key={`${doc.id}-${index}`}
                pdf={doc.pdf}
                index={index}
                title={`Page ${index + 1}`}
                selected={selected.has(index)}
                onToggle={() => toggle(index)}
                toggleLabel={`Include page ${index + 1}`}
              />
            ))}
          </ol>
        </>
      )}
    </ToolShell>
  );
}

mountTool(PdfToImagesTool);
