import assert from "node:assert/strict";
import test from "node:test";
import {
  annotationBounds,
  canEditOriginalText,
  createHistory,
  downloadName,
  duplicateAnnotation,
  historyReducer,
  moveAnnotation,
  rectangleBetween,
  validateFileSelection,
} from "../src/model.js";

test("page and annotation edits undo atomically, redo, and discard obsolete redo branches", () => {
  const original = { pages: [{ id: "one", annotations: [] }] };
  const change = { pages: [{ id: "one", annotations: [{ id: "note", text: "Review" }] }] };
  let state = historyReducer(createHistory(original), { type: "commit", value: change });
  state = historyReducer(state, { type: "undo" });
  assert.deepEqual(state.present, original);
  state = historyReducer(state, { type: "redo" });
  assert.deepEqual(state.present, change);
  state = historyReducer(state, { type: "undo" });
  state = historyReducer(state, {
    type: "commit",
    value: { pages: [{ id: "two", annotations: [] }] },
  });
  assert.equal(state.future.length, 0);
  assert.deepEqual(original.pages[0].annotations, []);
});

test("deleting the last page is rejected and undo memory is bounded", () => {
  let state = createHistory({ pages: [{ id: "one" }] });
  assert.equal(historyReducer(state, { type: "commit", value: { pages: [] } }), state);
  for (let index = 0; index < 60; index += 1)
    state = historyReducer(state, { type: "commit", value: { pages: [{ id: String(index) }] } });
  assert.equal(state.past.length, 50);
});

test("dragging works in every rectangle direction and preserves immutable stroke data", () => {
  assert.deepEqual(rectangleBetween([60, 20], [10, 80]), { x: 10, y: 20, width: 50, height: 60 });
  const stroke = {
    type: "draw",
    points: [
      [10, 20],
      [30, 40],
    ],
  };
  assert.deepEqual(moveAnnotation(stroke, 5, -2).points, [
    [15, 18],
    [35, 38],
  ]);
  assert.deepEqual(stroke.points, [
    [10, 20],
    [30, 40],
  ]);
  assert.deepEqual(annotationBounds(stroke), { x: 7, y: 17, width: 26, height: 26 });
});

test("download names cannot contain paths or control characters", () => {
  assert.equal(downloadName("../../agreement.pdf"), "agreement-edited.pdf");
  assert.equal(downloadName("\u0000.pdf"), "document-edited.pdf");
});

test("duplicating edited original text creates an independent movable text box", () => {
  const original = {
    id: "old",
    type: "replace",
    x: 40,
    y: 100,
    originalX: 40,
    originalY: 100,
    text: "New text",
  };
  const copy = duplicateAnnotation(original);
  assert.equal(copy.type, "text");
  assert.equal(copy.x, 52);
  assert.equal(copy.y, 88);
  assert.equal(original.type, "replace");
});

test("only supported horizontal PDF text is offered for replacement", () => {
  const item = { str: "Editable", width: 60, transform: [12, 0, 0, 12, 30, 90] };
  assert.equal(canEditOriginalText(item), true);
  assert.equal(canEditOriginalText({ ...item, transform: [0, 12, -12, 0, 30, 90] }), false);
  assert.equal(canEditOriginalText({ ...item, transform: [-12, 0, 0, -12, 30, 90] }), false);
  assert.equal(canEditOriginalText({ ...item, transform: [12, 0, 2, 12, 30, 90] }), false);
});

test("imports enforce a combined memory budget before reading or replacing the current document", () => {
  const mb = 1024 * 1024;
  const file = (size) => ({ name: "document.pdf", type: "application/pdf", size: size * mb });
  assert.doesNotThrow(() => validateFileSelection([file(50), file(50)], 0));
  assert.throws(() => validateFileSelection([file(40), file(40), file(40)], 0), /100 MB/);
  assert.throws(() => validateFileSelection([file(30)], 80 * mb), /100 MB/);
  assert.throws(
    () => validateFileSelection([{ name: "image.png", type: "image/png", size: 1 }], 0),
    /PDF files/,
  );
});
