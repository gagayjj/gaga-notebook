import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpenText, CheckCircle2, Circle, FastForward, Gauge, Pause, Play, Volume2, X } from "lucide-react";
import { dailyEnglishLessons } from "../data/dailyEnglish";

interface EnglishLearningProps {
  onClose: () => void;
}

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function EnglishLearning({ onClose }: EnglishLearningProps) {
  const lesson = useMemo(() => {
    const index = Math.floor(Date.now() / 86400000) % dailyEnglishLessons.length;
    return dailyEnglishLessons[index];
  }, []);
  const [speaking, setSpeaking] = useState(false);
  const [slow, setSlow] = useState(false);
  const [customText, setCustomText] = useState("");
  const [learned, setLearned] = useState(false);
  const speakingRef = useRef(false);

  useEffect(() => {
    const key = `english-learned-${dayKey()}`;
    setLearned(localStorage.getItem(key) === "1");
  }, []);

  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    const synthesis = window.speechSynthesis;
    if (!synthesis) return;
    synthesis.getVoices();
    const loadVoices = () => synthesis.getVoices();
    synthesis.addEventListener("voiceschanged", loadVoices);
    return () => synthesis.removeEventListener("voiceschanged", loadVoices);
  }, []);

  const pickEnglishVoice = () => {
    const voices = window.speechSynthesis?.getVoices() || [];
    return (
      voices.find((voice) => voice.lang?.toLowerCase().startsWith("en") && voice.localService) ||
      voices.find((voice) => voice.lang?.toLowerCase().startsWith("en")) ||
      null
    );
  };

  const speak = (text: string, useSlow = slow) => {
    const synthesis = window.speechSynthesis;
    if (!synthesis || !text.trim()) return;
    synthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = useSlow ? 0.65 : 1;
    const voice = pickEnglishVoice();
    if (voice) utterance.voice = voice;
    utterance.onend = () => {
      speakingRef.current = false;
      setSpeaking(false);
    };
    utterance.onerror = () => {
      speakingRef.current = false;
      setSpeaking(false);
    };
    speakingRef.current = true;
    setSpeaking(true);
    synthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    window.speechSynthesis?.cancel();
    speakingRef.current = false;
    setSpeaking(false);
  };

  const toggleLearned = () => {
    const next = !learned;
    setLearned(next);
    localStorage.setItem(`english-learned-${dayKey()}`, next ? "1" : "0");
  };

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

        <div className="english-content">
          <section className="lesson-card">
            <div className="lesson-word-row">
              <div>
                <h2>{lesson.word}</h2>
                <span className="lesson-phonetic">{lesson.phonetic}</span>
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
            <p className="lesson-meaning">{lesson.meaning}</p>
            <div className="lesson-sentence">
              <p>{lesson.sentence}</p>
              <span>{lesson.sentenceMeaning}</span>
            </div>
          </section>

          <div className="english-audio-actions">
            {speaking ? (
              <button type="button" className="btn primary" onClick={stopSpeaking}>
                <Pause size={16} />
                停止
              </button>
            ) : (
              <button
                type="button"
                className="btn primary"
                onClick={() => speak(`${lesson.word}. ${lesson.sentence}`)}
              >
                <Volume2 size={16} />
                朗读整课
              </button>
            )}
            <button type="button" className="btn" onClick={() => speak(lesson.word)}>
              读单词
            </button>
            <button type="button" className="btn" onClick={() => speak(lesson.sentence)}>
              读例句
            </button>
            <button type="button" className="btn" onClick={() => speak(`${lesson.word}. ${lesson.sentence}`, true)}>
              <FastForward size={15} />
              慢速整课
            </button>
          </div>

          <section className="custom-read">
            <div className="custom-read-head">
              <strong>朗读自己的英语文本</strong>
              <span>可以粘贴课文、生词或句子</span>
            </div>
            <textarea
              value={customText}
              onChange={(event) => setCustomText(event.target.value)}
              placeholder="Paste English text here..."
            />
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
