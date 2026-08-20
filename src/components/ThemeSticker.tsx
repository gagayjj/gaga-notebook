import { currentThemeImage } from "../themeImages";

export function ThemeSticker({ className }: { className?: string }) {
  return <img className={`theme-sticker ${className || ""}`} src={currentThemeImage()} alt="" draggable={false} />;
}

export function ThemeBanner({ className }: { className?: string }) {
  return (
    <div className={`theme-banner ${className || ""}`}>
      <img src={currentThemeImage()} alt="" draggable={false} />
    </div>
  );
}
