export interface EnglishWord {
  id: string;
  word: string;
  phonetic: string;
  meaning: string;
  sentence: string;
  sentenceMeaning: string;
}

export const recommendedWords: EnglishWord[] = [
  { id: "rec-1", word: "achieve", phonetic: "/əˈtʃiːv/", meaning: "实现；达成", sentence: "You can achieve anything with steady practice.", sentenceMeaning: "持续练习，你可以实现任何目标。" },
  { id: "rec-2", word: "balance", phonetic: "/ˈbæləns/", meaning: "平衡", sentence: "Find a balance between study and rest.", sentenceMeaning: "在学习与休息之间找到平衡。" },
  { id: "rec-3", word: "career", phonetic: "/kəˈrɪr/", meaning: "职业；事业", sentence: "Learning builds a solid career foundation.", sentenceMeaning: "学习为事业打下坚实基础。" },
  { id: "rec-4", word: "decide", phonetic: "/dɪˈsaɪd/", meaning: "决定", sentence: "Decide what you want, then start small.", sentenceMeaning: "决定你想要什么，然后从小事开始。" },
  { id: "rec-5", word: "effort", phonetic: "/ˈefərt/", meaning: "努力", sentence: "Your effort today creates your future.", sentenceMeaning: "今天的努力创造你的未来。" },
  { id: "rec-6", word: "familiar", phonetic: "/fəˈmɪliər/", meaning: "熟悉的", sentence: "Reading makes new words feel familiar.", sentenceMeaning: "阅读会让生词变得熟悉。" },
  { id: "rec-7", word: "growth", phonetic: "/ɡroʊθ/", meaning: "成长；增长", sentence: "Mistakes are part of growth.", sentenceMeaning: "犯错是成长的一部分。" },
  { id: "rec-8", word: "habit", phonetic: "/ˈhæbɪt/", meaning: "习惯", sentence: "A small habit repeated daily becomes powerful.", sentenceMeaning: "每天重复的小习惯会变得强大。" },
  { id: "rec-9", word: "improve", phonetic: "/ɪmˈpruːv/", meaning: "改进；提高", sentence: "Review your notes to improve your memory.", sentenceMeaning: "复习笔记可以提升记忆。" },
  { id: "rec-10", word: "knowledge", phonetic: "/ˈnɑːlɪdʒ/", meaning: "知识", sentence: "Knowledge grows when you share it.", sentenceMeaning: "知识在分享中增长。" },
  { id: "rec-11", word: "lesson", phonetic: "/ˈlesn/", meaning: "课程；教训", sentence: "Every lesson teaches you something new.", sentenceMeaning: "每节课都会教你新的东西。" },
  { id: "rec-12", word: "memory", phonetic: "/ˈmeməri/", meaning: "记忆", sentence: "Writing notes strengthens your memory.", sentenceMeaning: "写笔记能强化记忆。" },
  { id: "rec-13", word: "opportunity", phonetic: "/ˌɑːpərˈtuːnəti/", meaning: "机会", sentence: "Every day is a new opportunity to learn.", sentenceMeaning: "每一天都是学习的新机会。" },
  { id: "rec-14", word: "practice", phonetic: "/ˈpræktɪs/", meaning: "练习", sentence: "Practice makes progress, not perfection.", sentenceMeaning: "练习带来进步，而不是完美。" },
  { id: "rec-15", word: "question", phonetic: "/ˈkwestʃən/", meaning: "问题", sentence: "A good question opens a new door.", sentenceMeaning: "一个好问题会打开一扇新门。" },
  { id: "rec-16", word: "remember", phonetic: "/rɪˈmembər/", meaning: "记得", sentence: "Remember to review what you learned today.", sentenceMeaning: "记得复习今天学到的内容。" },
  { id: "rec-17", word: "schedule", phonetic: "/ˈskedʒuːl/", meaning: "时间表；安排", sentence: "A clear schedule keeps you on track.", sentenceMeaning: "清晰的计划让你保持在正轨上。" },
  { id: "rec-18", word: "success", phonetic: "/səkˈses/", meaning: "成功", sentence: "Small steps lead to success.", sentenceMeaning: "小步前进会通向成功。" },
  { id: "rec-19", word: "understand", phonetic: "/ˌʌndərˈstænd/", meaning: "理解", sentence: "Read again until you understand.", sentenceMeaning: "反复读，直到你理解。" },
  { id: "rec-20", word: "vocabulary", phonetic: "/vəˈkæbjəleri/", meaning: "词汇", sentence: "Build your vocabulary one word at a time.", sentenceMeaning: "一次一个词地积累词汇。" },
  { id: "rec-21", word: "willing", phonetic: "/ˈwɪlɪŋ/", meaning: "愿意的", sentence: "Be willing to learn from mistakes.", sentenceMeaning: "愿意从错误中学习。" },
  { id: "rec-22", word: "excellent", phonetic: "/ˈeksələnt/", meaning: "极好的", sentence: "You did an excellent job today.", sentenceMeaning: "你今天做得非常棒。" },
  { id: "rec-23", word: "familiar", phonetic: "/fəˈmɪliər/", meaning: "熟悉的", sentence: "The more you hear it, the more familiar it feels.", sentenceMeaning: "听得越多，就越熟悉。" },
  { id: "rec-24", word: "progress", phonetic: "/ˈprɑːɡres/", meaning: "进步", sentence: "Track your progress every week.", sentenceMeaning: "每周记录你的进步。" },
  { id: "rec-25", word: "motivation", phonetic: "/ˌmoʊtɪˈveɪʃn/", meaning: "动力", sentence: "Clear goals keep your motivation strong.", sentenceMeaning: "清晰的目标让动力保持强劲。" },
  { id: "rec-26", word: "patience", phonetic: "/ˈpeɪʃns/", meaning: "耐心", sentence: "Language learning takes patience.", sentenceMeaning: "语言学习需要耐心。" },
  { id: "rec-27", word: "fluent", phonetic: "/ˈfluːənt/", meaning: "流利的", sentence: "Daily speaking helps you become fluent.", sentenceMeaning: "每天开口说，你会变得流利。" },
  { id: "rec-28", word: "curious", phonetic: "/ˈkjʊriəs/", meaning: "好奇的", sentence: "Stay curious about the world.", sentenceMeaning: "对世界保持好奇。" },
  { id: "rec-29", word: "confident", phonetic: "/ˈkɑːnfɪdənt/", meaning: "自信的", sentence: "Speak slowly and you will sound confident.", sentenceMeaning: "慢慢说，你会听起来自信。" },
  { id: "rec-30", word: "discipline", phonetic: "/ˈdɪsəplɪn/", meaning: "自律", sentence: "Discipline turns goals into results.", sentenceMeaning: "自律把目标变成结果。" },
];
