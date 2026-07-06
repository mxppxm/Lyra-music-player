import { invoke } from "@tauri-apps/api/core";

export async function playFile(path: string): Promise<void> {
  await invoke("audio_play", { path });
}

export async function stopPlayback(): Promise<void> {
  await invoke("audio_stop");
}

export async function isPlaying(): Promise<boolean> {
  return await invoke<boolean>("audio_is_playing");
}
