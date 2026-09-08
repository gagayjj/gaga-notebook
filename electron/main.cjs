const { app, BrowserWindow, BrowserView, ipcMain, dialog, shell, protocol, net, Notification } = require("electron");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const http = require("http");
const { execFileSync } = require("child_process");
const syncCore = require(path.join(__dirname, "../src/lib/sync-core.cjs"));
const edgeTts = require(path.join(__dirname, "../src/lib/edgeTts.cjs"));

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

let mainWindow = null;
let videoView = null;
let narrowState = null;
let lastVideoFailInfo = null;
let speechSynthId = 0;

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
    resources: [],
    plans: [],
    customWords: [],
    customSentences: [],
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
      const library = JSON.parse(await fsp.readFile(libPath, "utf8"));
      if (!library.resources) library.resources = [];
      if (!library.plans) library.plans = [];
      if (!library.customWords) library.customWords = [];
      if (!library.customSentences) library.customSentences = [];
      let changed = false;
      if (!Array.isArray(library.courses) || library.courses.length === 0) {
        const now = new Date().toISOString();
        library.courses = [{ id: `course-${Date.now()}`, name: "未分类", createdAt: now, noteIds: [] }];
        changed = true;
      }
      if (!library.notes || Object.keys(library.notes).length === 0) {
        const now = new Date().toISOString();
        const course = library.courses[0];
        const noteId = `note-${Date.now()}`;
        const noteMeta = {
          id: noteId,
          title: "未命名笔记",
          courseId: course.id,
          tags: [],
          createdAt: now,
          updatedAt: now,
        };
        library.notes = { ...(library.notes || {}), [noteId]: noteMeta };
        if (course && !course.noteIds.includes(noteId)) course.noteIds.push(noteId);
        await writeAtomic(
          path.join(dir, "notes", `${noteId}.json`),
          JSON.stringify(
            {
              meta: noteMeta,
              content: { type: "doc", content: [{ type: "paragraph" }] },
              markers: [],
              floatingImages: [],
            },
            null,
            2,
          ),
        );
        changed = true;
      }
      if (changed) await writeAtomic(libPath, JSON.stringify(library, null, 2));
      return library;
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
  const tmp = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  await fsp.writeFile(tmp, data, "utf8");
  await fsp.rename(tmp, filePath);
}

const reminderTimers = new Map();

function schedulePlanReminder(plan) {
  const oldTimer = reminderTimers.get(plan.id);
  if (oldTimer) {
    clearTimeout(oldTimer);
    reminderTimers.delete(plan.id);
  }
  if (!plan.remind || !plan.date || !plan.time) return;
  const when = new Date(`${plan.date}T${plan.time}:00`);
  if (Number.isNaN(when.getTime()) || when <= new Date()) return;
  const MAX_TIMEOUT = 2147483647;
  const scheduleNext = () => {
    const delay = when.getTime() - Date.now();
    if (delay <= 0) {
      reminderTimers.delete(plan.id);
      return;
    }
    const timer = setTimeout(() => {
      if (when.getTime() - Date.now() > MAX_TIMEOUT) {
        scheduleNext();
      } else if (Notification.isSupported()) {
        new Notification({ title: "学习计划提醒", body: `${plan.title} 到时间了` }).show();
        reminderTimers.delete(plan.id);
      }
    }, Math.min(delay, MAX_TIMEOUT));
    reminderTimers.set(plan.id, timer);
  };
  scheduleNext();
}

function scheduleAllReminders() {
  ensureLibrary()
    .then((library) => (library.plans || []).forEach(schedulePlanReminder))
    .catch((error) => console.error("schedule reminders failed", error));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 760,
    minWidth: 420,
    minHeight: 420,
    title: "学习笔记",
    icon: path.join(__dirname, "../src/assets/logo.png"),
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

  const qaArg = process.argv.find((arg) => arg.startsWith("--qa-report="));
  const captureArg = process.argv.find((arg) => arg.startsWith("--capture="));
  if (!qaArg && !captureArg) {
    mainWindow.webContents.once("did-finish-load", () => {
      setTimeout(() => {
        pullFromCloud().catch(() => {});
      }, 1000);
    });
  }

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

  if (qaArg) {
    const reportPath = qaArg.replace("--qa-report=", "");
    const errors = [];
    mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
      if (level >= 2) errors.push({ message, line, sourceId });
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
            const scrollEl = document.querySelector(".editor-scroll");
            const narrowScroll = scrollEl
              ? {
                  scrollHeight: scrollEl.scrollHeight,
                  clientHeight: scrollEl.clientHeight,
                  canScroll: scrollEl.scrollHeight > scrollEl.clientHeight + 10,
                  overflowY: getComputedStyle(scrollEl).overflowY,
                }
              : null;
            document.querySelector('button[title="打开笔记库"]')?.click();
            await new Promise((resolve) => setTimeout(resolve, 250));
            const narrowSidebar = rect(".sidebar");
            document.querySelector('button[title="收起笔记库"]')?.click();
            await new Promise((resolve) => setTimeout(resolve, 150));
            document.querySelector('button[title="退出窄条模式"]')?.click();
            return { ...result, narrowSidebarVisible: Boolean(narrowSidebar && narrowSidebar.w > 0), narrowScroll };
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
              framePrefix: (await window.studyNotes.captureVideoFrame())?.slice(0, 30) || "",
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
          const libraryTest = await mainWindow.webContents.executeJavaScript(`(async () => {
            const linkResources = await window.studyNotes.addResourceLink({ url: "https://example.com/resource", title: "QA资料" });
            const noteResources = await window.studyNotes.addResourceNote({ title: "QA直接资料", content: "hello" });
            const noteId = noteResources[noteResources.length - 1].id;
            const noteContent = await window.studyNotes.readResourceNote(noteId);
            const updatedNotes = await window.studyNotes.saveResourceNote(noteId, { title: "QA直接资料2", content: "updated" });
            const savedPlan = await window.studyNotes.savePlan({ title: "QA计划", date: "2026-12-31", time: "23:59", remind: true });
            const list = await window.studyNotes.listPlans();
            const removed = await window.studyNotes.removePlan(savedPlan.plan.id);
            await window.studyNotes.removeResource(linkResources[linkResources.length - 1].id);
            await window.studyNotes.removeResource(noteId);
            document.querySelector('button[title="打开资料库与学习计划"]')?.click();
            await new Promise((resolve) => setTimeout(resolve, 400));
            return {
              resourcesAdded: linkResources.length > 0,
              noteAdded: noteContent === "hello",
              noteUpdated: updatedNotes.some((item) => item.id === noteId && item.title === "QA直接资料2"),
              planSaved: list.some((item) => item.title === "QA计划"),
              planRemoved: !removed.some((item) => item.title === "QA计划"),
              libraryButtonExists: !!document.querySelector('button[title="打开资料库与学习计划"]'),
              backdrops: document.querySelectorAll(".modal-backdrop").length,
              modalExists: !!document.querySelector(".resource-modal"),
              modalText: document.querySelector(".resource-modal")?.innerText.slice(0, 120) || "",
            };
          })()`);
          const englishTest = await mainWindow.webContents.executeJavaScript(`(async () => {
            const addedWords = await window.studyNotes.addWord({
              word: "QAword",
              phonetic: "/qa/",
              meaning: "测试",
              sentence: "This is a QA sentence.",
              sentenceMeaning: "这是测试句。",
            });
            const listedWords = await window.studyNotes.listWords();
            await window.studyNotes.removeWord(addedWords[addedWords.length - 1].id);
            const addedSentences = await window.studyNotes.addSentence({ english: "Practice makes progress.", chinese: "练习带来进步。" });
            const sentenceId = addedSentences[addedSentences.length - 1].id;
            const updatedSentences = await window.studyNotes.updateSentence(sentenceId, {
              words: [{ id: "mw-qa", word: "progress", meaning: "进步" }],
            });
            const listedSentences = updatedSentences;
            document.querySelector('button[title="打开每日英语"]')?.click();
            await new Promise((resolve) => setTimeout(resolve, 400));
            document.querySelectorAll(".english-tabs button")[2]?.click();
            await new Promise((resolve) => setTimeout(resolve, 250));
            const markInputExists = Boolean(document.querySelector(".mark-word-form input"));
            const sentenceCardCount = document.querySelectorAll(".sentence-card").length;
            const sentenceBookText = document.querySelector(".english-modal")?.innerText.slice(0, 260) || "";
            document.querySelector(".plan-switch button:nth-child(2)")?.click();
            await new Promise((resolve) => setTimeout(resolve, 300));
            document.querySelectorAll(".english-tabs button")[3]?.click();
            await new Promise((resolve) => setTimeout(resolve, 200));
            document.querySelectorAll(".dict-mode-switch button")[1]?.click();
            await new Promise((resolve) => setTimeout(resolve, 200));
            await window.studyNotes.removeSentence(sentenceId);
            const voices = window.speechSynthesis?.getVoices?.() || [];
            const enrichedWord = await window.studyNotes.enrichWord("persistent");
            const speechRateControl = Boolean(document.querySelector('.speech-controls input[type="range"]'));
            const speechVoiceControl = Boolean(document.querySelector(".speech-controls select"));
            return {
              ttsAvailable: Boolean(window.speechSynthesis),
              voiceCount: voices.length,
              speechRateControl,
              speechVoiceControl,
              enrichWordWorked: Boolean(enrichedWord?.meaning && enrichedWord?.phonetic && enrichedWord?.sentence),
              wordAdded: listedWords.some((item) => item.word === "QAword"),
              sentenceAdded: listedSentences.some((item) => item.english === "Practice makes progress."),
              sentenceMarkSaved: listedSentences.some((item) => item.id === sentenceId && item.words?.[0]?.word === "progress"),
              sentenceMarkInputExists: markInputExists,
              sentenceCardCount,
              sentenceBookText,
              planSwitchCount: document.querySelectorAll(".plan-switch button").length,
              dictModeCount: document.querySelectorAll(".dict-mode-switch button").length,
              dictSentenceReady: document.querySelector(".english-modal")?.innerText.includes("语句本是空的") || false,
              decorCount: document.querySelectorAll(".doodle-decor").length,
              bannerCount: document.querySelectorAll(".doodle-banner").length,
              bannerSize: (() => {
                const el = document.querySelector(".english-modal .doodle-banner");
                if (!el) return null;
                const rect = el.getBoundingClientRect();
                return { w: Math.round(rect.width), h: Math.round(rect.height) };
              })(),
              notesPattern: getComputedStyle(document.querySelector(".notes-pane"), "::before").backgroundImage.includes("data:image/svg+xml"),
              tabCount: document.querySelectorAll(".english-tabs button").length,
              modalText: document.querySelector(".english-modal")?.innerText.slice(0, 160) || "",
            };
          })()`);
          const dictationRetryTest = await mainWindow.webContents.executeJavaScript(`(async () => {
            if (!document.querySelector(".english-modal")) {
              document.querySelector('button[title="打开每日英语"]')?.click();
            }
            await new Promise((resolve) => setTimeout(resolve, 300));
            Array.from(document.querySelectorAll(".english-tabs button"))
              .find((button) => button.textContent.includes("今日学习"))
              ?.click();
            Array.from(document.querySelectorAll(".plan-switch button"))
              .find((button) => button.textContent.includes("单词计划"))
              ?.click();
            await new Promise((resolve) => setTimeout(resolve, 300));
            const startButton = Array.from(document.querySelectorAll("button"))
              .find((button) => button.textContent.includes("开始默写这"));
            startButton?.click();
            await new Promise((resolve) => setTimeout(resolve, 300));
            let steps = 0;
            while (document.querySelector(".dictation-card") && steps < 20) {
              const input = document.querySelector(".dictation-input");
              if (input) {
                const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
                setter.call(input, "wronganswer");
                input.dispatchEvent(new Event("input", { bubbles: true }));
              }
              Array.from(document.querySelectorAll("button"))
                .find((button) => button.textContent.includes("检查答案"))
                ?.click();
              await new Promise((resolve) => setTimeout(resolve, 100));
              Array.from(document.querySelectorAll("button"))
                .find((button) => button.textContent.includes("下一个") || button.textContent.includes("查看结果"))
                ?.click();
              await new Promise((resolve) => setTimeout(resolve, 120));
              steps += 1;
            }
            const reviewCount = document.querySelectorAll(".dictation-review-row").length;
            const retryButton = Array.from(document.querySelectorAll("button"))
              .find((button) => button.textContent.includes("只默写错的"));
            const retryDisabled = Boolean(retryButton?.disabled);
            retryButton?.click();
            await new Promise((resolve) => setTimeout(resolve, 300));
            const retryProgress = document.querySelector(".dictation-progress")?.textContent || "";
            return {
              reviewCount,
              retryButtonExists: Boolean(retryButton),
              retryDisabled,
              retryStarted: retryProgress.includes("1 /") && retryProgress.includes("/"),
            };
          })()`);
          const themeTest = await mainWindow.webContents.executeJavaScript(`(async () => {
            document.querySelector('button[title="切换卡通主题"]')?.click();
            await new Promise((resolve) => setTimeout(resolve, 300));
            const cards = document.querySelectorAll(".theme-card").length;
            const sticker = document.querySelector(".notes-sticker");
            const previewImages = document.querySelectorAll(".theme-preview-img").length;
            const bannerImages = document.querySelectorAll(".theme-banner img").length;
            document.querySelectorAll(".theme-card")[1]?.click();
            await new Promise((resolve) => setTimeout(resolve, 300));
            const dataTheme = document.body.dataset.theme;
            const bg = getComputedStyle(document.body).backgroundColor;
            document.querySelector(".theme-picker .icon-btn[title='关闭']")?.click();
            return {
              cards,
              dataTheme,
              bg,
              bgImage: getComputedStyle(document.body).backgroundImage,
              bgSize: getComputedStyle(document.body).backgroundSize,
              stickerLoaded: Boolean(sticker && sticker.naturalWidth > 0),
              previewImages,
              bannerImages,
            };
          })()`);
          const designerTest = await mainWindow.webContents.executeJavaScript(`(async () => {
            document.querySelector('button[title="设计自己的背景"]')?.click();
            await new Promise((resolve) => setTimeout(resolve, 300));
            const cards = document.querySelectorAll(".bg-image-card").length;
            const motionButtons = document.querySelectorAll(".motion-picker button").length;
            document.querySelectorAll(".bg-image-card")[1]?.click();
            await new Promise((resolve) => setTimeout(resolve, 150));
            document.querySelectorAll(".motion-picker button")[2]?.click();
            await new Promise((resolve) => setTimeout(resolve, 100));
            const offsetControls = document.querySelectorAll(".offset-controls label").length;
            document.querySelector(".bg-designer-footer .btn.primary")?.click();
            await new Promise((resolve) => setTimeout(resolve, 300));
            return {
              cards,
              uploadCardExists: cards >= 6,
              motionButtons,
              offsetControls,
              motion: document.body.dataset.bgMotion,
              fill: document.body.dataset.bgFill,
              bgImageApplied: getComputedStyle(document.body).backgroundImage.includes("shin"),
              designerClosed: !document.querySelector(".bg-designer"),
            };
          })()`);
          const markerTest = await mainWindow.webContents.executeJavaScript(`(async () => {
            document.querySelector('button[title="插入图片或截图标注"]')?.click();
            await new Promise((resolve) => setTimeout(resolve, 500));
            const modalExists = Boolean(document.querySelector(".annotation-modal"));
            const shapeButtonExists = Boolean(document.querySelector(".shape-menu-wrap button"));
            document.querySelector(".shape-menu-wrap button")?.click();
            await new Promise((resolve) => setTimeout(resolve, 200));
            const shapeCount = document.querySelectorAll(".shape-menu button").length;
            const shapeLabels = Array.from(document.querySelectorAll(".shape-menu button")).map((item) => item.textContent).join(",");
            document.querySelector(".annotation-footer .btn.ghost")?.click();
            return { modalExists, shapeButtonExists, shapeCount, shapeLabels };
          })()`);
          const floatingImageTest = await mainWindow.webContents.executeJavaScript(`(async () => {
            document.querySelector('button[title="插入图片或截图标注"]')?.click();
            await new Promise((resolve) => setTimeout(resolve, 500));
            const input = document.querySelector('.annotation-modal input[type="file"]');
            const source = document.createElement("canvas");
            source.width = 400;
            source.height = 300;
            const sourceCtx = source.getContext("2d");
            sourceCtx.fillStyle = "#3b82f6";
            sourceCtx.fillRect(0, 0, 400, 300);
            const dataUrl = source.toDataURL("image/png");
            const byteString = atob(dataUrl.split(",")[1]);
            const bytes = new Uint8Array(byteString.length);
            for (let i = 0; i < byteString.length; i += 1) bytes[i] = byteString.charCodeAt(i);
            const file = new File([bytes], "qa-image.png", { type: "image/png" });
            const transfer = new DataTransfer();
            transfer.items.add(file);
            input.files = transfer.files;
            input.dispatchEvent(new Event("change", { bubbles: true }));
            await new Promise((resolve) => setTimeout(resolve, 500));
            const canvas = document.querySelector(".annotation-body canvas");
            const rect = canvas?.getBoundingClientRect();
            if (canvas && rect) {
              const fire = (type, x, y) =>
                canvas.dispatchEvent(
                  new PointerEvent(type, { bubbles: true, clientX: rect.left + x, clientY: rect.top + y, pointerId: 7 }),
                );
              fire("pointerdown", 80, 80);
              await new Promise((resolve) => setTimeout(resolve, 80));
              fire("pointermove", 280, 200);
              await new Promise((resolve) => setTimeout(resolve, 80));
              fire("pointerup", 280, 200);
              await new Promise((resolve) => setTimeout(resolve, 200));
            }
            document.querySelector(".annotation-footer .btn.primary")?.click();
            await new Promise((resolve) => setTimeout(resolve, 500));
            const layer = document.querySelector(".floating-image-layer");
            const marks = document.querySelector(".floating-image-marks");
            const handleCount = document.querySelectorAll(".floating-image-handle").length;
            const layerRect = layer?.getBoundingClientRect();
            const layerStyleBefore = layer?.getAttribute("style") || "";
            const marksStyleBefore = marks?.getAttribute("style") || "";
            if (layer && layerRect) {
              layer.dispatchEvent(
                new PointerEvent("pointerdown", {
                  bubbles: true,
                  clientX: layerRect.left + layerRect.width / 2,
                  clientY: layerRect.top + layerRect.height / 2,
                  pointerId: 8,
                }),
              );
              const scrollLockedDuringMove = document.body.style.overflow === "hidden";
              window.dispatchEvent(new PointerEvent("pointermove", { clientX: layerRect.left + layerRect.width / 2 + 80, clientY: layerRect.top + layerRect.height / 2 + 50, pointerId: 8 }));
              window.dispatchEvent(new PointerEvent("pointerup", { clientX: layerRect.left + layerRect.width / 2 + 80, clientY: layerRect.top + layerRect.height / 2 + 50, pointerId: 8 }));
              await new Promise((resolve) => setTimeout(resolve, 300));
              const scrollUnlockedAfterUp = document.body.style.overflow !== "hidden";
              window.__scrollLockCheck = { scrollLockedDuringMove, scrollUnlockedAfterUp };
            }
            const layerStyleAfter = layer?.getAttribute("style") || "";
            const marksStyleAfter = marks?.getAttribute("style") || "";
            const handle = document.querySelector(".floating-image-handle.handle-se");
            const handleRect = handle?.getBoundingClientRect();
            if (handle && handleRect) {
              handle.dispatchEvent(
                new PointerEvent("pointerdown", { bubbles: true, clientX: handleRect.left, clientY: handleRect.top, pointerId: 9 }),
              );
              window.dispatchEvent(new PointerEvent("pointermove", { clientX: handleRect.left + 60, clientY: handleRect.top + 40, pointerId: 9 }));
              window.dispatchEvent(new PointerEvent("pointerup", { clientX: handleRect.left + 60, clientY: handleRect.top + 40, pointerId: 9 }));
              await new Promise((resolve) => setTimeout(resolve, 300));
            }
            const savedLibrary = await window.studyNotes.listNotes();
            const savedNote = await window.studyNotes.readNote(savedLibrary.courses[0]?.noteIds[0]);
            const deleteButton = document.querySelector(".floating-image-layer .floating-image-delete");
            const deleteExists = Boolean(deleteButton);
            deleteButton?.click();
            await new Promise((resolve) => setTimeout(resolve, 300));
            const layerAfterDelete = Boolean(document.querySelector(".floating-image-layer"));
            const savedAfterDelete = await window.studyNotes.readNote(savedLibrary.courses[0]?.noteIds[0]);
            return {
              layerExists: Boolean(layer),
              marksExists: Boolean(marks),
              handleCount,
              moved: layerStyleAfter !== layerStyleBefore,
              marksFixed: marksStyleAfter === marksStyleBefore,
              resized: (document.querySelector(".floating-image-layer")?.getBoundingClientRect().width || 0) > (layerRect?.width || 0),
              savedFloating: (savedNote?.floatingImages || []).length,
              deleteExists,
              removedAfterDelete: !layerAfterDelete,
              savedAfterDelete: (savedAfterDelete?.floatingImages || []).length,
              scrollLockedDuringMove: window.__scrollLockCheck?.scrollLockedDuringMove,
              scrollUnlockedAfterUp: window.__scrollLockCheck?.scrollUnlockedAfterUp,
            };
          })()`);
          const tiptapImageTest = await mainWindow.webContents.executeJavaScript(`(async () => {
            const editorEl = document.querySelector(".ProseMirror");
            const rect = editorEl?.getBoundingClientRect();
            const source = document.createElement("canvas");
            source.width = 240;
            source.height = 160;
            const sourceCtx = source.getContext("2d");
            sourceCtx.fillStyle = "#30a46c";
            sourceCtx.fillRect(0, 0, 240, 160);
            const dataUrl = source.toDataURL("image/png");
            const bytes = Uint8Array.from(atob(dataUrl.split(",")[1]), (char) => char.charCodeAt(0));
            const file = new File([bytes], "drop.png", { type: "image/png" });
            const transfer = new DataTransfer();
            transfer.items.add(file);
            const dropEvent = new DragEvent("drop", {
              bubbles: true,
              cancelable: true,
              dataTransfer: transfer,
              clientX: (rect?.left || 0) + 120,
              clientY: (rect?.top || 0) + 80,
            });
            editorEl?.dispatchEvent(dropEvent);
            await new Promise((resolve) => setTimeout(resolve, 500));
            const node = document.querySelector(".resizable-image");
            const deleteBtn = node?.querySelector(".image-delete-button");
            let moved = false;
            let scrollLocked = false;
            if (node) {
              const nodeRect = node.getBoundingClientRect();
              node.dispatchEvent(
                new PointerEvent("pointerdown", {
                  bubbles: true,
                  clientX: nodeRect.left + 20,
                  clientY: nodeRect.top + 20,
                  pointerId: 11,
                }),
              );
              await new Promise((resolve) => setTimeout(resolve, 80));
              scrollLocked = document.body.style.overflow === "hidden";
              window.dispatchEvent(
                new PointerEvent("pointermove", { clientX: nodeRect.left + 140, clientY: nodeRect.top + 90, pointerId: 11 }),
              );
              const styleDuring = node.getAttribute("style") || "";
              window.dispatchEvent(
                new PointerEvent("pointerup", { clientX: nodeRect.left + 140, clientY: nodeRect.top + 90, pointerId: 11 }),
              );
              await new Promise((resolve) => setTimeout(resolve, 200));
              moved = (node.getAttribute("style") || "") !== styleDuring;
            }
            const deleteExists = Boolean(deleteBtn);
            deleteBtn?.click();
            await new Promise((resolve) => setTimeout(resolve, 300));
            return {
              nodeExists: Boolean(node),
              deleteExists,
              moved,
              scrollLocked,
              removedAfterDelete: !document.querySelector(".resizable-image"),
            };
          })()`);
          const inlineMarkerTest = await mainWindow.webContents.executeJavaScript(`(async () => {
            document.querySelector('button[title="在整页笔记上随意画箭头和曲线标记"]')?.click();
            await new Promise((resolve) => setTimeout(resolve, 400));
            const canvas = document.querySelector(".paper-marker-canvas");
            const rect = canvas?.getBoundingClientRect();
            let drewPixels = 0;
            let nativeFired = false;
            let startPainted = false;
            let endPainted = false;
            if (canvas && rect) {
              const fire = (type, x, y) =>
                canvas.dispatchEvent(
                  new PointerEvent(type, { bubbles: true, clientX: rect.left + x, clientY: rect.top + y, pointerId: 1 }),
                );
              canvas.addEventListener("pointerdown", () => {
                nativeFired = true;
              });
              fire("pointerdown", 120, 120);
              await new Promise((resolve) => setTimeout(resolve, 100));
              fire("pointermove", 360, 360);
              await new Promise((resolve) => setTimeout(resolve, 80));
              fire("pointerup", 360, 360);
              await new Promise((resolve) => setTimeout(resolve, 250));
              const imageData = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
              for (let i = 3; i < imageData.length; i += 4) {
                if (imageData[i] > 0) drewPixels += 1;
              }
              const pixelAt = (x, y) => {
                const index = (Math.round(y * canvas.width) + Math.round(x)) * 4 + 3;
                return imageData[index] > 0;
              };
              startPainted = pixelAt(120, 120);
              endPainted = pixelAt(360, 360);
            }
            const canComplete = Boolean(document.querySelector('.paper-marker-bar button[title="完成标记并固定在笔记页"]'));
            const toolButtons = document.querySelectorAll(".paper-marker-tools button").length;
            const bar = document.querySelector(".paper-marker-bar");
            const barFits = Boolean(bar && bar.scrollWidth <= bar.clientWidth + 1);
            const scrollEl = document.querySelector(".editor-scroll");
            const barRectBefore = bar?.getBoundingClientRect();
            const scrollRect = scrollEl?.getBoundingClientRect();
            scrollEl && (scrollEl.scrollTop = 180);
            await new Promise((resolve) => setTimeout(resolve, 200));
            const barRectAfter = bar?.getBoundingClientRect();
            const barSticks = Boolean(
              barRectBefore &&
                barRectAfter &&
                scrollRect &&
                Math.abs(barRectAfter.top - scrollRect.top) <= 2 &&
                Math.abs(barRectAfter.left - barRectBefore.left) <= 2,
            );
            document.querySelector('.paper-marker-bar button[title="完成标记并固定在笔记页"]')?.click();
            await new Promise((resolve) => setTimeout(resolve, 250));
            return {
              paperMarkerExists: Boolean(document.querySelector(".paper-marker")),
              canvasSize: rect ? { w: Math.round(rect.width), h: Math.round(rect.height) } : null,
              nativeFired,
              drewPixels,
              startPainted,
              endPainted,
              canComplete,
              toolButtons,
              barFits,
              barSticks,
              resultExists: Boolean(document.querySelector(".paper-marker-result")),
              editorImages: document.querySelectorAll(".editor-content img").length,
              closedAfterComplete: !document.querySelector(".paper-marker"),
              toolCount: document.querySelectorAll(".paper-marker-bar button").length,
            };
          })()`);
          const multiMarkerTest = await mainWindow.webContents.executeJavaScript(`(async () => {
            const lib = await window.studyNotes.listNotes();
            const id = lib.courses[0]?.noteIds[0];
            document.querySelector('button[title="在整页笔记上随意画箭头和曲线标记"]')?.click();
            await new Promise((resolve) => setTimeout(resolve, 400));
            const canvas = document.querySelector(".paper-marker-canvas");
            const rect = canvas?.getBoundingClientRect();
            if (canvas && rect) {
              const fire = (type, x, y) =>
                canvas.dispatchEvent(
                  new PointerEvent(type, { bubbles: true, clientX: rect.left + x, clientY: rect.top + y, pointerId: 2 }),
                );
              fire("pointerdown", 80, 300);
              await new Promise((resolve) => setTimeout(resolve, 80));
              fire("pointermove", 280, 300);
              await new Promise((resolve) => setTimeout(resolve, 80));
              fire("pointerup", 280, 300);
              await new Promise((resolve) => setTimeout(resolve, 200));
            }
            document.querySelector('.paper-marker-bar button[title="完成标记并固定在笔记页"]')?.click();
            await new Promise((resolve) => setTimeout(resolve, 400));
            const resultCount = document.querySelectorAll(".paper-marker-result").length;
            const saved = await window.studyNotes.readNote(id);
            return {
              resultCount,
              savedMarkers: (saved?.markers || []).length,
              savedMarkerWidth: saved?.markers?.[0]?.width || 0,
              savedMarkerHeight: saved?.markers?.[0]?.height || 0,
            };
          })()`);
          const markerStableTest = await mainWindow.webContents.executeJavaScript(`(async () => {
            const results = document.querySelectorAll(".paper-marker-result");
            const before = results[0] ? results[0].getBoundingClientRect() : null;
            const editorEl = document.querySelector(".ProseMirror");
            editorEl?.focus();
            document.execCommand("insertText", false, "新增内容撑高页面".repeat(40));
            await new Promise((resolve) => setTimeout(resolve, 300));
            const after = document.querySelectorAll(".paper-marker-result")[0]?.getBoundingClientRect();
            return {
              markerCount: document.querySelectorAll(".paper-marker-result").length,
              before: before ? { w: Math.round(before.width), h: Math.round(before.height) } : null,
              after: after ? { w: Math.round(after.width), h: Math.round(after.height) } : null,
              heightStable: Boolean(before && after && Math.abs(after.height - before.height) < 2),
              widthStable: Boolean(before && after && Math.abs(after.width - before.width) < 2),
            };
          })()`);
          const featureTest = await mainWindow.webContents.executeJavaScript(`(async () => {
            document.querySelectorAll('.modal-backdrop .icon-btn[title="关闭"]').forEach((button) => button.click());
            document.querySelector('button[title="关闭每日英语"]')?.click();
            document.querySelector('button[title="关闭资料库"]')?.click();
            await new Promise((resolve) => setTimeout(resolve, 300));
            if (!document.querySelector(".note-rename-btn")) {
              document.querySelector('button[title="打开笔记库"]')?.click();
              await new Promise((resolve) => setTimeout(resolve, 200));
            }
            document.querySelector('button[title="插入图片或截图标注"]')?.click();
            await new Promise((resolve) => setTimeout(resolve, 400));
            const shapeWrap = document.querySelector(".shape-menu-wrap button");
            const shapeRect = shapeWrap?.getBoundingClientRect();
            shapeWrap?.click();
            await new Promise((resolve) => setTimeout(resolve, 150));
            const menuRect = document.querySelector(".shape-menu")?.getBoundingClientRect();
            const shapeItems = document.querySelectorAll(".shape-menu button").length;
            document.querySelector(".annotation-footer .btn.ghost")?.click();
            const underlineButton = document.querySelector('.editor-toolbar button[title="下划线"]');
            underlineButton?.click();
            await new Promise((resolve) => setTimeout(resolve, 80));
            const underlineActiveAfterClick = underlineButton?.classList.contains("active");
            underlineButton?.click();
            const editorEl = document.querySelector(".ProseMirror");
            editorEl?.focus();
            document.execCommand("insertText", false, "字体测试");
            editorEl.dispatchEvent(
              new KeyboardEvent("keydown", { key: "a", code: "KeyA", metaKey: true, bubbles: true }),
            );
            await new Promise((resolve) => setTimeout(resolve, 80));
            const sizeSelect = document.querySelector(".font-size-select");
            const selectSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
            selectSetter.call(sizeSelect, "24px");
            sizeSelect.dispatchEvent(new Event("change", { bubbles: true }));
            await new Promise((resolve) => setTimeout(resolve, 120));
            const colorButton = document.querySelector('.editor-toolbar button[title="字体颜色"]');
            colorButton?.click();
            await new Promise((resolve) => setTimeout(resolve, 80));
            const menuEl = document.querySelector(".text-color-menu");
            const redSwatch = document.querySelector('.text-color-menu button[title="红色"]');
            const colorMenuRect = menuEl?.getBoundingClientRect();
            const colorMenuStyle = menuEl ? getComputedStyle(menuEl) : null;
            const hitMenu =
              colorMenuRect &&
              document.elementFromPoint(colorMenuRect.left + 18, colorMenuRect.top + 14)?.closest(".text-color-menu");
            const hitElement = colorMenuRect ? document.elementFromPoint(colorMenuRect.left + 18, colorMenuRect.top + 14) : null;
            redSwatch?.click();
            await new Promise((resolve) => setTimeout(resolve, 120));
            const editorHtml = document.querySelector(".editor-content")?.innerHTML || "";
            const courseRenameBtn = document.querySelector(".course-rename-btn");
            const sidebarLib = await window.studyNotes.listNotes();
            const courseBefore = sidebarLib.courses[0]?.name;
            const renamedLib = await window.studyNotes.renameCourse(sidebarLib.courses[0]?.id, "QA分类改名");
            const courseAfter = renamedLib?.courses.find((course) => course.id === sidebarLib.courses[0]?.id)?.name;
            const createdLib = await window.studyNotes.createCourse("QA新建分类");
            const courseCreateWorked = createdLib.courses.some((course) => course.name === "QA新建分类");
            const noteToMove = sidebarLib.courses[0]?.noteIds[0];
            const targetCourse = createdLib.courses.find((course) => course.name === "QA新建分类");
            const moveLib = noteToMove && targetCourse ? await window.studyNotes.moveNote(noteToMove, targetCourse.id) : createdLib;
            const noteMoveWorked =
              Boolean(noteToMove && targetCourse) &&
              moveLib.courses.find((course) => course.id === targetCourse?.id)?.noteIds.includes(noteToMove);
            return {
              shapeButtonVisible:
                Boolean(shapeRect && shapeRect.width > 0 && shapeRect.height > 0 && shapeRect.left >= 0 && shapeRect.right <= window.innerWidth),
              shapeMenuVisible: Boolean(menuRect && menuRect.width > 0 && menuRect.height > 0),
              shapeItems,
              underlineButtonExists: Boolean(underlineButton),
              underlineActiveAfterClick,
              outlineRemoved: !document.querySelector(".outline-list"),
              renameButtonExists: Boolean(document.querySelector(".note-rename-btn")),
              courseRenameBtnExists: Boolean(courseRenameBtn),
              courseRenameWorked: courseAfter === "QA分类改名" && courseBefore !== courseAfter,
              courseCreateWorked,
              noteMoveWorked,
              fontSizeControl: Boolean(sizeSelect),
              colorControl: Boolean(colorButton && redSwatch),
              menuExists: Boolean(menuEl),
              redSwatchExists: Boolean(redSwatch),
              colorMenuVisible: Boolean(hitMenu),
              colorMenuRect: colorMenuRect ? { x: Math.round(colorMenuRect.x), y: Math.round(colorMenuRect.y), w: Math.round(colorMenuRect.width), h: Math.round(colorMenuRect.height) } : null,
              colorMenuDisplay: colorMenuStyle?.display,
              menuHtml: menuEl?.outerHTML.slice(0, 160) || "",
              hitTag: hitElement?.tagName || "",
              hitTitle: hitElement?.getAttribute?.("title") || "",
              fontSizeApplied: editorHtml.includes("font-size: 24px"),
              colorApplied:
                editorHtml.includes("color: rgb(229, 72, 77)") ||
                editorHtml.includes("color:#e5484d") ||
                editorHtml.includes("color: #e5484d"),
              editorHtml: editorHtml.slice(-400),
            };
          })()`);
          const resizeImageTest = await mainWindow.webContents.executeJavaScript(`(async () => {
            const editorEl = document.querySelector(".ProseMirror");
            editorEl?.focus();
            const dt = new DataTransfer();
            dt.items.add(new File([new Uint8Array([137, 80, 78, 71])], "qa.png", { type: "image/png" }));
            const pasteEvent = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
            editorEl.dispatchEvent(pasteEvent);
            await new Promise((resolve) => setTimeout(resolve, 500));
            const wrap = document.querySelector(".resizable-image");
            const handle = document.querySelector(".image-resize-handle");
            let resized = false;
            if (handle && wrap) {
              const img = wrap.querySelector("img");
              const before = img?.getBoundingClientRect().width || 0;
              const handleRect = handle.getBoundingClientRect();
              handle.dispatchEvent(
                new PointerEvent("pointerdown", { bubbles: true, clientX: handleRect.left + 8, clientY: handleRect.top + 8, pointerId: 3 }),
              );
              await new Promise((resolve) => setTimeout(resolve, 50));
              window.dispatchEvent(
                new PointerEvent("pointermove", { bubbles: true, clientX: handleRect.left + 108, clientY: handleRect.top + 8, pointerId: 3 }),
              );
              await new Promise((resolve) => setTimeout(resolve, 50));
              window.dispatchEvent(
                new PointerEvent("pointerup", { bubbles: true, clientX: handleRect.left + 108, clientY: handleRect.top + 8, pointerId: 3 }),
              );
              await new Promise((resolve) => setTimeout(resolve, 150));
              const after = img?.getBoundingClientRect().width || 0;
              resized = after > before + 20;
            }
            return { imageInserted: Boolean(wrap), handleExists: Boolean(handle), resized };
          })()`);
          const narrowVideoTest = await mainWindow.webContents.executeJavaScript(`(async () => {
            document.querySelector('button[title="关闭视频模块"]')?.click();
            await new Promise((resolve) => setTimeout(resolve, 200));
            document.querySelector('button[title="切换窄条模式"]')?.click();
            await new Promise((resolve) => setTimeout(resolve, 600));
            const before = {
              narrow: document.querySelector(".app")?.classList.contains("narrow"),
              videoHidden: document.querySelector(".video-column")?.classList.contains("hidden"),
            };
            document.querySelector('button[title="打开视频模块"]')?.click();
            await new Promise((resolve) => setTimeout(resolve, 600));
            const afterRect = document.querySelector(".video-column")?.getBoundingClientRect();
            return {
              before,
              after: {
                narrow: document.querySelector(".app")?.classList.contains("narrow"),
                videoHidden: document.querySelector(".video-column")?.classList.contains("hidden"),
                videoVisible: Boolean(afterRect && afterRect.width > 0 && afterRect.height > 0),
              },
            };
          })()`);
          const mockBody = { words: [], sentences: [], updatedAt: "2026-08-21T00:00:00.000Z" };
          const mockFiles = {
            "/dav/gaga-study-words.json": JSON.stringify(mockBody),
            "/dav/gaga-study-notes.json": JSON.stringify({ notes: [], updatedAt: "2026-08-21T00:00:00.000Z" }),
            "/dav/gaga-study-data.json": JSON.stringify({
              version: 2,
              updatedAt: "2026-08-21T00:00:00.000Z",
              deviceId: "qa-mock",
              courses: [],
              notes: {},
              resources: [],
              resourceNotes: {},
              plans: [],
              customWords: [],
              customSentences: [],
              tombstones: {},
              assets: {},
            }),
          };
          const mockServer = http.createServer((req, res) => {
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
            res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
            const key = req.url || "/dav/gaga-study-words.json";
            if (req.method === "OPTIONS") {
              res.writeHead(204);
              res.end();
              return;
            }
            if (req.method === "GET") {
              const body = mockFiles[key];
              if (body === undefined) {
                res.writeHead(404);
                res.end("not found");
                return;
              }
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(body);
              return;
            }
            if (req.method === "PUT") {
              let data = "";
              req.on("data", (chunk) => {
                data += chunk;
              });
              req.on("end", () => {
                mockFiles[key] = data;
                res.writeHead(201);
                res.end("ok");
              });
              return;
            }
            res.writeHead(405);
            res.end();
          });
          await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
          const mockPort = mockServer.address().port;
          await fsp.writeFile(
            getSyncConfigPath(),
            JSON.stringify({
              provider: "github",
              url: "",
              username: "gagayjj",
              password: "",
              token: "",
              repo: "gaga-study-sync-test",
              proxy: "",
            }),
          );
          const syncTest = await mainWindow.webContents.executeJavaScript(`(async () => {
            const added = await window.studyNotes.addWord({
              word: "QAsync",
              phonetic: "/qa/",
              meaning: "同步测试",
              sentence: "Sync works.",
              sentenceMeaning: "同步正常。",
            });
            const testResult = await window.studyNotes.syncTest();
            const pushResult = await window.studyNotes.syncPush();
            const pullResult = await window.studyNotes.syncPull();
            const words = await window.studyNotes.listWords();
            const synced = words.some((item) => item.word === "QAsync" && item.meaning === "同步测试");
            await window.studyNotes.removeWord(added[added.length - 1].id);
            const noteCreated = await window.studyNotes.createNote({ title: "QA笔记同步" });
            noteCreated.content.content.push({ type: "paragraph", content: [{ type: "text", text: "同步正文测试" }] });
            await window.studyNotes.saveNote({ id: noteCreated.meta.id, content: noteCreated.content });
            const notePush = await window.studyNotes.syncPushNotes();
            const notePull = await window.studyNotes.syncPullNotes();
            const noteReadBack = await window.studyNotes.readNote(noteCreated.meta.id);
            const noteSynced = JSON.stringify(noteReadBack?.content || "").includes("同步正文测试");
            return {
              testResult,
              pushResult,
              pullResult,
              wordCount: words.length,
              synced,
              notePush,
              notePull,
              noteSynced,
            };
          })()`);
          const mobileSyncTest = await (async () => {
            const mobileWin = new BrowserWindow({
              show: false,
              width: 420,
              height: 800,
              webPreferences: { nodeIntegration: false, contextIsolation: true },
            });
            await mobileWin.loadFile(path.join(__dirname, "../dist/index.html"));
            await mobileWin.webContents.executeJavaScript(
              `localStorage.setItem("gaga-web-sync-config", JSON.stringify({ provider: "webdav", url: "http://127.0.0.1:${mockPort}/dav", username: "qa", password: "qa", proxy: "" })); location.reload(); true`,
            );
            await new Promise((resolve) => mobileWin.webContents.once("did-finish-load", resolve));
            await new Promise((resolve) => setTimeout(resolve, 500));
            const result = await mobileWin.webContents.executeJavaScript(`(async () => {
              const defaultTab = document.querySelector(".mobile-nav button.active span")?.textContent || "";
              const api = window.studyNotes;
              await api.syncPull();
              const pulled = await api.listWords();
              await api.addWord({ word: "MobileSync", meaning: "手机同步" });
              await api.syncPush();
              const localWords = await api.listWords();
              return {
                defaultTab,
                pulledQaWord: pulled.some((item) => item.word === "QAsync"),
                mobileWordAdded: localWords.some((item) => item.word === "MobileSync"),
                status: "ok",
              };
            })()`);
            mobileWin.destroy();
            return { ...result, remoteHasMobileWord: mockFiles["/dav/gaga-study-data.json"].includes("MobileSync") };
          })();
          const webBuildTest = await (async () => {
            const win = new BrowserWindow({
              show: false,
              width: 420,
              height: 800,
              webPreferences: { nodeIntegration: false, contextIsolation: true },
            });
            await win.loadFile(path.join(__dirname, "../dist/index.html"));
            await new Promise((resolve) => setTimeout(resolve, 900));
            const result = await win.webContents.executeJavaScript(`(async () => {
              const api = window.studyNotes;
              const lib = await api.listNotes();
              const note = await api.createNote({ title: "网页版测试" });
              await api.saveNote({
                id: note.meta.id,
                title: "网页版测试",
                content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "网页版正文" }] }] },
              });
              const read = await api.readNote(note.meta.id);
              return {
                apiExists: Boolean(api),
                toolbarExists: Boolean(document.querySelector(".toolbar")),
                editorExists: Boolean(document.querySelector(".ProseMirror")),
                noteCreated: Boolean(read && JSON.stringify(read.content).includes("网页版正文")),
                courseCount: lib.courses.length,
              };
            })()`);
            win.destroy();
            return result;
          })();
          const noteDeleteTest = await mainWindow.webContents.executeJavaScript(`(async () => {
            const lib = await window.studyNotes.listNotes();
            const target = lib.courses[0];
            const targetId = target?.noteIds[0];
            const otherId = target?.noteIds.find((id) => id !== targetId);
            if (targetId) await window.studyNotes.removeNote(targetId);
            const saved = await window.studyNotes.listNotes();
            const noteFile = targetId ? await window.studyNotes.readNote(targetId) : null;
            const savedCourse = saved.courses[0];
            return {
              deleted: targetId ? !saved.notes[targetId] : true,
              otherKept: otherId ? Boolean(saved.notes[otherId]) : true,
              courseUpdated: savedCourse ? !savedCourse.noteIds.includes(targetId) : true,
              fileGone: targetId ? !noteFile : true,
            };
          })()`);
          const courseDeleteTest = await mainWindow.webContents.executeJavaScript(`(async () => {
            const lib = await window.studyNotes.listNotes();
            const target = lib.courses[0];
            const firstNoteId = target?.noteIds[0];
            const removed = target ? await window.studyNotes.removeCourse(target.id) : lib;
            const saved = await window.studyNotes.listNotes();
            const noteFile = firstNoteId ? await window.studyNotes.readNote(firstNoteId) : null;
            return {
              courseRemoved: !saved.courses.some((course) => course.id === target?.id),
              noteRemoved: !saved.notes[firstNoteId],
              noteFileGone: firstNoteId ? !noteFile : true,
              remainingCourses: saved.courses.length,
              defaultNoteCreated: Object.keys(saved.notes).length > 0,
            };
          })()`);
          await new Promise((resolve) => mockServer.close(resolve));
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
            libraryTest,
            englishTest,
            dictationRetryTest,
            themeTest,
            designerTest,
            markerTest,
            floatingImageTest,
            tiptapImageTest,
            inlineMarkerTest,
            multiMarkerTest,
            resizeImageTest,
            markerStableTest,
            featureTest,
            narrowVideoTest,
            syncTest,
            mobileSyncTest,
            webBuildTest,
            noteDeleteTest,
            courseDeleteTest,
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

ipcMain.handle("video:capture-frame", async () => {
  if (!videoView) return null;
  try {
    const image = await videoView.webContents.capturePage();
    return image.toDataURL();
  } catch (error) {
    console.error("capture video frame failed", error);
    return null;
  }
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

ipcMain.handle("speech:speak", async (_event, text, options) => {
  const content = String(text || "");
  if (!content.trim()) return { ok: false, error: "没有可朗读的内容" };
  const requestId = ++speechSynthId;
  try {
    const audio = await edgeTts.synthesize(content, {
      voice: options?.voice,
      rate: Number(options?.rate) || 0.6,
    });
    if (requestId !== speechSynthId || audio.length === 0) {
      return { ok: false, stopped: true };
    }
    return { ok: true, audioBase64: audio.toString("base64") };
  } catch (error) {
    console.error("Edge TTS failed", error);
    return {
      ok: false,
      error: "朗读需要联网生成真人感语音，请检查网络后重试",
    };
  }
});

ipcMain.on("speech:stop", () => {
  speechSynthId += 1;
});

ipcMain.handle("notes:list", async () => ensureLibrary());

ipcMain.handle("notes:read", async (_event, id) => {
  const dir = getDataDir();
  const filePath = path.join(dir, "notes", `${id}.json`);
  try {
    return JSON.parse(await fsp.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") console.error("读取笔记失败", error);
    return null;
  }
});

ipcMain.handle("notes:create", async (_event, input) => {
  const dir = getDataDir();
  const library = await ensureLibrary();
  const id = `note-${Date.now()}`;
  const now = new Date().toISOString();
  const courseId = input.courseId || library.courses[0]?.id || "";
  if (!library.courses.some((item) => item.id === courseId) && library.courses.length === 0) {
    library.courses.push({ id: `course-${Date.now()}`, name: "未分类", createdAt: now, updatedAt: now, noteIds: [] });
  }
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
  const note = {
    meta,
    content: { type: "doc", content: [{ type: "paragraph" }] },
    markers: [],
    floatingImages: [],
  };
  await writeAtomic(path.join(dir, "notes", `${id}.json`), JSON.stringify(note, null, 2));
  void pushFullSync();
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
  const note = {
    meta,
    content: payload.content,
    markers: Array.isArray(payload.markers) ? payload.markers : [],
    floatingImages: Array.isArray(payload.floatingImages) ? payload.floatingImages : [],
  };
  await writeAtomic(path.join(dir, "library.json"), JSON.stringify(library, null, 2));
  await writeAtomic(path.join(dir, "notes", `${payload.id}.json`), JSON.stringify(note, null, 2));
  void pushFullSync();
  return { ok: true, updatedAt: now };
});

ipcMain.handle("notes:move", async (_event, noteId, courseId) => {
  const dataDir = getDataDir();
  const library = await ensureLibrary();
  const meta = library.notes[noteId];
  const course = library.courses.find((item) => item.id === courseId);
  if (!meta || !course) return library;
  library.courses.forEach((entry) => {
    entry.noteIds = entry.noteIds.filter((id) => id !== noteId);
  });
  meta.courseId = courseId;
  meta.updatedAt = new Date().toISOString();
  if (!course.noteIds.includes(noteId)) course.noteIds.push(noteId);
  try {
    const notePath = path.join(dataDir, "notes", `${noteId}.json`);
    const note = JSON.parse(await fsp.readFile(notePath, "utf8"));
    note.meta.courseId = courseId;
    await writeAtomic(notePath, JSON.stringify(note, null, 2));
  } catch {
    // note file is managed by the renderer and will be updated on next save.
  }
  await writeAtomic(path.join(dataDir, "library.json"), JSON.stringify(library, null, 2));
  void pushFullSync();
  return library;
});

ipcMain.handle("courses:remove", async (_event, courseId) => {
  const dataDir = getDataDir();
  const library = await ensureLibrary();
  const course = library.courses.find((item) => item.id === courseId);
  if (!course) return library;
  const now = new Date().toISOString();
  syncCore.markDeleted(library, syncCore.TYPES.course, courseId, now);
  for (const noteId of course.noteIds || []) {
    syncCore.markDeleted(library, syncCore.TYPES.note, noteId, now);
    delete library.notes[noteId];
    await fsp.unlink(path.join(dataDir, "notes", `${noteId}.json`)).catch(() => {});
  }
  library.courses = library.courses.filter((item) => item.id !== courseId);
  if (library.courses.length === 0) {
    const now = new Date().toISOString();
    const defaultCourse = { id: `course-${Date.now()}`, name: "未分类", createdAt: now, updatedAt: now, noteIds: [] };
    library.courses.push(defaultCourse);
    if (Object.keys(library.notes).length === 0) {
      const noteId = `note-${Date.now()}`;
      const noteMeta = {
        id: noteId,
        title: "未命名笔记",
        courseId: defaultCourse.id,
        tags: [],
        createdAt: now,
        updatedAt: now,
      };
      library.notes[noteId] = noteMeta;
      defaultCourse.noteIds.push(noteId);
      await writeAtomic(
        path.join(dataDir, "notes", `${noteId}.json`),
        JSON.stringify(
          {
            meta: noteMeta,
            content: { type: "doc", content: [{ type: "paragraph" }] },
            markers: [],
            floatingImages: [],
          },
          null,
          2,
        ),
      );
    }
  }
  await writeAtomic(path.join(dataDir, "library.json"), JSON.stringify(library, null, 2));
  void pushFullSync();
  return library;
});

ipcMain.handle("notes:remove", async (_event, id) => {
  const dataDir = getDataDir();
  const library = await ensureLibrary();
  if (!library.notes[id]) return library;
  syncCore.markDeleted(library, syncCore.TYPES.note, id);
  delete library.notes[id];
  for (const course of library.courses) {
    course.noteIds = course.noteIds.filter((noteId) => noteId !== id);
  }
  await fsp.unlink(path.join(dataDir, "notes", `${id}.json`)).catch(() => {});
  if (library.courses.length === 0) {
    const now = new Date().toISOString();
    library.courses.push({ id: `course-${Date.now()}`, name: "未分类", createdAt: now, noteIds: [] });
  }
  if (Object.keys(library.notes).length === 0) {
    const now = new Date().toISOString();
    const course = library.courses[0];
    const noteId = `note-${Date.now()}`;
    const noteMeta = {
      id: noteId,
      title: "未命名笔记",
      courseId: course.id,
      tags: [],
      createdAt: now,
      updatedAt: now,
    };
    library.notes[noteId] = noteMeta;
    course.noteIds.push(noteId);
    await writeAtomic(
      path.join(dataDir, "notes", `${noteId}.json`),
      JSON.stringify(
        {
          meta: noteMeta,
          content: { type: "doc", content: [{ type: "paragraph" }] },
          markers: [],
          floatingImages: [],
        },
        null,
        2,
      ),
    );
  }
  await writeAtomic(path.join(dataDir, "library.json"), JSON.stringify(library, null, 2));
  void pushFullSync();
  return library;
});

ipcMain.handle("courses:rename", async (_event, courseId, name) => {
  const dataDir = getDataDir();
  const library = await ensureLibrary();
  const course = library.courses.find((item) => item.id === courseId);
  const nextName = String(name || "").trim();
  if (course && nextName) {
    course.name = nextName;
    course.updatedAt = new Date().toISOString();
  }
  await writeAtomic(path.join(dataDir, "library.json"), JSON.stringify(library, null, 2));
  void pushFullSync();
  return library;
});

ipcMain.handle("courses:create", async (_event, name) => {
  const dataDir = getDataDir();
  const library = await ensureLibrary();
  const now = new Date().toISOString();
  library.courses.push({
    id: `course-${Date.now()}`,
    name: String(name || "").trim() || "新建分类",
    createdAt: now,
    updatedAt: now,
    noteIds: [],
  });
  await writeAtomic(path.join(dataDir, "library.json"), JSON.stringify(library, null, 2));
  void pushFullSync();
  return library;
});

ipcMain.handle("resources:list", async () => (await ensureLibrary()).resources || []);

ipcMain.handle("resources:pick", async (_event, category) => {
  if (!mainWindow) return [];
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "选择学习资料",
    properties: ["openFile", "multiSelections"],
  });
  if (result.canceled) return (await ensureLibrary()).resources || [];
  const dataDir = getDataDir();
  const resourcesDir = path.join(dataDir, "resources");
  fs.mkdirSync(resourcesDir, { recursive: true });
  const library = await ensureLibrary();
  const now = new Date().toISOString();
  for (const sourcePath of result.filePaths) {
    const id = `res-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const destPath = path.join(resourcesDir, `${id}-${path.basename(sourcePath)}`);
    await fsp.copyFile(sourcePath, destPath);
    library.resources.push({
      id,
      title: path.basename(sourcePath),
      kind: "file",
      category: category === "软件" ? "软件" : "资料",
      path: destPath,
      createdAt: now,
      updatedAt: now,
    });
  }
  await writeAtomic(path.join(dataDir, "library.json"), JSON.stringify(library, null, 2));
  void pushFullSync();
  return library.resources;
});

ipcMain.handle("resources:add-link", async (_event, input) => {
  const dataDir = getDataDir();
  const library = await ensureLibrary();
  const url = String(input?.url || "").trim();
  if (!/^https?:\/\//i.test(url)) return library.resources || [];
  library.resources.push({
    id: `res-${Date.now()}`,
    title: input?.title?.trim() || url,
    kind: "link",
    category: "链接",
    url,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await writeAtomic(path.join(dataDir, "library.json"), JSON.stringify(library, null, 2));
  void pushFullSync();
  return library.resources;
});

ipcMain.handle("resources:add-note", async (_event, input) => {
  const dataDir = getDataDir();
  const resourcesDir = path.join(dataDir, "resources");
  fs.mkdirSync(resourcesDir, { recursive: true });
  const library = await ensureLibrary();
  const id = `res-${Date.now()}`;
  const contentPath = path.join(resourcesDir, `${id}.txt`);
  await fsp.writeFile(contentPath, String(input?.content || ""), "utf8");
  library.resources.push({
    id,
    title: String(input?.title || "").trim() || "直接资料",
    kind: "note",
    category: "资料",
    contentPath,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await writeAtomic(path.join(dataDir, "library.json"), JSON.stringify(library, null, 2));
  void pushFullSync();
  return library.resources;
});

ipcMain.handle("resources:read-note", async (_event, id) => {
  const dataDir = getDataDir();
  const library = await ensureLibrary();
  const resource = (library.resources || []).find((item) => item.id === id && item.kind === "note");
  if (!resource?.contentPath) return "";
  try {
    return await fsp.readFile(resource.contentPath, "utf8");
  } catch (error) {
    console.error("读取直接资料失败", error);
    return "";
  }
});

ipcMain.handle("resources:save-note", async (_event, id, input) => {
  const dataDir = getDataDir();
  const library = await ensureLibrary();
  const resource = (library.resources || []).find((item) => item.id === id && item.kind === "note");
  if (resource?.contentPath) {
    await fsp.writeFile(resource.contentPath, String(input?.content || ""), "utf8");
    resource.title = String(input?.title || "").trim() || resource.title;
    resource.updatedAt = new Date().toISOString();
    await writeAtomic(path.join(dataDir, "library.json"), JSON.stringify(library, null, 2));
    void pushFullSync();
  }
  return library.resources;
});

ipcMain.handle("resources:remove", async (_event, id) => {
  const dataDir = getDataDir();
  const library = await ensureLibrary();
  const target = (library.resources || []).find((item) => item.id === id);
  syncCore.markDeleted(library, syncCore.TYPES.resource, id);
  library.resources = (library.resources || []).filter((item) => item.id !== id);
  if (target?.kind === "file" && target.path && target.path.startsWith(path.join(dataDir, "resources"))) {
    try {
      await fsp.unlink(target.path);
    } catch (error) {
      console.error("删除资料文件失败", error);
    }
  }
  if (target?.kind === "note" && target.contentPath && target.contentPath.startsWith(path.join(dataDir, "resources"))) {
    try {
      await fsp.unlink(target.contentPath);
    } catch (error) {
      console.error("删除直接资料失败", error);
    }
  }
  await writeAtomic(path.join(dataDir, "library.json"), JSON.stringify(library, null, 2));
  void pushFullSync();
  return library.resources;
});

ipcMain.handle("resources:open-file", async (_event, id) => {
  const dataDir = getDataDir();
  const library = await ensureLibrary();
  const resource = (library.resources || []).find((item) => item.id === id);
  if (!resource) return false;
  if (resource.kind === "link" && resource.url) {
    shell.openExternal(resource.url);
    return true;
  }
  if (resource.kind === "file") {
    if (resource.path && fs.existsSync(resource.path)) {
      shell.openPath(resource.path);
      return true;
    }
    if (resource.assetPath) {
      const provider = (readSyncConfig() || {}).provider;
      if (provider === "gitee" || provider === "github" || !(readSyncConfig() || {}).url) {
        try {
          const content =
            provider === "gitee"
              ? await giteeGetFileBase64(resource.assetPath)
              : await githubGetFileBase64(resource.assetPath);
          if (!content) return false;
          const resourcesDir = path.join(dataDir, "resources");
          fs.mkdirSync(resourcesDir, { recursive: true });
          const destPath = path.join(resourcesDir, `${resource.id}-${path.basename(resource.assetPath)}`);
          await fsp.writeFile(destPath, Buffer.from(content, "base64"));
          resource.path = destPath;
          await writeAtomic(path.join(dataDir, "library.json"), JSON.stringify(library, null, 2));
          shell.openPath(destPath);
          return true;
        } catch (error) {
          console.error("打开 GitHub 资料失败", error);
          return false;
        }
      }
      const config = readSyncConfig();
      if (config?.url && config?.username && config?.password) {
        try {
          const response = await syncRequest(config, "GET", undefined, resource.assetPath);
          if (!response.ok) return false;
          const resourcesDir = path.join(dataDir, "resources");
          fs.mkdirSync(resourcesDir, { recursive: true });
          const destPath = path.join(resourcesDir, `${resource.id}-${path.basename(resource.assetPath)}`);
          const buffer = Buffer.from(await response.arrayBuffer());
          await fsp.writeFile(destPath, buffer);
          resource.path = destPath;
          await writeAtomic(path.join(dataDir, "library.json"), JSON.stringify(library, null, 2));
          shell.openPath(destPath);
          return true;
        } catch (error) {
          console.error("打开云端资料失败", error);
        }
      }
    }
  }
  return false;
});

ipcMain.handle("plans:list", async () => (await ensureLibrary()).plans || []);

ipcMain.handle("plans:save", async (_event, payload) => {
  const dataDir = getDataDir();
  const library = await ensureLibrary();
  const now = new Date().toISOString();
  const existing = (library.plans || []).find((plan) => plan.id === payload.id);
  const plan = {
    id: existing?.id || `plan-${Date.now()}`,
    title: String(payload.title || "学习任务").trim() || "学习任务",
    date: payload.date || "",
    time: payload.time || "",
    done: Boolean(payload.done),
    remind: Boolean(payload.remind),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  if (existing) Object.assign(existing, plan);
  else library.plans.push(plan);
  await writeAtomic(path.join(dataDir, "library.json"), JSON.stringify(library, null, 2));
  schedulePlanReminder(plan);
  void pushFullSync();
  return { plans: library.plans, plan };
});

ipcMain.handle("plans:remove", async (_event, id) => {
  const dataDir = getDataDir();
  const library = await ensureLibrary();
  syncCore.markDeleted(library, syncCore.TYPES.plan, id);
  library.plans = (library.plans || []).filter((plan) => plan.id !== id);
  const timer = reminderTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    reminderTimers.delete(id);
  }
  await writeAtomic(path.join(dataDir, "library.json"), JSON.stringify(library, null, 2));
  void pushFullSync();
  return library.plans;
});

ipcMain.handle("words:list", async () => (await ensureLibrary()).customWords || []);

ipcMain.handle("words:add", async (_event, input) => {
  const dataDir = getDataDir();
  const library = await ensureLibrary();
  const word = String(input?.word || "").trim();
  if (!word) return library.customWords || [];
  const now = new Date().toISOString();
  library.customWords.push({
    id: `word-${Date.now()}`,
    word,
    phonetic: String(input?.phonetic || "").trim(),
    meaning: String(input?.meaning || "").trim(),
    sentence: String(input?.sentence || "").trim(),
    sentenceMeaning: String(input?.sentenceMeaning || "").trim(),
    createdAt: now,
    updatedAt: now,
  });
  await writeAtomic(path.join(dataDir, "library.json"), JSON.stringify(library, null, 2));
  void pushFullSync();
  return library.customWords;
});

ipcMain.handle("words:enrich", async (_event, word) => {
  const text = String(word || "").trim();
  const empty = { word: text, phonetic: "", meaning: "", sentence: "", sentenceMeaning: "" };
  if (!text) return empty;
  try {
    const response = await fetch(`https://dict.youdao.com/jsonapi?q=${encodeURIComponent(text)}`);
    if (!response.ok) return empty;
    const data = await response.json();
    const entry = data?.ec?.word?.[0];
    const phonetic = entry?.usphone || entry?.ukphone || "";
    const meaning = entry?.trs?.[0]?.tr?.[0]?.l?.i?.[0] || "";
    const pair = data?.blng_sents_part?.["sentence-pair"]?.[0];
    return {
      word: text,
      phonetic: phonetic ? `/${phonetic}/` : "",
      meaning,
      sentence: String(pair?.sentence || pair?.["sentence-eng"] || "").replace(/<[^>]+>/g, ""),
      sentenceMeaning: pair?.["sentence-translation"] || "",
    };
  } catch (error) {
    console.error("单词自动补全失败", error);
    return empty;
  }
});

ipcMain.handle("words:remove", async (_event, id) => {
  const dataDir = getDataDir();
  const library = await ensureLibrary();
  syncCore.markDeleted(library, syncCore.TYPES.word, id);
  library.customWords = (library.customWords || []).filter((word) => word.id !== id);
  await writeAtomic(path.join(dataDir, "library.json"), JSON.stringify(library, null, 2));
  void pushFullSync();
  return library.customWords;
});

ipcMain.handle("sentences:list", async () => (await ensureLibrary()).customSentences || []);

ipcMain.handle("sentences:add", async (_event, input) => {
  const dataDir = getDataDir();
  const library = await ensureLibrary();
  const english = String(input?.english || "").trim();
  if (!english) return library.customSentences || [];
  const now = new Date().toISOString();
  library.customSentences.push({
    id: `sentence-${Date.now()}`,
    english,
    chinese: String(input?.chinese || "").trim(),
    words: Array.isArray(input?.words) ? input.words : [],
    createdAt: now,
    updatedAt: now,
  });
  await writeAtomic(path.join(dataDir, "library.json"), JSON.stringify(library, null, 2));
  void pushFullSync();
  return library.customSentences;
});

ipcMain.handle("sentences:remove", async (_event, id) => {
  const dataDir = getDataDir();
  const library = await ensureLibrary();
  syncCore.markDeleted(library, syncCore.TYPES.sentence, id);
  library.customSentences = (library.customSentences || []).filter((sentence) => sentence.id !== id);
  await writeAtomic(path.join(dataDir, "library.json"), JSON.stringify(library, null, 2));
  void pushFullSync();
  return library.customSentences;
});

ipcMain.handle("sentences:update", async (_event, id, input) => {
  const dataDir = getDataDir();
  const library = await ensureLibrary();
  const sentence = (library.customSentences || []).find((item) => item.id === id);
  if (sentence) {
    if (typeof input?.english === "string") sentence.english = input.english;
    if (typeof input?.chinese === "string") sentence.chinese = input.chinese;
    if (Array.isArray(input?.words)) sentence.words = input.words;
    sentence.updatedAt = new Date().toISOString();
    await writeAtomic(path.join(dataDir, "library.json"), JSON.stringify(library, null, 2));
    void pushFullSync();
  }
  return library.customSentences;
});

const SYNC_FILE = "gaga-study-data.json";

function getSyncConfigPath() {
  return path.join(app.getPath("userData"), "sync-config.json");
}

function readSyncConfig() {
  try {
    return JSON.parse(fs.readFileSync(getSyncConfigPath(), "utf8"));
  } catch {
    return null;
  }
}

async function writeSyncConfig(config) {
  await fsp.writeFile(getSyncConfigPath(), JSON.stringify(config || {}, null, 2));
}

function ghCommand(args) {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trim();
}

function githubToken() {
  const config = readSyncConfig() || {};
  if (config.provider === "github") {
    return config.token || config.password || ghCommand(["auth", "token"]);
  }
  return config.token || ghCommand(["auth", "token"]);
}

function githubOwner() {
  const config = readSyncConfig() || {};
  if (config.username) return config.username;
  try {
    return ghCommand(["api", "user", "--jq", ".login"]);
  } catch {
    return "";
  }
}

function githubRepo() {
  return String((readSyncConfig() || {}).repo || "gaga-study-sync").trim();
}

function encodeGithubPath(value) {
  return value.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

async function githubRequest(path, method, body) {
  const headers = {
    Authorization: `Bearer ${githubToken()}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "gaga-notes",
  };
  if (body) headers["Content-Type"] = "application/json";
  return fetch(`https://api.github.com/${encodeGithubPath(path)}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function githubEnsureRepo() {
  const owner = githubOwner();
  const repo = githubRepo();
  if (!owner || !repo) return false;
  const existing = await githubRequest(`repos/${owner}/${repo}`, "GET");
  if (existing.status !== 404) return existing.ok;
  try {
    ghCommand(["repo", "create", `${owner}/${repo}`, "--private", "--confirm"]);
    return true;
  } catch {
    return false;
  }
}

async function githubGetFile(path) {
  const owner = githubOwner();
  const repo = githubRepo();
  const response = await githubRequest(
    `repos/${owner}/${repo}/contents/${encodeGithubPath(path)}`,
    "GET",
  );
  if (!response.ok) return null;
  const data = await response.json();
  return data?.content ? Buffer.from(data.content, "base64").toString("utf8") : null;
}

async function githubGetFileBase64(path) {
  const owner = githubOwner();
  const repo = githubRepo();
  const response = await githubRequest(
    `repos/${owner}/${repo}/contents/${encodeGithubPath(path)}`,
    "GET",
  );
  if (!response.ok) return null;
  const data = await response.json();
  return data?.content || null;
}

async function githubGetSha(path) {
  const owner = githubOwner();
  const repo = githubRepo();
  const response = await githubRequest(
    `repos/${owner}/${repo}/contents/${encodeGithubPath(path)}`,
    "GET",
  );
  if (!response.ok) return "";
  const data = await response.json();
  return data?.sha || "";
}

async function githubPutFileOnce(path, content) {
  const owner = githubOwner();
  const repo = githubRepo();
  const sha = await githubGetSha(path);
  const body = { message: `sync ${path}`, content };
  if (sha) body.sha = sha;
  return githubRequest(`repos/${owner}/${repo}/contents/${encodeGithubPath(path)}`, "PUT", body);
}

async function githubPutFile(path, content) {
  let response = await githubPutFileOnce(path, content);
  if (response.status === 422) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    response = await githubPutFileOnce(path, content);
  }
  return response;
}

function giteeToken() {
  const config = readSyncConfig() || {};
  return config.token || config.password || "";
}

function giteeOwner() {
  return String((readSyncConfig() || {}).username || "").trim();
}

function giteeRepo() {
  return String((readSyncConfig() || {}).repo || "gaga-study-sync").trim();
}

function giteeRequest(path, method, body) {
  const token = giteeToken();
  const url = `https://gitee.com/api/v5/${encodeGithubPath(path)}?access_token=${encodeURIComponent(token)}`;
  const headers = { Accept: "application/json" };
  if (body) headers["Content-Type"] = "application/json";
  return fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function giteeEnsureRepo() {
  const owner = giteeOwner();
  const repo = giteeRepo();
  const existing = await giteeRequest(`repos/${owner}/${repo}`, "GET");
  if (existing.status !== 404) return existing.ok;
  const created = await giteeRequest("user/repos", "POST", {
    access_token: giteeToken(),
    name: repo,
    private: true,
    auto_init: true,
  });
  return created.ok;
}

async function giteeGetSha(path) {
  const response = await giteeRequest(
    `repos/${giteeOwner()}/${giteeRepo()}/contents/${encodeGithubPath(path)}`,
    "GET",
  );
  if (!response.ok) return "";
  const data = await response.json();
  return data?.sha || "";
}

async function giteePutFile(path, content) {
  const sha = await giteeGetSha(path);
  const body = {
    access_token: giteeToken(),
    content,
    message: `sync ${path}`,
    branch: "master",
  };
  if (sha) {
    body.sha = sha;
    return giteeRequest(
      `repos/${giteeOwner()}/${giteeRepo()}/contents/${encodeGithubPath(path)}`,
      "PUT",
      body,
    );
  }
  return giteeRequest(
    `repos/${giteeOwner()}/${giteeRepo()}/contents/${encodeGithubPath(path)}`,
    "POST",
    body,
  );
}

async function giteeGetFileBase64(path) {
  const response = await giteeRequest(
    `repos/${giteeOwner()}/${giteeRepo()}/contents/${encodeGithubPath(path)}`,
    "GET",
  );
  if (!response.ok) return null;
  const data = await response.json();
  return data?.content || null;
}

function syncFileUrl(config, fileName = SYNC_FILE) {
  const base = String(config?.url || "").trim().replace(/\/+$/, "");
  const fileUrl = `${base}/${fileName}`;
  const proxy = String(config?.proxy || "").trim();
  return proxy ? proxy + encodeURIComponent(fileUrl) : fileUrl;
}

async function syncRequest(config, method, body, fileName = SYNC_FILE) {
  const headers = {
    Authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`,
  };
  if (body) {
    headers["Content-Type"] =
      Buffer.isBuffer(body) || body instanceof Blob
        ? body.type || "application/octet-stream"
        : "application/json";
  }
  return fetch(syncFileUrl(config, fileName), {
    method,
    headers,
    body:
      Buffer.isBuffer(body) || body instanceof Blob
        ? body
        : body
          ? JSON.stringify(body)
          : undefined,
  });
}

function proseMirrorText(node) {
  if (!node) return "";
  if (typeof node.text === "string") return node.text;
  if (Array.isArray(node.content)) return node.content.map(proseMirrorText).join("\n");
  return "";
}

function getDeviceId(library) {
  if (library.sync?.deviceId) return library.sync.deviceId;
  const deviceId = `device-${Date.now()}`;
  syncCore.ensureSync(library, deviceId);
  return deviceId;
}

function readAllNotes(library) {
  const notes = {};
  for (const meta of Object.values(library.notes || {})) {
    try {
      notes[meta.id] = JSON.parse(
        fs.readFileSync(path.join(getDataDir(), "notes", `${meta.id}.json`), "utf8"),
      );
    } catch {
      // note file will be created by the renderer on first save.
    }
  }
  return notes;
}

function readAllResourceNotes(library) {
  const notes = {};
  for (const resource of library.resources || []) {
    if (resource.kind === "note" && resource.contentPath) {
      try {
        notes[resource.id] = fs.readFileSync(resource.contentPath, "utf8");
      } catch {
        notes[resource.id] = "";
      }
    }
  }
  return notes;
}

function hashBuffer(buffer) {
  const { createHash } = require("crypto");
  return createHash("sha256").update(buffer).digest("hex").slice(0, 24);
}

async function persistBundle(storage) {
  const dataDir = getDataDir();
  const resourcesDir = path.join(dataDir, "resources");
  fs.mkdirSync(resourcesDir, { recursive: true });
  const library = storage.library;
  for (const resource of library.resources || []) {
    if (resource.kind === "note") {
      resource.contentPath = path.join(resourcesDir, `${resource.id}.txt`);
      await fsp.writeFile(resource.contentPath, storage.resourceNotes?.[resource.id] || "", "utf8");
    }
  }
  await writeAtomic(path.join(dataDir, "library.json"), JSON.stringify(library, null, 2));
  for (const [id, note] of Object.entries(storage.notes || {})) {
    await writeAtomic(path.join(dataDir, "notes", `${id}.json`), JSON.stringify(note, null, 2));
  }
}

async function buildLocalBundle() {
  const library = await ensureLibrary();
  getDeviceId(library);
  return syncCore.buildBundle(
    library,
    readAllNotes(library),
    readAllResourceNotes(library),
    library.sync.deviceId,
  );
}

async function uploadAssets(config, bundle, library) {
  const dataDir = getDataDir();
  for (const resource of bundle.resources || []) {
    if (resource.kind !== "file") continue;
    const localResource = (library.resources || []).find((item) => item.id === resource.id);
    const localPath = localResource?.path || resource.path;
    if (!localPath || !fs.existsSync(localPath)) continue;
    const buffer = await fsp.readFile(localPath);
    const hash = hashBuffer(buffer);
    const assetPath = `gaga-study-assets/${hash}-${encodeURIComponent(path.basename(localPath))}`;
    try {
      const isGitee = (readSyncConfig() || {}).provider === "gitee";
      const existing = isGitee
        ? await giteeGetFileBase64(assetPath)
        : await githubGetFileBase64(assetPath);
      if (existing === null) {
        const put = isGitee
          ? await giteePutFile(assetPath, buffer.toString("base64"))
          : await githubPutFile(assetPath, buffer.toString("base64"));
        if (!put.ok) throw new Error(`HTTP ${put.status}`);
      }
    } catch (error) {
      throw new Error(`文件 ${path.basename(localPath)} 上传失败: ${error?.message || error}`);
    }
    resource.assetPath = assetPath;
    if (localResource) localResource.assetPath = assetPath;
    bundle.assets[hash] = { size: buffer.length, updatedAt: new Date().toISOString() };
  }
}

async function downloadMissingAssets(config, mergedBundle, storage) {
  const dataDir = getDataDir();
  const resourcesDir = path.join(dataDir, "resources");
  fs.mkdirSync(resourcesDir, { recursive: true });
  for (const resource of storage.library.resources || []) {
    if (resource.kind !== "file" || !resource.assetPath) continue;
    if (resource.path && fs.existsSync(resource.path)) continue;
    const isGitee = (readSyncConfig() || {}).provider === "gitee";
    const content = isGitee
      ? await giteeGetFileBase64(resource.assetPath)
      : await githubGetFileBase64(resource.assetPath);
    if (!content) continue;
    const destPath = path.join(resourcesDir, `${resource.id}-${path.basename(resource.assetPath)}`);
    await fsp.writeFile(destPath, Buffer.from(content, "base64"));
    resource.path = destPath;
  }
  await writeAtomic(path.join(dataDir, "library.json"), JSON.stringify(storage.library, null, 2));
}

let pushInFlight = null;

async function pushFullSync() {
  if (pushInFlight) return pushInFlight;
  pushInFlight = (async () => {
    const isGitee = (readSyncConfig() || {}).provider === "gitee";
    try {
      if (isGitee && (!giteeOwner() || !giteeRepo() || !giteeToken())) {
        return { ok: false, message: "请先保存 Gitee 同步配置" };
      }
      if (!isGitee && (!githubOwner() || !githubRepo() || !githubToken())) {
        return { ok: false, message: "请先保存 GitHub 同步配置" };
      }
      const library = await ensureLibrary();
      if (isGitee && !(await giteeEnsureRepo())) {
        return { ok: false, message: "无法创建或访问 Gitee 仓库" };
      }
      if (!isGitee && !(await githubEnsureRepo())) {
        return { ok: false, message: "无法创建或访问 GitHub 仓库" };
      }
      const bundle = await buildLocalBundle();
      await uploadAssets(null, bundle, library);
      await writeAtomic(path.join(getDataDir(), "library.json"), JSON.stringify(library, null, 2));
      const encoded = Buffer.from(JSON.stringify(bundle)).toString("base64");
      const response = isGitee
        ? await giteePutFile("gaga-study-data.json", encoded)
        : await githubPutFile("gaga-study-data.json", encoded);
      if (!response.ok) return { ok: false, message: `上传失败，HTTP ${response.status}` };
      return {
        ok: true,
        message: `已上传 ${Object.keys(bundle.notes).length} 篇笔记、${bundle.customWords.length} 个单词`,
      };
    } catch (error) {
      return { ok: false, message: error?.message || String(error) };
    }
  })();
  try {
    return await pushInFlight;
  } finally {
    pushInFlight = null;
  }
}

ipcMain.handle("sync:get-config", async () => {
  const config = readSyncConfig() || {};
  if (config.provider === "gitee") {
    return {
      ...config,
      provider: "gitee",
      url: "",
      username: config.username || "",
      password: config.password || "",
      token: config.token || config.password || "",
      repo: config.repo || "gaga-study-sync",
      proxy: "",
    };
  }
  const token =
    config.token ||
    (config.provider === "github" ? config.password : "") ||
    (await Promise.resolve(githubToken()));
  return {
    ...config,
    provider: "github",
    url: "",
    username: githubOwner(),
    password: token,
    token,
    repo: githubRepo(),
    proxy: "",
  };
});

ipcMain.handle("sync:save-config", async (_event, config) => {
  const provider =
    config?.provider === "webdav" ? "webdav" : config?.provider === "github" ? "github" : "gitee";
  const clean = {
    provider,
    url: "",
    username: String(config?.username || "").trim(),
    password: String(config?.password || "").trim(),
    token: String(config?.token || config?.password || "").trim(),
    repo: String(config?.repo || "gaga-study-sync").trim(),
    proxy: provider === "webdav" ? String(config?.proxy || "").trim() : "",
  };
  await writeSyncConfig(clean);
  return clean;
});

ipcMain.handle("sync:test", async () => {
  if ((readSyncConfig() || {}).provider === "gitee") {
    if (!giteeOwner() || !giteeRepo() || !giteeToken()) {
      return { ok: false, message: "请先保存 Gitee 同步配置" };
    }
    try {
      const response = await giteeRequest(
        `repos/${giteeOwner()}/${giteeRepo()}/contents/gaga-study-data.json`,
        "GET",
      );
      if (response.status === 200 || response.status === 404) {
        return { ok: true, message: "连接成功，可以开始同步" };
      }
      return { ok: false, message: `连接失败，HTTP ${response.status}` };
    } catch (error) {
      return { ok: false, message: error?.message || String(error) };
    }
  }
  if (!githubOwner() || !githubRepo() || !githubToken()) {
    return { ok: false, message: "请先保存 GitHub 同步配置" };
  }
  try {
    const response = await githubRequest(
      `repos/${githubOwner()}/${githubRepo()}/contents/gaga-study-data.json`,
      "GET",
    );
    if (response.status === 200 || response.status === 404) {
      return { ok: true, message: "连接成功，可以开始同步" };
    }
    return { ok: false, message: `连接失败，HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, message: error?.message || String(error) };
  }
});

ipcMain.handle("sync:push", () => pushFullSync());

async function pullFromCloud() {
  if ((readSyncConfig() || {}).provider === "gitee") {
    if (!giteeOwner() || !giteeRepo() || !giteeToken()) {
      return { ok: false, message: "请先保存 Gitee 同步配置" };
    }
    try {
      const data = await giteeGetFileBase64("gaga-study-data.json");
      if (!data) {
        return { ok: false, message: "云端还没有数据，请先在其他设备上传一次" };
      }
      const remote = JSON.parse(Buffer.from(data, "base64").toString("utf8"));
      const local = await buildLocalBundle();
      const merged = syncCore.mergeBundles(local, remote);
      const storage = syncCore.bundleToStorage(merged);
      await persistBundle(storage);
      await downloadMissingAssets(null, merged, storage);
      return {
        ok: true,
        message: `已拉取 ${Object.keys(storage.notes).length} 篇笔记、${storage.library.customWords.length} 个单词`,
      };
    } catch (error) {
      return { ok: false, message: error?.message || String(error) };
    }
  }
  if (!githubOwner() || !githubRepo() || !githubToken()) {
    return { ok: false, message: "请先保存 GitHub 同步配置" };
  }
  try {
    const data = await githubGetFile("gaga-study-data.json");
    if (!data) {
      return { ok: false, message: "云端还没有数据，请先在其他设备上传一次" };
    }
    const remote = JSON.parse(data);
    const local = await buildLocalBundle();
    const merged = syncCore.mergeBundles(local, remote);
    const storage = syncCore.bundleToStorage(merged);
    await persistBundle(storage);
    await downloadMissingAssets(null, merged, storage);
    return {
      ok: true,
      message: `已拉取 ${Object.keys(storage.notes).length} 篇笔记、${storage.library.customWords.length} 个单词`,
    };
  } catch (error) {
    return { ok: false, message: error?.message || String(error) };
  }
}

ipcMain.handle("sync:pull", () => pullFromCloud());
ipcMain.handle("sync:push-notes", () => pushFullSync());
ipcMain.handle("sync:pull-notes", () => pullFromCloud());

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
  scheduleAllReminders();
  if (process.platform === "darwin") {
    app.dock.setIcon(path.join(__dirname, "../src/assets/logo.png"));
  }

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
