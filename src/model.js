export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_WORKSPACE_BYTES = 100 * 1024 * 1024;
export const MAX_PAGES = 200;
export const DOCUMENT_COLORS = [
  { name: "Ink", value: "#253248" },
  { name: "Blue", value: "#24549a" },
  { name: "Red", value: "#b54836" },
  { name: "Green", value: "#34715b" },
];

export function validateFileSelection(files, existingBytes) {
  if (
    files.some(
      (file) =>
        (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") ||
        file.size > MAX_FILE_BYTES,
    )
  ) {
    throw new Error("Choose PDF files smaller than 50 MB each.");
  }
  if (existingBytes + files.reduce((total, file) => total + file.size, 0) > MAX_WORKSPACE_BYTES) {
    throw new Error("Keep imported PDFs within 100 MB combined, or start a new workspace.");
  }
}

export function createHistory(present = { pages: [] }) {
  return { past: [], present, future: [] };
}

export function historyReducer(state, action) {
  if (action.type === "reset") return createHistory(action.value);
  if (action.type === "commit") {
    if (!action.value.pages.length) return state;
    return {
      past: [...state.past.slice(-49), state.present],
      present: action.value,
      future: [],
    };
  }
  if (action.type === "undo" && state.past.length) {
    return {
      past: state.past.slice(0, -1),
      present: state.past.at(-1),
      future: [state.present, ...state.future],
    };
  }
  if (action.type === "redo" && state.future.length) {
    return {
      past: [...state.past, state.present],
      present: state.future[0],
      future: state.future.slice(1),
    };
  }
  return state;
}

export function rectangleBetween(start, end) {
  return {
    x: Math.min(start[0], end[0]),
    y: Math.min(start[1], end[1]),
    width: Math.abs(end[0] - start[0]),
    height: Math.abs(end[1] - start[1]),
  };
}

export function annotationBounds(annotation) {
  if (annotation.type === "draw") {
    const xs = annotation.points.map((point) => point[0]);
    const ys = annotation.points.map((point) => point[1]);
    return {
      x: Math.min(...xs) - 3,
      y: Math.min(...ys) - 3,
      width: Math.max(...xs) - Math.min(...xs) + 6,
      height: Math.max(...ys) - Math.min(...ys) + 6,
    };
  }
  if (["text", "replace"].includes(annotation.type)) {
    const lines = annotation.text.split("\n");
    return {
      x: annotation.x,
      y: annotation.y - (lines.length - 1) * annotation.size * 1.3 - annotation.size * 0.25,
      width: Math.max(
        annotation.size * 2,
        ...lines.map((line) => line.length * annotation.size * 0.62),
      ),
      height: lines.length * annotation.size * 1.3,
    };
  }
  return annotation;
}

export function moveAnnotation(annotation, dx, dy) {
  if (annotation.type === "draw") {
    return { ...annotation, points: annotation.points.map(([x, y]) => [x + dx, y + dy]) };
  }
  return { ...annotation, x: annotation.x + dx, y: annotation.y + dy };
}

export function downloadName(name) {
  const clean = Array.from(name)
    .filter((character) => character.codePointAt(0) >= 32 && !'<>:"/\\|?*'.includes(character))
    .join("")
    .replace(/\.pdf$/i, "")
    .replace(/^\.+/, "")
    .trim();
  return `${clean || "document"}-edited.pdf`;
}

export function duplicateAnnotation(annotation) {
  return {
    ...moveAnnotation(annotation, 12, -12),
    type: annotation.type === "replace" ? "text" : annotation.type,
  };
}

export function canEditOriginalText(item) {
  return (
    typeof item.str === "string" &&
    item.str.trim().length > 0 &&
    item.width > 0 &&
    item.transform?.length === 6 &&
    item.transform.every(Number.isFinite) &&
    item.transform[0] > 0 &&
    item.transform[3] > 0 &&
    Math.abs(item.transform[1]) < 0.0001 &&
    Math.abs(item.transform[2]) < 0.0001
  );
}

export function pageNeedsFlattening(page) {
  return page.annotations.some((annotation) => ["redact", "replace"].includes(annotation.type));
}
