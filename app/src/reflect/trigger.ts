import { parseMemoryMd, EMPTY_MEMORY } from "../memory/parser";
import { serializeMemoryMd } from "../memory/writer";
import { readMemoryFile, writeMemoryFile } from "../memory/fileIO";
import { listRecentTurns } from "../db/repo/turnRepo";
import { ReflectAgent } from "./ReflectAgent";
import { applyReflectResult } from "./apply";

export async function reflectNow(): Promise<{
  appliedFacts: number;
  dreamAdded: boolean;
}> {
  // 1. Read memory file
  const raw = await readMemoryFile();

  // 2. Parse — empty string yields EMPTY_MEMORY
  const currentMemory = raw.trim() ? parseMemoryMd(raw) : { ...EMPTY_MEMORY, raw };

  // 3. Fetch recent turns
  const recentTurns = await listRecentTurns(30);

  // 4. Run ReflectAgent
  const todayISO = new Date().toISOString().slice(0, 10);
  const agent = new ReflectAgent();
  const result = await agent.run({ recentTurns, currentMemory, todayISO });

  // 5. Apply result
  const updatedMemory = applyReflectResult(currentMemory, result, todayISO);

  // 6. Serialize
  const newContent = serializeMemoryMd(updatedMemory);

  // 7. Write file
  await writeMemoryFile(newContent);

  // 8. Return stats
  return {
    appliedFacts: result.factMutations.length,
    dreamAdded: true,
  };
}
