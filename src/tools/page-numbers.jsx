import React, { useState } from "react";
import { Download } from "lucide-react";
import {
  addPageNumbers,
  checkPdfFiles,
  NUMBER_FORMATS,
  NUMBER_POSITIONS,
  numberLabel,
  numberOrigin,
} from "./ops.js";
import { baseName, downloadBytes, preparePdf, plural } from "./browser.js";
import { mountTool, PagePreview, Segmented, textWidth, ToolShell, useMessages } from "./ui.jsx";
import { track } from "../analytics.js";

const FORMAT_LABELS = { plain: "1, 2, 3", page: "Page 1", pageOf: "Page 1 of 9", slash: "1 / 9" };
const MARGINS = { tight: 18, normal: 28, wide: 42 };

function PositionPicker({ value, onChange }) {
  return (
    <fieldset className="option-group">
      <legend>Position</legend>
      <div className="position-picker">
        {NUMBER_POSITIONS.map((position) => (
          <button
            key={position}
            type="button"
            className={`position-spot spot-${position}`}
            aria-pressed={value === position}
            aria-label={position.replace("-", " ")}
            title={position.replace("-", " ")}
            onClick={() => onChange(position)}
          >
            <span />
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function PageNumbersTool() {
  const [doc, setDoc] = useState(null);
  const [page, setPage] = useState(0);
  const [position, setPosition] = useState("bottom-center");
  const [format, setFormat] = useState("plain");
  const [start, setStart] = useState(1);
  const [from, setFrom] = useState(1);
  const [size, setSize] = useState(11);
  const [margin, setMargin] = useState("normal");
  const [busy, setBusy] = useState("");
  const { message, fail, note, clear } = useMessages();
  const options = {
    position,
    format,
    start: Number(start),
    from: Number(from),
    size,
    margin: MARGINS[margin],
  };

  async function open(inputs) {
    clear();
    setBusy("Opening PDF…");
    try {
      if (inputs[0] instanceof File) checkPdfFiles(inputs.slice(0, 1));
      setDoc(await preparePdf(inputs[0]));
      setPage(0);
      setFrom(1);
      if (inputs.length > 1)
        note("Page numbers work on one PDF at a time. The first file was opened.");
    } catch (error) {
      fail(error);
    } finally {
      setBusy("");
    }
  }

  async function save() {
    clear();
    setBusy("Adding page numbers…");
    try {
      const output = await addPageNumbers(doc.bytes, options);
      downloadBytes(output, `${baseName(doc.name)}-numbered.pdf`);
      track("tool_run", { tool: "page-numbers", pages: doc.pageCount, method: format });
      note(`Numbered ${plural(doc.pageCount - options.from + 1, "page")}.`);
    } catch (error) {
      fail(error);
      track("tool_failed", { tool: "page-numbers" });
    } finally {
      setBusy("");
    }
  }

  const overlay = ({ width, height, scale }) => {
    const label = numberLabel(options, page + 1, doc.pageCount);
    if (!label) return null;
    const spot = numberOrigin(
      { width, height },
      position,
      textWidth(label, size),
      size,
      options.margin,
    );
    return (
      <span
        className="overlay-number"
        style={{
          left: spot.x * scale,
          top: (height - spot.y - size * 0.8) * scale,
          fontSize: size * scale,
        }}
      >
        {label}
      </span>
    );
  };

  const validStart =
    Number.isInteger(Number(start)) && Number(start) >= 0 && Number(start) <= 99999;
  const validFrom =
    doc && Number.isInteger(Number(from)) && Number(from) >= 1 && Number(from) <= doc.pageCount;

  return (
    <ToolShell
      name="Add page numbers"
      meta={doc ? `${doc.name}, ${plural(doc.pageCount, "page")}` : null}
      onFiles={open}
      addLabel="Open another PDF"
      busy={busy}
      message={message}
      onDismiss={clear}
      empty={!doc}
      emptyState={{
        title: "Choose the PDF to number",
        body: "Drop a PDF here, or choose one from your device. It stays on this device.",
        pickLabel: "Choose PDF",
      }}
      primary={{
        label: "Add numbers and download",
        icon: <Download size={17} />,
        disabled: !validStart || !validFrom,
        onClick: save,
      }}
      inspector={
        <>
          <PositionPicker value={position} onChange={setPosition} />
          <label className="field">
            <span>Format</span>
            <select value={format} onChange={(event) => setFormat(event.target.value)}>
              {Object.keys(NUMBER_FORMATS).map((key) => (
                <option key={key} value={key}>
                  {FORMAT_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
          <div className="field-row">
            <label className="field">
              <span>First numbered page</span>
              <input
                type="number"
                min={1}
                max={doc?.pageCount}
                value={from}
                aria-invalid={!validFrom}
                aria-describedby="numbers-help"
                onChange={(event) => setFrom(event.target.value)}
              />
            </label>
            <label className="field">
              <span>First number</span>
              <input
                type="number"
                min={0}
                value={start}
                aria-invalid={!validStart}
                aria-describedby="numbers-help"
                onChange={(event) => setStart(event.target.value)}
              />
            </label>
          </div>
          <p id="numbers-help" className={`helper ${!validFrom || !validStart ? "danger" : ""}`}>
            {!validFrom
              ? `Choose a first numbered page from 1 to ${doc?.pageCount}.`
              : !validStart
                ? "Choose a first number from 0 to 99999."
                : Number(from) > 1
                  ? `Pages before page ${from} stay unnumbered.`
                  : "Set First numbered page to 2 to skip a cover page."}
          </p>
          <label className="field">
            <span className="field-label-row">
              Text size <span className="range-value">{size} pt</span>
            </span>
            <input
              type="range"
              min={7}
              max={24}
              value={size}
              onChange={(event) => setSize(Number(event.target.value))}
            />
          </label>
          <Segmented
            label="Distance from edge"
            value={margin}
            onChange={setMargin}
            options={[
              { value: "tight", label: "Tight" },
              { value: "normal", label: "Normal" },
              { value: "wide", label: "Wide" },
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

mountTool(PageNumbersTool);
