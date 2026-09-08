import { useRef } from "react";
import type { FloatingImage } from "../types";

interface FloatingImageLayerProps {
  image: FloatingImage;
  onUpdate: (image: FloatingImage) => void;
  onRemove: (id: string) => void;
}

const handles = [
  { key: "nw", cursor: "nwse-resize" },
  { key: "ne", cursor: "nesw-resize" },
  { key: "sw", cursor: "nesw-resize" },
  { key: "se", cursor: "nwse-resize" },
] as const;

export function FloatingImageLayer({ image, onUpdate, onRemove }: FloatingImageLayerProps) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    mode: string;
    startX: number;
    startY: number;
    rect: { x: number; y: number; w: number; h: number };
  } | null>(null);

  const startDrag = (event: React.PointerEvent, mode: string) => {
    event.preventDefault();
    event.stopPropagation();
    document.body.style.overflow = "hidden";
    const paper = layerRef.current?.closest(".editor-paper");
    if (!paper) return;
    const paperRect = paper.getBoundingClientRect();
    dragRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      rect: { x: image.x, y: image.y, w: image.width, h: image.height },
    };

    const move = (ev: PointerEvent) => {
      ev.preventDefault();
      const drag = dragRef.current;
      if (!drag) return;
      const dx = ev.clientX - drag.startX;
      const dy = ev.clientY - drag.startY;
      let x = drag.rect.x;
      let y = drag.rect.y;
      let width = drag.rect.w;
      let height = drag.rect.h;
      const min = 40;

      if (mode === "move") {
        x = drag.rect.x + dx;
        y = drag.rect.y + dy;
      } else {
        if (mode.includes("w")) {
          const nextWidth = Math.max(min, drag.rect.w - dx);
          x = drag.rect.x + (drag.rect.w - nextWidth);
          width = nextWidth;
        }
        if (mode.includes("e")) {
          width = Math.max(min, drag.rect.w + dx);
        }
        if (mode.includes("n")) {
          const nextHeight = Math.max(min, drag.rect.h - dy);
          y = drag.rect.y + (drag.rect.h - nextHeight);
          height = nextHeight;
        }
        if (mode.includes("s")) {
          height = Math.max(min, drag.rect.h + dy);
        }
      }

      x = Math.max(0, Math.min(x, paperRect.width - width));
      y = Math.max(0, Math.min(y, paperRect.height - height));
      onUpdate({ ...image, x, y, width, height });
    };

    const up = () => {
      dragRef.current = null;
      document.body.style.overflow = "";
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };

    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
  };

  return (
    <>
      <div
        ref={layerRef}
        className="floating-image-layer"
        style={{ left: image.x, top: image.y, width: image.width, height: image.height }}
        onPointerDown={(event) => startDrag(event, "move")}
      >
        <img className="floating-image-img" src={image.src} alt="" draggable={false} />
        <button
          type="button"
          className="floating-image-delete"
          title="删除图片和标记"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onRemove(image.id)}
        >
          ×
        </button>
        {handles.map((handle) => (
          <span
            key={handle.key}
            className={`floating-image-handle handle-${handle.key}`}
            style={{ cursor: handle.cursor }}
            onPointerDown={(event) => startDrag(event, handle.key)}
          />
        ))}
      </div>
      {image.marks && (
        <img
          className="floating-image-marks"
          src={image.marks}
          alt=""
          draggable={false}
          style={{ left: image.markX, top: image.markY, width: image.markWidth, height: image.markHeight }}
        />
      )}
    </>
  );
}
