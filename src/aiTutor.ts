// AI 精讲 + 自测：统一的 LLM 调用层
// - 配置（厂商 + API Key）存在 localStorage，不写死在代码里
// - 桌面端（Electron）走主进程 IPC 转发，避开浏览器 CORS
// - 网页端直连各家 OpenAI 兼容接口（需厂商支持跨域，否则用桌面版）

export type AiProvider = "free" | "deepseek" | "qwen" | "zhipu" | "doubao";

export interface AiTutorConfig {
  provider: AiProvider;
  apiKey: string;
  model?: string;
}

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const STORAGE_KEY = "english-ai-tutor";

// 各家 OpenAI 兼容 chat/completions 地址
const ENDPOINTS: Record<AiProvider, string> = {
  free: "https://text.pollinations.ai/openai",
  deepseek: "https://api.deepseek.com/chat/completions",
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
  zhipu: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
  doubao: "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
};

// 默认模型（free / 最便宜一档）
// free = Pollinations 社区免费通道：不要 Key、匿名可用（速度稍慢、偶尔不稳，个人学习够用）
const DEFAULT_MODELS: Record<AiProvider, string> = {
  free: "openai",
  deepseek: "deepseek-chat",
  qwen: "qwen-plus",
  zhipu: "glm-4-flash",
  doubao: "doubao-seed-1-6-flash-250615",
};

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  free: "免费 · 无需 Key",
  deepseek: "DeepSeek",
  qwen: "通义千问",
  zhipu: "智谱 GLM",
  doubao: "豆包（火山方舟）",
};

// 下拉框展示顺序（免费放最前、作为默认）
export const PROVIDER_ORDER: AiProvider[] = ["free", "deepseek", "qwen", "zhipu", "doubao"];

export function loadAiConfig(): AiTutorConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw) as Partial<AiTutorConfig>;
    if (!cfg.provider) return null;
    // 免费模式不需要 key；收费厂商没填 key 视为未配置
    if (cfg.provider !== "free" && !cfg.apiKey) return null;
    return { provider: cfg.provider, apiKey: cfg.apiKey || "", model: cfg.model };
  } catch {
    return null;
  }
}

export function saveAiConfig(cfg: AiTutorConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function clearAiConfig() {
  localStorage.removeItem(STORAGE_KEY);
}

// 系统提示词：让模型扮演面向中国学习者的英语辅导老师，返回固定结构 JSON
const SYSTEM_PROMPT = `你是一个面向中国英语学习者的 AI 辅导老师，讲解要通俗易懂、像老师在讲课，不要堆术语。
用户会给你一段英文（可能是一句话、一个短语，或一个单词），以及它的上下文。请基于上下文讲解这段英文，并出几道自测题巩固。
请严格只返回一个 JSON 对象（不要任何额外文字、不要 markdown 代码块、不要解释），结构如下：
{
  "explain": "对这段英文的讲解（中文，结合语境解释含义、特殊用法、为什么这么用；200字以内，口语化）",
  "vocab": [
    { "word": "这段里最值得记的生词或短语", "phonetic": "音标，没有就留空字符串", "meaning": "中文释义" }
  ],
  "quiz": [
    { "type": "fill", "question": "填空题题干，用 ____ 表示挖空", "answer": "正确答案", "explanation": "解析" },
    { "type": "choice", "question": "选择题题干", "options": ["选项A", "选项B", "选项C", "选项D"], "answer": "正确选项字母，如 A", "explanation": "解析" },
    { "type": "sentence", "question": "用某个词造句（写明用哪个词）", "answer": "参考例句", "explanation": "要点" }
  ]
}
要求：
- vocab 列出 1~3 个这段里最该记的生词/短语，按重要性排序。
- quiz 出 2~3 道，类型尽量混合（fill / choice / sentence 各来一点）。
- explain 和 explanation 都用大白话，像老师讲给基础一般的学生听。`;

export function buildAiTutorMessages(selectedText: string, contextText: string): AiMessage[] {
  const user = `【上下文（帮助你判断这段话的意思和用法）】\n${contextText.trim() || "（无上下文）"}\n\n【请讲解这一段】\n${selectedText.trim()}`;
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: user },
  ];
}

// 调大模型，返回模型原始文本；返回 null 表示「选了收费厂商但没填 Key」（调用方提示去设置）。
// 什么都不配置时默认走免费通道，开箱即用。
export async function callAiTutor(messages: AiMessage[]): Promise<string | null> {
  const cfg = loadAiConfig() || { provider: "free" as AiProvider, apiKey: "" };
  if (cfg.provider !== "free" && !cfg.apiKey) return null;
  const model = cfg.model || DEFAULT_MODELS[cfg.provider];
  // 免费通道不支持 response_format，靠提示词约束 JSON；加 private 避免请求进入公共动态
  // 免费通道是推理模型，默认思考量会把输出额度烧光（返回空串），压到 low 才吐得出来
  const payload: Record<string, unknown> =
    cfg.provider === "free"
      ? { model, messages, temperature: 0.7, private: true, reasoning_effort: "low" }
      : { model, messages, response_format: { type: "json_object" }, temperature: 0.7 };

  // 桌面端：交给主进程转发（无 CORS 限制）
  const api = (window as unknown as { studyNotes?: { aiTutor?: (input: unknown) => Promise<string> } }).studyNotes;
  if (api?.aiTutor) {
    return await api.aiTutor({ provider: cfg.provider, apiKey: cfg.apiKey, model, ...payload });
  }

  // 网页端：直连（可能被 CORS 拦截）
  const res = await fetch(ENDPOINTS[cfg.provider], {
    method: "POST",
    headers: cfg.apiKey
      ? { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` }
      : { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`AI 接口返回 ${res.status}：${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "";
}

// 自由问答：不要求 JSON，正常聊天式回答（走同一个通道/同一个 Key 配置）
export async function askAiFree(
  question: string,
  history: AiMessage[] = [],
): Promise<string | null> {
  const cfg = loadAiConfig() || { provider: "free" as AiProvider, apiKey: "" };
  if (cfg.provider !== "free" && !cfg.apiKey) return null;
  const model = cfg.model || DEFAULT_MODELS[cfg.provider];
  const system =
    "你是一个友好、接地气的中英双语学习助手，帮用户解答英语学习、词句、美剧、文化等各种问题。" +
    "用大白话回答，直接给结论再给理由；回答控制在 300 字以内（免费通道输出额度有限，务必精简）。" +
    "涉及英语例句时给出地道的英文例句加中文翻译。";
  const payload: Record<string, unknown> = {
    model,
    messages: [{ role: "system", content: system }, ...history.slice(-8), { role: "user", content: question }],
    temperature: 0.7,
    ...(cfg.provider === "free" ? { private: true, reasoning_effort: "low" } : {}),
  };

  const api = (window as unknown as { studyNotes?: { aiTutor?: (input: unknown) => Promise<string> } }).studyNotes;
  if (api?.aiTutor) {
    return await api.aiTutor({ provider: cfg.provider, apiKey: cfg.apiKey, model, ...payload });
  }
  const res = await fetch(ENDPOINTS[cfg.provider], {
    method: "POST",
    headers: cfg.apiKey
      ? { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` }
      : { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`AI 接口返回 ${res.status}：${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "";
}

// 把模型返回的 JSON 文本解析成结构化结果；解析失败返回 null（调用方回退展示原文）
export interface AiVocab {
  word: string;
  phonetic?: string;
  meaning: string;
}

export interface AiQuiz {
  type: "fill" | "choice" | "sentence";
  question: string;
  options?: string[];
  answer: string;
  explanation?: string;
}

export interface ParsedAi {
  explain: string;
  vocab: AiVocab[];
  quiz: AiQuiz[];
}

export function parseAiResult(text: string): ParsedAi | null {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try {
    const obj = JSON.parse(t) as Partial<ParsedAi>;
    if (typeof obj.explain !== "string") return null;
    return {
      explain: obj.explain,
      vocab: Array.isArray(obj.vocab) ? obj.vocab.filter((v) => v?.word).map((v) => ({ word: v.word, phonetic: v.phonetic || "", meaning: v.meaning || "" })) : [],
      quiz: Array.isArray(obj.quiz) ? obj.quiz.filter((q) => q?.question).map((q) => ({ type: q.type || "fill", question: q.question, options: q.options, answer: q.answer || "", explanation: q.explanation || "" })) : [],
    };
  } catch {
    return null;
  }
}
