export type Fact = {
  tags: string[];
  conclusion: string;
  confidence: number;
  n: number;
  lastVerifiedISO: string;
  archived?: boolean;
};

export type SalientMoment = {
  timestampISO: string;
  tags: string[];
  songTitle: string;
  narrative: string;
};

export type LivingPortrait = {
  paragraphs: string[];
};

export type Dream = {
  timestampISO: string;
  narrative: string;
};

export type Evolution = {
  quarter: string;
  narrative: string;
  rollbackId?: string;
};

export type OurSong = {
  title: string;
  artist: string;
  anchor: string;
};

export type ParsedMemory = {
  facts: Fact[];
  aversions: Fact[];
  salientMoments: SalientMoment[];
  livingPortrait: LivingPortrait;
  dreams: Dream[];
  evolutions: Evolution[];
  ourSongs: OurSong[];
  raw: string;
};
