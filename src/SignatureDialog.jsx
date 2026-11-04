import React, { useEffect, useRef, useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";

export function SignatureDialog({ onClose, onApply }) {
  const dialogRef = useRef(null);
  const activePath = useRef(null);
  const [paths, setPaths] = useState([]);
  const [mode, setMode] = useState("draw");
  const [name, setName] = useState("");
  useEffect(() => {
    dialogRef.current.showModal();
  }, []);

  function position(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    return [
      ((event.clientX - rect.left) * 600) / rect.width,
      ((event.clientY - rect.top) * 200) / rect.height,
    ];
  }

  function apply() {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 400;
    const context = canvas.getContext("2d");
    context.scale(2, 2);
    context.strokeStyle = "#253248";
    context.fillStyle = "#253248";
    context.lineWidth = 2;
    context.lineCap = "round";
    context.lineJoin = "round";
    if (mode === "type") {
      context.font = `italic 48px ${getComputedStyle(dialogRef.current).getPropertyValue("--font-document-serif")}`;
      const measured = context.measureText(name).width;
      const factor = Math.min(1, 550 / measured);
      context.scale(factor, factor);
      context.fillText(name, 24 / factor, 120 / factor);
    } else {
      for (const path of paths) {
        context.beginPath();
        path.forEach(([x, y], index) => (index ? context.lineTo(x, y) : context.moveTo(x, y)));
        context.stroke();
      }
    }
    onApply({ dataUrl: canvas.toDataURL("image/png"), ratio: 3 });
  }

  return (
    <dialog
      ref={dialogRef}
      className="signature-dialog"
      aria-labelledby="signature-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog-head">
        <div>
          <h2 id="signature-title">Make your mark.</h2>
          <p>Then click anywhere on your document to place it.</p>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close signature"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <div className="segmented" role="group" aria-label="Signature style">
        <button type="button" aria-pressed={mode === "draw"} onClick={() => setMode("draw")}>
          Draw signature
        </button>
        <button type="button" aria-pressed={mode === "type"} onClick={() => setMode("type")}>
          Type signature
        </button>
      </div>
      {mode === "draw" ? (
        <svg
          className="signature-pad"
          viewBox="0 0 600 200"
          role="img"
          aria-label="Draw your signature here"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            activePath.current = [position(event)];
            setPaths((current) => [...current, activePath.current]);
          }}
          onPointerMove={(event) => {
            if (!activePath.current) return;
            activePath.current.push(position(event));
            setPaths((current) => [...current.slice(0, -1), [...activePath.current]]);
          }}
          onPointerUp={() => {
            activePath.current = null;
          }}
          onPointerCancel={() => {
            activePath.current = null;
          }}
        >
          <path className="signature-baseline" d="M 28 155 L 572 155" />
          {paths.map((path, index) => (
            <polyline
              key={index}
              points={path.map((point) => point.join(",")).join(" ")}
              className="signature-stroke"
            />
          ))}
        </svg>
      ) : (
        <div className="typed-signature">
          <label htmlFor="signature-name">Your name</label>
          <input
            id="signature-name"
            value={name}
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
          />
          <p className="signature-type-preview">{name || "Your signature"}</p>
        </div>
      )}
      <p className="helper">
        This adds a visual signature, not a certificate-based digital signature.
      </p>
      <div className="dialog-actions">
        <button
          type="button"
          className="button button-quiet"
          onClick={() => {
            setPaths([]);
            setName("");
          }}
        >
          <RotateCcw size={16} />
          Clear
        </button>
        <button
          type="button"
          className="button button-primary"
          disabled={mode === "draw" ? !paths.some((path) => path.length > 1) : !name.trim()}
          onClick={apply}
        >
          <Check size={16} />
          Use signature
        </button>
      </div>
    </dialog>
  );
}
