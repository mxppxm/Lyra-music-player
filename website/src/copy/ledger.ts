export const HERO = {
  bigZh: '未成曲调先有情。',
  bigEn: 'Between the things you say.',
  inputPlaceholder: '和 Lyra 说点什么…',
  inputPlaceholderReturning: '你上次说的那句,她还记着。再说一句吗?',
  inputHint: '她还没能出门,但你可以留一句话给她。',
  bottleReplyMain: '「她这里听不到你。但她会记得——等你打开她那天。」',
  bottleReplyAside: '你说的那句话,已经存在你的浏览器里了。',
  demoCaptionA: '给你的早。',
  demoCaptionB: '我猜你今天想要慢一点。',
} as const;

export const LISTENING = {
  title: '她在听。',
  body: [
    '你打开她,她已经想好了给你放什么。',
    '你不说,她也大概知道。',
  ],
} as const;

export const ONE_SONG_ONE_LINE = {
  title: '一首歌,一句话。',
  body: [
    '别的 app 给你歌单。她给你一首。',
    '就一首。听完就结了。',
  ],
  captions: [
    '我猜你今天想要慢一点。',
    '这首放给你,是因为你上次说过风声让你安心。',
  ],
} as const;

export const MEMORY = {
  title: '她记得那晚你在听什么。',
  body: [
    '她的记忆不是黑盒。',
    '是一个你可以打开来读的文件。',
    '你不喜欢的一句,划掉就好。',
  ],
  fileLines: [
    '# 时段:深夜 · 状态:疲惫',
    '→ 慢速古典钢琴 (conf: 0.87, n=9, 2026-07-06)',
    '',
    '# 关键词:风声 · 状态:安心',
    '→ environment ambient (conf: 0.71)',
  ],
  sampleLink: '她的记忆样例 →',
} as const;

export const DREAM = {
  title: '她会做梦。',
  body: [
    '每天凌晨三点十四分。',
    '她把这一天你们说过的话,重新想一遍。',
    '第二天早上,她可能会主动开口——',
    '也可能什么都不说,只是给你换一首歌。',
  ],
} as const;

export const SILENCE = {
  title: '她宁愿沉默,也不放错的歌。',
  body: [
    '你连续三次跳过她给的歌,她会安静三天。',
    '她不发牢骚,她只是暂时不说话。',
  ],
} as const;

export const GROWTH = {
  title: '她也在长大。',
  body: [
    '她的性格,每季度改一次底色。',
    '她的代码,每天自己修一遍。',
    '她和你一起在长大——只是她长在你看不见的地方。',
  ],
} as const;

export const FOOTER = {
  tagline: '你若来,她一直都在。',
  early: 'v0.2 · early. 她还没学完话。',
  downloads: {
    mac: '下载 macOS',
    win: '下载 Windows',
    linux: '下载 Linux',
  },
  githubUrl: 'https://github.com/daoyu/lyra',
  releasesUrl: 'https://github.com/daoyu/lyra/releases/latest',
} as const;
