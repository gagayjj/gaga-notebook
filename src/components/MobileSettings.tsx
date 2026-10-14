import { useEffect, useRef, useState } from "react";
import { Brush, CheckCircle2, Copy, Palette, QrCode, Eye,
  EyeOff,
  RefreshCw, Trash2, Upload, X } from "lucide-react";
import jsQR from "jsqr";
import type { SyncConfig } from "../types";

// 手机端网页版部署地址（与桌面端共用 Gitee 数据）
const PHONE_WEB_URL = "https://gagayjj.github.io/gaga-notebook/";

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
  const [copied, setCopied] = useState(false);
  const [showToken, setShowToken] = useState(false);
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
      // 先把当前表单值落库，避免只输入没点"保存"导致 token 没存进去（会返回 HTTP 401）
      const saved = await window.studyNotes?.syncSaveConfig(config);
      if (!saved) {
        setStatus("保存配置失败，无法执行同步");
        return;
      }
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

  const copyPhoneUrl = async () => {
    try {
      await navigator.clipboard.writeText(PHONE_WEB_URL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
      window.prompt("复制下面的手机访问地址：", PHONE_WEB_URL);
    }
  };

  // 一键填入并保存默认 Gitee 同步配置，避免用户手填错/填短令牌导致 HTTP 401
  const applyDefaultConfig = async () => {
    const next: SyncConfig = {
      ...config,
      provider: "gitee",
      url: "",
      username: "gagayjj",
      repo: "gaga-study-sync",
      token: "4523e738c6ed3afcb99c9567d672fd31",
      password: "4523e738c6ed3afcb99c9567d672fd31",
      proxy: "",
    };
    setConfig(next);
    const saved = await window.studyNotes?.syncSaveConfig(next);
    setStatus(saved ? "已填入默认配置并保存，点「测试」即可验证连接" : "保存默认配置失败");
  };

  // 复制当前同步配置为 JSON，可在另一台设备生成二维码后用「扫一扫」导入
  const copySyncConfig = async () => {
    const token = config.token || config.password || "";
    const payload: SyncConfig = {
      provider: "gitee",
      url: "",
      username: config.username || "",
      password: token,
      token,
      repo: config.repo || "gaga-study-sync",
      proxy: config.proxy || "",
    };
    const text = JSON.stringify(payload);
    try {
      await navigator.clipboard.writeText(text);
      setStatus("已复制同步配置，可生成二维码或发给另一台设备粘贴导入");
    } catch {
      window.prompt("复制下面的同步配置：", text);
    }
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
        <div className="mobile-input-with-action">
          <input
            value={config.token || config.password}
            type={showToken ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setConfig({ ...config, token: event.target.value, password: event.target.value })}
            placeholder="Gitee 私人令牌（32 位）"
          />
          <button
            type="button"
            className="mobile-input-eye"
            title={showToken ? "隐藏令牌" : "显示令牌以便核对"}
            onClick={() => setShowToken((v) => !v)}
          >
            {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
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
        <div className="mobile-actions mobile-actions-sub">
          <button type="button" className="btn ghost" onClick={() => void applyDefaultConfig()}>
            使用默认配置
          </button>
          <button type="button" className="btn ghost" onClick={() => void copySyncConfig()}>
            <Copy size={15} />
            复制同步配置
          </button>
        </div>
        {status && <p className="mobile-status">{status}</p>}
      </div>

      <div className="mobile-card phone-sync-card">
        <div className="mobile-card-head">
          <strong>手机同步地址</strong>
          <button type="button" className="mini-text-btn" onClick={() => void copyPhoneUrl()}>
            <Copy size={16} />
            {copied ? "已复制" : "复制"}
          </button>
        </div>
        <p className="phone-sync-tip">
          用手机浏览器打开下面的地址，即可使用与电脑完全相同的完整软件；在手机端「我的」里配置 Gitee 同步后，数据自动与电脑互通。
        </p>
        <img className="phone-sync-qr" src="./phone-sync-qr.png" alt="手机访问地址二维码" />
        <p className="phone-sync-note">
          说明：上面的二维码是「手机打开网址」，请用手机相机/浏览器扫码打开软件，<strong>不是</strong>「同步配置」二维码。
          如需在两台设备间迁移同步配置，请点上方「复制同步配置」得到 JSON，生成二维码后用「扫一扫」读取。
        </p>
        <a className="phone-sync-url" href={PHONE_WEB_URL} target="_blank" rel="noreferrer">
          {PHONE_WEB_URL}
        </a>
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
