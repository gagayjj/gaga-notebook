const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("studyNotes", {
  openVideoDialog: () => ipcRenderer.invoke("video:open"),
  captureVideoFrame: () => ipcRenderer.invoke("video:capture-frame"),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  localVideoUrl: (filePath) => {
    const encoded = encodeURIComponent(filePath);
    return `localvideo://local/${encoded}`;
  },
  openUrl: (url) => ipcRenderer.invoke("video:open-url", url),
  setVideoVisible: (visible, url) => ipcRenderer.invoke("video:set-visible", visible, url),
  closeUrl: () => ipcRenderer.send("video:close-url"),
  setVideoBounds: (bounds) => ipcRenderer.send("video:bounds", bounds),
  setAlwaysOnTop: (flag) => ipcRenderer.invoke("window:always-on-top", flag),
  setNarrowMode: (flag) => ipcRenderer.invoke("window:narrow", flag),
  openExternal: (url) => ipcRenderer.invoke("shell:open-external", url),
  onVideoStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("video:status", listener);
    return () => ipcRenderer.removeListener("video:status", listener);
  },
  listNotes: () => ipcRenderer.invoke("notes:list"),
  readNote: (id) => ipcRenderer.invoke("notes:read", id),
  saveNote: (payload) => ipcRenderer.invoke("notes:save", payload),
  createNote: (input) => ipcRenderer.invoke("notes:create", input),
  listResources: () => ipcRenderer.invoke("resources:list"),
  pickResources: (category) => ipcRenderer.invoke("resources:pick", category),
  addResourceLink: (input) => ipcRenderer.invoke("resources:add-link", input),
  removeResource: (id) => ipcRenderer.invoke("resources:remove", id),
  openResourceFile: (filePath) => ipcRenderer.invoke("resources:open-file", filePath),
  listPlans: () => ipcRenderer.invoke("plans:list"),
  savePlan: (payload) => ipcRenderer.invoke("plans:save", payload),
  removePlan: (id) => ipcRenderer.invoke("plans:remove", id),
});
