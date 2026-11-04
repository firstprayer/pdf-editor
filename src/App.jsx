import React, { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FilePlus2,
  FileText,
  FolderOpen,
  Hand,
  HelpCircle,
  Highlighter,
  ImagePlus,
  LockKeyhole,
  Maximize,
  Minus,
  MousePointer2,
  PanelLeft,
  PenLine,
  Plus,
  Redo2,
  RotateCw,
  ScanText,
  ShieldCheck,
  Signature,
  Trash2,
  Type,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { DocumentPage, Thumbnail } from "./DocumentPage.jsx";
import { SignatureDialog } from "./SignatureDialog.jsx";
import {
  createHistory,
  DOCUMENT_COLORS,
  duplicateAnnotation,
  downloadName,
  historyReducer,
  MAX_PAGES,
  moveAnnotation,
  pageNeedsFlattening,
  validateFileSelection,
} from "./model.js";
import { exportPdf, inspectPdf, renderRedactedPage, validateText } from "./pdf.js";
import { browserCanvas, canvasPng, openRenderer, readImage } from "./rendering.js";
import { createSamplePdf } from "./sample.js";

const tools = [
  {
    id: "select",
    label: "Select",
    icon: MousePointer2,
    key: "V",
    hint: "Select an edit to adjust it. Drag to move it.",
  },
  {
    id: "edit",
    label: "Edit text",
    icon: ScanText,
    key: "E",
    hint: "Click an original line of text, then change it in the panel.",
  },
  {
    id: "text",
    label: "Add text",
    icon: Type,
    key: "T",
    hint: "Click anywhere to add text. Then type in the panel.",
  },
  {
    id: "signature",
    label: "Sign",
    icon: Signature,
    key: "S",
    hint: "Click on your document to place your signature.",
  },
  {
    id: "highlight",
    label: "Highlight",
    icon: Highlighter,
    key: "H",
    hint: "Drag across the part you want to highlight.",
  },
  { id: "draw", label: "Draw", icon: PenLine, key: "D", hint: "Draw directly on your document." },
  {
    id: "redact",
    label: "Redact",
    icon: ShieldCheck,
    key: "R",
    hint: "Drag over content to permanently remove it from the downloaded PDF.",
  },
  {
    id: "image",
    label: "Image",
    icon: ImagePlus,
    key: "I",
    hint: "Click on the document to place your image.",
  },
];

function IconButton({ label, children, ...props }) {
  return (
    <button type="button" className="icon-button" aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}

function NumberField({ label, value, min, max, onCommit }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const next = Number(draft);
          if (draft.trim() && Number.isFinite(next)) onCommit(Math.min(max, Math.max(min, next)));
          else setDraft(String(value));
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
  );
}

export function App() {
  const [history, dispatch] = useReducer(historyReducer, undefined, () => createHistory());
  const [sources, setSources] = useState({});
  const sourceRegistry = useRef({});
  const [activeId, setActiveId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [tool, setTool] = useState("select");
  const [fileName, setFileName] = useState("sample-agreement.pdf");
  const [sample, setSample] = useState(true);
  const [busy, setBusy] = useState("Preparing your workspace…");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [dirty, setDirty] = useState(false);
  const [showPages, setShowPages] = useState(false);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [pendingImage, setPendingImage] = useState(null);
  const [color, setColor] = useState(DOCUMENT_COLORS[0].value);
  const [size, setSize] = useState(14);
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [zoom, setZoom] = useState(1);
  const [availableWidth, setAvailableWidth] = useState(720);
  const [dragOver, setDragOver] = useState(false);
  const [textItems, setTextItems] = useState([]);
  const stageRef = useRef(null);
  const openInput = useRef(null);
  const mergeInput = useRef(null);
  const imageInput = useRef(null);
  const textInput = useRef(null);
  const helpDialog = useRef(null);
  const dragCounter = useRef(0);
  const pages = history.present.pages;
  const activePage = pages.find((page) => page.id === activeId) ?? pages[0];
  const activeIndex = pages.indexOf(activePage);
  const selected = activePage?.annotations.find((annotation) => annotation.id === selectedId);
  const activeTool = tools.find((item) => item.id === tool);
  const edits = pages.reduce((total, page) => total + page.annotations.length, 0);
  const setProblem = useCallback((message) => {
    setError(message);
    setStatus("");
  }, []);
  const receiveText = useCallback((items) => {
    setTextItems(items);
  }, []);

  async function makeSource(bytes) {
    const inspected = await inspectPdf(bytes);
    const pdf = await openRenderer(bytes);
    const id = crypto.randomUUID();
    return {
      source: { id, bytes, pdf },
      pages: inspected.map((page) => ({
        ...page,
        id: crypto.randomUUID(),
        sourceId: id,
        annotations: [],
      })),
    };
  }

  useEffect(() => {
    let cancelled = false;
    async function start() {
      const created = await makeSource(await createSamplePdf());
      if (cancelled) {
        await created.source.pdf.loadingTask.destroy();
        return;
      }
      const registry = { [created.source.id]: created.source };
      sourceRegistry.current = registry;
      setSources(registry);
      dispatch({ type: "reset", value: { pages: created.pages } });
      setActiveId(created.pages[0].id);
      setBusy("");
    }
    start().catch(() => {
      if (!cancelled) {
        setBusy("");
        setProblem("The sample could not be loaded. Open your own PDF to begin.");
      }
    });
    return () => {
      cancelled = true;
      Object.values(sourceRegistry.current).forEach((source) =>
        source.pdf.loadingTask.destroy().catch(() => {}),
      );
    };
  }, [setProblem]);

  useEffect(() => {
    if (!stageRef.current) return;
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(entry.contentRect.width));
    observer.observe(stageRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (["text", "replace"].includes(selected?.type))
      textInput.current?.focus({ preventScroll: true });
  }, [selected?.id, selected?.type]);

  useEffect(() => {
    if (helpOpen) helpDialog.current?.showModal();
  }, [helpOpen]);

  useEffect(() => {
    const warn = (event) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function commit(nextPages) {
    dispatch({ type: "commit", value: { pages: nextPages } });
    setDirty(true);
    setError("");
    setStatus("");
  }

  function updateActive(updater) {
    if (!activePage) return;
    commit(pages.map((page) => (page.id === activePage.id ? updater(page) : page)));
  }

  function createAnnotation(annotation, selectAfter = true) {
    if (annotation.type === "replace") {
      const existing = activePage.annotations.find(
        (item) =>
          item.type === "replace" &&
          item.originalX === annotation.originalX &&
          item.originalY === annotation.originalY,
      );
      if (existing) {
        setSelectedId(existing.id);
        setTool("select");
        return;
      }
    }
    if (["text", "replace"].includes(annotation.type)) {
      try {
        validateText(annotation.text);
      } catch (problem) {
        setProblem(problem.message);
        return;
      }
    }
    const id = crypto.randomUUID();
    updateActive((page) => ({
      ...page,
      annotations: [...page.annotations, { ...annotation, id }],
    }));
    setSelectedId(id);
    if (selectAfter) setTool("select");
  }

  function updateSelection(patch) {
    if (!selected) return;
    if (patch.text !== undefined) {
      try {
        validateText(patch.text);
      } catch (problem) {
        setProblem(problem.message);
        return;
      }
    }
    updateActive((page) => ({
      ...page,
      annotations: page.annotations.map((item) =>
        item.id === selected.id ? { ...item, ...patch } : item,
      ),
    }));
  }

  function deleteSelection() {
    if (!selected) return;
    updateActive((page) => ({
      ...page,
      annotations: page.annotations.filter((item) => item.id !== selected.id),
    }));
    setSelectedId(null);
  }

  async function importFiles(files, append = false) {
    if (!files.length) return;
    try {
      validateFileSelection(
        files,
        append
          ? Object.values(sourceRegistry.current).reduce(
              (total, source) => total + source.bytes.length,
              0,
            )
          : 0,
      );
    } catch (problem) {
      setProblem(problem.message);
      return;
    }
    if (
      !append &&
      dirty &&
      !window.confirm(
        "Replace this document? Download your changes first if you want to keep them.",
      )
    )
      return;
    setBusy(append ? "Adding pages…" : "Opening your PDF…");
    setError("");
    const createdSources = [];
    try {
      for (const file of files) {
        const created = await makeSource(new Uint8Array(await file.arrayBuffer()));
        createdSources.push(created);
      }
      const nextPages = createdSources.flatMap((item) => item.pages);
      if (nextPages.length + (append ? pages.length : 0) > MAX_PAGES)
        throw new Error("Keep your workspace within 200 pages.");
      const nextSources = Object.fromEntries(
        createdSources.map(({ source }) => [source.id, source]),
      );
      if (append) {
        const registry = { ...sourceRegistry.current, ...nextSources };
        sourceRegistry.current = registry;
        setSources(registry);
        commit([...pages, ...nextPages]);
      } else {
        const previous = Object.values(sourceRegistry.current);
        sourceRegistry.current = nextSources;
        setSources(nextSources);
        dispatch({ type: "reset", value: { pages: nextPages } });
        setFileName(files[0].name);
        setSample(false);
        setDirty(false);
        window.setTimeout(
          () => previous.forEach((source) => source.pdf.loadingTask.destroy().catch(() => {})),
          100,
        );
      }
      setActiveId(nextPages[0].id);
      setSelectedId(null);
      setTool("select");
      setZoom(1);
      setStatus(
        append
          ? `${nextPages.length} ${nextPages.length === 1 ? "page added" : "pages added"}.`
          : "",
      );
    } catch (problem) {
      createdSources.forEach(({ source }) => source.pdf.loadingTask.destroy().catch(() => {}));
      setProblem(
        problem.message || "The PDF could not be opened. Your current document is unchanged.",
      );
    } finally {
      setBusy("");
    }
  }

  async function addBlankPage() {
    if (busy || pages.length >= MAX_PAGES) return;
    setBusy("Adding a blank page…");
    try {
      const document = await PDFDocument.create();
      document.addPage([595, 842]);
      const created = await makeSource(await document.save());
      const registry = { ...sourceRegistry.current, [created.source.id]: created.source };
      sourceRegistry.current = registry;
      setSources(registry);
      commit([...pages, ...created.pages]);
      setActiveId(created.pages[0].id);
      setSelectedId(null);
    } catch {
      setProblem("A blank page could not be added. Try again.");
    } finally {
      setBusy("");
    }
  }

  async function chooseImage(file) {
    if (!file) return;
    try {
      if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 10 * 1024 * 1024)
        throw new Error("Choose a PNG or JPEG image smaller than 10 MB.");
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("The image could not be read."));
        reader.readAsDataURL(file);
      });
      const image = await readImage(dataUrl);
      if (image.width * image.height > 40_000_000)
        throw new Error("Choose an image with fewer than 40 million pixels.");
      setPendingImage({ dataUrl, ratio: image.width / image.height });
      setTool("image");
      setSelectedId(null);
      setError("");
    } catch (problem) {
      setProblem(problem.message);
    }
  }

  function chooseTool(id) {
    if (id === "signature") {
      setSignatureOpen(true);
      return;
    }
    if (id === "image") {
      imageInput.current.click();
      return;
    }
    setSelectedId(null);
    setTool(id);
    setError("");
  }

  const download = useCallback(async () => {
    if (busy || !pages.length) return;
    setBusy("Preparing your download…");
    setError("");
    try {
      const bytes = await exportPdf({
        sources,
        pages,
        renderFlattenedPage: async (descriptor) => {
          const sourcePage = await sources[descriptor.sourceId].pdf.getPage(descriptor.index + 1);
          return renderRedactedPage(
            sourcePage,
            descriptor.annotations,
            browserCanvas,
            canvasPng,
            readImage,
          );
        },
      });
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = downloadName(fileName);
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      setDirty(false);
      setStatus("Download started. Your changes are still here.");
    } catch (problem) {
      setProblem(
        problem.message || "The download could not be prepared. Your changes are still here.",
      );
    } finally {
      setBusy("");
    }
  }, [busy, pages, sources, fileName, setProblem]);

  useEffect(() => {
    function keydown(event) {
      const isInput =
        event.target instanceof HTMLElement &&
        (event.target.matches("input, textarea, select") || event.target.isContentEditable);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        download();
        return;
      }
      if (isInput || signatureOpen || helpOpen || busy) return;
      if ((event.metaKey || event.ctrlKey) && ["z", "y"].includes(event.key.toLowerCase())) {
        event.preventDefault();
        dispatch({ type: event.shiftKey || event.key.toLowerCase() === "y" ? "redo" : "undo" });
        setDirty(true);
        setSelectedId(null);
      } else if (["Delete", "Backspace"].includes(event.key) && selectedId) {
        event.preventDefault();
        deleteSelection();
      } else if (!event.metaKey && !event.ctrlKey) {
        const found = tools.find((item) => item.key.toLowerCase() === event.key.toLowerCase());
        if (found) {
          event.preventDefault();
          chooseTool(found.id);
        }
      }
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });

  function changePage(nextId) {
    setActiveId(nextId);
    setSelectedId(null);
    setError("");
  }
  function movePage(direction) {
    const target = activeIndex + direction;
    if (target < 0 || target >= pages.length) return;
    const next = [...pages];
    [next[activeIndex], next[target]] = [next[target], next[activeIndex]];
    commit(next);
  }
  function duplicatePage() {
    const copy = {
      ...activePage,
      id: crypto.randomUUID(),
      annotations: activePage.annotations.map((item) => ({ ...item, id: crypto.randomUUID() })),
    };
    commit([...pages.slice(0, activeIndex + 1), copy, ...pages.slice(activeIndex + 1)]);
    changePage(copy.id);
  }
  function deletePage() {
    if (pages.length <= 1) return;
    const next = pages.filter((page) => page.id !== activePage.id);
    commit(next);
    changePage(next[Math.min(activeIndex, next.length - 1)].id);
  }

  return (
    <div
      className="app-shell"
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          dragCounter.current += 1;
          setDragOver(true);
        }
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        event.preventDefault();
        dragCounter.current -= 1;
        if (dragCounter.current <= 0) setDragOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragCounter.current = 0;
        setDragOver(false);
        if (!busy) importFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <a className="skip-link" href="#document">
        Skip to document
      </a>
      <header className="app-header">
        <a className="wordmark" href="#document" aria-label="PDF Workspace">
          <span className="wordmark-icon">
            <FileText size={22} strokeWidth={1.7} />
          </span>
          <span>
            PDF<span className="wordmark-light">Workspace</span>
          </span>
        </a>
        <div className="file-identity">
          <FileText size={16} />
          <label className="visually-hidden" htmlFor="filename">
            Document filename
          </label>
          <input
            id="filename"
            value={fileName}
            maxLength={160}
            onChange={(event) => setFileName(event.target.value)}
          />
          <span className="document-status">{dirty ? "Unsaved edits" : "Ready to edit"}</span>
        </div>
        <div className="header-actions">
          <span className="privacy-label">
            <LockKeyhole size={14} />
            On your device
          </span>
          <button
            type="button"
            className="button button-quiet"
            aria-label="Open PDF"
            disabled={!!busy}
            onClick={() => openInput.current.click()}
          >
            <FolderOpen size={17} />
            <span>Open PDF</span>
          </button>
          <button
            type="button"
            className="button button-primary"
            disabled={!!busy || !pages.length}
            aria-busy={busy === "Preparing your download…"}
            onClick={download}
          >
            <Download size={17} />
            <span>{busy === "Preparing your download…" ? "Preparing…" : "Download"}</span>
          </button>
        </div>
      </header>

      <div className="editing-toolbar">
        <div className="history-controls">
          <IconButton
            label="Undo (Command or Control Z)"
            disabled={!history.past.length || !!busy}
            onClick={() => {
              dispatch({ type: "undo" });
              setSelectedId(null);
              setDirty(true);
            }}
          >
            <Undo2 size={18} />
          </IconButton>
          <IconButton
            label="Redo (Command or Control Shift Z)"
            disabled={!history.future.length || !!busy}
            onClick={() => {
              dispatch({ type: "redo" });
              setSelectedId(null);
              setDirty(true);
            }}
          >
            <Redo2 size={18} />
          </IconButton>
        </div>
        <div className="tool-list" role="toolbar" aria-label="PDF editing tools">
          {tools.map(({ id, label, icon: Icon, key }) => (
            <button
              key={id}
              type="button"
              className={`tool-button ${tool === id ? "is-active" : ""}`}
              aria-pressed={tool === id}
              title={`${label} (${key})`}
              disabled={!!busy || !activePage}
              onClick={() => chooseTool(id)}
            >
              <Icon size={18} strokeWidth={1.7} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <IconButton label="Help and keyboard shortcuts" onClick={() => setHelpOpen(true)}>
          <HelpCircle size={19} />
        </IconButton>
      </div>

      <div className="workspace-heading">
        <div>
          <span className="document-title">A little less paperwork.</span>
          <span className="workspace-description">Everything you need, right on the page.</span>
        </div>
        <button
          type="button"
          className="text-button"
          disabled={!!busy}
          onClick={() => mergeInput.current.click()}
        >
          <Plus size={16} />
          Add PDF pages
        </button>
      </div>
      {(error || status) && (
        <div className={`message-bar ${error ? "is-error" : ""}`} role={error ? "alert" : "status"}>
          <span>{error || status}</span>
          <IconButton
            label="Dismiss message"
            onClick={() => {
              setError("");
              setStatus("");
            }}
          >
            <X size={16} />
          </IconButton>
        </div>
      )}

      <h1 className="visually-hidden">PDF Workspace</h1>
      <main id="document" className="workspace" inert={Boolean(busy)}>
        <aside className={`page-rail ${showPages ? "is-open" : ""}`} aria-label="Document pages">
          <div className="panel-heading">
            <div className="heading-with-count">
              <h2>Pages</h2>
              <span className="page-count">{pages.length}</span>
            </div>
            <IconButton
              label="Add a blank page"
              disabled={!!busy || pages.length >= MAX_PAGES}
              onClick={addBlankPage}
            >
              <FilePlus2 size={17} />
            </IconButton>
          </div>
          <div className="thumbnail-list">
            {pages.map((page, index) => (
              <Thumbnail
                key={page.id}
                source={sources[page.sourceId]}
                descriptor={page}
                number={index + 1}
                selected={activePage?.id === page.id}
                onSelect={() => changePage(page.id)}
              />
            ))}
          </div>
          <div className="rail-footer">
            <ShieldCheck size={15} />
            <p>
              Your original file
              <br />
              stays unchanged.
            </p>
          </div>
        </aside>

        <section className="document-region" aria-label="PDF document">
          <div className="document-controls">
            <div className="page-navigation">
              <IconButton
                label="Show or hide pages"
                className="icon-button mobile-pages-toggle"
                aria-expanded={showPages}
                onClick={() => setShowPages(!showPages)}
              >
                <PanelLeft size={17} />
              </IconButton>
              <IconButton
                label="Previous page"
                disabled={activeIndex <= 0}
                onClick={() => changePage(pages[activeIndex - 1].id)}
              >
                <ChevronLeft size={17} />
              </IconButton>
              <span>
                Page <b>{activeIndex + 1 || 0}</b> of {pages.length}
              </span>
              <IconButton
                label="Next page"
                disabled={activeIndex >= pages.length - 1}
                onClick={() => changePage(pages[activeIndex + 1].id)}
              >
                <ChevronRight size={17} />
              </IconButton>
            </div>
            <div className="zoom-controls">
              <IconButton
                label="Zoom out"
                disabled={zoom <= 0.5}
                onClick={() => setZoom(Math.max(0.5, zoom - 0.15))}
              >
                <Minus size={16} />
              </IconButton>
              <span>{Math.round(zoom * 100)}%</span>
              <IconButton
                label="Zoom in"
                disabled={zoom >= 2.5}
                onClick={() => setZoom(Math.min(2.5, zoom + 0.15))}
              >
                <Plus size={16} />
              </IconButton>
              <IconButton label="Fit page width" onClick={() => setZoom(1)}>
                <Maximize size={16} />
              </IconButton>
            </div>
          </div>
          <div ref={stageRef} className="document-stage" aria-busy={!!busy}>
            <div className="paper-surround">
              {sample && (
                <div className="sample-caption">
                  <span>Sample document</span>
                  <span>Try a tool or open your own PDF</span>
                </div>
              )}
              {activePage && sources[activePage.sourceId] ? (
                <DocumentPage
                  descriptor={activePage}
                  source={sources[activePage.sourceId]}
                  availableWidth={availableWidth}
                  zoom={zoom}
                  tool={tool}
                  selectedId={selectedId}
                  color={color}
                  size={size}
                  strokeWidth={strokeWidth}
                  pendingImage={pendingImage}
                  onSelect={setSelectedId}
                  onCreate={createAnnotation}
                  onMove={(id, dx, dy) =>
                    updateActive((page) => ({
                      ...page,
                      annotations: page.annotations.map((item) =>
                        item.id === id ? moveAnnotation(item, dx, dy) : item,
                      ),
                    }))
                  }
                  onError={setProblem}
                  onTextItems={receiveText}
                />
              ) : (
                <div className="workspace-empty">
                  <FileText size={36} />
                  <h2>{busy ? "Getting your page ready…" : "A fresh page starts here."}</h2>
                  <p>{busy || "Open a PDF to start editing. Your file stays on this device."}</p>
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => openInput.current.click()}
                  >
                    <FolderOpen size={17} />
                    Open PDF
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="canvas-status">
            <span>
              <Hand size={14} />
              {activeTool.hint}
            </span>
            <span>
              {edits} {edits === 1 ? "edit" : "edits"}
            </span>
          </div>
        </section>

        <aside className="inspector" aria-label="Editing properties">
          <div className="panel-heading">
            <h2>{selected ? "Your selection" : "Make it yours"}</h2>
            {selected && (
              <IconButton label="Deselect edit" onClick={() => setSelectedId(null)}>
                <X size={16} />
              </IconButton>
            )}
          </div>
          <div className="inspector-body">
            {activePage?.annotations.length > 0 && (
              <label className="field">
                <span>Select an edit</span>
                <select
                  value={selectedId ?? ""}
                  onChange={(event) => {
                    setSelectedId(event.target.value || null);
                    setTool("select");
                  }}
                >
                  <option value="">Choose an edit</option>
                  {activePage.annotations.map((item, index) => (
                    <option key={item.id} value={item.id}>
                      {index + 1}.{" "}
                      {item.text?.slice(0, 50) ||
                        tools.find((entry) => entry.id === item.type)?.label ||
                        "Edit"}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {selected ? (
              <>
                <div className="selection-kind">
                  <span>
                    {selected.type === "replace"
                      ? "Edited original text"
                      : (tools.find((item) => item.id === selected.type)?.label ?? "Text box")}
                  </span>
                  <Check size={14} />
                </div>
                {["text", "replace"].includes(selected.type) && (
                  <>
                    <label className="field">
                      <span>Text</span>
                      <textarea
                        ref={textInput}
                        value={selected.text}
                        rows={5}
                        onChange={(event) => updateSelection({ text: event.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span>Typeface</span>
                      <select
                        value={selected.font}
                        onChange={(event) => updateSelection({ font: event.target.value })}
                      >
                        <option value="sans">Helvetica</option>
                        <option value="bold">Helvetica Bold</option>
                        <option value="serif">Times Roman</option>
                        <option value="mono">Courier</option>
                      </select>
                    </label>
                    <NumberField
                      label="Font size"
                      value={selected.size}
                      min={6}
                      max={144}
                      onCommit={(next) => updateSelection({ size: next })}
                    />
                  </>
                )}
                {["text", "replace", "draw"].includes(selected.type) && (
                  <fieldset className="color-field">
                    <legend>Color</legend>
                    <div className="color-options">
                      {DOCUMENT_COLORS.map((item) => (
                        <button
                          type="button"
                          key={item.name}
                          aria-label={item.name}
                          aria-pressed={selected.color === item.value}
                          style={{ "--swatch": item.value }}
                          className="color-option"
                          onClick={() => updateSelection({ color: item.value })}
                        >
                          {selected.color === item.value && <Check size={15} />}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                )}
                {["signature", "image", "highlight", "redact"].includes(selected.type) && (
                  <>
                    <NumberField
                      label="Width (pt)"
                      value={Math.round(selected.width)}
                      min={5}
                      max={1200}
                      onCommit={(next) =>
                        updateSelection({
                          width: next,
                          ...(["signature", "image"].includes(selected.type)
                            ? { height: (selected.height * next) / selected.width }
                            : {}),
                        })
                      }
                    />
                    {!["signature", "image"].includes(selected.type) && (
                      <NumberField
                        label="Height (pt)"
                        value={Math.round(selected.height)}
                        min={5}
                        max={1200}
                        onCommit={(next) => updateSelection({ height: next })}
                      />
                    )}
                  </>
                )}
                {selected.type === "draw" && (
                  <NumberField
                    label="Stroke width"
                    value={selected.strokeWidth}
                    min={1}
                    max={20}
                    onCommit={(next) => updateSelection({ strokeWidth: next })}
                  />
                )}
                <div className="selection-actions">
                  <button
                    type="button"
                    className="button button-quiet"
                    onClick={() => {
                      createAnnotation(duplicateAnnotation(selected));
                    }}
                  >
                    <Copy size={15} />
                    Duplicate
                  </button>
                  <button
                    type="button"
                    className="button button-quiet danger"
                    onClick={deleteSelection}
                  >
                    <Trash2 size={15} />
                    Remove
                  </button>
                </div>
                <p className="helper">
                  Drag the selection on your page to move it. Undo is always one click away.
                </p>
              </>
            ) : (
              <>
                <div className="tool-introduction">
                  <activeTool.icon size={26} strokeWidth={1.5} />
                  <h3>{tool === "select" ? "Small edits. Big difference." : activeTool.label}</h3>
                  <p>
                    {tool === "select"
                      ? "Add a thought, sign the dotted line, or give your pages a little order."
                      : activeTool.hint}
                  </p>
                </div>
                {["text", "edit"].includes(tool) && (
                  <NumberField
                    label="New text size"
                    value={size}
                    min={6}
                    max={144}
                    onCommit={setSize}
                  />
                )}
                {tool === "draw" && (
                  <NumberField
                    label="Stroke width"
                    value={strokeWidth}
                    min={1}
                    max={20}
                    onCommit={setStrokeWidth}
                  />
                )}
                {["text", "edit", "draw"].includes(tool) && (
                  <fieldset className="color-field">
                    <legend>Color</legend>
                    <div className="color-options">
                      {DOCUMENT_COLORS.map((item) => (
                        <button
                          key={item.name}
                          type="button"
                          aria-label={item.name}
                          aria-pressed={color === item.value}
                          style={{ "--swatch": item.value }}
                          className="color-option"
                          onClick={() => setColor(item.value)}
                        >
                          {color === item.value && <Check size={15} />}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                )}
                {tool === "edit" && textItems.length > 0 && (
                  <label className="field">
                    <span>Or choose a line</span>
                    <select
                      value=""
                      onChange={(event) => {
                        const item = textItems[Number(event.target.value)];
                        if (!item) return;
                        const fontSize = Math.hypot(item.transform[2], item.transform[3]);
                        createAnnotation({
                          type: "replace",
                          text: item.str,
                          x: item.transform[4],
                          y: item.transform[5],
                          originalX: item.transform[4],
                          originalY: item.transform[5],
                          originalSize: fontSize,
                          originalWidth: item.width,
                          size: Math.max(6, Math.round(fontSize)),
                          font: "sans",
                          color,
                        });
                      }}
                    >
                      <option value="" disabled>
                        Select original text
                      </option>
                      {textItems.map((item, index) => (
                        <option key={index} value={index}>
                          {item.str.slice(0, 70)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="quick-start">
                  <h3>A good place to start</h3>
                  <button type="button" onClick={() => chooseTool("text")}>
                    <Type size={17} />
                    <span>Add a note</span>
                    <kbd>T</kbd>
                  </button>
                  <button type="button" onClick={() => setSignatureOpen(true)}>
                    <Signature size={17} />
                    <span>Add your signature</span>
                    <kbd>S</kbd>
                  </button>
                  <button type="button" onClick={() => chooseTool("highlight")}>
                    <Highlighter size={17} />
                    <span>Mark what matters</span>
                    <kbd>H</kbd>
                  </button>
                </div>
              </>
            )}

            {pageNeedsFlattening(activePage ?? { annotations: [] }) ||
            ["redact", "edit"].includes(tool) ? (
              <div className="explanation">
                <ShieldCheck size={17} />
                <p>
                  {tool === "redact" ||
                  activePage?.annotations.some((item) => item.type === "redact")
                    ? "Redacted pages become images in the download, removing original text and hidden content from those pages."
                    : "Editing original text uses standard fonts and a white background. Affected pages are flattened; other original text on them becomes an image."}
                </p>
              </div>
            ) : (
              <div className="explanation">
                <LockKeyhole size={17} />
                <p>Your files stay in this tab. No uploads, accounts, or watermarks.</p>
              </div>
            )}

            <div className="page-actions">
              <h3>Page {activeIndex + 1 || 1}</h3>
              <div className="page-action-row">
                <button
                  type="button"
                  disabled={!activePage || !!busy}
                  onClick={() =>
                    updateActive((page) => ({ ...page, rotation: (page.rotation + 90) % 360 }))
                  }
                >
                  <RotateCw size={17} />
                  Rotate
                </button>
                <button
                  type="button"
                  disabled={!activePage || pages.length >= MAX_PAGES || !!busy}
                  onClick={duplicatePage}
                >
                  <Copy size={17} />
                  Duplicate
                </button>
              </div>
              <div className="page-action-row">
                <button
                  type="button"
                  disabled={activeIndex <= 0 || !!busy}
                  onClick={() => movePage(-1)}
                >
                  <ArrowUp size={17} />
                  Move up
                </button>
                <button
                  type="button"
                  disabled={activeIndex >= pages.length - 1 || !!busy}
                  onClick={() => movePage(1)}
                >
                  <ArrowDown size={17} />
                  Move down
                </button>
              </div>
              <button
                type="button"
                className="delete-page"
                disabled={pages.length <= 1 || !!busy}
                onClick={deletePage}
              >
                <Trash2 size={16} />
                Delete page
              </button>
            </div>
          </div>
          <div className="inspector-footer">
            <span>Made for getting things done.</span>
            <span>PDF Workspace</span>
          </div>
        </aside>
      </main>

      <footer className="app-footer">
        <span>
          <LockKeyhole size={13} />
          Private by design. Processed in your browser.
        </span>
        <span>Open. Edit. Make it yours.</span>
      </footer>
      <input
        ref={openInput}
        className="visually-hidden"
        type="file"
        accept="application/pdf,.pdf"
        aria-label="Open PDF file"
        onChange={(event) => {
          importFiles(Array.from(event.target.files));
          event.target.value = "";
        }}
      />
      <input
        ref={mergeInput}
        className="visually-hidden"
        type="file"
        accept="application/pdf,.pdf"
        multiple
        aria-label="Add PDF files"
        onChange={(event) => {
          importFiles(Array.from(event.target.files), true);
          event.target.value = "";
        }}
      />
      <input
        ref={imageInput}
        className="visually-hidden"
        type="file"
        accept="image/png,image/jpeg"
        aria-label="Choose image"
        onChange={(event) => {
          chooseImage(event.target.files[0]);
          event.target.value = "";
        }}
      />
      {dragOver && (
        <div className="drop-overlay">
          <Upload size={40} />
          <h2>Drop your PDF here.</h2>
          <p>Up to 50 MB. Your document stays on your device.</p>
        </div>
      )}
      {busy && pages.length > 0 && (
        <div className="busy-indicator" role="status">
          <span className="busy-spinner" />
          {busy}
        </div>
      )}
      {signatureOpen && (
        <SignatureDialog
          onClose={() => setSignatureOpen(false)}
          onApply={(image) => {
            setPendingImage(image);
            setTool("signature");
            setSelectedId(null);
            setSignatureOpen(false);
            setError("");
          }}
        />
      )}
      {helpOpen && (
        <dialog
          ref={helpDialog}
          className="help-dialog"
          aria-labelledby="help-title"
          onCancel={() => setHelpOpen(false)}
          onClick={(event) => {
            if (event.target === event.currentTarget) setHelpOpen(false);
          }}
        >
          <div className="dialog-head">
            <h2 id="help-title">A few handy shortcuts.</h2>
            <IconButton label="Close help" onClick={() => setHelpOpen(false)}>
              <X size={19} />
            </IconButton>
          </div>
          <dl className="shortcut-list">
            {tools.map((item) => (
              <div key={item.id}>
                <dt>{item.label}</dt>
                <dd>
                  <kbd>{item.key}</kbd>
                </dd>
              </div>
            ))}
            <div>
              <dt>Undo / Redo</dt>
              <dd>⌘/Ctrl Z / Shift Z</dd>
            </div>
            <div>
              <dt>Download</dt>
              <dd>⌘/Ctrl S</dd>
            </div>
            <div>
              <dt>Remove selection</dt>
              <dd>Delete</dd>
            </div>
          </dl>
          <p className="helper">
            Documents stay in memory until you close or refresh this tab. Download your work before
            leaving. Password-protected PDFs and OCR are not supported.
          </p>
        </dialog>
      )}
    </div>
  );
}
