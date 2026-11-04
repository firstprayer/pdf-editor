import React, { useEffect, useRef, useState } from "react";
import { annotationBounds, canEditOriginalText, rectangleBetween } from "./model.js";

const documentFonts = {
  sans: "var(--font-document-sans)",
  bold: "var(--font-document-sans)",
  serif: "var(--font-document-serif)",
  mono: "var(--font-document-mono)",
};

function Annotation({ annotation, onPointerDown }) {
  const { x, y, color, width, height } = annotation;
  const common = { onPointerDown, "data-annotation": annotation.id };
  if (["text", "replace"].includes(annotation.type)) {
    return (
      <g {...common}>
        <text
          transform={`translate(${x} ${y}) scale(1 -1)`}
          fill={color}
          fontSize={annotation.size}
          fontFamily={documentFonts[annotation.font]}
          fontWeight={annotation.font === "bold" ? 700 : 400}
        >
          {annotation.text.split("\n").map((line, index) => (
            <tspan key={index} x="0" dy={index === 0 ? 0 : annotation.size * 1.3}>
              {line || " "}
            </tspan>
          ))}
        </text>
      </g>
    );
  }
  if (annotation.type === "draw") {
    return (
      <polyline
        {...common}
        points={annotation.points.map((point) => point.join(",")).join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={annotation.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }
  if (["signature", "image"].includes(annotation.type)) {
    return (
      <image
        {...common}
        href={annotation.dataUrl}
        x={x}
        y={-y - height}
        width={width}
        height={height}
        transform="scale(1 -1)"
      />
    );
  }
  return (
    <rect
      {...common}
      x={x}
      y={y}
      width={width}
      height={height}
      fill={color}
      opacity={annotation.type === "highlight" ? 0.3 : 1}
    />
  );
}

export function DocumentPage({
  descriptor,
  source,
  availableWidth,
  zoom,
  tool,
  selectedId,
  color,
  size,
  strokeWidth,
  pendingImage,
  onSelect,
  onCreate,
  onMove,
  onError,
  onReady,
  onTextItems,
}) {
  const canvasRef = useRef(null);
  const svgRef = useRef(null);
  const gesture = useRef(null);
  const [pageData, setPageData] = useState(null);
  const [draft, setDraft] = useState(null);
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let renderTask;
    setRendering(true);
    const run = async () => {
      const page = await source.pdf.getPage(descriptor.index + 1);
      if (cancelled) return;
      const natural = page.getViewport({
        scale: 1,
        rotation: (page.rotate + descriptor.rotation) % 360,
      });
      const scale = (Math.max(1, availableWidth - 64) / natural.width) * zoom;
      const viewport = page.getViewport({
        scale,
        rotation: (page.rotate + descriptor.rotation) % 360,
      });
      const canvas = canvasRef.current;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.ceil(viewport.width * ratio);
      canvas.height = Math.ceil(viewport.height * ratio);
      const context = canvas.getContext("2d");
      renderTask = page.render({
        canvasContext: context,
        viewport,
        transform: [ratio, 0, 0, ratio, 0, 0],
      });
      await renderTask.promise;
      if (cancelled) return;
      const text = await page.getTextContent();
      if (cancelled) return;
      const editable = text.items.filter(canEditOriginalText);
      setPageData({ viewport, text: editable });
      onTextItems?.(editable);
      setRendering(false);
      onReady?.();
    };
    run().catch((error) => {
      if (!cancelled && error.name !== "RenderingCancelledException") {
        setRendering(false);
        onError("This page could not be displayed. Try another PDF.");
      }
    });
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [
    source,
    descriptor.id,
    descriptor.index,
    descriptor.rotation,
    availableWidth,
    zoom,
    onError,
    onReady,
    onTextItems,
  ]);

  function point(event) {
    const rect = svgRef.current.getBoundingClientRect();
    const viewport = pageData.viewport;
    return viewport.convertToPdfPoint(
      ((event.clientX - rect.left) / rect.width) * viewport.width,
      ((event.clientY - rect.top) / rect.height) * viewport.height,
    );
  }

  function start(event) {
    if (!pageData || rendering || event.button !== 0) return;
    const startPoint = point(event);
    const targetId = event.target.closest("[data-annotation]")?.getAttribute("data-annotation");
    if (tool === "select") {
      onSelect(targetId ?? null);
      if (targetId) {
        gesture.current = { type: "move", id: targetId, start: startPoint, end: startPoint };
        svgRef.current.setPointerCapture(event.pointerId);
      }
      return;
    }
    if (tool === "text") {
      onCreate({
        type: "text",
        x: startPoint[0],
        y: startPoint[1],
        text: "Your text",
        size,
        font: "sans",
        color,
      });
      return;
    }
    if (tool === "edit") {
      const item = [...pageData.text].reverse().find((candidate) => {
        const fontSize = Math.hypot(candidate.transform[2], candidate.transform[3]);
        return (
          Math.abs(candidate.transform[1]) < 0.1 &&
          startPoint[0] >= candidate.transform[4] - 2 &&
          startPoint[0] <= candidate.transform[4] + candidate.width + 2 &&
          startPoint[1] >= candidate.transform[5] - fontSize * 0.35 &&
          startPoint[1] <= candidate.transform[5] + fontSize
        );
      });
      if (!item)
        return onError("Click a line of selectable PDF text. For scanned pages, use Add text.");
      const fontSize = Math.hypot(item.transform[2], item.transform[3]);
      onCreate({
        type: "replace",
        x: item.transform[4],
        y: item.transform[5],
        originalX: item.transform[4],
        originalY: item.transform[5],
        originalSize: fontSize,
        originalWidth: item.width,
        text: item.str,
        size: Math.max(6, Math.round(fontSize)),
        font: "sans",
        color,
      });
      return;
    }
    if (["image", "signature"].includes(tool)) {
      if (!pendingImage) return onError("Create a signature or choose an image first.");
      const width = Math.min(180, descriptor.width * 0.4);
      onCreate({
        type: tool,
        x: startPoint[0],
        y: startPoint[1] - width / pendingImage.ratio,
        width,
        height: width / pendingImage.ratio,
        dataUrl: pendingImage.dataUrl,
        color,
      });
      return;
    }
    gesture.current = { type: tool, start: startPoint, points: [startPoint], end: startPoint };
    svgRef.current.setPointerCapture(event.pointerId);
    setDraft(null);
  }

  function move(event) {
    if (!gesture.current || !pageData) return;
    const next = point(event);
    const current = gesture.current;
    current.end = next;
    if (current.type === "move") {
      const original = descriptor.annotations.find((annotation) => annotation.id === current.id);
      if (original)
        setDraft({
          ...original,
          dragOffset: [next[0] - current.start[0], next[1] - current.start[1]],
        });
    } else if (current.type === "draw") {
      if (current.points.length < 10000) current.points.push(next);
      setDraft({ type: "draw", points: [...current.points], color, strokeWidth });
    } else {
      setDraft({
        type: current.type,
        ...rectangleBetween(current.start, next),
        color: current.type === "redact" ? "#17202d" : "#f4ce5d",
      });
    }
  }

  function end() {
    const current = gesture.current;
    if (!current) return;
    gesture.current = null;
    if (current.type === "move") {
      const dx = current.end[0] - current.start[0];
      const dy = current.end[1] - current.start[1];
      if (Math.abs(dx) + Math.abs(dy) > 0.5) onMove(current.id, dx, dy);
    } else if (current.type === "draw" && current.points.length > 1) {
      onCreate({ type: "draw", points: current.points, color, strokeWidth }, false);
    } else {
      const rect = rectangleBetween(current.start, current.end);
      if (rect.width > 2 && rect.height > 2)
        onCreate(
          { type: current.type, ...rect, color: current.type === "redact" ? "#17202d" : "#f4ce5d" },
          false,
        );
    }
    setDraft(null);
  }

  const selected = descriptor.annotations.find((annotation) => annotation.id === selectedId);
  const originalBounds = selected && annotationBounds(selected);
  const bounds = originalBounds && {
    ...originalBounds,
    x: originalBounds.x + (draft?.dragOffset?.[0] ?? 0),
    y: originalBounds.y + (draft?.dragOffset?.[1] ?? 0),
  };
  const viewport = pageData?.viewport;
  const annotations = [
    ...descriptor.annotations.filter((annotation) => annotation.type !== "redact"),
    ...descriptor.annotations.filter((annotation) => annotation.type === "redact"),
  ];
  return (
    <div
      className={`document-paper ${rendering ? "is-rendering" : ""}`}
      style={{
        width: viewport?.width ?? Math.min(availableWidth - 64, 595),
        aspectRatio: viewport
          ? `${viewport.width} / ${viewport.height}`
          : `${descriptor.width} / ${descriptor.height}`,
      }}
    >
      <canvas ref={canvasRef} aria-label="PDF page preview" />
      {rendering && (
        <div className="page-loading" role="status">
          Rendering page…
        </div>
      )}
      {viewport && !rendering && (
        <svg
          ref={svgRef}
          viewBox={`0 0 ${viewport.width} ${viewport.height}`}
          className={`annotation-layer tool-${tool}`}
          aria-label="Document editing surface. Press Enter to place the active tool in the center."
          role="img"
          tabIndex={0}
          onKeyDown={(event) => {
            const arrow = {
              ArrowLeft: [-1, 0],
              ArrowRight: [1, 0],
              ArrowUp: [0, -1],
              ArrowDown: [0, 1],
            }[event.key];
            if (arrow && selectedId) {
              event.preventDefault();
              const distance = event.shiftKey ? 10 : 1;
              const origin = viewport.convertToPdfPoint(0, 0);
              const target = viewport.convertToPdfPoint(
                arrow[0] * distance * viewport.scale,
                arrow[1] * distance * viewport.scale,
              );
              onMove(selectedId, target[0] - origin[0], target[1] - origin[1]);
              return;
            }
            if (event.key !== "Enter") return;
            event.preventDefault();
            const center = viewport.convertToPdfPoint(viewport.width / 2, viewport.height / 2);
            if (tool === "text")
              onCreate({
                type: "text",
                x: center[0],
                y: center[1],
                text: "Your text",
                size,
                font: "sans",
                color,
              });
            else if (["image", "signature"].includes(tool) && pendingImage)
              onCreate({
                type: tool,
                x: center[0] - 80,
                y: center[1] - 80 / pendingImage.ratio,
                width: 160,
                height: 160 / pendingImage.ratio,
                dataUrl: pendingImage.dataUrl,
                color,
              });
            else if (["highlight", "redact"].includes(tool))
              onCreate({
                type: tool,
                x: center[0] - 60,
                y: center[1],
                width: 120,
                height: 18,
                color: tool === "redact" ? "#17202d" : "#f4ce5d",
              });
          }}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={() => {
            gesture.current = null;
            setDraft(null);
          }}
        >
          <g transform={`matrix(${viewport.transform.join(" ")})`}>
            {descriptor.annotations
              .filter((item) => item.type === "replace")
              .map((item) => (
                <rect
                  key={`mask-${item.id}`}
                  className="replacement-mask"
                  x={item.originalX}
                  y={item.originalY - item.originalSize * 0.3}
                  width={item.originalWidth + 1}
                  height={item.originalSize * 1.4}
                  pointerEvents="none"
                />
              ))}
            {annotations.map((annotation) => {
              const offset = draft?.id === annotation.id ? draft.dragOffset : null;
              return (
                <g
                  key={annotation.id}
                  transform={offset ? `translate(${offset.join(" ")})` : undefined}
                >
                  <Annotation annotation={annotation} />
                </g>
              );
            })}
            {draft && !draft.dragOffset && <Annotation annotation={draft} />}
            {bounds && (
              <rect
                className="selection-box"
                x={bounds.x - 3}
                y={bounds.y - 3}
                width={bounds.width + 6}
                height={bounds.height + 6}
                strokeWidth={1.3 / viewport.scale}
                strokeDasharray={`${4 / viewport.scale} ${3 / viewport.scale}`}
                pointerEvents="none"
              />
            )}
          </g>
        </svg>
      )}
    </div>
  );
}

export function Thumbnail({ source, descriptor, number, selected, onSelect }) {
  const canvasRef = useRef(null);
  const buttonRef = useRef(null);
  useEffect(() => {
    let cancelled = false;
    let task;
    const render = async () => {
      const page = await source.pdf.getPage(descriptor.index + 1);
      if (cancelled) return;
      const natural = page.getViewport({
        scale: 1,
        rotation: (page.rotate + descriptor.rotation) % 360,
      });
      const viewport = page.getViewport({ scale: 112 / natural.width, rotation: natural.rotation });
      const canvas = canvasRef.current;
      canvas.width = viewport.width * 2;
      canvas.height = viewport.height * 2;
      task = page.render({
        canvasContext: canvas.getContext("2d"),
        viewport,
        transform: [2, 0, 0, 2, 0, 0],
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
      { rootMargin: "150px" },
    );
    observer.observe(buttonRef.current);
    return () => {
      cancelled = true;
      observer.disconnect();
      task?.cancel();
    };
  }, [source, descriptor.id, descriptor.index, descriptor.rotation]);
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`page-thumbnail ${selected ? "is-active" : ""}`}
      onClick={onSelect}
      aria-label={`Go to page ${number}`}
      aria-current={selected ? "page" : undefined}
    >
      <span className="thumbnail-paper">
        <canvas ref={canvasRef} aria-hidden="true" />
        {descriptor.annotations.length > 0 && (
          <span className="thumbnail-edit" aria-label="Contains edits" />
        )}
      </span>
      <span>Page {number}</span>
    </button>
  );
}
