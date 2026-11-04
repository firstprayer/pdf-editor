import React, { useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { checkPdfFiles, MAX_FILES, mergePdfs } from "./ops.js";
import { baseName, downloadBytes, formatBytes, plural, preparePdf, samplePdfs } from "./browser.js";
import {
  IconButton,
  mountTool,
  MoveButtons,
  PageCanvas,
  ToolShell,
  useMessages,
  useUnsaved,
  confirmDiscard,
  useReorder,
} from "./ui.jsx";
import { track } from "../analytics.js";

function MergeTool() {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState("");
  const [name, setName] = useState("merged");
  const { message, fail, note, clear } = useMessages();
  const { itemProps, move } = useReorder(files, setFiles);
  const [unsaved, markSaved] = useUnsaved(files.length > 0, [files]);
  const pages = files.reduce((sum, file) => sum + file.pageCount, 0);
  const bytes = files.reduce((sum, file) => sum + file.size, 0);

  async function add(inputs) {
    clear();
    setBusy("Opening files…");
    try {
      if (inputs.every((input) => input instanceof File))
        checkPdfFiles(inputs, bytes, files.length);
      const prepared = [];
      for (const input of inputs) prepared.push(await preparePdf(input));
      const next = [...files, ...prepared];
      if (next.reduce((sum, file) => sum + file.pageCount, 0) > 200) {
        throw new Error("Keep the merged document within 200 pages.");
      }
      setFiles(next);
      if (!files.length && prepared.length) setName(`${baseName(prepared[0].name)}-merged`);
      if (next.length === 1) note("Add at least one more PDF to merge.");
    } catch (error) {
      fail(error);
    } finally {
      setBusy("");
    }
  }

  async function merge() {
    clear();
    setBusy("Merging…");
    try {
      const output = await mergePdfs(files.map((file) => file.bytes));
      downloadBytes(output, `${baseName(name) || "merged"}.pdf`);
      markSaved();
      track("tool_run", { tool: "merge", files: files.length, pages });
      note(
        `Merged ${plural(files.length, "file")} into ${plural(pages, "page")} (${formatBytes(output.length)}).`,
      );
    } catch (error) {
      fail(error);
      track("tool_failed", { tool: "merge" });
    } finally {
      setBusy("");
    }
  }

  return (
    <ToolShell
      name="Merge PDF"
      meta={files.length ? `${plural(files.length, "file")}, ${plural(pages, "page")}` : null}
      multiple
      onFiles={add}
      addLabel="Add PDFs"
      busy={busy}
      unsaved={unsaved}
      message={message}
      onDismiss={clear}
      empty={!files.length}
      emptyState={{
        title: "Choose the PDFs to merge",
        body: `Drop up to ${MAX_FILES} PDF files here, or choose them from your device. They stay on this device.`,
        pickLabel: "Choose PDFs",
        onSample: async () => add(await samplePdfs()),
        sampleLabel: "Try two sample PDFs",
      }}
      primary={{
        label: "Merge and download",
        icon: <Download size={17} />,
        disabled: files.length < 2,
        onClick: merge,
      }}
      inspector={
        <>
          <dl className="summary">
            <div>
              <dt>Files</dt>
              <dd>{files.length}</dd>
            </div>
            <div>
              <dt>Pages</dt>
              <dd>{pages}</dd>
            </div>
            <div>
              <dt>Combined size</dt>
              <dd>{formatBytes(bytes)}</dd>
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
            Files are joined in the order shown. Drag a file, or use its arrows, to change the
            order.
          </p>
        </>
      }
    >
      <div className="stage-bar">
        <p>
          {files.length < 2
            ? "Add one more PDF to merge."
            : "Files join left to right, row by row."}
        </p>
        <div className="stage-actions">
          <button
            type="button"
            className="text-button"
            disabled={!!busy}
            onClick={() =>
              confirmDiscard(
                unsaved,
                "Remove all files? Your merged PDF has not been downloaded.",
              ) && setFiles([])
            }
          >
            <Trash2 size={16} />
            Remove all
          </button>
        </div>
      </div>
      <ol className="sheet-grid">
        {files.map((file, index) => (
          <li key={file.id} className="sheet" {...itemProps(index)}>
            <div className="sheet-paper">
              <PageCanvas pdf={file.pdf} index={0} />
            </div>
            <div className="sheet-label">
              <strong title={file.name}>{file.name}</strong>
              <span>
                {plural(file.pageCount, "page")}, {formatBytes(file.size)}
              </span>
            </div>
            <div className="sheet-tools">
              <MoveButtons index={index} count={files.length} move={move} label={file.name} />
              <IconButton
                label={`Remove ${file.name}`}
                className="is-remove"
                onClick={() => setFiles(files.filter((item) => item.id !== file.id))}
              >
                <Trash2 size={16} />
              </IconButton>
            </div>
          </li>
        ))}
      </ol>
    </ToolShell>
  );
}

mountTool(MergeTool);
