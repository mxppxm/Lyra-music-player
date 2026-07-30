import { getLyraPlatform } from "@lyra/platform";

export async function readMemoryFile(): Promise<string> {
  return (await getLyraPlatform().readTextFile("memory.md")) ?? "";
}

export async function writeMemoryFile(content: string): Promise<void> {
  await getLyraPlatform().writeTextFile("memory.md", content);
}
