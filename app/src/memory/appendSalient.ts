import type { SalientMoment } from "./types";
import { readMemoryFile, writeMemoryFile } from "./fileIO";
import { parseMemoryMd } from "./parser";
import { serializeMemoryMd } from "./writer";

/**
 * Read memory.md → parse → append moment to salientMoments → serialize → write back.
 * Falls back to an empty parsed memory if the file is missing or empty.
 */
export async function appendSalientMomentToMemoryMd(moment: SalientMoment): Promise<void> {
  let content: string;
  try {
    content = await readMemoryFile();
  } catch {
    content = "";
  }

  const parsed = parseMemoryMd(content);
  parsed.salientMoments.push(moment);
  const updated = serializeMemoryMd(parsed);
  await writeMemoryFile(updated);
}
