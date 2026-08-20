const { app, BrowserWindow, BrowserView, ipcMain, dialog, shell, protocol, net } = require("electron");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

let mainWindow = null;
let videoView = null;
let narrowState = null;
let lastVideoFailInfo = null;

const userDataArg = process.argv.find((arg) => arg.startsWith("--user-data-dir="));
if (userDataArg) {
  app.setPath("userData", userDataArg.replace("--user-data-dir=", ""));
}

function getDataDir() {
  const dir = path.join(app.getPath("userData"), "StudyNotes");
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, "notes"), { recursive: true });
  fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
  return dir;
}

function defaultLibrary() {
  const now = new Date().toISOString();
  const courseId = "course-welcome";
  const noteId = "note-welcome";
  return {
    version: 1,
    courses: [
      { id: courseId, name: "示例课程", createdAt: now, noteIds: [noteId] },
    ],
    notes: {
      [noteId]: {
        id: noteId,
        title: "欢迎使用学习笔记",
        courseId,
        tags: ["示例", "新手指引"],
        createdAt: now,
        updatedAt: now,
      },
    },
  };
}

function defaultNote(library) {
  const meta = Object.values(library.notes)[0];
  return {
    meta,
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "欢迎使用学习笔记" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "默认只显示笔记本页面，专注记笔记。所有内容都会自动保存到电脑本地。",
            },
          ],
        },
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "现在可以试试" }],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "点顶部工具栏的视频按钮，再拖入本地视频或粘贴网课链接",
                    },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "播放中点击「插入时间戳」，之后点时间就能跳回去",
                    },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "粘贴截图、拖入图片，或用工具栏给画面做标注",
                    },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "点麦克风开始录音，结束会自动插进笔记",
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "数据保存位置" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "笔记存在应用的用户数据目录下，重启软件不会丢。后续会升级成课程文件夹、全文搜索和 Markdown 导出。",
            },
          ],
        },
      ],
    },
  };
}

async function ensureLibrary() {
  const dir = getDataDir();
  const libPath = path.join(dir, "library.json");
  if (fs.existsSync(libPath)) {
    try {
      return JSON.parse(await fsp.readFile(libPath, "utf8"));
    } catch (error) {
      console.error("读取 library.json 失败，将重建", error);
    }
  }
  const library = defaultLibrary();
  await writeAtomic(libPath, JSON.stringify(library, null, 2));
  const note = defaultNote(library);
  await writeAtomic(path.join(dir, "notes", `${note.meta.id}.json`), JSON.stringify(note, null, 2));
  return library;
}

async function writeAtomic(filePath, data) {
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, data, "utf8");
  await fsp.rename(tmp, filePath);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 760,
    minWidth: 420,
    minHeight: 420,
    title: "学习笔记",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    backgroundColor: "#f4f5f7",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  const captureArg = process.argv.find((arg) => arg.startsWith("--capture="));
  if (captureArg) {
    const outputPath = captureArg.replace("--capture=", "");
    mainWindow.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        try {
          const image = await mainWindow.capturePage();
          fs.writeFileSync(outputPath, image.toPNG());
          console.log(`screenshot saved: ${outputPath}`);
        } catch (error) {
          console.error("screenshot failed", error);
        } finally {
          app.quit();
        }
      }, 2600);
    });
  }

  const qaArg = process.argv.find((arg) => arg.startsWith("--qa-report="));
  if (qaArg) {
    const reportPath = qaArg.replace("--qa-report=", "");
    const errors = [];
    mainWindow.webContents.on("console-message", (_event, level, message) => {
      if (level >= 2) errors.push(message);
    });
    mainWindow.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        try {
          const dom = await mainWindow.webContents.executeJavaScript(`(async () => {
            const rect = (sel) => {
              const el = document.querySelector(sel);
              if (!el) return null;
              const r = el.getBoundingClientRect();
              return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
            };
            const fileTest = await fetch("localvideo://local/" + encodeURIComponent("/tmp/video-test.txt"))
              .then((response) => response.text())
              .catch((error) => "ERR:" + error.message);
            return {
              title: document.title,
              bodyText: document.body.innerText.slice(0, 600),
              buttonCount: document.querySelectorAll("button").length,
              fileTest,
              rects: {
                toolbar: rect(".toolbar"),
                sidebar: rect(".sidebar"),
                video: rect(".video-pane"),
                notes: rect(".notes-pane"),
                status: rect(".status-bar"),
                editor: rect(".editor-content")
              },
              editorHtml: document.querySelector(".editor-content")?.innerHTML.slice(0, 200) || "",
              paperLined: document.querySelector(".editor-paper")?.classList.contains("paper-lined") || false,
              bodyColor: getComputedStyle(document.body).backgroundColor,
              narrow: document.querySelector(".app")?.classList.contains("narrow")
            };
          })()`);
          const narrowDom = await mainWindow.webContents.executeJavaScript(`(async () => {
            document.querySelector('button[title="切换窄条模式"]')?.click();
            await new Promise((resolve) => setTimeout(resolve, 700));
            const rect = (sel) => {
              const el = document.querySelector(sel);
              if (!el) return null;
              const r = el.getBoundingClientRect();
              return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
            };
            const result = {
              narrow: document.querySelector(".app")?.classList.contains("narrow"),
              rects: {
                toolbar: rect(".toolbar"),
                sidebar: rect(".sidebar"),
                video: rect(".video-pane"),
                notes: rect(".notes-pane"),
                status: rect(".status-bar"),
                editor: rect(".editor-content")
              }
            };
            document.querySelector('button[title="退出窄条模式"]')?.click();
            return result;
          })()`);
          const panelDom = await mainWindow.webContents.executeJavaScript(`(async () => {
            document.querySelector('button[title="打开视频模块"]')?.click();
            document.querySelector('button[title="打开笔记库"]')?.click();
            await new Promise((resolve) => setTimeout(resolve, 700));
            const rect = (sel) => {
              const el = document.querySelector(sel);
              if (!el) return null;
              const r = el.getBoundingClientRect();
              return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
            };
            const result = {
              sidebar: rect(".sidebar"),
              video: rect(".video-pane"),
              notes: rect(".notes-pane"),
              editor: rect(".editor-paper"),
            };
            document.querySelector('button[title="关闭视频模块"]')?.click();
            document.querySelector('button[title="收起笔记库"]')?.click();
            return result;
          })()`);
          const urlTest = await mainWindow.webContents.executeJavaScript(`(async () => {
            document.querySelector('button[title="打开视频模块"]')?.click();
            await new Promise((resolve) => setTimeout(resolve, 300));
            const input = document.querySelector(".url-box input");
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
            setter.call(input, "https://www.bilibili.com/");
            input.dispatchEvent(new Event("input", { bubbles: true }));
            document.querySelector(".url-box button")?.click();
            await new Promise((resolve) => setTimeout(resolve, 6000));
            return {
              videoPaneText: document.querySelector(".video-pane")?.innerText.slice(0, 200) || "",
              statusText: document.querySelector(".video-status")?.textContent || "",
            };
          })()`);
          const urlInfo = {
            bounds: videoView?.getBounds(),
            url: videoView?.webContents.getURL(),
            title: videoView?.webContents.getTitle(),
            loading: videoView?.webContents.isLoading(),
            lastVideoFailInfo,
          };
          if (videoView) {
            try {
              const viewImage = await videoView.webContents.capturePage();
              fs.writeFileSync("/tmp/bilibili-embed.png", viewImage.toPNG());
            } catch (error) {
              console.error("capture BrowserView failed", error);
            }
          }
          const saveTest = await mainWindow.webContents.executeJavaScript(`(async () => {
            const note = await window.studyNotes.createNote({ title: "QA 测试笔记" });
            note.content.content.push({ type: "paragraph", content: [{ type: "text", text: "保存成功" }] });
            const saved = await window.studyNotes.saveNote({ id: note.meta.id, content: note.content });
            const read = await window.studyNotes.readNote(note.meta.id);
            return {
              created: note.meta.title,
              saved: Boolean(saved?.ok),
              persisted: JSON.stringify(read?.content || "").includes("保存成功"),
            };
          })()`);
          const image = await mainWindow.capturePage();
          const bitmap = image.toBitmap();
          let min = 255;
          let max = 0;
          let sum = 0;
          let nonzero = 0;
          const total = bitmap.length;
          for (let i = 0; i < total; i += 4) {
            const v = (bitmap[i] + bitmap[i + 1] + bitmap[i + 2]) / 3;
            min = Math.min(min, v);
            max = Math.max(max, v);
            sum += v;
            if (v > 4) nonzero++;
          }
          const report = {
            dom,
            narrowDom,
            panelDom,
            urlTest,
            urlInfo,
            saveTest,
            errors,
            pixels: {
              width: image.getSize().width,
              height: image.getSize().height,
              min,
              max,
              mean: Math.round(sum / (total / 4)),
              nonzeroPixels: nonzero,
              totalPixels: total / 4,
            },
          };
          fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
          console.log(`qa report saved: ${reportPath}`);
        } catch (error) {
          console.error("qa failed", error);
          process.exitCode = 1;
        } finally {
          app.quit();
        }
      }, 2600);
    });
  }
}

function removeVideoView() {
  if (videoView) {
    mainWindow.removeBrowserView(videoView);
    videoView.destroy();
    videoView = null;
  }
}

function sendVideoStatus(state, message) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("video:status", { state, message });
  }
}

function attachVideoViewStatus(view) {
  view.webContents.on("did-start-loading", () => {
    sendVideoStatus("loading", "正在加载网页...");
  });
  view.webContents.on("did-finish-load", () => {
    sendVideoStatus("loaded", "网页已加载，可点击播放");
  });
  view.webContents.on("did-stop-loading", () => {
    sendVideoStatus("loaded", "网页已加载，可点击播放");
  });
  view.webContents.on("did-fail-load", (_event, _code, description) => {
    sendVideoStatus("failed", description || "网页加载失败");
  });
}

ipcMain.handle("window:always-on-top", (_event, flag) => {
  if (mainWindow) mainWindow.setAlwaysOnTop(Boolean(flag));
  return mainWindow ? mainWindow.isAlwaysOnTop() : false;
});

ipcMain.handle("window:narrow", (_event, flag) => {
  if (!mainWindow) return false;
  if (flag && !narrowState) {
    narrowState = mainWindow.getBounds();
    mainWindow.setSize(460, Math.min(narrowState.height, 760));
    mainWindow.setAlwaysOnTop(true);
  } else if (!flag && narrowState) {
    mainWindow.setBounds(narrowState);
    mainWindow.setAlwaysOnTop(false);
    narrowState = null;
  }
  return true;
});

ipcMain.handle("video:open", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "选择课程视频",
    properties: ["openFile"],
    filters: [
      { name: "视频文件", extensions: ["mp4", "mov", "mkv", "webm", "avi", "m4v"] },
      { name: "所有文件", extensions: ["*"] },
    ],
  });
  if (!result.canceled && result.filePaths[0]) return result.filePaths[0];
  return null;
});

ipcMain.handle("video:open-url", (_event, url) => {
  if (!mainWindow) return false;
  if (!/^https?:\/\//i.test(url)) return false;
  if (!videoView) {
    videoView = new BrowserView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    videoView.setBackgroundColor("#0d0f14");
    videoView.webContents.setUserAgent(BROWSER_UA);
    mainWindow.addBrowserView(videoView);
  }
  videoView.webContents.loadURL(url);
  attachVideoViewStatus(videoView);
  return true;
});

ipcMain.handle("video:set-visible", (_event, visible, url) => {
  if (!mainWindow) return false;
  if (visible) {
    if (!videoView) {
      videoView = new BrowserView({
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      videoView.setBackgroundColor("#0d0f14");
      videoView.webContents.setUserAgent(BROWSER_UA);
    }
    if (url && videoView.webContents.getURL() !== url) {
      videoView.webContents.loadURL(url);
      attachVideoViewStatus(videoView);
    }
    mainWindow.addBrowserView(videoView);
  } else if (videoView) {
    mainWindow.removeBrowserView(videoView);
  }
  return true;
});

ipcMain.on("video:bounds", (_event, bounds) => {
  if (!videoView || !mainWindow) return;
  videoView.setBounds({
    x: Math.max(0, Math.round(bounds.x || 0)),
    y: Math.max(0, Math.round(bounds.y || 0)),
    width: Math.max(120, Math.round(bounds.width || 0)),
    height: Math.max(120, Math.round(bounds.height || 0)),
  });
});

ipcMain.on("video:close-url", () => {
  removeVideoView();
});

ipcMain.handle("shell:open-external", (_event, url) => {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  return true;
});

ipcMain.handle("notes:list", async () => ensureLibrary());

ipcMain.handle("notes:read", async (_event, id) => {
  const dir = getDataDir();
  const filePath = path.join(dir, "notes", `${id}.json`);
  try {
    return JSON.parse(await fsp.readFile(filePath, "utf8"));
  } catch (error) {
    console.error("读取笔记失败", error);
    return null;
  }
});

ipcMain.handle("notes:create", async (_event, input) => {
  const dir = getDataDir();
  const library = await ensureLibrary();
  const id = `note-${Date.now()}`;
  const now = new Date().toISOString();
  const courseId = input.courseId || library.courses[0]?.id || "";
  const meta = {
    id,
    title: input.title || "未命名笔记",
    courseId,
    tags: input.tags || [],
    createdAt: now,
    updatedAt: now,
  };
  library.notes[id] = meta;
  const course = library.courses.find((item) => item.id === courseId);
  if (course) course.noteIds.push(id);
  await writeAtomic(path.join(dir, "library.json"), JSON.stringify(library, null, 2));
  const note = { meta, content: { type: "doc", content: [{ type: "paragraph" }] } };
  await writeAtomic(path.join(dir, "notes", `${id}.json`), JSON.stringify(note, null, 2));
  return note;
});

ipcMain.handle("notes:save", async (_event, payload) => {
  const dir = getDataDir();
  const library = await ensureLibrary();
  const now = new Date().toISOString();
  const existing = library.notes[payload.id] || {};
  const meta = {
    ...existing,
    id: payload.id,
    title: payload.title ?? existing.title ?? "未命名笔记",
    tags: payload.tags ?? existing.tags ?? [],
    updatedAt: now,
  };
  library.notes[payload.id] = meta;
  const note = { meta, content: payload.content };
  await writeAtomic(path.join(dir, "library.json"), JSON.stringify(library, null, 2));
  await writeAtomic(path.join(dir, "notes", `${payload.id}.json`), JSON.stringify(note, null, 2));
  return { ok: true, updatedAt: now };
});

protocol.registerSchemesAsPrivileged([
  {
    scheme: "localvideo",
    privileges: { standard: false, stream: true, supportFetchAPI: true, bypassCSP: true },
  },
]);

app.whenReady().then(() => {
  protocol.handle("localvideo", (request) => {
    const url = new URL(request.url);
    const filePath = decodeURIComponent(url.pathname.slice(1));
    return net.fetch(pathToFileURL(filePath).href);
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function pathToFileURL(filePath) {
  const { pathToFileURL: toFileURL } = require("url");
  return toFileURL(filePath);
}
