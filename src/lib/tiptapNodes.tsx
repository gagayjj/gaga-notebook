import { useEffect, useRef, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { Clock, Mic, Trash2 } from "lucide-react";
import { formatTime } from "./format";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    timestamp: {
      insertTimestamp: (seconds: number) => ReturnType;
    };
    audioBlock: {
      insertAudioBlock: (src: string) => ReturnType;
    };
    image: {
      setImage: (attrs: { src: string; width?: number | null; height?: number | null }) => ReturnType;
    };
  }
}

export const ResizableImage = Node.create({
  name: "image",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      src: { default: null },
      width: {
        default: null,
        parseHTML: (element) => Number(element.getAttribute("width")) || null,
        renderHTML: (attributes) => (attributes.width ? { width: attributes.width } : {}),
      },
      height: {
        default: null,
        parseHTML: (element) => Number(element.getAttribute("height")) || null,
        renderHTML: (attributes) => (attributes.height ? { height: attributes.height } : {}),
      },
      x: {
        default: null,
        parseHTML: (element) => (element.dataset.x ? Number(element.dataset.x) : null),
        renderHTML: (attributes) => (attributes.x != null ? { "data-x": String(attributes.x) } : {}),
      },
      y: {
        default: null,
        parseHTML: (element) => (element.dataset.y ? Number(element.dataset.y) : null),
        renderHTML: (attributes) => (attributes.y != null ? { "data-y": String(attributes.y) } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: "img[src]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes)];
  },
  addCommands() {
    return {
      setImage:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});

function ResizableImageView(props: any) {
  const [width, setWidth] = useState<number | null>(Number(props.node.attrs.width) || null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const moveRef = useRef<{ pointerX: number; pointerY: number; x0: number; y0: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const startMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const wrapper = wrapperRef.current;
    const paper = wrapper?.closest(".editor-paper") as HTMLElement | null;
    if (!wrapper || !paper) return;
    const wrapperRect = wrapper.getBoundingClientRect();
    const paperRect = paper.getBoundingClientRect();
    moveRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      x0: props.node.attrs.x ?? wrapperRect.left - paperRect.left,
      y0: props.node.attrs.y ?? wrapperRect.top - paperRect.top,
    };
    document.body.style.overflow = "hidden";
    setDragging(true);
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      const drag = moveRef.current;
      if (!drag) return;
      const x = Math.max(0, Math.round(drag.x0 + moveEvent.clientX - drag.pointerX));
      const y = Math.max(0, Math.round(drag.y0 + moveEvent.clientY - drag.pointerY));
      props.updateAttributes({ x, y });
    };
    const onUp = () => {
      moveRef.current = null;
      setDragging(false);
      document.body.style.overflow = "";
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging]);

  const startResize = (event: React.PointerEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
    document.body.style.overflow = "hidden";
    const img = event.currentTarget.parentElement?.querySelector("img");
    const startX = event.clientX;
    const startWidth = img?.getBoundingClientRect().width || 300;
    const onMove = (moveEvent: PointerEvent) => {
      const next = Math.max(80, startWidth + moveEvent.clientX - startX);
      setWidth(next);
      props.updateAttributes({ width: Math.round(next) });
    };
    const onUp = () => {
      document.body.style.overflow = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const floated = props.node.attrs.x != null && props.node.attrs.y != null;
  const style = floated
    ? { position: "absolute", left: `${props.node.attrs.x}px`, top: `${props.node.attrs.y}px` }
    : {};

  return (
    <NodeViewWrapper
      ref={wrapperRef}
      className={`resizable-image ${props.selected ? "selected" : ""} ${dragging ? "dragging" : ""}`}
      style={style}
      onPointerDown={startMove}
    >
      <img
        src={props.node.attrs.src}
        style={width ? { width: `${width}px` } : undefined}
        draggable={false}
        alt=""
      />
      <button
        type="button"
        className="image-delete-button"
        title="删除图片"
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          props.deleteNode();
        }}
      >
        <Trash2 size={14} />
      </button>
      <span className="image-resize-handle" onPointerDown={startResize} title="拖动调整图片大小" />
    </NodeViewWrapper>
  );
}

export const TimestampNode = Node.create({
  name: "timestamp",
  group: "block",
  atom: true,
  addOptions() {
    return { onSeek: (_seconds: number) => {} };
  },
  addAttributes() {
    return { seconds: { default: 0 } };
  },
  parseHTML() {
    return [{ tag: "div[data-timestamp]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-timestamp": "" })];
  },
  addCommands() {
    return {
      insertTimestamp:
        (seconds) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { seconds: Math.max(0, Math.floor(seconds || 0)) },
          }),
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(TimestampView);
  },
});

function TimestampView(props: any) {
  const seconds = Number(props.node.attrs.seconds || 0);
  const onSeek = props.extension?.options?.onSeek || (() => {});
  return (
    <NodeViewWrapper>
      <button
        type="button"
        className="timestamp-block"
        contentEditable={false}
        onClick={() => onSeek(seconds)}
        title="点击跳转到视频对应位置"
      >
        <Clock size={15} />
        <span>{formatTime(seconds)}</span>
      </button>
    </NodeViewWrapper>
  );
}

export const AudioBlockNode = Node.create({
  name: "audioBlock",
  group: "block",
  atom: true,
  addAttributes() {
    return { src: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "div[data-audio-block]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-audio-block": "" }),
      ["audio", { controls: "true", src: HTMLAttributes.src }],
    ];
  },
  addCommands() {
    return {
      insertAudioBlock:
        (src) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { src } }),
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(AudioBlockView);
  },
});

function AudioBlockView(props: any) {
  return (
    <NodeViewWrapper className="audio-block">
      <Mic size={15} />
      <audio controls src={props.node.attrs.src} />
    </NodeViewWrapper>
  );
}
