export interface NoteMeta {
  id: string;
  title: string;
  courseId: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Course {
  id: string;
  name: string;
  createdAt: string;
  noteIds: string[];
}

export interface Library {
  version: number;
  courses: Course[];
  notes: Record<string, NoteMeta>;
}

export interface NoteDoc {
  meta: NoteMeta;
  content: unknown;
}

export type VideoState =
  | { kind: "none" }
  | { kind: "local"; source: string; title: string }
  | { kind: "url"; url: string };

export interface InsertRequest {
  id: number;
  kind: "image";
  dataUrl: string;
}

export interface AnnotationImage {
  dataUrl: string;
  label: string;
}

declare global {
  interface Window {
    studyNotes?: {
      openVideoDialog: () => Promise<string | null>;
      getPathForFile: (file: File) => string;
      localVideoUrl: (filePath: string) => string;
      openUrl: (url: string) => Promise<boolean>;
      setVideoVisible: (visible: boolean, url?: string) => Promise<boolean>;
      closeUrl: () => void;
      setVideoBounds: (bounds: { x: number; y: number; width: number; height: number }) => void;
      setAlwaysOnTop: (flag: boolean) => Promise<boolean>;
      setNarrowMode: (flag: boolean) => Promise<boolean>;
      openExternal: (url: string) => Promise<boolean>;
      listNotes: () => Promise<Library>;
      readNote: (id: string) => Promise<NoteDoc | null>;
      saveNote: (payload: { id: string; title?: string; tags?: string[]; content: unknown }) => Promise<{
        ok: boolean;
        updatedAt: string;
      }>;
      createNote: (input: { title?: string; courseId?: string; tags?: string[] }) => Promise<NoteDoc>;
    };
  }
}
