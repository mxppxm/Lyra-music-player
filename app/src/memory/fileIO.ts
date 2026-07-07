import { invoke } from "@tauri-apps/api/core";

export async function readMemoryFile(): Promise<string> {
  return invoke<string>("memory_file_read");
}

export async function writeMemoryFile(content: string): Promise<void> {
  return invoke<void>("memory_file_write", { content });
}
