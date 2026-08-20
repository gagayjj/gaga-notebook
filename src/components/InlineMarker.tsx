import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Eraser, Shapes, Trash2, Undo2, X } from "lucide-react";

type ShapeTool =
  | "line"
  | "arrow"
  | "doubleArrow"
  | "rect"
  | "roundedRect"
  | "ellipse"
  | "star"
  | "flag"
  | "textBox"
  | "callout"
  | "heart"
  | "check"
  | "exclaim";

interface InlineMarkerProps {
  onClose: () => void;
  onInsert: (dataUrl: string) => void;
}

type Point = { x: number; y: number };
type Stroke = { tool: ShapeTool; color: string; size: number; start: Point; end: Point; text?: string };

const shapeOptions: Array<{ tool: ShapeTool; label: string }> = [
  { tool: "line", label: "线条" },
  { tool: "arrow", label: "箭头" },
  { tool: "doubleArrow", label: "双向" },
  { tool: "rect", label: "矩形" },
  { tool: "roundedRect", label: "圆角" },
  { tool: "ellipse", label: "圆形" },
  { tool: "star", label: "星形" },
  { tool: "flag", label: "旗帜" },
  { tool: "textBox", label: "文本框" },
  { tool: "callout", label: "标注" },
  { tool: "heart", label: "心形" },
  { tool: "check", label: "对勾" },
  { tool: "exclaim", label: "感叹" },
];

const colors = ["#e5484d", "#f5a524", "#30a46c", "#3b82f6", "#8e4ec6", "#111827"];

export function InlineMarker({ onClose, onInsert }: InlineMarkerProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tool, setTool] = useState<ShapeTool>("arrow");
  const [color, setColor] = useState(colors[0]);
  const [size, setSize] = useState(4);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [draft, setDraft] = useState<Stroke | null>(null);
  const [selected, setSelected] = useState(-1);
  const [dragMode, setDragMode] = useState<"start" | "end" | "move" | null>(null);
  const dragStartRef = useRef<Point | null>(null);

  const box = (stroke: Stroke) => ({
    left: Math.min(stroke.start.x, stroke.end.x),
    top: Math.min(stroke.start.y, stroke.end.y),
    right: Math.max(stroke.start.x, stroke.end.x),
    bottom: Math.max(stroke.start.y, stroke.end.y),
  });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const paint = (stroke: Stroke) => {
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const b = box(stroke);
      const w = Math.max(10, b.right - b.left);
      const h = Math.max(10, b.bottom - b.top);
      if (stroke.tool === "line") {
        ctx.beginPath();
        ctx.moveTo(stroke.start.x, stroke.start.y);
        ctx.lineTo(stroke.end.x, stroke.end.y);
        ctx.stroke();
      } else if (stroke.tool === "arrow") {
        drawArrow(ctx, stroke.start, stroke.end, stroke.size);
      } else if (stroke.tool === "doubleArrow") {
        ctx.beginPath();
        ctx.moveTo(stroke.start.x, stroke.start.y);
        ctx.lineTo(stroke.end.x, stroke.end.y);
        ctx.stroke();
        drawArrow(ctx, stroke.end, stroke.start, stroke.size * 0.7);
      } else if (stroke.tool === "rect") {
        ctx.strokeRect(b.left, b.top, w, h);
      } else if (stroke.tool === "roundedRect" || stroke.tool === "textBox" || stroke.tool === "callout") {
        roundedRect(ctx, b.left, b.top, w, h, Math.min(18, h * 0.25));
        ctx.stroke();
        if (stroke.tool !== "roundedRect") {
          ctx.font = `${Math.max(14, Math.min(26, h * 0.26))}px sans-serif`;
          ctx.textBaseline = "middle";
          ctx.fillText(stroke.text || "文本", b.left + 10, b.top + h / 2);
        }
        if (stroke.tool === "callout") {
          ctx.beginPath();
          ctx.moveTo(stroke.end.x, stroke.end.y);
          ctx.lineTo(b.left + w - 18, b.top + h - 2);
          ctx.lineTo(b.left + w - 2, b.top + h);
          ctx.closePath();
          ctx.fill();
        }
      } else if (stroke.tool === "ellipse") {
        ctx.beginPath();
        ctx.ellipse(b.left + w / 2, b.top + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (stroke.tool === "star") {
        starPath(ctx, b.left + w / 2, b.top + h / 2, Math.min(w, h) / 2);
        ctx.fill();
      } else if (stroke.tool === "flag") {
        ctx.beginPath();
        ctx.moveTo(b.left, b.top + h);
        ctx.lineTo(b.left, b.top);
        ctx.lineTo(b.left + w, b.top + h * 0.45);
        ctx.closePath();
        ctx.fill();
      } else if (stroke.tool === "heart") {
        heartPath(ctx, b.left + w / 2, b.top + h / 2, Math.min(w, h) / 2);
        ctx.fill();
      } else if (stroke.tool === "check") {
        ctx.beginPath();
        ctx.moveTo(b.left + w * 0.1, b.top + h * 0.55);
        ctx.lineTo(b.left + w * 0.38, b.top + h * 0.85);
        ctx.lineTo(b.left + w * 0.9, b.top + h * 0.12);
        ctx.stroke();
      } else if (stroke.tool === "exclaim") {
        ctx.fillRect(b.left + w / 2 - stroke.size, b.top + h * 0.15, stroke.size * 2, h * 0.45);
        ctx.beginPath();
        ctx.arc(b.left + w / 2, b.top + h * 0.8, stroke.size, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    strokes.forEach(paint);
    if (draft) paint(draft);
    if (selected >= 0 && strokes[selected]) {
      const b = box(strokes[selected]);
      ctx.strokeStyle = "#2563eb";
      ctx.fillStyle = "#fff";
      ctx.lineWidth = 2;
      [
        { x: b.left, y: b.top },
        { x: b.right, y: b.bottom },
      ].forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    }
  }, [strokes, draft, selected]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    canvas.width = Math.max(320, wrap.clientWidth);
    canvas.height = Math.max(240, wrap.clientHeight);
    draw();
  }, [draw]);

  const toPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const hit = (stroke: Stroke, point: Point) => {
    const b = box(stroke);
    const pad = Math.max(10, stroke.size * 2.5);
    if (point.x < b.left - pad || point.x > b.right + pad || point.y < b.top - pad || point.y > b.bottom + pad) return null;
    if (Math.hypot(point.x - b.left, point.y - b.top) <= 12) return "start" as const;
    if (Math.hypot(point.x - b.right, point.y - b.bottom) <= 12) return "end" as const;
    return "move" as const;
  };

  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = toPoint(event);
    if (selected >= 0) {
      const current = strokes[selected];
      const hitMode = current && hit(current, point);
      if (hitMode) {
        setDragMode(hitMode);
        dragStartRef.current = point;
        return;
      }
    }
    for (let i = strokes.length - 1; i >= 0; i -= 1) {
      const hitMode = hit(strokes[i], point);
      if (hitMode) {
        setSelected(i);
        setDragMode(hitMode);
        dragStartRef.current = point;
        return;
      }
    }
    setSelected(-1);
    const text = tool === "textBox" || tool === "callout" ? window.prompt("输入文字", "文本") || "" : undefined;
    setDraft({ tool, color, size, start: point, end: point, text });
  };

  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = toPoint(event);
    if (dragMode && selected >= 0) {
      const start = dragStartRef.current;
      if (!start) return;
      setStrokes((prev) =>
        prev.map((stroke, index) => {
          if (index !== selected) return stroke;
          if (dragMode === "start") return { ...stroke, start: point };
          if (dragMode === "end") return { ...stroke, end: point };
          const dx = point.x - start.x;
          const dy = point.y - start.y;
          dragStartRef.current = point;
          return {
            ...stroke,
            start: { x: stroke.start.x + dx, y: stroke.start.y + dy },
            end: { x: stroke.end.x + dx, y: stroke.end.y + dy },
          };
        }),
      );
      return;
    }
    if (!draft) return;
    setDraft({ ...draft, end: point });
  };

  const pointerUp = () => {
    if (draft) {
      const next = [...strokes, draft];
      setStrokes(next);
      setSelected(next.length - 1);
      setDraft(null);
    }
    setDragMode(null);
    dragStartRef.current = null;
  };

  const insert = () => {
    const canvas = canvasRef.current;
    if (canvas) onInsert(canvas.toDataURL("image/png"));
  };

  return (
    <div ref={wrapRef} className="inline-marker">
      <div className="inline-marker-bar">
        {shapeOptions.map((option) => (
          <button
            type="button"
            key={option.tool}
            className={tool === option.tool ? "active" : ""}
            onClick={() => setTool(option.tool)}
          >
            {option.label}
          </button>
        ))}
        <span className="inline-marker-colors">
          {colors.map((item) => (
            <i
              key={item}
              style={{ backgroundColor: item }}
              className={item === color ? "active" : ""}
              onClick={() => setColor(item)}
            />
          ))}
        </span>
        <button type="button" onClick={() => setSize(size >= 10 ? 3 : size + 2)}>
          {size}px
        </button>
        <button type="button" title="撤销" onClick={() => setStrokes((prev) => prev.slice(0, -1))}>
          <Undo2 size={15} />
        </button>
        <button type="button" title="删除选中" disabled={selected < 0} onClick={() => setStrokes((prev) => prev.filter((_, i) => i !== selected))}>
          <Trash2 size={15} />
        </button>
        <button type="button" title="清空" onClick={() => setStrokes([])}>
          <Eraser size={15} />
        </button>
        <span className="inline-marker-spacer" />
        <button type="button" title="取消" onClick={onClose}>
          <X size={15} />
        </button>
        <button type="button" className="primary" title="插入到笔记" onClick={insert}>
          <Check size={15} />
          插入笔记
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="inline-marker-canvas"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
      />
    </div>
  );
}

function drawArrow(ctx: CanvasRenderingContext2D, start: Point, end: Point, size: number) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const head = Math.max(12, size * 3);
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

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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

function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number) {
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
}

function heartPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.7);
  ctx.bezierCurveTo(cx - s * 1.1, cy - s * 0.15, cx - s * 0.4, cy - s * 0.8, cx, cy - s * 0.2);
  ctx.bezierCurveTo(cx + s * 0.4, cy - s * 0.8, cx + s * 1.1, cy - s * 0.15, cx, cy + s * 0.7);
  ctx.closePath();
}
