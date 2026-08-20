const STORE = {
  notes: "gaga-notes",
  words: "gaga-words",
  plans: "gaga-plans",
  markers: "gaga-markers",
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
let markers = read(STORE.markers, []);
let activeNoteId = null;
let dictTarget = null;

const marker = {
  canvas: null,
  ctx: null,
  bg: null,
  strokes: [],
  draft: null,
  selected: -1,
  dragMode: null,
  dragStart: null,
  tool: "arrow",
  color: "#e91e63",
  size: 5,
};

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

function renderMarkerList() {
  $("marker-count").textContent = `${markers.length} 张`;
  const list = $("marker-list");
  list.innerHTML = "";
  markers.forEach((item) => {
    const row = document.createElement("div");
    row.className = "list-item";
    row.innerHTML = `<img class="marker-thumb" src="${item.dataUrl}" alt="标记" /><div><strong>标记图片</strong><span>${item.createdAt || ""}</span></div>`;
    const del = document.createElement("button");
    del.textContent = "删除";
    del.onclick = () => {
      markers = markers.filter((entry) => entry.id !== item.id);
      write(STORE.markers, markers);
      renderMarkerList();
    };
    row.prepend(del);
    list.append(row);
  });
}

function distanceToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function hitMarkerStroke(stroke, point) {
  if (stroke.tool === "arrow") {
    const threshold = Math.max(12, stroke.size * 2.5);
    if (Math.hypot(point.x - stroke.start.x, point.y - stroke.start.y) <= threshold + 8) return "start";
    if (Math.hypot(point.x - stroke.end.x, point.y - stroke.end.y) <= threshold + 8) return "end";
    if (distanceToSegment(point, stroke.start, stroke.end) <= threshold) return "move";
    return null;
  }
  return hitMarkerShape(stroke, point);
}

function drawMarkerArrow(ctx, start, end, size) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const head = Math.max(14, size * 3);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - head * Math.cos(angle - Math.PI / 7), end.y - head * Math.sin(angle - Math.PI / 7));
  ctx.lineTo(end.x - head * Math.cos(angle + Math.PI / 7), end.y - head * Math.sin(angle + Math.PI / 7));
  ctx.closePath();
  ctx.fill();
}

function shapeBox(stroke) {
  if (stroke.tool === "text") {
    return { left: stroke.x, top: stroke.y - stroke.size * 6, right: stroke.x + stroke.size * 12, bottom: stroke.y };
  }
  return {
    left: Math.min(stroke.start.x, stroke.end.x),
    top: Math.min(stroke.start.y, stroke.end.y),
    right: Math.max(stroke.start.x, stroke.end.x),
    bottom: Math.max(stroke.start.y, stroke.end.y),
  };
}

function roundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawMarkerShape(ctx, stroke) {
  const box = shapeBox(stroke);
  const w = Math.max(10, box.right - box.left);
  const h = Math.max(10, box.bottom - box.top);
  const x = box.left;
  const y = box.top;
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (stroke.tool === "line") {
    ctx.beginPath();
    ctx.moveTo(stroke.start.x, stroke.start.y);
    ctx.lineTo(stroke.end.x, stroke.end.y);
    ctx.stroke();
  } else if (stroke.tool === "doubleArrow") {
    ctx.beginPath();
    ctx.moveTo(stroke.start.x, stroke.start.y);
    ctx.lineTo(stroke.end.x, stroke.end.y);
    ctx.stroke();
    drawMarkerArrow(ctx, stroke.end, stroke.start, stroke.size * 0.7);
  } else if (stroke.tool === "rect") {
    ctx.strokeRect(x, y, w, h);
  } else if (stroke.tool === "roundedRect" || stroke.tool === "textBox" || stroke.tool === "callout") {
    roundedRectPath(ctx, x, y, w, h, Math.min(18, h * 0.25));
    ctx.stroke();
    if (stroke.tool === "textBox" || stroke.tool === "callout") {
      ctx.font = `${Math.max(14, Math.min(28, h * 0.28))}px sans-serif`;
      ctx.textBaseline = "middle";
      ctx.fillText(stroke.text || "文本", x + 10, y + h / 2);
    }
    if (stroke.tool === "callout") {
      ctx.beginPath();
      ctx.moveTo(stroke.end.x, stroke.end.y);
      ctx.lineTo(x + w - 20, y + h - 2);
      ctx.lineTo(x + w - 2, y + h);
      ctx.closePath();
      ctx.fill();
    }
  } else if (stroke.tool === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (stroke.tool === "star") {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const outer = Math.min(w, h) / 2;
    const inner = outer * 0.45;
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const radius = i % 2 === 0 ? outer : inner;
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const px = cx + radius * Math.cos(angle);
      const py = cy + radius * Math.sin(angle);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  } else if (stroke.tool === "flag") {
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y);
    ctx.lineTo(x + w, y + h * 0.45);
    ctx.closePath();
    ctx.fill();
  } else if (stroke.tool === "heart") {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const s = Math.min(w, h) / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.7);
    ctx.bezierCurveTo(cx - s * 1.1, cy - s * 0.15, cx - s * 0.4, cy - s * 0.8, cx, cy - s * 0.2);
    ctx.bezierCurveTo(cx + s * 0.4, cy - s * 0.8, cx + s * 1.1, cy - s * 0.15, cx, cy + s * 0.7);
    ctx.fill();
  } else if (stroke.tool === "check") {
    ctx.beginPath();
    ctx.moveTo(x + w * 0.1, y + h * 0.55);
    ctx.lineTo(x + w * 0.38, y + h * 0.85);
    ctx.lineTo(x + w * 0.9, y + h * 0.12);
    ctx.stroke();
  } else if (stroke.tool === "exclaim") {
    const cx = x + w / 2;
    ctx.fillRect(cx - stroke.size, y + h * 0.15, stroke.size * 2, h * 0.45);
    ctx.beginPath();
    ctx.arc(cx, y + h * 0.8, stroke.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function hitMarkerShape(stroke, point) {
  const box = shapeBox(stroke);
  const pad = Math.max(12, stroke.size * 2.5);
  if (point.x >= box.left - pad && point.x <= box.right + pad && point.y >= box.top - pad && point.y <= box.bottom + pad) {
    const nearCorner = (px, py) => Math.hypot(point.x - px, point.y - py) <= 14;
    if (nearCorner(box.left, box.top)) return "start";
    if (nearCorner(box.right, box.bottom)) return "end";
    return "move";
  }
  return null;
}

function drawMarker() {
  const { ctx, canvas, bg, strokes, draft, selected } = marker;
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (bg) ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
  const paint = (stroke) => {
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (stroke.tool === "pen") {
      if (stroke.points.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      stroke.points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
      ctx.stroke();
    } else if (stroke.tool === "arrow") {
      drawMarkerArrow(ctx, stroke.start, stroke.end, stroke.size);
    } else if (stroke.tool === "text") {
      ctx.font = `${stroke.size * 6}px sans-serif`;
      ctx.fillText(stroke.text, stroke.x, stroke.y);
    } else {
      drawMarkerShape(ctx, stroke);
    }
  };
  strokes.forEach(paint);
  if (draft) paint(draft);
  const selectedStroke = strokes[selected];
  if (selectedStroke && selectedStroke.tool !== "pen") {
    const box = shapeBox(selectedStroke);
    ctx.strokeStyle = "#2563eb";
    ctx.fillStyle = "#fff";
    ctx.lineWidth = 3;
    [
      { x: box.left, y: box.top },
      { x: box.right, y: box.top },
      { x: box.left, y: box.bottom },
      { x: box.right, y: box.bottom },
    ].forEach((point) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }
}

function openMarkerEditor(dataUrl) {
  marker.strokes = [];
  marker.draft = null;
  marker.selected = -1;
  marker.dragMode = null;
  marker.bg = null;
  const canvas = $("marker-canvas");
  marker.canvas = canvas;
  marker.ctx = canvas.getContext("2d");
  canvas.width = 800;
  canvas.height = 600;
  if (dataUrl) {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 800 / img.width, 800 / img.height);
      canvas.width = Math.max(200, Math.round(img.width * scale));
      canvas.height = Math.max(200, Math.round(img.height * scale));
      marker.bg = img;
      drawMarker();
    };
    img.src = dataUrl;
  } else {
    drawMarker();
  }
  $("marker-editor").hidden = false;
  setMarkerTool("arrow");
}

function markerPoint(event) {
  const rect = marker.canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * marker.canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * marker.canvas.height,
  };
}

function setMarkerTool(tool) {
  marker.tool = tool;
  document.querySelectorAll("#mt-arrow, #mt-pen, #mt-text").forEach((button) => {
    button.classList.toggle("active", button.id === `mt-${tool}`);
  });
  document.querySelectorAll("#shape-palette button").forEach((button) => {
    button.classList.toggle("active", button.dataset.shape === tool);
  });
}

function bindMarkerEditor() {
  $("new-canvas").addEventListener("click", () => openMarkerEditor(null));
  $("pick-image").addEventListener("click", () => $("marker-file").click());
  $("marker-file").addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => openMarkerEditor(reader.result);
    reader.readAsDataURL(file);
    event.target.value = "";
  });
  $("mt-arrow").addEventListener("click", () => setMarkerTool("arrow"));
  $("mt-pen").addEventListener("click", () => setMarkerTool("pen"));
  $("mt-text").addEventListener("click", () => {
    setMarkerTool("text");
    const text = prompt("输入标注文字", "重点");
    if (text) marker.pendingText = text;
  });
  $("mt-shapes").addEventListener("click", () => {
    $("shape-palette").hidden = !$("shape-palette").hidden;
  });
  document.querySelectorAll("#shape-palette button").forEach((button) => {
    button.addEventListener("click", () => {
      setMarkerTool(button.dataset.shape);
      $("shape-palette").hidden = true;
    });
  });
  document.querySelectorAll(".color-row i").forEach((item) => {
    item.addEventListener("click", () => {
      marker.color = item.dataset.color;
      document.querySelectorAll(".color-row i").forEach((i) => (i.style.borderColor = i === item ? "#fff" : "#fff"));
    });
  });
  $("mt-size").addEventListener("click", () => {
    marker.size = [4, 7, 11][([4, 7, 11].indexOf(marker.size) + 1) % 3] || 4;
    $("mt-size").textContent = `${marker.size}px`;
  });
  $("mt-undo").addEventListener("click", () => {
    marker.strokes.pop();
    marker.selected = -1;
    drawMarker();
  });
  $("mt-delete").addEventListener("click", () => {
    if (marker.selected >= 0) {
      marker.strokes.splice(marker.selected, 1);
      marker.selected = -1;
      drawMarker();
    }
  });
  $("mt-close").addEventListener("click", closeMarkerEditor);
  $("mt-cancel").addEventListener("click", closeMarkerEditor);
  $("mt-save").addEventListener("click", () => {
    if (!marker.canvas) return;
    const dataUrl = marker.canvas.toDataURL("image/png");
    markers.unshift({ id: `marker-${Date.now()}`, dataUrl, createdAt: new Date().toLocaleString("zh-CN", { hour12: false }) });
    write(STORE.markers, markers);
    renderMarkerList();
    closeMarkerEditor();
  });
  const canvas = $("marker-canvas");
  canvas.addEventListener("pointerdown", (event) => {
    const point = markerPoint(event);
    canvas.setPointerCapture(event.pointerId);
    const isShape = marker.tool !== "pen" && marker.tool !== "text";
    if ((marker.tool === "arrow" || isShape) && marker.selected >= 0) {
      const stroke = marker.strokes[marker.selected];
      const hit = stroke && hitMarkerStroke(stroke, point);
      if (hit) {
        marker.dragMode = hit;
        marker.dragStart = point;
        return;
      }
    }
    if (marker.tool === "text") {
      const text = marker.pendingText || "重点";
      marker.pendingText = null;
      marker.strokes.push({ tool: "text", color: marker.color, size: marker.size, x: point.x, y: point.y, text });
      drawMarker();
      return;
    }
    if (marker.tool === "pen") {
      marker.draft = { tool: "pen", color: marker.color, size: marker.size, points: [point] };
    } else {
      const text = marker.tool === "textBox" || marker.tool === "callout" ? marker.pendingText || prompt("输入文字", "文本") : "";
      marker.pendingText = null;
      marker.draft = {
        tool: marker.tool,
        color: marker.color,
        size: marker.size,
        start: point,
        end: point,
        text,
      };
    }
  });
  canvas.addEventListener("pointermove", (event) => {
    const point = markerPoint(event);
    if (marker.dragMode && marker.selected >= 0) {
      const stroke = marker.strokes[marker.selected];
      if (stroke && stroke.tool !== "pen") {
        if (stroke.tool === "text") {
          stroke.x += point.x - marker.dragStart.x;
          stroke.y += point.y - marker.dragStart.y;
          marker.dragStart = point;
          drawMarker();
          return;
        }
        if (marker.dragMode === "start") stroke.start = point;
        else if (marker.dragMode === "end") stroke.end = point;
        else {
          const dx = point.x - marker.dragStart.x;
          const dy = point.y - marker.dragStart.y;
          stroke.start = { x: stroke.start.x + dx, y: stroke.start.y + dy };
          stroke.end = { x: stroke.end.x + dx, y: stroke.end.y + dy };
          marker.dragStart = point;
        }
        drawMarker();
      }
      return;
    }
    if (!marker.draft) return;
    if (marker.draft.tool === "pen") marker.draft.points.push(point);
    else marker.draft.end = point;
    drawMarker();
  });
  canvas.addEventListener("pointerup", () => {
    if (marker.draft) {
      marker.strokes.push(marker.draft);
      if (marker.draft.tool !== "pen") marker.selected = marker.strokes.length - 1;
      marker.draft = null;
      drawMarker();
    }
    marker.dragMode = null;
    marker.dragStart = null;
  });
}

function closeMarkerEditor() {
  $("marker-editor").hidden = true;
  marker.draft = null;
  marker.dragMode = null;
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
    markers = [];
    renderNotes();
    renderWords();
    renderPlans();
    renderMine();
    renderMarkerList();
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
  renderMarkerList();
  bindEvents();
  bindMarkerEditor();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
  if (Notification && Notification.permission === "default") Notification.requestPermission();
  plans.forEach(schedulePlan);
}

init();
