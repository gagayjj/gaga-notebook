import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { Clock, Mic } from "lucide-react";
import { formatTime } from "./format";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    timestamp: {
      insertTimestamp: (seconds: number) => ReturnType;
    };
    audioBlock: {
      insertAudioBlock: (src: string) => ReturnType;
    };
  }
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
