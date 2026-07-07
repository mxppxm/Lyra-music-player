import type {
  ParsedMemory,
  Fact,
  SalientMoment,
  Dream,
  Evolution,
  OurSong,
} from "./types";

export const EMPTY_MEMORY: ParsedMemory = {
  facts: [],
  aversions: [],
  salientMoments: [],
  livingPortrait: { paragraphs: [] },
  dreams: [],
  evolutions: [],
  ourSongs: [],
  raw: "",
};

// Fact line: - #tag1 #tag2 → conclusion (conf: 0.87, n=9, 2026-07-06)
const FACT_RE =
  /^-\s+(#\S+(?:\s+#\S+)*)\s+→\s+(.+?)\s+\(conf:\s+([\d.]+),\s+n=(\d+),\s+(\d{4}-\d{2}-\d{2})\)\s*$/;

function parseFacts(lines: string[]): Fact[] {
  const facts: Fact[] = [];
  for (const line of lines) {
    const m = FACT_RE.exec(line.trimEnd());
    if (!m) continue;
    facts.push({
      tags: m[1].split(/\s+/),
      conclusion: m[2],
      confidence: parseFloat(m[3]),
      n: parseInt(m[4], 10),
      lastVerifiedISO: m[5],
    });
  }
  return facts;
}

// Salient Moment: two-line group
// Line 1: - **YYYY-MM-DDTHH:MM** #tag1 #tag2 (song title is not on this line)
// Line 2:   → narrative《...》...
// The songTitle is extracted from the narrative: first 《...》 span, or empty string
function parseSalientMoments(lines: string[]): SalientMoment[] {
  const moments: SalientMoment[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Header line: - **TIMESTAMP** [tags...]
    const headerMatch = /^-\s+\*\*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})\*\*(.*)$/.exec(
      line
    );
    if (headerMatch) {
      const timestampISO = headerMatch[1];
      const rest = headerMatch[2].trim();
      const tags = rest
        ? rest.split(/\s+/).filter((t) => t.startsWith("#"))
        : [];

      // Next line should be the narrative
      const nextLine = lines[i + 1] ?? "";
      const narrativeMatch = /^\s+→\s+(.+)$/.exec(nextLine);
      if (narrativeMatch) {
        const narrative = narrativeMatch[1].trim();
        // Extract songTitle from first 《...》 in narrative
        const songMatch = /《([^》]+)》/.exec(narrative);
        const songTitle = songMatch ? `《${songMatch[1]}》` : "";
        moments.push({ timestampISO, tags, songTitle, narrative });
        i += 2;
        continue;
      }
    }
    i++;
  }
  return moments;
}

function parseDreams(lines: string[]): Dream[] {
  const dreams: Dream[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const headerMatch = /^-\s+\*\*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})\*\*\s*$/.exec(
      line
    );
    if (headerMatch) {
      const timestampISO = headerMatch[1];
      const nextLine = lines[i + 1] ?? "";
      const narrativeMatch = /^\s+(.+)$/.exec(nextLine);
      if (narrativeMatch) {
        dreams.push({ timestampISO, narrative: narrativeMatch[1].trim() });
        i += 2;
        continue;
      }
    }
    i++;
  }
  return dreams;
}

// Evolution line group:
// - **2026-Q3** novelty_seeking 0.4→0.5 (rollback: evo-2026Q3-a1b2)
//   narrative text
function parseEvolutions(lines: string[]): Evolution[] {
  const evolutions: Evolution[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const headerMatch = /^-\s+\*\*([^*]+)\*\*(.*)$/.exec(line);
    if (headerMatch) {
      const quarter = headerMatch[1].trim();
      const rest = headerMatch[2].trim();
      // Extract optional rollback id
      const rollbackMatch = /\(rollback:\s*([^)]+)\)/.exec(rest);
      const rollbackId = rollbackMatch ? rollbackMatch[1].trim() : undefined;

      const nextLine = lines[i + 1] ?? "";
      const narrativeMatch = /^\s+(.+)$/.exec(nextLine);
      if (narrativeMatch) {
        const evo: Evolution = {
          quarter,
          narrative: narrativeMatch[1].trim(),
        };
        if (rollbackId) evo.rollbackId = rollbackId;
        evolutions.push(evo);
        i += 2;
        continue;
      }
    }
    i++;
  }
  return evolutions;
}

// Our Song: - 《Title》 - Artist → anchor
function parseOurSongs(lines: string[]): OurSong[] {
  const songs: OurSong[] = [];
  for (const line of lines) {
    const m = /^-\s+《([^》]+)》\s+-\s+(.+?)\s+→\s+(.+?)\s*$/.exec(
      line.trimEnd()
    );
    if (!m) continue;
    songs.push({ title: `《${m[1]}》`, artist: m[2], anchor: m[3] });
  }
  return songs;
}

export function parseMemoryMd(content: string): ParsedMemory {
  if (!content.trim()) {
    return { ...EMPTY_MEMORY, raw: content };
  }

  // Split on section headings (## ...) keeping delimiter info
  // We'll split by lines and group by "## " headings
  const lines = content.split("\n");
  const sections: Record<string, string[]> = {};
  let currentSection = "";

  for (const line of lines) {
    if (line.startsWith("## ")) {
      currentSection = line.slice(3).trim();
      sections[currentSection] = [];
    } else if (currentSection) {
      sections[currentSection].push(line);
    }
  }

  // Trim trailing empty lines from each section
  const sectionLines = (name: string): string[] => {
    const arr = sections[name] ?? [];
    // Remove leading/trailing blank lines
    let start = 0;
    let end = arr.length;
    while (start < end && arr[start].trim() === "") start++;
    while (end > start && arr[end - 1].trim() === "") end--;
    return arr.slice(start, end);
  };

  // Living portrait: join non-empty paragraphs separated by blank lines
  const portraitLines = sectionLines("Living Portrait");
  const paragraphs: string[] = [];
  let current: string[] = [];
  for (const l of portraitLines) {
    if (l.trim() === "") {
      if (current.length) {
        paragraphs.push(current.join("\n"));
        current = [];
      }
    } else {
      current.push(l);
    }
  }
  if (current.length) paragraphs.push(current.join("\n"));

  return {
    facts: parseFacts(sectionLines("Facts (Conditional Preferences)")),
    aversions: parseFacts(sectionLines("Aversions")),
    salientMoments: parseSalientMoments(
      sections["Salient Moments"] ?? []
    ),
    livingPortrait: { paragraphs },
    dreams: parseDreams(sections["Dreams"] ?? []),
    evolutions: parseEvolutions(sections["Evolutions"] ?? []),
    ourSongs: parseOurSongs(sectionLines("Our Songs")),
    raw: content,
  };
}
