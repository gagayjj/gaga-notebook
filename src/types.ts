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
  updatedAt?: string;
}

export interface Library {
  version: number;
  courses: Course[];
  notes: Record<string, NoteMeta>;
  resources: ResourceItem[];
  plans: PlanItem[];
  customWords?: StudyWord[];
  customSentences?: StudySentence[];
  sync?: {
    deviceId?: string;
    tombstones?: Record<string, string>;
    assets?: Record<string, { size: number; updatedAt: string }>;
  };
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
  updatedAt?: string;
  assetPath?: string;
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
  updatedAt?: string;
}

export interface StudySentence {
  id: string;
  english: string;
  chinese: string;
  words?: MarkedWord[];
  createdAt?: string;
  updatedAt?: string;
}

export interface MarkedWord {
  id: string;
  word: string;
  meaning: string;
  phonetic?: string;
}

export interface SyncConfig {
  url: string;
  username: string;
  password: string;
  proxy: string;
  provider?: "webdav" | "github" | "gitee";
  repo?: string;
  token?: string;
}

export interface NoteDoc {
  meta: NoteMeta;
  content: unknown;
  markers?: Array<string | NoteMarker>;
  /** 旧版本单张标记，读取时会被合并到 markers */
  marker?: string | null;
  floatingImages?: FloatingImage[];
}

export interface NoteMarker {
  dataUrl: string;
  width: number;
  height: number;
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

export interface AnnotationInsert {
  image: string;
  marks: string;
}

export interface FloatingImage {
  id: string;
  src: string;
  marks: string;
  x: number;
  y: number;
  width: number;
  height: number;
  markX: number;
  markY: number;
  markWidth: number;
  markHeight: number;
}

export interface SpeechResult {
  ok: boolean;
  audioBase64?: string;
  stopped?: boolean;
  error?: string;
}

declare global {
  interface Window {
    studyNotes?: {
      platform: "desktop" | "web";
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
      speakText?: (text: string, options?: { voice?: string; rate?: number }) => Promise<SpeechResult | null>;
      stopSpeaking?: () => void;
      onVideoStatus: (callback: (status: { state: string; message: string }) => void) => () => void;
      listNotes: () => Promise<Library>;
      readNote: (id: string) => Promise<NoteDoc | null>;
      saveNote: (payload: { id: string; title?: string; tags?: string[]; content: unknown; markers?: NoteMarker[]; floatingImages?: FloatingImage[] }) => Promise<{
        ok: boolean;
        updatedAt: string;
      }>;
      createNote: (input: { title?: string; courseId?: string; tags?: string[] }) => Promise<NoteDoc>;
      removeNote: (id: string) => Promise<Library>;
      moveNote: (noteId: string, courseId: string) => Promise<Library>;
      removeCourse: (courseId: string) => Promise<Library>;
      renameCourse: (courseId: string, name: string) => Promise<Library>;
      createCourse: (name: string) => Promise<Library>;
      listResources: () => Promise<ResourceItem[]>;
      pickResources: (category?: string) => Promise<ResourceItem[]>;
      addResourceLink: (input: { url: string; title?: string }) => Promise<ResourceItem[]>;
      addResourceFile: (input: { file: File; title?: string; category?: string }) => Promise<ResourceItem[]>;
      addResourceNote: (input: { title: string; content: string }) => Promise<ResourceItem[]>;
      readResourceNote: (id: string) => Promise<string>;
      saveResourceNote: (id: string, input: { title: string; content: string }) => Promise<ResourceItem[]>;
      removeResource: (id: string) => Promise<ResourceItem[]>;
      openResourceFile: (id: string) => Promise<boolean>;
      listPlans: () => Promise<PlanItem[]>;
      savePlan: (payload: Partial<PlanItem>) => Promise<{ plans: PlanItem[]; plan: PlanItem }>;
      removePlan: (id: string) => Promise<PlanItem[]>;
      listWords: () => Promise<StudyWord[]>;
      addWord: (input: Omit<StudyWord, "id">) => Promise<StudyWord[]>;
      removeWord: (id: string) => Promise<StudyWord[]>;
      enrichWord: (word: string) => Promise<Omit<StudyWord, "id">>;
      listSentences: () => Promise<StudySentence[]>;
      addSentence: (input: Omit<StudySentence, "id">) => Promise<StudySentence[]>;
      removeSentence: (id: string) => Promise<StudySentence[]>;
      updateSentence: (id: string, input: Partial<Omit<StudySentence, "id">>) => Promise<StudySentence[]>;
      syncGetConfig: () => Promise<SyncConfig | null>;
      syncSaveConfig: (config: SyncConfig) => Promise<SyncConfig>;
      syncTest: () => Promise<{ ok: boolean; message: string }>;
      syncPush: () => Promise<{ ok: boolean; message: string }>;
      syncPull: () => Promise<{ ok: boolean; message: string }>;
      syncPushNotes: () => Promise<{ ok: boolean; message: string }>;
      syncPullNotes: () => Promise<{ ok: boolean; message: string }>;
    };
  }
}
