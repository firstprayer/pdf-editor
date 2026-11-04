import React, { useEffect, useRef, useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { imagesToPdf, PAGE_SIZES } from "./ops.js";
import {
  baseName,
  downloadBytes,
  formatBytes,
  imageForPdf,
  isImageFile,
  MAX_IMAGE_BYTES,
  plural,
} from "./browser.js";
import {
  IconButton,
  mountTool,
  MoveButtons,
  Segmented,
  Sheet,
  ToolShell,
  useMessages,
  useReorder,
  useUnsaved,
  confirmDiscard,
} from "./ui.jsx";
import { track } from "../analytics.js";

let imageKey = 0;

function pageAspect(image, pageSize, orientation, margin) {
  const inset = { none: 0, small: 24, large: 56 }[margin];
  if (pageSize === "fit") return { ratio: image.width / image.height, inset: inset / 842 };
  let [width, height] = PAGE_SIZES[pageSize];
  const landscape =
    orientation === "landscape" || (orientation === "auto" && image.width > image.height);
  if (landscape) [width, height] = [height, width];
  return { ratio: width / height, inset: inset / Math.max(width, height) };
}

function ImagesToPdfTool() {
  const [images, setImages] = useState([]);
  const [pageSize, setPageSize] = useState("a4");
  const [orientation, setOrientation] = useState("auto");
  const [margin, setMargin] = useState("small");
  const [name, setName] = useState("images");
  const [busy, setBusy] = useState("");
  const { message, fail, note, clear } = useMessages();
  const { itemProps, move } = useReorder(images, setImages);
  const [unsaved, markSaved] = useUnsaved(images.length > 0, [images]);
  const urls = useRef(new Set());
  useEffect(() => {
    const created = urls.current;
    return () => created.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  async function add(inputs) {
    clear();
    const files = inputs.filter((file) => isImageFile(file));
    if (!files.length) return fail(new Error("Choose JPG, PNG or WebP images."));
    if (files.some((file) => file.size > MAX_IMAGE_BYTES)) {
      return fail(new Error("Choose images smaller than 30 MB each."));
    }
    if (images.length + files.length > 200) return fail(new Error("Add up to 200 images."));
    try {
      const prepared = [];
      for (const [position, file] of files.entries()) {
        setBusy(`Reading image ${position + 1} of ${files.length}…`);
        const image = await imageForPdf(file);
        const url = URL.createObjectURL(
          new Blob([image.bytes], { type: image.kind === "jpg" ? "image/jpeg" : "image/png" }),
        );
        urls.current.add(url);
        imageKey += 1;
        prepared.push({
          ...image,
          key: `i${imageKey}`,
          name: file.name,
          size: file.size,
          url,
        });
      }
      setImages([...images, ...prepared]);
      if (!images.length) setName(baseName(files[0].name));
      if (files.length < inputs.length)
        note("Some files were skipped because they are not images.");
    } catch (error) {
      fail(error);
    } finally {
      setBusy("");
    }
  }

  async function convert() {
    clear();
    setBusy("Creating PDF…");
    try {
      const output = await imagesToPdf(images, { pageSize, orientation, margin });
      downloadBytes(output, `${baseName(name) || "images"}.pdf`);
      markSaved();
      track("tool_run", { tool: "jpg-to-pdf", pages: images.length, method: pageSize });
      note(`Saved ${plural(images.length, "page")} (${formatBytes(output.length)}).`);
    } catch (error) {
      fail(error);
      track("tool_failed", { tool: "jpg-to-pdf" });
    } finally {
      setBusy("");
    }
  }

  return (
    <ToolShell
      name="JPG to PDF"
      meta={images.length ? plural(images.length, "image") : null}
      accept="image/*,.heic,.heif"
      multiple
      onFiles={add}
      addLabel="Add images"
      busy={busy}
      unsaved={unsaved}
      message={message}
      onDismiss={clear}
      empty={!images.length}
      emptyState={{
        title: "Choose the images to convert",
        body: "Drop JPG, PNG or WebP images here, or choose them from your device. They stay on this device.",
        pickLabel: "Choose images",
      }}
      primary={{
        label: "Convert and download",
        icon: <Download size={17} />,
        disabled: !images.length,
        onClick: convert,
      }}
      inspector={
        <>
          <Segmented
            label="Page size"
            value={pageSize}
            onChange={setPageSize}
            options={[
              { value: "a4", label: "A4" },
              { value: "letter", label: "Letter" },
              { value: "fit", label: "Fit image" },
            ]}
          />
          {pageSize !== "fit" && (
            <Segmented
              label="Orientation"
              value={orientation}
              onChange={setOrientation}
              options={[
                { value: "auto", label: "Auto" },
                { value: "portrait", label: "Portrait" },
                { value: "landscape", label: "Landscape" },
              ]}
            />
          )}
          <Segmented
            label="Margin"
            value={margin}
            onChange={setMargin}
            options={[
              { value: "none", label: "None" },
              { value: "small", label: "Small" },
              { value: "large", label: "Large" },
            ]}
          />
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
            One page per image, in the order shown. JPG photos are placed without recompression.
          </p>
        </>
      }
    >
      <div className="stage-bar">
        <p>Drag images into the order you want.</p>
        <div className="stage-actions">
          <button
            type="button"
            className="text-button"
            disabled={!!busy}
            onClick={() =>
              confirmDiscard(unsaved, "Remove all images? Your PDF has not been downloaded.") &&
              setImages([])
            }
          >
            <Trash2 size={16} />
            Remove all
          </button>
        </div>
      </div>
      <ol className="sheet-grid">
        {images.map((image, index) => {
          const { ratio, inset } = pageAspect(image, pageSize, orientation, margin);
          return (
            <Sheet
              key={image.key}
              title={image.name}
              detail={`${image.width} × ${image.height}, ${formatBytes(image.size)}`}
              itemProps={itemProps(index)}
              tools={
                <>
                  <MoveButtons index={index} count={images.length} move={move} label={image.name} />
                  <IconButton
                    label={`Remove ${image.name}`}
                    className="is-remove"
                    onClick={() => setImages(images.filter((item) => item.key !== image.key))}
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </>
              }
            >
              <span
                className="image-page"
                style={{ aspectRatio: ratio, padding: `${inset * 100}%` }}
              >
                <img src={image.url} alt="" draggable={false} />
              </span>
            </Sheet>
          );
        })}
      </ol>
    </ToolShell>
  );
}

mountTool(ImagesToPdfTool);
