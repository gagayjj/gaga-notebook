import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { useRef } from "react";

const ARROW_VIEW_BOX = { width: 200, height: 100 };

export const ArrowNode = Node.create({
  name: "arrow",
  group: "block",
  atom: true,
  draggable: false,
  addAttributes() {
    return {
      startX: { default: 20 },
      startY: { default: 70 },
      endX: { default: 180 },
      endY: { default: 30 },
      color: { default: "#e5484d" },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-arrow]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-arrow": "" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ArrowView);
  },
});

export const CurveNode = Node.create({
  name: "curve",
  group: "block",
  atom: true,
  draggable: false,
  addAttributes() {
    return {
      startX: { default: 20 },
      startY: { default: 70 },
      controlX: { default: 100 },
      controlY: { default: 20 },
      endX: { default: 180 },
      endY: { default: 60 },
      color: { default: "#3b82f6" },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-curve]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-curve": "" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CurveView);
  },
});

function toViewPoint(event: PointerEvent, svg: SVGSVGElement) {
  const rect = svg.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * ARROW_VIEW_BOX.width,
    y: ((event.clientY - rect.top) / rect.height) * ARROW_VIEW_BOX.height,
  };
}

function ArrowView(props: any) {
  const dragRef = useRef<"start" | "end" | "move" | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragStartRef = useRef<{ point: { x: number; y: number }; start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);
  const attrs = props.node.attrs;

  const startDrag = (event: React.PointerEvent, type: "start" | "end" | "move") => {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = type;
    const svg = svgRef.current;
    if (type === "move" && svg) {
      dragStartRef.current = {
        point: toViewPoint(event.nativeEvent, svg),
        start: { x: attrs.startX, y: attrs.startY },
        end: { x: attrs.endX, y: attrs.endY },
      };
    }
    const move = (moveEvent: PointerEvent) => {
      const svg = svgRef.current;
      if (!svg || !dragRef.current) return;
      const point = toViewPoint(moveEvent, svg);
      if (dragRef.current === "start") {
        props.updateAttributes({ startX: clamp(point.x, 200), startY: clamp(point.y, 100) });
      } else if (dragRef.current === "end") {
        props.updateAttributes({ endX: clamp(point.x, 200), endY: clamp(point.y, 100) });
      } else if (dragStartRef.current) {
        const dx = point.x - dragStartRef.current.point.x;
        const dy = point.y - dragStartRef.current.point.y;
        props.updateAttributes({
          startX: clamp(dragStartRef.current.start.x + dx, 200),
          startY: clamp(dragStartRef.current.start.y + dy, 100),
          endX: clamp(dragStartRef.current.end.x + dx, 200),
          endY: clamp(dragStartRef.current.end.y + dy, 100),
        });
      }
    };
    const up = () => {
      dragRef.current = null;
      dragStartRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const headAngle = Math.atan2(attrs.endY - attrs.startY, attrs.endX - attrs.startX);
  const head = 12;

  return (
    <NodeViewWrapper className="shape-node" contentEditable={false}>
      <button type="button" className="shape-delete" title="删除此箭头" onClick={() => props.deleteNode()}>
        ×
      </button>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${ARROW_VIEW_BOX.width} ${ARROW_VIEW_BOX.height}`}
        width="100%"
        height="90"
        onPointerDown={(event) => startDrag(event, "move")}
      >
        <line x1={attrs.startX} y1={attrs.startY} x2={attrs.endX} y2={attrs.endY} stroke={attrs.color} strokeWidth="4" />
        <polygon
          points={`${attrs.endX},${attrs.endY} ${attrs.endX - head * Math.cos(headAngle - Math.PI / 7)},${attrs.endY - head * Math.sin(headAngle - Math.PI / 7)} ${attrs.endX - head * Math.cos(headAngle + Math.PI / 7)},${attrs.endY - head * Math.sin(headAngle + Math.PI / 7)}`}
          fill={attrs.color}
        />
        <circle cx={attrs.startX} cy={attrs.startY} r="7" fill="#fff" stroke={attrs.color} strokeWidth="3" onPointerDown={(event) => startDrag(event, "start")} />
        <circle cx={attrs.endX} cy={attrs.endY} r="7" fill="#fff" stroke={attrs.color} strokeWidth="3" onPointerDown={(event) => startDrag(event, "end")} />
      </svg>
    </NodeViewWrapper>
  );
}

function CurveView(props: any) {
  const dragRef = useRef<"start" | "control" | "end" | "move" | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragStartRef = useRef<{ point: { x: number; y: number }; start: { x: number; y: number }; control: { x: number; y: number }; end: { x: number; y: number } } | null>(null);
  const attrs = props.node.attrs;

  const startDrag = (event: React.PointerEvent, type: "start" | "control" | "end" | "move") => {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = type;
    const svg = svgRef.current;
    if (type === "move" && svg) {
      dragStartRef.current = {
        point: toViewPoint(event.nativeEvent, svg),
        start: { x: attrs.startX, y: attrs.startY },
        control: { x: attrs.controlX, y: attrs.controlY },
        end: { x: attrs.endX, y: attrs.endY },
      };
    }
    const move = (moveEvent: PointerEvent) => {
      const svg = svgRef.current;
      if (!svg || !dragRef.current) return;
      const point = toViewPoint(moveEvent, svg);
      if (dragRef.current === "start") {
        props.updateAttributes({ startX: clamp(point.x, 200), startY: clamp(point.y, 100) });
      } else if (dragRef.current === "control") {
        props.updateAttributes({ controlX: clamp(point.x, 200), controlY: clamp(point.y, 100) });
      } else if (dragRef.current === "end") {
        props.updateAttributes({ endX: clamp(point.x, 200), endY: clamp(point.y, 100) });
      } else if (dragStartRef.current) {
        const dx = point.x - dragStartRef.current.point.x;
        const dy = point.y - dragStartRef.current.point.y;
        props.updateAttributes({
          startX: clamp(dragStartRef.current.start.x + dx, 200),
          startY: clamp(dragStartRef.current.start.y + dy, 100),
          controlX: clamp(dragStartRef.current.control.x + dx, 200),
          controlY: clamp(dragStartRef.current.control.y + dy, 100),
          endX: clamp(dragStartRef.current.end.x + dx, 200),
          endY: clamp(dragStartRef.current.end.y + dy, 100),
        });
      }
    };
    const up = () => {
      dragRef.current = null;
      dragStartRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <NodeViewWrapper className="shape-node" contentEditable={false}>
      <button type="button" className="shape-delete" title="删除此曲线" onClick={() => props.deleteNode()}>
        ×
      </button>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${ARROW_VIEW_BOX.width} ${ARROW_VIEW_BOX.height}`}
        width="100%"
        height="90"
        onPointerDown={(event) => startDrag(event, "move")}
      >
        <path d={`M ${attrs.startX} ${attrs.startY} Q ${attrs.controlX} ${attrs.controlY} ${attrs.endX} ${attrs.endY}`} fill="none" stroke={attrs.color} strokeWidth="4" />
        <circle cx={attrs.startX} cy={attrs.startY} r="7" fill="#fff" stroke={attrs.color} strokeWidth="3" onPointerDown={(event) => startDrag(event, "start")} />
        <circle cx={attrs.controlX} cy={attrs.controlY} r="7" fill={attrs.color} stroke="#fff" strokeWidth="3" onPointerDown={(event) => startDrag(event, "control")} />
        <circle cx={attrs.endX} cy={attrs.endY} r="7" fill="#fff" stroke={attrs.color} strokeWidth="3" onPointerDown={(event) => startDrag(event, "end")} />
      </svg>
    </NodeViewWrapper>
  );
}

function clamp(value: number, max: number) {
  return Math.max(0, Math.min(max, value));
}
