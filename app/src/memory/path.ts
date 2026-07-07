import { invoke } from "@tauri-apps/api/core";

export async function getMemoryFilePath(): Promise<string> {
  const dir = await invoke<string>("app_data_dir");
  return `${dir}/memory.md`;
}
