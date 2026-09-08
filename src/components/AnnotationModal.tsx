import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Eraser, MousePointer2, PenLine, Redo2, Shapes, Square, Trash2, Type, Undo2, X } from "lucide-react";
import type { AnnotationImage, AnnotationInsert } from "../types";

type ShapeTool =
  | "line"
  | "doubleArrow"
  | "roundedRect"
  | "ellipse"
  | "star"
  | "flag"
  | "textBox"
  | "callout"
  | "heart"
  | "check"
  | "exclaim";

type Tool = "pointer" | "pen" | "arrow" | "rect" | "text" | ShapeTool;
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
  | (StrokeBase & { tool: ShapeTool; start: Point; end: Point; text?: string })
  | (StrokeBase & { tool: "text"; x: number; y: number; text: string });

interface AnnotationModalProps {
  image: AnnotationImage | null;
  onClose: () => void;
  onInsert: (result: AnnotationInsert) => void;
}

const colors = ["#e5484d", "#f5a524", "#30a46c", "#3b82f6", "#8e4ec6", "#111827"];

const shapeTools: Array<{ tool: Tool; label: string }> = [
  { tool: "line", label: "线条" },
  { tool: "doubleArrow", label: "双向箭头" },
  { tool: "roundedRect", label: "圆角矩形" },
  { tool: "ellipse", label: "圆形" },
  { tool: "star", label: "星形" },
  { tool: "flag", label: "旗帜" },
  { tool: "textBox", label: "文本框" },
  { tool: "callout", label: "标注" },
  { tool: "heart", label: "心形" },
  { tool: "check", label: "对勾" },
  { tool: "exclaim", label: "感叹" },
];

function paintAnnotationStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
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
  } else {
    drawShape(ctx, stroke);
  }
}

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

function shapeBox(stroke: Stroke) {
  if (stroke.tool === "text") {
    return { left: stroke.x, top: stroke.y - stroke.size * 5, right: stroke.x + stroke.size * 12, bottom: stroke.y };
  }
  if (stroke.tool === "pen") {
    const xs = stroke.points.map((point) => point.x);
    const ys = stroke.points.map((point) => point.y);
    return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
  }
  return {
    left: Math.min(stroke.start.x, stroke.end.x),
    top: Math.min(stroke.start.y, stroke.end.y),
    right: Math.max(stroke.start.x, stroke.end.x),
    bottom: Math.max(stroke.start.y, stroke.end.y),
  };
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawShape(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  const box = shapeBox(stroke);
  const w = Math.max(10, box.right - box.left);
  const h = Math.max(10, box.bottom - box.top);
  const x = box.left;
  const y = box.top;
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (stroke.tool === "line") {
    ctx.beginPath();
    ctx.moveTo(stroke.start.x, stroke.start.y);
    ctx.lineTo(stroke.end.x, stroke.end.y);
    ctx.stroke();
  } else if (stroke.tool === "doubleArrow") {
    ctx.beginPath();
    ctx.moveTo(stroke.start.x, stroke.start.y);
    ctx.lineTo(stroke.end.x, stroke.end.y);
    ctx.stroke();
    drawArrow(ctx, stroke.end, stroke.start, Math.max(5, stroke.size * 0.7));
  } else if (stroke.tool === "rect") {
    ctx.strokeRect(x, y, w, h);
  } else if (stroke.tool === "roundedRect" || stroke.tool === "textBox" || stroke.tool === "callout") {
    roundedRectPath(ctx, x, y, w, h, Math.min(18, h * 0.25));
    ctx.stroke();
    if (stroke.tool === "textBox" || stroke.tool === "callout") {
      ctx.font = `${Math.max(14, Math.min(26, h * 0.26))}px sans-serif`;
      ctx.textBaseline = "middle";
      ctx.fillText(stroke.text || "文本", x + 10, y + h / 2);
    }
    if (stroke.tool === "callout") {
      ctx.beginPath();
      ctx.moveTo(stroke.end.x, stroke.end.y);
      ctx.lineTo(x + w - 18, y + h - 2);
      ctx.lineTo(x + w - 2, y + h);
      ctx.closePath();
      ctx.fill();
    }
  } else if (stroke.tool === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (stroke.tool === "star") {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const outer = Math.min(w, h) / 2;
    const inner = outer * 0.45;
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const radius = i % 2 === 0 ? outer : inner;
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const px = cx + radius * Math.cos(angle);
      const py = cy + radius * Math.sin(angle);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  } else if (stroke.tool === "flag") {
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y);
    ctx.lineTo(x + w, y + h * 0.45);
    ctx.closePath();
    ctx.fill();
  } else if (stroke.tool === "heart") {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const s = Math.min(w, h) / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.7);
    ctx.bezierCurveTo(cx - s * 1.1, cy - s * 0.15, cx - s * 0.4, cy - s * 0.8, cx, cy - s * 0.2);
    ctx.bezierCurveTo(cx + s * 0.4, cy - s * 0.8, cx + s * 1.1, cy - s * 0.15, cx, cy + s * 0.7);
    ctx.fill();
  } else if (stroke.tool === "check") {
    ctx.beginPath();
    ctx.moveTo(x + w * 0.1, y + h * 0.55);
    ctx.lineTo(x + w * 0.38, y + h * 0.85);
    ctx.lineTo(x + w * 0.9, y + h * 0.12);
    ctx.stroke();
  } else if (stroke.tool === "exclaim") {
    const cx = x + w / 2;
    ctx.fillRect(cx - stroke.size, y + h * 0.15, stroke.size * 2, h * 0.45);
    ctx.beginPath();
    ctx.arc(cx, y + h * 0.8, stroke.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function hitShape(stroke: Stroke, point: Point): "start" | "end" | "move" | null {
  const box = shapeBox(stroke);
  const pad = Math.max(10, stroke.size * 2.5);
  if (point.x < box.left - pad || point.x > box.right + pad || point.y < box.top - pad || point.y > box.bottom + pad) {
    return null;
  }
  if (Math.hypot(point.x - box.left, point.y - box.top) <= 13) return "start";
  if (Math.hypot(point.x - box.right, point.y - box.bottom) <= 13) return "end";
  return "move";
}

export function AnnotationModal({ image, onClose, onInsert }: AnnotationModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [dataUrl, setDataUrl] = useState(image?.dataUrl || "");
  const [tool, setTool] = useState<Tool>("pen");
  const [showShapeMenu, setShowShapeMenu] = useState(false);
  const [color, setColor] = useState(colors[0]);
  const [size, setSize] = useState(4);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const dragStartRef = useRef<Point | null>(null);
  const draftRef = useRef<Stroke | null>(null);
  const drawFrameRef = useRef<number | null>(null);

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

    strokes.forEach((stroke) => paintAnnotationStroke(ctx, stroke));
    if (draftRef.current) paintAnnotationStroke(ctx, draftRef.current);

    if (selectedIndex !== null) {
      const selected = strokes[selectedIndex];
      if (selected && selected.tool !== "pen") {
        const box = shapeBox(selected);
        ctx.strokeStyle = "#2563eb";
        ctx.fillStyle = "#ffffff";
        ctx.lineWidth = 2;
        [
          { x: box.left, y: box.top },
          { x: box.right, y: box.top },
          { x: box.left, y: box.bottom },
          { x: box.right, y: box.bottom },
        ].forEach((handle) => {
          ctx.beginPath();
          ctx.arc(handle.x, handle.y, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
      }
    }
  }, [bgImage, strokes, selectedIndex]);

  useEffect(() => {
    draw();
  }, [draw]);

  const scheduleDraw = useCallback(() => {
    if (drawFrameRef.current !== null) return;
    drawFrameRef.current = requestAnimationFrame(() => {
      drawFrameRef.current = null;
      draw();
    });
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
    return {
      x: ((event.clientX - rect.left) / rect.width) * event.currentTarget.width,
      y: ((event.clientY - rect.top) / rect.height) * event.currentTarget.height,
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = toCanvasPoint(event);
    const hitAny = (stroke: Stroke) =>
      stroke.tool === "pen" ? null : stroke.tool === "arrow" ? hitArrow(stroke, point) : hitShape(stroke, point);
    if (tool === "pointer") {
      if (selectedIndex !== null && dragMode === null) {
        const selected = strokes[selectedIndex];
        const hit = selected && hitAny(selected);
        if (hit) {
          setDragMode(hit === "body" || hit === "move" ? "move" : hit);
          dragStartRef.current = point;
          return;
        }
      }
      for (let i = strokes.length - 1; i >= 0; i -= 1) {
        const stroke = strokes[i];
        const hit = hitAny(stroke);
        if (hit) {
          setSelectedIndex(i);
          setDragMode(hit === "body" || hit === "move" ? "move" : hit);
          dragStartRef.current = point;
          return;
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
      draftRef.current = { tool, color, size, points: [point] };
      scheduleDraw();
    } else {
      const text = tool === "textBox" || tool === "callout" ? window.prompt("输入文字", "文本") || "" : undefined;
      draftRef.current = { tool, color, size, start: point, end: point, text };
      scheduleDraw();
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = toCanvasPoint(event);
    if (selectedIndex !== null && dragMode) {
      const dragStart = dragStartRef.current;
      if (!dragStart) return;
      if (dragMode === "move") {
        const dx = point.x - dragStart.x;
        const dy = point.y - dragStart.y;
        dragStartRef.current = point;
        setStrokes((prev) =>
          prev.map((stroke, index) =>
            index === selectedIndex && stroke.tool === "text"
              ? ({ ...stroke, x: stroke.x + dx, y: stroke.y + dy } as Stroke)
              : index === selectedIndex && stroke.tool !== "pen" && stroke.tool !== "text"
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
            index === selectedIndex && stroke.tool !== "pen" && stroke.tool !== "text"
              ? ({ ...stroke, [dragMode]: point } as Stroke)
              : stroke,
          ),
        );
      }
      return;
    }
    if (!draftRef.current) return;
    if (draftRef.current.tool === "pen") {
      draftRef.current = { ...draftRef.current, points: [...draftRef.current.points, point] } as Stroke;
    } else {
      draftRef.current = { ...draftRef.current, end: point } as Stroke;
    }
    scheduleDraw();
  };

  const handlePointerUp = () => {
    setDragMode(null);
    dragStartRef.current = null;
    if (draftRef.current) {
      const next = [...strokes, draftRef.current];
      setStrokes(next);
      draftRef.current = null;
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
    const marksCanvas = document.createElement("canvas");
    marksCanvas.width = canvas.width;
    marksCanvas.height = canvas.height;
    const marksCtx = marksCanvas.getContext("2d");
    if (marksCtx) strokes.forEach((stroke) => paintAnnotationStroke(marksCtx, stroke));
    onInsert({ image: dataUrl, marks: marksCanvas.toDataURL("image/png") });
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
            <div className="shape-menu-wrap">
              <button
                type="button"
                className={`icon-btn ${showShapeMenu ? "active" : ""}`}
                title="更多形状"
                onClick={() => setShowShapeMenu((value) => !value)}
              >
                <Shapes size={16} />
              </button>
              {showShapeMenu && (
                <div className="shape-menu">
                  {shapeTools.map((item) => (
                    <button
                      type="button"
                      key={item.tool}
                      className={tool === item.tool ? "active" : ""}
                      onClick={() => {
                        setTool(item.tool);
                        setShowShapeMenu(false);
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
