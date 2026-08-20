import { useEffect, useMemo, useState } from "react";
import {
  BookMarked,
  BookOpenText,
  CheckCircle2,
  Circle,
  Gauge,
  ListChecks,
  Pause,
  PenLine,
  Plus,
  Quote,
  RotateCcw,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import { recommendedWords, type EnglishWord } from "../data/englishWords";
import type { StudySentence, StudyWord } from "../types";
import { DoodleBanner, DoodleDecor } from "./Doodles";

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
  const [tab, setTab] = useState<"learn" | "wordbook" | "sentencebook" | "dictation">("learn");
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
  const [todaySentenceIndex, setTodaySentenceIndex] = useState(() => Math.floor(Date.now() / 86400000));

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
        <DoodleDecor />
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

        <DoodleBanner className="modal-banner" />

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
                    <div>
                      <strong>{item.english}</strong>
                      <span>{item.chinese}</span>
                    </div>
                    <div>
                      <button type="button" className="icon-btn" title="朗读" onClick={() => speak(item.english)}>
                        <Volume2 size={15} />
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
        </div>
      </div>
    </div>
  );
}
