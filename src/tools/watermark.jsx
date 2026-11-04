import React, { useState } from "react";
import { Check, Download } from "lucide-react";
import { addWatermark, checkPdfFiles, watermarkCentres } from "./ops.js";
import { baseName, downloadBytes, plural, preparePdf, samplePack } from "./browser.js";
import { mountTool, PagePreview, Segmented, textWidth, ToolShell, useMessages } from "./ui.jsx";
import { DOCUMENT_COLORS } from "../model.js";
import { track } from "../analytics.js";

const COLORS = [...DOCUMENT_COLORS, { name: "Grey", value: "#6b7280" }];

function WatermarkTool() {
  const [doc, setDoc] = useState(null);
  const [page, setPage] = useState(0);
  const [text, setText] = useState("CONFIDENTIAL");
  const [size, setSize] = useState(64);
  const [opacity, setOpacity] = useState(20);
  const [angle, setAngle] = useState(45);
  const [color, setColor] = useState("#b54836");
  const [layout, setLayout] = useState("single");
  const [busy, setBusy] = useState("");
  const { message, fail, note, clear } = useMessages();

  async function open(inputs) {
    clear();
    setBusy("Opening PDF…");
    try {
      if (inputs[0] instanceof File) checkPdfFiles(inputs.slice(0, 1));
      setDoc(await preparePdf(inputs[0]));
      setPage(0);
      if (inputs.length > 1)
        note("Watermark works on one PDF at a time. The first file was opened.");
    } catch (error) {
      fail(error);
    } finally {
      setBusy("");
    }
  }

  async function save() {
    clear();
    setBusy("Adding watermark…");
    try {
      const output = await addWatermark(doc.bytes, {
        text,
        size,
        opacity: opacity / 100,
        angle,
        color,
        layout,
      });
      downloadBytes(output, `${baseName(doc.name)}-watermarked.pdf`);
      track("tool_run", { tool: "watermark", pages: doc.pageCount, method: layout });
      note(`Watermarked ${plural(doc.pageCount, "page")}.`);
    } catch (error) {
      fail(error);
      track("tool_failed", { tool: "watermark" });
    } finally {
      setBusy("");
    }
  }

  const value = text.trim();
  const overlay = ({ width, height, scale }) => {
    if (!value) return null;
    const measured = textWidth(value, size, true);
    return watermarkCentres({ width, height }, measured, size, layout).map(([cx, cy], index) => (
      <span
        key={index}
        className="overlay-watermark"
        style={{
          left: cx * scale,
          top: (height - cy) * scale,
          fontSize: size * scale,
          fontWeight: 700,
          color,
          opacity: opacity / 100,
          transform: `translate(-50%, -50%) rotate(${-angle}deg)`,
        }}
      >
        {value}
      </span>
    ));
  };

  return (
    <ToolShell
      name="Watermark PDF"
      meta={doc ? `${doc.name}, ${plural(doc.pageCount, "page")}` : null}
      onFiles={open}
      addLabel="Open another PDF"
      busy={busy}
      message={message}
      onDismiss={clear}
      empty={!doc}
      emptyState={{
        title: "Choose the PDF to watermark",
        body: "Drop a PDF here, or choose one from your device. It stays on this device.",
        pickLabel: "Choose PDF",
        onSample: async () => open([await samplePack()]),
      }}
      primary={{
        label: "Add watermark and download",
        icon: <Download size={17} />,
        disabled: !value,
        onClick: save,
      }}
      inspector={
        <>
          <label className="field">
            <span>Watermark text</span>
            <input
              type="text"
              value={text}
              maxLength={80}
              onChange={(event) => setText(event.target.value)}
            />
          </label>
          <fieldset className="color-field">
            <legend>Color</legend>
            <div className="color-options">
              {COLORS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="color-option"
                  style={{ "--swatch": option.value }}
                  aria-label={option.name}
                  aria-pressed={color === option.value}
                  onClick={() => setColor(option.value)}
                >
                  {color === option.value && <Check size={15} strokeWidth={3} />}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="field">
            <span className="field-label-row">
              Size <span className="range-value">{size} pt</span>
            </span>
            <input
              type="range"
              min={16}
              max={140}
              value={size}
              onChange={(event) => setSize(Number(event.target.value))}
            />
          </label>
          <label className="field">
            <span className="field-label-row">
              Opacity <span className="range-value">{opacity}%</span>
            </span>
            <input
              type="range"
              min={5}
              max={60}
              value={opacity}
              onChange={(event) => setOpacity(Number(event.target.value))}
            />
          </label>
          <Segmented
            label="Angle"
            value={angle}
            onChange={setAngle}
            options={[
              { value: 45, label: "Diagonal up" },
              { value: 0, label: "Straight" },
              { value: -45, label: "Diagonal down" },
            ]}
          />
          <Segmented
            label="Layout"
            value={layout}
            onChange={setLayout}
            options={[
              { value: "single", label: "Once" },
              { value: "tile", label: "Tiled" },
            ]}
          />
        </>
      }
    >
      {doc && (
        <PagePreview
          pdf={doc.pdf}
          pageCount={doc.pageCount}
          page={page}
          setPage={setPage}
          overlay={overlay}
        />
      )}
    </ToolShell>
  );
}

mountTool(WatermarkTool);
