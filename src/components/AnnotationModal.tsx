import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Eraser, MousePointer2, PenLine, Redo2, Square, Trash2, Type, Undo2, X } from "lucide-react";
import type { AnnotationImage } from "../types";

type Tool = "pointer" | "pen" | "arrow" | "rect" | "text";
type DragMode = "start" | "end" | "move" | null;
type Point = { x: number; y: number };

interface StrokeBase {
  tool: Tool;
  color: string;
  size: number;
}

type Stroke =
  | (StrokeBase & { tool: "pen"; points: Array<{ x: number; y: number }> })
  | (StrokeBase & { tool: "arrow"; start: Point; end: Point })
  | (StrokeBase & { tool: "rect"; start: Point; end: Point })
  | (StrokeBase & { tool: "text"; x: number; y: number; text: string });

interface AnnotationModalProps {
  image: AnnotationImage | null;
  onClose: () => void;
  onInsert: (dataUrl: string) => void;
}

const colors = ["#e5484d", "#f5a524", "#30a46c", "#3b82f6", "#8e4ec6", "#111827"];

function distanceToSegment(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return Math.hypot(point.x - px, point.y - py);
}

function hitArrow(stroke: Extract<Stroke, { tool: "arrow" }>, point: Point): "start" | "end" | "body" | null {
  const threshold = Math.max(10, stroke.size * 2.5);
  if (Math.hypot(point.x - stroke.start.x, point.y - stroke.start.y) <= threshold + 7) return "start";
  if (Math.hypot(point.x - stroke.end.x, point.y - stroke.end.y) <= threshold + 7) return "end";
  if (distanceToSegment(point, stroke.start, stroke.end) <= threshold) return "body";
  return null;
}

export function AnnotationModal({ image, onClose, onInsert }: AnnotationModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [dataUrl, setDataUrl] = useState(image?.dataUrl || "");
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(colors[0]);
  const [size, setSize] = useState(4);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [draft, setDraft] = useState<Stroke | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const dragStartRef = useRef<Point | null>(null);

  useEffect(() => {
    if (image?.dataUrl) setDataUrl(image.dataUrl);
  }, [image]);

  useEffect(() => {
    if (!dataUrl) {
      setBgImage(null);
      return;
    }
    const img = new Image();
    img.onload = () => setBgImage(img);
    img.src = dataUrl;
  }, [dataUrl]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (bgImage) {
      ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
    }

    const drawStroke = (stroke: Stroke) => {
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (stroke.tool === "pen") {
        if (stroke.points.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        stroke.points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
        ctx.stroke();
      } else if (stroke.tool === "rect") {
        ctx.strokeRect(
          stroke.start.x,
          stroke.start.y,
          stroke.end.x - stroke.start.x,
          stroke.end.y - stroke.start.y,
        );
      } else if (stroke.tool === "arrow") {
        drawArrow(ctx, stroke.start, stroke.end, stroke.size);
      } else if (stroke.tool === "text") {
        ctx.font = `${stroke.size * 5}px sans-serif`;
        ctx.fillText(stroke.text, stroke.x, stroke.y);
      }
    };

    strokes.forEach(drawStroke);
    if (draft) drawStroke(draft);

    if (selectedIndex !== null) {
      const selected = strokes[selectedIndex];
      if (selected && (selected.tool === "arrow" || selected.tool === "rect")) {
        ctx.strokeStyle = "#2563eb";
        ctx.fillStyle = "#ffffff";
        ctx.lineWidth = 2;
        [selected.start, selected.end].forEach((handle) => {
          ctx.beginPath();
          ctx.arc(handle.x, handle.y, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
      }
    }
  }, [bgImage, strokes, draft, selectedIndex]);

  useEffect(() => {
    draw();
  }, [draw]);

  const fitCanvas = (img: HTMLImageElement) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const maxWidth = 1400;
    const maxHeight = 900;
    const scale = Math.min(1, maxWidth / img.naturalWidth, maxHeight / img.naturalHeight);
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
  };

  useEffect(() => {
    if (bgImage) fitCanvas(bgImage);
  }, [bgImage]);

  const toCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = toCanvasPoint(event);
    if (tool === "pointer") {
      if (selectedIndex !== null && dragMode === null) {
        const selected = strokes[selectedIndex];
        if (selected?.tool === "arrow") {
          const hit = hitArrow(selected, point);
          if (hit) {
            setDragMode(hit === "body" ? "move" : hit);
            dragStartRef.current = point;
            return;
          }
        }
      }
      for (let i = strokes.length - 1; i >= 0; i -= 1) {
        const stroke = strokes[i];
        if (stroke.tool === "arrow") {
          const hit = hitArrow(stroke, point);
          if (hit) {
            setSelectedIndex(i);
            setDragMode(hit === "body" ? "move" : hit);
            dragStartRef.current = point;
            return;
          }
        }
      }
      setSelectedIndex(null);
      return;
    }
    if (tool === "text") {
      const text = window.prompt("输入标注文字", "重点");
      if (text) setStrokes((prev) => [...prev, { tool, color, size, x: point.x, y: point.y, text }]);
      return;
    }
    if (tool === "pen") {
      setDraft({ tool, color, size, points: [point] });
    } else {
      setDraft({ tool, color, size, start: point, end: point });
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = toCanvasPoint(event);
    if (tool === "pointer" && selectedIndex !== null && dragMode) {
      const dragStart = dragStartRef.current;
      if (!dragStart) return;
      if (dragMode === "move") {
        const dx = point.x - dragStart.x;
        const dy = point.y - dragStart.y;
        dragStartRef.current = point;
        setStrokes((prev) =>
          prev.map((stroke, index) =>
            index === selectedIndex && stroke.tool === "arrow"
              ? ({
                  ...stroke,
                  start: { x: stroke.start.x + dx, y: stroke.start.y + dy },
                  end: { x: stroke.end.x + dx, y: stroke.end.y + dy },
                } as Stroke)
              : stroke,
          ),
        );
      } else {
        setStrokes((prev) =>
          prev.map((stroke, index) =>
            index === selectedIndex && stroke.tool === "arrow"
              ? ({ ...stroke, [dragMode]: point } as Stroke)
              : stroke,
          ),
        );
      }
      return;
    }
    if (!draft) return;
    if (draft.tool === "pen") {
      setDraft({ ...draft, points: [...draft.points, point] } as Stroke);
    } else {
      setDraft({ ...draft, end: point } as Stroke);
    }
  };

  const handlePointerUp = () => {
    setDragMode(null);
    dragStartRef.current = null;
    if (draft) {
      setStrokes((prev) => [...prev, draft]);
      setDraft(null);
    }
  };

  const undo = () => {
    const next = strokes.slice(0, -1);
    setStrokes(next);
    if (selectedIndex !== null && selectedIndex >= next.length) setSelectedIndex(null);
  };

  const clear = () => {
    setStrokes([]);
    setSelectedIndex(null);
  };

  const deleteSelected = () => {
    if (selectedIndex === null) return;
    setStrokes((prev) => prev.filter((_, index) => index !== selectedIndex));
    setSelectedIndex(null);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.key === "Delete" || event.key === "Backspace") && selectedIndex !== null) {
        event.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const exportImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onInsert(canvas.toDataURL("image/png"));
  };

  const acceptFile = (file: File | undefined | null) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setDataUrl(reader.result);
        setStrokes([]);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="annotation-modal">
        <div className="annotation-toolbar">
          <div className="annotation-tools">
            <button type="button" className={`icon-btn ${tool === "pointer" ? "active" : ""}`} title="选择" onClick={() => setTool("pointer")}>
              <MousePointer2 size={16} />
            </button>
            <button type="button" className={`icon-btn ${tool === "pen" ? "active" : ""}`} title="自由笔迹" onClick={() => setTool("pen")}>
              <PenLine size={16} />
            </button>
            <button type="button" className={`icon-btn ${tool === "arrow" ? "active" : ""}`} title="箭头" onClick={() => setTool("arrow")}>
              <ArrowRight size={16} />
            </button>
            <button type="button" className={`icon-btn ${tool === "rect" ? "active" : ""}`} title="方框" onClick={() => setTool("rect")}>
              <Square size={16} />
            </button>
            <button type="button" className={`icon-btn ${tool === "text" ? "active" : ""}`} title="文字" onClick={() => setTool("text")}>
              <Type size={16} />
            </button>
          </div>
          <div className="annotation-options">
            {colors.map((item) => (
              <button
                type="button"
                key={item}
                className={`color-swatch ${item === color ? "active" : ""}`}
                style={{ backgroundColor: item }}
                onClick={() => setColor(item)}
              />
            ))}
            <input
              type="range"
              min={1}
              max={14}
              value={size}
              onChange={(event) => setSize(Number(event.target.value))}
              title="笔迹粗细"
            />
          </div>
          <div className="annotation-actions">
            <button type="button" className="icon-btn" title="撤销" onClick={undo}>
              <Undo2 size={16} />
            </button>
            <button
              type="button"
              className="icon-btn"
              title="删除选中的箭头"
              disabled={selectedIndex === null}
              onClick={deleteSelected}
            >
              <Trash2 size={16} />
            </button>
            <button type="button" className="icon-btn" title="清空标注" onClick={clear}>
              <Eraser size={16} />
            </button>
            <span className="toolbar-sep" />
            <button type="button" className="icon-btn" title="关闭" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="annotation-body">
          {bgImage ? (
            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            />
          ) : (
            <div
              className="annotation-empty"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                acceptFile(event.dataTransfer.files?.[0]);
              }}
            >
              <Redo2 size={30} />
              <p>点击选择图片，或把截图拖到这里</p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => acceptFile(event.target.files?.[0])}
          />
        </div>

        <div className="annotation-footer">
          <button type="button" className="text-btn" onClick={() => fileInputRef.current?.click()}>
            更换图片
          </button>
          <div>
            <button type="button" className="btn ghost" onClick={onClose}>
              取消
            </button>
            <button type="button" className="btn primary" disabled={!bgImage} onClick={exportImage}>
              插入到笔记
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  start: { x: number; y: number },
  end: { x: number; y: number },
  size: number,
) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const head = Math.max(10, size * 3);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - head * Math.cos(angle - Math.PI / 7), end.y - head * Math.sin(angle - Math.PI / 7));
  ctx.lineTo(end.x - head * Math.cos(angle + Math.PI / 7), end.y - head * Math.sin(angle + Math.PI / 7));
  ctx.closePath();
  ctx.fill();
}
