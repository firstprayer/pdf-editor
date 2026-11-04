import React, { useState } from "react";
import { Download, Minimize2 } from "lucide-react";
import { checkPdfFiles, compressImages, compressLossless, pagesFromJpegs } from "./ops.js";
import {
  baseName,
  downloadBytes,
  formatBytes,
  jpegReencoder,
  plural,
  preparePdf,
  renderPageImage,
} from "./browser.js";
import { mountTool, Sheet, ToolShell, useMessages, useUnsaved } from "./ui.jsx";
import { track } from "../analytics.js";

const LEVELS = [
  {
    value: "basic",
    label: "Basic",
    detail: "Rewrites the file more compactly. Nothing on the pages changes.",
  },
  {
    value: "recommended",
    label: "Recommended",
    detail: "Also shrinks large photos. Text and drawings stay sharp and selectable.",
  },
  {
    value: "strong",
    label: "Strong",
    detail: "Turns every page into an image. Smallest for scans, but text is no longer selectable.",
  },
];

function CompressTool() {
  const [doc, setDoc] = useState(null);
  const [level, setLevel] = useState("recommended");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState("");
  const { message, fail, note, clear } = useMessages();
  const [unsaved, markSaved] = useUnsaved(!!result, [result]);

  async function open(inputs) {
    clear();
    setBusy("Opening PDF…");
    try {
      if (inputs[0] instanceof File) checkPdfFiles(inputs.slice(0, 1));
      setDoc(await preparePdf(inputs[0]));
      setResult(null);
      if (inputs.length > 1)
        note("Compress works on one PDF at a time. The first file was opened.");
    } catch (error) {
      fail(error);
    } finally {
      setBusy("");
    }
  }

  async function compress() {
    clear();
    setResult(null);
    try {
      let bytes;
      let detail = "";
      if (level === "basic") {
        setBusy("Rewriting the file…");
        bytes = await compressLossless(doc.bytes);
      } else if (level === "recommended") {
        setBusy("Looking for photos…");
        const outcome = await compressImages(
          doc.bytes,
          jpegReencoder({ maxDimension: 1600, quality: 0.7 }),
          (done, total) => setBusy(`Recompressing photo ${done} of ${total}…`),
        );
        bytes = outcome.bytes;
        detail = outcome.images
          ? `${plural(outcome.replaced, "photo")} of ${outcome.images} made smaller.`
          : "No JPEG photos found, so only the file structure was compacted.";
      } else {
        const rendered = [];
        for (let index = 0; index < doc.pageCount; index += 1) {
          setBusy(`Rendering page ${index + 1} of ${doc.pageCount}…`);
          rendered.push(await renderPageImage(doc.pdf, index, { dpi: 110, quality: 0.62 }));
        }
        setBusy("Building the PDF…");
        bytes = await pagesFromJpegs(rendered);
        detail = "Pages are now images; text cannot be selected or searched.";
      }
      setResult({ bytes, level, detail });
      track("tool_run", { tool: "compress", pages: doc.pageCount, method: level });
    } catch (error) {
      fail(error);
      track("tool_failed", { tool: "compress" });
    } finally {
      setBusy("");
    }
  }

  const saved = result ? 1 - result.bytes.length / doc.size : 0;
  const smaller = result && saved > 0.01;

  function download() {
    downloadBytes(result.bytes, `${baseName(doc.name)}-compressed.pdf`);
    markSaved();
    track("pdf_download", { tool: "compress", method: result.level });
  }

  return (
    <ToolShell
      name="Compress PDF"
      meta={doc ? `${doc.name}, ${formatBytes(doc.size)}` : null}
      onFiles={open}
      addLabel="Open another PDF"
      busy={busy}
      unsaved={unsaved}
      message={message}
      onDismiss={clear}
      empty={!doc}
      emptyState={{
        title: "Choose the PDF to compress",
        body: "Drop a PDF here, or choose one from your device. It is compressed in this tab and never uploaded.",
        pickLabel: "Choose PDF",
      }}
      primary={
        result
          ? { label: "Download compressed PDF", icon: <Download size={17} />, onClick: download }
          : { label: "Compress", icon: <Minimize2 size={17} />, onClick: compress }
      }
      inspector={
        <>
          <fieldset className="option-group">
            <legend>Compression</legend>
            <div className="choice-list">
              {LEVELS.map((option) => (
                <label key={option.value} className="choice">
                  <input
                    type="radio"
                    name="level"
                    value={option.value}
                    checked={level === option.value}
                    onChange={() => {
                      setLevel(option.value);
                      setResult(null);
                    }}
                  />
                  <strong>{option.label}</strong>
                  <small>{option.detail}</small>
                </label>
              ))}
            </div>
          </fieldset>
          {result ? (
            <div className={`result ${smaller ? "" : "is-flat"}`}>
              <span className="result-size">{formatBytes(result.bytes.length)}</span>
              <p>
                {smaller
                  ? `${Math.round(saved * 100)}% smaller than the original ${formatBytes(doc.size)}.`
                  : `Not smaller than the original ${formatBytes(doc.size)}. Keep your original, or try a stronger level.`}
              </p>
              {result.detail && <p>{result.detail}</p>}
            </div>
          ) : (
            <dl className="summary">
              <div>
                <dt>Original size</dt>
                <dd>{doc ? formatBytes(doc.size) : ""}</dd>
              </div>
              <div>
                <dt>Pages</dt>
                <dd>{doc?.pageCount}</dd>
              </div>
            </dl>
          )}
        </>
      }
    >
      {doc && (
        <div className="stage-bar">
          <p role="status">
            {result
              ? `${formatBytes(doc.size)} to ${formatBytes(result.bytes.length)}: ${
                  smaller ? `${Math.round(saved * 100)}% smaller.` : "not smaller."
                }`
              : "Choose a level, then select Compress."}
          </p>
        </div>
      )}
      {doc && (
        <ol className="sheet-grid">
          {Array.from({ length: Math.min(doc.pageCount, 60) }, (_, index) => (
            <Sheet
              key={`${doc.id}-${index}`}
              pdf={doc.pdf}
              index={index}
              title={`Page ${index + 1}`}
            />
          ))}
        </ol>
      )}
    </ToolShell>
  );
}

mountTool(CompressTool);
