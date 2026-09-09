import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookMarked,
  BookOpenText,
  CheckCircle2,
  Circle,
  Gauge,
  Languages,
  ListChecks,
  Loader2,
  Pause,
  PenLine,
  Plus,
  Quote,
  RotateCcw,
  Save,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import { recommendedWords, type EnglishWord } from "../data/englishWords";
import type { StudySentence, StudyWord } from "../types";

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

function normalizeAnswer(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function EnglishLearning({ onClose }: EnglishLearningProps) {
  const [tab, setTab] = useState<"learn" | "wordbook" | "sentencebook" | "dictation" | "bilingual">("learn");
  const [planType, setPlanType] = useState<"words" | "sentences">(
    () => (localStorage.getItem("english-plan-type") as "words" | "sentences") || "words",
  );
  const [goal, setGoal] = useState(() => Number(localStorage.getItem("english-daily-goal") || 5));
  const [customWords, setCustomWords] = useState<StudyWord[]>([]);
  const [customSentences, setCustomSentences] = useState<StudySentence[]>([]);
  const [learned, setLearned] = useState(false);
  const [sentenceLearned, setSentenceLearned] = useState(false);
  const [slow, setSlow] = useState(false);
  const [customText, setCustomText] = useState("");
  const [sentenceForm, setSentenceForm] = useState({ english: "", chinese: "" });
  const [editingSentenceId, setEditingSentenceId] = useState<string | null>(null);
  const [editSentenceForm, setEditSentenceForm] = useState({ english: "", chinese: "" });
  const [todaySentenceIndex, setTodaySentenceIndex] = useState(() => Math.floor(Date.now() / 86400000));

  // 逐句对照：粘贴英文段落，按句号切句后逐句翻译为中文
  const [bilingualText, setBilingualText] = useState("");
  const [bilingualPairs, setBilingualPairs] = useState<
    { id: string; english: string; chinese: string; status: "pending" | "translated" | "error"; saved?: boolean }[]
  >([]);
  const [bilingualLoading, setBilingualLoading] = useState(false);
  const [bilingualError, setBilingualError] = useState<string | null>(null);
  const bilingualCacheRef = useRef<Record<string, string>>({});

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
    };
  }, []);

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

  const speak = (text: string, useSlow = slow) => {
    const synthesis = window.speechSynthesis;
    if (!synthesis || !text.trim()) return;
    synthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = useSlow ? 0.65 : 1;
    const voice =
      synthesis.getVoices().find((item) => item.lang?.toLowerCase().startsWith("en") && item.localService) ||
      synthesis.getVoices().find((item) => item.lang?.toLowerCase().startsWith("en")) ||
      null;
    if (voice) utterance.voice = voice;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    synthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
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

  // 调 MyMemory 免费接口，en -> zh-CN
  const translateOne = async (en: string): Promise<string> => {
    const cached = bilingualCacheRef.current[en];
    if (cached) return cached;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(en)}&langpair=en|zh-CN`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const out = data?.responseData?.translatedText;
    if (typeof out !== "string" || !out.trim()) throw new Error("empty response");
    const cleaned = out.replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
    bilingualCacheRef.current[en] = cleaned;
    return cleaned;
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
    // 逐句翻译：并发数 2，避免过快触发 MyMemory 限流
    for (let i = 0; i < initial.length; i += 2) {
      const slice = initial.slice(i, i + 2);
      await Promise.all(
        slice.map(async (p) => {
          try {
            const zh = await translateOne(p.english);
            setBilingualPairs((prev) => prev.map((x) => (x.id === p.id ? { ...x, chinese: zh, status: "translated" } : x)));
          } catch (err) {
            setBilingualPairs((prev) => prev.map((x) => (x.id === p.id ? { ...x, status: "error" } : x)));
          }
        }),
      );
    }
    setBilingualLoading(false);
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
    void markWordDirectly(sentenceId, word);
    window.getSelection()?.removeAllRanges();
  };

  // 逐句对照里选词：若该句还没存入语句本，先保存再标记
  const handleSelectInBilingual = async (pairId: string, event: React.MouseEvent<HTMLElement>) => {
    const word = extractSelectedWord(event.currentTarget);
    if (!word) return;
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
            onClick={() => speak(matched.word)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
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
              type="button"
              className={`icon-btn ${slow ? "active" : ""}`}
              title={slow ? "正常语速" : "慢速跟读"}
              onClick={() => setSlow((value) => !value)}
            >
              <Gauge size={16} />
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

              <div className="resource-list wordbook-list">
                {customWords.length === 0 && <p className="muted">单词本是空的，先添加几个生词</p>}
                {customWords.map((item) => (
                  <div className="wordbook-row" key={item.id}>
                    <div>
                      <strong>{item.word}</strong>
                      <span>{item.phonetic} · {item.meaning}</span>
                    </div>
                    <div>
                      <button type="button" className="icon-btn" title="朗读" onClick={() => speak(item.word)}>
                        <Volume2 size={15} />
                      </button>
                      <button type="button" className="icon-btn" title="删除" onClick={() => removeCustomWord(item.id)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
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
                {customSentences.map((item) => (
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
                        <>
                          <strong
  className="sentence-row-english select-to-mark"
  title="双击或拖选单词即可自动标记生词"
  onMouseUp={(event) => handleSelectInSentence(item.id, event)}
>
  {renderHighlightedSentence(item.english, item.id)}
</strong>
                          <span>{item.chinese}</span>
                        </>
                      )}
                      {(item.words?.length ?? 0) > 0 && (
                        <div className="sentence-marked-words">
                          {(item.words || []).map((word) => (
                            <span className="marked-word-chip" key={word.id}>
                              <button type="button" title="朗读生词" onClick={() => speak(word.word)}>
                                {word.word}
                              </button>
                              {word.phonetic && <em className="marked-word-phonetic">{word.phonetic}</em>}
                              <em>{word.meaning}</em>
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
                ))}
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
                      placeholder={dictMode === "words" ? "拼写出这个单词" : "输入整句英语"}
                      disabled={quizChecked}
                    />
                    {quizChecked && (
                      <div className={`dictation-feedback ${quizCorrect ? "correct" : "wrong"}`}>
                        {quizCorrect ? (
                          <>拼写正确，继续加油</>
                        ) : (
                          <>
                            正确答案：<strong>{currentQuizEntry.answer}</strong>
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
                        <div className="bilingual-cell-label">EN</div>
                        <div
                          className="bilingual-cell-text select-to-mark"
                          title="双击或拖选单词即可自动标记生词"
                          onMouseUp={(event) => void handleSelectInBilingual(pair.id, event)}
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
                            <span className="bilingual-err">翻译失败（点击单词可查词）</span>
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
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
