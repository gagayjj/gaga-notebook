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
  resources: ResourceItem[];
  plans: PlanItem[];
  customWords?: StudyWord[];
}

export interface ResourceItem {
  id: string;
  title: string;
  kind: "file" | "link" | "note";
  category?: string;
  path?: string;
  contentPath?: string;
  url?: string;
  createdAt: string;
}

export interface PlanItem {
  id: string;
  title: string;
  date: string;
  time: string;
  done: boolean;
  remind: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StudyWord {
  id: string;
  word: string;
  phonetic: string;
  meaning: string;
  sentence: string;
  sentenceMeaning: string;
  createdAt?: string;
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
      captureVideoFrame: () => Promise<string | null>;
      getPathForFile: (file: File) => string;
      localVideoUrl: (filePath: string) => string;
      openUrl: (url: string) => Promise<boolean>;
      setVideoVisible: (visible: boolean, url?: string) => Promise<boolean>;
      closeUrl: () => void;
      setVideoBounds: (bounds: { x: number; y: number; width: number; height: number }) => void;
      setAlwaysOnTop: (flag: boolean) => Promise<boolean>;
      setNarrowMode: (flag: boolean) => Promise<boolean>;
      openExternal: (url: string) => Promise<boolean>;
      onVideoStatus: (callback: (status: { state: string; message: string }) => void) => () => void;
      listNotes: () => Promise<Library>;
      readNote: (id: string) => Promise<NoteDoc | null>;
      saveNote: (payload: { id: string; title?: string; tags?: string[]; content: unknown }) => Promise<{
        ok: boolean;
        updatedAt: string;
      }>;
      createNote: (input: { title?: string; courseId?: string; tags?: string[] }) => Promise<NoteDoc>;
      listResources: () => Promise<ResourceItem[]>;
      pickResources: (category?: string) => Promise<ResourceItem[]>;
      addResourceLink: (input: { url: string; title?: string }) => Promise<ResourceItem[]>;
      addResourceNote: (input: { title: string; content: string }) => Promise<ResourceItem[]>;
      readResourceNote: (id: string) => Promise<string>;
      saveResourceNote: (id: string, input: { title: string; content: string }) => Promise<ResourceItem[]>;
      removeResource: (id: string) => Promise<ResourceItem[]>;
      openResourceFile: (filePath: string) => Promise<boolean>;
      listPlans: () => Promise<PlanItem[]>;
      savePlan: (payload: Partial<PlanItem>) => Promise<{ plans: PlanItem[]; plan: PlanItem }>;
      removePlan: (id: string) => Promise<PlanItem[]>;
      listWords: () => Promise<StudyWord[]>;
      addWord: (input: Omit<StudyWord, "id">) => Promise<StudyWord[]>;
      removeWord: (id: string) => Promise<StudyWord[]>;
    };
  }
}
