export interface EnglishLesson {
  id: string;
  word: string;
  phonetic: string;
  meaning: string;
  sentence: string;
  sentenceMeaning: string;
}

export const dailyEnglishLessons: EnglishLesson[] = [
  {
    id: "day-1",
    word: "discipline",
    phonetic: "/ˈdɪsəplɪn/",
    meaning: "自律；纪律",
    sentence: "Discipline is choosing what you want most over what you want now.",
    sentenceMeaning: "自律，是选择你最想要的，而不是现在想要的。",
  },
  {
    id: "day-2",
    word: "persistent",
    phonetic: "/pərˈsɪstənt/",
    meaning: "坚持不懈的",
    sentence: "She is persistent and never gives up on her goals.",
    sentenceMeaning: "她非常坚持，从不放弃自己的目标。",
  },
  {
    id: "day-3",
    word: "curious",
    phonetic: "/ˈkjʊriəs/",
    meaning: "好奇的",
    sentence: "A curious mind always asks better questions.",
    sentenceMeaning: "好奇的心总是会提出更好的问题。",
  },
  {
    id: "day-4",
    word: "improve",
    phonetic: "/ɪmˈpruːv/",
    meaning: "改进；提高",
    sentence: "Small daily habits improve your English over time.",
    sentenceMeaning: "每天一点小习惯，长期下来英语就会进步。",
  },
  {
    id: "day-5",
    word: "confident",
    phonetic: "/ˈkɑːnfɪdənt/",
    meaning: "自信的",
    sentence: "Speak slowly and you will sound more confident.",
    sentenceMeaning: "慢慢说，你会听起来更自信。",
  },
  {
    id: "day-6",
    word: "focus",
    phonetic: "/ˈfoʊkəs/",
    meaning: "专注；焦点",
    sentence: "Turn off your phone and focus on one task.",
    sentenceMeaning: "关掉手机，专注做一件事。",
  },
  {
    id: "day-7",
    word: "review",
    phonetic: "/rɪˈvjuː/",
    meaning: "复习；回顾",
    sentence: "Review today's lesson before you go to bed.",
    sentenceMeaning: "睡觉前，复习一下今天的课程。",
  },
  {
    id: "day-8",
    word: "encourage",
    phonetic: "/ɪnˈkɜːrɪdʒ/",
    meaning: "鼓励",
    sentence: "Encourage yourself every time you speak English.",
    sentenceMeaning: "每次说英语的时候，都鼓励一下自己。",
  },
  {
    id: "day-9",
    word: "achieve",
    phonetic: "/əˈtʃiːv/",
    meaning: "实现；达成",
    sentence: "You can achieve anything with steady practice.",
    sentenceMeaning: "持续练习，你可以实现任何目标。",
  },
  {
    id: "day-10",
    word: "grateful",
    phonetic: "/ˈɡreɪtfl/",
    meaning: "感激的",
    sentence: "Stay grateful for every small progress you make.",
    sentenceMeaning: "为每一次小小的进步心怀感激。",
  },
];
