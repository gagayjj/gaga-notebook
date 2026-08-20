import {
  FileDown,
  FolderOpen,
  ImagePlus,
  Languages,
  Mic,
  MonitorPlay,
  MonitorX,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Palette,
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
  libraryOpen: boolean;
  englishOpen: boolean;
  themeOpen: boolean;
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
  onToggleLibrary: () => void;
  onToggleEnglish: () => void;
  onToggleTheme: () => void;
}

export function Toolbar({
  narrow,
  alwaysOnTop,
  isRecording,
  sidebarOpen,
  videoOpen,
  libraryOpen,
  englishOpen,
  themeOpen,
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
  onToggleLibrary,
  onToggleEnglish,
  onToggleTheme,
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
        <button
          type="button"
          className={`icon-btn ${libraryOpen ? "active" : ""}`}
          title={libraryOpen ? "关闭资料库" : "打开资料库与学习计划"}
          onClick={onToggleLibrary}
        >
          <FolderOpen size={17} />
        </button>
        <button
          type="button"
          className={`icon-btn ${englishOpen ? "active" : ""}`}
          title={englishOpen ? "关闭每日英语" : "打开每日英语"}
          onClick={onToggleEnglish}
        >
          <Languages size={17} />
        </button>
        <button
          type="button"
          className={`icon-btn ${themeOpen ? "active" : ""}`}
          title={themeOpen ? "关闭主题选择" : "切换卡通主题"}
          onClick={onToggleTheme}
        >
          <Palette size={17} />
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
