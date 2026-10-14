// 抓取 TED 演讲页面的 __NEXT_DATA__，生成精听工具用的本地 JSON：
//   public/ted/<slug>.json  —— 单篇演讲：视频地址 + 按句分组的时间轴字幕
//   public/ted/index.json   —— 精选清单（难度、时长、语速等指标）
// 用法：node scripts/fetch-ted.mjs
// 重新生成时直接跑即可；新增演讲在 TALKS 里加条目（level: 1入门 ~ 5高阶）。
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "ted");
mkdirSync(outDir, { recursive: true });

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

const TALKS = [
  { slug: "matt_cutts_try_something_new_for_30_days", level: 1, titleZh: "用30天尝试新事物", desc: "只有3分钟，句子短、语速慢，词汇都是常用词，适合入门第一篇" },
  { slug: "derek_sivers_how_to_start_a_movement", level: 1, titleZh: "如何发起一场运动", desc: "3分钟小故事，讲得极慢极清楚，配的画面就是字幕本身，好懂" },
  { slug: "rita_pierson_every_kid_needs_a_champion", level: 2, titleZh: "每个孩子都需要一个鼓励者", desc: "老师讲课，吐字清楚、句子完整，教育话题词汇不难" },
  { slug: "shawn_achor_the_happy_secret_to_better_work", level: 2, titleZh: "好心态带来的高效能", desc: "轻松幽默，从 anecdotes 讲起，听懂故事就能跟上" },
  { slug: "celeste_headlee_10_ways_to_have_a_better_conversation", level: 3, titleZh: "好 conversation 的十条建议", desc: "十条清单式结构，每条独立，条理清晰，适合精听跟句" },
  { slug: "julian_treasure_how_to_speak_so_that_people_want_to_listen", level: 3, titleZh: "怎样说话别人才爱听", desc: "语音专家示范发声与表达，语速中等，话题贴近生活" },
  { slug: "tim_urban_inside_the_mind_of_a_master_procrastinator", level: 3, titleZh: "拖延症大师的内心世界", desc: "搞笑但信息量大，有图解配合，练听力不容易走神" },
  { slug: "simon_sinek_how_great_leaders_inspire_action", level: 4, titleZh: "伟大领导者如何激励行动", desc: "商业演讲，长句和逻辑链多，需要跟住 because/so 的推理" },
  { slug: "amy_cuddy_your_body_language_shapes_who_you_are", level: 4, titleZh: "肢体语言塑造你自己", desc: "心理学研究叙述，含实验细节词汇，语速平稳但句子长" },
  { slug: "brene_brown_the_power_of_vulnerability", level: 4, titleZh: "脆弱的力量", desc: "语速快、口语化、多个人故事，词汇偏抽象情感类" },
  { slug: "chimamanda_adichie_the_danger_of_a_single_story", level: 5, titleZh: "单一故事的危险", desc: "文学化表达，长难句密集，词汇量大，适合高阶精听" },
  { slug: "ken_robinson_says_schools_kill_creativity", level: 5, titleZh: "学校扼杀创造力吗", desc: "英式幽默 + 即兴发挥，笑点需听懂才反应过来，难度最高" },
  // —— 第二批：抓不到的条目会被脚本自动跳过，不会写进清单 ——
  { slug: "dan_gilbert_the_surprising_science_of_happiness", level: 3, titleZh: "幸福的意外科学", desc: "心理学话题，讲得清楚有条理，例子生活化，句子不长" },
  { slug: "hans_rosling_the_best_stats_you_ve_ever_seen", level: 2, titleZh: "你见过最棒的统计展示", desc: "边看数据动画边讲，吐字清楚、语速不快，内容直观好懂" },
  { slug: "dan_pink_the_puzzle_of_motivation", level: 3, titleZh: "动机的谜题", desc: "结构清楚，先讲结论再讲实验，商务类常用词，适合精听" },
  { slug: "barry_schwartz_on_the_paradox_of_choice", level: 4, titleZh: "选择的悖论", desc: "学术型表达，长句和复合词多，逻辑链要跟住" },
  { slug: "malcolm_gladwell_on_spaghetti_sauce", level: 3, titleZh: "番茄酱里的学问", desc: "讲故事式，语气轻松，举例多，听起来不累" },
  { slug: "susan_cain_the_power_of_introverts", level: 3, titleZh: "内向者的力量", desc: "语速平稳、用词文雅，话题熟悉，适合练连贯听力" },
  { slug: "angela_lee_duckworth_grit_the_power_of_passion_and_perseverance", level: 2, titleZh: "坚毅：热情与坚持的力量", desc: "教育话题，句子短、说理直接，入门进阶都合适" },
  { slug: "meg_jay_why_30_is_not_the_new_20", level: 3, titleZh: "30岁不是新的20岁", desc: "心理医生讲年轻人，口语化、有故事，词汇不难" },
  { slug: "jane_mcgonigal_gaming_can_make_a_better_world", level: 3, titleZh: "游戏能让世界更美好", desc: "游戏设计师演讲，节奏明快，专有名词有画面辅助" },
  { slug: "robert_waldinger_what_makes_a_good_life_lessons_from_the_longest_study_on_happiness", level: 2, titleZh: "什么造就了美好人生", desc: "老教授慢速讲述，句子完整、语气温和，很好跟" },
  { slug: "pamela_meyer_how_to_spot_a_liar", level: 3, titleZh: "如何识破谎言", desc: "话题有趣，条理清晰，举例多，练听力不容易走神" },
  { slug: "jason_fried_why_work_doesn_t_happen_at_work", level: 3, titleZh: "为什么工作做不完", desc: "短演讲，吐槽办公室，语气口语，句子简单实用" },
  { slug: "sherry_turkle_connected_but_alone", level: 4, titleZh: "在一起却各自孤独", desc: "科技与情感话题，用词偏抽象，语速中等偏慢" },
  { slug: "brene_brown_listening_to_shame", level: 4, titleZh: "倾听羞耻", desc: "情感类演讲，口语化但有停顿和情绪，语速不稳，偏难" },
  { slug: "jamie_oliver_teach_every_child_about_food", level: 2, titleZh: "教每个孩子认识食物", desc: "厨师演讲，热情、用词简单具体，配画面很好懂" },
  { slug: "dan_ariely_are_we_in_control_of_our_own_decisions", level: 3, titleZh: "我们真能掌控自己的决定吗", desc: "行为经济学，做实验讲道理，逻辑清楚，例子好玩" },
  // —— 第三批：短篇（当"教学切片"练，几分钟就能听完一篇） ——
  { slug: "elizabeth_gilbert_success_failure_and_the_drive_to_keep_creating", level: 3, titleZh: "成功、失败与继续创作的动力", desc: "作家讲创作焦虑，语气真诚、句子精炼，7分钟能听完" },
  { slug: "steven_addis_a_father_daughter_bond_one_last_conversation", level: 2, titleZh: "父女的最后一次对话", desc: "只有5分钟，讲照片和亲情，语速慢、用词简单" },
  { slug: "james_veitch_this_is_what_happens_when_you_reply_to_spam_email", level: 3, titleZh: "回复垃圾邮件会发生什么", desc: "搞笑演讲，对话多、口语化，练日常表达很合适" },
  { slug: "jane_chen_a_warm_embrace_that_saves_lives", level: 2, titleZh: "一个温暖的拥抱能救命", desc: "讲保温婴儿睡袋，内容直观、语速不快，5分钟左右" },
  { slug: "marco_tempest_the_electric_rise_and_fall_of_nikola_tesla", level: 3, titleZh: "特斯拉的电流人生", desc: "边演示边讲，画面辅助多，故事好懂" },
  { slug: "keith_barry_brain_magic", level: 3, titleZh: "大脑魔术", desc: "魔术师讲注意力，互动多、句子短，听起来轻松" },
  { slug: "kelly_mcgonigal_how_to_make_stress_your_friend", level: 3, titleZh: "让压力成为朋友", desc: "心理学科普，说理清楚，用词规范，适合精听" },
  { slug: "guy_winch_the_case_for_emotional_first_aid", level: 3, titleZh: "为什么我们需要情绪急救", desc: "心理话题，举例生活化，逻辑清楚，语速中等" },
  { slug: "tom_thum_the_orchestra_in_my_mouth", level: 4, titleZh: "我嘴里的交响乐", desc: "口技表演为主，人声节奏快，当听力挑战练" },
  { slug: "david_gallo_shark_attack_and_humility", level: 2, titleZh: "鲨鱼袭击与谦逊", desc: "4分钟短篇，讲得慢而清楚，入门很合适" },
];

// 把 cue 碎片按句号/问号/叹号聚合成完整句子，方便逐句循环和翻译
function groupSentences(cues, talkDurationMs) {
  const sentences = [];
  let bufText = "";
  let bufStart = null;
  const flush = (endTime) => {
    const text = bufText.replace(/\s+/g, " ").trim();
    if (text && bufStart !== null) {
      sentences.push({ t0: bufStart, t1: Math.round(endTime), text });
    }
    bufText = "";
    bufStart = null;
  };
  for (const cue of cues) {
    const piece = String(cue.text || "").replace(/\n/g, " ").trim();
    if (!piece) continue;
    if (bufStart === null) bufStart = Number(cue.time) || 0;
    bufText += (bufText ? " " : "") + piece;
    // 句末标点 → 结束一句（省略号不算，括号补充不算）
    if (/[.!?]["')\]]?$/.test(piece) && !/\b(e\.g|i\.e|Mr|Mrs|Ms|Dr|St|vs)\.$/i.test(bufText.trim())) {
      flush(Number(cue.time) + 2500);
    }
  }
  if (bufText.trim()) flush(talkDurationMs || (bufStart || 0) + 5000);
  // 修 t1：下一句的 t0 就是上一句的自然结束点
  for (let i = 0; i < sentences.length - 1; i += 1) {
    const next = sentences[i + 1];
    // 若估的结束时间超过下一句开头，截到下一句前 30ms；太短则取下一句开头
    if (sentences[i].t1 > next.t0) sentences[i].t1 = Math.max(next.t0 - 30, sentences[i].t0 + 500);
    if (sentences[i].t1 - sentences[i].t0 < 500) sentences[i].t1 = next.t0;
  }
  return sentences;
}

const index = [];
for (const meta of TALKS) {
  process.stdout.write(`${meta.slug} ... `);
  const res = await fetch(`https://www.ted.com/talks/${meta.slug}`, { headers: { "User-Agent": UA } });
  if (!res.ok) {
    console.log(`HTTP ${res.status}，跳过`);
    continue;
  }
  const html = await res.text();
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) {
    console.log("没找到 __NEXT_DATA__，跳过");
    continue;
  }
  const data = JSON.parse(match[1]);
  const pp = data?.props?.pageProps || {};
  const vd = pp?.videoData?.videoPlayerData || {};
  const paragraphs = pp?.transcriptData?.translation?.paragraphs || [];
  const cues = paragraphs.flatMap((p) => p?.cues || []);
  if (!cues.length) {
    console.log("没有字幕 cues，跳过");
    continue;
  }
  // TED 的 duration 字段是秒；cue 的 time 是毫秒。统一成毫秒用。
  const rawDuration = Number(vd.duration) || 0;
  const durationMs = rawDuration > 0 && rawDuration < 3600 ? rawDuration * 1000 : rawDuration;
  const mp4 =
    html
      .match(/https:\/\/py\.tedcdn\.com\/[^"\\]+\.mp4/)?.[0]
      ?.replace(/\\u0026/g, "&") || "";
  const hls = String(
    html.match(/https:\/\/hls\.ted\.com\/project_masters\/\d+\/manifest\.m3u8[^"\\]*/)?.[0] || "",
  ).replace(/\\u0026/g, "&");
  const sentences = groupSentences(cues, durationMs);
  const totalWords = sentences.reduce((sum, s) => sum + s.text.split(/\s+/).length, 0);
  const minutes = Math.max(1, Math.round((durationMs || sentences.at(-1)?.t1 || 0) / 60000));
  const wpm = Math.round(totalWords / Math.max(1, (durationMs || sentences.at(-1)?.t1 || 60000) / 60000));
  const talk = {
    slug: meta.slug,
    title: vd.title || meta.slug,
    titleZh: meta.titleZh,
    speaker: vd.speaker?.name || vd.speaker || "",
    level: meta.level,
    desc: meta.desc,
    duration: durationMs,
    minutes,
    wpm,
    totalWords,
    thumb: vd.thumb || "",
    mp4,
    hls,
    sentences,
  };
  writeFileSync(join(outDir, `${meta.slug}.json`), JSON.stringify(talk, null, 1));
  index.push({
    slug: meta.slug,
    title: talk.title,
    titleZh: talk.titleZh,
    speaker: talk.speaker,
    level: meta.level,
    minutes,
    wpm,
    totalWords,
    desc: meta.desc,
  });
  console.log(`OK ${talk.title} | ${talk.speaker} | ${minutes}分钟 | ${wpm}词/分 | ${sentences.length}句 | mp4:${mp4 ? "有" : "无"}`);
}
index.sort((a, b) => a.level - b.level || a.minutes - b.minutes);
writeFileSync(join(outDir, "index.json"), JSON.stringify(index, null, 1));
console.log(`\n完成：${index.length}/${TALKS.length} 篇，清单已写入 public/ted/index.json`);
