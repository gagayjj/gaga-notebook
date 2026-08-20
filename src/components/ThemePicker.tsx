import { Check, X } from "lucide-react";
import { CrayonStripe } from "./Doodles";
import { appThemes, type AppTheme } from "../themes";

interface ThemePickerProps {
  currentTheme: string;
  onSelect: (themeId: string) => void;
  onClose: () => void;
}

export function ThemePicker({ currentTheme, onSelect, onClose }: ThemePickerProps) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="theme-picker">
        <header className="resource-header">
          <div className="theme-picker-title">
            <CrayonStripe />
            <strong>选择卡通主题</strong>
          </div>
          <button type="button" className="icon-btn" title="关闭" onClick={onClose}>
            <X size={17} />
          </button>
        </header>
        <div className="theme-grid">
          {appThemes.map((theme: AppTheme) => (
            <button
              type="button"
              key={theme.id}
              className={`theme-card ${currentTheme === theme.id ? "active" : ""}`}
              style={{
                background: `linear-gradient(145deg, ${theme.swatches[0]} 0%, ${theme.swatches[1]} 100%)`,
              }}
              onClick={() => onSelect(theme.id)}
            >
              <div className="theme-preview">
                <img className="theme-preview-img" src={theme.image} alt={theme.name} draggable={false} />
                {currentTheme === theme.id && (
                  <span className="theme-check">
                    <Check size={15} />
                  </span>
                )}
              </div>
              <strong>{theme.name}</strong>
              <span>{theme.description}</span>
              <div className="theme-swatches">
                {theme.swatches.map((color) => (
                  <i key={color} style={{ backgroundColor: color }} />
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
