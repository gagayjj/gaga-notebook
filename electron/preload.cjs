const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("studyNotes", {
  openVideoDialog: () => ipcRenderer.invoke("video:open"),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  localVideoUrl: (filePath) => {
    const encoded = encodeURIComponent(filePath);
    return `localvideo://local/${encoded}`;
  },
  openUrl: (url) => ipcRenderer.invoke("video:open-url", url),
  closeUrl: () => ipcRenderer.send("video:close-url"),
  setVideoBounds: (bounds) => ipcRenderer.send("video:bounds", bounds),
  setAlwaysOnTop: (flag) => ipcRenderer.invoke("window:always-on-top", flag),
  setNarrowMode: (flag) => ipcRenderer.invoke("window:narrow", flag),
  openExternal: (url) => ipcRenderer.invoke("shell:open-external", url),
  listNotes: () => ipcRenderer.invoke("notes:list"),
  readNote: (id) => ipcRenderer.invoke("notes:read", id),
  saveNote: (payload) => ipcRenderer.invoke("notes:save", payload),
  createNote: (input) => ipcRenderer.invoke("notes:create", input),
});
