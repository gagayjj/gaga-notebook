import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ExternalLink, FileVideo, Globe, Play, X } from "lucide-react";
import type { VideoState } from "../types";

export interface VideoController {
  getCurrentTime: () => number;
  captureFrame: () => string | null;
}

interface VideoPaneProps {
  videoState: VideoState;
  active: boolean;
  onOpenVideo: (path: string) => void;
  onOpenUrl: (url: string) => void;
  onCloseUrl: () => void;
  onOpenExternal: (url: string) => void;
  onSnapshot: (dataUrl: string) => void;
  onController: (controller: VideoController) => void;
}

export function VideoPane({
  videoState,
  active,
  onOpenVideo,
  onOpenUrl,
  onCloseUrl,
  onOpenExternal,
  onSnapshot,
  onController,
}: VideoPaneProps) {
  const paneRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<{ state: string; message: string } | null>(null);

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  }, []);

  const sendBounds = useCallback(() => {
    const el = stageRef.current;
    const api = window.studyNotes;
    if (!el || !api) return;
    const rect = el.getBoundingClientRect();
    api.setVideoBounds({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
  }, []);

  useEffect(() => {
    const el = paneRef.current;
    if (!el || videoState.kind !== "url" || !active) return;
    sendBounds();
    const observer = new ResizeObserver(sendBounds);
    observer.observe(el);
    return () => observer.disconnect();
  }, [active, sendBounds, videoState.kind]);

  useEffect(() => {
    onController({
      getCurrentTime: () => videoRef.current?.currentTime || 0,
      captureFrame,
    });
  }, [captureFrame, onController]);

  useEffect(() => {
    return window.studyNotes?.onVideoStatus?.((nextStatus) => setStatus(nextStatus));
  }, []);

  const handlePick = async () => {
    const path = await window.studyNotes?.openVideoDialog();
    if (path) onOpenVideo(path);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    const files = Array.from(event.dataTransfer.files);
    const file = files.find((item) => item.type.startsWith("video/"));
    if (file) {
      const path = window.studyNotes?.getPathForFile(file);
      if (path) onOpenVideo(path);
      return;
    }

    const rawUri = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");
    const url = rawUri.split("\n")[0].trim();
    if (/^https?:\/\//i.test(url)) {
      onOpenUrl(url);
    }
  };

  const handleOpenUrl = () => {
    const url = urlInput.trim();
    if (!url) return;
    onOpenUrl(url);
    setUrlInput("");
  };

  const videoUrl = videoState.kind === "local" ? window.studyNotes?.localVideoUrl(videoState.source) : "";

  return (
    <div
      ref={paneRef}
      className={`video-pane ${dragOver ? "drag-over" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="video-toolbar">
        <div className="url-box">
          <Globe size={15} />
          <input
            value={urlInput}
            onChange={(event) => setUrlInput(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && handleOpenUrl()}
            placeholder="粘贴网课链接，回车打开"
          />
          <button type="button" className="icon-btn" title="打开网页" onClick={handleOpenUrl}>
            <Play size={15} />
          </button>
        </div>
        <button type="button" className="text-btn" onClick={handlePick}>
          <FileVideo size={15} />
          打开本地视频
        </button>
        {videoState.kind === "url" && (
          <>
            <span className={`video-status ${status?.state || ""}`}>{status?.message || "正在打开..."}</span>
            <button type="button" className="text-btn" onClick={() => onOpenExternal(videoState.url)}>
              <ExternalLink size={15} />
              外部打开
            </button>
            <button type="button" className="icon-btn" title="关闭网页" onClick={onCloseUrl}>
              <X size={15} />
            </button>
          </>
        )}
      </div>

      <div ref={stageRef} className="video-stage">
        {videoState.kind === "none" && (
          <div className="video-empty" onClick={handlePick}>
            <FileVideo size={34} />
            <p>拖入视频文件，或点击选择本地视频</p>
            <span>B 站等网课：复制地址栏链接，粘贴到上方，或直接把链接拖进来</span>
          </div>
        )}

        {videoState.kind === "local" && (
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            playsInline
            className="local-video"
          />
        )}

        {videoState.kind === "url" && (
          <div className="url-embed">
            <div className="url-embed-mask">
              <span>网页视频已嵌入</span>
            </div>
          </div>
        )}
      </div>

      {videoState.kind === "local" && (
        <button
          type="button"
          className="snapshot-btn"
          title="截取当前视频画面"
          onClick={() => {
            const dataUrl = captureFrame();
            if (dataUrl) onSnapshot(dataUrl);
          }}
        >
          <Camera size={16} />
          截图当前画面
        </button>
      )}
    </div>
  );
}
