import { CheckCircle2, History, Loader2, Mic, RefreshCw, TriangleAlert } from "lucide-react";

export type SaveState = "idle" | "saving" | "saved" | "error";

interface StatusBarProps {
  saveState: SaveState;
  isRecording: boolean;
  videoLabel: string;
  noteTitle: string;
  onRetrySave: () => void;
  /** 历史记录：可回退的条数与回调（桌面端） */
  canUndoHistory?: boolean;
  historyLabel?: string;
  onUndoHistory?: () => void;
}

export function StatusBar({
  saveState,
  isRecording,
  videoLabel,
  noteTitle,
  onRetrySave,
  canUndoHistory,
  historyLabel,
  onUndoHistory,
}: StatusBarProps) {
  return (
    <footer className="status-bar">
      <div className="status-left">
        {isRecording ? (
          <span className="status-recording">
            <Mic size={13} />
            正在录音
          </span>
        ) : (
          <span>{videoLabel || "未打开视频"}</span>
        )}
        <span className="status-sep">|</span>
        <span className="status-note">{noteTitle || "未选择笔记"}</span>
      </div>
      <div className="status-right">
        {canUndoHistory && onUndoHistory && (
          <button type="button" className="status-history-btn" title="回到这条笔记的上一个保存记录" onClick={onUndoHistory}>
            <History size={13} />
            {historyLabel || "返回上一记录"}
          </button>
        )}
        {saveState === "saving" && (
          <span>
            <Loader2 size={13} className="spin" />
            保存中
          </span>
        )}
        {saveState === "saved" && (
          <span>
            <CheckCircle2 size={13} />
            已保存
          </span>
        )}
        {saveState === "error" && (
          <button type="button" className="status-error" onClick={onRetrySave}>
            <TriangleAlert size={13} />
            保存失败，点击重试
            <RefreshCw size={12} />
          </button>
        )}
      </div>
    </footer>
  );
}
