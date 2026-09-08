import { useEffect, useRef, useState } from "react";
import { Brush, CheckCircle2, Palette, QrCode, RefreshCw, Trash2, Upload, X } from "lucide-react";
import jsQR from "jsqr";
import type { SyncConfig } from "../types";

interface MobileSettingsProps {
  onClose: () => void;
  onOpenTheme: () => void;
  onOpenDesigner: () => void;
}

export function MobileSettings({ onClose, onOpenTheme, onOpenDesigner }: MobileSettingsProps) {
  const [config, setConfig] = useState<SyncConfig>({
    provider: "gitee",
    url: "",
    username: "",
    password: "",
    token: "",
    repo: "gaga-study-sync",
    proxy: "",
  });
  const [status, setStatus] = useState("");
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef(0);
  const scanningRef = useRef(false);

  useEffect(() => {
    window.studyNotes?.syncGetConfig().then((value) => {
      if (value) {
        setConfig({
          ...value,
          provider: "gitee",
          repo: value.repo || "gaga-study-sync",
          token: value.token || value.password || "",
          password: value.password || "",
        });
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(frameRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const stopScanning = () => {
    setScanning(false);
    scanningRef.current = false;
    cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const scanQr = async () => {
    setScanning(true);
    scanningRef.current = true;
    setStatus("正在打开摄像头...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      const tick = async () => {
        if (!scanningRef.current) return;
        const canvas = canvasRef.current;
        if (!canvas || !video.videoWidth) {
          frameRef.current = requestAnimationFrame(tick);
          return;
        }
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(video, 0, 0);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
        if (code?.data) {
          try {
            const parsed = JSON.parse(code.data) as SyncConfig;
            const saved = await window.studyNotes?.syncSaveConfig(parsed);
            if (saved) {
              setConfig(saved);
              setStatus("扫码成功，同步配置已填入");
            }
            stopScanning();
            return;
          } catch {
            setStatus("二维码内容不是同步配置");
          }
        }
        frameRef.current = requestAnimationFrame(tick);
      };
      frameRef.current = requestAnimationFrame(tick);
    } catch (error) {
      setStatus("无法打开摄像头，请手动填写同步配置");
      stopScanning();
    }
  };

  const saveConfig = async () => {
    try {
      const saved = await window.studyNotes?.syncSaveConfig(config);
      setStatus(saved ? "同步配置已保存" : "保存失败");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const runAction = async (action: "syncTest" | "syncPull" | "syncPush") => {
    try {
      const result = await window.studyNotes?.[action]();
      if (result) setStatus(result.message);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const clearData = () => {
    if (!window.confirm("确定清空手机上的全部数据吗？")) return;
    localStorage.clear();
    location.reload();
  };

  return (
    <div className="mobile-settings">
      <header className="mobile-settings-head">
        <strong>我的</strong>
        <button type="button" className="icon-btn" title="关闭" onClick={onClose}>
          <X size={18} />
        </button>
      </header>

      <div className="mobile-card">
        <div className="mobile-card-head">
          <strong>Gitee 同步</strong>
          <button type="button" className="mini-text-btn" onClick={() => void scanQr()}>
            <QrCode size={16} />
            扫一扫
          </button>
        </div>
        <input value={config.username} onChange={(event) => setConfig({ ...config, username: event.target.value })} placeholder="Gitee 用户名" />
        <input value={config.repo || "gaga-study-sync"} onChange={(event) => setConfig({ ...config, repo: event.target.value })} placeholder="Gitee 仓库名" />
        <input value={config.token || config.password} type="password" onChange={(event) => setConfig({ ...config, token: event.target.value, password: event.target.value })} placeholder="Gitee 私人令牌" />
        <div className="mobile-actions">
          <button type="button" className="btn primary" onClick={() => void saveConfig()}>
            保存
          </button>
          <button type="button" className="btn" onClick={() => void runAction("syncTest")}>
            测试
          </button>
          <button type="button" className="btn" onClick={() => void runAction("syncPull")}>
            <RefreshCw size={15} />
            拉取
          </button>
          <button type="button" className="btn" onClick={() => void runAction("syncPush")}>
            <Upload size={15} />
            上传
          </button>
        </div>
        {status && <p className="mobile-status">{status}</p>}
      </div>

      {scanning && (
        <div className="qr-scanner">
          <video ref={videoRef} playsInline muted />
          <canvas ref={canvasRef} hidden />
          <button type="button" className="btn danger" onClick={stopScanning}>
            取消
          </button>
        </div>
      )}

      <div className="mobile-card">
        <div className="mobile-card-head">
          <strong>外观</strong>
        </div>
        <div className="mobile-actions">
          <button type="button" className="btn" onClick={onOpenTheme}>
            <Palette size={15} />
            主题
          </button>
          <button type="button" className="btn" onClick={onOpenDesigner}>
            <Brush size={15} />
            背景
          </button>
        </div>
      </div>

      <div className="mobile-card">
        <div className="mobile-card-head">
          <strong>数据</strong>
        </div>
        <div className="mobile-actions">
          <button type="button" className="btn danger" onClick={clearData}>
            <Trash2 size={15} />
            清空本机数据
          </button>
        </div>
        <p className="mobile-status">
          <CheckCircle2 size={14} />
          数据保存在手机浏览器，并通过 Gitee 私有仓库同步
        </p>
      </div>
    </div>
  );
}
