# 学习笔记

边看视频边记笔记的本地桌面软件，基于 Electron + React + TypeScript + TipTap。

## 运行

```bash
npm install
npm run dev
```

`npm run dev` 会启动 Vite 开发服务器并打开 Electron 窗口。

## 手机版网页

手机版使用同一套 React 应用构建为 PWA，支持 iPhone/Android 添加到主屏幕，并通过 GitHub 私有仓库 `gaga-study-sync` 与电脑全量同步。

```bash
npm run mobile:serve
```

启动后会在本机和局域网地址运行最新构建产物，手机与电脑连同一 Wi-Fi 时可快速预览。

正式公网地址通过 GitHub Pages 部署：

```bash
npm run deploy:mobile   # 会先构建，再部署；需要先 gh auth login
```

部署完成后，手机在任意网络打开 GitHub Pages 网址即可使用，不需要和电脑在同一 Wi-Fi。

## 当前骨架已包含

- 默认只显示居中的笔记本页面，笔记为主
- 笔记库和视频都是可选模块：点按钮展开/收起，可拖拽分隔条
- 窄条模式与窗口置顶
- 本地视频拖入/选择播放，网课链接内置浏览器打开
- 富文本笔记：标题、加粗、列表、代码块、引用、文字高亮
- 视频时间戳、粘贴/拖入图片、截图标注画布、麦克风录音
- 视频标记：一键截取当前画面（本地或网页视频）并做箭头/画笔标注，箭头可拖动伸缩
- 资料库：保存本地文件和课程链接
- 学习计划：每日计划、完成勾选、到点系统提醒
- 课程与笔记列表、大纲、标题/标签搜索
- 自动保存到本地用户数据目录

## 目录

```text
electron/    Electron 主进程与预加载脚本
src/         React 渲染进程
docs/        设计文档
```
