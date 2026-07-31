import { Filesystem, Directory } from "@capacitor/filesystem";

export const iosFiles = {
  async appDataDir(): Promise<string> {
    return "lyra";
  },
  async readFeatureCache(): Promise<Record<string, unknown>> {
    try {
      const file = await Filesystem.readFile({
        path: "lyra-audio-features.json",
        directory: Directory.Data,
      });
      return JSON.parse(file.data as string);
    } catch {
      return {};
    }
  },
  async writeFeatureCache(content: Record<string, unknown>): Promise<void> {
    await Filesystem.writeFile({
      path: "lyra-audio-features.json",
      data: JSON.stringify(content, null, 2),
      directory: Directory.Data,
    });
  },
  async readTextFile(relativePath: string): Promise<string | null> {
    try {
      const file = await Filesystem.readFile({
        path: relativePath,
        directory: Directory.Data,
      });
      return file.data as string;
    } catch {
      return null;
    }
  },
  async writeTextFile(relativePath: string, content: string): Promise<void> {
    await Filesystem.writeFile({
      path: relativePath,
      data: content,
      directory: Directory.Data,
    });
  },
};
