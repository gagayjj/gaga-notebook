import type { Course, Library, NoteDoc, PlanItem, ResourceItem, StudySentence, StudyWord } from "../types";

export interface SyncBundle {
  version: number;
  updatedAt: string;
  deviceId: string;
  courses: Course[];
  notes: Record<string, NoteDoc>;
  resources: ResourceItem[];
  resourceNotes: Record<string, string>;
  plans: PlanItem[];
  customWords: StudyWord[];
  customSentences: StudySentence[];
  tombstones: Record<string, string>;
  assets: Record<string, { size: number; updatedAt: string }>;
}

export interface SyncStorage {
  library: Library;
  notes: Record<string, NoteDoc>;
  resourceNotes: Record<string, string>;
}

export const TYPES = {
  course: "course",
  note: "note",
  resource: "resource",
  plan: "plan",
  word: "word",
  sentence: "sentence",
} as const;

export function key(type: string, id: string) {
  return `${type}:${id}`;
}

export function entityTime(entity: { updatedAt?: string; createdAt?: string } | null | undefined) {
  return entity?.updatedAt || entity?.createdAt || "";
}

export function ensureSync(library: Library, deviceId?: string) {
  library.sync = library.sync || { deviceId: "", tombstones: {}, assets: {} };
  library.sync.deviceId = deviceId || library.sync.deviceId || "device-local";
  return library.sync as NonNullable<Library["sync"]>;
}

export function buildBundle(
  library: Library,
  notes: Record<string, NoteDoc>,
  resourceNotes: Record<string, string>,
  deviceId?: string,
): SyncBundle {
  const sync = ensureSync(library, deviceId);
  const now = new Date().toISOString();
  return {
    version: 2,
    updatedAt: now,
    deviceId: sync.deviceId || "device-local",
    courses: (library.courses || []).map((course) => ({
      ...course,
      updatedAt: course.updatedAt || course.createdAt || now,
    })),
    notes: notes || {},
    resources: (library.resources || []).map((item) => {
      const resource = {
        ...item,
        updatedAt: item.updatedAt || item.createdAt || now,
      };
      delete resource.path;
      delete resource.contentPath;
      return resource;
    }),
    resourceNotes: resourceNotes || {},
    plans: (library.plans || []).map((plan) => ({
      ...plan,
      updatedAt: plan.updatedAt || plan.createdAt || now,
    })),
    customWords: (library.customWords || []).map((word) => ({
      ...word,
      updatedAt: word.updatedAt || word.createdAt || now,
    })),
    customSentences: (library.customSentences || []).map((sentence) => ({
      ...sentence,
      updatedAt: sentence.updatedAt || sentence.createdAt || now,
    })),
    tombstones: { ...(sync.tombstones || {}) },
    assets: { ...(sync.assets || {}) },
  };
}

function mergeTombstones(local?: Record<string, string>, remote?: Record<string, string>) {
  const out = { ...(local || {}) };
  for (const [id, time] of Object.entries(remote || {})) {
    if (!out[id] || time > out[id]) out[id] = time;
  }
  return out;
}

function mergeLists<T extends { id: string; updatedAt?: string; createdAt?: string }>(
  localList: T[] | undefined,
  remoteList: T[] | undefined,
  tombstones: Record<string, string>,
  type: string,
) {
  const byId = new Map<string, T>();
  for (const item of localList || []) byId.set(item.id, item);
  for (const item of remoteList || []) byId.set(item.id, item);
  const out: T[] = [];
  for (const item of byId.values()) {
    const deletedAt = tombstones[key(type, item.id)];
    if (deletedAt && deletedAt >= entityTime(item)) continue;
    const local = (localList || []).find((entry) => entry.id === item.id);
    const remote = (remoteList || []).find((entry) => entry.id === item.id);
    if (remote && local && entityTime(remote) > entityTime(local)) out.push(remote);
    else {
      const chosen = local || remote;
      if (chosen) out.push(chosen);
    }
  }
  return out;
}

function mergeNoteMaps(
  localNotes: Record<string, NoteDoc> | undefined,
  remoteNotes: Record<string, NoteDoc> | undefined,
  tombstones: Record<string, string>,
) {
  const ids = new Set([...Object.keys(localNotes || {}), ...Object.keys(remoteNotes || {})]);
  const out: Record<string, NoteDoc> = {};
  for (const id of ids) {
    const deletedAt = tombstones[key(TYPES.note, id)];
    const local = localNotes?.[id];
    const remote = remoteNotes?.[id];
    const localTime = entityTime(local?.meta);
    const remoteTime = entityTime(remote?.meta);
    const latest = localTime > remoteTime ? localTime : remoteTime;
    if (deletedAt && deletedAt >= latest) continue;
    if (remote && local && remoteTime > localTime) out[id] = remote;
    else if (local) out[id] = local;
    else if (remote) out[id] = remote;
  }
  return out;
}

function mergeResourceNotes(
  resources: ResourceItem[],
  localNotes?: Record<string, string>,
  remoteNotes?: Record<string, string>,
) {
  const out: Record<string, string> = {};
  for (const resource of resources || []) {
    if (resource.kind !== "note") continue;
    const local = localNotes?.[resource.id];
    const remote = remoteNotes?.[resource.id];
    out[resource.id] = remote ?? local ?? "";
  }
  return out;
}

function mergeAssets(
  local?: Record<string, { size: number; updatedAt: string }>,
  remote?: Record<string, { size: number; updatedAt: string }>,
) {
  const out = { ...(local || {}) };
  for (const [hash, meta] of Object.entries(remote || {})) {
    if (!out[hash] || meta.updatedAt > out[hash].updatedAt) out[hash] = meta;
  }
  return out;
}

export function mergeBundles(local: SyncBundle | undefined, remote: SyncBundle): SyncBundle {
  if (!remote) return local as SyncBundle;
  const tombstones = mergeTombstones(local?.tombstones, remote.tombstones);
  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    deviceId: remote.deviceId || local?.deviceId || "device-local",
    courses: mergeLists(local?.courses, remote.courses, tombstones, TYPES.course),
    notes: mergeNoteMaps(local?.notes, remote.notes, tombstones),
    resources: mergeLists(local?.resources, remote.resources, tombstones, TYPES.resource),
    resourceNotes: mergeResourceNotes(
      mergeLists(local?.resources, remote.resources, tombstones, TYPES.resource),
      local?.resourceNotes,
      remote.resourceNotes,
    ),
    plans: mergeLists(local?.plans, remote.plans, tombstones, TYPES.plan),
    customWords: mergeLists(local?.customWords, remote.customWords, tombstones, TYPES.word),
    customSentences: mergeLists(local?.customSentences, remote.customSentences, tombstones, TYPES.sentence),
    tombstones,
    assets: mergeAssets(local?.assets, remote.assets),
  };
}

export function bundleToStorage(bundle: SyncBundle): SyncStorage {
  const notesMeta: Library["notes"] = {};
  for (const [id, note] of Object.entries(bundle.notes || {})) notesMeta[id] = note.meta;
  return {
    library: {
      version: 2,
      courses: bundle.courses || [],
      notes: notesMeta,
      resources: bundle.resources || [],
      plans: bundle.plans || [],
      customWords: bundle.customWords || [],
      customSentences: bundle.customSentences || [],
      sync: {
        deviceId: bundle.deviceId || "device-local",
        tombstones: bundle.tombstones || {},
        assets: bundle.assets || {},
      },
    },
    notes: bundle.notes || {},
    resourceNotes: bundle.resourceNotes || {},
  };
}

export function markDeleted(library: Library, type: string, id: string, time?: string) {
  const sync = ensureSync(library);
  sync.tombstones = sync.tombstones || {};
  sync.tombstones[key(type, id)] = time || new Date().toISOString();
  return sync;
}
