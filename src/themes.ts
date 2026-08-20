import { themeImages } from "./themeImages";

export interface AppTheme {
  id: string;
  name: string;
  description: string;
  swatches: string[];
  image: string;
}

export const appThemes: AppTheme[] = [
  {
    id: "crayon",
    name: "蜡笔黄",
    description: "经典小新风涂鸦",
    swatches: ["#fff3d6", "#ffcf3f", "#e8463a", "#3d2f26"],
    image: themeImages.crayon,
  },
  {
    id: "pink",
    name: "草莓粉",
    description: "粉粉嫩嫩可爱风",
    swatches: ["#ffe9f0", "#ff9ec4", "#e85d94", "#5b3345"],
    image: themeImages.pink,
  },
  {
    id: "blue",
    name: "天空蓝",
    description: "清爽蓝天白云",
    swatches: ["#eaf6ff", "#8fd0ff", "#2f7fd6", "#24445c"],
    image: themeImages.blue,
  },
  {
    id: "green",
    name: "草绿课堂",
    description: "自然课堂元气风",
    swatches: ["#edf8e8", "#9fe28c", "#3d9b50", "#2f4630"],
    image: themeImages.green,
  },
];
