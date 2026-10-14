// 剧有词（AI 背单词）——照抖音「用豆包背单词 / Chase-qisiai 的 juyouci Skill」的玩法实现：
// 给一段英文原文（美剧字幕 / 台词 / 文章），AI 挑出 B2~C1 级值得背的词，
// 生成一个词汇学习页：「学习与回忆」翻卡（学新词 → 稍后考 → 按 1/2/3 自评）+「词汇总览」，
// 每个词带 音标 / 词义 / 原文原句（目标词高亮）/ 句翻译，可朗读原句，每个词库进度独立保存。
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BookOpenText, Clapperboard, Loader2, MapPin, Plus, RotateCcw, Trash2, Volume2 } from "lucide-react";
import { askAiFree, callAiTutor, loadAiConfig } from "../aiTutor";

interface JyWord {
  word: string;
  phonetic: string;
  meaning: string;
  sentence: string;
  sentenceZh: string;
  status: "new" | "later" | "known" | "fuzzy";
}

interface JyLib {
  id: string;
  title: string;
  level: string;
  createdAt: number;
  words: JyWord[];
}

const LIBS_KEY = "juyouci-libs";
const SHOWS_KEY = "juyouci-shows";
const CURRENT_SHOW_KEY = "juyouci-current-show";
const LEVELS = ["不限", "四级", "六级", "考研", "雅思", "托福"];

// 推荐剧集（追剧学英语）：热门、口语量大、台词清晰，按入门→进阶→高阶排
interface ShowRec {
  name: string;
  level: string;
  reason: string;
}

function loadShows(): ShowRec[] | null {
  try {
    const raw = localStorage.getItem(SHOWS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) && parsed.length ? (parsed as ShowRec[]) : null;
  } catch {
    return null;
  }
}

function loadCurrentShow(): ShowRec | null {
  try {
    return JSON.parse(localStorage.getItem(CURRENT_SHOW_KEY) || "null") as ShowRec | null;
  } catch {
    return null;
  }
}

const JY_SHOWS_SYSTEM = `你是"追剧学英语"顾问。推荐适合中国学习者追剧学英语的英美剧。
严格只返回一个 JSON 对象（不要 markdown 代码块、不要多余文字）：
{"shows":[{"name":"中文名（English）","level":"入门","reason":"20字内理由"}]}
要求：
- 只推荐 10 部，按难度从简单到难排序。
- level 只取：入门 / 进阶 / 高阶。
- 只要英美剧（生活类、口语量大、台词清晰、语境日常优先，如老友记、摩登家庭这一类），
  不要纪录片、新闻、国产剧，也不要编造不存在的剧名。
- reason 20 字以内，说清"为什么适合学英语 + 难在哪"。`;

// 免费推理模型的 JSON 经常缺括号/逗号错，严格 parse 会直接失败；这里做容错提取
function parseShowsText(raw: string): ShowRec[] {
  let t = (raw || "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try {
    const obj = JSON.parse(t) as { shows?: ShowRec[] };
    if (Array.isArray(obj.shows) && obj.shows.length) return normalizeShows(obj.shows);
  } catch {
    /* 落到下面的正则兜底 */
  }
  // 兜底：不整体 parse，改成逐条抓 name / level / reason
  const blocks = t.match(/\{[^{}]*"name"[\s\S]*?\}/g) || [];
  const list: ShowRec[] = [];
  for (const b of blocks) {
    const pick = (key: string) => (b.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`)) || [])[1] || "";
    const name = pick("name");
    if (name) list.push({ name, level: pick("level"), reason: pick("reason") });
  }
  if (list.length) return normalizeShows(list);
  // 再兜一层：可能有条目连左花括号都被吃了（形如 "name":"...","level":"..."）
  const one = t.match(/\{[^{}]*"name"\s*:[^{}]*?(?=\}|\{)/g);
  if (!one) {
    const pairs = Array.from(t.matchAll(/"name"\s*:\s*"([^"]*)"\s*,\s*"level"\s*:\s*"([^"]*)"\s*,\s*"reason"\s*:\s*"([^"]*)"/g));
    if (pairs.length) return normalizeShows(pairs.map((m) => ({ name: m[1], level: m[2], reason: m[3] })));
  }
  return [];
}

function normalizeShows(list: ShowRec[]): ShowRec[] {
  return list
    .filter((s) => s?.name)
    .map((s) => {
      const lv = String(s.level || "");
      return {
        name: String(s.name),
        level: lv.includes("入门") || lv.includes("简单") ? "入门" : lv.includes("高阶") || lv.includes("难") ? "高阶" : "进阶",
        reason: String(s.reason || ""),
      };
    });
}

function loadLibs(): JyLib[] {
  try {
    const raw = localStorage.getItem(LIBS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as JyLib[]) : [];
  } catch {
    return [];
  }
}

// ============ 追剧精听：本地视频 + 字幕文件，TED 精听同款的"视频+逐句同步"体验 ============
// 片源用你自己准备的本地视频（版权原因软件不内置），字幕支持 .srt / .vtt；
// 没有时间轴的纯文本台词也能用——降级成"点一句读一句"的台词模式。
interface SrtCue {
  t0: number; // 开始秒；纯文本台词模式为 -1（无时间轴）
  t1: number;
  en: string;
}

const SHOW_VIDEO_KEY = "juyouci-show-video";
const SHOW_SRT_KEY = "juyouci-show-srt";

function parseSubTime(s: string): number {
  const m = s.trim().match(/(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})/);
  if (!m) return -1;
  return Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, "0")) / 1000;
}

function parseSubtitles(raw: string): SrtCue[] {
  const text = (raw || "").replace(/\r/g, "").replace(/<\/?[^>]+>/g, "");
  const cues: SrtCue[] = [];
  const blocks = text.split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim());
    if (!lines.length) continue;
    const tIdx = lines.findIndex((l) => l.includes("-->"));
    if (tIdx >= 0) {
      const [a, b] = lines[tIdx].split("-->");
      const t0 = parseSubTime(a);
      const t1 = parseSubTime(b);
      const en = lines
        .slice(tIdx + 1)
        .join(" ")
        .trim();
      if (en && t0 >= 0 && t1 > t0) cues.push({ t0, t1, en });
    } else if (!/^WEBVTT/i.test(lines[0]) && !/^\d+$/.test(lines[0])) {
      // 没有时间轴：每一行当一句台词
      for (const line of lines) {
        if (/[a-zA-Z]/.test(line)) cues.push({ t0: -1, t1: -1, en: line.trim() });
      }
    }
  }
  // 相邻重复（双语字幕的中英混排里只有英文行会进来，一般无需去重；保险起见去掉完全相同的相邻句）
  return cues.filter((c, i) => i === 0 || c.en !== cues[i - 1].en || c.t0 !== cues[i - 1].t0);
}

function formatSubTime(t: number): string {
  if (!Number.isFinite(t) || t < 0) return "0:00";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function saveLibs(libs: JyLib[]) {
  localStorage.setItem(LIBS_KEY, JSON.stringify(libs.slice(0, 20)));
}

// 从原文挑词的系统提示词（对齐 juyouci Skill 的口径：真实原句 + B2~C1 + 按级别调整）
const JY_SYSTEM = `你是一个英语词汇老师。用户给你一段英文原文（可能来自美剧/电影字幕、台词或文章）。
请从原文里挑出最值得背的生词和地道短语（目标 B2~C1 水平，约 20~30 个；原文不够就至少挑 10 个），跳过 the/this/is 这类基础词。
严格只返回一个 JSON 对象（不要任何额外文字、不要 markdown 代码块），结构：
{
  "title": "词库名（根据原文来源起，如：摩登家庭 S01E01）",
  "words": [
    { "word": "单词或短语", "phonetic": "音标，没有就留空字符串", "meaning": "中文释义（简短）", "sentence": "包含该词的原文原句（尽量原样引用原文，不要改写）", "sentenceZh": "这句的中文翻译" }
  ]
}
要求：word 必须能在 sentence 里找到（允许时态等变形，尽量原样）；用户指定了考试级别时，按该级别调整选词难度。`;

// 免费通道专用：输出压到最小（免费层输出上限约 1500 tokens，推理模型还要花掉一大半，
// 完整版必被截断成空）。只让 AI 挑词，原句由前端在原文里自己定位，句翻译走第二次小请求。
const JY_SYSTEM_FREE = `你是一个英语词汇老师。用户给你一段英文原文（可能来自美剧/电影字幕、台词或文章）。
请从原文里挑出最值得背的生词和地道短语（目标 B2~C1 水平，挑 10 个左右、最多 12 个），跳过 the/this/is/something 这类基础词。
严格只返回一个 JSON 对象（不要任何额外文字、不要 markdown 代码块、不要解释）：
{
  "title": "词库名（根据原文来源起，如：摩登家庭 S01E01）",
  "words": [
    { "word": "单词或短语（必须原样出现在原文中）", "phonetic": "音标，没有就留空字符串", "meaning": "中文释义（简短）" }
  ]
}
注意：只要 word/phonetic/meaning 三个字段，不要 sentence 字段；输出务必精简。`;

// 把原文切成句子（免费通道用：在原文里定位每个词所在的原句）
function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function findSentenceFor(word: string, sentences: string[]): string {
  const escaped = word.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!escaped) return "";
  const re = new RegExp(`\\b${escaped}\\b`, "i");
  return sentences.find((s) => re.test(s)) || "";
}

// 免费通道第二步：把原句批量翻译（输出小，不会被截断）；失败不影响主流程
async function translateSentences(list: string[]): Promise<string[]> {
  if (!list.length) return [];
  try {
    const raw = await callAiTutor([
      {
        role: "system",
        content: '把用户给的每一行英文翻译成自然的中文。严格只返回一个 JSON 对象：{"translations":["第一句的中文","第二句的中文"]}，数组长度必须和输入行数一致，不要任何额外文字、不要 markdown 代码块。',
      },
      { role: "user", content: list.map((s, i) => `${i + 1}. ${s}`).join("\n") },
    ]);
    if (!raw) return [];
    let t = raw.trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) t = fence[1].trim();
    const obj = JSON.parse(t) as { translations?: string[] };
    return Array.isArray(obj.translations) ? obj.translations : [];
  } catch {
    return [];
  }
}

function parseJyResult(text: string): { title: string; words: Omit<JyWord, "status">[] } | null {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try {
    const obj = JSON.parse(t) as { title?: string; words?: unknown };
    if (!Array.isArray(obj.words) || !obj.words.length) return null;
    const words = (obj.words as Record<string, string>[])
      .filter((w) => w?.word)
      .map((w) => ({
        word: String(w.word),
        phonetic: String(w.phonetic || ""),
        meaning: String(w.meaning || ""),
        sentence: String(w.sentence || ""),
        sentenceZh: String(w.sentenceZh || ""),
      }));
    if (!words.length) return null;
    return { title: String(obj.title || "我的词库"), words };
  } catch {
    return null;
  }
}

// 朗读：有道 dictvoice（英音），失败兜底系统 speechSynthesis
function speakEn(text: string) {
  const cleaned = text.trim();
  if (!cleaned) return;
  try {
    const audio = new Audio(`https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(cleaned)}&type=1`);
    void audio.play().catch(() => {
      try {
        const u = new SpeechSynthesisUtterance(cleaned);
        u.lang = "en-US";
        window.speechSynthesis?.cancel();
        window.speechSynthesis?.speak(u);
      } catch {
        /* noop */
      }
    });
  } catch {
    /* noop */
  }
}

// 原句里高亮目标词（大小写不敏感、允许词边界）
function highlightWord(sentence: string, word: string) {
  const w = word.trim();
  if (!w) return sentence;
  const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = sentence.split(new RegExp(`\\b(${escaped})\\b`, "i"));
  if (parts.length === 1) return sentence;
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="jy-mark">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

const STATUS_LABEL: Record<JyWord["status"], string> = {
  new: "新词",
  later: "稍后考",
  fuzzy: "想起来了",
  known: "已掌握",
};

export default function JuyouciPanel({ onOpenLibrary }: { onOpenLibrary?: () => void }) {
  const [libs, setLibs] = useState<JyLib[]>(() => loadLibs());
  const [view, setView] = useState<"setup" | "study">(libs.length ? "setup" : "setup");
  const [activeLibId, setActiveLibId] = useState<string | null>(null);
  const [mode, setMode] = useState<"learn" | "overview">("learn");
  const [input, setInput] = useState("");
  const [level, setLevel] = useState(LEVELS[0]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 推荐剧集 + 当前固定追的剧
  const [shows, setShows] = useState<ShowRec[] | null>(() => loadShows());
  const [showsLoading, setShowsLoading] = useState(false);
  const [showsError, setShowsError] = useState<string | null>(null);
  const [currentShow, setCurrentShow] = useState<ShowRec | null>(() => loadCurrentShow());
  // 每部剧「在哪能找到」的 AI 查询结果（按剧名存，组件内状态即可，可重查）
  const [resource, setResource] = useState<Record<string, { loading?: boolean; text?: string; error?: string }>>({});
  // 追剧精听（本地视频 + 字幕）；展开状态持久化，切走再回来不收起
  const [bingeOpen, setBingeOpen] = useState(() => sessionStorage.getItem("juyouci-binge-open") === "1");
  const [showVideoPath, setShowVideoPath] = useState<string | null>(() => localStorage.getItem(SHOW_VIDEO_KEY));
  const [webVideoUrl, setWebVideoUrl] = useState<string | null>(null);
  const [cues, setCues] = useState<SrtCue[] | null>(() => {
    try {
      const raw = localStorage.getItem(SHOW_SRT_KEY);
      const parsed = raw ? parseSubtitles(raw) : [];
      return parsed.length ? parsed : null;
    } catch {
      return null;
    }
  });
  const [bingeIdx, setBingeIdx] = useState(0);
  const [bingeTime, setBingeTime] = useState(0);
  const [bingeDur, setBingeDur] = useState(0);
  const [bingePlaying, setBingePlaying] = useState(false);
  const [bingeLoop, setBingeLoop] = useState(false);
  const [bingeSentencePause, setBingeSentencePause] = useState(() => localStorage.getItem("juyouci-binge-pause") === "1");
  const [bingeSpeed, setBingeSpeed] = useState(1);
  const [bingeTrans, setBingeTrans] = useState<Record<number, string>>({});
  const [bingeTransLoading, setBingeTransLoading] = useState(false);
  const [bingeWord, setBingeWord] = useState<{ word: string; top: number; left: number; loading: boolean; entry: { word: string; phonetic?: string; usphone?: string; meaning?: string } | null } | null>(null);
  const bingeVideoRef = useRef<HTMLVideoElement | null>(null);
  const bingeListRef = useRef<HTMLDivElement | null>(null);
  const bingeSectionRef = useRef<HTMLDivElement | null>(null);
  const bingeSeekingRef = useRef(false);
  const bingeAudioRef = useRef<HTMLAudioElement | null>(null);
  const srtInputRef = useRef<HTMLInputElement | null>(null);
  const webVideoInputRef = useRef<HTMLInputElement | null>(null);

  const activeLib = useMemo(() => libs.find((l) => l.id === activeLibId) || null, [libs, activeLibId]);
  const [learnIdx, setLearnIdx] = useState(0);
  const [quizIdx, setQuizIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const updateLib = (libId: string, fn: (lib: JyLib) => JyLib) => {
    setLibs((prev) => {
      const next = prev.map((l) => (l.id === libId ? fn(l) : l));
      saveLibs(next);
      return next;
    });
  };

  const newWords = activeLib?.words.filter((w) => w.status === "new") || [];
  const laterWords = activeLib?.words.filter((w) => w.status === "later") || [];
  const knownCount = activeLib?.words.filter((w) => w.status === "known" || w.status === "fuzzy").length || 0;

  // 学习流程：先过新词（learn），新词都标了「稍后考」就进 quiz 队列循环
  const learnQueue = newWords;
  const curLearn = learnQueue[Math.min(learnIdx, Math.max(0, learnQueue.length - 1))];
  const curQuiz = laterWords[Math.min(quizIdx, Math.max(0, laterWords.length - 1))];

  const setStatus = (wordText: string, status: JyWord["status"]) => {
    if (!activeLib) return;
    updateLib(activeLib.id, (lib) => ({
      ...lib,
      words: lib.words.map((w) => (w.word === wordText ? { ...w, status } : w)),
    }));
  };

  const generate = async () => {
    const text = input.trim();
    if (!text) {
      setError("先把英文原文粘进来（美剧字幕、台词、文章都行）");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const cfg = loadAiConfig();
      const isFree = !cfg || cfg.provider === "free";
      const user = `【选词级别】${level}\n【词库名（用户填了就用这个）】${title.trim() || currentShow?.name || "（你来起，根据原文来源）"}${currentShow ? `\n【当前追的剧】${currentShow.name}（原文可能来自这部剧）` : ""}\n【原文】\n${text.slice(0, 6000)}`;
      const raw = await callAiTutor([
        { role: "system", content: isFree ? JY_SYSTEM_FREE : JY_SYSTEM },
        { role: "user", content: user },
      ]);
      if (raw === null) {
        setError("当前厂商还没填 API Key。点右上角 ✦ 填一下，或把厂商切回「免费 · 无需 Key」（不用填任何东西）。");
        return;
      }
      const parsed = parseJyResult(raw);
      if (!parsed) {
        setError("AI 返回的格式没认出来，再点一次「生成词库」试试");
        return;
      }
      let libWords = parsed.words.map((w) => ({ ...w, status: "new" as const }));
      // 免费通道：AI 只挑词，原句在原文里定位，句翻译用第二次小请求补
      if (isFree) {
        const sentences = splitIntoSentences(text);
        const perWord = libWords.map((w) => w.sentence || findSentenceFor(w.word, sentences));
        const uniq: string[] = [];
        for (const s of perWord) if (s && !uniq.includes(s)) uniq.push(s);
        const translations = await translateSentences(uniq);
        const map = new Map(uniq.map((s, i) => [s, translations[i] || ""]));
        libWords = libWords.map((w, i) => ({ ...w, sentence: perWord[i], sentenceZh: map.get(perWord[i]) || "" }));
      }
      const lib: JyLib = {
        id: `jy-${Date.now()}`,
        title: title.trim() || parsed.title,
        level,
        createdAt: Date.now(),
        words: libWords,
      };
      const next = [lib, ...loadLibs()];
      saveLibs(next);
      setLibs(next);
      setInput("");
      setTitle("");
      setActiveLibId(lib.id);
      setLearnIdx(0);
      setQuizIdx(0);
      setRevealed(false);
      setMode("learn");
      setView("study");
    } catch (e) {
      setError("生成失败：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };

  const recommendShows = async () => {
    setShowsLoading(true);
    setShowsError(null);
    try {
      const raw = await callAiTutor([
        { role: "system", content: JY_SHOWS_SYSTEM },
        { role: "user", content: "帮我推荐一批适合追剧学英语的热门剧集，按从简单到难排好。" },
      ]);
      if (raw === null) {
        setShowsError("当前厂商还没填 API Key；免费模式不用填，点右上角 ✦ 检查设置。");
        return;
      }
      const list = parseShowsText(raw);
      if (!list.length) {
        setShowsError("AI 返回的格式没认出来，再点一次试试");
        return;
      }
      localStorage.setItem(SHOWS_KEY, JSON.stringify(list));
      setShows(list);
    } catch (e) {
      setShowsError("推荐失败：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setShowsLoading(false);
    }
  };

  const setBingeOpenPersist = (open: boolean) => {
    setBingeOpen(open);
    // 存 sessionStorage：同一次运行内切 tab 回来不丢；重启 App 回到剧单列表（不永久记住整页精听）
    sessionStorage.setItem("juyouci-binge-open", open ? "1" : "0");
  };

  const pickShow = (show: ShowRec) => {
    localStorage.setItem(CURRENT_SHOW_KEY, JSON.stringify(show));
    setCurrentShow(show);
    // 有反应：直接展开这部剧的追剧精听，并滚过去
    setBingeOpenPersist(true);
    requestAnimationFrame(() => {
      bingeSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const clearShow = () => {
    localStorage.removeItem(CURRENT_SHOW_KEY);
    setCurrentShow(null);
    setBingeOpenPersist(false);
  };

  // 「在哪能找到」：让 AI 用公开信息指路（正版平台 + 字幕下载站 + 追剧精听用法），不拉流
  const findResources = async (show: ShowRec) => {
    const key = show.name;
    if (resource[key]?.loading) return;
    setResource((prev) => ({ ...prev, [key]: { loading: true, text: undefined, error: undefined } }));
    try {
      const question = `我想追这部英美剧练英语：${show.name}（适合难度：${show.level}）。请只用中文、分三条列：
1）国内或国际能正版看这部剧的平台（给具体网站名，不确定是否还在就标"以站内搜索为准"）；
2）它的英文字幕（.srt / .vtt）去哪个公开网站下载（如 SubHD、射手网、OpenSubtitles、字幕库，列 2~3 个）；
3）一句操作提示：下载好视频和字幕文件后，用「GAGA 笔记本」App 的「追剧精听」选视频+字幕，就能逐句高亮、跳转、朗读、查词。
不要编造不存在的网址；总字数控制在 300 字以内。`;
      const raw = await askAiFree(question);
      if (raw === null) {
        setResource((prev) => ({ ...prev, [key]: { error: "当前厂商还没填 API Key；免费模式不用填，点右上角 ✦ 检查设置。" } }));
        return;
      }
      setResource((prev) => ({ ...prev, [key]: { text: raw.trim() } }));
    } catch (e) {
      setResource((prev) => ({ ...prev, [key]: { error: "查询失败：" + (e instanceof Error ? e.message : String(e)) } }));
    }
  };

  // ============ 追剧精听：视频 / 字幕 / 播放控制 ============
  const isDesktop = Boolean(window.studyNotes?.openVideoDialog && window.studyNotes?.localVideoUrl);
  const bingeVideoSrc = isDesktop
    ? showVideoPath
      ? window.studyNotes?.localVideoUrl(showVideoPath)
      : ""
    : webVideoUrl || "";

  const pickShowVideo = async () => {
    if (isDesktop) {
      const p = await window.studyNotes?.openVideoDialog();
      if (p) {
        setShowVideoPath(p);
        localStorage.setItem(SHOW_VIDEO_KEY, p);
      }
    } else {
      webVideoInputRef.current?.click();
    }
  };

  const onWebVideoPicked = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) setWebVideoUrl(URL.createObjectURL(file));
    event.target.value = "";
  };

  const onSrtPicked = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const raw = await file.text();
      const parsed = parseSubtitles(raw);
      if (!parsed.length) {
        setShowsError("这个字幕文件没解析出句子，确认是 .srt / .vtt 或英文台词文本");
        return;
      }
      localStorage.setItem(SHOW_SRT_KEY, raw.slice(0, 800000));
      setCues(parsed);
      setBingeIdx(0);
      setBingeTrans({});
      setShowsError(null);
    } catch {
      setShowsError("字幕文件读取失败，重新选一次试试");
    }
  };

  const stopBingeAudio = () => {
    bingeAudioRef.current?.pause();
    bingeAudioRef.current = null;
  };

  const bingeSentenceEnd = (idx: number): number => {
    if (!cues) return -1;
    return idx < cues.length - 1 ? cues[idx + 1].t0 : cues[idx].t1;
  };

  const bingeActiveIdx = (t: number) => {
    if (!cues || !cues.length) return 0;
    const cur = cues[Math.min(bingeIdx, cues.length - 1)];
    if (t >= cur.t0 && t < cur.t1) return Math.min(bingeIdx, cues.length - 1);
    for (let i = 0; i < cues.length; i++) {
      if (t >= cues[i].t0 && t < cues[i].t1) return i;
    }
    // 落在句间空隙：归到前一句
    let idx = 0;
    for (let i = 0; i < cues.length; i++) {
      if (cues[i].t0 <= t) idx = i;
      else break;
    }
    return idx;
  };

  const bingeSeekTo = (idx: number) => {
    if (!cues || !cues.length) return;
    const i = Math.max(0, Math.min(idx, cues.length - 1));
    setBingeIdx(i);
    const video = bingeVideoRef.current;
    if (video && cues[i].t0 >= 0) {
      video.currentTime = cues[i].t0 + 0.01;
      void video.play().catch(() => undefined);
    } else if (cues[i].t0 < 0) {
      void speakCue(i);
    }
  };

  const speakCue = (idx: number, slow = false) => {
    if (!cues) return;
    stopBingeAudio();
    const line = cues[idx]?.en || "";
    if (!line) return;
    try {
      const audio = new Audio(`https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(line)}&type=${slow ? 1 : 2}`);
      bingeAudioRef.current = audio;
      void audio.play().catch(() => {
        try {
          const u = new SpeechSynthesisUtterance(line);
          u.lang = "en-US";
          u.rate = slow ? 0.6 : 1;
          window.speechSynthesis?.cancel();
          window.speechSynthesis?.speak(u);
        } catch {
          /* noop */
        }
      });
    } catch {
      /* noop */
    }
  };

  const translateCue = async (idx: number) => {
    if (!cues || bingeTrans[idx] || bingeTransLoading) return;
    const line = cues[idx]?.en || "";
    if (!line) return;
    setBingeTransLoading(true);
    try {
      const raw = await callAiTutor([{ role: "user", content: `把这句英文翻译成自然的中文，只回译文，不要解释：${line}` }]);
      if (raw) setBingeTrans((prev) => ({ ...prev, [idx]: raw.trim().slice(0, 200) }));
    } catch {
      /* 译不出来就不显示 */
    } finally {
      setBingeTransLoading(false);
    }
  };

  const lookupBingeWord = async (word: string, top: number, left: number) => {
    const clean = word.replace(/[^a-zA-Z'’-]/g, "");
    if (!clean) return;
    setBingeWord({ word: clean, top, left, loading: true, entry: null });
    try {
      const data = await window.studyNotes?.enrichWord?.(clean);
      setBingeWord((prev) =>
        prev && prev.word === clean
          ? { ...prev, loading: false, entry: data ? { word: data.word || clean, phonetic: data.phonetic, usphone: data.usphone, meaning: data.meaning } : null }
          : prev,
      );
    } catch {
      setBingeWord((prev) => (prev && prev.word === clean ? { ...prev, loading: false, entry: null } : prev));
    }
  };

  // 当前句变化时，句子列表自动滚到这句
  useEffect(() => {
    const list = bingeListRef.current;
    if (!list) return;
    const cur = list.querySelector(".jy-binge-cue.current");
    if (cur) {
      const top = (cur as HTMLElement).offsetTop - list.clientHeight / 2 + (cur as HTMLElement).clientHeight / 2;
      list.scrollTop = Math.max(0, top);
    }
  }, [bingeIdx, bingeOpen]);

  // TED 式：当前句中文翻译自动常显——播到哪句自动译哪句（成功缓存；失败不反复重试，也可点「译」手动再试）
  const bingeTransTriedRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    bingeTransTriedRef.current.clear();
  }, [cues]);
  useEffect(() => {
    if (!bingeOpen || !cues || !cues.length) return;
    const idx = Math.min(bingeIdx, cues.length - 1);
    if (bingeTrans[idx] || bingeTransLoading || bingeTransTriedRef.current.has(idx)) return;
    bingeTransTriedRef.current.add(idx);
    void translateCue(idx);
  }, [bingeIdx, bingeOpen, cues, bingeTrans, bingeTransLoading]);

  useEffect(() => stopBingeAudio, []);

  const addToWordbook = async (w: JyWord) => {
    try {
      const existing = (await window.studyNotes?.listWords?.()) || [];
      if (existing.some((item) => item.word.toLowerCase() === w.word.toLowerCase())) return;
      const next = await window.studyNotes?.addWord({
        word: w.word,
        phonetic: w.phonetic,
        meaning: w.meaning,
        sentence: w.sentence,
        sentenceMeaning: w.sentenceZh,
      });
      if (next) void next;
    } catch {
      /* noop */
    }
  };

  const removeLib = (libId: string) => {
    const next = loadLibs().filter((l) => l.id !== libId);
    saveLibs(next);
    setLibs(next);
    if (activeLibId === libId) {
      setActiveLibId(null);
      setView("setup");
    }
  };

  // 键盘：测验阶段空格显示答案，1/2/3 自评（输入框聚焦时不抢）
  useEffect(() => {
    if (view !== "study" || mode !== "learn") return;
    const handler = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const inQuiz = !curLearn && curQuiz;
      if (event.code === "Space" && inQuiz && !revealed) {
        event.preventDefault();
        setRevealed(true);
        return;
      }
      if (revealed && inQuiz) {
        const word = curQuiz.word;
        if (event.key === "1") {
          setStatus(word, "known");
          setRevealed(false);
          setQuizIdx((i) => i + 1);
        } else if (event.key === "2") {
          setStatus(word, "fuzzy");
          setRevealed(false);
          setQuizIdx((i) => i + 1);
        } else if (event.key === "3") {
          setStatus(word, "later");
          setRevealed(false);
          setQuizIdx((i) => i + 1);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [view, mode, revealed, curLearn, curQuiz, activeLib]);

  // ============ 词库列表（setup） ============
  if (view === "setup" || !activeLib) {
    return (
      <section className="jy-panel">
        {!(currentShow && bingeOpen) && (
        <>
        <div className="jy-setup-card">
          <div className="jy-setup-head">
            <BookOpenText size={17} />
            <strong>剧有词 · AI 背单词</strong>
          </div>
          <p className="jy-tip">
            把一段英文粘进来（美剧字幕、台词、文章都行），AI 从里面挑出值得背的词，
            生成可以翻卡自评的学习页：先学新词 → 「稍后再考我」→ 翻卡测验（空格显示答案，1 答对 / 2 想起来了 / 3 没记住）。
          </p>
          <textarea
            ref={inputRef}
            className="jy-input"
            value={input}
            placeholder="粘贴英文原文，比如一集美剧的字幕文本……"
            onChange={(event) => setInput(event.target.value)}
          />
          <div className="jy-setup-row">
            <label>
              词库名
              <input value={title} placeholder="留空让 AI 起名" onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label>
              选词级别
              <select value={level} onChange={(event) => setLevel(event.target.value)}>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn primary" onClick={() => void generate()} disabled={loading}>
              {loading ? <Loader2 className="spin" size={14} /> : <Plus size={14} />}
              {loading ? "AI 正在挑词…" : "生成词库"}
            </button>
          </div>
          {error && <p className="jy-error">{error}</p>}
        </div>

        <div className="jy-shows">
          <div className="jy-shows-head">
            <div className="jy-shows-title">
              <Clapperboard size={15} />
              <strong>追剧学英语 · 推荐剧集</strong>
            </div>
            <button type="button" className="btn ghost small" onClick={() => void recommendShows()} disabled={showsLoading}>
              {showsLoading ? <Loader2 className="spin" size={12} /> : <Plus size={12} />}
              {showsLoading ? "AI 挑剧中…" : shows ? "换一批" : "让 AI 推荐"}
            </button>
          </div>
          {currentShow && (
            <div className="jy-current-show">
              <span>
                当前追的剧：<strong>{currentShow.name}</strong>
                <em>{currentShow.level}</em>
              </span>
              <span className="jy-current-show-actions">
                {!bingeOpen && (
                  <button type="button" className="btn ghost small" onClick={() => setBingeOpenPersist(true)}>
                    打开精听
                  </button>
                )}
                <button type="button" className="btn ghost small" onClick={clearShow}>
                  换一部
                </button>
              </span>
            </div>
          )}
          {showsError && <p className="jy-error">{showsError}</p>}
          {shows && (
            <div className="jy-show-groups">
              {(["入门", "进阶", "高阶"] as const).map((lv) => {
                const group = shows.filter((s) => s.level === lv);
                if (!group.length) return null;
                return (
                  <div key={lv} className="jy-show-group">
                    <p className="jy-show-group-label">{lv}</p>
                    {group.map((s, i) => (
                      <div className="jy-show-item" key={`${lv}-${i}`}>
                        <div className="jy-show-main">
                          <strong>{s.name}</strong>
                          <span>{s.reason}</span>
                        </div>
                        <div className="jy-show-actions">
                          <button
                            type="button"
                            className={`btn small ${currentShow?.name === s.name ? "primary" : "ghost"}`}
                            onClick={() => pickShow(s)}
                          >
                            {currentShow?.name === s.name ? "当前追的剧" : "就用这部"}
                          </button>
                          <button
                            type="button"
                            className="btn small ghost jy-show-find"
                            data-show-name={s.name}
                            onClick={() => void findResources(s)}
                            disabled={resource[s.name]?.loading}
                          >
                            {resource[s.name]?.loading ? <Loader2 className="spin" size={12} /> : <MapPin size={12} />}
                            {resource[s.name]?.loading ? "AI 找资源中…" : "在哪能找到"}
                          </button>
                        </div>
                        {resource[s.name]?.error && <p className="jy-resource jy-resource-error">{resource[s.name]!.error}</p>}
                        {resource[s.name]?.text && (
                          <div className="jy-resource">
                            <p className="jy-resource-text">{resource[s.name]!.text}</p>
                            <p className="jy-resource-tip">以上网址是 AI 按公开信息给的参考，用前请自己确认还能打开；软件只做精听、不提供片源。</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </>
        )}

        {currentShow && bingeOpen && (
          <div className="jy-binge jy-binge-page" ref={bingeSectionRef}>
            <div className="jy-binge-topbar">
              <button type="button" className="jy-binge-back" onClick={() => setBingeOpenPersist(false)}>
                ← 返回剧单
              </button>
              <strong className="jy-binge-title">{currentShow.name}</strong>
              <em className="jy-binge-level">{currentShow.level}</em>
            </div>
            {!bingeVideoSrc && (
              <>
                <div className="jy-binge-guide">
                  <p className="jy-binge-guide-title">这剧的正片有版权，软件不能替你下载。跟着三步走，准备好就能像 TED 那样逐句精听：</p>
                  <ol className="jy-binge-steps">
                    <li>
                      <strong>① 找资源</strong>
                      点「← 返回剧单」，在那部剧上点「📍 在哪能找到」，AI 会告诉你去哪看正版、英文字幕去哪个站下载
                    </li>
                    <li>
                      <strong>② 下载到电脑</strong>
                      把这一集的视频（mp4 / mkv 都行）和字幕（.srt 或 .vtt）下载下来，放同一个文件夹
                    </li>
                    <li>
                      <strong>③ 选文件开始练</strong>
                      点下面的「选择视频文件」和「选择字幕」，选好就能逐句高亮、跳转、朗读、点词查词
                    </li>
                  </ol>
                </div>
                {onOpenLibrary && (
                  <button type="button" className="btn primary small jy-binge-library" onClick={onOpenLibrary}>
                    不想等？用内置免费视频练（打开就有画面和字幕，不用下载）
                  </button>
                )}
              </>
            )}
            <p className="jy-binge-tip">
              {isDesktop
                ? "选一集你下载好的视频 + 配套字幕（.srt / .vtt），就能像 TED 精听一样：视频播放、字幕逐句高亮、点句子跳转、点单词查词加生词本。"
                : "网页版选视频和字幕各一次（视频不会记住，每次重开要重选）；电脑版会记住上次的视频。"}
            </p>
            <div className="jy-binge-files">
              <button type="button" className="btn ghost small" onClick={() => void pickShowVideo()}>
                {bingeVideoSrc ? "换一集视频" : "选择视频文件"}
              </button>
              {showVideoPath && isDesktop && <span className="jy-binge-file-name">{showVideoPath.split("/").pop()}</span>}
              <button type="button" className="btn ghost small" onClick={() => srtInputRef.current?.click()}>
                {cues ? "换字幕" : "选择字幕（.srt / .vtt / 台词文本）"}
              </button>
              {cues && <span className="jy-binge-file-name">{cues.length} 句{cues[0]?.t0 < 0 ? " · 台词模式（无时间轴）" : ""}</span>}
            </div>
            <input ref={srtInputRef} type="file" accept=".srt,.vtt,.txt,text/plain" style={{ display: "none" }} onChange={(e) => void onSrtPicked(e)} />
            <input ref={webVideoInputRef} type="file" accept="video/*" style={{ display: "none" }} onChange={onWebVideoPicked} />

            {bingeVideoSrc && (
              <div className="jy-binge-video-box">
                <video
                  ref={bingeVideoRef}
                  src={bingeVideoSrc}
                  controls={false}
                  playsInline
                  preload="metadata"
                  onTimeUpdate={(event) => {
                    const t = event.currentTarget.currentTime;
                    setBingeTime(t);
                    if (cues && cues.length && cues[0].t0 >= 0) {
                      const idx = bingeActiveIdx(t);
                      if (idx !== bingeIdx) setBingeIdx(idx);
                      // 逐句停顿：句末自动停在当前句，字幕钉住，读完再继续
                      if (bingeSentencePause && t * 1000 >= bingeSentenceEnd(idx) && bingeSentenceEnd(idx) > 0) {
                        const v = event.currentTarget;
                        v.pause();
                        setBingePlaying(false);
                      }
                    }
                  }}
                  onLoadedMetadata={(event) => {
                    event.currentTarget.playbackRate = bingeSpeed;
                    if (Number.isFinite(event.currentTarget.duration)) setBingeDur(event.currentTarget.duration);
                  }}
                  onPlay={() => setBingePlaying(true)}
                  onPause={() => setBingePlaying(false)}
                  onEnded={() => {
                    if (bingeLoop && cues && cues.length && cues[0].t0 >= 0) {
                      const video = bingeVideoRef.current;
                      if (video) {
                        video.currentTime = cues[Math.min(bingeIdx, cues.length - 1)].t0 + 0.01;
                        void video.play().catch(() => undefined);
                      }
                    } else {
                      setBingePlaying(false);
                    }
                  }}
                />
              </div>
            )}

            {cues && cues.length > 0 && (
              <>
                <div className="jy-binge-now">
                  <p className="jy-binge-now-en">
                    {(cues[Math.min(bingeIdx, cues.length - 1)]?.en || "").split(/\s+/).map((w, i) => (
                      <span
                        key={i}
                        className="jy-binge-word"
                        onClick={(event) => lookupBingeWord(w, event.clientY + 8, event.clientX)}
                      >
                        {w}{" "}
                      </span>
                    ))}
                  </p>
                  <p className="jy-binge-now-zh">
                    {bingeTrans[bingeIdx] ||
                      (bingeTransLoading ? "翻译中…" : "")}
                  </p>
                </div>
                <div className="jy-binge-controls">
                  <button type="button" className="jy-binge-btn" title="上一句" onClick={() => bingeSeekTo(bingeIdx - 1)}>
                    ⏮
                  </button>
                  <button
                    type="button"
                    className="jy-binge-btn play"
                    onClick={() => {
                      const video = bingeVideoRef.current;
                      if (video) {
                        if (video.paused) {
                          // 逐句停顿停在句末：点继续 = 前进到下一句开头
                          if (bingeSentencePause && cues && cues.length && cues[0].t0 >= 0 && bingeIdx < cues.length - 1 && video.currentTime * 1000 >= bingeSentenceEnd(bingeIdx)) {
                            bingeSeekTo(bingeIdx + 1);
                          } else {
                            void video.play().catch(() => undefined);
                          }
                        } else {
                          video.pause();
                        }
                      } else {
                        void speakCue(bingeIdx);
                      }
                    }}
                  >
                    {bingePlaying ? "⏸" : "▶"}
                  </button>
                  <button type="button" className="jy-binge-btn" title="下一句" onClick={() => bingeSeekTo(bingeIdx + 1)}>
                    ⏭
                  </button>
                  <span className="jy-binge-progress">
                    第 {bingeIdx + 1} / {cues.length} 句
                  </span>
                  <button type="button" className="jy-binge-btn small" title="朗读这句（美音）" onClick={() => speakCue(bingeIdx)}>
                    <Volume2 size={14} />
                  </button>
                  <button type="button" className="jy-binge-btn small" title="朗读这句（慢速）" onClick={() => speakCue(bingeIdx, true)}>
                    慢
                  </button>
                  <button type="button" className="jy-binge-btn small" title="AI 翻译这句" onClick={() => void translateCue(bingeIdx)}>
                    译
                  </button>
                  <button
                    type="button"
                    className={`jy-binge-btn small ${bingeLoop ? "active" : ""}`}
                    title="这一句放完自动从头再放"
                    onClick={() => setBingeLoop((v) => !v)}
                  >
                    单句循环{bingeLoop ? "开" : "关"}
                  </button>
                  <button
                    type="button"
                    className={`jy-binge-btn small ${bingeSentencePause ? "active" : ""}`}
                    title="每句音频放完自动停在当前句，读完再继续，让声音和字幕同步"
                    onClick={() => {
                      localStorage.setItem("juyouci-binge-pause", (!bingeSentencePause).toString());
                      setBingeSentencePause((v) => !v);
                    }}
                  >
                    逐句停顿{bingeSentencePause ? "开" : "关"}
                  </button>
                </div>
                {bingeVideoSrc && cues[0].t0 >= 0 && (
                  <div className="jy-binge-seek-row">
                    <span className="jy-binge-time">{formatSubTime(bingeTime)}</span>
                    <input
                      type="range"
                      min={0}
                      max={bingeDur || 0}
                      step={0.1}
                      value={Math.min(bingeTime, bingeDur || 0)}
                      onPointerDown={() => {
                        bingeSeekingRef.current = true;
                      }}
                      onPointerUp={() => {
                        bingeSeekingRef.current = false;
                      }}
                      onChange={(event) => {
                        const t = Number(event.target.value);
                        setBingeTime(t);
                        const video = bingeVideoRef.current;
                        if (video) {
                          video.currentTime = t;
                          setBingeIdx(bingeActiveIdx(t));
                        }
                      }}
                    />
                    <span className="jy-binge-time">{formatSubTime(bingeDur)}</span>
                  </div>
                )}
                <div className="jy-binge-speed-row">
                  <span className="jy-binge-row-label">倍速</span>
                  {[0.6, 0.8, 1, 1.2, 1.5].map((v) => (
                    <button
                      type="button"
                      key={v}
                      className={bingeSpeed === v ? "active" : ""}
                      onClick={() => {
                        setBingeSpeed(v);
                        if (bingeVideoRef.current) bingeVideoRef.current.playbackRate = v;
                      }}
                    >
                      {v}×
                    </button>
                  ))}
                </div>
                <div className="jy-binge-cue-list" ref={bingeListRef}>
                  {cues.map((cue, idx) => (
                    <div key={`${idx}-${cue.t0}`} className={`jy-binge-cue ${idx === bingeIdx ? "current" : ""}`} onClick={() => bingeSeekTo(idx)}>
                      <span className="jy-binge-cue-index">{idx + 1}</span>
                      <span className="jy-binge-cue-body">
                        <span className="jy-binge-cue-en">
                          {cue.t0 >= 0 && <em className="jy-binge-cue-time">{formatSubTime(cue.t0)}</em>}
                          {cue.en.split(/\s+/).map((w, i) => (
                            <span
                              key={i}
                              className="jy-binge-word"
                              onClick={(event) => {
                                event.stopPropagation();
                                lookupBingeWord(w, event.clientY + 8, event.clientX);
                              }}
                            >
                              {w}{" "}
                            </span>
                          ))}
                        </span>
                        {bingeTrans[idx] && <span className="jy-binge-cue-zh">{bingeTrans[idx]}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {bingeWord && (
              <>
                <div className="jy-binge-wordpop-mask" onClick={() => setBingeWord(null)} />
                <div className="jy-binge-wordpop" style={{ top: Math.min(bingeWord.top, (typeof window !== "undefined" ? window.innerHeight : 600) - 160), left: Math.max(8, Math.min(bingeWord.left, (typeof window !== "undefined" ? window.innerWidth : 400) - 250)) }}>
                  <div className="jy-binge-wordpop-head">
                    <strong>{bingeWord.word}</strong>
                    <button type="button" className="jy-binge-wordpop-close" onClick={() => setBingeWord(null)}>
                      ×
                    </button>
                  </div>
                  {bingeWord.loading && <p className="jy-binge-wordpop-meaning">查词中…</p>}
                  {!bingeWord.loading && !bingeWord.entry && <p className="jy-binge-wordpop-meaning">没查到这个词</p>}
                  {bingeWord.entry && (
                    <>
                      {bingeWord.entry.usphone && <p className="jy-binge-wordpop-phone">/{bingeWord.entry.usphone}/</p>}
                      <p className="jy-binge-wordpop-meaning">{bingeWord.entry.meaning}</p>
                      <button
                        type="button"
                        className="btn primary small"
                        onClick={() => {
                          void addToWordbook({
                            word: bingeWord.word,
                            phonetic: bingeWord.entry?.phonetic || "",
                            meaning: bingeWord.entry?.meaning || "",
                            sentence: cues?.[bingeIdx]?.en || "",
                            sentenceZh: bingeTrans[bingeIdx] || "",
                            status: "new",
                          });
                          setBingeWord(null);
                        }}
                      >
                        加入单词本
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {libs.length > 0 && (
          <div className="jy-libs">
            <div className="jy-libs-head">
              <strong>我的词库</strong>
              <span>每个词库进度独立保存</span>
            </div>
            {libs.map((lib) => {
              const known = lib.words.filter((w) => w.status === "known" || w.status === "fuzzy").length;
              const later = lib.words.filter((w) => w.status === "later").length;
              return (
                <div className="jy-lib-row" key={lib.id}>
                  <button
                    type="button"
                    className="jy-lib-main"
                    onClick={() => {
                      setActiveLibId(lib.id);
                      setLearnIdx(0);
                      setQuizIdx(0);
                      setRevealed(false);
                      setMode("learn");
                      setView("study");
                    }}
                  >
                    <strong>{lib.title}</strong>
                    <span>
                      共 {lib.words.length} 词 · 已掌握 {known} · 待复习 {later}
                      {lib.level !== "不限" ? ` · ${lib.level}` : ""}
                    </span>
                  </button>
                  <button type="button" className="icon-btn" title="删除这个词库" onClick={() => removeLib(lib.id)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  // ============ 学习页（study） ============
  const lib = activeLib;
  const inLearnPhase = learnQueue.length > 0;
  const currentWord = inLearnPhase ? curLearn : curQuiz;

  return (
    <section className="jy-panel">
      <div className="jy-study-head">
        <button
          type="button"
          className="icon-btn"
          title="返回词库列表"
          onClick={() => {
            setView("setup");
            setActiveLibId(null);
          }}
        >
          <ArrowLeft size={16} />
        </button>
        <div className="jy-study-title">
          <strong>{lib.title}</strong>
          <span>
            待记 {newWords.length + laterWords.length} · 稍后考 {laterWords.length} · 已掌握 {knownCount} · 共 {lib.words.length} 词
          </span>
        </div>
        <div className="jy-mode-switch">
          <button type="button" className={mode === "learn" ? "active" : ""} onClick={() => setMode("learn")}>
            学习与回忆
          </button>
          <button type="button" className={mode === "overview" ? "active" : ""} onClick={() => setMode("overview")}>
            词汇总览
          </button>
        </div>
      </div>

      {mode === "learn" && (
        <div className="jy-study-body">
          {!currentWord && (
            <div className="jy-empty">
              <p>这一轮没有要学的词了。</p>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  updateLib(lib.id, (l) => ({
                    ...l,
                    words: l.words.map((w) => (w.status === "later" ? { ...w, status: "new" } : w)),
                  }));
                  setLearnIdx(0);
                  setQuizIdx(0);
                  setRevealed(false);
                }}
              >
                <RotateCcw size={14} /> 全部重来一轮
              </button>
            </div>
          )}

          {currentWord && (
            <div className="jy-card">
              <p className="jy-card-step">
                {inLearnPhase ? `01 · 学新词 · 队列剩余 ${learnQueue.length - learnIdx} 项` : "02 · 翻卡回忆 · 稍后考队列"}
              </p>
              <div className="jy-card-word">
                <h3>{currentWord.word}</h3>
                {currentWord.phonetic && <span>{currentWord.phonetic}</span>}
              </div>

              {(inLearnPhase || revealed) && (
                <>
                  <p className="jy-card-meaning">{currentWord.meaning}</p>
                  <div className="jy-card-sentence">
                    <p>{highlightWord(currentWord.sentence, currentWord.word)}</p>
                    {currentWord.sentenceZh && <span>{currentWord.sentenceZh}</span>}
                  </div>
                </>
              )}
              {!inLearnPhase && !revealed && <p className="jy-card-hint">想一下这个词的意思，按空格（或点下面按钮）核对答案</p>}

              <div className="jy-card-actions">
                {inLearnPhase ? (
                  <>
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => {
                        setStatus(currentWord.word, "later");
                        setLearnIdx((i) => i + 1);
                      }}
                    >
                      学过了，稍后再考我
                    </button>
                    <button type="button" className="btn ghost" onClick={() => speakEn(currentWord.sentence || currentWord.word)}>
                      <Volume2 size={14} /> 朗读原句
                    </button>
                  </>
                ) : !revealed ? (
                  <>
                    <button type="button" className="btn primary" onClick={() => setRevealed(true)}>
                      显示答案（空格）
                    </button>
                    <button type="button" className="btn ghost" onClick={() => speakEn(currentWord.word)}>
                      <Volume2 size={14} /> 朗读单词
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn primary jy-grade ok"
                      onClick={() => {
                        setStatus(currentWord.word, "known");
                        setRevealed(false);
                        setQuizIdx((i) => i + 1);
                      }}
                    >
                      1 答对了
                    </button>
                    <button
                      type="button"
                      className="btn jy-grade mid"
                      onClick={() => {
                        setStatus(currentWord.word, "fuzzy");
                        setRevealed(false);
                        setQuizIdx((i) => i + 1);
                      }}
                    >
                      2 想起来了
                    </button>
                    <button
                      type="button"
                      className="btn ghost jy-grade bad"
                      onClick={() => {
                        setStatus(currentWord.word, "later");
                        setRevealed(false);
                        setQuizIdx((i) => i + 1);
                      }}
                    >
                      3 没记住
                    </button>
                  </>
                )}
              </div>
              {!inLearnPhase && revealed && (
                <button type="button" className="btn ghost small jy-speak-sentence" onClick={() => speakEn(currentWord.sentence)}>
                  <Volume2 size={13} /> 朗读原句
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {mode === "overview" && (
        <div className="jy-overview">
          {lib.words.map((w, i) => (
            <div className={`jy-row st-${w.status}`} key={`${w.word}-${i}`}>
              <div className="jy-row-main">
                <div className="jy-row-word">
                  <strong>{w.word}</strong>
                  {w.phonetic && <span>{w.phonetic}</span>}
                  <em>{STATUS_LABEL[w.status]}</em>
                </div>
                <p className="jy-row-meaning">{w.meaning}</p>
                <div className="jy-row-sentence">
                  <p>{highlightWord(w.sentence, w.word)}</p>
                  {w.sentenceZh && <span>{w.sentenceZh}</span>}
                </div>
              </div>
              <div className="jy-row-actions">
                <button type="button" className="icon-btn" title="朗读原句" onClick={() => speakEn(w.sentence || w.word)}>
                  <Volume2 size={14} />
                </button>
                <button type="button" className="btn ghost small" title="加入单词本" onClick={() => void addToWordbook(w)}>
                  加入单词本
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
