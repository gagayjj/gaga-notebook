const STORE = {
  notes: "gaga-notes",
  words: "gaga-words",
  plans: "gaga-plans",
};

const lessons = [
  { word: "discipline", phonetic: "/ˈdɪsəplɪn/", meaning: "自律", sentence: "Discipline is choosing what you want most.", cn: "自律，是选择你最想要的。" },
  { word: "persistent", phonetic: "/pərˈsɪstənt/", meaning: "坚持不懈的", sentence: "She is persistent and never gives up.", cn: "她坚持不懈，从不放弃。" },
  { word: "improve", phonetic: "/ɪmˈpruːv/", meaning: "提高", sentence: "Small habits improve your English.", cn: "小习惯能提高你的英语。" },
  { word: "curious", phonetic: "/ˈkjʊriəs/", meaning: "好奇的", sentence: "A curious mind asks better questions.", cn: "好奇的心会问更好的问题。" },
  { word: "focus", phonetic: "/ˈfoʊkəs/", meaning: "专注", sentence: "Focus on one task at a time.", cn: "一次专注做一件事。" },
];

const $ = (id) => document.getElementById(id);

function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

let notes = read(STORE.notes, []);
let words = read(STORE.words, []);
let plans = read(STORE.plans, []);
let activeNoteId = null;
let dictTarget = null;

function renderTabs() {
  document.querySelectorAll(".tabbar button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tabbar button").forEach((item) => item.classList.toggle("active", item === button));
      document.querySelectorAll(".page").forEach((page) => page.classList.toggle("active", page.id === `tab-${button.dataset.tab}`));
    });
  });
}

function renderNotes() {
  $("notes-count").textContent = `${notes.length} 篇`;
  const list = $("notes-list");
  list.innerHTML = "";
  notes.forEach((note) => {
    const item = document.createElement("div");
    item.className = "list-item";
    item.innerHTML = `<div><strong>${escapeHtml(note.title || "未命名")}</strong><span>${note.updatedAt || ""}</span></div>`;
    const open = document.createElement("button");
    open.textContent = "打开";
    open.onclick = () => openNote(note.id);
    const del = document.createElement("button");
    del.textContent = "删除";
    del.onclick = () => {
      notes = notes.filter((item) => item.id !== note.id);
      write(STORE.notes, notes);
      renderNotes();
    };
    item.append(open, del);
    list.append(item);
  });
}

function openNote(id) {
  const note = notes.find((item) => item.id === id);
  if (!note) return;
  activeNoteId = id;
  $("note-title").value = note.title;
  $("note-content").value = note.content;
}

function saveNote() {
  const title = $("note-title").value.trim();
  const content = $("note-content").value;
  if (!title && !content) return;
  const now = new Date().toLocaleString("zh-CN", { hour12: false });
  if (activeNoteId && notes.some((item) => item.id === activeNoteId)) {
    notes = notes.map((item) => (item.id === activeNoteId ? { ...item, title, content, updatedAt: now } : item));
  } else {
    const note = { id: `note-${Date.now()}`, title: title || "未命名", content, updatedAt: now };
    notes.unshift(note);
    activeNoteId = note.id;
  }
  write(STORE.notes, notes);
  renderNotes();
  $("save-note").textContent = "已保存";
  setTimeout(() => ($("save-note").textContent = "保存笔记"), 1000);
}

function renderEnglish() {
  const date = new Date();
  $("english-date").textContent = date.toLocaleDateString("zh-CN");
  const lesson = lessons[Math.floor(Date.now() / 86400000) % lessons.length];
  $("lesson-word").textContent = lesson.word;
  $("lesson-phonetic").textContent = lesson.phonetic;
  $("lesson-meaning").textContent = lesson.meaning;
  $("lesson-sentence").textContent = lesson.sentence;
  $("lesson-sentence-cn").textContent = lesson.cn;
  renderWords();
}

function renderWords() {
  const list = $("word-list");
  list.innerHTML = "";
  words.forEach((item) => {
    const row = document.createElement("div");
    row.className = "list-item";
    row.innerHTML = `<div><strong>${escapeHtml(item.word)}</strong><span>${escapeHtml(item.meaning)}</span></div>`;
    const del = document.createElement("button");
    del.textContent = "删";
    del.onclick = () => {
      words = words.filter((entry) => entry.id !== item.id);
      write(STORE.words, words);
      renderWords();
    };
    row.append(del);
    list.append(row);
  });
}

function speak(text, rate = 1) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "en-US";
  utter.rate = rate;
  const voice = speechSynthesis.getVoices().find((item) => item.lang.toLowerCase().startsWith("en"));
  if (voice) utter.voice = voice;
  speechSynthesis.speak(utter);
}

function startDictation() {
  const pool = [
    ...words.map((item) => ({ word: item.word, meaning: item.meaning })),
    ...lessons.map((item) => ({ word: item.word, meaning: item.meaning })),
  ];
  if (pool.length === 0) return;
  dictTarget = pool[Math.floor(Math.random() * pool.length)];
  $("dict-prompt").textContent = `释义：${dictTarget.meaning}`;
  $("dict-input").hidden = false;
  $("check-dict").hidden = false;
  $("dict-input").value = "";
  $("dict-result").textContent = "";
}

function checkDictation() {
  const answer = $("dict-input").value.trim().toLowerCase();
  const correct = answer === dictTarget.word.toLowerCase();
  $("dict-result").textContent = correct ? "✓ 正确" : `✗ ${dictTarget.word}`;
  $("dict-result").style.color = correct ? "#2f9e63" : "#c81e1e";
}

function renderPlans() {
  const list = $("plan-list");
  list.innerHTML = "";
  [...plans]
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
    .forEach((plan) => {
      const row = document.createElement("div");
      row.className = "list-item";
      row.innerHTML = `<div><strong>${escapeHtml(plan.title)}</strong><span>${plan.date} ${plan.time}${plan.done ? " · 已完成" : ""}</span></div>`;
      const done = document.createElement("button");
      done.textContent = plan.done ? "重做" : "完成";
      done.onclick = () => {
        plans = plans.map((item) => (item.id === plan.id ? { ...item, done: !item.done } : item));
        write(STORE.plans, plans);
        renderPlans();
      };
      const del = document.createElement("button");
      del.textContent = "删";
      del.onclick = () => {
        plans = plans.filter((item) => item.id !== plan.id);
        write(STORE.plans, plans);
        renderPlans();
      };
      row.append(done, del);
      list.append(row);
    });
}

function addPlan() {
  const title = $("plan-title").value.trim();
  const date = $("plan-date").value;
  const time = $("plan-time").value;
  if (!title || !date || !time) return;
  const plan = { id: `plan-${Date.now()}`, title, date, time, done: false };
  plans.push(plan);
  write(STORE.plans, plans);
  $("plan-title").value = "";
  renderPlans();
  schedulePlan(plan);
}

function schedulePlan(plan) {
  const when = new Date(`${plan.date}T${plan.time}:00`);
  const delay = when.getTime() - Date.now();
  if (delay > 0 && delay < 2147483647 && "Notification" in window && Notification.permission === "granted") {
    setTimeout(() => new Notification("学习计划提醒", { body: plan.title }), delay);
  }
}

function renderMine() {
  $("mine-stats").innerHTML = `
    <div><strong>${notes.length}</strong>笔记</div>
    <div><strong>${words.length + lessons.length}</strong>单词</div>
    <div><strong>${plans.length}</strong>计划</div>
  `;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function bindEvents() {
  $("save-note").addEventListener("click", saveNote);
  $("new-note").addEventListener("click", () => {
    activeNoteId = null;
    $("note-title").value = "";
    $("note-content").value = "";
  });
  $("speak-word").addEventListener("click", () => speak($("lesson-word").textContent));
  $("speak-sentence").addEventListener("click", () => speak($("lesson-sentence").textContent));
  $("slow-speak").addEventListener("click", () => speak($("lesson-sentence").textContent, 0.65));
  $("add-word").addEventListener("click", () => {
    const word = $("word-input").value.trim();
    const meaning = $("meaning-input").value.trim();
    if (!word) return;
    words.unshift({ id: `word-${Date.now()}`, word, meaning });
    write(STORE.words, words);
    $("word-input").value = "";
    $("meaning-input").value = "";
    renderWords();
  });
  $("start-dict").addEventListener("click", startDictation);
  $("hear-answer").addEventListener("click", () => dictTarget && speak(dictTarget.word));
  $("check-dict").addEventListener("click", checkDictation);
  $("dict-input").addEventListener("keydown", (event) => event.key === "Enter" && checkDictation());
  $("add-plan").addEventListener("click", addPlan);
  $("enable-notify").addEventListener("click", () => {
    if ("Notification" in window) Notification.requestPermission();
  });
  $("clear-data").addEventListener("click", () => {
    if (!confirm("确定清空手机版所有数据？")) return;
    Object.values(STORE).forEach((key) => localStorage.removeItem(key));
    notes = [];
    words = [];
    plans = [];
    renderNotes();
    renderWords();
    renderPlans();
    renderMine();
  });
}

function init() {
  const today = new Date().toISOString().slice(0, 10);
  $("plan-date").value = today;
  renderTabs();
  renderNotes();
  renderEnglish();
  renderPlans();
  renderMine();
  bindEvents();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
  if (Notification && Notification.permission === "default") Notification.requestPermission();
  plans.forEach(schedulePlan);
}

init();
