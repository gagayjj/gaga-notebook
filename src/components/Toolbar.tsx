import {
  FileDown,
  ImagePlus,
  Mic,
  MonitorPlay,
  MonitorX,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pin,
  PinOff,
  Plus,
  Square,
  Timer,
} from "lucide-react";

interface ToolbarProps {
  narrow: boolean;
  alwaysOnTop: boolean;
  isRecording: boolean;
  sidebarOpen: boolean;
  videoOpen: boolean;
  canInsertTimestamp: boolean;
  onToggleNarrow: () => void;
  onToggleAlwaysOnTop: () => void;
  onInsertTimestamp: () => void;
  onInsertImage: () => void;
  onToggleRecording: () => void;
  onExport: () => void;
  onNewNote: () => void;
  onToggleSidebar: () => void;
  onToggleVideo: () => void;
}

export function Toolbar({
  narrow,
  alwaysOnTop,
  isRecording,
  sidebarOpen,
  videoOpen,
  canInsertTimestamp,
  onToggleNarrow,
  onToggleAlwaysOnTop,
  onInsertTimestamp,
  onInsertImage,
  onToggleRecording,
  onExport,
  onNewNote,
  onToggleSidebar,
  onToggleVideo,
}: ToolbarProps) {
  return (
    <header className="toolbar">
      <div className="toolbar-title">
        <strong>学习笔记</strong>
        <span>{narrow ? "窄条模式" : "专注笔记"}</span>
      </div>

      <div className="toolbar-actions">
        <button type="button" className="icon-btn primary" title="新建笔记" onClick={onNewNote}>
          <Plus size={17} />
        </button>
        <button
          type="button"
          className={`icon-btn ${sidebarOpen ? "active" : ""}`}
          title={sidebarOpen ? "收起笔记库" : "打开笔记库"}
          onClick={onToggleSidebar}
        >
          {sidebarOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
        </button>
        <span className="toolbar-sep" />
        <button
          type="button"
          className="icon-btn"
          title="插入当前视频时间戳"
          disabled={!canInsertTimestamp}
          onClick={onInsertTimestamp}
        >
          <Timer size={17} />
        </button>
        <button type="button" className="icon-btn" title="插入图片或截图标注" onClick={onInsertImage}>
          <ImagePlus size={17} />
        </button>
        <button
          type="button"
          className={`icon-btn ${isRecording ? "recording" : ""}`}
          title={isRecording ? "停止录音" : "开始录音"}
          onClick={onToggleRecording}
        >
          {isRecording ? <Square size={16} /> : <Mic size={17} />}
        </button>
        <span className="toolbar-sep" />
        <button type="button" className="icon-btn" title="导出当前笔记为 HTML" onClick={onExport}>
          <FileDown size={17} />
        </button>
        <span className="toolbar-sep" />
        <button
          type="button"
          className={`icon-btn ${alwaysOnTop ? "active" : ""}`}
          title={alwaysOnTop ? "取消窗口置顶" : "窗口置顶"}
          onClick={onToggleAlwaysOnTop}
        >
          {alwaysOnTop ? <PinOff size={17} /> : <Pin size={17} />}
        </button>
        <button
          type="button"
          className={`icon-btn ${videoOpen ? "active" : ""}`}
          title={videoOpen ? "关闭视频模块" : "打开视频模块"}
          onClick={onToggleVideo}
        >
          {videoOpen ? <MonitorX size={17} /> : <MonitorPlay size={17} />}
        </button>
        <span className="toolbar-sep" />
        <button
          type="button"
          className={`icon-btn ${narrow ? "active" : ""}`}
          title={narrow ? "退出窄条模式" : "切换窄条模式"}
          onClick={onToggleNarrow}
        >
          {narrow ? <PanelRightOpen size={17} /> : <PanelRightClose size={17} />}
        </button>
      </div>
    </header>
  );
}
