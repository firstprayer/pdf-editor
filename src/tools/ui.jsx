// Shared shell for the single-purpose tool pages. Mirrors the editor's
// structure (command bar, light table, options panel) so the suite reads as
// one product.
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  FolderOpen,
  Upload,
  X,
} from "lucide-react";
import "../styles.css";
import { initAnalytics } from "../analytics.js";

export function mountTool(Component) {
  initAnalytics();
  createRoot(document.getElementById("root")).render(<Component />);
  // On narrow screens the tool list scrolls; bring the current tool into view.
  const current = document.querySelector('.site-nav a[aria-current="page"]');
  const list = current?.closest("ul");
  if (list && list.scrollWidth > list.clientWidth) {
    list.scrollLeft = current.offsetLeft - (list.clientWidth - current.offsetWidth) / 2;
  }
}

export function IconButton({ label, children, className = "", ...props }) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
}

export function ToolShell({
  name,
  meta,
  accept = "application/pdf,.pdf",
  multiple = false,
  onFiles,
  addLabel,
  primary,
  secondary,
  busy,
  message,
  onDismiss,
  empty,
  emptyState,
  inspector,
  inspectorTitle = "Options",
  unsaved = false,
  children,
}) {
  const input = useRef(null);
  const dragDepth = useRef(0);
  const [dragOver, setDragOver] = useState(false);
  const pick = () => input.current?.click();
  // Single-file tools replace the open document; ask before losing work.
  const receive = (files) => {
    if (
      unsaved &&
      !multiple &&
      !window.confirm("Open a new PDF? Changes you have not downloaded will be lost.")
    ) {
      return;
    }
    onFiles(files);
  };
  useEffect(() => {
    if (!unsaved) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);
  const AddIcon = multiple ? FilePlus2 : FolderOpen;

  return (
    <div
      className="app-shell tool-shell"
      onDragEnter={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        dragDepth.current += 1;
        setDragOver(true);
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDragLeave={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) setDragOver(false);
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        dragDepth.current = 0;
        setDragOver(false);
        if (!busy) receive(Array.from(event.dataTransfer.files));
      }}
    >
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length) receive(files);
        }}
      />
      <div className="command-bar">
        <div className="command-title">
          <span className="command-name">{name}</span>
          {meta && <span className="command-meta">{meta}</span>}
        </div>
        <div className="command-actions">
          {secondary}
          {!empty && addLabel && (
            <button
              type="button"
              className="button button-quiet"
              title={addLabel}
              disabled={!!busy}
              onClick={pick}
            >
              <AddIcon size={17} />
              <span>{addLabel}</span>
            </button>
          )}
          {primary && !empty && (
            <button
              type="button"
              className="button button-primary"
              disabled={!!busy || primary.disabled}
              onClick={primary.onClick}
            >
              {primary.icon}
              <span>{primary.label}</span>
            </button>
          )}
        </div>
      </div>

      {message?.text && (
        <div
          className={`message-bar ${message.error ? "is-error" : ""}`}
          role={message.error ? "alert" : "status"}
        >
          <span>{message.text}</span>
          <IconButton label="Dismiss message" onClick={onDismiss}>
            <X size={16} />
          </IconButton>
        </div>
      )}

      <main className={`tool-workspace ${empty ? "is-empty" : ""}`} aria-label={name}>
        <div className="tool-stage">
          {empty ? <DropZone {...emptyState} onPick={pick} busy={busy} /> : children}
        </div>
        {!empty && inspector && (
          <aside className="inspector" aria-labelledby="inspector-title">
            <div className="panel-heading">
              <h2 id="inspector-title">{inspectorTitle}</h2>
            </div>
            <div className="inspector-body">{inspector}</div>
          </aside>
        )}
      </main>

      {busy && (
        <div className="busy-indicator" role="status">
          <span className="busy-spinner" aria-hidden="true" />
          {busy}
        </div>
      )}
      {dragOver && (
        <div className="drop-overlay" aria-hidden="true">
          <Upload size={28} />
          <strong>Drop to add {multiple ? "files" : "the file"}</strong>
        </div>
      )}
    </div>
  );
}

function DropZone({ title, body, pickLabel, onPick, busy }) {
  return (
    <div className="drop-zone">
      <div className="drop-sheet" aria-hidden="true">
        <Upload size={26} strokeWidth={1.6} />
      </div>
      <h2>{title}</h2>
      <p>{body}</p>
      <div className="drop-actions">
        <button type="button" className="button button-primary" disabled={!!busy} onClick={onPick}>
          <FilePlus2 size={17} />
          <span>{pickLabel}</span>
        </button>
      </div>
    </div>
  );
}

/** Renders one PDF page (zero-based index) into a canvas when it scrolls into view. */
export function PageCanvas({ pdf, index, rotation = 0, width = 132, onSize }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    let cancelled = false;
    let task;
    const canvas = canvasRef.current;
    const render = async () => {
      const page = await pdf.getPage(index + 1);
      if (cancelled) return;
      const natural = page.getViewport({ scale: 1, rotation: (page.rotate + rotation) % 360 });
      const viewport = page.getViewport({
        scale: width / natural.width,
        rotation: natural.rotation,
      });
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(viewport.width * ratio);
      canvas.height = Math.round(viewport.height * ratio);
      onSize?.({ width: natural.width, height: natural.height });
      task = page.render({
        canvasContext: canvas.getContext("2d"),
        viewport,
        transform: [ratio, 0, 0, ratio, 0, 0],
      });
      await task.promise;
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          observer.disconnect();
          render().catch(() => {});
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(canvas);
    return () => {
      cancelled = true;
      observer.disconnect();
      task?.cancel();
    };
  }, [pdf, index, rotation, width, onSize]);
  return <canvas ref={canvasRef} aria-hidden="true" />;
}

/** Drag-to-reorder for a list, plus explicit move buttons for keyboard and touch. */
export function useReorder(items, setItems) {
  const [dragging, setDragging] = useState(null);
  const [over, setOver] = useState(null);
  const move = (from, to) => {
    if (to < 0 || to >= items.length || from === to) return;
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setItems(next);
  };
  const itemProps = (index) => ({
    draggable: true,
    onDragStart: (event) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(index));
      setDragging(index);
    },
    onDragOver: (event) => {
      if (dragging === null) return;
      event.preventDefault();
      setOver(index);
    },
    onDrop: (event) => {
      if (dragging === null) return;
      event.preventDefault();
      move(dragging, index);
      setDragging(null);
      setOver(null);
    },
    onDragEnd: () => {
      setDragging(null);
      setOver(null);
    },
    "data-dragging": dragging === index || undefined,
    "data-drop-target":
      over === index && dragging !== index ? (dragging < index ? "after" : "before") : undefined,
  });
  return { itemProps, move };
}

export function MoveButtons({ index, count, move, label }) {
  return (
    <>
      <IconButton
        label={`Move ${label} earlier`}
        disabled={index === 0}
        onClick={() => move(index, index - 1)}
      >
        <ArrowLeft size={16} />
      </IconButton>
      <IconButton
        label={`Move ${label} later`}
        disabled={index === count - 1}
        onClick={() => move(index, index + 1)}
      >
        <ArrowRight size={16} />
      </IconButton>
    </>
  );
}

export function Segmented({ label, value, options, onChange }) {
  return (
    <fieldset className="option-group">
      <legend>{label}</legend>
      <div className="segmented">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** Asks before discarding work that has not been downloaded. */
export function confirmDiscard(unsaved, question) {
  return !unsaved || window.confirm(question);
}

/** True once there is work that has changed since the last download. */
export function useUnsaved(hasWork, deps) {
  const [dirty, setDirty] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setDirty(hasWork), deps);
  return [dirty && hasWork, () => setDirty(false)];
}

export function useMessages() {
  const [message, setMessage] = useState(null);
  return {
    message,
    fail: (error) => setMessage({ text: error?.message ?? String(error), error: true }),
    note: (text) => setMessage({ text, error: false }),
    clear: () => setMessage(null),
  };
}

/** One page or file laid on the light table. */
export function Sheet({
  pdf,
  index = 0,
  rotation = 0,
  title,
  detail,
  selected,
  onToggle,
  toggleLabel,
  turn,
  tools,
  itemProps = {},
  children,
}) {
  const paper = children ?? <PageCanvas pdf={pdf} index={index} rotation={rotation} />;
  return (
    <li className={`sheet ${selected ? "is-selected" : ""}`} {...itemProps}>
      {onToggle ? (
        <button
          type="button"
          className="sheet-paper"
          aria-pressed={selected === undefined ? undefined : !!selected}
          aria-label={toggleLabel}
          onClick={onToggle}
        >
          {paper}
          {selected !== undefined && (
            <span className="sheet-check" aria-hidden="true">
              <Check size={14} strokeWidth={3} />
            </span>
          )}
          {turn ? <span className="sheet-turn">{turn}°</span> : null}
        </button>
      ) : (
        <div className="sheet-paper">
          {paper}
          {turn ? <span className="sheet-turn">{turn}°</span> : null}
        </div>
      )}
      <div className="sheet-label">
        <strong title={title}>{title}</strong>
        {detail && <span>{detail}</span>}
      </div>
      {tools && <div className="sheet-tools">{tools}</div>}
    </li>
  );
}

/** A single page shown large, with an overlay drawn in page points. */
export function PagePreview({ pdf, pageCount, page, setPage, overlay }) {
  const stage = useRef(null);
  const [room, setRoom] = useState({ width: 560, height: 800 });
  const [size, setSize] = useState(null);
  useEffect(() => {
    const scroller = stage.current.parentElement;
    const observer = new ResizeObserver(() =>
      setRoom({
        width: scroller.clientWidth - 48,
        // On phones the stage grows with the page instead of scrolling, so
        // fit to the window rather than to the stage itself.
        height:
          getComputedStyle(scroller).overflowY === "visible"
            ? window.innerHeight - 180
            : scroller.clientHeight - 112,
      }),
    );
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);
  // Fit the whole page in view so marks at the top and bottom edges are visible.
  const ratio = size ? size.width / size.height : 0.707;
  const width = Math.floor(Math.max(220, Math.min(560, room.width, room.height * ratio)));
  const scale = size ? width / size.width : 0;
  return (
    <div className="preview-stage" ref={stage}>
      <div className="preview-nav">
        <IconButton label="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)}>
          <ChevronLeft size={18} />
        </IconButton>
        <span>
          Page <b>{page + 1}</b> of {pageCount}
        </span>
        <IconButton
          label="Next page"
          disabled={page >= pageCount - 1}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight size={18} />
        </IconButton>
      </div>
      <div className="preview-paper" style={{ width }}>
        <PageCanvas pdf={pdf} index={page} width={width} onSize={setSize} />
        {size && <div className="preview-overlay">{overlay({ ...size, scale })}</div>}
      </div>
    </div>
  );
}

let measureContext;
/** Approximate width of Helvetica text in points, for previews. */
export function textWidth(text, size, bold = false) {
  measureContext ??= document.createElement("canvas").getContext("2d");
  measureContext.font = `${bold ? "bold " : ""}${size}px Helvetica, Arial, sans-serif`;
  return measureContext.measureText(text).width;
}
