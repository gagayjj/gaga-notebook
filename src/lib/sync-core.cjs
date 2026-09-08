const TYPES = {
  course: "course",
  note: "note",
  resource: "resource",
  plan: "plan",
  word: "word",
  sentence: "sentence",
};

function key(type, id) {
  return `${type}:${id}`;
}

function entityTime(entity) {
  return entity?.updatedAt || entity?.createdAt || "";
}

function ensureSync(library, deviceId) {
  library.sync = library.sync || { deviceId: "", tombstones: {}, assets: {} };
  library.sync.deviceId = deviceId || library.sync.deviceId || "device-local";
  return library.sync;
}

function buildBundle(library, notes, resourceNotes, deviceId) {
  const sync = ensureSync(library, deviceId);
  const now = new Date().toISOString();
  return {
    version: 2,
    updatedAt: now,
    deviceId: sync.deviceId,
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

function mergeTombstones(local, remote) {
  const out = { ...(local || {}) };
  for (const [id, time] of Object.entries(remote || {})) {
    if (!out[id] || time > out[id]) out[id] = time;
  }
  return out;
}

function mergeLists(localList, remoteList, tombstones, type) {
  const byId = new Map();
  for (const item of localList || []) byId.set(item.id, item);
  for (const item of remoteList || []) byId.set(item.id, item);
  const out = [];
  for (const item of byId.values()) {
    const deletedAt = tombstones[key(type, item.id)];
    if (deletedAt && deletedAt >= entityTime(item)) continue;
    const local = (localList || []).find((entry) => entry.id === item.id);
    const remote = (remoteList || []).find((entry) => entry.id === item.id);
    if (remote && local && entityTime(remote) > entityTime(local)) out.push(remote);
    else out.push(local || remote);
  }
  return out;
}

function mergeNoteMaps(localNotes, remoteNotes, tombstones) {
  const ids = new Set([...Object.keys(localNotes || {}), ...Object.keys(remoteNotes || {})]);
  const out = {};
  for (const id of ids) {
    const deletedAt = tombstones[key(TYPES.note, id)];
    const local = localNotes?.[id];
    const remote = remoteNotes?.[id];
    const localTime = entityTime(local?.meta);
    const remoteTime = entityTime(remote?.meta);
    if (deletedAt && deletedAt >= Math.max(localTime, remoteTime)) continue;
    if (remote && local && remoteTime > localTime) out[id] = remote;
    else out[id] = local || remote;
  }
  return out;
}

function mergeResourceNotes(resources, localNotes, remoteNotes) {
  const out = {};
  for (const resource of resources || []) {
    if (resource.kind !== "note") continue;
    const local = localNotes?.[resource.id];
    const remote = remoteNotes?.[resource.id];
    out[resource.id] = remote ?? local ?? "";
  }
  return out;
}

function mergeAssets(localAssets, remoteAssets) {
  const out = { ...(localAssets || {}) };
  for (const [hash, meta] of Object.entries(remoteAssets || {})) {
    if (!out[hash] || meta.updatedAt > out[hash].updatedAt) out[hash] = meta;
  }
  return out;
}

function mergeBundles(local, remote) {
  if (!remote) return local;
  const tombstones = mergeTombstones(local?.tombstones, remote.tombstones);
  const courses = mergeLists(local?.courses, remote.courses, tombstones, TYPES.course);
  const notes = mergeNoteMaps(local?.notes, remote.notes, tombstones);
  const resources = mergeLists(local?.resources, remote.resources, tombstones, TYPES.resource);
  const resourceNotes = mergeResourceNotes(resources, local?.resourceNotes, remote.resourceNotes);
  const plans = mergeLists(local?.plans, remote.plans, tombstones, TYPES.plan);
  const customWords = mergeLists(local?.customWords, remote.customWords, tombstones, TYPES.word);
  const customSentences = mergeLists(local?.customSentences, remote.customSentences, tombstones, TYPES.sentence);
  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    deviceId: remote.deviceId || local?.deviceId || "device-local",
    courses,
    notes,
    resources,
    resourceNotes,
    plans,
    customWords,
    customSentences,
    tombstones,
    assets: mergeAssets(local?.assets, remote.assets),
  };
}

function bundleToStorage(bundle) {
  const notesMeta = {};
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

function markDeleted(library, type, id, time) {
  const sync = ensureSync(library, "");
  sync.tombstones[key(type, id)] = time || new Date().toISOString();
  return sync;
}

module.exports = {
  TYPES,
  key,
  entityTime,
  ensureSync,
  buildBundle,
  mergeBundles,
  bundleToStorage,
  markDeleted,
};
