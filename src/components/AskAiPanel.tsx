// 问 AI：自由问答入口——任意英语/词句/美剧/文化问题都能问，
// 走同一个 AI 通道（默认免费 · 无需 Key），回答刻意控制在 300 字内。
import { useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { askAiFree, type AiMessage } from "../aiTutor";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

// 聊天记录存 localStorage，退出重开还在
const HISTORY_KEY = "askai-history";
const MAX_HISTORY = 200;

function loadHistory(): ChatMsg[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]") as ChatMsg[];
    return Array.isArray(parsed) ? parsed.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string") : [];
  } catch {
    return [];
  }
}

function saveHistory(msgs: ChatMsg[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(msgs.slice(-MAX_HISTORY)));
  } catch {
    /* 存储满了就不管，不影响对话 */
  }
}

export default function AskAiPanel() {
  const [messages, setMessages] = useState<ChatMsg[]>(() => loadHistory());
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const updateMessages = (msgs: ChatMsg[]) => {
    setMessages(msgs);
    saveHistory(msgs);
  };

  const clearHistory = () => {
    updateMessages([]);
    localStorage.removeItem(HISTORY_KEY);
  };

  // 有历史记录时，进来直接停在最底部
  useEffect(() => {
    requestAnimationFrame(() => {
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    setError(null);
    const next: ChatMsg[] = [...messages, { role: "user", content: q }];
    updateMessages(next);
    setLoading(true);
    try {
      // askAiFree 自己会把问题追加为 user 消息，这里只给历史
      const history: AiMessage[] = next.slice(0, -1).map((m) => ({ role: m.role, content: m.content }));
      const answer = await askAiFree(q, history);
      if (answer === null) {
        setError("当前厂商还没填 API Key。点右上角 ✦ 填一下，或把厂商切回「免费 · 无需 Key」。");
      } else {
        updateMessages([...messages, { role: "user", content: q }, { role: "assistant", content: answer }]);
      }
    } catch (e) {
      setError("AI 请求失败：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
      requestAnimationFrame(() => {
        const el = listRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    }
  };

  return (
    <section className="askai-panel">
      <div className="askai-list" ref={listRef}>
        {messages.length === 0 && !loading && (
          <div className="askai-empty">
            <p>随便问：这个短语怎么用？这句台词是什么梗？四级和雅思先考哪个？</p>
            <span>走的就是你配置的 AI（默认免费 · 无需 Key），回答偏简短。</span>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`askai-msg ${m.role}`}>
            <span className="askai-who">{m.role === "user" ? "我" : "AI"}</span>
            <p>{m.content}</p>
          </div>
        ))}
        {loading && (
          <div className="askai-msg assistant">
            <span className="askai-who">AI</span>
            <p>
              <Loader2 className="spin" size={13} /> 想一下…
            </p>
          </div>
        )}
      </div>
      <div className="askai-toolbar">
        {messages.length > 0 && (
          <button type="button" className="btn ghost small" onClick={clearHistory}>
            清空记录
          </button>
        )}
      </div>
      {error && <p className="jy-error">{error}</p>}
      <div className="askai-input-row">
        <textarea
          value={input}
          placeholder="输入你的问题，回车发送（Shift+回车换行）"
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <button type="button" className="btn primary" onClick={() => void send()} disabled={loading || !input.trim()}>
          <Send size={14} /> 发送
        </button>
      </div>
    </section>
  );
}
