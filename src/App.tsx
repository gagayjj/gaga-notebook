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
import type { AnnotationImage, InsertRequest, Library, NoteDoc, VideoState } from "./types";

export default function App() {
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
  const [libraryPanelOpen, setLibraryPanelOpen] = useState(false);
  const [englishOpen, setEnglishOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("app-theme") || "crayon");
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [bgConfig, setBgConfig] = useState<BackgroundConfig>(loadBackgroundConfig);
  const [designerOpen, setDesignerOpen] = useState(false);
  const [videoState, setVideoState] = useState<VideoState>({ kind: "none" });
  const [insertRequest, setInsertRequest] = useState<InsertRequest | null>(null);
  const [annotation, setAnnotation] = useState<AnnotationImage | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [lined, setLined] = useState(true);
  const [videoWidth, setVideoWidth] = useState(40);

  const videoControllerRef = useRef<VideoController | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const recorderToggleRef = useRef<(() => void) | null>(null);
  const draftRef = useRef<unknown>(null);
  const markerRef = useRef<string | null>(null);
  const noteIdRef = useRef<string | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const flushSaveRef = useRef<() => void>(() => {});

  const performSave = useCallback(async () => {
    const id = noteIdRef.current;
    const content = draftRef.current;
    if (!id || !content) return;
    try {
      setSaveState("saving");
      const result = await window.studyNotes?.saveNote({ id, content, marker: markerRef.current });
      if (result?.ok) {
        setSaveState("saved");
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

  useEffect(() => {
    let cancelled = false;
    window.studyNotes?.listNotes().then(async (data) => {
      if (cancelled) return;
      setLibrary(data);
      const first = data.courses[0]?.noteIds[0];
      if (first) {
        const note = await window.studyNotes?.readNote(first);
        if (!cancelled && note) {
          setActiveNote(note);
          setActiveNoteId(note.meta.id);
          noteIdRef.current = note.meta.id;
          draftRef.current = note.content;
          markerRef.current = note.marker ?? null;
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (videoState.kind !== "url") return;
    const shouldShow = videoOpen && !narrow;
    window.studyNotes?.setVideoVisible(shouldShow, videoState.url);
  }, [narrow, videoOpen, videoState]);

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
    const imageUrl = themeImages[bgConfig.image || theme] || themeImages.crayon;
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
      }, 800);
    },
    [performSave],
  );

  const handleSelectNote = useCallback(
    async (id: string) => {
      flushSaveRef.current();
      const note = await window.studyNotes?.readNote(id);
      if (!note) return;
      setActiveNote(note);
      setActiveNoteId(id);
      noteIdRef.current = id;
      draftRef.current = note.content;
      markerRef.current = note.marker ?? null;
      setSaveState("idle");
    },
    [],
  );

  const handleNewNote = useCallback(async () => {
    flushSaveRef.current();
    const courseId = library?.courses[0]?.id;
    const note = await window.studyNotes?.createNote({ title: "未命名笔记", courseId });
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
    markerRef.current = null;
  }, [library]);

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
    setVideoOpen((value) => !value);
  }, []);

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

  const handleSaveBackground = useCallback((config: BackgroundConfig) => {
    setBgConfig(config);
    setDesignerOpen(false);
  }, []);

  const handleSelectTheme = useCallback((themeId: string) => {
    setTheme(themeId);
    setBgConfig((prev) => ({ ...prev, image: themeId }));
  }, []);

  const handleOpenVideo = useCallback((path: string) => {
    window.studyNotes?.closeUrl();
    const title = path.split(/[\\/]/).pop() || path;
    setVideoState({ kind: "local", source: path, title });
  }, []);

  const handleOpenUrl = useCallback((url: string) => {
    window.studyNotes?.openUrl(url);
    setVideoState({ kind: "url", url });
  }, []);

  const handleCloseUrl = useCallback(() => {
    window.studyNotes?.closeUrl();
    setVideoState((prev) => (prev.kind === "url" ? { kind: "none" } : prev));
  }, []);

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

  const handleInsertAnnotation = useCallback((dataUrl: string) => {
    setInsertRequest({ id: Date.now(), kind: "image", dataUrl });
    setAnnotation(null);
  }, []);

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
    <div className={`app ${narrow ? "narrow" : ""}`}>
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
      />

      <div className="body">
        {!narrow && sidebarOpen && (
          <Sidebar
            library={library}
            activeNoteId={activeNoteId}
            query={query}
            outline={outline}
            onQueryChange={setQuery}
            onSelectNote={handleSelectNote}
            onNewNote={handleNewNote}
            onJumpToOutline={handleJumpToOutline}
          />
        )}

        <div className="main-area">
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
          <div className={`splitter ${videoOpen && !narrow ? "" : "hidden"}`} onMouseDown={handleSplitterDown} />
          <div
            className="notes-column"
            style={{ width: videoOpen && !narrow ? `${100 - videoWidth}%` : "100%" }}
          >
            <NoteEditor
              note={activeNote}
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
              marker={activeNote?.marker ?? null}
              onMarkerChange={(dataUrl) => {
                markerRef.current = dataUrl;
                setActiveNote((prev) => (prev ? { ...prev, marker: dataUrl } : prev));
                handleContentChange(draftRef.current);
              }}
            />
          </div>
        </div>
      </div>

      <StatusBar
        saveState={saveState}
        isRecording={isRecording}
        videoLabel={videoLabel}
        noteTitle={activeNote?.meta.title || ""}
        onRetrySave={flushSave}
      />

      {annotation !== null && (
        <AnnotationModal image={annotation} onClose={() => setAnnotation(null)} onInsert={handleInsertAnnotation} />
      )}
      {libraryPanelOpen && <ResourceLibrary onClose={() => setLibraryPanelOpen(false)} />}
      {englishOpen && <EnglishLearning onClose={() => setEnglishOpen(false)} />}
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
          onClose={() => setDesignerOpen(false)}
        />
      )}
    </div>
  );
}
