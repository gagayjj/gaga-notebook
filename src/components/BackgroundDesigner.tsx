import { useState } from "react";
import { Brush, Check, RotateCcw, X } from "lucide-react";
import { themeImages } from "../themeImages";
import { appThemes } from "../themes";

export interface BackgroundConfig {
  image: string | null;
  fill: boolean;
  baseColor: string;
  decor: string[];
  patternOpacity: number;
}

interface BackgroundDesignerProps {
  config: BackgroundConfig;
  onSave: (config: BackgroundConfig) => void;
  onClose: () => void;
}

export function defaultBackgroundConfig(): BackgroundConfig {
  return {
    image: null,
    fill: true,
    baseColor: "",
    decor: [],
    patternOpacity: 0.3,
  };
}

export function loadBackgroundConfig(): BackgroundConfig {
  try {
    const parsed = JSON.parse(localStorage.getItem("background-config") || "null");
    if (parsed && typeof parsed === "object") {
      return {
        image: parsed.image || null,
        fill: true,
        baseColor: parsed.baseColor || "",
        decor: Array.isArray(parsed.decor) ? parsed.decor : [],
        patternOpacity: typeof parsed.patternOpacity === "number" ? parsed.patternOpacity : 0.3,
      };
    }
  } catch {
    // fall through to default
  }
  return defaultBackgroundConfig();
}

export function BackgroundDesigner({ config, onSave, onClose }: BackgroundDesignerProps) {
  const [draft, setDraft] = useState<BackgroundConfig>(config);

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
                onClick={() => setDraft((prev) => ({ ...prev, image: null, fill: false }))}
              >
                <span className="bg-image-empty">无图片</span>
                {draft.image === null && <Check size={16} />}
              </button>
              {Object.entries(themeImages).map(([id, src]) => (
                <button
                  type="button"
                  key={id}
                  className={`bg-image-card ${draft.image === id ? "active" : ""}`}
                  onClick={() => setDraft((prev) => ({ ...prev, image: id }))}
                >
                  <img src={src} alt="" draggable={false} />
                  {draft.image === id && <Check size={16} />}
                </button>
              ))}
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
                  onClick={() => setDraft((prev) => ({ ...prev, baseColor: color }))}
                />
              ))}
              <input
                type="color"
                value={draft.baseColor || "#fff3d6"}
                onChange={(event) => setDraft((prev) => ({ ...prev, baseColor: event.target.value }))}
                title="自定义底色"
              />
              <button type="button" className="btn ghost small" onClick={() => setDraft((prev) => ({ ...prev, baseColor: "" }))}>
                跟随主题
              </button>
            </div>
          </section>

        </div>

        <footer className="bg-designer-footer">
          <button type="button" className="btn ghost" onClick={() => setDraft(defaultBackgroundConfig())}>
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
