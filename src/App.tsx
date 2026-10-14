import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { Toolbar } from "./components/Toolbar";
import { Sidebar, type OutlineItem } from "./components/Sidebar";
import { VideoPane, type VideoController } from "./components/VideoPane";
import { NoteEditor } from "./components/NoteEditor";
import { AnnotationModal } from "./components/AnnotationModal";
import { ResourceLibrary } from "./components/ResourceLibrary";
import { EnglishLearning } from "./components/EnglishLearning";
import { ThemePicker } from "./components/ThemePicker";
import { BackgroundDesigner, loadBackgroundConfig, type BackgroundConfig } from "./components/BackgroundDesigner";
import { themeImages } from "./themeImages";
import { StatusBar, type SaveState } from "./components/StatusBar";
import { MobileNav, MobileTopBar, type MobileTab } from "./components/MobileShell";
import { MobileSettings } from "./components/MobileSettings";
import type { AnnotationImage, AnnotationInsert, FloatingImage, InsertRequest, Library, NoteDoc, NoteMarker, TrashItem, VideoState } from "./types";

function normalizeMarkers(note: NoteDoc | null): NoteMarker[] {
  if (!note) return [];
  const raw = Array.isArray(note.markers) ? note.markers : note.marker ? [note.marker] : [];
  return raw.map((item) => (typeof item === "string" ? { dataUrl: item, width: 0, height: 0 } : item));
}

export default function App() {
  const isMobile = window.studyNotes?.platform !== "desktop";
  const [mobileTab, setMobileTab] = useState<MobileTab>("notes");
  const [library, setLibrary] = useState<Library | null>(null);
  const [activeNote, setActiveNote] = useState<NoteDoc | null>(null);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [query, setQuery] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [narrow, setNarrow] = useState(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [historyRemaining, setHistoryRemaining] = useState(0);
  const [contentReloadToken, setContentReloadToken] = useState(0);
  const [libraryPanelOpen, setLibraryPanelOpen] = useState(false);
  const [englishOpen, setEnglishOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("app-theme") || "crayon");
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [bgConfig, setBgConfig] = useState<BackgroundConfig>(loadBackgroundConfig);
  const [designerOpen, setDesignerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [videoState, setVideoState] = useState<VideoState>({ kind: "none" });
  const [insertRequest, setInsertRequest] = useState<InsertRequest | null>(null);
  const [annotation, setAnnotation] = useState<AnnotationImage | null>(null);
  const [floatingImages, setFloatingImages] = useState<FloatingImage[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [lined, setLined] = useState(true);
  const [videoWidth, setVideoWidth] = useState(40);

  const videoControllerRef = useRef<VideoController | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const recorderToggleRef = useRef<(() => void) | null>(null);
  const draftRef = useRef<unknown>(null);
  const markerRef = useRef<NoteMarker[]>([]);
  const floatingImagesRef = useRef<FloatingImage[]>([]);
  const noteTitleRef = useRef<string>("");
  const noteIdRef = useRef<string | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const flushSaveRef = useRef<() => void>(() => {});

  const performSave = useCallback(async () => {
    const id = noteIdRef.current;
    const content = draftRef.current;
    if (!id || !content) return;
    try {
      setSaveState("saving");
      const result = await window.studyNotes?.saveNote({
        id,
        title: noteTitleRef.current,
        content,
        markers: markerRef.current,
        floatingImages: floatingImagesRef.current,
      });
      if (result?.ok) {
        setSaveState("saved");
        const syncConfig = await window.studyNotes?.syncGetConfig();
        const githubReady =
          syncConfig?.provider === "github" &&
          syncConfig.username &&
          (syncConfig.token || syncConfig.password) &&
          syncConfig.repo;
        const giteeReady =
          syncConfig?.provider === "gitee" &&
          syncConfig.username &&
          (syncConfig.token || syncConfig.password) &&
          syncConfig.repo;
        const webdavReady = syncConfig?.url && syncConfig?.username && syncConfig?.password;
        if (giteeReady || githubReady || webdavReady) {
          await window.studyNotes?.syncPushNotes();
        }
        setLibrary((prev) => {
          if (!prev || !prev.notes[id]) return prev;
          return {
            ...prev,
            notes: { ...prev.notes, [id]: { ...prev.notes[id], updatedAt: result.updatedAt } },
          };
        });
      } else {
        setSaveState("error");
      }
    } catch (error) {
      console.error("保存失败", error);
      setSaveState("error");
    }
  }, []);

  const flushSave = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    performSave();
  }, [performSave]);

  flushSaveRef.current = flushSave;

  // 打开笔记时按笔记绑定的视频恢复左侧视频面板
  const applyNoteVideo = useCallback((note: NoteDoc | null) => {
    const video = note?.meta.video;
    if (video && video.kind !== "none") {
      setVideoState(video);
      setVideoOpen(true);
    } else {
      setVideoState({ kind: "none" });
      setVideoOpen(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    window.studyNotes?.listNotes().then(async (data) => {
      if (cancelled) return;
      setLibrary(data);
      // 优先回到上次正在看的笔记（重启前在写哪篇、绑了视频，重开后还是哪篇）
      const savedId = localStorage.getItem("last-active-note") || "";
      const first = data.notes[savedId] ? savedId : data.courses[0]?.noteIds[0];
      if (first) {
        const note = await window.studyNotes?.readNote(first);
        if (!cancelled && note) {
          setActiveNote(note);
          setActiveNoteId(note.meta.id);
          noteIdRef.current = note.meta.id;
          draftRef.current = note.content;
          markerRef.current = normalizeMarkers(note);
          floatingImagesRef.current = note.floatingImages || [];
          setFloatingImages(note.floatingImages || []);
          noteTitleRef.current = note.meta.title;
          applyNoteVideo(note);
        }
      }
      if (isMobile) {
        const syncResult = await window.studyNotes?.syncPull();
        if (!cancelled && syncResult?.ok) {
          const nextData = await window.studyNotes?.listNotes();
          if (nextData) {
            setLibrary(nextData);
            const savedId2 = localStorage.getItem("last-active-note") || "";
            const firstId = nextData.notes[savedId2]
              ? savedId2
              : nextData.courses.flatMap((course) => course.noteIds).find((id) => nextData.notes[id]);
            if (firstId) {
              const note = await window.studyNotes?.readNote(firstId);
              if (!cancelled && note) {
                setActiveNote(note);
                setActiveNoteId(note.meta.id);
                noteIdRef.current = note.meta.id;
                draftRef.current = note.content;
                markerRef.current = normalizeMarkers(note);
                floatingImagesRef.current = note.floatingImages || [];
                setFloatingImages(note.floatingImages || []);
                noteTitleRef.current = note.meta.title;
                applyNoteVideo(note);
              }
            }
          }
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    const handleVisible = () => {
      if (document.hidden) return;
      window.studyNotes?.syncPull().then(async (result) => {
        if (result?.ok) {
          const nextData = await window.studyNotes?.listNotes();
          if (nextData) setLibrary(nextData);
        }
      });
    };
    document.addEventListener("visibilitychange", handleVisible);
    return () => document.removeEventListener("visibilitychange", handleVisible);
  }, [isMobile]);

  useEffect(() => {
    if (activeNoteId) localStorage.setItem("last-active-note", activeNoteId);
  }, [activeNoteId]);

  useEffect(() => {
    // 无论何时都要把视频窗口状态同步给主进程：
    // 包括「没有视频」「视频被关闭」「刚打开页面」这几种情况，
    // 否则主进程里残留的原生视频窗口会一直浮在笔记上面。
    // 打开「每日英语」等全屏弹窗时也要把视频藏起来——BrowserView 是原生窗口，
    // 永远盖在网页内容之上，不隐藏会挡住弹窗（关掉弹窗自动恢复，不用重新加载）。
    const shouldShow = videoState.kind === "url" && videoOpen && !narrow && !englishOpen;
    window.studyNotes?.setVideoVisible(shouldShow, videoState.kind === "url" ? videoState.url : undefined);
  }, [narrow, videoOpen, videoState, englishOpen]);

  useEffect(() => {
    document.body.dataset.theme = theme;
    localStorage.setItem("app-theme", theme);
  }, [theme]);

  useEffect(() => {
    const body = document.body;
    body.dataset.bgImage = bgConfig.image || "";
    body.dataset.bgFill = "1";
    body.dataset.bgMotion = bgConfig.motion;
    body.dataset.decorHidden = bgConfig.decor.join(" ");
    body.style.setProperty("--bg-x", String(bgConfig.offsetX));
    body.style.setProperty("--bg-y", String(bgConfig.offsetY));
    body.style.setProperty("--pattern-opacity", "0");
    if (bgConfig.baseColor) body.style.setProperty("--bg", bgConfig.baseColor);
    else body.style.removeProperty("--bg");
    const imageUrl = bgConfig.customImage || themeImages[bgConfig.image || theme] || themeImages.crayon;
    body.style.setProperty("--bg-image", `url("${imageUrl}")`);
    localStorage.setItem("background-config", JSON.stringify(bgConfig));
  }, [bgConfig]);

  const handleContentChange = useCallback(
    (content: unknown) => {
      draftRef.current = content;
      setSaveState("saving");
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        performSave();
      }, 250);
    },
    [performSave],
  );

  // 打开笔记时按笔记绑定的视频恢复左侧视频面板
  const handleSelectNote = useCallback(
    async (id: string) => {
      flushSaveRef.current();
      const note = await window.studyNotes?.readNote(id);
      if (!note) return;
      setActiveNote(note);
      setActiveNoteId(id);
      noteIdRef.current = id;
      draftRef.current = note.content;
      markerRef.current = normalizeMarkers(note);
      floatingImagesRef.current = note.floatingImages || [];
      setFloatingImages(note.floatingImages || []);
      noteTitleRef.current = note.meta.title;
      applyNoteVideo(note);
      setSaveState("idle");
    },
    [applyNoteVideo],
  );

  const handleNewNote = useCallback(async (title?: string, courseId?: string) => {
    flushSaveRef.current();
    const targetCourseId = courseId || library?.courses[0]?.id;
    const note = await window.studyNotes?.createNote({ title: title?.trim() || "未命名笔记", courseId: targetCourseId });
    if (!note) return;
    setLibrary((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        notes: { ...prev.notes, [note.meta.id]: note.meta },
        courses: prev.courses.map((course) =>
          course.id === note.meta.courseId
            ? { ...course, noteIds: [...course.noteIds, note.meta.id] }
            : course,
        ),
      };
    });
    setActiveNote(note);
    setActiveNoteId(note.meta.id);
    noteIdRef.current = note.meta.id;
    draftRef.current = note.content;
    markerRef.current = [];
    floatingImagesRef.current = [];
    setFloatingImages([]);
    noteTitleRef.current = note.meta.title;
    applyNoteVideo(note);
  }, [library]);

  const handleRemoveCourse = useCallback(
    async (courseId: string) => {
      const course = library?.courses.find((item) => item.id === courseId);
      if (!course) return;
      if (!window.confirm(`确定删除分类「${course.name}」以及里面的全部笔记吗？`)) return;
      const data = await window.studyNotes?.removeCourse(courseId);
      if (!data) return;
      setLibrary(data);
      if (data.trash) setTrashItems(data.trash);
      if (activeNoteId && !data.notes[activeNoteId]) {
        const firstNoteId = data.courses[0]?.noteIds.find((id) => data.notes[id]);
        if (firstNoteId) {
          const note = await window.studyNotes?.readNote(firstNoteId);
          if (note) {
            setActiveNote(note);
            setActiveNoteId(note.meta.id);
            noteIdRef.current = note.meta.id;
            draftRef.current = note.content;
            markerRef.current = normalizeMarkers(note);
            floatingImagesRef.current = note.floatingImages || [];
            setFloatingImages(note.floatingImages || []);
            noteTitleRef.current = note.meta.title;
            applyNoteVideo(note);
          }
        } else {
          setActiveNote(null);
          setActiveNoteId(null);
          noteIdRef.current = null;
          draftRef.current = null;
          markerRef.current = [];
          floatingImagesRef.current = [];
          setFloatingImages([]);
          noteTitleRef.current = "";
        }
        setSaveState("idle");
      }
    },
    [activeNoteId, library],
  );

  const handleTitleChange = useCallback((title: string) => {
    noteTitleRef.current = title;
    setActiveNote((prev) => (prev ? { ...prev, meta: { ...prev.meta, title } } : prev));
    setLibrary((prev) => {
      if (!prev || !noteIdRef.current) return prev;
      const note = prev.notes[noteIdRef.current];
      if (!note) return prev;
      return {
        ...prev,
        notes: { ...prev.notes, [noteIdRef.current]: { ...note, title } },
      };
    });
    handleContentChange(draftRef.current);
  }, [handleContentChange]);

  const handleRenameNote = useCallback(
    async (id: string, title: string) => {
      const note = await window.studyNotes?.readNote(id);
      if (!note) return;
      await window.studyNotes?.saveNote({
        id,
        title,
        content: note.content,
        markers: normalizeMarkers(note),
        floatingImages: note.floatingImages,
      });
      setLibrary((prev) => {
        if (!prev || !prev.notes[id]) return prev;
        return {
          ...prev,
          notes: { ...prev.notes, [id]: { ...prev.notes[id], title } },
        };
      });
      if (id === activeNoteId) {
        setActiveNote((prev) => (prev ? { ...prev, meta: { ...prev.meta, title } } : prev));
        noteTitleRef.current = title;
      }
    },
    [activeNoteId],
  );

  const handleRenameCourse = useCallback(async (courseId: string, name: string) => {
    const data = await window.studyNotes?.renameCourse(courseId, name);
    if (data) setLibrary(data);
  }, []);

  const handleNewCourse = useCallback(async (name: string) => {
    const data = await window.studyNotes?.createCourse(name.trim());
    if (data) setLibrary(data);
  }, []);

  const handleMoveNote = useCallback(
    async (noteId: string, courseId: string) => {
      const data = await window.studyNotes?.moveNote(noteId, courseId);
      if (data) {
        setLibrary(data);
        if (noteId === activeNoteId) {
          setActiveNote((prev) =>
            prev ? { ...prev, meta: { ...prev.meta, courseId } } : prev,
          );
        }
      }
    },
    [activeNoteId],
  );

  const handleRemoveNote = useCallback(
    async (id: string) => {
      const note = library?.notes[id];
      if (!note) return;
      if (!window.confirm(`确定删除笔记「${note.title}」吗？`)) return;
      const data = await window.studyNotes?.removeNote(id);
      if (!data) return;
      setLibrary(data);
      if (data.trash) setTrashItems(data.trash);
      if (id === activeNoteId) {
        const firstNoteId = data.courses.flatMap((course) => course.noteIds).find((noteId) => data.notes[noteId]);
        if (firstNoteId) {
          const nextNote = await window.studyNotes?.readNote(firstNoteId);
          if (nextNote) {
            setActiveNote(nextNote);
            setActiveNoteId(nextNote.meta.id);
            noteIdRef.current = nextNote.meta.id;
            draftRef.current = nextNote.content;
            markerRef.current = normalizeMarkers(nextNote);
            floatingImagesRef.current = nextNote.floatingImages || [];
            setFloatingImages(nextNote.floatingImages || []);
            noteTitleRef.current = nextNote.meta.title;
          }
        } else {
          setActiveNote(null);
          setActiveNoteId(null);
          noteIdRef.current = null;
          draftRef.current = null;
          markerRef.current = [];
          floatingImagesRef.current = [];
          setFloatingImages([]);
          noteTitleRef.current = "";
        }
        setSaveState("idle");
      }
    },
    [activeNoteId, library],
  );

  // —— 回收站 ——
  useEffect(() => {
    window.studyNotes?.listTrash?.().then((items) => {
      if (Array.isArray(items)) setTrashItems(items);
    });
  }, []);

  const handleRestoreTrash = useCallback(async (id: string) => {
    const data = await window.studyNotes?.restoreFromTrash?.(id);
    if (!data) return;
    setLibrary(data);
    if (data.trash) setTrashItems(data.trash);
  }, []);

  const handlePurgeTrash = useCallback(async (id: string) => {
    if (!window.confirm("彻底删除后无法恢复，确定吗？")) return;
    const list = await window.studyNotes?.purgeTrash?.(id);
    if (list) setTrashItems(list);
  }, []);

  // —— 笔记历史：一步步返回上一个保存记录 ——
  useEffect(() => {
    if (!activeNoteId) {
      setHistoryRemaining(0);
      return;
    }
    window.studyNotes
      ?.listNoteHistory?.(activeNoteId)
      .then((times) => setHistoryRemaining(Array.isArray(times) ? times.length : 0))
      .catch(() => setHistoryRemaining(0));
  }, [activeNoteId]);

  const handleUndoHistory = useCallback(async () => {
    const id = noteIdRef.current;
    if (!id) return;
    await performSave();
    const result = await window.studyNotes?.restoreNoteHistory?.(id, 1);
    if (!result) return;
    const note = await window.studyNotes?.readNote(id);
    if (note) {
      setActiveNote(note);
      draftRef.current = note.content;
      setContentReloadToken((value) => value + 1);
    }
    setHistoryRemaining(result.remaining);
  }, [performSave]);

  const handleToggleNarrow = useCallback(async () => {
    const next = !narrow;
    setNarrow(next);
    const ok = await window.studyNotes?.setNarrowMode(next);
    if (ok && next) setAlwaysOnTop(true);
    if (ok && !next) setAlwaysOnTop(false);
  }, [narrow]);

  const handleToggleAlwaysOnTop = useCallback(async () => {
    const result = await window.studyNotes?.setAlwaysOnTop(!alwaysOnTop);
    setAlwaysOnTop(Boolean(result));
  }, [alwaysOnTop]);

  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen((value) => !value);
  }, []);

  const handleToggleVideo = useCallback(() => {
    if (narrow) {
      setNarrow(false);
      setAlwaysOnTop(false);
      window.studyNotes?.setNarrowMode(false);
      setVideoOpen(true);
      return;
    }
    setVideoOpen((value) => !value);
  }, [narrow]);

  const handleToggleLibrary = useCallback(() => {
    setLibraryPanelOpen((value) => !value);
  }, []);

  const handleToggleEnglish = useCallback(() => {
    setEnglishOpen((value) => !value);
  }, []);

  const handleToggleTheme = useCallback(() => {
    setThemePickerOpen((value) => !value);
  }, []);

  const handleToggleDesigner = useCallback(() => {
    setDesignerOpen((value) => !value);
  }, []);

  const handleMobileTabChange = useCallback((tab: MobileTab) => {
    setSidebarOpen(false);
    setMobileTab(tab);
    if (tab === "notes" || tab === "mine") {
      setEnglishOpen(false);
      setLibraryPanelOpen(false);
    }
    if (tab === "english") {
      setEnglishOpen(true);
      setLibraryPanelOpen(false);
    }
    if (tab === "plans" || tab === "resources") {
      setLibraryPanelOpen(true);
      setEnglishOpen(false);
    }
  }, []);

  const handleSaveBackground = useCallback((config: BackgroundConfig) => {
    setBgConfig(config);
    setDesignerOpen(false);
  }, []);

  const handleSelectTheme = useCallback((themeId: string) => {
    setTheme(themeId);
    setBgConfig((prev) => ({ ...prev, image: themeId }));
  }, []);

  // 把视频绑定到当前笔记：下次打开这篇笔记，左侧自动恢复视频面板
  const bindNoteVideo = useCallback(
    (video: VideoState) => {
      const id = noteIdRef.current;
      if (!id) return;
      void window.studyNotes?.setNoteVideo?.(id, video);
      setLibrary((prev) => {
        if (!prev || !prev.notes[id]) return prev;
        const meta = { ...prev.notes[id] };
        if (video.kind === "none") delete meta.video;
        else meta.video = video;
        return { ...prev, notes: { ...prev.notes, [id]: meta } };
      });
    },
    [],
  );

  const handleOpenVideo = useCallback((path: string) => {
    window.studyNotes?.closeUrl();
    const title = path.split(/[\\/]/).pop() || path;
    const next: VideoState = { kind: "local", source: path, title };
    setVideoState(next);
    setVideoOpen(true);
    bindNoteVideo(next);
  }, [bindNoteVideo]);

  const handleOpenUrl = useCallback((url: string) => {
    window.studyNotes?.openUrl(url);
    const next: VideoState = { kind: "url", url };
    setVideoState(next);
    setVideoOpen(true);
    bindNoteVideo(next);
  }, [bindNoteVideo]);

  const handleCloseUrl = useCallback(() => {
    window.studyNotes?.closeUrl();
    setVideoState((prev) => (prev.kind === "url" ? { kind: "none" } : prev));
    bindNoteVideo({ kind: "none" });
  }, [bindNoteVideo]);

  const handleOpenExternal = useCallback((url: string) => {
    window.studyNotes?.openExternal(url);
  }, []);

  const handleSnapshot = useCallback((dataUrl: string) => {
    setAnnotation({ dataUrl, label: "视频截图" });
  }, []);

  const handleRequestImage = useCallback(() => {
    const frame = videoControllerRef.current?.captureFrame();
    if (frame) {
      setAnnotation({ dataUrl: frame, label: "视频画面" });
    } else {
      setAnnotation({ dataUrl: "", label: "图片标注" });
    }
  }, []);

  const handleInsertAnnotation = useCallback((result: AnnotationInsert) => {
    const next: FloatingImage = {
      id: `img-${Date.now()}`,
      src: result.image,
      marks: result.marks,
      x: 80,
      y: 80,
      width: 360,
      height: 220,
      markX: 80,
      markY: 80,
      markWidth: 360,
      markHeight: 220,
    };
    floatingImagesRef.current = [...floatingImagesRef.current, next];
    setFloatingImages(floatingImagesRef.current);
    setAnnotation(null);
    handleContentChange(draftRef.current);
  }, [handleContentChange]);

  const handleInsertTimestamp = useCallback(() => {
    const seconds = Math.floor(videoControllerRef.current?.getCurrentTime() || 0);
    editorRef.current?.chain().focus().insertTimestamp(seconds).run();
  }, []);

  const handleExport = useCallback(() => {
    const editor = editorRef.current;
    const title = activeNote?.meta.title || "学习笔记";
    if (!editor) return;
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title></head><body>${editor.getHTML()}</body></html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${title}.html`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [activeNote]);

  const handleJumpToOutline = useCallback((pos: number) => {
    editorRef.current?.chain().focus().setTextSelection(pos).scrollIntoView().run();
  }, []);

  const splitterDragRef = useRef<{ startX: number; startPercent: number } | null>(null);

  const handleSplitterDown = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    splitterDragRef.current = { startX: event.clientX, startPercent: videoWidth };
    const move = (moveEvent: MouseEvent) => {
      const drag = splitterDragRef.current;
      if (!drag) return;
      const container = document.querySelector(".main-area")?.getBoundingClientRect();
      if (!container) return;
      const next = drag.startPercent + ((moveEvent.clientX - drag.startX) / container.width) * 100;
      setVideoWidth(Math.min(75, Math.max(24, next)));
    };
    const up = () => {
      splitterDragRef.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }, [videoWidth]);

  const videoLabel =
    videoState.kind === "local"
      ? videoState.title
      : videoState.kind === "url"
        ? "网页视频"
        : "";

  return (
    <div className={`app ${narrow ? "narrow" : ""} ${isMobile ? "mobile" : ""}`}>
      {isMobile ? (
        <MobileTopBar onToggleSidebar={handleToggleSidebar} onNewNote={handleNewNote} />
      ) : (
        <Toolbar
          narrow={narrow}
          alwaysOnTop={alwaysOnTop}
          isRecording={isRecording}
          sidebarOpen={sidebarOpen}
          videoOpen={videoOpen}
          libraryOpen={libraryPanelOpen}
          englishOpen={englishOpen}
          themeOpen={themePickerOpen}
          designerOpen={designerOpen}
          canInsertTimestamp={videoState.kind === "local"}
          onToggleNarrow={handleToggleNarrow}
          onToggleAlwaysOnTop={handleToggleAlwaysOnTop}
          onInsertTimestamp={handleInsertTimestamp}
          onInsertImage={handleRequestImage}
          onOpenMarker={handleRequestImage}
          onToggleRecording={() => recorderToggleRef.current?.()}
          onExport={handleExport}
          onNewNote={handleNewNote}
          onToggleSidebar={handleToggleSidebar}
          onToggleVideo={handleToggleVideo}
          onToggleLibrary={handleToggleLibrary}
          onToggleEnglish={handleToggleEnglish}
          onToggleTheme={handleToggleTheme}
          onToggleDesigner={handleToggleDesigner}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      <div className="body">
        {sidebarOpen && (
          <Sidebar
            library={library}
            activeNoteId={activeNoteId}
            query={query}
            onQueryChange={setQuery}
            onSelectNote={handleSelectNote}
            onNewNote={handleNewNote}
            onRemoveCourse={handleRemoveCourse}
            onRenameCourse={handleRenameCourse}
            onNewCourse={handleNewCourse}
            onRenameNote={handleRenameNote}
            onMoveNote={handleMoveNote}
            onRemoveNote={handleRemoveNote}
            trash={trashItems}
            onRestoreTrash={handleRestoreTrash}
            onPurgeTrash={handlePurgeTrash}
            onClose={isMobile ? () => setSidebarOpen(false) : undefined}
          />
        )}

        <div className="main-area">
          {!isMobile && (
            <div
              className={`video-column ${videoOpen && !narrow ? "" : "hidden"}`}
              style={{ width: `${videoWidth}%` }}
            >
              <VideoPane
                videoState={videoState}
                active={videoOpen && !narrow}
                onOpenVideo={handleOpenVideo}
                onOpenUrl={handleOpenUrl}
                onCloseUrl={handleCloseUrl}
                onOpenExternal={handleOpenExternal}
                onSnapshot={handleSnapshot}
                onController={(controller) => {
                  videoControllerRef.current = controller;
                }}
              />
            </div>
          )}
          {!isMobile && (
            <div className={`splitter ${videoOpen && !narrow ? "" : "hidden"}`} onMouseDown={handleSplitterDown} />
          )}
          <div
            className="notes-column"
            style={{ width: videoOpen && !narrow ? `${100 - videoWidth}%` : "100%" }}
          >
            {!isMobile && !videoOpen && (
              <button
                type="button"
                className="reopen-video-btn"
                title="打开左侧视频栏（左边视频、右边笔记）"
                onClick={() => setVideoOpen(true)}
              >
                ▶ 打开视频
              </button>
            )}
            <NoteEditor
              note={activeNote}
              title={activeNote?.meta.title || ""}
              onTitleChange={handleTitleChange}
              getVideoTime={() => videoControllerRef.current?.getCurrentTime() || 0}
              canInsertTimestamp={videoState.kind === "local"}
              insertRequest={insertRequest}
              onInsertRequestHandled={() => setInsertRequest(null)}
              onContentChange={handleContentChange}
              onOutlineChange={setOutline}
              onRecordingChange={setIsRecording}
              onRequestImage={handleRequestImage}
              onEditorReady={(editor) => {
                editorRef.current = editor;
              }}
              recorderToggleRef={recorderToggleRef}
              lined={lined}
              onLinedChange={setLined}
              markers={normalizeMarkers(activeNote)}
              onMarkersChange={(markers) => {
                markerRef.current = markers;
                setActiveNote((prev) => (prev ? { ...prev, markers } : prev));
                handleContentChange(draftRef.current);
              }}
              floatingImages={floatingImages}
              onFloatingImagesChange={(images) => {
                floatingImagesRef.current = images;
                setFloatingImages(images);
                handleContentChange(draftRef.current);
              }}
              reloadToken={contentReloadToken}
            />
          </div>
        </div>
      </div>

      {!isMobile && (
        <StatusBar
          saveState={saveState}
          isRecording={isRecording}
          videoLabel={videoLabel}
          noteTitle={activeNote?.meta.title || ""}
          onRetrySave={flushSave}
          canUndoHistory={historyRemaining > 0}
          historyLabel={historyRemaining > 0 ? `返回上一记录（还可退 ${historyRemaining} 步）` : undefined}
          onUndoHistory={() => void handleUndoHistory()}
        />
      )}

      {annotation !== null && (
        <AnnotationModal image={annotation} onClose={() => setAnnotation(null)} onInsert={handleInsertAnnotation} />
      )}
      {libraryPanelOpen && (
        <ResourceLibrary
          key={isMobile ? mobileTab : "desktop"}
          initialTab={isMobile && mobileTab === "plans" ? "plans" : "resources"}
          onClose={() => {
            setLibraryPanelOpen(false);
            if (isMobile) setMobileTab("notes");
          }}
        />
      )}
      {englishOpen && (
        <EnglishLearning
          onClose={() => {
            setEnglishOpen(false);
            if (isMobile) setMobileTab("notes");
          }}
        />
      )}
      {themePickerOpen && (
        <ThemePicker
          currentTheme={theme}
          onSelect={handleSelectTheme}
          onClose={() => setThemePickerOpen(false)}
        />
      )}
      {designerOpen && (
        <BackgroundDesigner
          config={bgConfig}
          onSave={handleSaveBackground}
          onPreview={setBgConfig}
          onClose={() => setDesignerOpen(false)}
        />
      )}
      {(isMobile && mobileTab === "mine") || (!isMobile && settingsOpen) ? (
        <MobileSettings
          onClose={() => (isMobile ? setMobileTab("notes") : setSettingsOpen(false))}
          onOpenTheme={handleToggleTheme}
          onOpenDesigner={handleToggleDesigner}
        />
      ) : null}
      {isMobile && <MobileNav activeTab={mobileTab} onChange={handleMobileTabChange} />}
    </div>
  );
}
