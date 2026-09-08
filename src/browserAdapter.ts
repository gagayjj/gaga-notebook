import type {
  FloatingImage,
  Library,
  NoteDoc,
  NoteMarker,
  PlanItem,
  ResourceItem,
  StudySentence,
  StudyWord,
  SyncConfig,
} from "./types";
import * as syncCore from "./lib/sync-core";

const LIB_KEY = "gaga-web-library";
const NOTE_PREFIX = "gaga-web-note:";
const RES_PREFIX = "gaga-web-res-content:";
const RES_ASSET_PREFIX = "gaga-web-res-asset:";
const SYNC_KEY = "gaga-web-sync-config";

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultLibrary(): Library {
  const now = new Date().toISOString();
  const courseId = "course-web-welcome";
  const noteId = "note-web-welcome";
  return {
    version: 1,
    courses: [{ id: courseId, name: "示例课程", createdAt: now, noteIds: [noteId] }],
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

function ensureLibrary(): Library {
  let library = readJSON<Library | null>(LIB_KEY, null);
  if (!library) {
    library = defaultLibrary();
    writeJSON(LIB_KEY, library);
  }
  if (!library.resources) library.resources = [];
  if (!library.plans) library.plans = [];
  if (!library.customWords) library.customWords = [];
  if (!library.customSentences) library.customSentences = [];
  if (library.courses.length === 0) {
    library.courses.push({
      id: newId("course"),
      name: "未分类",
      createdAt: new Date().toISOString(),
      noteIds: [] as string[],
    });
  }
  if (Object.keys(library.notes).length === 0) {
    const now = new Date().toISOString();
    const course = library.courses[0];
    const noteId = newId("note");
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
    writeNote({
      meta: noteMeta,
      content: { type: "doc", content: [{ type: "paragraph" }] },
      markers: [],
      floatingImages: [],
    });
  }
  for (const meta of Object.values(library.notes)) {
    if (!readNote(meta.id)) {
      writeNote({
        meta,
        content: { type: "doc", content: [{ type: "paragraph" }] },
        markers: [],
        floatingImages: [],
      });
    }
  }
  writeJSON(LIB_KEY, library);
  return library;
}

function writeNote(note: NoteDoc) {
  localStorage.setItem(NOTE_PREFIX + note.meta.id, JSON.stringify(note));
}

function readNote(id: string): NoteDoc | null {
  return readJSON<NoteDoc | null>(NOTE_PREFIX + id, null);
}

function persistLibrary(library: Library) {
  writeJSON(LIB_KEY, library);
}

function noteToPlainText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const item = node as { text?: unknown; content?: unknown[] };
  if (typeof item.text === "string") return item.text;
  if (Array.isArray(item.content)) return item.content.map(noteToPlainText).join("\n");
  return "";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[char];
  });
}

function syncRequest(fileName: string, method: string, body?: unknown): Promise<Response> {
  const config = readJSON<SyncConfig>(SYNC_KEY, { url: "", username: "", password: "", proxy: "" });
  const base = String(config.url || "").trim().replace(/\/+$/, "");
  const fileUrl = `${base}/${fileName}`;
  const proxy = String(config.proxy || "").trim();
  const proxyUrl = proxy ? `${proxy}${encodeURIComponent(fileUrl)}` : fileUrl;
  const headers: Record<string, string> = {
    Authorization: `Basic ${btoa(`${config.username}:${config.password}`)}`,
  };
  if (body && typeof body !== "string" && !(body instanceof FormData)) {
    headers["Content-Type"] =
      body instanceof Blob ? body.type || "application/octet-stream" : "application/json";
  }
  return fetch(proxyUrl, {
    method,
    headers,
    body:
      typeof body === "string" || body instanceof Blob || body instanceof FormData
        ? body
        : body
          ? JSON.stringify(body)
          : undefined,
  });
}

function syncConfigured() {
  const config = readSyncConfig();
  if (config.provider === "gitee") {
    return Boolean(config.username && (config.token || config.password) && config.repo);
  }
  if (config.provider === "github") {
    return Boolean(config.username && (config.token || config.password) && config.repo);
  }
  return Boolean(config.url && config.username && config.password);
}

function readSyncConfig() {
  return readJSON<SyncConfig>(SYNC_KEY, {
    url: "",
    username: "",
    password: "",
    proxy: "",
    provider: "gitee",
    repo: "gaga-study-sync",
  });
}

function githubApiConfig() {
  const config = readSyncConfig();
  return {
    owner: config.username?.trim() || config.url?.trim(),
    repo: config.repo?.trim() || "gaga-study-sync",
    token: config.token?.trim() || config.password?.trim(),
  };
}

function encodeGithubPath(path: string) {
  return path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

function githubRequest(path: string, method: string, body?: unknown): Promise<Response> {
  const { token } = githubApiConfig();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, `https://api.github.com/${encodeGithubPath(path)}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Accept", "application/vnd.github+json");
    if (body) xhr.setRequestHeader("Content-Type", "application/json");
    xhr.onload = () => {
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        json: async () => JSON.parse(xhr.responseText || "{}"),
      } as Response);
    };
    xhr.onerror = () => reject(new TypeError("网络错误，请检查网络或 GitHub API 是否可访问"));
    xhr.send(body ? JSON.stringify(body) : null);
  });
}

function utf8ToBase64(value: string) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(value)));
}

function base64ToUtf8(value: string) {
  return new TextDecoder().decode(Uint8Array.from(atob(value), (char) => char.charCodeAt(0)));
}

async function githubEnsureRepo() {
  const { owner, repo } = githubApiConfig();
  const existing = await githubRequest(`repos/${owner}/${repo}`, "GET");
  if (existing.status !== 404) return existing.ok;
  const created = await githubRequest("user/repos", "POST", { name: repo, private: true });
  return created.ok;
}

async function githubGetSha(path: string) {
  const response = await githubRequest(`repos/${githubApiConfig().owner}/${githubApiConfig().repo}/contents/${encodeGithubPath(path)}`, "GET");
  if (!response.ok) return "";
  const data = (await response.json()) as { sha?: string };
  return data.sha || "";
}

async function githubPutOnce(path: string, content: string) {
  const sha = await githubGetSha(path);
  const body: Record<string, unknown> = {
    message: `sync ${path}`,
    content,
  };
  if (sha) body.sha = sha;
  return githubRequest(`repos/${githubApiConfig().owner}/${githubApiConfig().repo}/contents/${encodeGithubPath(path)}`, "PUT", body);
}

async function githubPutWithRetry(path: string, content: string) {
  let response = await githubPutOnce(path, content);
  if (response.status === 422) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    response = await githubPutOnce(path, content);
  }
  return response;
}

async function githubPutData(path: string, value: unknown) {
  return githubPutWithRetry(path, utf8ToBase64(JSON.stringify(value)));
}

async function githubPutAsset(path: string, base64: string) {
  return githubPutWithRetry(path, base64);
}

async function githubGetData(path: string) {
  const response = await githubRequest(`repos/${githubApiConfig().owner}/${githubApiConfig().repo}/contents/${encodeGithubPath(path)}`, "GET");
  if (!response.ok) return null;
  const data = (await response.json()) as { content?: string };
  return data.content ? base64ToUtf8(data.content) : null;
}

function giteeApiConfig() {
  const config = readSyncConfig();
  return {
    owner: config.username?.trim() || config.url?.trim(),
    repo: config.repo?.trim() || "gaga-study-sync",
    token: config.token?.trim() || config.password?.trim(),
  };
}

function giteeRequest(path: string, method: string, body?: unknown): Promise<Response> {
  const { token } = giteeApiConfig();
  const base = `https://gitee.com/api/v5/${encodeGithubPath(path)}`;
  const separator = base.includes("?") ? "&" : "?";
  const url = `${base}${separator}access_token=${encodeURIComponent(token || "")}`;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.setRequestHeader("Accept", "application/json");
    if (body) xhr.setRequestHeader("Content-Type", "application/json");
    xhr.onload = () => {
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        json: async () => JSON.parse(xhr.responseText || "{}"),
      } as Response);
    };
    xhr.onerror = () => reject(new TypeError("网络错误，请检查网络或 Gitee API 是否可访问"));
    xhr.send(body ? JSON.stringify(body) : null);
  });
}

async function giteeEnsureRepo() {
  const { owner, repo } = giteeApiConfig();
  const existing = await giteeRequest(`repos/${owner}/${repo}`, "GET");
  if (existing.status !== 404) return existing.ok;
  const { token } = giteeApiConfig();
  const created = await giteeRequest("user/repos", "POST", {
    access_token: token,
    name: repo,
    private: true,
    auto_init: true,
  });
  return created.ok;
}

async function giteeGetSha(path: string) {
  const response = await giteeRequest(`repos/${giteeApiConfig().owner}/${giteeApiConfig().repo}/contents/${encodeGithubPath(path)}`, "GET");
  if (!response.ok) return "";
  const data = (await response.json()) as { sha?: string };
  return data.sha || "";
}

async function giteePutFile(path: string, content: string) {
  const owner = giteeApiConfig().owner;
  const repo = giteeApiConfig().repo;
  const { token } = giteeApiConfig();
  const existing = await giteeGetSha(path);
  const body: Record<string, unknown> = {
    access_token: token,
    content,
    message: `sync ${path}`,
    branch: "master",
  };
  if (existing) {
    body.sha = existing;
    return giteeRequest(`repos/${owner}/${repo}/contents/${encodeGithubPath(path)}`, "PUT", body);
  }
  return giteeRequest(`repos/${owner}/${repo}/contents/${encodeGithubPath(path)}`, "POST", body);
}

async function giteeGetFile(path: string) {
  const response = await giteeRequest(`repos/${giteeApiConfig().owner}/${giteeApiConfig().repo}/contents/${encodeGithubPath(path)}`, "GET");
  if (!response.ok) return null;
  const data = (await response.json()) as { content?: string };
  return data.content || null;
}

function giteeConfigured() {
  const config = readSyncConfig();
  return config.provider === "gitee" && Boolean(config.username && (config.token || config.password) && config.repo);
}

function githubConfigured() {
  const config = readSyncConfig();
  return config.provider === "github" && Boolean(config.username && (config.token || config.password) && config.repo);
}

async function pushGithubSync() {
  if (!githubConfigured()) return { ok: false, message: "请先保存 GitHub 同步配置" };
  try {
    if (!(await githubEnsureRepo())) return { ok: false, message: "无法创建或访问 GitHub 仓库" };
    const library = ensureLibrary();
    const notes: Record<string, NoteDoc> = {};
    for (const meta of Object.values(library.notes)) {
      const note = readNote(meta.id);
      if (note) notes[meta.id] = note;
    }
    const resourceNotes: Record<string, string> = {};
    for (const resource of library.resources || []) {
      if (resource.kind === "note") resourceNotes[resource.id] = localStorage.getItem(RES_PREFIX + resource.id) || "";
    }
    const bundle = syncCore.buildBundle(library, notes, resourceNotes, getDeviceId());
    for (const resource of bundle.resources) {
      if (resource.kind !== "file") continue;
      const localData = localStorage.getItem(RES_ASSET_PREFIX + resource.id);
      if (!localData) continue;
      const base64 = localData.split(",")[1] || "";
      const hash = await hashText(localData);
      const safeName = encodeURIComponent(resource.title || "file");
      const assetPath = `gaga-study-assets/${hash}-${safeName}`;
      const upload = await githubPutAsset(assetPath, base64);
      if (!upload.ok) return { ok: false, message: `文件上传失败，HTTP ${upload.status}` };
      resource.assetPath = assetPath;
      bundle.assets[hash] = { size: localData.length, updatedAt: new Date().toISOString() };
      const localResource = library.resources.find((item) => item.id === resource.id);
      if (localResource) localResource.assetPath = assetPath;
    }
    persistLibrary(library);
    const response = await githubPutData("gaga-study-data.json", bundle);
    if (!response.ok) return { ok: false, message: `上传失败，HTTP ${response.status}` };
    return {
      ok: true,
      message: `已上传 ${Object.keys(bundle.notes).length} 篇笔记、${bundle.customWords.length} 个单词`,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

async function pullGithubSync() {
  if (!githubConfigured()) return { ok: false, message: "请先保存 GitHub 同步配置" };
  try {
    const data = await githubGetData("gaga-study-data.json");
    if (!data) return { ok: false, message: "云端还没有数据，请先在电脑上配置并上传一次" };
    const remote = JSON.parse(data) as syncCore.SyncBundle;
    const library = ensureLibrary();
    const notes: Record<string, NoteDoc> = {};
    for (const meta of Object.values(library.notes)) {
      const note = readNote(meta.id);
      if (note) notes[meta.id] = note;
    }
    const resourceNotes: Record<string, string> = {};
    for (const resource of library.resources || []) {
      if (resource.kind === "note") resourceNotes[resource.id] = localStorage.getItem(RES_PREFIX + resource.id) || "";
    }
    const local = syncCore.buildBundle(library, notes, resourceNotes, getDeviceId());
    const merged = syncCore.mergeBundles(local, remote);
    const storage = syncCore.bundleToStorage(merged);
    persistLibrary(storage.library);
    for (const note of Object.values(storage.notes)) writeNote(note as NoteDoc);
    for (const [id, content] of Object.entries(storage.resourceNotes)) {
      localStorage.setItem(RES_PREFIX + id, String(content));
    }
    for (const id of Object.keys(local.notes)) {
      if (!merged.notes[id]) localStorage.removeItem(NOTE_PREFIX + id);
    }
    for (const id of Object.keys(local.resourceNotes)) {
      if (!merged.resourceNotes[id]) localStorage.removeItem(RES_PREFIX + id);
    }
    return {
      ok: true,
      message: `已拉取 ${Object.keys(storage.notes).length} 篇笔记、${(storage.library.customWords || []).length} 个单词`,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

async function pushGiteeSync() {
  if (!giteeConfigured()) return { ok: false, message: "请先保存 Gitee 同步配置" };
  try {
    if (!(await giteeEnsureRepo())) return { ok: false, message: "无法创建或访问 Gitee 仓库" };
    const library = ensureLibrary();
    const notes: Record<string, NoteDoc> = {};
    for (const meta of Object.values(library.notes)) {
      const note = readNote(meta.id);
      if (note) notes[meta.id] = note;
    }
    const resourceNotes: Record<string, string> = {};
    for (const resource of library.resources || []) {
      if (resource.kind === "note") resourceNotes[resource.id] = localStorage.getItem(RES_PREFIX + resource.id) || "";
    }
    const bundle = syncCore.buildBundle(library, notes, resourceNotes, getDeviceId());
    for (const resource of bundle.resources) {
      if (resource.kind !== "file") continue;
      const localData = localStorage.getItem(RES_ASSET_PREFIX + resource.id);
      if (!localData) continue;
      const base64 = localData.split(",")[1] || "";
      const hash = await hashText(localData);
      const safeName = encodeURIComponent(resource.title || "file");
      const assetPath = `gaga-study-assets/${hash}-${safeName}`;
      const upload = await giteePutFile(assetPath, base64);
      if (!upload.ok) return { ok: false, message: `文件上传失败，HTTP ${upload.status}` };
      resource.assetPath = assetPath;
      bundle.assets[hash] = { size: localData.length, updatedAt: new Date().toISOString() };
      const localResource = library.resources.find((item) => item.id === resource.id);
      if (localResource) localResource.assetPath = assetPath;
    }
    persistLibrary(library);
    const response = await giteePutFile("gaga-study-data.json", utf8ToBase64(JSON.stringify(bundle)));
    if (!response.ok) return { ok: false, message: `上传失败，HTTP ${response.status}` };
    return {
      ok: true,
      message: `已上传 ${Object.keys(bundle.notes).length} 篇笔记、${bundle.customWords.length} 个单词`,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

async function pullGiteeSync() {
  if (!giteeConfigured()) return { ok: false, message: "请先保存 Gitee 同步配置" };
  try {
    const data = await giteeGetFile("gaga-study-data.json");
    if (!data) return { ok: false, message: "云端还没有数据，请先在电脑上配置并上传一次" };
    const remote = JSON.parse(base64ToUtf8(data)) as syncCore.SyncBundle;
    const library = ensureLibrary();
    const notes: Record<string, NoteDoc> = {};
    for (const meta of Object.values(library.notes)) {
      const note = readNote(meta.id);
      if (note) notes[meta.id] = note;
    }
    const resourceNotes: Record<string, string> = {};
    for (const resource of library.resources || []) {
      if (resource.kind === "note") resourceNotes[resource.id] = localStorage.getItem(RES_PREFIX + resource.id) || "";
    }
    const local = syncCore.buildBundle(library, notes, resourceNotes, getDeviceId());
    const merged = syncCore.mergeBundles(local, remote);
    const storage = syncCore.bundleToStorage(merged);
    persistLibrary(storage.library);
    for (const note of Object.values(storage.notes)) writeNote(note as NoteDoc);
    for (const [id, content] of Object.entries(storage.resourceNotes)) {
      localStorage.setItem(RES_PREFIX + id, String(content));
    }
    for (const id of Object.keys(local.notes)) {
      if (!merged.notes[id]) localStorage.removeItem(NOTE_PREFIX + id);
    }
    for (const id of Object.keys(local.resourceNotes)) {
      if (!merged.resourceNotes[id]) localStorage.removeItem(RES_PREFIX + id);
    }
    return {
      ok: true,
      message: `已拉取 ${Object.keys(storage.notes).length} 篇笔记、${(storage.library.customWords || []).length} 个单词`,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

function getDeviceId() {
  let deviceId = localStorage.getItem("gaga-device-id");
  if (!deviceId) {
    deviceId = `device-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem("gaga-device-id", deviceId);
  }
  return deviceId;
}

async function hashText(text: string) {
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 24);
  } catch {
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
    }
    return String(hash);
  }
}

function dataUrlToBlob(dataUrl: string) {
  const [head, payload] = dataUrl.split(",");
  const mime = head.match(/^data:(.*?);/)?.[1] || "application/octet-stream";
  const binary = atob(payload || "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function installBrowserAdapter() {
  if (window.studyNotes) return;

  let pushInFlight: Promise<{ ok: boolean; message: string }> | null = null;

  const api = {
    platform: "web" as const,
    openVideoDialog: async () => null,
    captureVideoFrame: async () => null,
    getPathForFile: (file: File) => file.name,
    localVideoUrl: () => "",
    openUrl: async () => false,
    setVideoVisible: async () => false,
    closeUrl: () => {},
    setVideoBounds: () => {},
    setAlwaysOnTop: async () => false,
    setNarrowMode: async () => false,
    openExternal: async (url: string) => {
      window.open(url, "_blank");
      return true;
    },
    onVideoStatus: () => () => {},

    listNotes: async () => ensureLibrary(),
    readNote: async (id: string) => readNote(id),
    saveNote: async (payload: {
      id: string;
      title?: string;
      tags?: string[];
      content: unknown;
      markers?: NoteMarker[];
      floatingImages?: FloatingImage[];
    }) => {
      const library = ensureLibrary();
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
      persistLibrary(library);
      const old = readNote(payload.id) || {
        meta,
        content: { type: "doc", content: [{ type: "paragraph" }] },
        markers: [] as NoteMarker[],
        floatingImages: [] as FloatingImage[],
      };
      writeNote({
        meta,
        content: payload.content,
        markers: Array.isArray(payload.markers) ? payload.markers : old.markers || [],
        floatingImages: Array.isArray(payload.floatingImages) ? payload.floatingImages : old.floatingImages || [],
      });
      void api.syncPush();
      return { ok: true, updatedAt: now };
    },
    createNote: async (input: { title?: string; courseId?: string; tags?: string[] }) => {
      const library = ensureLibrary();
      const now = new Date().toISOString();
      const courseId = input.courseId || library.courses[0]?.id || "";
      if (!library.courses.some((course) => course.id === courseId) && library.courses.length === 0) {
        library.courses.push({ id: newId("course"), name: "未分类", createdAt: now, noteIds: [] as string[] });
      }
      const noteId = newId("note");
      const meta = {
        id: noteId,
        title: input.title || "未命名笔记",
        courseId,
        tags: input.tags || [],
        createdAt: now,
        updatedAt: now,
      };
      library.notes[noteId] = meta;
      const course = library.courses.find((item) => item.id === courseId);
      if (course) course.noteIds.push(noteId);
      persistLibrary(library);
      const note: NoteDoc = {
        meta,
        content: { type: "doc", content: [{ type: "paragraph" }] },
        markers: [],
        floatingImages: [],
      };
      writeNote(note);
      void api.syncPush();
      return note;
    },
    removeNote: async (id: string) => {
      const library = ensureLibrary();
      syncCore.markDeleted(library, syncCore.TYPES.note, id);
      delete library.notes[id];
      library.courses.forEach((course) => {
        course.noteIds = course.noteIds.filter((noteId) => noteId !== id);
      });
      localStorage.removeItem(NOTE_PREFIX + id);
      persistLibrary(library);
      void api.syncPush();
      return library;
    },
    moveNote: async (noteId: string, courseId: string) => {
      const library = ensureLibrary();
      const meta = library.notes[noteId];
      const course = library.courses.find((item) => item.id === courseId);
      if (!meta || !course) return library;
      library.courses.forEach((entry) => {
        entry.noteIds = entry.noteIds.filter((id) => id !== noteId);
      });
      meta.courseId = courseId;
      if (!course.noteIds.includes(noteId)) course.noteIds.push(noteId);
      const note = readNote(noteId);
      if (note) {
        note.meta.courseId = courseId;
        note.meta.updatedAt = new Date().toISOString();
        writeNote(note);
      }
      persistLibrary(library);
      void api.syncPush();
      return library;
    },
    removeCourse: async (courseId: string) => {
      const library = ensureLibrary();
      const course = library.courses.find((item) => item.id === courseId);
      if (!course) return library;
      const now = new Date().toISOString();
      syncCore.markDeleted(library, syncCore.TYPES.course, courseId, now);
      for (const noteId of course.noteIds) {
        syncCore.markDeleted(library, syncCore.TYPES.note, noteId, now);
        delete library.notes[noteId];
        localStorage.removeItem(NOTE_PREFIX + noteId);
      }
      library.courses = library.courses.filter((item) => item.id !== courseId);
      if (library.courses.length === 0) {
        const now = new Date().toISOString();
        const defaultCourse: Library["courses"][number] = {
          id: newId("course"),
          name: "未分类",
          createdAt: now,
          noteIds: [],
        };
        library.courses.push(defaultCourse);
        if (Object.keys(library.notes).length === 0) {
          const noteId = newId("note");
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
          writeNote({
            meta: noteMeta,
            content: { type: "doc", content: [{ type: "paragraph" }] },
            markers: [],
            floatingImages: [],
          });
        }
      }
      persistLibrary(library);
      void api.syncPush();
      return library;
    },
    renameCourse: async (courseId: string, name: string) => {
      const library = ensureLibrary();
      const course = library.courses.find((item) => item.id === courseId);
      if (course && name.trim()) {
        course.name = name.trim();
        course.updatedAt = new Date().toISOString();
      }
      persistLibrary(library);
      void api.syncPush();
      return library;
    },
    createCourse: async (name: string) => {
      const library = ensureLibrary();
      const now = new Date().toISOString();
      library.courses.push({
        id: newId("course"),
        name: String(name || "").trim() || "新建分类",
        createdAt: now,
        updatedAt: now,
        noteIds: [],
      });
      persistLibrary(library);
      void api.syncPush();
      return library;
    },

    listResources: async () => ensureLibrary().resources || [],
    pickResources: async (category?: string) => {
      const resources = ensureLibrary().resources || [];
      return category ? resources.filter((item) => item.category === category) : resources;
    },
    addResourceLink: async (input: { url: string; title?: string }) => {
      const library = ensureLibrary();
      const now = new Date().toISOString();
      library.resources.push({
        id: newId("res"),
        title: input.title?.trim() || input.url,
        kind: "link",
        category: "链接",
        url: input.url,
        createdAt: now,
        updatedAt: now,
      });
      persistLibrary(library);
      void api.syncPush();
      return library.resources;
    },
    addResourceNote: async (input: { title: string; content: string }) => {
      const library = ensureLibrary();
      const id = newId("res");
      const now = new Date().toISOString();
      localStorage.setItem(RES_PREFIX + id, String(input.content || ""));
      library.resources.push({
        id,
        title: input.title?.trim() || "直接资料",
        kind: "note",
        category: "资料",
        contentPath: id,
        createdAt: now,
        updatedAt: now,
      });
      persistLibrary(library);
      void api.syncPush();
      return library.resources;
    },
    addResourceFile: async (input: { file: File; title?: string; category?: string }) => {
      const library = ensureLibrary();
      const id = newId("res");
      const now = new Date().toISOString();
      const dataUrl = await fileToDataUrl(input.file);
      localStorage.setItem(RES_ASSET_PREFIX + id, dataUrl);
      const resource: ResourceItem = {
        id,
        title: input.title?.trim() || input.file.name || "手机文件",
        kind: "file",
        category: input.category || "资料",
        createdAt: now,
        updatedAt: now,
      };
      library.resources.push(resource);
      persistLibrary(library);
      void api.syncPush();
      return library.resources;
    },
    readResourceNote: async (id: string) => localStorage.getItem(RES_PREFIX + id) || "",
    saveResourceNote: async (id: string, input: { title: string; content: string }) => {
      const library = ensureLibrary();
      const resource = library.resources.find((item) => item.id === id && item.kind === "note");
      if (resource) {
        resource.title = input.title?.trim() || resource.title;
        resource.updatedAt = new Date().toISOString();
        localStorage.setItem(RES_PREFIX + id, String(input.content || ""));
      }
      persistLibrary(library);
      void api.syncPush();
      return library.resources;
    },
    removeResource: async (id: string) => {
      const library = ensureLibrary();
      syncCore.markDeleted(library, syncCore.TYPES.resource, id);
      library.resources = library.resources.filter((item) => item.id !== id);
      localStorage.removeItem(RES_PREFIX + id);
      localStorage.removeItem(RES_ASSET_PREFIX + id);
      persistLibrary(library);
      void api.syncPush();
      return library.resources;
    },
    openResourceFile: async (id: string) => {
      const library = ensureLibrary();
      const resource = library.resources.find((item) => item.id === id);
      if (!resource) return false;
      if (resource.kind === "link" && resource.url) {
        window.open(resource.url, "_blank");
        return true;
      }
      if (resource.kind === "note") {
        window.open("", "_blank")?.document.write(`<pre>${escapeHtml(localStorage.getItem(RES_PREFIX + id) || "")}</pre>`);
        return true;
      }
      const localData = localStorage.getItem(RES_ASSET_PREFIX + id);
      if (localData) {
        const url = URL.createObjectURL(dataUrlToBlob(localData));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = resource.title;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        return true;
      }
      const config = readSyncConfig();
      if (config.provider === "gitee" && resource.assetPath) {
        try {
          const content = await giteeGetFile(resource.assetPath);
          if (!content) return false;
          const binary = atob(content);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
          const blob = new Blob([bytes], { type: "application/octet-stream" });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = resource.title;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          setTimeout(() => URL.revokeObjectURL(url), 10000);
          return true;
        } catch {
          return false;
        }
      }
      if (config.provider === "github" && resource.assetPath) {
        try {
          const { owner, repo } = githubApiConfig();
          const response = await githubRequest(
            `repos/${owner}/${repo}/contents/${encodeGithubPath(resource.assetPath)}`,
            "GET",
          );
          if (!response.ok) return false;
          const data = (await response.json()) as { content?: string };
          const binary = atob(data.content || "");
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
          const blob = new Blob([bytes], { type: "application/octet-stream" });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = resource.title;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          setTimeout(() => URL.revokeObjectURL(url), 10000);
          return true;
        } catch {
          return false;
        }
      }
      if (!resource.assetPath || !syncConfigured()) return false;
      try {
        const response = await syncRequest(resource.assetPath, "GET");
        if (!response.ok) return false;
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = resource.title;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        return true;
      } catch {
        return false;
      }
    },

    listPlans: async () => ensureLibrary().plans || [],
    savePlan: async (payload: Partial<PlanItem>) => {
      const library = ensureLibrary();
      const now = new Date().toISOString();
      const existing = library.plans.find((plan) => plan.id === payload.id);
      const plan: PlanItem = {
        id: existing?.id || newId("plan"),
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
      persistLibrary(library);
      void api.syncPush();
      return { plans: library.plans, plan };
    },
    removePlan: async (id: string) => {
      const library = ensureLibrary();
      syncCore.markDeleted(library, syncCore.TYPES.plan, id);
      library.plans = library.plans.filter((plan) => plan.id !== id);
      persistLibrary(library);
      void api.syncPush();
      return library.plans;
    },

    listWords: async () => ensureLibrary().customWords || [],
    addWord: async (input: Omit<StudyWord, "id">) => {
      const library = ensureLibrary();
      const words = library.customWords || [];
      const now = new Date().toISOString();
      words.push({
        id: newId("word"),
        word: String(input.word || "").trim(),
        phonetic: String(input.phonetic || "").trim(),
        meaning: String(input.meaning || "").trim(),
        sentence: String(input.sentence || "").trim(),
        sentenceMeaning: String(input.sentenceMeaning || "").trim(),
        createdAt: now,
        updatedAt: now,
      });
      library.customWords = words;
      persistLibrary(library);
      void api.syncPush();
      return words;
    },
    removeWord: async (id: string) => {
      const library = ensureLibrary();
      syncCore.markDeleted(library, syncCore.TYPES.word, id);
      const next = (library.customWords || []).filter((word) => word.id !== id);
      library.customWords = next;
      persistLibrary(library);
      void api.syncPush();
      return next;
    },
    enrichWord: async (word: string) => {
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
      } catch {
        return empty;
      }
    },
    listSentences: async () => ensureLibrary().customSentences || [],
    addSentence: async (input: Omit<StudySentence, "id">) => {
      const library = ensureLibrary();
      const sentences = library.customSentences || [];
      const now = new Date().toISOString();
      sentences.push({
        id: newId("sentence"),
        english: String(input.english || "").trim(),
        chinese: String(input.chinese || "").trim(),
        words: Array.isArray(input.words) ? input.words : [],
        createdAt: now,
        updatedAt: now,
      });
      library.customSentences = sentences;
      persistLibrary(library);
      void api.syncPush();
      return sentences;
    },
    removeSentence: async (id: string) => {
      const library = ensureLibrary();
      syncCore.markDeleted(library, syncCore.TYPES.sentence, id);
      const next = (library.customSentences || []).filter((sentence) => sentence.id !== id);
      library.customSentences = next;
      persistLibrary(library);
      void api.syncPush();
      return next;
    },
    updateSentence: async (id: string, input: Partial<Omit<StudySentence, "id">>) => {
      const library = ensureLibrary();
      const sentence = (library.customSentences || []).find((item) => item.id === id);
      if (sentence) {
        if (typeof input.english === "string") sentence.english = input.english;
        if (typeof input.chinese === "string") sentence.chinese = input.chinese;
        if (Array.isArray(input.words)) sentence.words = input.words;
        sentence.updatedAt = new Date().toISOString();
        persistLibrary(library);
        void api.syncPush();
      }
      return library.customSentences || [];
    },

    syncGetConfig: async () => readSyncConfig(),
    syncSaveConfig: async (config: SyncConfig) => {
      const provider =
        config.provider === "webdav" ? "webdav" : config.provider === "github" ? "github" : "gitee";
      const clean = {
        provider: provider as "webdav" | "github" | "gitee",
        url: String(config.url || "").trim(),
        username: String(config.username || "").trim(),
        password: String(config.password || "").trim(),
        token: String(config.token || config.password || "").trim(),
        repo: String(config.repo || "gaga-study-sync").trim(),
        proxy: provider === "webdav" ? String(config.proxy || "").trim() : "",
      };
      writeJSON(SYNC_KEY, clean);
      return clean;
    },
    syncTest: async () => {
      if (!syncConfigured()) return { ok: false, message: "请先保存同步配置" };
      if (giteeConfigured()) {
        try {
          const { owner, repo } = giteeApiConfig();
          const response = await giteeRequest(
            `repos/${owner}/${repo}/contents/gaga-study-data.json`,
            "GET",
          );
          if (response.status === 200 || response.status === 404) return { ok: true, message: "连接成功，可以开始同步" };
          return { ok: false, message: `连接失败，HTTP ${response.status}` };
        } catch (error) {
          return { ok: false, message: error instanceof Error ? error.message : String(error) };
        }
      }
      if (githubConfigured()) {
        try {
          const { owner, repo } = githubApiConfig();
          const response = await githubRequest(
            `repos/${owner}/${repo}/contents/gaga-study-data.json`,
            "GET",
          );
          if (response.status === 200 || response.status === 404) return { ok: true, message: "连接成功，可以开始同步" };
          return { ok: false, message: `连接失败，HTTP ${response.status}` };
        } catch (error) {
          return { ok: false, message: error instanceof Error ? error.message : String(error) };
        }
      }
      const config = readSyncConfig();
      if (config.provider === "gitee") return { ok: false, message: "Gitee 配置不完整，请检查用户名、仓库和访问令牌" };
      if (config.provider === "github") return { ok: false, message: "GitHub 配置不完整，请检查用户名、仓库和访问令牌" };
      try {
        const response = await syncRequest("gaga-study-data.json", "GET");
        if (response.status === 200 || response.status === 404) return { ok: true, message: "连接成功，可以开始同步" };
        return { ok: false, message: `连接失败，HTTP ${response.status}` };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    },
    syncPush: async () => {
      if (pushInFlight) return pushInFlight;
      pushInFlight = (async () => {
        if (!syncConfigured()) return { ok: false, message: "请先保存同步配置" };
        if (giteeConfigured()) return pushGiteeSync();
        if (githubConfigured()) return pushGithubSync();
        try {
          const library = ensureLibrary();
          const notes: Record<string, NoteDoc> = {};
          for (const meta of Object.values(library.notes)) {
            const note = readNote(meta.id);
            if (note) notes[meta.id] = note;
          }
          const resourceNotes: Record<string, string> = {};
          for (const resource of library.resources || []) {
            if (resource.kind === "note") resourceNotes[resource.id] = localStorage.getItem(RES_PREFIX + resource.id) || "";
          }
          const bundle = syncCore.buildBundle(library, notes, resourceNotes, getDeviceId());
          for (const resource of bundle.resources) {
            if (resource.kind !== "file") continue;
            const localData = localStorage.getItem(RES_ASSET_PREFIX + resource.id);
            if (!localData) continue;
            const hash = await hashText(localData);
            const safeName = encodeURIComponent(resource.title || "file");
            const assetPath = `gaga-study-assets/${hash}-${safeName}`;
            const upload = await syncRequest(assetPath, "PUT", dataUrlToBlob(localData));
            if (!upload.ok) return { ok: false, message: `文件上传失败，HTTP ${upload.status}` };
            resource.assetPath = assetPath;
            bundle.assets[hash] = { size: localData.length, updatedAt: new Date().toISOString() };
            const localResource = library.resources.find((item) => item.id === resource.id);
            if (localResource) localResource.assetPath = assetPath;
          }
          persistLibrary(library);
          const response = await syncRequest("gaga-study-data.json", "PUT", bundle);
          if (!response.ok) return { ok: false, message: `上传失败，HTTP ${response.status}` };
          return {
            ok: true,
            message: `已上传 ${Object.keys(bundle.notes).length} 篇笔记、${bundle.customWords.length} 个单词`,
          };
        } catch (error) {
          return { ok: false, message: error instanceof Error ? error.message : String(error) };
        }
      })();
      try {
        return await pushInFlight;
      } finally {
        pushInFlight = null;
      }
    },
    syncPull: async () => {
      if (!syncConfigured()) return { ok: false, message: "请先保存同步配置" };
      if (giteeConfigured()) return pullGiteeSync();
      if (githubConfigured()) return pullGithubSync();
      try {
        const response = await syncRequest("gaga-study-data.json", "GET");
        if (response.status === 404) return { ok: false, message: "云端还没有数据，请先在其他设备上传一次" };
        if (!response.ok) return { ok: false, message: `拉取失败，HTTP ${response.status}` };
        const remote = await response.json();
        const library = ensureLibrary();
        const notes: Record<string, NoteDoc> = {};
        for (const meta of Object.values(library.notes)) {
          const note = readNote(meta.id);
          if (note) notes[meta.id] = note;
        }
        const resourceNotes: Record<string, string> = {};
        for (const resource of library.resources || []) {
          if (resource.kind === "note") resourceNotes[resource.id] = localStorage.getItem(RES_PREFIX + resource.id) || "";
        }
        const local = syncCore.buildBundle(library, notes, resourceNotes, getDeviceId());
        const merged = syncCore.mergeBundles(local, remote);
        const storage = syncCore.bundleToStorage(merged);
        persistLibrary(storage.library);
        for (const note of Object.values(storage.notes)) writeNote(note as NoteDoc);
        for (const [id, content] of Object.entries(storage.resourceNotes)) {
          localStorage.setItem(RES_PREFIX + id, String(content));
        }
        for (const id of Object.keys(local.notes)) {
          if (!merged.notes[id]) localStorage.removeItem(NOTE_PREFIX + id);
        }
        for (const id of Object.keys(local.resourceNotes)) {
          if (!merged.resourceNotes[id]) localStorage.removeItem(RES_PREFIX + id);
        }
        return {
          ok: true,
          message: `已拉取 ${Object.keys(storage.notes).length} 篇笔记、${(storage.library.customWords || []).length} 个单词`,
        };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    },
    syncPushNotes: async () => api.syncPush(),
    syncPullNotes: async () => api.syncPull(),
  };

  window.studyNotes = api;
}
