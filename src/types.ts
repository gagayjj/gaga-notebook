export interface NoteMeta {
  id: string;
  title: string;
  courseId: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  /** 绑定的视频：打开笔记时自动左侧恢复视频面板 */
  video?: VideoState;
}

/** 回收站条目：笔记/单词/语句删除后先进回收站，可恢复 */
export interface TrashItem {
  id: string;
  type: "note" | "word" | "sentence";
  title: string;
  deletedAt: string;
  courseId?: string;
  courseName?: string;
  /** 单词/语句的完整数据（恢复时直接放回列表） */
  data?: unknown;
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
  trash?: TrashItem[];
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

// 有道查词返回的额外字段（英/美音标、全部释义、词形变化）
export interface EnrichedWord extends Omit<StudyWord, "id"> {
  usphone?: string;
  ukphone?: string;
  meanings?: string[];
  wfs?: { name: string; value: string }[];
}

// TED 精听：精选清单项与单篇数据（由 scripts/fetch-ted.mjs 生成）
export interface TedIndexItem {
  slug: string;
  title: string;
  titleZh: string;
  speaker: string;
  level: number; // 1 入门 ~ 5 高阶
  minutes: number;
  wpm: number;
  totalWords: number;
  desc: string;
}

export interface TedSentence {
  t0: number; // 开始毫秒
  t1: number; // 结束毫秒
  text: string;
}

export interface TedTalkData extends TedIndexItem {
  duration: number;
  thumb: string;
  mp4: string;
  hls: string;
  sentences: TedSentence[];
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
      /** 以下为桌面端专属；web 版未实现 */
      setNoteVideo?: (id: string, video: VideoState) => Promise<boolean>;
      listTrash?: () => Promise<TrashItem[]>;
      restoreFromTrash?: (id: string) => Promise<Library | null>;
      purgeTrash?: (id: string) => Promise<TrashItem[]>;
      listNoteHistory?: (id: string) => Promise<string[]>;
      restoreNoteHistory?: (id: string, steps?: number) => Promise<{ content: unknown; restoredAt: string; remaining: number } | null>;
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
      enrichWord: (word: string) => Promise<EnrichedWord>;
      tedList?: () => Promise<TedIndexItem[]>;
      tedGet?: (slug: string) => Promise<TedTalkData | null>;
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
