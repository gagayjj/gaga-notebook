import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Mic,
  Quote,
  Redo2,
  Ruler,
  PenTool,
  Square,
  Timer,
  Undo2,
} from "lucide-react";
import { AudioBlockNode, TimestampNode } from "../lib/tiptapNodes";
import { PaperMarker } from "./PaperMarker";
import { useRecorder } from "../hooks/useRecorder";
import type { InsertRequest, NoteDoc } from "../types";
import type { OutlineItem } from "./Sidebar";

interface NoteEditorProps {
  note: NoteDoc | null;
  getVideoTime: () => number;
  canInsertTimestamp: boolean;
  insertRequest: InsertRequest | null;
  onInsertRequestHandled: () => void;
  onContentChange: (content: unknown) => void;
  onOutlineChange: (outline: OutlineItem[]) => void;
  onRecordingChange: (isRecording: boolean) => void;
  onRequestImage: () => void;
  onEditorReady: (editor: Editor | null) => void;
  recorderToggleRef: MutableRefObject<(() => void) | null>;
  lined: boolean;
  onLinedChange: (value: boolean) => void;
}

const highlightColors = [
  { label: "黄色", value: "#fff3a8" },
  { label: "绿色", value: "#b8f2c1" },
  { label: "蓝色", value: "#b8dcff" },
  { label: "粉色", value: "#ffd0e0" },
];

export function NoteEditor({
  note,
  getVideoTime,
  canInsertTimestamp,
  insertRequest,
  onInsertRequestHandled,
  onContentChange,
  onOutlineChange,
  onRecordingChange,
  onRequestImage,
  onEditorReady,
  recorderToggleRef,
  lined,
  onLinedChange,
}: NoteEditorProps) {
  const [showHighlightMenu, setShowHighlightMenu] = useState(false);
  const [paperMarkerOpen, setPaperMarkerOpen] = useState(false);
  const lastNoteIdRef = useRef<string | null>(null);

  const updateOutline = (editor: Editor) => {
    const items: OutlineItem[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "heading") {
        items.push({ text: node.textContent, level: node.attrs.level, pos });
      }
      return true;
    });
    onOutlineChange(items);
  };

  const editor = useEditor({
    extensions: [
      StarterKit,
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      Image.configure({ inline: false, allowBase64: true }),
      Placeholder.configure({ placeholder: "开始记录这节课的重点..." }),
      TimestampNode.configure({
        onSeek: (seconds: number) => {
          const video = document.querySelector("video") as HTMLVideoElement | null;
          if (video) {
            video.currentTime = seconds;
            video.play().catch(() => {});
          }
        },
      }),
      AudioBlockNode,
    ],
    content: note?.content || { type: "doc", content: [{ type: "paragraph" }] },
    editorProps: {
      attributes: { class: "editor-content" },
      handlePaste: (view, event) => {
        const items = Array.from(event.clipboardData?.items || []);
        const image = items.find((item) => item.type.startsWith("image/"));
        if (!image) return false;
        const file = image.getAsFile();
        if (!file) return false;
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result !== "string") return;
          view.dispatch(
            view.state.tr.replaceSelectionWith(
              view.state.schema.nodes.image.create({ src: reader.result }),
            ),
          );
        };
        reader.readAsDataURL(file);
        return true;
      },
      handleDrop: (view, event) => {
        const files = Array.from(event.dataTransfer?.files || []);
        const image = files.find((file) => file.type.startsWith("image/"));
        if (!image) return false;
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result !== "string") return;
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (!pos) return;
          view.dispatch(
            view.state.tr.insert(
              pos.pos,
              view.state.schema.nodes.image.create({ src: reader.result }),
            ),
          );
        };
        reader.readAsDataURL(image);
        return true;
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onContentChange(currentEditor.getJSON());
      updateOutline(currentEditor);
    },
    onCreate: ({ editor: currentEditor }) => {
      updateOutline(currentEditor);
    },
  });

  useEffect(() => {
    onEditorReady(editor || null);
    return () => onEditorReady(null);
  }, [editor, onEditorReady]);

  useEffect(() => {
    if (!editor || !note) return;
    if (lastNoteIdRef.current === note.meta.id) return;
    lastNoteIdRef.current = note.meta.id;
    editor.commands.setContent(note.content || { type: "doc", content: [{ type: "paragraph" }] });
    updateOutline(editor);
  }, [editor, note, onOutlineChange]);

  useEffect(() => {
    if (!editor || !insertRequest) return;
    if (insertRequest.kind === "image") {
      editor.chain().focus().setImage({ src: insertRequest.dataUrl }).run();
      onInsertRequestHandled();
    }
  }, [editor, insertRequest, onInsertRequestHandled]);

  const { isRecording, error, toggle } = useRecorder((dataUrl) => {
    editor?.chain().focus().insertAudioBlock(dataUrl).run();
  });

  useEffect(() => {
    onRecordingChange(isRecording);
  }, [isRecording, onRecordingChange]);

  useEffect(() => {
    recorderToggleRef.current = toggle;
    return () => {
      recorderToggleRef.current = null;
    };
  }, [recorderToggleRef, toggle]);

  const applyHighlight = (color?: string) => {
    if (!editor) return;
    if (color) editor.chain().focus().setHighlight({ color }).run();
    else editor.chain().focus().unsetHighlight().run();
    setShowHighlightMenu(false);
  };

  const toolbarButton = (
    label: string,
    icon: ReactNode,
    onClick: () => void,
    active = false,
    disabled = false,
    title = label,
  ) => (
    <button
      type="button"
      className={`icon-btn ${active ? "active" : ""}`}
      title={title}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {icon}
    </button>
  );

  return (
    <div className="notes-pane">
      <div className="editor-toolbar">
        {toolbarButton("撤销", <Undo2 size={16} />, () => editor?.chain().focus().undo().run(), false, !editor?.can().undo())}
        {toolbarButton("重做", <Redo2 size={16} />, () => editor?.chain().focus().redo().run(), false, !editor?.can().redo())}
        <span className="toolbar-sep" />
        {toolbarButton("一级标题", <Heading1 size={16} />, () => editor?.chain().focus().toggleHeading({ level: 1 }).run(), editor?.isActive("heading", { level: 1 }))}
        {toolbarButton("二级标题", <Heading2 size={16} />, () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), editor?.isActive("heading", { level: 2 }))}
        {toolbarButton("三级标题", <Heading3 size={16} />, () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), editor?.isActive("heading", { level: 3 }))}
        <span className="toolbar-sep" />
        {toolbarButton("加粗", <Bold size={16} />, () => editor?.chain().focus().toggleBold().run(), editor?.isActive("bold"))}
        {toolbarButton("斜体", <Italic size={16} />, () => editor?.chain().focus().toggleItalic().run(), editor?.isActive("italic"))}
        <span className="toolbar-sep" />
        {toolbarButton("无序列表", <List size={16} />, () => editor?.chain().focus().toggleBulletList().run(), editor?.isActive("bulletList"))}
        {toolbarButton("有序列表", <ListOrdered size={16} />, () => editor?.chain().focus().toggleOrderedList().run(), editor?.isActive("orderedList"))}
        {toolbarButton("代码块", <Code2 size={16} />, () => editor?.chain().focus().toggleCodeBlock().run(), editor?.isActive("codeBlock"))}
        {toolbarButton("引用", <Quote size={16} />, () => editor?.chain().focus().toggleBlockquote().run(), editor?.isActive("blockquote"))}
        <span className="toolbar-sep" />
        <div className="highlight-wrap">
          {toolbarButton("文字高亮", <Highlighter size={16} />, () => setShowHighlightMenu((value) => !value), showHighlightMenu)}
          {showHighlightMenu && (
            <div className="highlight-menu">
              {highlightColors.map((color) => (
                <button
                  type="button"
                  key={color.value}
                  style={{ backgroundColor: color.value }}
                  title={color.label}
                  onClick={() => applyHighlight(color.value)}
                />
              ))}
              <button type="button" className="highlight-clear" title="清除高亮" onClick={() => applyHighlight()}>
                清除
              </button>
            </div>
          )}
        </div>
        <span className="toolbar-sep" />
        {toolbarButton("插入时间戳", <Timer size={16} />, () => {
          editor?.chain().focus().insertTimestamp(Math.floor(getVideoTime())).run();
        }, false, !canInsertTimestamp, "插入当前视频时间点")}
        {toolbarButton("插入图片", <ImagePlus size={16} />, onRequestImage, false, false, "插入截图或标注图片")}
        {toolbarButton("标记", <PenTool size={16} />, () => setPaperMarkerOpen(true), false, false, "在整页笔记上随意画箭头和曲线标记")}
        {toolbarButton("横线页面", <Ruler size={16} />, () => onLinedChange(!lined), lined, false, lined ? "关闭横线页面" : "开启横线页面")}
        {toolbarButton(
          isRecording ? "停止录音" : "开始录音",
          isRecording ? <Square size={15} /> : <Mic size={16} />,
          toggle,
          isRecording,
          false,
          isRecording ? "停止录音" : "开始录音",
        )}
      </div>

      {error && <div className="editor-error">{error}</div>}

      <div className="editor-scroll">
        {paperMarkerOpen && (
          <PaperMarker
            onClose={() => setPaperMarkerOpen(false)}
            onInsert={(dataUrl) => {
              editor?.chain().focus().setImage({ src: dataUrl }).run();
              setPaperMarkerOpen(false);
            }}
          />
        )}
        <div className={`editor-paper ${lined ? "paper-lined" : ""}`}>
          {note ? (
            <EditorContent editor={editor} />
          ) : (
            <p className="muted">选择左侧笔记开始记录</p>
          )}
        </div>
      </div>
    </div>
  );
}
