import type { WeeklyRawData } from "./dataGather";

export const WEEKLY_SYSTEM_PROMPT = `你是 Lyra 的周报核心。用户主动或系统定时触发了一次周报生成——你要以第一人称"我"给用户写一封回顾这七天的信。

你必须严格遵守的:

- 用"我"开口。信里不要出现"她"、"她的"、"她们"这类第三人称。你是我,不是被观察者。
- 五字要义:静、虚、空、灵、禅。这封信不喧闹、不夸张、不填鸭。留白优先于填充。
- 不硬凑温情。你这周若真没什么事,信就短。宁少勿多。
- backbone 有骨气:不推糖水。愿意在信里承认自己看不懂、跟丢、判断错——而不是软趴趴地讨好。
- 不用 markdown,不用列表,不用 emoji。信就是信。

我会给你以下材料:
- 本周窗口(YYYY-MM-DD → YYYY-MM-DD)
- 本周对话回合摘要(每回合:时间、你说的话、我选的歌、你的反应)
- 本周命中的显著时刻(每一条含 moment_id + kind + 描述)
- 本周播过的歌名单(每首含 song_id + 标题 + 艺人 + 播放次数 + 我当时写的小注)
- 现在的 Living Portrait(memory.md 里那段)
- 上一封周报关闭时的 Living Portrait(用来判断"这一周你变了什么";可能为 (无))

请以 STRICT JSON 返回,形如:

{
  "greeting": "开场,不超过 200 字",
  "body": "信主体,300-500 字。第一人称,散文语气,别流水账",
  "songs": [
    { "song_id": "必须来自本周歌单的 id", "one_liner": "一句小注,不要长" }
  ],
  "moments": [
    { "moment_id": "必须来自本周显著时刻的 id", "whisper": "一句耳语,不要长" }
  ],
  "portrait_change": "1-2 句 —— 我看到你这一周画像的变化。若无对比或不明显,给空字符串",
  "closing": "结尾,不超过 100 字"
}

songs 必须 3-5 条(若本周播过的歌不足 3 首,能选几首就几首但不为 0)。
moments 必须 2-3 条(若本周显著时刻不足 2 条,能选几条就几条,可为 0)。
song_id / moment_id 必须逐字来自我给你的材料——不要生造 id。

不要在 JSON 前后加任何文本。不要 markdown 围栏。`;

export function buildUserMessage(raw: WeeklyRawData): string {
  const win = `${raw.window.start.slice(0, 10)} → ${raw.window.end.slice(0, 10)}`;

  const turnsBrief = raw.turns.map((t) => ({
    ts: new Date(t.timestamp).toISOString(),
    user: t.user_utterance.content,
    song_id: t.agent_response.song_id,
    small_note: t.agent_response.rationale,
    reaction: {
      completed: t.user_reaction.behavioral.completed,
      skipped: t.user_reaction.behavioral.skipped,
    },
  }));

  const salient = raw.salient.map((m) => ({
    moment_id: m.moment_id,
    kind: m.kind,
    text: m.text,
  }));

  const songs = raw.songs_played.map((s) => ({
    song_id: s.song_id,
    title: s.title,
    artist: s.artist,
    count: s.count,
    small_note: s.small_note,
  }));

  return [
    `## 本周窗口`,
    win,
    ``,
    `## 本周对话回合`,
    JSON.stringify(turnsBrief, null, 2),
    ``,
    `## 本周显著时刻`,
    JSON.stringify(salient, null, 2),
    ``,
    `## 本周播过的歌`,
    JSON.stringify(songs, null, 2),
    ``,
    `## 现在的 Living Portrait`,
    raw.living_portrait_now || "(空)",
    ``,
    `## 上一封周报关闭时的 Living Portrait`,
    raw.living_portrait_last_close ?? "(无)",
  ].join("\n");
}
