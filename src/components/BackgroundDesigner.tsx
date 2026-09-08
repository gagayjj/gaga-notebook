import { useRef, useState } from "react";
import { Brush, Check, RotateCcw, X } from "lucide-react";
import { themeImages } from "../themeImages";
import { appThemes } from "../themes";

export interface BackgroundConfig {
  image: string | null;
  customImage?: string | null;
  fill: boolean;
  baseColor: string;
  decor: string[];
  patternOpacity: number;
  motion: "none" | "slide" | "drag";
  offsetX: number;
  offsetY: number;
}

interface BackgroundDesignerProps {
  config: BackgroundConfig;
  onSave: (config: BackgroundConfig) => void;
  onPreview: (config: BackgroundConfig) => void;
  onClose: () => void;
}

export function defaultBackgroundConfig(): BackgroundConfig {
  return {
    image: null,
    customImage: null,
    fill: true,
    baseColor: "",
    decor: [],
    patternOpacity: 0.3,
    motion: "slide",
    offsetX: 50,
    offsetY: 50,
  };
}

export function loadBackgroundConfig(): BackgroundConfig {
  try {
    const parsed = JSON.parse(localStorage.getItem("background-config") || "null");
    if (parsed && typeof parsed === "object") {
      return {
        image: parsed.image || null,
        customImage: parsed.customImage || null,
        fill: true,
        baseColor: parsed.baseColor || "",
        decor: Array.isArray(parsed.decor) ? parsed.decor : [],
        patternOpacity: typeof parsed.patternOpacity === "number" ? parsed.patternOpacity : 0.3,
        motion: parsed.motion || "slide",
        offsetX: typeof parsed.offsetX === "number" ? parsed.offsetX : 50,
        offsetY: typeof parsed.offsetY === "number" ? parsed.offsetY : 50,
      };
    }
  } catch {
    // fall through to default
  }
  return defaultBackgroundConfig();
}

export function BackgroundDesigner({ config, onSave, onPreview, onClose }: BackgroundDesignerProps) {
  const [draft, setDraft] = useState<BackgroundConfig>(config);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const updateDraft = (next: BackgroundConfig) => {
    setDraft(next);
    onPreview(next);
  };

  const acceptFile = (file: File | undefined | null) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        updateDraft({ ...draft, image: "custom", customImage: reader.result });
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="bg-designer">
        <header className="resource-header">
          <div className="theme-picker-title">
            <Brush size={17} />
            <strong>设计自己的背景</strong>
          </div>
          <button type="button" className="icon-btn" title="关闭" onClick={onClose}>
            <X size={17} />
          </button>
        </header>

        <div className="bg-designer-body">
          <section>
            <h3>背景图片</h3>
            <div className="bg-image-grid">
              <button
                type="button"
                className={`bg-image-card ${draft.image === null ? "active" : ""}`}
                onClick={() => updateDraft({ ...draft, image: null, customImage: null, fill: false })}
              >
                <span className="bg-image-empty">无图片</span>
                {draft.image === null && <Check size={16} />}
              </button>
              {Object.entries(themeImages).map(([id, src]) => (
                <button
                  type="button"
                  key={id}
                  className={`bg-image-card ${draft.image === id ? "active" : ""}`}
                  onClick={() => updateDraft({ ...draft, image: id, customImage: null })}
                >
                  <img src={src} alt="" draggable={false} />
                  {draft.image === id && <Check size={16} />}
                </button>
              ))}
              <button
                type="button"
                className={`bg-image-card ${draft.image === "custom" ? "active" : ""}`}
                onClick={() => fileInputRef.current?.click()}
              >
                {draft.customImage ? (
                  <img src={draft.customImage} alt="" draggable={false} />
                ) : (
                  <span className="bg-image-empty">上传图片</span>
                )}
                {draft.image === "custom" && <Check size={16} />}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => acceptFile(event.target.files?.[0])}
              />
            </div>
          </section>

          <section>
            <h3>底色</h3>
            <div className="bg-color-row">
              {appThemes.flatMap((theme) => theme.swatches.slice(0, 1)).map((color) => (
                <button
                  type="button"
                  key={color}
                  className={`color-swatch ${draft.baseColor === color ? "active" : ""}`}
                  style={{ backgroundColor: color }}
                  onClick={() => updateDraft({ ...draft, baseColor: color })}
                />
              ))}
              <input
                type="color"
                value={draft.baseColor || "#fff3d6"}
                onChange={(event) => updateDraft({ ...draft, baseColor: event.target.value })}
                title="自定义底色"
              />
              <button type="button" className="btn ghost small" onClick={() => updateDraft({ ...draft, baseColor: "" })}>
                跟随主题
              </button>
            </div>
          </section>

          <section>
            <h3>背景动效</h3>
            <div className="motion-picker">
              {[
                { id: "none", label: "静态" },
                { id: "slide", label: "缓慢滑动" },
                { id: "drag", label: "可拖动位置" },
              ].map((option) => (
                <button
                  type="button"
                  key={option.id}
                  className={draft.motion === option.id ? "active" : ""}
                  onClick={() => updateDraft({ ...draft, motion: option.id as BackgroundConfig["motion"] })}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {draft.motion === "drag" && (
              <div className="offset-controls">
                <label>
                  左右
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={draft.offsetX}
                    onChange={(event) => updateDraft({ ...draft, offsetX: Number(event.target.value) })}
                  />
                  {draft.offsetX}%
                </label>
                <label>
                  上下
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={draft.offsetY}
                    onChange={(event) => updateDraft({ ...draft, offsetY: Number(event.target.value) })}
                  />
                  {draft.offsetY}%
                </label>
              </div>
            )}
          </section>
        </div>

        <footer className="bg-designer-footer">
          <button type="button" className="btn ghost" onClick={() => updateDraft(defaultBackgroundConfig())}>
            <RotateCcw size={15} />
            恢复默认
          </button>
          <div>
            <button type="button" className="btn ghost" onClick={onClose}>
              取消
            </button>
            <button type="button" className="btn primary" onClick={() => onSave(draft)}>
              应用背景
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
