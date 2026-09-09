/* GAGA的笔记本 · 手机端云同步
 * 与电脑版共用同一个 Gitee 私有仓库，手机在任意网络（不同 WiFi / 蜂窝）都能同步。
 * Gitee API 允许跨域（Access-Control-Allow-Origin: *），所以手机浏览器可直连，无需服务器。
 */
(function () {
  var API = "https://gitee.com/api/v5";
  var FILE = "gaga-study-data.json";
  var CFG_KEY = "gaga-sync-config";
  var LAST_KEY = "gaga-sync-last";

  function $(id) { return document.getElementById(id); }

  /* ---------- 配置 ---------- */
  function getCfg() {
    try { return JSON.parse(localStorage.getItem(CFG_KEY)) || {}; } catch (e) { return {}; }
  }
  function setCfg(cfg) { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); }

  /* ---------- 时间处理（手机端是中文本地串，云端是 ISO） ---------- */
  function toTime(v) {
    if (!v) return 0;
    if (typeof v === "number") return v;
    var s = String(v).trim();
    // 手机端格式 "2026/9/9 18:00:00"
    var m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})[\sT](\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
      return new Date(
        +m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0
      ).getTime();
    }
    var t = Date.parse(s);
    return isNaN(t) ? 0 : t;
  }
  function nowISO() { return new Date().toISOString(); }

  /* ---------- TipTap <-> 纯文本 ---------- */
  function tiptapToText(doc) {
    if (!doc || !doc.content) return "";
    var out = [];
    function walk(node) {
      if (node.type === "text") { out.push(node.text || ""); return; }
      if (node.content && node.content.length) {
        node.content.forEach(walk);
      }
      if (node.type === "paragraph" || node.type === "heading" || node.type === "blockquote") out.push("\n");
    }
    doc.content.forEach(walk);
    return out.join("").replace(/\n{3,}/g, "\n\n").trim();
  }

  function textToTiptap(text) {
    var lines = String(text || "").split(/\r?\n/);
    var content = lines.map(function (line) {
      return { type: "paragraph", content: line ? [{ type: "text", text: line }] : [] };
    });
    if (!content.length) content = [{ type: "paragraph", content: [] }];
    return { type: "doc", content: content };
  }

  /* ---------- Base64（支持中文） ---------- */
  function toB64(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function fromB64(b64) {
    var bin = atob(String(b64).replace(/\s/g, ""));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  /* ---------- Gitee API ---------- */
  function apiUrl(path, token) {
    return API + "/" + path + (path.indexOf("?") >= 0 ? "&" : "?") + "access_token=" + encodeURIComponent(token);
  }

  async function giteeGetFile(token, owner, repo, path) {
    var res = await fetch(apiUrl("repos/" + owner + "/" + repo + "/contents/" + path, token), {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (res.status === 404) return null; // 文件还不存在
    if (!res.ok) throw new Error("读取云端失败 HTTP " + res.status);
    return await res.json();
  }

  // Gitee 规则：文件不存在用 POST 创建，已存在用 PUT 更新（PUT 必须带 sha）
  async function giteePutFile(token, owner, repo, path, contentStr, sha, message) {
    var body = {
      access_token: token,
      content: toB64(contentStr),
      message: message || "update from mobile",
      branch: "master",
    };
    var method = "POST";
    if (sha) {
      body.sha = sha;
      method = "PUT";
    }
    var res = await fetch(API + "/repos/" + owner + "/" + repo + "/contents/" + path, {
      method: method,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      var txt = await res.text();
      throw new Error("写入云端失败 HTTP " + res.status + " " + txt.slice(0, 150));
    }
    return await res.json();
  }

  /* ---------- 数据合并 ---------- */
  // 云端 note 结构: { meta: {...}, content: {type:'doc',content:[...]}, markers: [], floatingImages: [] }
  function cloudNoteToLocal(id, cn) {
    var meta = cn.meta || {};
    return {
      id: id,
      title: meta.title || "未命名",
      content: tiptapToText(cn.content),
      updatedAt: meta.updatedAt || cn.updatedAt || nowISO(),
      syncedAt: nowISO(),
    };
  }
  function localNoteToCloud(ln) {
    var ts = toTime(ln.updatedAt) || Date.now();
    return {
      meta: {
        id: ln.id,
        title: ln.title || "未命名",
        courseId: ln.courseId || "",
        tags: ln.tags || [],
        createdAt: ln.createdAt || new Date(ts).toISOString(),
        updatedAt: new Date(ts).toISOString(),
      },
      content: textToTiptap(ln.content || ""),
      markers: [],
      floatingImages: [],
    };
  }

  function wordKey(w) { return String(w.word || "").trim().toLowerCase(); }

  function cloudWordToLocal(cw) {
    return {
      id: cw.id,
      word: cw.word || "",
      phonetic: cw.phonetic || "",
      meaning: cw.meaning || "",
      sentence: cw.sentence || "",
      cn: cw.sentenceMeaning || "",
      updatedAt: cw.updatedAt || nowISO(),
    };
  }
  function localWordToCloud(lw) {
    var ts = toTime(lw.updatedAt) || Date.now();
    return {
      id: lw.id || "word-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      word: lw.word || "",
      phonetic: lw.phonetic || "",
      meaning: lw.meaning || "",
      sentence: lw.sentence || "",
      sentenceMeaning: lw.cn || "",
      createdAt: lw.createdAt || new Date(ts).toISOString(),
      updatedAt: new Date(ts).toISOString(),
    };
  }

  /* ---------- 主同步流程 ---------- */
  async function syncNow(opts) {
    opts = opts || {};
    var cfg = getCfg();
    var token = (cfg.token || "").trim();
    var owner = (cfg.owner || "").trim();
    var repo = (cfg.repo || "").trim();
    if (!token || !owner || !repo) {
      setStatus("请先填写仓库和令牌", "error");
      return { ok: false, reason: "no-config" };
    }

    setStatus("正在读取云端…", "busy");
    var cloud = null;
    var cloudData = null;
    var sha = null;
    try {
      cloud = await giteeGetFile(token, owner, repo, FILE);
      if (cloud) {
        sha = cloud.sha;
        cloudData = JSON.parse(fromB64(cloud.content));
      }
    } catch (e) {
      setStatus(e.message, "error");
      return { ok: false, reason: "pull" };
    }

    if (!cloudData) {
      cloudData = { version: 2, updatedAt: nowISO(), courses: [], notes: {}, resources: [], resourceNotes: {}, plans: [], customWords: [], customSentences: [], tombstones: {}, assets: {} };
    }
    cloudData.notes = cloudData.notes || {};
    cloudData.customWords = cloudData.customWords || [];

    // 1) 云端 -> 手机（补齐手机上没有的、或云端更新的）
    var localNotes = read(STORE.notes, []);
    var localWords = read(STORE.words, []);
    var downNotes = 0, downWords = 0;

    var noteById = {};
    localNotes.forEach(function (n) { noteById[n.id] = n; });
    Object.keys(cloudData.notes).forEach(function (id) {
      var cn = cloudData.notes[id];
      var ln = noteById[id];
      var cloudTime = toTime((cn.meta && cn.meta.updatedAt) || cn.updatedAt);
      if (!ln) {
        localNotes.push(cloudNoteToLocal(id, cn));
        downNotes++;
      } else if (cloudTime > toTime(ln.updatedAt)) {
        var idx = localNotes.findIndex(function (x) { return x.id === id; });
        if (idx >= 0) { localNotes[idx] = cloudNoteToLocal(id, cn); downNotes++; }
      }
    });

    var wordByKey = {};
    localWords.forEach(function (w) { wordByKey[wordKey(w)] = w; });
    cloudData.customWords.forEach(function (cw) {
      var k = wordKey(cw);
      var lw = wordByKey[k];
      if (!lw) {
        localWords.push(cloudWordToLocal(cw));
        downWords++;
      } else if (toTime(cw.updatedAt) > toTime(lw.updatedAt)) {
        var idx = localWords.findIndex(function (x) { return wordKey(x) === k; });
        if (idx >= 0) { localWords[idx] = cloudWordToLocal(cw); downWords++; }
      }
    });

    // 2) 手机 -> 云端（补齐云端没有的、或手机更新的）
    var upNotes = 0, upWords = 0;
    localNotes.forEach(function (ln) {
      var cn = cloudData.notes[ln.id];
      var localTime = toTime(ln.updatedAt);
      if (!cn) {
        cloudData.notes[ln.id] = localNoteToCloud(ln);
        upNotes++;
      } else if (localTime > toTime((cn.meta && cn.meta.updatedAt) || cn.updatedAt)) {
        cloudData.notes[ln.id] = localNoteToCloud(ln);
        upNotes++;
      }
    });
    localWords.forEach(function (lw) {
      var k = wordKey(lw);
      var cw = cloudData.customWords.filter(function (x) { return wordKey(x) === k; })[0];
      if (!cw) {
        cloudData.customWords.push(localWordToCloud(lw));
        upWords++;
      } else if (toTime(lw.updatedAt) > toTime(cw.updatedAt)) {
        var idx = cloudData.customWords.findIndex(function (x) { return wordKey(x) === k; });
        if (idx >= 0) { cloudData.customWords[idx] = localWordToCloud(lw); upWords++; }
      }
    });

    // 3) 写回手机本地并刷新界面
    write(STORE.notes, localNotes);
    write(STORE.words, localWords);
    try {
      if (typeof notes !== "undefined") notes = localNotes;
      if (typeof words !== "undefined") words = localWords;
      if (typeof renderNotes === "function") renderNotes();
      if (typeof renderWords === "function") renderWords();
      if (typeof renderMine === "function") renderMine();
    } catch (e) { /* 界面刷新失败不影响同步结果 */ }

    // 4) 推送到云端
    setStatus("正在写入云端…", "busy");
    cloudData.updatedAt = nowISO();
    try {
      await giteePutFile(token, owner, repo, FILE, JSON.stringify(cloudData), sha, "sync from mobile " + new Date().toLocaleString("zh-CN"));
    } catch (e) {
      setStatus(e.message, "error");
      return { ok: false, reason: "push" };
    }

    localStorage.setItem(LAST_KEY, nowISO());
    var msg = "同步完成：下载 " + (downNotes + downWords) + " 项，上传 " + (upNotes + upWords) + " 项";
    setStatus(msg, "ok");
    return { ok: true, down: downNotes + downWords, up: upNotes + upWords };
  }

  function setStatus(text, kind) {
    var el = $("sync-status");
    if (!el) return;
    el.textContent = text;
    el.className = "sync-status " + (kind || "");
    var last = localStorage.getItem(LAST_KEY);
    if (last && kind === "ok") {
      el.textContent += "（" + new Date(last).toLocaleString("zh-CN", { hour12: false }) + "）";
    }
  }

  /* ---------- UI 绑定 ---------- */
  function initSyncUI() {
    var cfg = getCfg();
    if ($("sync-owner")) $("sync-owner").value = cfg.owner || "gagayjj";
    if ($("sync-repo")) $("sync-repo").value = cfg.repo || "gaga-study-sync";
    if ($("sync-token")) $("sync-token").value = cfg.token || "";

    var last = localStorage.getItem(LAST_KEY);
    if (last) setStatus("上次同步：" + new Date(last).toLocaleString("zh-CN", { hour12: false }), "ok");
    else setStatus("尚未同步", "");

    if ($("sync-save-cfg")) {
      $("sync-save-cfg").addEventListener("click", function () {
        setCfg({
          owner: ($("sync-owner").value || "").trim(),
          repo: ($("sync-repo").value || "").trim(),
          token: ($("sync-token").value || "").trim(),
        });
        setStatus("配置已保存到本机", "ok");
      });
    }
    if ($("sync-now")) {
      $("sync-now").addEventListener("click", function () {
        setCfg({
          owner: ($("sync-owner").value || "").trim(),
          repo: ($("sync-repo").value || "").trim(),
          token: ($("sync-token").value || "").trim(),
        });
        var btn = $("sync-now");
        btn.disabled = true;
        syncNow().then(function () { btn.disabled = false; }).catch(function (e) {
          btn.disabled = false;
          setStatus("同步失败：" + e.message, "error");
        });
      });
    }
  }

  // 暴露给 app.js / 控制台
  window.gagaSync = { syncNow: syncNow, getCfg: getCfg, setCfg: setCfg };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSyncUI);
  } else {
    initSyncUI();
  }
})();
