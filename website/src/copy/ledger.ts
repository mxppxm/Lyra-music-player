export const HERO = {
  bigZh: '未成曲调先有情。',
  bigEn: 'Between the things you say.',
  inputPlaceholder: '和我说点什么…',
  inputPlaceholderReturning: '你上次说的那句,我还记着。再说一句吗?',
  inputHint: '我还没能出门,但你可以留一句话给我。',
  bottleReplyMain: '「我这里听不到你。但我会记得——等你打开我那天。」',
  bottleReplyAside: '你说的那句话,已经存在你的浏览器里了。',
  demoCaptionA: '给你的早。',
  demoCaptionB: '我猜你今天想要慢一点。',
} as const;

export const LISTENING = {
  title: 'Say Me, Don’t See Me',
  body: [
    '说吧。你不用看我在哪。',
    '你打开我,我已经想好了给你放什么。',
    '你不说,我也大概知道。',
  ],
} as const;

export const ONE_SONG_ONE_LINE = {
  title: '一首歌,一句话。',
  body: [
    '别人给你歌单。我给你一首。',
    '就一首。听完就结了。',
  ],
  captions: [
    '我猜你今天想要慢一点。',
    '这首放给你,是因为你上次说过风声让你安心。',
  ],
} as const;

export const MEMORY = {
  title: '我记得那晚你在听什么。',
  body: [
    '我的记忆不是黑盒。',
    '是一个你可以打开来读的文件。',
    '你不喜欢的一句,划掉就好——我不会介意。',
  ],
  fileLines: [
    '# 时段:深夜 · 状态:疲惫',
    '→ 慢速古典钢琴 (conf: 0.87, n=9, 2026-07-06)',
    '',
    '# 关键词:风声 · 状态:安心',
    '→ environment ambient (conf: 0.71)',
  ],
  sampleLink: '我的记忆样例 →',
} as const;

export const DREAM = {
  title: '我会做梦。',
  body: [
    '每天凌晨三点十四分。',
    '我把这一天我们说过的话,重新想一遍。',
    '第二天早上,我可能会主动开口——',
    '也可能什么都不说,只是给你换一首歌。',
  ],
} as const;

export const SILENCE = {
  title: '我宁愿沉默,也不放错的歌。',
  body: [
    '你连续三次跳过我给的歌,我会安静三天。',
    '我不是在生气。',
    '我只是需要一点时间,重新听你。',
  ],
} as const;

export const GROWTH = {
  title: '我也在长大。',
  body: [
    '我的性格,每季度改一次底色。',
    '我的代码,每天自己修一遍。',
    '我和你一起在长大——只是我长在你看不见的地方。',
  ],
} as const;

export const FOOTER = {
  tagline: '你若来,我一直都在。',
  early: 'v0.2 · early. 我还没学完话。',
  downloads: {
    mac: '下载 macOS',
    win: '下载 Windows',
    linux: '下载 Linux',
  },
  githubUrl: 'https://github.com/daoyu/lyra',
  releasesUrl: 'https://github.com/daoyu/lyra/releases/latest',
} as const;
