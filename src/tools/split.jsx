import React, { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { checkPdfFiles, parseRanges, splitPdf } from "./ops.js";
import { baseName, downloadFiles, plural, preparePdf } from "./browser.js";
import { mountTool, Sheet, ToolShell, useMessages, useUnsaved } from "./ui.jsx";
import { track } from "../analytics.js";

const MODES = [
  { value: "every", label: "Every page", detail: "One PDF for each page." },
  { value: "ranges", label: "Page ranges", detail: "One PDF for each range you type." },
  { value: "select", label: "Selected pages", detail: "One PDF with only the pages you pick." },
];

function rangeLabel(group) {
  const first = group[0] + 1;
  const last = group.at(-1) + 1;
  return first === last ? `${first}` : `${first}-${last}`;
}

function SplitTool() {
  const [doc, setDoc] = useState(null);
  const [mode, setMode] = useState("every");
  const [ranges, setRanges] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState("");
  const { message, fail, note, clear } = useMessages();
  const [unsaved, markSaved] = useUnsaved(!!doc && (selected.size > 0 || mode === "ranges"), [
    selected,
    ranges,
    mode,
  ]);

  const plan = useMemo(() => {
    if (!doc) return { groups: [] };
    const all = Array.from({ length: doc.pageCount }, (_, index) => index);
    if (mode === "every") return { groups: all.map((index) => [index]) };
    if (mode === "select") {
      const picked = all.filter((index) => selected.has(index));
      return { groups: picked.length ? [picked] : [] };
    }
    try {
      return { groups: parseRanges(ranges, doc.pageCount) };
    } catch (error) {
      return { groups: [], error: ranges.trim() ? error.message : "" };
    }
  }, [doc, mode, ranges, selected]);

  const groupOf = useMemo(() => {
    const map = new Map();
    plan.groups.forEach((group, number) => group.forEach((index) => map.set(index, number)));
    return map;
  }, [plan]);

  async function open(inputs) {
    clear();
    setBusy("Opening PDF…");
    try {
      if (inputs[0] instanceof File) checkPdfFiles(inputs.slice(0, 1));
      const prepared = await preparePdf(inputs[0]);
      if (prepared.pageCount < 2)
        throw new Error("This PDF has one page, so there is nothing to split.");
      setDoc(prepared);
      setSelected(new Set());
      const half = Math.ceil(prepared.pageCount / 2);
      setRanges(`${rangeLabel([0, half - 1])}, ${rangeLabel([half, prepared.pageCount - 1])}`);
      if (inputs.length > 1) note("Split works on one PDF at a time. The first file was opened.");
    } catch (error) {
      fail(error);
    } finally {
      setBusy("");
    }
  }

  async function split() {
    clear();
    setBusy("Splitting…");
    try {
      const results = await splitPdf(doc.bytes, plan.groups);
      const base = baseName(doc.name);
      const files = results.map(({ pages, bytes }) => ({
        name:
          mode === "select"
            ? `${base}-selected-pages.pdf`
            : `${base}-pages-${rangeLabel(pages)}.pdf`,
        bytes,
        type: "application/pdf",
      }));
      downloadFiles(files, `${base}-split.zip`);
      markSaved();
      track("tool_run", { tool: "split", pages: doc.pageCount, files: files.length, method: mode });
      note(
        files.length > 1
          ? `Saved ${plural(files.length, "PDF")} in one ZIP file.`
          : "Saved your new PDF.",
      );
    } catch (error) {
      fail(error);
      track("tool_failed", { tool: "split" });
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

  const outputs = plan.groups.length;

  return (
    <ToolShell
      name="Split PDF"
      meta={doc ? `${doc.name}, ${plural(doc.pageCount, "page")}` : null}
      onFiles={open}
      addLabel="Open another PDF"
      busy={busy}
      unsaved={unsaved}
      message={message}
      onDismiss={clear}
      empty={!doc}
      emptyState={{
        title: "Choose the PDF to split",
        body: "Drop a PDF here, or choose one from your device. It stays on this device.",
        pickLabel: "Choose PDF",
      }}
      primary={{
        label: "Split and download",
        icon: <Download size={17} />,
        disabled: !outputs,
        onClick: split,
      }}
      inspector={
        <>
          <fieldset className="option-group">
            <legend>Split method</legend>
            <div className="choice-list">
              {MODES.map((option) => (
                <label key={option.value} className="choice">
                  <input
                    type="radio"
                    name="split-mode"
                    value={option.value}
                    checked={mode === option.value}
                    onChange={() => setMode(option.value)}
                  />
                  <strong>{option.label}</strong>
                  <small>{option.detail}</small>
                </label>
              ))}
            </div>
          </fieldset>
          {mode === "ranges" && (
            <label className="field">
              <span>Page ranges</span>
              <input
                type="text"
                value={ranges}
                placeholder="1-3, 4, 5-10"
                aria-invalid={!!plan.error}
                aria-describedby="range-help"
                onChange={(event) => setRanges(event.target.value)}
              />
              <span id="range-help" className={`helper ${plan.error ? "danger" : ""}`}>
                {plan.error || "Separate ranges with commas. Each range becomes one PDF."}
              </span>
            </label>
          )}
          {mode === "select" && (
            <p className="helper">
              {selected.size
                ? `${plural(selected.size, "page")} selected. Select pages to add or remove them.`
                : "Select the pages to keep in the new PDF."}
            </p>
          )}
          <dl className="summary">
            <div>
              <dt>New files</dt>
              <dd>{outputs}</dd>
            </div>
            <div>
              <dt>Download as</dt>
              <dd>{outputs > 1 ? "ZIP" : "PDF"}</dd>
            </div>
          </dl>
        </>
      }
    >
      {doc && (
        <>
          <div className="stage-bar">
            <p>
              {mode === "select"
                ? "Select the pages for the new PDF."
                : mode === "ranges"
                  ? "Each page shows the file it goes into."
                  : "Each page becomes its own PDF."}
            </p>
            {mode === "select" && (
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
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setSelected(new Set())}
                >
                  Clear
                </button>
              </div>
            )}
          </div>
          <ol className="sheet-grid">
            {Array.from({ length: doc.pageCount }, (_, index) => (
              <Sheet
                key={`${doc.id}-${index}`}
                pdf={doc.pdf}
                index={index}
                title={`Page ${index + 1}`}
                detail={
                  mode === "select"
                    ? null
                    : groupOf.has(index)
                      ? `File ${groupOf.get(index) + 1}`
                      : "Not included"
                }
                selected={mode === "select" ? selected.has(index) : undefined}
                onToggle={mode === "select" ? () => toggle(index) : undefined}
                toggleLabel={`Page ${index + 1}`}
              />
            ))}
          </ol>
        </>
      )}
    </ToolShell>
  );
}

mountTool(SplitTool);
