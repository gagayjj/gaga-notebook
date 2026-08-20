import shin1 from "./assets/themes/shin-1.jpg";
import shin2 from "./assets/themes/shin-2.jpg";
import shin3 from "./assets/themes/shin-3.jpg";
import shin4 from "./assets/themes/shin-4.jpg";

export const themeImages: Record<string, string> = {
  crayon: shin1,
  pink: shin2,
  blue: shin3,
  green: shin4,
};

export function currentThemeImage(): string {
  const theme = document.body.dataset.theme || "crayon";
  return themeImages[theme] || themeImages.crayon;
}
