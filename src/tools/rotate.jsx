import React, { useState } from "react";
import { Download, RotateCcw, RotateCw, Undo2 } from "lucide-react";
import { assemblePages, checkPdfFiles } from "./ops.js";
import { baseName, downloadBytes, plural, preparePdf } from "./browser.js";
import { IconButton, mountTool, Sheet, ToolShell, useMessages, useUnsaved } from "./ui.jsx";
import { track } from "../analytics.js";

const turn = (rotation, by) => (((rotation + by) % 360) + 360) % 360;

function RotateTool() {
  const [doc, setDoc] = useState(null);
  const [rotations, setRotations] = useState([]);
  const [busy, setBusy] = useState("");
  const { message, fail, note, clear } = useMessages();
  const changed = rotations.filter(Boolean).length;
  const [unsaved, markSaved] = useUnsaved(changed > 0, [rotations]);

  async function open(inputs) {
    clear();
    setBusy("Opening PDF…");
    try {
      if (inputs[0] instanceof File) checkPdfFiles(inputs.slice(0, 1));
      const prepared = await preparePdf(inputs[0]);
      setDoc(prepared);
      setRotations(Array(prepared.pageCount).fill(0));
      if (inputs.length > 1) note("Rotate works on one PDF at a time. The first file was opened.");
    } catch (error) {
      fail(error);
    } finally {
      setBusy("");
    }
  }

  const rotateAll = (by) => setRotations(rotations.map((rotation) => turn(rotation, by)));
  const rotateOne = (index, by) =>
    setRotations(
      rotations.map((rotation, position) => (position === index ? turn(rotation, by) : rotation)),
    );

  async function save() {
    clear();
    setBusy("Saving rotated PDF…");
    try {
      const output = await assemblePages(
        [doc.bytes],
        rotations.map((rotation, index) => ({ source: 0, index, rotation })),
      );
      downloadBytes(output, `${baseName(doc.name)}-rotated.pdf`);
      markSaved();
      track("tool_run", { tool: "rotate", pages: doc.pageCount, edits: changed });
      note(`Saved with ${plural(changed, "page")} rotated.`);
    } catch (error) {
      fail(error);
      track("tool_failed", { tool: "rotate" });
    } finally {
      setBusy("");
    }
  }

  return (
    <ToolShell
      name="Rotate PDF"
      meta={doc ? `${doc.name}, ${plural(doc.pageCount, "page")}` : null}
      onFiles={open}
      addLabel="Open another PDF"
      busy={busy}
      unsaved={unsaved}
      message={message}
      onDismiss={clear}
      empty={!doc}
      emptyState={{
        title: "Choose the PDF to rotate",
        body: "Drop a PDF here, or choose one from your device. It stays on this device.",
        pickLabel: "Choose PDF",
      }}
      primary={{
        label: "Rotate and download",
        icon: <Download size={17} />,
        disabled: !changed,
        onClick: save,
      }}
      inspector={
        <>
          <fieldset className="option-group">
            <legend>All pages</legend>
            <div className="field-row">
              <button type="button" className="button button-quiet" onClick={() => rotateAll(-90)}>
                <RotateCcw size={17} />
                <span>Left</span>
              </button>
              <button type="button" className="button button-quiet" onClick={() => rotateAll(90)}>
                <RotateCw size={17} />
                <span>Right</span>
              </button>
            </div>
          </fieldset>
          <dl className="summary">
            <div>
              <dt>Pages rotated</dt>
              <dd>
                {changed} of {rotations.length}
              </dd>
            </div>
          </dl>
          <p className="helper">Select a page to turn it clockwise, or use the buttons under it.</p>
        </>
      }
    >
      {doc && (
        <>
          <div className="stage-bar">
            <p>
              {changed
                ? `${plural(changed, "page")} will be saved rotated.`
                : "Select a page to turn it."}
            </p>
            <div className="stage-actions">
              <button
                type="button"
                className="text-button"
                disabled={!changed}
                onClick={() => setRotations(rotations.map(() => 0))}
              >
                <Undo2 size={16} />
                Reset
              </button>
            </div>
          </div>
          <ol className="sheet-grid">
            {rotations.map((rotation, index) => (
              <Sheet
                key={`${doc.id}-${index}`}
                pdf={doc.pdf}
                index={index}
                rotation={rotation}
                turn={rotation || null}
                title={`Page ${index + 1}`}
                onToggle={() => rotateOne(index, 90)}
                toggleLabel={`Turn page ${index + 1} clockwise`}
                tools={
                  <>
                    <IconButton
                      label={`Turn page ${index + 1} left`}
                      onClick={() => rotateOne(index, -90)}
                    >
                      <RotateCcw size={16} />
                    </IconButton>
                    <IconButton
                      label={`Turn page ${index + 1} right`}
                      onClick={() => rotateOne(index, 90)}
                    >
                      <RotateCw size={16} />
                    </IconButton>
                  </>
                }
              />
            ))}
          </ol>
        </>
      )}
    </ToolShell>
  );
}

mountTool(RotateTool);
