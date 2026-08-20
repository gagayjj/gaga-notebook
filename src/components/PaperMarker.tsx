import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Eraser, Trash2, Undo2, X } from "lucide-react";

type Tool = "arrow" | "curve" | "line" | "rect" | "ellipse" | "star" | "pen";
type Point = { x: number; y: number };
type Stroke = {
  tool: Tool;
  color: string;
  size: number;
  start: Point;
  end: Point;
  control?: Point;
  points?: Point[];
};

interface PaperMarkerProps {
  onClose: () => void;
  onInsert: (dataUrl: string) => void;
}

const tools: Array<{ tool: Tool; label: string }> = [
  { tool: "arrow", label: "箭头" },
  { tool: "curve", label: "曲线" },
  { tool: "line", label: "线条" },
  { tool: "rect", label: "矩形" },
  { tool: "ellipse", label: "圆形" },
  { tool: "star", label: "星形" },
  { tool: "pen", label: "画笔" },
];

const colors = ["#e5484d", "#f5a524", "#30a46c", "#3b82f6", "#8e4ec6", "#111827"];

export function PaperMarker({ onClose, onInsert }: PaperMarkerProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tool, setTool] = useState<Tool>("curve");
  const [color, setColor] = useState(colors[0]);
  const [size, setSize] = useState(4);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [draft, setDraft] = useState<Stroke | null>(null);
  const [selected, setSelected] = useState(-1);
  const [dragMode, setDragMode] = useState<"start" | "control" | "end" | "move" | null>(null);
  const dragStartRef = useRef<{ pointer: Point; stroke: Stroke } | null>(null);
  const draftRef = useRef<Stroke | null>(null);
  const handlersRef = useRef<{ down: (event: PointerEvent) => void; move: (event: PointerEvent) => void; up: () => void }>({
    down: () => {},
    move: () => {},
    up: () => {},
  });

  const resizeCanvas = useCallback(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    canvas.width = wrap.clientWidth;
    canvas.height = wrap.clientHeight;
    draw();
  }, []);

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
      if (stroke.tool === "pen" && stroke.points && stroke.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        stroke.points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
        ctx.stroke();
      } else if (stroke.tool === "line") {
        line(ctx, stroke.start, stroke.end);
      } else if (stroke.tool === "arrow") {
        arrow(ctx, stroke.start, stroke.end, stroke.size);
      } else if (stroke.tool === "curve") {
        ctx.beginPath();
        ctx.moveTo(stroke.start.x, stroke.start.y);
        ctx.quadraticCurveTo(stroke.control?.x || stroke.end.x, stroke.control?.y || stroke.start.y, stroke.end.x, stroke.end.y);
        ctx.stroke();
      } else if (stroke.tool === "rect") {
        ctx.strokeRect(stroke.start.x, stroke.start.y, stroke.end.x - stroke.start.x, stroke.end.y - stroke.start.y);
      } else if (stroke.tool === "ellipse") {
        ctx.beginPath();
        ctx.ellipse(
          (stroke.start.x + stroke.end.x) / 2,
          (stroke.start.y + stroke.end.y) / 2,
          Math.abs(stroke.end.x - stroke.start.x) / 2,
          Math.abs(stroke.end.y - stroke.start.y) / 2,
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      } else if (stroke.tool === "star") {
        const box = shapeBox(stroke);
        star(ctx, box.left + box.w / 2, box.top + box.h / 2, Math.min(box.w, box.h) / 2);
        ctx.fill();
      }
    };
    strokes.forEach(paint);
    if (draft) paint(draft);
    if (selected >= 0 && strokes[selected]) {
      const stroke = strokes[selected];
      const handles: Array<{ point: Point; type: "start" | "control" | "end" | "move" }> = [];
      if (stroke.tool === "curve") {
        handles.push({ point: stroke.start, type: "start" }, { point: stroke.control || stroke.start, type: "control" }, { point: stroke.end, type: "end" });
      } else if (stroke.tool !== "pen") {
        handles.push({ point: stroke.start, type: "start" }, { point: stroke.end, type: "end" });
      }
      ctx.strokeStyle = "#2563eb";
      ctx.fillStyle = "#fff";
      ctx.lineWidth = 2;
      handles.forEach((handle) => {
        ctx.beginPath();
        ctx.arc(handle.point.x, handle.point.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    }
  }, [strokes, draft, selected]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    resizeCanvas();
    const observer = new ResizeObserver(resizeCanvas);
    if (wrapRef.current) observer.observe(wrapRef.current);
    return () => observer.disconnect();
  }, [resizeCanvas]);

  const toPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const hit = (stroke: Stroke, point: Point) => {
    if (stroke.tool === "pen") return null;
    if (stroke.tool === "curve") {
      const control = stroke.control || stroke.start;
      if (Math.hypot(point.x - control.x, point.y - control.y) <= 14) return "control" as const;
    }
    if (Math.hypot(point.x - stroke.start.x, point.y - stroke.start.y) <= 14) return "start" as const;
    if (Math.hypot(point.x - stroke.end.x, point.y - stroke.end.y) <= 14) return "end" as const;
    const box = shapeBox(stroke);
    if (point.x >= box.left - 12 && point.x <= box.left + box.w + 12 && point.y >= box.top - 12 && point.y <= box.top + box.h + 12) {
      return "move" as const;
    }
    return null;
  };

  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = toPoint(event);
    if (selected >= 0) {
      const mode = hit(strokes[selected], point);
      if (mode) {
        setDragMode(mode);
        dragStartRef.current = { pointer: point, stroke: strokes[selected] };
        return;
      }
    }
    for (let i = strokes.length - 1; i >= 0; i -= 1) {
      const mode = hit(strokes[i], point);
      if (mode) {
        setSelected(i);
        setDragMode(mode);
        dragStartRef.current = { pointer: point, stroke: strokes[i] };
        return;
      }
    }
    setSelected(-1);
    if (tool === "pen") {
      draftRef.current = { tool, color, size, start: point, end: point, points: [point] };
    } else {
      const control = tool === "curve" ? { x: point.x + 40, y: point.y - 40 } : undefined;
      draftRef.current = { tool, color, size, start: point, end: point, control };
    }
    setDraft(draftRef.current);
  };

  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = toPoint(event);
    if (dragMode && selected >= 0 && dragStartRef.current) {
      const original = dragStartRef.current.stroke;
      const dx = point.x - dragStartRef.current.pointer.x;
      const dy = point.y - dragStartRef.current.pointer.y;
      setStrokes((prev) =>
        prev.map((stroke, index) => {
          if (index !== selected) return stroke;
          if (dragMode === "start") return { ...stroke, start: point };
          if (dragMode === "end") return { ...stroke, end: point };
          if (dragMode === "control") return { ...stroke, control: point };
          return {
            ...stroke,
            start: { x: original.start.x + dx, y: original.start.y + dy },
            end: { x: original.end.x + dx, y: original.end.y + dy },
            control: original.control ? { x: original.control.x + dx, y: original.control.y + dy } : undefined,
            points: original.points ? original.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) : undefined,
          };
        }),
      );
      return;
    }
    if (!draftRef.current) return;
    if (draftRef.current.tool === "pen") {
      draftRef.current = { ...draftRef.current, end: point, points: [...(draftRef.current.points || []), point] };
    } else if (draftRef.current.tool === "curve") {
      draftRef.current = {
        ...draftRef.current,
        end: point,
        control: { x: (draftRef.current.start.x + point.x) / 2, y: draftRef.current.start.y - 40 },
      };
    } else {
      draftRef.current = { ...draftRef.current, end: point };
    }
    setDraft(draftRef.current);
  };

  const pointerUp = () => {
    if (draftRef.current) {
      const next = [...strokes, draftRef.current];
      setStrokes(next);
      setSelected(next.length - 1);
      draftRef.current = null;
      setDraft(null);
    }
    setDragMode(null);
    dragStartRef.current = null;
  };

  handlersRef.current = {
    down: pointerDown as unknown as (event: PointerEvent) => void,
    move: pointerMove as unknown as (event: PointerEvent) => void,
    up: pointerUp,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const down = (event: PointerEvent) => handlersRef.current.down(event);
    const move = (event: PointerEvent) => handlersRef.current.move(event);
    const up = () => handlersRef.current.up();
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
    };
  }, []);

  const insert = () => {
    const canvas = canvasRef.current;
    if (canvas) onInsert(canvas.toDataURL("image/png"));
  };

  return (
    <div ref={wrapRef} className="paper-marker">
      <div className="paper-marker-bar">
        {tools.map((item) => (
          <button type="button" key={item.tool} className={tool === item.tool ? "active" : ""} onClick={() => setTool(item.tool)}>
            {item.label}
          </button>
        ))}
        <span className="paper-marker-colors">
          {colors.map((item) => (
            <i key={item} style={{ backgroundColor: item }} className={item === color ? "active" : ""} onClick={() => setColor(item)} />
          ))}
        </span>
        <button type="button" onClick={() => setSize(size >= 12 ? 3 : size + 2)}>
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
        <span className="paper-marker-spacer" />
        <button type="button" title="取消标记" onClick={onClose}>
          <X size={15} />
          取消
        </button>
        <button type="button" className="primary" title="完成标记并固定在笔记页" onClick={insert}>
          <Check size={15} />
          完成
        </button>
      </div>
      <canvas ref={canvasRef} className="paper-marker-canvas" />
    </div>
  );
}

function shapeBox(stroke: Stroke) {
  return {
    left: Math.min(stroke.start.x, stroke.end.x),
    top: Math.min(stroke.start.y, stroke.end.y),
    w: Math.abs(stroke.end.x - stroke.start.x),
    h: Math.abs(stroke.end.y - stroke.start.y),
  };
}

function line(ctx: CanvasRenderingContext2D, start: Point, end: Point) {
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
}

function arrow(ctx: CanvasRenderingContext2D, start: Point, end: Point, size: number) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const head = Math.max(12, size * 3);
  line(ctx, start, end);
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - head * Math.cos(angle - Math.PI / 7), end.y - head * Math.sin(angle - Math.PI / 7));
  ctx.lineTo(end.x - head * Math.cos(angle + Math.PI / 7), end.y - head * Math.sin(angle + Math.PI / 7));
  ctx.closePath();
  ctx.fill();
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number) {
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
