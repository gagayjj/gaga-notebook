import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import Underline from "@tiptap/extension-underline";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
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
  Palette,
  Quote,
  Redo2,
  Ruler,
  PenTool,
  Square,
  Timer,
  Trash2,
  Undo2,
  Underline as UnderlineIcon,
  X,
} from "lucide-react";
import { AudioBlockNode, ResizableImage, TimestampNode } from "../lib/tiptapNodes";
import { FontSize } from "../lib/fontSize";
import { PaperMarker } from "./PaperMarker";
import { FloatingImageLayer } from "./FloatingImageLayer";
import { useRecorder } from "../hooks/useRecorder";
import type { FloatingImage, InsertRequest, NoteDoc, NoteMarker } from "../types";
import type { OutlineItem } from "./Sidebar";

interface NoteEditorProps {
  note: NoteDoc | null;
  title: string;
  onTitleChange: (title: string) => void;
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
  markers: NoteMarker[];
  onMarkersChange: (markers: NoteMarker[]) => void;
  floatingImages: FloatingImage[];
  onFloatingImagesChange: (images: FloatingImage[]) => void;
}

function normalizeMarkerItems(value: Array<string | NoteMarker> | undefined): NoteMarker[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? { dataUrl: item, width: 0, height: 0 } : item));
}

const highlightColors = [
  { label: "黄色", value: "#fff3a8" },
  { label: "绿色", value: "#b8f2c1" },
  { label: "蓝色", value: "#b8dcff" },
  { label: "粉色", value: "#ffd0e0" },
];

const textColors = [
  { label: "黑色", value: "#111827" },
  { label: "红色", value: "#e5484d" },
  { label: "蓝色", value: "#3b82f6" },
  { label: "绿色", value: "#30a46c" },
  { label: "紫色", value: "#8e4ec6" },
  { label: "橙色", value: "#f59e0b" },
];

export function NoteEditor({
  note,
  title,
  onTitleChange,
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
  markers,
  onMarkersChange,
  floatingImages,
  onFloatingImagesChange,
}: NoteEditorProps) {
  const [showHighlightMenu, setShowHighlightMenu] = useState(false);
  const [paperMarkerOpen, setPaperMarkerOpen] = useState(false);
  const [markersState, setMarkersState] = useState<NoteMarker[]>(markers);
  const [fontSize, setFontSize] = useState("");
  const [textColor, setTextColor] = useState("#111827");
  const [textColorMenuOpen, setTextColorMenuOpen] = useState(false);
  const [colorMenuPos, setColorMenuPos] = useState<{ left: number; top: number } | null>(null);
  const savedSelectionRef = useRef<{ from: number; to: number } | null>(null);
  const textColorWrapRef = useRef<HTMLSpanElement | null>(null);
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
        Underline,
        FontSize,
        TextStyle,
        Color,
        ResizableImage,
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
    onSelectionUpdate: ({ editor: currentEditor }) => {
      setFontSize(currentEditor.getAttributes("fontSize").fontSize || "");
      setTextColor(currentEditor.getAttributes("textStyle").color || "#111827");
      if (!currentEditor.state.selection.empty) {
        savedSelectionRef.current = {
          from: currentEditor.state.selection.from,
          to: currentEditor.state.selection.to,
        };
      }
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
    setMarkersState(normalizeMarkerItems(note.markers ?? (note.marker ? [note.marker] : [])));
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

  const applyFontSize = (value: string) => {
    if (!editor) return;
    if (!editor.state.selection.empty) {
      savedSelectionRef.current = {
        from: editor.state.selection.from,
        to: editor.state.selection.to,
      };
    }
    if (!value) editor.chain().unsetFontSize().run();
    else editor.chain().setFontSize(value).run();
    setFontSize(value);
  };

  const applyTextColor = (value: string) => {
    if (!editor) return;
    if (savedSelectionRef.current) {
      const docSize = editor.state.doc.content.size;
      const from = Math.max(1, Math.min(savedSelectionRef.current.from, docSize - 1));
      const to = Math.max(1, Math.min(savedSelectionRef.current.to, docSize - 1));
      try {
        editor.chain().setTextSelection({ from, to }).setColor(value).run();
      } catch (error) {
        console.error("颜色设置失败", error);
      }
    } else {
      editor.chain().setColor(value).run();
    }
    setTextColor(value);
  };

  const resetTextColor = () => {
    if (!editor) return;
    if (savedSelectionRef.current) {
      const docSize = editor.state.doc.content.size;
      const from = Math.max(1, Math.min(savedSelectionRef.current.from, docSize - 1));
      const to = Math.max(1, Math.min(savedSelectionRef.current.to, docSize - 1));
      try {
        editor.chain().setTextSelection({ from, to }).unsetColor().run();
      } catch (error) {
        console.error("恢复默认颜色失败", error);
      }
    } else {
      editor.chain().unsetColor().run();
    }
    setTextColor("#111827");
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
      <div className="note-title-bar">
        <input value={title} onChange={(event) => onTitleChange(event.target.value)} placeholder="笔记标题" />
      </div>
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
        {toolbarButton("下划线", <UnderlineIcon size={16} />, () => editor?.chain().focus().toggleUnderline().run(), editor?.isActive("underline"))}
        <span className="toolbar-sep" />
        <select
          className="font-size-select"
          value={fontSize}
          title="字号"
          onChange={(event) => applyFontSize(event.target.value)}
        >
          <option value="">字号</option>
          <option value="14px">14</option>
          <option value="16px">16</option>
          <option value="18px">18</option>
          <option value="20px">20</option>
          <option value="24px">24</option>
          <option value="28px">28</option>
          <option value="32px">32</option>
        </select>
        <span ref={textColorWrapRef} className="text-color-wrap">
          {toolbarButton("字体颜色", <Palette size={16} />, () => {
            if (editor && !editor.state.selection.empty) {
              savedSelectionRef.current = {
                from: editor.state.selection.from,
                to: editor.state.selection.to,
              };
            }
            if (textColorMenuOpen) {
              setTextColorMenuOpen(false);
              setColorMenuPos(null);
              return;
            }
            const rect = textColorWrapRef.current?.getBoundingClientRect();
            setColorMenuPos({
              left: Math.max(8, Math.min((rect?.left || 0) - 70, window.innerWidth - 176)),
              top: (rect?.bottom || 0) + 8,
            });
            setTextColorMenuOpen(true);
          }, textColorMenuOpen)}
          {textColorMenuOpen &&
            colorMenuPos &&
            createPortal(
              <div className="text-color-menu text-color-menu-portal" style={{ left: colorMenuPos.left, top: colorMenuPos.top }}>
              {textColors.map((item) => (
                <button
                  type="button"
                  key={item.value}
                  style={{ backgroundColor: item.value }}
                  title={item.label}
                  onClick={() => {
                    applyTextColor(item.value);
                    setTextColorMenuOpen(false);
                  }}
                />
              ))}
              <button
                type="button"
                className="text-color-clear"
                title="恢复默认颜色"
                onClick={() => {
                  resetTextColor();
                  setTextColorMenuOpen(false);
                }}
              >
                默认
              </button>
              </div>,
              document.body,
            )}
        </span>
        {toolbarButton("恢复默认颜色", <X size={16} />, resetTextColor, false, false, "恢复默认字体颜色")}
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
        {markersState.length > 0 &&
          toolbarButton("清除标记", <Trash2 size={16} />, () => {
            setMarkersState([]);
            onMarkersChange([]);
          }, false, false, "清除笔记页上的全部标记")}
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
        <div className={`editor-paper ${lined ? "paper-lined" : ""}`}>
          {paperMarkerOpen && (
            <PaperMarker
              onClose={() => setPaperMarkerOpen(false)}
              onInsert={(dataUrl, width, height) => {
                const next: NoteMarker[] = [...markersState, { dataUrl, width, height }];
                setMarkersState(next);
                onMarkersChange(next);
                setPaperMarkerOpen(false);
              }}
            />
          )}
          {markersState.map((item, index) => (
            <img
              key={`${item.dataUrl}-${index}`}
              className="paper-marker-result"
              src={item.dataUrl}
              alt=""
              draggable={false}
              style={item.width > 0 ? { width: `${item.width}px`, height: `${item.height}px` } : undefined}
            />
          ))}
          {floatingImages.map((image) => (
            <FloatingImageLayer
              key={image.id}
              image={image}
              onUpdate={(updated) =>
                onFloatingImagesChange(floatingImages.map((item) => (item.id === updated.id ? updated : item)))
              }
              onRemove={(id) => onFloatingImagesChange(floatingImages.filter((item) => item.id !== id))}
            />
          ))}
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
