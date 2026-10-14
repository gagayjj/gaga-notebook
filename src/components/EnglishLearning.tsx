import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookMarked,
  BookOpenText,
  CheckCircle2,
  Circle,
  ExternalLink,
  Languages,
  ListChecks,
  Loader2,
  MonitorPlay,
  Pause,
  PenLine,
  Play,
  Plus,
  Quote,
  RotateCcw,
  Save,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import { recommendedWords, type EnglishWord } from "../data/englishWords";
import type { SrStatus, StudySentence, StudyWord, TedIndexItem, TedTalkData } from "../types";
import JuyouciPanel from "./JuyouciPanel";
import AskAiPanel from "./AskAiPanel";
import {
  loadAiConfig,
  saveAiConfig,
  clearAiConfig,
  callAiTutor,
  buildAiTutorMessages,
  parseAiResult,
  PROVIDER_LABELS,
  PROVIDER_ORDER,
  type AiProvider,
  type ParsedAi,
  type AiVocab,
} from "../aiTutor";

interface EnglishLearningProps {
  onClose: () => void;
}

interface DailyWord extends StudyWord {
  source: "custom" | "recommended";
}

interface QuizEntry {
  id: string;
  prompt: string;
  hint: string;
  answer: string;
}

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}

// —— 复习调度（间隔重复）——
type SrGrade = "know" | "fuzzy" | "unknown";

// 根据这次的结果算下一次的排期。老词没字段按"新词/立即到期"处理。
function srGradePatch(word: StudyWord, grade: SrGrade): Partial<StudyWord> {
  const now = Date.now();
  const interval = word.srInterval || 0;
  const reps = word.srReps || 0;
  const DAY = 86400000;
  if (grade === "know") {
    const nextReps = reps + 1;
    const nextInterval = interval === 0 ? 1 : Math.round(interval * 2.5);
    const known = nextReps >= 5 || nextInterval >= 16;
    const due = known ? now + 30 * DAY : now + nextInterval * DAY;
    return { srStatus: known ? "known" : "review", srDue: new Date(due).toISOString(), srInterval: nextInterval, srReps: nextReps };
  }
  if (grade === "fuzzy") {
    const nextInterval = Math.max(1, Math.round(interval / 2));
    return { srStatus: "learning", srDue: new Date(now + nextInterval * DAY).toISOString(), srInterval: nextInterval, srReps: 0 };
  }
  // 不会：当天重来
  return { srStatus: "learning", srDue: new Date(now).toISOString(), srInterval: 0, srReps: 0 };
}

function srIsDue(word: StudyWord): boolean {
  if (word.srStatus === "known") return false;
  const due = word.srDue ? new Date(word.srDue).getTime() : 0;
  return due <= Date.now();
}

const SR_LABEL: Record<SrStatus, string> = { new: "新", learning: "学", review: "待复习", known: "已掌握" };

// 朗读语速上下限（倍速）
const RATE_MIN = 0.5;
const RATE_MAX = 2;
const clampRate = (value: number) => Math.min(RATE_MAX, Math.max(RATE_MIN, value || 1));

// 不同性别的英文语音名关键词（用于在各平台语音列表里挑选女生/男生声）
const FEMALE_VOICE_HINTS = [
  "samantha", "victoria", "moira", "tessa", "kate", "karen", "susan",
  "allison", "ava", "zira", "fiona", "vicki", "tina", "female", "woman",
  "google us english", "google uk english", "yue", "mei", "ting", "sin-ji",
];
const MALE_VOICE_HINTS = [
  "alex", "fred", "daniel", "arthur", "george", "david", "rishi", "nishant",
  "male", "man", "fred", "google uk english male",
];

type VoicePreference = "female" | "male" | "default";

// 有道词典的查词结果
interface DictEntry {
  word: string;
  phonetic: string;
  meaning: string;
  sentence: string;
  sentenceMeaning: string;
  usphone?: string;
  ukphone?: string;
  meanings?: string[];
  wfs?: { name: string; value: string }[];
}

// 有道发音接口：type=1 英音，type=2 美音（真人/高清合成，比系统语音清楚很多）
const youdaoVoiceUrl = (text: string, type: 1 | 2) =>
  `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(text)}&type=${type}`;

// 逐句对照的翻译记录（整段保存，可恢复）
interface BilingualRecord {
  id: string;
  time: number;
  text: string;
  pairs: { english: string; chinese: string }[];
}

function pickVoice(voices: SpeechSynthesisVoice[], preference: VoicePreference): SpeechSynthesisVoice | null {
  const english = voices.filter((item) => item.lang?.toLowerCase().startsWith("en"));
  if (preference === "default" || english.length === 0) {
    return english[0] || voices[0] || null;
  }
  const hints = preference === "female" ? FEMALE_VOICE_HINTS : MALE_VOICE_HINTS;
  const byHint = english.find((item) => hints.some((hint) => item.name.toLowerCase().includes(hint)));
  if (byHint) return byHint;
  // 部分浏览器在 voice.name 里直接标注 Female / Male
  const byGender = english.find((item) => new RegExp(preference, "i").test(item.name));
  if (byGender) return byGender;
  return english[0] || null;
}

function normalizeAnswer(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

type QuizDiffToken = { text: string; ok: boolean };

// 把答案切成小写单词（去标点），用于逐词对比
function tokenizeForDiff(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

// 用最长公共子序列对齐用户答案与正确答案，标出写错 / 漏写 / 多写的单词
function diffQuizAnswer(userText: string, answerText: string) {
  const user = tokenizeForDiff(userText);
  const answer = tokenizeForDiff(answerText);
  const n = user.length;
  const m = answer.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] =
        user[i] === answer[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const userTokens: QuizDiffToken[] = [];
  const answerTokens: QuizDiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (user[i] === answer[j]) {
      userTokens.push({ text: user[i], ok: true });
      answerTokens.push({ text: answer[j], ok: true });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      userTokens.push({ text: user[i], ok: false });
      i += 1;
    } else {
      answerTokens.push({ text: answer[j], ok: false });
      j += 1;
    }
  }
  while (i < n) {
    userTokens.push({ text: user[i], ok: false });
    i += 1;
  }
  while (j < m) {
    answerTokens.push({ text: answer[j], ok: false });
    j += 1;
  }
  return { userTokens, answerTokens };
}

export function EnglishLearning({ onClose }: EnglishLearningProps) {
  const [tab, setTab] = useState<"learn" | "wordbook" | "sentencebook" | "dictation" | "bilingual" | "ted" | "juyouci" | "askai">("learn");
  const [planType, setPlanType] = useState<"words" | "sentences">(
    () => (localStorage.getItem("english-plan-type") as "words" | "sentences") || "words",
  );
  const [goal, setGoal] = useState(() => Number(localStorage.getItem("english-daily-goal") || 5));
  const [customWords, setCustomWords] = useState<StudyWord[]>([]);
  const [customSentences, setCustomSentences] = useState<StudySentence[]>([]);
  const [expandedSentenceIds, setExpandedSentenceIds] = useState<Record<string, boolean>>({});
  const [learned, setLearned] = useState(false);
  const [sentenceLearned, setSentenceLearned] = useState(false);
  const [rate, setRate] = useState<number>(() => {
    const saved = Number(localStorage.getItem("english-tts-rate"));
    return saved ? clampRate(saved) : 1;
  });
  const [ttsVoice, setTtsVoice] = useState<VoicePreference>(
    () => (localStorage.getItem("english-tts-voice") as VoicePreference) || "female",
  );
  // 口音偏好：1 英音 / 2 美音（默认英音，有道对长句的英音覆盖更全）
  const [accent, setAccent] = useState<1 | 2>(() =>
    localStorage.getItem("english-tts-accent") === "2" ? 2 : 1,
  );
  // 当前正在播的有道音频，用于暂停 / 继续
  const youdaoAudioRef = useRef<HTMLAudioElement | null>(null);
  const [paused, setPaused] = useState(false);
  const [showTtsSettings, setShowTtsSettings] = useState(false);
  const ttsBtnRef = useRef<HTMLButtonElement>(null);
  const [ttsMenuPos, setTtsMenuPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const [customText, setCustomText] = useState("");
  const [sentenceForm, setSentenceForm] = useState({ english: "", chinese: "" });
  const [editingSentenceId, setEditingSentenceId] = useState<string | null>(null);
  const [editSentenceForm, setEditSentenceForm] = useState({ english: "", chinese: "" });
  const [todaySentenceIndex, setTodaySentenceIndex] = useState(() => Math.floor(Date.now() / 86400000));

  // 逐句对照：粘贴英文段落，按句号切句后逐句翻译为中文
  const [bilingualText, setBilingualText] = useState("");
  const [bilingualPairs, setBilingualPairs] = useState<
    { id: string; english: string; chinese: string; status: "pending" | "translated" | "error"; saved?: boolean; error?: string }[]
  >([]);
  const [bilingualLoading, setBilingualLoading] = useState(false);
  const [bilingualError, setBilingualError] = useState<string | null>(null);
  const bilingualCacheRef = useRef<Record<string, string>>({});
  // 翻译记录：保存每次整段翻译结果，下次直接点开恢复，不用重新粘贴
  const [bilingualHistory, setBilingualHistory] = useState<BilingualRecord[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem("english-bilingual-history") || "[]");
      return Array.isArray(parsed) ? (parsed as BilingualRecord[]) : [];
    } catch {
      return [];
    }
  });
  // 刚通过拖选标记了生词，避免紧接着的 onClick 又把整句朗读出来
  const justMarkedRef = useRef(false);

  // —— TED 精听 ——
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const tedFailedTransRef = useRef<Set<string>>(new Set());
  const tedSeekingRef = useRef(false); // 拖动进度条时为 true，避免 timeupdate 抢回滑块位置
  const [tedList, setTedList] = useState<TedIndexItem[]>([]);
  const [tedLevel, setTedLevel] = useState(0); // 0 = 全部难度
  const [tedSlug, setTedSlug] = useState<string | null>(null);
  const [tedTalk, setTedTalk] = useState<TedTalkData | null>(null);
  const [tedLoading, setTedLoading] = useState(false);
  const [tedSentIdx, setTedSentIdx] = useState(0);
  const [tedPlaying, setTedPlaying] = useState(false);
  const [tedSpeed, setTedSpeed] = useState(() => {
    const saved = Number(localStorage.getItem("ted-speed"));
    return saved >= 0.5 && saved <= 2 ? saved : 1;
  });
  const [tedLoopSentence, setTedLoopSentence] = useState(false);
  // 逐句停顿：每句音频放完自动停在这一句，字幕钉在当前句，读完再继续——让"视频声音"和"字幕"严格同步
  const [tedSentencePause, setTedSentencePause] = useState(() => localStorage.getItem("ted-sentence-pause") === "1");
  const [tedLoopTalk, setTedLoopTalk] = useState(() => localStorage.getItem("ted-loop-talk") === "1");
  const [tedAutoTrans, setTedAutoTrans] = useState(() => localStorage.getItem("ted-auto-trans") !== "0");
  // 翻译缓存，key = `${slug}:${idx}`，整个存在 localStorage 里下次免翻
  const [tedTrans, setTedTrans] = useState<Record<string, string>>({});
  // 连续播放进度（秒），用于自由拖动进度条；与句子索引分开，避免每帧重算
  const [tedTime, setTedTime] = useState(0);
  const [tedDuration, setTedDuration] = useState(0);
  // 点 TED 字幕里的单词 → 弹有道释义并加入单词本
  const [tedWordPop, setTedWordPop] = useState<{
    word: string;
    top: number;
    left: number;
    entry: DictEntry | null;
    loading: boolean;
    added: boolean;
  } | null>(null);

  // —— AI 精讲 + 自测 ——
  // 拖选英文后浮现的「AI 精讲」浮动按钮
  const [aiFloat, setAiFloat] = useState<{ text: string; context: string; top: number; left: number } | null>(null);
  // 打开的精讲 + 自测面板
  const [aiPanel, setAiPanel] = useState<{ text: string; context: string } | null>(null);
  // AI 设置（厂商 / API Key）面板开关
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);

  // —— 有道词典查词 ——
  const [dictQuery, setDictQuery] = useState("");
  const [dictResult, setDictResult] = useState<DictEntry | null>(null);
  const [dictLoading, setDictLoading] = useState(false);
  const [dictError, setDictError] = useState<string | null>(null);
  const [dictDetailId, setDictDetailId] = useState<string | null>(null);
  const [dictDetail, setDictDetail] = useState<DictEntry | null>(null);
  const [dictDetailLoading, setDictDetailLoading] = useState(false);
  const dictCacheRef = useRef<Record<string, DictEntry>>({});

  const [wordForm, setWordForm] = useState({
    word: "",
    phonetic: "",
    meaning: "",
    sentence: "",
    sentenceMeaning: "",
  });

  const [dictMode, setDictMode] = useState<"words" | "sentences">("words");
  const [quizEntries, setQuizEntries] = useState<QuizEntry[]>([]);
  const [quizSource, setQuizSource] = useState<QuizEntry[]>([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizAnswer, setQuizAnswer] = useState("");
  const [quizChecked, setQuizChecked] = useState(false);
  const [quizCorrect, setQuizCorrect] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongIds, setWrongIds] = useState<string[]>([]);
  const [quizDone, setQuizDone] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [markForms, setMarkForms] = useState<Record<string, { word: string; meaning: string; phonetic: string; meaningTouched: boolean }>>({});
  const [markEnriching, setMarkEnriching] = useState<Record<string, boolean>>({});
  const markEnrichTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    Promise.all([
      window.studyNotes?.listWords() || Promise.resolve([]),
      window.studyNotes?.listSentences() || Promise.resolve([]),
    ]).then(([words, sentences]) => {
      setCustomWords(words);
      setCustomSentences(sentences);
    });
    setLearned(localStorage.getItem(`english-learned-${dayKey()}`) === "1");
    setSentenceLearned(localStorage.getItem(`english-sentence-learned-${dayKey()}`) === "1");
  }, []);

  useEffect(() => {
    const synthesis = window.speechSynthesis;
    if (!synthesis) return;
    synthesis.getVoices();
    const loadVoices = () => synthesis.getVoices();
    synthesis.addEventListener("voiceschanged", loadVoices);
    return () => {
      synthesis.removeEventListener("voiceschanged", loadVoices);
      synthesis.cancel();
      // 关掉弹窗时也要停掉还没播完的有道音频和 TED 视频
      try {
        youdaoAudioRef.current?.pause();
      } catch {
        /* noop */
      }
      youdaoAudioRef.current = null;
      try {
        videoRef.current?.pause();
      } catch {
        /* noop */
      }
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("english-tts-rate", String(rate));
  }, [rate]);

  useEffect(() => {
    localStorage.setItem("english-tts-voice", ttsVoice);
  }, [ttsVoice]);

  useEffect(() => {
    localStorage.setItem("english-tts-accent", String(accent));
  }, [accent]);

  const dailyWords = useMemo<DailyWord[]>(() => {
    const custom = customWords.slice(0, goal).map((word) => ({ ...word, source: "custom" as const }));
    const remaining = Math.max(0, goal - custom.length);
    const dayOffset = Math.floor(Date.now() / 86400000);
    const recommended: DailyWord[] = [];
    for (let i = 0; i < remaining; i += 1) {
      const source = recommendedWords[(dayOffset * goal + i) % recommendedWords.length] as EnglishWord;
      recommended.push({ ...source, source: "recommended" });
    }
    return [...custom, ...recommended];
  }, [customWords, goal]);

  const todaySentence = useMemo(() => {
    if (customSentences.length === 0) return null;
    return customSentences[Math.abs(todaySentenceIndex) % customSentences.length];
  }, [customSentences, todaySentenceIndex]);

  const changePlanType = (type: "words" | "sentences") => {
    setPlanType(type);
    localStorage.setItem("english-plan-type", type);
  };

  const changeGoal = (value: number) => {
    setGoal(value);
    localStorage.setItem("english-daily-goal", String(value));
  };

  // 播放有道发音：返回 Promise，成功 resolve，失败 reject（调用方负责回退）
  const playYoudao = (text: string, type: 1 | 2, playbackRate: number): Promise<void> =>
    new Promise((resolve, reject) => {
      const cleaned = text.trim();
      if (!cleaned) {
        reject(new Error("empty"));
        return;
      }
      try {
        youdaoAudioRef.current?.pause();
      } catch {
        /* noop */
      }
      const audio = new Audio(youdaoVoiceUrl(cleaned, type));
      youdaoAudioRef.current = audio;
      audio.playbackRate = Math.min(RATE_MAX, Math.max(RATE_MIN, playbackRate || 1));
      audio.onended = () => {
        if (youdaoAudioRef.current === audio) {
          setSpeaking(false);
          setPaused(false);
        }
        resolve();
      };
      audio.onerror = () => {
        if (youdaoAudioRef.current === audio) {
          setSpeaking(false);
          setPaused(false);
        }
        reject(new Error("youdao audio failed"));
      };
      setSpeaking(true);
      setPaused(false);
      audio.play().catch(() => {
        if (youdaoAudioRef.current === audio) setSpeaking(false);
        reject(new Error("youdao play blocked"));
      });
    });

  // 系统语音兜底（有道拿不到音频时才用，声音会比较"机器人"）
  const speakWithSystemVoice = (text: string, rateValue: number) => {
    const synthesis = window.speechSynthesis;
    if (!synthesis || !text.trim()) return;
    synthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = rateValue;
    const voice = pickVoice(synthesis.getVoices(), ttsVoice);
    if (voice) utterance.voice = voice;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    setPaused(false);
    synthesis.speak(utterance);
  };

  const speak = (text: string, useSlow = false) => {
    const cleaned = text.trim();
    if (!cleaned) return;
    const rateValue = useSlow ? 0.65 : clampRate(rate);
    // 优先有道发音：先用偏好的口音，失败了换另一种口音，再不行才回退系统语音
    void playYoudao(cleaned, accent, rateValue)
      .catch(() => playYoudao(cleaned, accent === 1 ? 2 : 1, rateValue))
      .catch(() => speakWithSystemVoice(cleaned, rateValue));
  };

  // 英音 / 美音按钮：直接用指定口音读
  const speakWithAccent = (text: string, type: 1 | 2) => {
    const cleaned = text.trim();
    if (!cleaned) return;
    void playYoudao(cleaned, type, clampRate(rate)).catch(() => speak(cleaned));
  };

  // 暂停 / 继续：有道音频用 audio.pause()，系统语音用 speechSynthesis.pause()
  const togglePauseSpeaking = () => {
    const audio = youdaoAudioRef.current;
    if (audio && !audio.ended) {
      if (paused) {
        void audio.play().catch(() => undefined);
        setPaused(false);
      } else {
        audio.pause();
        setPaused(true);
      }
      return;
    }
    const synthesis = window.speechSynthesis;
    if (!synthesis) return;
    if (paused) {
      synthesis.resume();
      setPaused(false);
    } else {
      synthesis.pause();
      setPaused(true);
    }
  };

  const stopSpeaking = () => {
    try {
      youdaoAudioRef.current?.pause();
    } catch {
      /* noop */
    }
    youdaoAudioRef.current = null;
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setPaused(false);
  };

  const toggleLearned = () => {
    const next = !learned;
    setLearned(next);
    localStorage.setItem(`english-learned-${dayKey()}`, next ? "1" : "0");
  };

  const addCustomWord = async () => {
    if (!wordForm.word.trim()) return;
    const next = await window.studyNotes?.addWord({
      word: wordForm.word.trim(),
      phonetic: wordForm.phonetic.trim(),
      meaning: wordForm.meaning.trim(),
      sentence: wordForm.sentence.trim(),
      sentenceMeaning: wordForm.sentenceMeaning.trim(),
    });
    if (next) {
      setCustomWords(next);
      setWordForm({ word: "", phonetic: "", meaning: "", sentence: "", sentenceMeaning: "" });
    }
  };

  const removeCustomWord = async (id: string) => {
    const next = await window.studyNotes?.removeWord(id);
    if (next) setCustomWords(next);
  };

  // 复习调度：点"认识/模糊/不会"后更新该词的排期，落库并随同步带走
  const reviewCustomWord = async (id: string, grade: SrGrade) => {
    const word = customWords.find((w) => w.id === id);
    if (!word) return;
    const patch = srGradePatch(word, grade);
    const next = await window.studyNotes?.updateWord(id, patch);
    if (next) setCustomWords(next);
  };

  const addCustomSentence = async () => {
    if (!sentenceForm.english.trim()) return;
    const next = await window.studyNotes?.addSentence({
      english: sentenceForm.english.trim(),
      chinese: sentenceForm.chinese.trim(),
    });
    if (next) {
      setCustomSentences(next);
      setSentenceForm({ english: "", chinese: "" });
    }
  };

  const removeCustomSentence = async (id: string) => {
    const next = await window.studyNotes?.removeSentence(id);
    if (next) setCustomSentences(next);
  };

  // === 逐句对照 ===
  // 按 . ! ? 后跟空白/引号 切句，保留原文标点
  const splitSentences = (text: string): string[] => {
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (!cleaned) return [];
    // 使用正则切分：句末标点 + 可能的引号/空白
    const parts = cleaned.split(/(?<=[.!?。！？])\s+(?=["”'\)）]?)/g);
    return parts.map((s) => s.trim()).filter(Boolean);
  };

  // 把翻译失败的原因翻译成人话
  const describeTranslateError = (err: unknown): string => {
    const raw = err instanceof Error ? err.message : String(err);
    if (/MYMEMORY WARNING/i.test(raw)) return "今日免费额度已用完，明天自动恢复";
    if (/QUERY LENGTH LIMIT/i.test(raw)) return "单句太长，试试先拆短一点";
    if (/INVALID|DISTINCT/i.test(raw)) return "接口拒绝了这段内容";
    if (/HTTP 4\d\d/i.test(raw)) return "接口请求被拒绝";
    if (/HTTP 5\d\d/i.test(raw)) return "接口暂时不可用";
    if (/Failed to fetch|NetworkError|load failed/i.test(raw)) return "网络连接失败";
    return "翻译失败";
  };

  // 调 MyMemory 免费接口，en -> zh-CN（注意：限额时它也返回 200，正文是英文警告，要识别出来）
  const translateOne = async (en: string): Promise<string> => {
    const cached = bilingualCacheRef.current[en];
    if (cached) return cached;
    let lastError: unknown = new Error("empty response");
    // 主力：MyMemory（国内可直连）
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(en)}&langpair=en|zh-CN`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const out = data?.responseData?.translatedText;
      if (typeof out !== "string" || !out.trim()) throw new Error("empty response");
      if (/MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID SOURCE|TWO DISTINCT/i.test(out)) {
        throw new Error(out.slice(0, 120));
      }
      const cleaned = out.replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
      bilingualCacheRef.current[en] = cleaned;
      return cleaned;
    } catch (err) {
      lastError = err;
    }
    // 兜底：Google 网页翻译接口（桌面端有代理时可用）
    const gUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=${encodeURIComponent(en)}`;
    const gRes = await fetch(gUrl);
    if (!gRes.ok) throw lastError instanceof Error ? lastError : new Error(`HTTP ${gRes.status}`);
    const gData = await gRes.json();
    const joined = Array.isArray(gData?.[0])
      ? gData[0].map((seg: unknown) => (Array.isArray(seg) ? String(seg[0] ?? "") : "")).join("")
      : "";
    if (!joined.trim()) throw lastError instanceof Error ? lastError : new Error("empty response");
    bilingualCacheRef.current[en] = joined.trim();
    return joined.trim();
  };

  const retryPair = async (pairId: string) => {
    const pair = bilingualPairs.find((p) => p.id === pairId);
    if (!pair || bilingualLoading) return;
    setBilingualPairs((prev) => prev.map((x) => (x.id === pairId ? { ...x, status: "pending", error: undefined } : x)));
    try {
      const zh = await translateOne(pair.english);
      setBilingualPairs((prev) => prev.map((x) => (x.id === pairId ? { ...x, chinese: zh, status: "translated" } : x)));
    } catch (err) {
      setBilingualPairs((prev) =>
        prev.map((x) => (x.id === pairId ? { ...x, status: "error", error: describeTranslateError(err) } : x)),
      );
    }
  };

  // —— 翻译记录 ——
  const persistBilingualHistory = (records: BilingualRecord[]) => {
    setBilingualHistory(records);
    try {
      localStorage.setItem("english-bilingual-history", JSON.stringify(records.slice(0, 30)));
    } catch {
      /* 存不下就算了 */
    }
  };

  const restoreBilingualRecord = (record: BilingualRecord) => {
    setBilingualText(record.text);
    setBilingualError(null);
    setBilingualPairs(
      record.pairs.map((p, index) => ({
        id: `b-${index}-${Math.random().toString(36).slice(2, 9)}`,
        english: p.english,
        chinese: p.chinese,
        status: "translated" as const,
      })),
    );
  };

  const removeBilingualRecord = (recordId: string) => {
    persistBilingualHistory(bilingualHistory.filter((item) => item.id !== recordId));
  };

  const clearBilingualHistory = () => {
    if (!window.confirm("确定清空全部翻译记录吗？")) return;
    persistBilingualHistory([]);
  };

  const runBilingualTranslate = async () => {
    const sentences = splitSentences(bilingualText);
    if (!sentences.length) {
      setBilingualError("请先粘贴一段英文内容");
      setBilingualPairs([]);
      return;
    }
    setBilingualError(null);
    setBilingualLoading(true);
    // 初始化：所有句子置 pending，立即显示原文
    const initial = sentences.map((s) => ({
      id: `b-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`,
      english: s,
      chinese: "",
      status: "pending" as const,
    }));
    setBilingualPairs(initial);
    const results = new Map<string, string>();
    // 逐句翻译：并发数 2，避免过快触发 MyMemory 限流
    for (let i = 0; i < initial.length; i += 2) {
      const slice = initial.slice(i, i + 2);
      await Promise.all(
        slice.map(async (p) => {
          try {
            const zh = await translateOne(p.english);
            results.set(p.id, zh);
            setBilingualPairs((prev) => prev.map((x) => (x.id === p.id ? { ...x, chinese: zh, status: "translated" } : x)));
          } catch (err) {
            setBilingualPairs((prev) =>
              prev.map((x) => (x.id === p.id ? { ...x, status: "error", error: describeTranslateError(err) } : x)),
            );
          }
        }),
      );
    }
    setBilingualLoading(false);
    // 只要翻出了一句，就把整段结果存进翻译记录
    if (results.size > 0) {
      const record: BilingualRecord = {
        id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        time: Date.now(),
        text: bilingualText,
        pairs: initial
          .map((p) => ({ english: p.english, chinese: results.get(p.id) || "" }))
          .filter((p) => p.chinese),
      };
      persistBilingualHistory([record, ...bilingualHistory.filter((item) => item.text !== bilingualText)].slice(0, 30));
    }
  };

  // 把对照区某一条保存到语句本
  const saveBilingualToSentenceBook = async (pairId: string) => {
    const pair = bilingualPairs.find((p) => p.id === pairId);
    if (!pair || !pair.english || !pair.chinese) return;
    const result = await window.studyNotes?.addSentence({ english: pair.english, chinese: pair.chinese });
    if (result) setCustomSentences(result);
    setBilingualPairs((prev) => prev.map((p) => (p.id === pairId ? { ...p, saved: true } : p)));
  };

  const startEditSentence = (sentence: StudySentence) => {
    setEditingSentenceId(sentence.id);
    setEditSentenceForm({ english: sentence.english, chinese: sentence.chinese || "" });
  };

  const saveEditSentence = async (id: string) => {
    if (!editSentenceForm.english.trim()) return;
    const next = await window.studyNotes?.updateSentence(id, {
      english: editSentenceForm.english.trim(),
      chinese: editSentenceForm.chinese.trim(),
    });
    if (next) setCustomSentences(next);
    setEditingSentenceId(null);
  };

  const cancelEditSentence = () => {
    setEditingSentenceId(null);
  };

  const enrichWord = async (word: string): Promise<{ phonetic: string; meaning: string }> => {
    const cleaned = word.trim();
    if (!cleaned) return { phonetic: "", meaning: "" };
    if (window.studyNotes?.enrichWord) {
      try {
        const data = await window.studyNotes.enrichWord(cleaned);
        if (data) {
          return { phonetic: data.phonetic || "", meaning: data.meaning || "" };
        }
      } catch (error) {
        console.warn("enrichWord failed", error);
      }
    }
    const fallback = recommendedWords.find((item) => item.word.toLowerCase() === cleaned.toLowerCase());
    if (fallback) {
      return { phonetic: fallback.phonetic || "", meaning: fallback.meaning || "" };
    }
    return { phonetic: "", meaning: "" };
  };

  // —— 有道词典 ——
  const lookupYoudao = async (raw: string): Promise<DictEntry | null> => {
    const cleaned = raw.trim();
    if (!cleaned) return null;
    const key = cleaned.toLowerCase();
    if (dictCacheRef.current[key]) return dictCacheRef.current[key];
    const data = await window.studyNotes?.enrichWord?.(cleaned);
    if (!data) return null;
    const entry: DictEntry = {
      word: data.word || cleaned,
      phonetic: data.phonetic || "",
      meaning: data.meaning || "",
      sentence: data.sentence || "",
      sentenceMeaning: data.sentenceMeaning || "",
      usphone: data.usphone || "",
      ukphone: data.ukphone || "",
      meanings: data.meanings && data.meanings.length ? data.meanings : [],
      wfs: data.wfs && data.wfs.length ? data.wfs : [],
    };
    if (!entry.phonetic && !entry.meaning && !entry.sentence) return null;
    dictCacheRef.current[key] = entry;
    return entry;
  };

  const handleDictLookup = async () => {
    const cleaned = dictQuery.trim();
    if (!cleaned) return;
    setDictLoading(true);
    setDictError(null);
    setDictResult(null);
    try {
      const entry = await lookupYoudao(cleaned);
      if (entry) setDictResult({ ...entry, word: cleaned });
      else setDictError("有道没查到这个词，换个词试试");
    } catch {
      setDictError("查词失败，检查一下网络");
    } finally {
      setDictLoading(false);
    }
  };

  const addDictResultToWordbook = async () => {
    if (!dictResult?.word.trim()) return;
    const word = dictResult.word.trim();
    if (customWords.some((item) => item.word.toLowerCase() === word.toLowerCase())) {
      setDictError("这个词已经在单词本里了");
      return;
    }
    const next = await window.studyNotes?.addWord({
      word,
      phonetic: dictResult.phonetic,
      meaning: dictResult.meaning,
      sentence: dictResult.sentence,
      sentenceMeaning: dictResult.sentenceMeaning,
    });
    if (next) {
      setCustomWords(next);
      setDictError(null);
    }
  };

  const openYoudaoWeb = (raw: string) => {
    const cleaned = raw.trim();
    if (!cleaned) return;
    void window.studyNotes?.openExternal?.(`https://dict.youdao.com/result?word=${encodeURIComponent(cleaned)}&lang=en`);
  };

  const toggleWordDetail = async (item: StudyWord) => {
    if (dictDetailId === item.id) {
      setDictDetailId(null);
      setDictDetail(null);
      return;
    }
    setDictDetailId(item.id);
    setDictDetail(null);
    setDictDetailLoading(true);
    try {
      const entry = await lookupYoudao(item.word);
      setDictDetail(entry);
    } finally {
      setDictDetailLoading(false);
    }
  };

  // 有道词典式卡片：音标行（英 / 美，各带发音按钮）
  const renderDictPron = (entry: DictEntry) => (
    <div className="dict-pron-row">
      {entry.ukphone ? (
        <span className="dict-pron-item">
          <em className="dict-pron-tag">英</em>
          <span className="dict-pron">{entry.ukphone}</span>
          <button
            type="button"
            className="dict-speaker"
            title="英式发音"
            onClick={() => speakWithAccent(entry.word, 1)}
          >
            <Volume2 size={14} />
          </button>
        </span>
      ) : null}
      {entry.usphone ? (
        <span className="dict-pron-item">
          <em className="dict-pron-tag">美</em>
          <span className="dict-pron">{entry.usphone}</span>
          <button
            type="button"
            className="dict-speaker"
            title="美式发音"
            onClick={() => speakWithAccent(entry.word, 2)}
          >
            <Volume2 size={14} />
          </button>
        </span>
      ) : null}
      {!entry.ukphone && !entry.usphone && (
        <button
          type="button"
          className="dict-speaker"
          title="朗读"
          onClick={() => speakWithAccent(entry.word, accent)}
        >
          <Volume2 size={14} />
        </button>
      )}
    </div>
  );

  // 有道词典式卡片：释义 / 词形 / 例句
  const renderDictBody = (entry: DictEntry) => {
    const lines = entry.meanings && entry.meanings.length ? entry.meanings : [entry.meaning].filter(Boolean);
    return (
      <>
        {lines.length > 0 && (
          <div className="dict-meanings">
            {lines.map((line, index) => (
              <p className="dict-meaning" key={`${line}-${index}`}>
                {line}
              </p>
            ))}
          </div>
        )}
        {(entry.wfs?.length ?? 0) > 0 && (
          <div className="dict-wfs">
            {(entry.wfs || []).map((wf, index) => (
              <span className="dict-wf" key={`${wf.name}-${index}`}>
                <em>{wf.name}</em>
                <button type="button" title="朗读" onClick={() => speakWithAccent(wf.value, accent)}>
                  {wf.value}
                </button>
              </span>
            ))}
          </div>
        )}
        {entry.sentence && (
          <div className="dict-example">
            <p>{entry.sentence}</p>
            <div className="dict-example-foot">
              <span>{entry.sentenceMeaning}</span>
              <button
                type="button"
                className="dict-speaker"
                title="朗读例句"
                onClick={() => speakWithAccent(entry.sentence, accent)}
              >
                <Volume2 size={13} />
              </button>
            </div>
          </div>
        )}
      </>
    );
  };

  // ===== TED 精听 =====
  // 桌面走 IPC 读打包数据，手机走同源 fetch，两边都没有就算了
  useEffect(() => {
    if (tab !== "ted" || tedList.length) return;
    (async () => {
      try {
        if (window.studyNotes?.tedList) {
          const list = await window.studyNotes.tedList();
          if (list?.length) {
            setTedList(list);
            return;
          }
        }
      } catch {
        /* 走 fetch 兜底 */
      }
      try {
        const res = await fetch("ted/index.json");
        if (res.ok) setTedList(await res.json());
      } catch {
        /* noop */
      }
    })();
  }, [tab, tedList.length]);

  useEffect(() => {
    localStorage.setItem("ted-speed", String(tedSpeed));
  }, [tedSpeed]);
  useEffect(() => {
    localStorage.setItem("ted-loop-talk", tedLoopTalk ? "1" : "0");
  }, [tedLoopTalk]);

  useEffect(() => {
    localStorage.setItem("ted-sentence-pause", tedSentencePause ? "1" : "0");
  }, [tedSentencePause]);
  useEffect(() => {
    localStorage.setItem("ted-auto-trans", tedAutoTrans ? "1" : "0");
  }, [tedAutoTrans]);

  // 选中演讲 → 加载字幕数据（已加载过的不重复加载）；返回清单时要清掉已加载的演讲
  useEffect(() => {
    if (tab !== "ted") return;
    if (!tedSlug) {
      if (tedTalk) setTedTalk(null);
      setTedWordPop(null);
      return;
    }
    if (tedTalk?.slug === tedSlug) return;
    let cancelled = false;
    setTedLoading(true);
    setTedTalk(null);
    setTedSentIdx(0);
    setTedPlaying(false);
    setTedTime(0);
    setTedDuration(0);
    (async () => {
      let data: TedTalkData | null = null;
      try {
        if (window.studyNotes?.tedGet) data = await window.studyNotes.tedGet(tedSlug);
      } catch {
        /* 走 fetch 兜底 */
      }
      if (!data) {
        try {
          const res = await fetch(`ted/${tedSlug}.json`);
          if (res.ok) data = await res.json();
        } catch {
          /* noop */
        }
      }
      if (cancelled) return;
      setTedTalk(data);
      setTedLoading(false);
      tedFailedTransRef.current = new Set();
      try {
        const saved = JSON.parse(localStorage.getItem(`ted-trans-${tedSlug}`) || "{}");
        setTedTrans(saved && typeof saved === "object" ? saved : {});
      } catch {
        setTedTrans({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, tedSlug, tedTalk?.slug]);

  // 翻译缓存落盘
  useEffect(() => {
    if (!tedSlug || Object.keys(tedTrans).length === 0) return;
    try {
      localStorage.setItem(`ted-trans-${tedSlug}`, JSON.stringify(tedTrans));
    } catch {
      /* 存不下就算了 */
    }
  }, [tedTrans, tedSlug]);

  const tedTransKey = (idx: number) => `${tedSlug || ""}:${idx}`;

  const ensureTedTranslation = async (idx: number) => {
    if (!tedTalk || !tedAutoTrans) return;
    const key = tedTransKey(idx);
    if (tedTrans[key] || tedFailedTransRef.current.has(key)) return;
    const sent = tedTalk.sentences[idx];
    if (!sent) return;
    try {
      const zh = await translateOne(sent.text);
      tedFailedTransRef.current.delete(key);
      setTedTrans((prev) => ({ ...prev, [key]: zh }));
    } catch {
      tedFailedTransRef.current.add(key);
    }
  };

  // 自动翻译当前句和下一句（只翻正在听的，不浪费每日限额）
  useEffect(() => {
    if (tab !== "ted" || !tedTalk || !tedAutoTrans) return;
    void ensureTedTranslation(tedSentIdx);
    void ensureTedTranslation(tedSentIdx + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, tedTalk, tedSentIdx, tedAutoTrans, tedTrans]);

  const formatTedTime = (s: number) => {
    if (!Number.isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec < 10 ? "0" : ""}${sec}`;
  };

  const tedApplySpeed = (value: number) => {    setTedSpeed(value);
    if (videoRef.current) videoRef.current.playbackRate = value;
  };

  const tedSeekTo = (idx: number, autoplay = true) => {
    if (!tedTalk || !videoRef.current) return;
    const sent = tedTalk.sentences[idx];
    if (!sent) return;
    videoRef.current.currentTime = sent.t0 / 1000;
    setTedSentIdx(idx);
    if (autoplay) void videoRef.current.play().catch(() => undefined);
  };

  // 按时间点自由定位（拖动进度条用）：只改视频位置和当前句，不改变播放/暂停状态
  const tedSeekToTime = (t: number) => {
    const video = videoRef.current;
    if (!video || !tedTalk) return;
    const clamped = Math.max(0, Math.min(t, video.duration || t));
    video.currentTime = clamped;
    const nowMs = clamped * 1000;
    const sentences = tedTalk.sentences;
    let idx = 0;
    while (idx < sentences.length - 1 && nowMs >= sentences[idx].t1) idx += 1;
    setTedSentIdx(idx);
  };

  const tedTogglePlay = () => {
    const video = videoRef.current;
    if (!video || !tedTalk) return;
    if (video.paused) {
      // 逐句停顿模式下，停在句末点「继续」= 前进到下一句开头再播（而不是原地死循环）
      if (tedSentencePause) {
        const sentences = tedTalk.sentences;
        const cur = sentences[tedSentIdx];
        const end = tedSentIdx < sentences.length - 1 ? sentences[tedSentIdx + 1].t0 : cur.t1;
        if (end > 0 && video.currentTime * 1000 >= end && tedSentIdx < sentences.length - 1) {
          tedSeekTo(tedSentIdx + 1, true);
          return;
        }
      }
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  };

  const handleTedTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || !tedTalk) return;
    if (Number.isFinite(video.duration) && video.duration > 0) setTedDuration(video.duration);
    // 拖动进度条时，滑块位置以用户手指为准，不抢回
    if (!tedSeekingRef.current) setTedTime(video.currentTime);
    const nowMs = video.currentTime * 1000;
    const sentences = tedTalk.sentences;
    const current = sentences[tedSentIdx];
    // 单句循环：当前句音频放完（到下一句开始处）就拉回句首重放
    if (tedLoopSentence && current) {
      const loopAt = tedSentIdx < sentences.length - 1 ? sentences[tedSentIdx + 1].t0 : current.t1;
      if (nowMs >= loopAt) {
        video.currentTime = current.t0 / 1000;
        return;
      }
    }
    // 当前句 = 时间落在 [t0_idx, t0_{idx+1}) 的那句：下一句开始念才切走，
    // 这样「一句话没读完就滚下一句」的提前切换消失，字幕紧跟真声音。
    let idx = tedSentIdx;
    while (idx > 0 && nowMs < sentences[idx].t0) idx -= 1;
    while (idx < sentences.length - 1 && nowMs >= sentences[idx + 1].t0) idx += 1;
    if (idx !== tedSentIdx) setTedSentIdx(idx);
    // 逐句停顿：当前句的音频放完（到句末）就停在这一句，字幕钉住不跑，
    // 读完/跟读完了再点「继续」或「下一句」才前进——视频声音与字幕严格 1:1。
    if (tedSentencePause) {
      const end = idx < sentences.length - 1 ? sentences[idx + 1].t0 : sentences[idx].t1;
      if (end > 0 && nowMs >= end) {
        try {
          video.pause();
          setTedPlaying(false);
        } catch {
          /* noop */
        }
      }
    }
  };

  const handleTedEnded = () => {
    setTedPlaying(false);
    if (tedLoopTalk && tedTalk && videoRef.current) {
      videoRef.current.currentTime = 0;
      setTedSentIdx(0);
      setTedTime(0);
      void videoRef.current.play().catch(() => undefined);
    } else {
      setTedTime(videoRef.current?.duration || 0);
    }
  };

  // 点 TED 字幕里的单词 → 弹有道释义，可一键加入单词本（复用 enrichWord/addWord）
  const openTedWordPop = async (word: string, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    setTedWordPop({ word, top: rect.bottom + 6, left: rect.left, entry: null, loading: true, added: false });
    const entry = await lookupYoudao(word);
    setTedWordPop((prev) => (prev && prev.word === word ? { ...prev, entry, loading: false } : prev));
  };

  const addTedWordToBook = async (entry: DictEntry) => {
    const word = entry.word.trim();
    if (!word) return;
    if (customWords.some((item) => item.word.toLowerCase() === word.toLowerCase())) {
      setTedWordPop((prev) => (prev ? { ...prev, added: true } : prev));
      return;
    }
    const next = await window.studyNotes?.addWord({
      word,
      phonetic: entry.phonetic,
      meaning: entry.meaning,
      sentence: entry.sentence,
      sentenceMeaning: entry.sentenceMeaning,
    });
    if (next) {
      setCustomWords(next);
      setTedWordPop((prev) => (prev ? { ...prev, added: true } : prev));
    }
  };

  // 把英文句子拆成可点击的单词（保留空格与标点），点单词查词+加入单词本
  const renderTedWords = (text: string) =>
    text.split(/(\s+)/).map((tok, i) => {
      if (tok === "" || /^\s+$/.test(tok)) return tok;
      const clean = tok.replace(/[^A-Za-z'-]/g, "");
      if (!clean) return tok;
      return (
        <span
          key={i}
          className="ted-word"
          onClick={(event) => {
            event.stopPropagation();
            void openTedWordPop(clean, event.currentTarget);
          }}
        >
          {tok}
        </span>
      );
    });

  // 拖选英文文字 → 在选区附近浮现「AI 精讲」按钮（TED 字幕 / 逐句对照通用）
  const handleEnglishMouseUp = (event: React.MouseEvent<HTMLElement>) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      setAiFloat(null);
      return;
    }
    const text = sel.toString().trim();
    if (!text) {
      setAiFloat(null);
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const context = event.currentTarget.textContent || "";
    setAiFloat({
      text,
      context,
      top: Math.min(rect.bottom + 6, (typeof window !== "undefined" ? window.innerHeight : 600) - 48),
      left: Math.max(8, Math.min(rect.left, (typeof window !== "undefined" ? window.innerWidth : 320) - 120)),
    });
  };

  // 点击浮动「AI 精讲」→ 打开精讲 + 自测面板
  const openAiTutor = (text: string, context: string) => {
    setAiFloat(null);
    window.getSelection()?.removeAllRanges();
    setAiPanel({ text, context });
  };

  // 逐句对照里：既保留原来的「拖选单词标记生词」，又叠加「AI 精讲」浮动按钮
  const handleBilingualMouseUp = (pairId: string, event: React.MouseEvent<HTMLElement>) => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) {
      const text = sel.toString().trim();
      if (text) {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        setAiFloat({
          text,
          context: event.currentTarget.textContent || "",
          top: Math.min(rect.bottom + 6, (typeof window !== "undefined" ? window.innerHeight : 600) - 48),
          left: Math.max(8, Math.min(rect.left, (typeof window !== "undefined" ? window.innerWidth : 320) - 120)),
        });
      }
    }
    void handleSelectInBilingual(pairId, event);
  };

  // 把 AI 精讲里列的生词加入单词本
  const addAiVocabToBook = async (vocab: AiVocab) => {
    const word = vocab.word.trim();
    if (!word) return;
    if (customWords.some((item) => item.word.toLowerCase() === word.toLowerCase())) return;
    const next = await window.studyNotes?.addWord({
      word,
      phonetic: vocab.phonetic || "",
      meaning: vocab.meaning || "",
      sentence: aiPanel?.text || "",
      sentenceMeaning: "",
    });
    if (next) setCustomWords(next);
  };

  // 当前句变化时：只滚动「句子列表」内部（不带动外层页面），平滑居中
  // —— 之前用 scrollIntoView 会把整个弹窗页面拽到全文列表，导致"固定看视频时自动跳回全文页面"；
  //    现在只动 .ted-sent-list 自己的滚动，视频始终固定在上方。
  useEffect(() => {
    if (tab !== "ted" || !tedTalk) return;
    const list = document.querySelector<HTMLElement>(".ted-sent-list");
    const cur = list?.querySelector<HTMLElement>(".ted-sent.current");
    if (!list || !cur) return;
    const listRect = list.getBoundingClientRect();
    const curRect = cur.getBoundingClientRect();
    const inView = curRect.top >= listRect.top && curRect.bottom <= listRect.bottom;
    if (inView) return; // 已在列表可视区内，不拉扯
    const top = list.scrollTop + (curRect.top - listRect.top) - (list.clientHeight - cur.offsetHeight) / 2;
    list.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [tedSentIdx, tab, tedTalk]);

  // 滚动时收起「AI 精讲」浮动按钮，避免它飘在错误的位置
  useEffect(() => {
    const hide = () => setAiFloat(null);
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, []);

  const triggerMarkEnrich = (sentenceId: string, rawWord: string) => {
    const existing = markEnrichTimerRef.current[sentenceId];
    if (existing) clearTimeout(existing);
    const trimmed = rawWord.trim();
    if (!trimmed) {
      setMarkForms((prev) => ({
        ...prev,
        [sentenceId]: { word: trimmed, meaning: prev[sentenceId]?.meaning || "", phonetic: prev[sentenceId]?.phonetic || "", meaningTouched: prev[sentenceId]?.meaningTouched || false },
      }));
      setMarkEnriching((prev) => ({ ...prev, [sentenceId]: false }));
      return;
    }
    setMarkEnriching((prev) => ({ ...prev, [sentenceId]: true }));
    markEnrichTimerRef.current[sentenceId] = setTimeout(async () => {
      const enriched = await enrichWord(trimmed);
      setMarkForms((prev) => {
        const current = prev[sentenceId];
        if (!current || current.word.trim() !== trimmed) return prev;
        const nextMeaning = current.meaningTouched ? current.meaning : enriched.meaning || current.meaning;
        return {
          ...prev,
          [sentenceId]: { ...current, phonetic: enriched.phonetic, meaning: nextMeaning },
        };
      });
      setMarkEnriching((prev) => ({ ...prev, [sentenceId]: false }));
    }, 500);
  };

  useEffect(() => {
    return () => {
      Object.values(markEnrichTimerRef.current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const addMarkedWord = async (sentenceId: string) => {
    const form = markForms[sentenceId];
    if (!form?.word.trim()) return;
    const sentence = customSentences.find((item) => item.id === sentenceId);
    if (!sentence) return;
    setMarkEnriching((prev) => ({ ...prev, [sentenceId]: true }));
    const enriched = await enrichWord(form.word.trim());
    const meaning = form.meaning.trim() || enriched.meaning;
    const phonetic = enriched.phonetic || form.phonetic;
    const words = [
      ...(sentence.words || []),
      { id: `word-${Date.now()}`, word: form.word.trim(), phonetic, meaning },
    ];
    const next = await window.studyNotes?.updateSentence(sentenceId, { words });
    if (next) setCustomSentences(next);
    setMarkForms((prev) => ({ ...prev, [sentenceId]: { word: "", phonetic: "", meaning: "", meaningTouched: false } }));
    setMarkEnriching((prev) => ({ ...prev, [sentenceId]: false }));
  };

  const removeMarkedWord = async (sentenceId: string, wordId: string) => {
    const sentence = customSentences.find((item) => item.id === sentenceId);
    if (!sentence) return;
    const words = (sentence.words || []).filter((item) => item.id !== wordId);
    const next = await window.studyNotes?.updateSentence(sentenceId, { words });
    if (next) setCustomSentences(next);
  };

  // === 选中即标记：直接从句子/对照区拖选英文单词，自动生成生词并标记 ===
  // 从当前选区中提取单词；只接受"单个英文单词/词组"，避免误触发
  const extractSelectedWord = (container: HTMLElement | null): string => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return "";
    // 选区必须落在目标容器内
    if (container) {
      const range = selection.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) return "";
    }
    const raw = selection.toString().trim();
    if (!raw) return "";
    // 只接受英文单词（允许 连字符 / 撇号 / 空格组成的短语）
    if (!/^[A-Za-z][A-Za-z'’\- ]*$/.test(raw)) return "";
    const cleaned = raw.replace(/\s+/g, " ").trim();
    // 太长就不是单词了，避免整段误触发
    if (cleaned.length > 40 || cleaned.split(" ").length > 4) return "";
    return cleaned;
  };

  // 直接把某个单词标记到指定句子（自动补全音标+释义，无需手动填表）
  const markWordDirectly = async (sentenceId: string, word: string) => {
    const sentence = customSentences.find((item) => item.id === sentenceId);
    if (!sentence || !word) return;
    // 已标记过就不重复添加
    if ((sentence.words || []).some((w) => w.word.toLowerCase() === word.toLowerCase())) return;
    setMarkEnriching((prev) => ({ ...prev, [sentenceId]: true }));
    const enriched = await enrichWord(word);
    const words = [
      ...(sentence.words || []),
      { id: `word-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, word, phonetic: enriched.phonetic, meaning: enriched.meaning },
    ];
    const next = await window.studyNotes?.updateSentence(sentenceId, { words });
    if (next) setCustomSentences(next);
    setMarkEnriching((prev) => ({ ...prev, [sentenceId]: false }));
  };

  // 语句本里选词：句子已存在，直接标记
  const handleSelectInSentence = (sentenceId: string, event: React.MouseEvent<HTMLElement>) => {
    const word = extractSelectedWord(event.currentTarget);
    if (!word) return;
    justMarkedRef.current = true;
    void markWordDirectly(sentenceId, word);
    window.getSelection()?.removeAllRanges();
  };

  // 逐句对照里选词：若该句还没存入语句本，先保存再标记
  const handleSelectInBilingual = async (pairId: string, event: React.MouseEvent<HTMLElement>) => {
    const word = extractSelectedWord(event.currentTarget);
    if (!word) return;
    justMarkedRef.current = true;
    const pair = bilingualPairs.find((p) => p.id === pairId);
    if (!pair) return;
    let sentenceId = customSentences.find((s) => s.english === pair.english)?.id;
    if (!sentenceId) {
      const created = await window.studyNotes?.addSentence({ english: pair.english, chinese: pair.chinese });
      if (created) {
        setCustomSentences(created);
        const saved = created.find((s) => s.english === pair.english);
        sentenceId = saved?.id;
        setBilingualPairs((prev) => prev.map((p) => (p.id === pairId ? { ...p, saved: true } : p)));
      }
    }
    if (!sentenceId) return;
    await markWordDirectly(sentenceId, word);
    window.getSelection()?.removeAllRanges();
  };

  const renderHighlightedSentence = (text: string, sentenceId: string) => {
    const sentence = customSentences.find((item) => item.id === sentenceId);
    const words = sentence?.words || [];
    if (!words.length) return text;
    const pattern = words
      .map((item) => item.word.trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
      .map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");
    if (!pattern) return text;
    const regex = new RegExp(`\\b(${pattern})\\b`, "gi");
    const parts = text.split(regex);
    return parts.map((part, index) => {
      const matched = words.find((item) => item.word.toLowerCase() === part.toLowerCase());
      if (matched && index % 2 === 1) {
        const hint = [matched.phonetic, matched.meaning].filter(Boolean).join(" · ");
        return (
          <span
            key={`${matched.id}-${index}`}
            className="marked-word-highlight"
            title={hint || matched.word}
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              speak(matched.word);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                speak(matched.word);
              }
            }}
          >
            {part}
          </span>
        );
      }
      return <span key={`text-${index}`}>{part}</span>;
    });
  };

  const startQuiz = (entries: QuizEntry[], mode: "words" | "sentences") => {
    setQuizEntries(entries);
    setQuizSource(entries);
    setDictMode(mode);
    setQuizIndex(0);
    setQuizAnswer("");
    setQuizChecked(false);
    setQuizCorrect(false);
    setCorrectCount(0);
    setWrongIds([]);
    setQuizDone(false);
    setTab("dictation");
  };

  const checkAnswer = () => {
    const current = quizEntries[quizIndex];
    if (!current || quizChecked) return;
    const correct = normalizeAnswer(quizAnswer) === normalizeAnswer(current.answer);
    setQuizChecked(true);
    setQuizCorrect(correct);
    if (correct) {
      setCorrectCount((value) => value + 1);
    } else {
      setWrongIds((value) => [...value, current.id]);
    }
  };

  const nextQuiz = () => {
    if (quizIndex >= quizEntries.length - 1) {
      setQuizDone(true);
      return;
    }
    setQuizIndex((value) => value + 1);
    setQuizAnswer("");
    setQuizChecked(false);
    setQuizCorrect(false);
  };

  const startWordQuiz = (words: DailyWord[]) =>
    startQuiz(
      words.map((item) => ({
        id: item.id,
        prompt: item.meaning,
        hint: item.sentence,
        answer: item.word,
      })),
      "words",
    );

  const startSentenceQuiz = (sentences: StudySentence[]) =>
    startQuiz(
      sentences.map((item) => ({
        id: item.id,
        prompt: item.chinese || item.english,
        hint: item.english,
        answer: item.english,
      })),
      "sentences",
    );

  const currentQuizEntry = quizEntries[quizIndex];
  const quizDiff =
    quizChecked && !quizCorrect && currentQuizEntry
      ? diffQuizAnswer(quizAnswer, currentQuizEntry.answer)
      : null;

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="english-modal">
        <header className="english-header">
          <div>
            <BookOpenText size={18} />
            <div>
              <strong>每日英语</strong>
              <span>{dayKey()}</span>
            </div>
          </div>
          <div className="english-header-actions">
            <button
              ref={ttsBtnRef}
              type="button"
              className={`icon-btn ${showTtsSettings ? "active" : ""}`}
              title="朗读设置：声音 / 语速"
              onClick={() => {
                const rect = ttsBtnRef.current?.getBoundingClientRect();
                if (rect) setTtsMenuPos({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) });
                setShowTtsSettings((value) => !value);
              }}
            >
              <Settings2 size={16} />
            </button>
            {speaking && (
              <button
                type="button"
                className={`icon-btn tts-pause-btn ${paused ? "playing" : ""}`}
                title={paused ? "继续朗读" : "暂停朗读"}
                onClick={togglePauseSpeaking}
              >
                {paused ? <Play size={16} /> : <Pause size={16} />}
              </button>
            )}
            <button
              type="button"
              className={`icon-btn ${aiSettingsOpen ? "active" : ""}`}
              title="AI 精讲设置：选择厂商 / 填写 API Key"
              onClick={() => setAiSettingsOpen((value) => !value)}
            >
              <Sparkles size={16} />
            </button>
            <button type="button" className="icon-btn" title="关闭" onClick={onClose}>
              <X size={17} />
            </button>
          </div>
        </header>

        <div className="english-tabs">
          <button type="button" className={tab === "learn" ? "active" : ""} onClick={() => setTab("learn")}>
            <BookOpenText size={15} />
            今日学习
          </button>
          <button type="button" className={tab === "wordbook" ? "active" : ""} onClick={() => setTab("wordbook")}>
            <BookMarked size={15} />
            我的单词本
          </button>
          <button type="button" className={tab === "sentencebook" ? "active" : ""} onClick={() => setTab("sentencebook")}>
            <Quote size={15} />
            语句本
          </button>
          <button
            type="button"
            className={tab === "dictation" ? "active" : ""}
            onClick={() => {
              setTab("dictation");
              setDictMode(planType);
            }}
          >
            <PenLine size={15} />
            默写
          </button>
          <button
            type="button"
            className={tab === "bilingual" ? "active" : ""}
            onClick={() => setTab("bilingual")}
          >
            <Languages size={15} />
            逐句对照
          </button>
          <button type="button" className={tab === "ted" ? "active" : ""} onClick={() => setTab("ted")}>
            <MonitorPlay size={15} />
            TED精听
          </button>
          <button type="button" className={tab === "juyouci" ? "active" : ""} onClick={() => setTab("juyouci")}>
            <BookMarked size={15} />
            剧有词
          </button>
          <button type="button" className={tab === "askai" ? "active" : ""} onClick={() => setTab("askai")}>
            <Sparkles size={15} />
            问 AI
          </button>
          <div className="plan-switch">
            <button type="button" className={planType === "words" ? "active" : ""} onClick={() => changePlanType("words")}>
              单词计划
            </button>
            <button type="button" className={planType === "sentences" ? "active" : ""} onClick={() => changePlanType("sentences")}>
              语句计划
            </button>
          </div>
          {planType === "words" && (
            <div className="goal-picker">
              <span>每日学习</span>
              <select value={goal} onChange={(event) => changeGoal(Number(event.target.value))}>
                {[3, 5, 10, 15, 20].map((value) => (
                  <option key={value} value={value}>
                    {value} 个词
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="english-content">
          {aiSettingsOpen && <AiSettingsPanel onClose={() => setAiSettingsOpen(false)} />}
          {aiFloat && (
            <button
              type="button"
              className="ai-float-btn"
              style={{ top: aiFloat.top, left: aiFloat.left }}
              onMouseDown={(event) => {
                event.preventDefault();
                openAiTutor(aiFloat.text, aiFloat.context);
              }}
            >
              <Sparkles size={13} /> AI 精讲
            </button>
          )}
          {aiPanel && (
            <AiTutorPanel
              selectedText={aiPanel.text}
              contextText={aiPanel.context}
              onClose={() => setAiPanel(null)}
              onAddVocab={addAiVocabToBook}
              onOpenSettings={() => {
                setAiPanel(null);
                setAiSettingsOpen(true);
              }}
            />
          )}
          {tab === "learn" && planType === "words" && (
            <>
              <div className="lesson-card">
                <div className="lesson-word-row">
                  <div>
                    <h2>今日学习 {dailyWords.length} 个词</h2>
                    <span className="lesson-phonetic">
                      自己的生词优先，不足的部分由系统推荐补齐
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`icon-btn ${learned ? "active" : ""}`}
                    title={learned ? "今天已学会" : "标记今天已学会"}
                    onClick={toggleLearned}
                  >
                    {learned ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                  </button>
                </div>
              </div>

              <div className="daily-word-list">
                {dailyWords.map((item, index) => (
                  <div className="daily-word-card" key={`${item.id}-${index}`}>
                    <div className="daily-word-head">
                      <div>
                        <h3>{item.word}</h3>
                        <span>{item.phonetic}</span>
                        <em>{item.source === "custom" ? "我的生词" : "系统推荐"}</em>
                      </div>
                      <div>
                        <button type="button" className="btn ghost small" onClick={() => speak(item.word)}>
                          <Volume2 size={14} />
                          单词
                        </button>
                        <button type="button" className="btn ghost small" onClick={() => speak(item.sentence)}>
                          例句
                        </button>
                      </div>
                    </div>
                    <p className="daily-word-meaning">{item.meaning}</p>
                    <div className="lesson-sentence">
                      <p>{item.sentence}</p>
                      <span>{item.sentenceMeaning}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="english-audio-actions">
                <button type="button" className="btn primary" onClick={() => startWordQuiz(dailyWords)}>
                  <ListChecks size={16} />
                  开始默写这 {dailyWords.length} 个词
                </button>
                {speaking ? (
                  <button type="button" className="btn" onClick={stopSpeaking}>
                    <Pause size={15} />
                    停止朗读
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => speak(dailyWords.map((item) => item.word).join(". "))}
                  >
                    朗读全部单词
                  </button>
                )}
              </div>
            </>
          )}

          {tab === "learn" && planType === "sentences" && (
            <>
              <div className="lesson-card">
                <div className="lesson-word-row">
                  <div>
                    <h2>今日语句</h2>
                    <span className="lesson-phonetic">每天学习自己录入的一段英语</span>
                  </div>
                  <button
                    type="button"
                    className={`icon-btn ${sentenceLearned ? "active" : ""}`}
                    title={sentenceLearned ? "今天已学会" : "标记今天已学会"}
                    onClick={() => {
                      const next = !sentenceLearned;
                      setSentenceLearned(next);
                      localStorage.setItem(`english-sentence-learned-${dayKey()}`, next ? "1" : "0");
                    }}
                  >
                    {sentenceLearned ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                  </button>
                </div>
              </div>

              {todaySentence ? (
                <div className="daily-word-card sentence-today">
                  <div className="daily-word-head">
                    <div>
                      <h3>{todaySentence.english}</h3>
                      <span>来自我的语句本</span>
                    </div>
                    <div>
                      <button type="button" className="btn ghost small" onClick={() => speak(todaySentence.english)}>
                        <Volume2 size={14} />
                        朗读
                      </button>
                      <button type="button" className="btn ghost small" onClick={() => speak(todaySentence.english, true)}>
                        慢速
                      </button>
                    </div>
                  </div>
                  <div className="lesson-sentence">
                    <p>{todaySentence.chinese}</p>
                  </div>
                </div>
              ) : (
                <div className="dictation-empty">
                  <Quote size={30} />
                  <p>语句本还是空的，先添加一段想学的英语</p>
                  <button type="button" className="btn primary" onClick={() => setTab("sentencebook")}>
                    去语句本添加
                  </button>
                </div>
              )}

              {customSentences.length > 1 && (
                <div className="english-audio-actions">
                  <button type="button" className="btn" onClick={() => setTodaySentenceIndex((value) => value + 1)}>
                    换一段学习
                  </button>
                </div>
              )}
            </>
          )}

          {tab === "wordbook" && (
            <>
              <section className="custom-read dict-lookup">
                <div className="custom-read-head">
                  <strong>有道词典 · 查词</strong>
                  <span>不保存也能查，想记住再点加入单词本</span>
                </div>
                <div className="dict-lookup-row">
                  <input
                    value={dictQuery}
                    onChange={(event) => setDictQuery(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && void handleDictLookup()}
                    placeholder="输入英文单词，回车查词"
                  />
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => void handleDictLookup()}
                    disabled={dictLoading || !dictQuery.trim()}
                  >
                    {dictLoading ? <Loader2 className="spin" size={15} /> : <Search size={15} />}
                    {dictLoading ? "查词中" : "查词"}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => openYoudaoWeb(dictQuery)}
                    disabled={!dictQuery.trim()}
                    title="用浏览器打开有道完整词条"
                  >
                    <ExternalLink size={15} />
                    网页版
                  </button>
                </div>
                {dictError && <p className="dict-error">{dictError}</p>}
                {dictResult && (
                  <div className="dict-card youdao-dict-card">
                    <div className="dict-word-head">
                      <strong className="dict-word">{dictResult.word}</strong>
                      <span className="dict-word-source">有道词典</span>
                    </div>
                    {renderDictPron(dictResult)}
                    {renderDictBody(dictResult)}
                    <div className="dict-card-actions">
                      <button type="button" className="btn primary small" onClick={() => void addDictResultToWordbook()}>
                        <Plus size={14} />
                        加入单词本
                      </button>
                      <button type="button" className="btn ghost small" onClick={() => openYoudaoWeb(dictResult.word)}>
                        <ExternalLink size={14} />
                        有道完整词条
                      </button>
                    </div>
                  </div>
                )}
              </section>

              <section className="custom-read word-form">
                <div className="custom-read-head">
                  <strong>添加自己的生词</strong>
                  <span>填得越全，学习和默写效果越好</span>
                </div>
                <div className="word-form-grid">
                  <input value={wordForm.word} onChange={(event) => setWordForm({ ...wordForm, word: event.target.value })} placeholder="单词（必填）" />
                  <input value={wordForm.phonetic} onChange={(event) => setWordForm({ ...wordForm, phonetic: event.target.value })} placeholder="音标，如 /wɜːrd/" />
                  <input value={wordForm.meaning} onChange={(event) => setWordForm({ ...wordForm, meaning: event.target.value })} placeholder="中文释义" />
                  <input value={wordForm.sentence} onChange={(event) => setWordForm({ ...wordForm, sentence: event.target.value })} placeholder="例句（英文）" />
                  <input value={wordForm.sentenceMeaning} onChange={(event) => setWordForm({ ...wordForm, sentenceMeaning: event.target.value })} placeholder="例句翻译" />
                </div>
                <div>
                  <button type="button" className="btn primary" onClick={addCustomWord}>
                    <Plus size={15} />
                    加入单词本
                  </button>
                </div>
              </section>

              {customWords.filter(srIsDue).length > 0 && (
                <section className="review-panel">
                  <div className="review-panel-head">
                    <strong>今日复习（{customWords.filter(srIsDue).length}）</strong>
                    <span>点"认识"间隔变长，"模糊 / 不会"缩短</span>
                  </div>
                  {customWords.filter(srIsDue).map((item) => (
                    <div className="review-item" key={item.id}>
                      <div className="review-word">
                        <button type="button" className="wordbook-word-btn" onClick={() => void toggleWordDetail(item)}>
                          {item.word}
                        </button>
                        <span>{item.phonetic} · {item.meaning}</span>
                      </div>
                      <div className="review-btns">
                        <button type="button" className="btn small" onClick={() => void reviewCustomWord(item.id, "know")}>认识</button>
                        <button type="button" className="btn small" onClick={() => void reviewCustomWord(item.id, "fuzzy")}>模糊</button>
                        <button type="button" className="btn small danger" onClick={() => void reviewCustomWord(item.id, "unknown")}>不会</button>
                      </div>
                    </div>
                  ))}
                </section>
              )}

              <div className="resource-list wordbook-list">
                {customWords.length === 0 && <p className="muted">单词本是空的，先添加几个生词</p>}
                {customWords.map((item) => (
                  <div className="wordbook-item" key={item.id}>
                    <div className="wordbook-row">
                      <div>
                        <button
                          type="button"
                          className="wordbook-word-btn"
                          title="点一下查有道释义和例句"
                          onClick={() => void toggleWordDetail(item)}
                        >
                          {item.word}
                        </button>
                        <span>{item.phonetic} · {item.meaning}</span>
                        <span className={`sr-chip sr-${(item.srStatus || "new") as SrStatus}`}>{SR_LABEL[item.srStatus || "new"]}</span>
                      </div>
                      <div>
                        <button type="button" className="icon-btn" title="朗读" onClick={() => speak(item.word)}>
                          <Volume2 size={15} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          title="打开有道完整词条"
                          onClick={() => openYoudaoWeb(item.word)}
                        >
                          <ExternalLink size={15} />
                        </button>
                        <button type="button" className="icon-btn" title="删除" onClick={() => removeCustomWord(item.id)}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                    {dictDetailId === item.id && (
                      <div className="word-detail">
                        {dictDetailLoading && <span className="muted">有道查词中…</span>}
                        {!dictDetailLoading && !dictDetail && <span className="muted">有道没查到这个词</span>}
                        {!dictDetailLoading && dictDetail && (
                          <>
                            {renderDictPron(dictDetail)}
                            {renderDictBody(dictDetail)}
                          </>
                        )}
                        <div className="dict-card-actions">
                          <button type="button" className="btn ghost small" onClick={() => openYoudaoWeb(item.word)}>
                            <ExternalLink size={14} />
                            有道完整词条
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === "sentencebook" && (
            <>
              <section className="custom-read word-form">
                <div className="custom-read-head">
                  <strong>添加自己的英语语句</strong>
                  <span>每天学习一段，只使用自己录入的内容</span>
                </div>
                <div className="word-form-grid">
                  <textarea
                    className="sentence-form-english"
                    value={sentenceForm.english}
                    onChange={(event) => setSentenceForm({ ...sentenceForm, english: event.target.value })}
                    placeholder="英语语句或段落（必填）"
                  />
                  <textarea
                    className="sentence-form-english"
                    value={sentenceForm.chinese}
                    onChange={(event) => setSentenceForm({ ...sentenceForm, chinese: event.target.value })}
                    placeholder="中文翻译"
                  />
                </div>
                <div>
                  <button type="button" className="btn primary" onClick={addCustomSentence}>
                    <Plus size={15} />
                    加入语句本
                  </button>
                </div>
              </section>

              <div className="resource-list wordbook-list">
                {customSentences.length === 0 && <p className="muted">语句本是空的，先添加一段英语</p>}
                {customSentences.map((item) => {
                  const isExpanded = expandedSentenceIds[item.id] ?? false;
                  return (
                    <div className="wordbook-row sentence-row" key={item.id}>
                    <div className="sentence-row-main">
                      {editingSentenceId === item.id ? (
                        <div className="sentence-edit-form">
                          <textarea
                            className="sentence-form-english"
                            value={editSentenceForm.english}
                            onChange={(event) => setEditSentenceForm((prev) => ({ ...prev, english: event.target.value }))}
                            placeholder="英语语句或段落"
                          />
                          <textarea
                            className="sentence-form-english"
                            value={editSentenceForm.chinese}
                            onChange={(event) => setEditSentenceForm((prev) => ({ ...prev, chinese: event.target.value }))}
                            placeholder="中文翻译"
                          />
                          <div className="sentence-edit-actions">
                            <button
                              type="button"
                              className="btn primary small"
                              onClick={() => void saveEditSentence(item.id)}
                            >
                              <CheckCircle2 size={14} />
                              保存
                            </button>
                            <button
                              type="button"
                              className="btn ghost small"
                              onClick={cancelEditSentence}
                            >
                              <X size={14} />
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="sentence-cols">
                          <div className="sentence-col sentence-col-en">
                            <div className="sentence-col-label">
                              <span>英语</span>
                              <button
                                type="button"
                                className="dict-speaker"
                                title="朗读英语"
                                onClick={() => speak(item.english)}
                              >
                                <Volume2 size={13} />
                              </button>
                              <button
                                type="button"
                                className="dict-speaker"
                                title="慢速朗读"
                                onClick={() => speak(item.english, true)}
                              >
                                <span className="dict-speaker-slow">慢</span>
                              </button>
                            </div>
                            <strong
                              className="sentence-row-english select-to-mark"
                              title="点击朗读整句；拖选文字只读选中部分；拖选单词可标记生词"
                              onMouseUp={(event) => handleSelectInSentence(item.id, event)}
                              onClick={(event) => {
                                // 刚刚通过拖选标记了生词，不再朗读整句
                                if (justMarkedRef.current) {
                                  justMarkedRef.current = false;
                                  return;
                                }
                                void event;
                                const selection = window.getSelection();
                                const selectedText =
                                  selection && !selection.isCollapsed
                                    ? selection.toString().trim()
                                    : "";
                                speak(selectedText || item.english);
                              }}
                            >
                              {renderHighlightedSentence(item.english, item.id)}
                            </strong>
                          </div>
                          <div className="sentence-col sentence-col-zh">
                            <div className="sentence-col-label">
                              <span>中文</span>
                            </div>
                            <span className="sentence-col-text">{item.chinese || "（还没填中文）"}</span>
                          </div>
                        </div>
                      )}
                      {(item.words?.length ?? 0) > 0 && (
                        <div className="sentence-marked-words">
                          <div className="sentence-marked-head">
                            <span className="muted">
                              已标记 {item.words?.length} 个生词
                            </span>
                            <button
                              type="button"
                              className="mini-text-btn"
                              onClick={() =>
                                setExpandedSentenceIds((prev) => ({
                                  ...prev,
                                  [item.id]: !isExpanded,
                                }))
                              }
                            >
                              {isExpanded ? "收起" : "展开"}
                            </button>
                          </div>
                          <div className={`sentence-marked-chips ${isExpanded ? "expanded" : "compact"}`}>
                            {(item.words || []).map((word) => (
                              <span className="marked-word-chip" key={word.id}>
                                <button type="button" title="朗读生词" onClick={() => speak(word.word)}>
                                  {word.word}
                                </button>
                                {word.phonetic && <em className="marked-word-phonetic">{word.phonetic}</em>}
                                {isExpanded && <em className="marked-word-meaning">{word.meaning}</em>}
                                <button
                                  type="button"
                                  title="删除这个生词标记"
                                  onClick={() => void removeMarkedWord(item.id, word.id)}
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="mark-word-form">
                        <input
                          value={markForms[item.id]?.word || ""}
                          onChange={(event) => {
                            const value = event.target.value;
                            setMarkForms((prev) => ({
                              ...prev,
                              [item.id]: {
                                word: value,
                                phonetic: prev[item.id]?.phonetic || "",
                                meaning: prev[item.id]?.meaning || "",
                                meaningTouched: prev[item.id]?.meaningTouched || false,
                              },
                            }));
                            triggerMarkEnrich(item.id, value);
                          }}
                          placeholder="句中生词"
                        />
                        <input
                          value={markForms[item.id]?.meaning || ""}
                          onChange={(event) =>
                            setMarkForms((prev) => ({
                              ...prev,
                              [item.id]: {
                                ...prev[item.id],
                                meaning: event.target.value,
                                meaningTouched: true,
                              },
                            }))
                          }
                          placeholder="中文释义（自动补全）"
                        />
                        <button
                          type="button"
                          className="btn primary small"
                          disabled={markEnriching[item.id] || !markForms[item.id]?.word.trim()}
                          onClick={() => void addMarkedWord(item.id)}
                        >
                          {markEnriching[item.id] ? <Loader2 className="spin" size={14} /> : <Plus size={14} />}
                          {markEnriching[item.id] ? "补全中" : "标记"}
                        </button>
                      </div>
                    </div>
                    <div className="sentence-row-actions">
                      <button type="button" className="icon-btn" title="朗读" onClick={() => speak(item.english)}>
                        <Volume2 size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        title="编辑"
                        disabled={editingSentenceId === item.id}
                        onClick={() => startEditSentence(item)}
                      >
                        <PenLine size={15} />
                      </button>
                    <button type="button" className="icon-btn" title="删除" onClick={() => removeCustomSentence(item.id)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
              </div>
            </>
          )}

          {tab === "dictation" && (
            <>
              <div className="dict-mode-switch">
                <button type="button" className={dictMode === "words" ? "active" : ""} onClick={() => setDictMode("words")}>
                  单词默写
                </button>
                <button type="button" className={dictMode === "sentences" ? "active" : ""} onClick={() => setDictMode("sentences")}>
                  语句默写
                </button>
              </div>
              {quizEntries.length === 0 ? (
                dictMode === "words" ? (
                  <div className="dictation-empty">
                    <PenLine size={30} />
                    <p>默写会使用今天的每日单词</p>
                    <button type="button" className="btn primary" onClick={() => startWordQuiz(dailyWords)}>
                      开始默写 {dailyWords.length} 个词
                    </button>
                  </div>
                ) : customSentences.length === 0 ? (
                  <div className="dictation-empty">
                    <Quote size={30} />
                    <p>语句本是空的，先添加想默写的英语</p>
                    <button type="button" className="btn primary" onClick={() => setTab("sentencebook")}>
                      去语句本添加
                    </button>
                  </div>
                ) : (
                  <div className="dictation-empty">
                    <Quote size={30} />
                    <p>根据中文和发音，默写英文语句</p>
                    <div className="english-audio-actions">
                      {todaySentence && (
                        <button type="button" className="btn primary" onClick={() => startSentenceQuiz([todaySentence])}>
                          默写今日语句
                        </button>
                      )}
                      <button type="button" className="btn" onClick={() => startSentenceQuiz(customSentences)}>
                        默写全部语句
                      </button>
                    </div>
                  </div>
                )
              ) : quizDone ? (
                <div className="dictation-result">
                  <h3>默写完成</h3>
                  <p className="result-score">
                    正确 {correctCount} / {quizEntries.length}
                  </p>
                  <p className="muted">答错 {wrongIds.length} 个，可以只重默写错的</p>
                  <div className="english-audio-actions">
                    <button type="button" className="btn primary" onClick={() => startQuiz(quizSource, dictMode)}>
                      <RotateCcw size={15} />
                      重新默写全部
                    </button>
                    <button
                      type="button"
                      className="btn"
                      disabled={wrongIds.length === 0}
                      onClick={() => startQuiz(quizSource.filter((item) => wrongIds.includes(item.id)), dictMode)}
                    >
                      只默写错的
                    </button>
                  </div>
                </div>
              ) : (
                currentQuizEntry && (
                  <div className="dictation-card">
                    <div className="dictation-progress">
                      第 {quizIndex + 1} / {quizEntries.length} 个
                    </div>
                    <p className="dictation-meaning">{currentQuizEntry.prompt}</p>
                    {dictMode === "words" ? (
                      <p className="dictation-hint">{currentQuizEntry.hint}</p>
                    ) : (
                      <p className="dictation-hint">根据中文和发音，默写整句英语</p>
                    )}
                    <button type="button" className="btn ghost" onClick={() => speak(currentQuizEntry.answer)}>
                      <Volume2 size={15} />
                      听发音
                    </button>
                    {dictMode === "sentences" ? (
                      <textarea
                        className="dictation-input dictation-textarea"
                        value={quizAnswer}
                        rows={3}
                        onChange={(event) => setQuizAnswer(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            if (quizChecked) nextQuiz();
                            else checkAnswer();
                          }
                        }}
                        placeholder="输入整句英语（可换行）"
                        disabled={quizChecked}
                      />
                    ) : (
                      <input
                        className="dictation-input"
                        value={quizAnswer}
                        onChange={(event) => setQuizAnswer(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            if (quizChecked) nextQuiz();
                            else checkAnswer();
                          }
                        }}
                        placeholder="拼写出这个单词"
                        disabled={quizChecked}
                      />
                    )}
                    {quizChecked && (
                      <div className={`dictation-feedback ${quizCorrect ? "correct" : "wrong"}`}>
                        {quizCorrect ? (
                          <>拼写正确，继续加油</>
                        ) : (
                          <>
                            <div className="dictation-diff">
                              <span className="diff-label">你的答案</span>
                              {quizDiff && quizDiff.userTokens.length > 0 ? (
                                quizDiff.userTokens.map((token, index) => (
                                  <span key={index} className={token.ok ? "diff-ok" : "diff-bad"}>
                                    {token.text}
                                  </span>
                                ))
                              ) : (
                                <span className="diff-bad">（未填写）</span>
                              )}
                            </div>
                            <div className="dictation-diff">
                              <span className="diff-label">正确答案</span>
                              {quizDiff?.answerTokens.map((token, index) => (
                                <span key={index} className={token.ok ? "diff-ok" : "diff-wrong"}>
                                  {token.text}
                                </span>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    <div className="english-audio-actions">
                      {quizChecked ? (
                        <button type="button" className="btn primary" onClick={nextQuiz}>
                          {quizIndex >= quizEntries.length - 1 ? "查看结果" : "下一个"}
                        </button>
                      ) : (
                        <button type="button" className="btn primary" onClick={checkAnswer}>
                          检查答案
                        </button>
                      )}
                    </div>
                  </div>
                )
              )}
            </>
          )}

          {tab === "learn" && (
            <section className="custom-read">
              <div className="custom-read-head">
                <strong>朗读自己的英语文本</strong>
                <span>可以粘贴课文、生词或句子</span>
              </div>
              <textarea value={customText} onChange={(event) => setCustomText(event.target.value)} placeholder="Paste English text here..." />
              <div>
                <button type="button" className="btn primary" onClick={() => speak(customText)} disabled={!customText.trim()}>
                  <Volume2 size={15} />
                  朗读
                </button>
                <button type="button" className="btn" onClick={() => speak(customText, true)} disabled={!customText.trim()}>
                  慢速朗读
                </button>
              </div>
            </section>
          )}

          {tab === "bilingual" && (
            <section className="bilingual-panel">
              <div className="bilingual-input-card">
                <div className="bilingual-input-head">
                  <strong>逐句对照翻译</strong>
                  <span>粘贴英文段落，自动切句后逐句翻译为中文</span>
                </div>
                <textarea
                  className="bilingual-input"
                  value={bilingualText}
                  onChange={(event) => setBilingualText(event.target.value)}
                  placeholder={"Paste English paragraph here, e.g.\nYou live in a world where you expose yourself to so many evil eyes. Some people in the world, even people closer to you than you think, might be wishing poorly on you."}
                />
                <div className="bilingual-input-actions">
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => void runBilingualTranslate()}
                    disabled={bilingualLoading || !bilingualText.trim()}
                  >
                    {bilingualLoading ? <Loader2 className="spin" size={14} /> : <Languages size={14} />}
                    {bilingualLoading ? "翻译中…" : "逐句翻译"}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setBilingualText("");
                      setBilingualPairs([]);
                      setBilingualError(null);
                    }}
                    disabled={!bilingualText && !bilingualPairs.length}
                  >
                    <RotateCcw size={14} />
                    清空
                  </button>
                  <span className="bilingual-hint">
                    使用 MyMemory 免费接口（无需 Key，单 IP 每日约 5000 字限额）
                  </span>
                </div>
                {bilingualError && <div className="bilingual-error">{bilingualError}</div>}
              </div>

              {bilingualPairs.length > 0 && (
                <div className="bilingual-list">
                  {bilingualPairs.map((pair) => (
                    <div className="bilingual-row" key={pair.id}>
                      <div className="bilingual-cell bilingual-en">
                        <div className="bilingual-cell-label">英语</div>
                        <div
                          className="bilingual-cell-text select-to-mark"
                          title="点击朗读整句；拖选文字只读选中部分；拖选单词可标记生词"
                          onMouseUp={(event) => void handleBilingualMouseUp(pair.id, event)}
                          onClick={() => {
                            if (justMarkedRef.current) {
                              justMarkedRef.current = false;
                              return;
                            }
                            const selection = window.getSelection();
                            const selectedText =
                              selection && !selection.isCollapsed
                                ? selection.toString().trim()
                                : "";
                            speak(selectedText || pair.english);
                          }}
                        >
                          {pair.english}
                        </div>
                      </div>
                      <div className="bilingual-cell bilingual-zh">
                        <div className="bilingual-cell-label">中文</div>
                        <div className="bilingual-cell-text">
                          {pair.status === "pending" ? (
                            <span className="bilingual-pending">
                              <Loader2 className="spin" size={12} /> 翻译中…
                            </span>
                          ) : pair.status === "error" ? (
                            <button
                              type="button"
                              className="bilingual-retry"
                              title="点击重试这一句"
                              onClick={() => void retryPair(pair.id)}
                            >
                              {pair.error || "翻译失败"}，点击重试
                            </button>
                          ) : (
                            pair.chinese
                          )}
                        </div>
                      </div>
                      <div className="bilingual-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          title="朗读英文"
                          onClick={() => speak(pair.english)}
                        >
                          <Volume2 size={15} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          title="朗读中文"
                          onClick={() => {
                            try {
                              const u = new SpeechSynthesisUtterance(pair.chinese);
                              u.lang = "zh-CN";
                              u.rate = clampRate(rate);
                              window.speechSynthesis?.cancel();
                              window.speechSynthesis?.speak(u);
                            } catch {
                              /* noop */
                            }
                          }}
                          disabled={pair.status !== "translated"}
                        >
                          <span style={{ fontSize: 12, fontWeight: 600 }}>中</span>
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          title="保存到语句本"
                          onClick={() => void saveBilingualToSentenceBook(pair.id)}
                          disabled={pair.status !== "translated" || pair.saved}
                        >
                          {pair.saved ? <CheckCircle2 size={15} /> : <Save size={15} />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {bilingualHistory.length > 0 && (
                <div className="bilingual-history">
                  <div className="bilingual-history-head">
                    <strong>翻译记录</strong>
                    <span>点一条即可恢复，不用重新粘贴</span>
                    <button type="button" className="mini-text-btn" onClick={clearBilingualHistory}>
                      清空
                    </button>
                  </div>
                  {bilingualHistory.map((record) => (
                    <div
                      key={record.id}
                      className="bilingual-history-item"
                      onClick={() => restoreBilingualRecord(record)}
                    >
                      <div className="bilingual-history-main">
                        <span className="bilingual-history-en">{record.text.slice(0, 80)}</span>
                        <span className="bilingual-history-zh">{record.pairs[0]?.chinese || ""}</span>
                      </div>
                      <span className="bilingual-history-time">
                        {new Date(record.time).toLocaleString("zh-CN", {
                          month: "numeric",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <button
                        type="button"
                        className="bilingual-history-del"
                        title="删除这条记录"
                        onClick={(event) => {
                          event.stopPropagation();
                          removeBilingualRecord(record.id);
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
          {tab === "ted" && (
            <div className="ted-panel">
              {!tedTalk ? (
                <>
                  <div className="ted-list-head">
                    <strong>TED 精听</strong>
                    <span>从入门到高阶的精选演讲，逐句听懂每一篇</span>
                  </div>
                  <div className="ted-level-row">
                    <button type="button" className={tedLevel === 0 ? "active" : ""} onClick={() => setTedLevel(0)}>
                      全部
                    </button>
                    {[
                      [1, "入门"],
                      [2, "初级"],
                      [3, "进阶"],
                      [4, "中高"],
                      [5, "高阶"],
                    ].map(([value, label]) => (
                      <button
                        type="button"
                        key={value}
                        className={tedLevel === value ? "active" : ""}
                        onClick={() => setTedLevel(value as number)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {tedLoading && <p className="muted">加载中…</p>}
                  <div className="ted-talk-list">
                    {tedList
                      .filter((item) => !tedLevel || item.level === tedLevel)
                      .map((item) => (
                        <button type="button" className="ted-talk-card" key={item.slug} onClick={() => setTedSlug(item.slug)}>
                          <span className={`ted-level-badge l${item.level}`}>L{item.level}</span>
                          <span className="ted-talk-main">
                            <strong>{item.titleZh}</strong>
                            <em>{item.title}</em>
                            <span className="ted-talk-meta">
                              {item.speaker} · {item.minutes} 分钟 · {item.wpm} 词/分 · {item.totalWords} 词
                            </span>
                            <span className="ted-talk-desc">{item.desc}</span>
                          </span>
                        </button>
                      ))}
                    {!tedLoading && tedList.length === 0 && <p className="muted">清单没加载出来，重启应用或刷新页面再试</p>}
                  </div>
                </>
              ) : (
                <>
                  <div className="ted-player-head">
                    <button
                      type="button"
                      className="mini-text-btn"
                      onClick={() => {
                        videoRef.current?.pause();
                        setTedSlug(null);
                        setTedTalk(null);
                      }}
                    >
                      ← 返回清单
                    </button>
                    <strong>{tedTalk.titleZh}</strong>
                    <span className="ted-player-meta">
                      {tedTalk.speaker} · {tedTalk.minutes} 分钟
                    </span>
                  </div>
                  {tedLoading && <p className="muted">字幕加载中…</p>}
                  {!tedLoading && (
                    <>
                      <div className="ted-video-box">
                        <video
                          ref={videoRef}
                          src={tedTalk.mp4 || undefined}
                          poster={tedTalk.thumb || undefined}
                          controls={false}
                          playsInline
                          preload="metadata"
                          onTimeUpdate={handleTedTimeUpdate}
                          onEnded={handleTedEnded}
                          onLoadedMetadata={(event) => {
                            event.currentTarget.playbackRate = tedSpeed;
                            if (Number.isFinite(event.currentTarget.duration)) {
                              setTedDuration(event.currentTarget.duration);
                            }
                          }}
                          onPlay={() => setTedPlaying(true)}
                          onPause={() => setTedPlaying(false)}
                        />
                      </div>
                      <div className="ted-now">
                        <p className="ted-now-en" onMouseUp={handleEnglishMouseUp}>
                          {renderTedWords(tedTalk.sentences[tedSentIdx]?.text || "")}
                        </p>
                        <p className="ted-now-zh">
                          {tedTrans[tedTransKey(tedSentIdx)] ||
                            (tedAutoTrans ? "翻译中…" : "")}
                        </p>
                      </div>
                      <div className="ted-controls">
                        <button
                          type="button"
                          className="icon-btn"
                          title="上一句"
                          onClick={() => tedSeekTo(Math.max(0, tedSentIdx - 1))}
                        >
                          ⏮
                        </button>
                        <button type="button" className="ted-play-btn" onClick={tedTogglePlay}>
                          {tedPlaying ? "⏸" : "▶"}
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          title="下一句"
                          onClick={() => tedSeekTo(Math.min(tedTalk.sentences.length - 1, tedSentIdx + 1))}
                        >
                          ⏭
                        </button>
                        <span className="ted-progress">
                          第 {tedSentIdx + 1} / {tedTalk.sentences.length} 句
                        </span>
                      </div>
                      <div className="ted-seek-row">
                        <span className="ted-time">{formatTedTime(tedTime)}</span>
                        <input
                          type="range"
                          className="ted-seek"
                          min={0}
                          max={tedDuration || 0}
                          step={0.1}
                          value={Math.min(tedTime, tedDuration || 0)}
                          onPointerDown={() => {
                            tedSeekingRef.current = true;
                          }}
                          onPointerUp={() => {
                            tedSeekingRef.current = false;
                          }}
                          onChange={(event) => {
                            const t = Number(event.target.value);
                            setTedTime(t);
                            tedSeekToTime(t);
                          }}
                        />
                        <span className="ted-time">{formatTedTime(tedDuration)}</span>
                      </div>
                      <div className="ted-speed-row">
                        <span className="ted-row-label">倍速</span>
                        {[0.6, 0.7, 0.8, 0.9, 1, 1.2, 1.5].map((value) => (
                          <button
                            type="button"
                            key={value}
                            className={tedSpeed === value ? "active" : ""}
                            onClick={() => tedApplySpeed(value)}
                          >
                            {value}×
                          </button>
                        ))}
                      </div>
                      <div className="ted-mode-row">
                        <button
                          type="button"
                          className={tedLoopSentence ? "active" : ""}
                          onClick={() => setTedLoopSentence((v) => !v)}
                          title="这一句听完自动从头再放"
                        >
                          单句循环{tedLoopSentence ? "开" : "关"}
                        </button>
                        <button
                          type="button"
                          className={tedSentencePause ? "active" : ""}
                          onClick={() => setTedSentencePause((v) => !v)}
                          title="每句音频放完自动停在当前句，读完再继续，让声音和字幕同步"
                        >
                          逐句停顿{tedSentencePause ? "开" : "关"}
                        </button>
                        <button
                          type="button"
                          className={tedLoopTalk ? "active" : ""}
                          onClick={() => setTedLoopTalk((v) => !v)}
                          title="整篇放完自动重来"
                        >
                          全文循环{tedLoopTalk ? "开" : "关"}
                        </button>
                        <button
                          type="button"
                          className={tedAutoTrans ? "active" : ""}
                          onClick={() => setTedAutoTrans((v) => !v)}
                          title="自动把当前句翻译成中文"
                        >
                          自动翻译{tedAutoTrans ? "开" : "关"}
                        </button>
                      </div>
                      <div className="ted-sent-list">
                        {tedTalk.sentences.map((sent, idx) => (
                          <div
                            key={`${idx}-${sent.t0}`}
                            className={`ted-sent ${idx === tedSentIdx ? "current" : ""}`}
                            onClick={() => tedSeekTo(idx)}
                          >
                            <span className="ted-sent-index">{idx + 1}</span>
                            <span className="ted-sent-body">
                              <span className="ted-sent-en" onMouseUp={handleEnglishMouseUp}>{renderTedWords(sent.text)}</span>
                              {tedTrans[tedTransKey(idx)] && (
                                <span className="ted-sent-zh">{tedTrans[tedTransKey(idx)]}</span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                      {tedWordPop && (
                        <>
                          <div className="ted-word-pop-mask" onClick={() => setTedWordPop(null)} />
                          <div
                            className="ted-word-pop"
                            style={{
                              top: tedWordPop.top,
                              left: Math.max(8, Math.min(tedWordPop.left, (typeof window !== "undefined" ? window.innerWidth : 320) - 288)),
                            }}
                          >
                            <div className="ted-word-pop-head">
                              <strong>{tedWordPop.word}</strong>
                              <button type="button" className="ted-word-pop-close" onClick={() => setTedWordPop(null)}>
                                ×
                              </button>
                            </div>
                            {tedWordPop.loading && <p className="muted">查词中…</p>}
                            {!tedWordPop.loading && !tedWordPop.entry && <p className="muted">有道没查到这个词</p>}
                            {tedWordPop.entry && (
                              <>
                                {renderDictPron(tedWordPop.entry)}
                                {renderDictBody(tedWordPop.entry)}
                                <div className="ted-word-pop-actions">
                                  <button
                                    type="button"
                                    className="btn primary small"
                                    disabled={tedWordPop.added}
                                    onClick={() => void addTedWordToBook(tedWordPop.entry as DictEntry)}
                                  >
                                    {tedWordPop.added ? "已加入单词本" : "加入单词本"}
                                  </button>
                                  <button type="button" className="btn ghost small" onClick={() => openYoudaoWeb(tedWordPop.word)}>
                                    网页版
                                  </button>
                                  <button
                                    type="button"
                                    className="btn ghost small ai-pop-btn"
                                    title="让 AI 结合语境精讲这个词并出几道自测题"
                                    onClick={() => {
                                      const ctx = tedTalk?.sentences[tedSentIdx]?.text || "";
                                      setTedWordPop(null);
                                      setAiPanel({ text: tedWordPop.word, context: ctx });
                                    }}
                                  >
                                    <Sparkles size={13} /> AI 精讲
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}
          {tab === "juyouci" && <JuyouciPanel onOpenLibrary={() => setTab("ted")} />}
          {tab === "askai" && <AskAiPanel />}
        </div>
        {showTtsSettings &&
          createPortal(
            <div className="tts-settings-overlay" onClick={() => setShowTtsSettings(false)}>
              <div
                className="tts-settings-menu"
                style={{ top: ttsMenuPos.top, right: ttsMenuPos.right }}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="tts-settings-row">
                  <span className="tts-settings-label">声音</span>
                  <div className="tts-voice-group">
                    <button
                      type="button"
                      className={ttsVoice === "female" ? "active" : ""}
                      onClick={() => setTtsVoice("female")}
                    >
                      女生
                    </button>
                    <button
                      type="button"
                      className={ttsVoice === "male" ? "active" : ""}
                      onClick={() => setTtsVoice("male")}
                    >
                      男生
                    </button>
                    <button
                      type="button"
                      className={ttsVoice === "default" ? "active" : ""}
                      onClick={() => setTtsVoice("default")}
                    >
                      默认
                    </button>
                  </div>
                </div>
                <div className="tts-settings-row">
                  <span className="tts-settings-label">口音</span>
                  <div className="tts-voice-group">
                    <button
                      type="button"
                      className={accent === 1 ? "active" : ""}
                      onClick={() => setAccent(1)}
                    >
                      英音
                    </button>
                    <button
                      type="button"
                      className={accent === 2 ? "active" : ""}
                      onClick={() => setAccent(2)}
                    >
                      美音
                    </button>
                  </div>
                </div>
                <div className="tts-settings-row">
                  <span className="tts-settings-label">语速</span>
                  <input
                    type="range"
                    min={RATE_MIN}
                    max={RATE_MAX}
                    step={0.1}
                    value={rate}
                    onChange={(event) => setRate(Number(event.target.value))}
                  />
                  <span className="tts-rate-value">{rate.toFixed(1)}×</span>
                </div>
                <button type="button" className="tts-settings-done" onClick={() => setShowTtsSettings(false)}>
                  完成
                </button>
              </div>
            </div>,
            document.body,
          )}
      </div>
    </div>
  );
}

// ===================== AI 精讲设置面板 =====================
function AiSettingsPanel({ onClose }: { onClose: () => void }) {
  const saved = loadAiConfig();
  const [provider, setProvider] = useState<AiProvider>(saved?.provider || "free");
  const [apiKey, setApiKey] = useState(saved?.apiKey || "");
  const [model, setModel] = useState(saved?.model || "");
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const links: Record<AiProvider, string> = {
    free: "",
    deepseek: "https://platform.deepseek.com/",
    qwen: "https://dashscope.console.aliyun.com/",
    zhipu: "https://open.bigmodel.cn/usercenter/apikeys",
    doubao: "https://console.volcengine.com/ark/center/apikey",
  };

  const testConnection = async () => {
    setTesting(true);
    setStatus(null);
    try {
      const text = await callAiTutor(buildAiTutorMessages("hello", "hello"));
      if (text === null) {
        setStatus({ ok: false, msg: "当前厂商还没填 API Key" });
        return;
      }
      const parsed = parseAiResult(text);
      setStatus({ ok: true, msg: parsed ? "连接成功，AI 已就绪" : "连接成功（返回格式略有偏差，仍可用）" });
    } catch (e) {
      setStatus({ ok: false, msg: "连接失败：" + (e instanceof Error ? e.message : String(e)) });
    } finally {
      setTesting(false);
    }
  };

  const save = () => {
    if (provider !== "free" && !apiKey.trim()) {
      setStatus({ ok: false, msg: "当前厂商需要 API Key；只想免费用就选「免费 · 无需 Key」" });
      return;
    }
    saveAiConfig({ provider, apiKey: apiKey.trim(), model: model.trim() || undefined });
    setStatus({ ok: true, msg: provider === "free" ? "已保存（免费模式，开箱即用）" : "已保存（仅存在本机浏览器）" });
  };

  return (
    <div className="ai-settings">
      <div className="ai-settings-head">
        <strong>
          <Sparkles size={15} /> AI 精讲设置
        </strong>
        <button type="button" className="ted-word-pop-close" onClick={onClose}>
          ×
        </button>
      </div>
      <p className="ai-settings-tip">
        默认「免费 · 无需 Key」，不用填任何东西直接能用（社区免费通道，速度稍慢、偶尔不稳）。
        想更快更稳就选其它厂商、填个免费额度的 Key（DeepSeek 注册送额度、智谱 GLM-4-Flash 免费、通义有免费额度）。
        密钥只存在你本机浏览器里，不会上传到任何服务器。
      </p>
      <div className="ai-settings-row">
        <span>厂商</span>
        <select value={provider} onChange={(event) => setProvider(event.target.value as AiProvider)}>
          {PROVIDER_ORDER.map((p) => (
            <option key={p} value={p}>
              {PROVIDER_LABELS[p]}
            </option>
          ))}
        </select>
      </div>
      <div className="ai-settings-row">
        <span>API Key</span>
        <input
          type="password"
          value={provider === "free" ? "" : apiKey}
          disabled={provider === "free"}
          placeholder={provider === "free" ? "免费模式不用填" : "粘贴你的 Key"}
          onChange={(event) => setApiKey(event.target.value)}
        />
      </div>
      <div className="ai-settings-row">
        <span>模型</span>
        <input value={model} placeholder="留空用默认" onChange={(event) => setModel(event.target.value)} />
      </div>
      <div className="ai-settings-actions">
        <button type="button" className="btn primary small" onClick={save}>
          保存
        </button>
        <button type="button" className="btn ghost small" onClick={testConnection} disabled={testing}>
          {testing ? "测试中…" : "测试连接"}
        </button>
        {provider !== "free" && (
          <button
            type="button"
            className="ai-settings-link"
            onClick={() => {
              const url = links[provider];
              if (window.studyNotes?.openExternal) void window.studyNotes.openExternal(url);
              else window.open(url, "_blank", "noreferrer");
            }}
          >
            去拿 Key
          </button>
        )}
      </div>
      {status && <p className={status.ok ? "ai-settings-ok" : "ai-settings-err"}>{status.msg}</p>}
    </div>
  );
}

// ===================== AI 精讲 + 自测面板 =====================
function AiTutorPanel({
  selectedText,
  contextText,
  onClose,
  onAddVocab,
  onOpenSettings,
}: {
  selectedText: string;
  contextText: string;
  onClose: () => void;
  onAddVocab: (vocab: AiVocab) => void;
  onOpenSettings: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<ParsedAi | null>(null);
  const [quizState, setQuizState] = useState<{ value: string; checked: boolean; correct: boolean }[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const text = await callAiTutor(buildAiTutorMessages(selectedText, contextText));
        if (!alive) return;
        if (text === null) {
          setError("当前厂商还没填 API Key。点下面「去设置」填一下，或把厂商切回「免费 · 无需 Key」（不用填任何东西）。");
          setLoading(false);
          return;
        }
        setRaw(text);
        const p = parseAiResult(text);
        setParsed(p);
        if (p) setQuizState(p.quiz.map(() => ({ value: "", checked: false, correct: false })));
      } catch (e) {
        if (alive) setError("AI 请求失败：" + (e instanceof Error ? e.message : String(e)));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [selectedText, contextText]);

  const checkQuiz = (i: number) => {
    if (!parsed) return;
    const q = parsed.quiz[i];
    const st = quizState[i];
    if (!st || !st.value.trim()) return;
    let correct = false;
    if (q.type === "choice") {
      correct = st.value.trim().toUpperCase() === String(q.answer || "").trim().toUpperCase();
    } else {
      correct = normalizeAnswer(st.value) === normalizeAnswer(q.answer);
    }
    setQuizState((prev) => prev.map((s, idx) => (idx === i ? { ...s, checked: true, correct } : s)));
  };

  return (
    <div className="ai-tutor-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="ai-tutor-panel">
        <div className="ai-tutor-head">
          <strong>
            <Sparkles size={15} /> AI 精讲 + 自测
          </strong>
          <button type="button" className="ted-word-pop-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="ai-tutor-selected">「{selectedText}」</div>
        {loading && (
          <div className="ai-tutor-loading">
            <Loader2 className="spin" size={16} /> AI 讲解中…
          </div>
        )}
        {error && (
          <div className="ai-tutor-error">
            <p>{error}</p>
            <button type="button" className="btn primary small" onClick={onOpenSettings}>
              去设置
            </button>
          </div>
        )}
        {!loading && !error && parsed && (
          <div className="ai-tutor-body">
            <section className="ai-section">
              <h4>精讲</h4>
              <p className="ai-explain">{parsed.explain}</p>
            </section>
            {parsed.vocab.length > 0 && (
              <section className="ai-section">
                <h4>重点生词</h4>
                <ul className="ai-vocab">
                  {parsed.vocab.map((v, i) => (
                    <li key={i}>
                      <div className="ai-vocab-text">
                        <strong>{v.word}</strong>
                        {v.phonetic && <span className="ai-vocab-phon">{v.phonetic}</span>}
                        <span className="ai-vocab-mean">{v.meaning}</span>
                      </div>
                      <button type="button" className="btn ghost small" onClick={() => onAddVocab(v)}>
                        加入单词本
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {parsed.quiz.length > 0 && (
              <section className="ai-section">
                <h4>自测</h4>
                <ol className="ai-quiz">
                  {parsed.quiz.map((q, i) => {
                    const st = quizState[i] || { value: "", checked: false, correct: false };
                    return (
                      <li key={i} className="ai-quiz-item">
                        <p className="ai-quiz-q">
                          {i + 1}. {q.question}
                        </p>
                        {q.type === "choice" ? (
                          <div className="ai-quiz-options">
                            {(q.options || []).map((opt, oi) => {
                              const letter = String.fromCharCode(65 + oi);
                              const isAnswer = letter === String(q.answer || "").toUpperCase();
                              const cls =
                                st.checked
                                  ? isAnswer
                                    ? "right"
                                    : st.value === letter
                                      ? "wrong"
                                      : ""
                                  : st.value === letter
                                    ? "picked"
                                    : "";
                              return (
                                <button
                                  key={oi}
                                  type="button"
                                  className={`ai-quiz-opt ${cls}`}
                                  disabled={st.checked}
                                  onClick={() =>
                                    setQuizState((prev) => prev.map((s, idx) => (idx === i ? { ...s, value: letter } : s)))
                                  }
                                >
                                  {letter}. {opt}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <textarea
                            className="ai-quiz-input"
                            value={st.value}
                            disabled={st.checked}
                            placeholder={q.type === "fill" ? "填写答案" : "写一句英文"}
                            onChange={(event) =>
                              setQuizState((prev) => prev.map((s, idx) => (idx === i ? { ...s, value: event.target.value } : s)))
                            }
                          />
                        )}
                        {!st.checked ? (
                          <button type="button" className="btn small" onClick={() => checkQuiz(i)} disabled={!st.value.trim()}>
                            检查
                          </button>
                        ) : (
                          <div className={`ai-quiz-feedback ${st.correct ? "ok" : "bad"}`}>
                            {q.type === "sentence" ? (
                              <>
                                <span>参考答案：</span>
                                <strong>{q.answer}</strong>
                                {q.explanation && <p className="ai-quiz-exp">{q.explanation}</p>}
                              </>
                            ) : (
                              <>
                                <strong>{st.correct ? "答对了 ✓" : "正确答案：" + q.answer}</strong>
                                {q.explanation && <p className="ai-quiz-exp">{q.explanation}</p>}
                              </>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </section>
            )}
          </div>
        )}
        {!loading && !error && !parsed && (
          <div className="ai-tutor-body">
            <p className="ai-explain">{raw}</p>
          </div>
        )}
      </div>
    </div>
  );
}
