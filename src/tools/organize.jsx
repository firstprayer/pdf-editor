import React, { useState } from "react";
import { Copy, Download, RotateCw, Trash2, Undo2 } from "lucide-react";
import { assemblePages, checkPdfFiles } from "./ops.js";
import { baseName, downloadBytes, formatBytes, plural, preparePdf, samplePack } from "./browser.js";
import {
  IconButton,
  mountTool,
  MoveButtons,
  Sheet,
  ToolShell,
  useMessages,
  useReorder,
  useUnsaved,
} from "./ui.jsx";
import { track } from "../analytics.js";

let pageKey = 0;
const pagesOf = (doc, source) =>
  Array.from({ length: doc.pageCount }, (_, index) => {
    pageKey += 1;
    return { key: `p${pageKey}`, source, index, rotation: 0 };
  });

function OrganizeTool() {
  const [docs, setDocs] = useState([]);
  const [pages, setPages] = useState([]);
  const [original, setOriginal] = useState([]);
  const [name, setName] = useState("organized");
  const [busy, setBusy] = useState("");
  const { message, fail, note, clear } = useMessages();
  const { itemProps, move } = useReorder(pages, setPages);
  const [unsaved, markSaved] = useUnsaved(docs.length > 0, [pages]);
  const removed = original.length - pages.length;
  const rotated = pages.filter((page) => page.rotation % 360).length;

  async function add(inputs) {
    clear();
    setBusy("Opening files…");
    try {
      const existing = docs.reduce((sum, doc) => sum + doc.size, 0);
      if (inputs[0] instanceof File) checkPdfFiles(inputs, existing, docs.length);
      const prepared = [];
      for (const input of inputs) prepared.push(await preparePdf(input));
      const added = prepared.flatMap((doc, offset) => pagesOf(doc, docs.length + offset));
      if (pages.length + added.length > 200) throw new Error("Keep the document within 200 pages.");
      setDocs([...docs, ...prepared]);
      setPages([...pages, ...added]);
      setOriginal([...original, ...added]);
      if (!docs.length) setName(`${baseName(prepared[0].name)}-organized`);
    } catch (error) {
      fail(error);
    } finally {
      setBusy("");
    }
  }

  const update = (key, change) =>
    setPages((current) => current.map((page) => (page.key === key ? change(page) : page)));

  async function save() {
    clear();
    setBusy("Building your PDF…");
    try {
      const output = await assemblePages(
        docs.map((doc) => doc.bytes),
        pages.map(({ source, index, rotation }) => ({ source, index, rotation })),
      );
      downloadBytes(output, `${baseName(name) || "organized"}.pdf`);
      markSaved();
      track("tool_run", { tool: "organize", pages: pages.length, files: docs.length });
      note(`Saved ${plural(pages.length, "page")} (${formatBytes(output.length)}).`);
    } catch (error) {
      fail(error);
      track("tool_failed", { tool: "organize" });
    } finally {
      setBusy("");
    }
  }

  const multiple = docs.length > 1;

  return (
    <ToolShell
      name="Organize PDF"
      meta={docs.length ? plural(pages.length, "page") : null}
      multiple
      onFiles={add}
      addLabel="Add PDF"
      busy={busy}
      unsaved={unsaved}
      message={message}
      onDismiss={clear}
      empty={!docs.length}
      emptyState={{
        title: "Choose the PDF to organize",
        body: "Drop one or more PDFs here, or choose them from your device. They stay on this device.",
        pickLabel: "Choose PDF",
        onSample: async () => add([await samplePack()]),
      }}
      primary={{
        label: "Save and download",
        icon: <Download size={17} />,
        disabled: !pages.length,
        onClick: save,
      }}
      inspector={
        <>
          <dl className="summary">
            <div>
              <dt>Pages</dt>
              <dd>{pages.length}</dd>
            </div>
            <div>
              <dt>Deleted</dt>
              <dd>{Math.max(0, removed)}</dd>
            </div>
            <div>
              <dt>Rotated</dt>
              <dd>{rotated}</dd>
            </div>
          </dl>
          <label className="field">
            <span>File name</span>
            <input
              type="text"
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <p className="helper">
            Drag pages to reorder them. Use the buttons under a page to move, rotate, copy or delete
            it. Add PDF appends more pages at the end.
          </p>
        </>
      }
    >
      <div className="stage-bar">
        <p>{pages.length ? "Drag pages into the order you want." : "Every page was deleted."}</p>
        <div className="stage-actions">
          <button
            type="button"
            className="text-button"
            disabled={
              !removed &&
              !rotated &&
              pages.every((page, index) => page.key === original[index]?.key)
            }
            onClick={() => setPages(original)}
          >
            <Undo2 size={16} />
            Reset
          </button>
        </div>
      </div>
      <ol className="sheet-grid is-wide">
        {pages.map((page, position) => {
          const doc = docs[page.source];
          const label = `page ${position + 1}`;
          return (
            <Sheet
              key={page.key}
              pdf={doc.pdf}
              index={page.index}
              rotation={page.rotation}
              turn={page.rotation % 360 || null}
              title={`Page ${position + 1}`}
              detail={multiple ? `${baseName(doc.name)}, p. ${page.index + 1}` : null}
              itemProps={itemProps(position)}
              tools={
                <>
                  <MoveButtons index={position} count={pages.length} move={move} label={label} />
                  <IconButton
                    label={`Rotate ${label} clockwise`}
                    onClick={() =>
                      update(page.key, (item) => ({
                        ...item,
                        rotation: (item.rotation + 90) % 360,
                      }))
                    }
                  >
                    <RotateCw size={16} />
                  </IconButton>
                  <IconButton
                    label={`Copy ${label}`}
                    disabled={pages.length >= 200}
                    onClick={() => {
                      pageKey += 1;
                      const next = [...pages];
                      next.splice(position + 1, 0, { ...page, key: `p${pageKey}` });
                      setPages(next);
                    }}
                  >
                    <Copy size={16} />
                  </IconButton>
                  <IconButton
                    label={`Delete ${label}`}
                    className="is-remove"
                    onClick={() =>
                      setPages((current) => current.filter((item) => item.key !== page.key))
                    }
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </>
              }
            />
          );
        })}
      </ol>
    </ToolShell>
  );
}

mountTool(OrganizeTool);
