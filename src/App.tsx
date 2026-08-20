import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { Toolbar } from "./components/Toolbar";
import { Sidebar, type OutlineItem } from "./components/Sidebar";
import { VideoPane, type VideoController } from "./components/VideoPane";
import { NoteEditor } from "./components/NoteEditor";
import { AnnotationModal } from "./components/AnnotationModal";
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
  const [videoState, setVideoState] = useState<VideoState>({ kind: "none" });
  const [insertRequest, setInsertRequest] = useState<InsertRequest | null>(null);
  const [annotation, setAnnotation] = useState<AnnotationImage | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [videoWidth, setVideoWidth] = useState(52);

  const videoControllerRef = useRef<VideoController | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const recorderToggleRef = useRef<(() => void) | null>(null);
  const draftRef = useRef<unknown>(null);
  const noteIdRef = useRef<string | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const flushSaveRef = useRef<() => void>(() => {});

  const performSave = useCallback(async () => {
    const id = noteIdRef.current;
    const content = draftRef.current;
    if (!id || !content) return;
    try {
      setSaveState("saving");
      const result = await window.studyNotes?.saveNote({ id, content });
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
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
        canInsertTimestamp={videoState.kind === "local"}
        onToggleNarrow={handleToggleNarrow}
        onToggleAlwaysOnTop={handleToggleAlwaysOnTop}
        onInsertTimestamp={handleInsertTimestamp}
        onInsertImage={handleRequestImage}
        onToggleRecording={() => recorderToggleRef.current?.()}
        onExport={handleExport}
        onNewNote={handleNewNote}
      />

      <div className="body">
        {!narrow && (
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
          {!narrow && (
            <>
              <div className="video-column" style={{ width: `${videoWidth}%` }}>
                <VideoPane
                  videoState={videoState}
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
              <div className="splitter" onMouseDown={handleSplitterDown} />
            </>
          )}
          <div className="notes-column" style={narrow ? { width: "100%" } : { width: `${100 - videoWidth}%` }}>
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
    </div>
  );
}
