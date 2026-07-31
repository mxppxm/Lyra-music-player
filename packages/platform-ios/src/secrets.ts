import { Preferences } from "@capacitor/preferences";

export const iosSecrets = {
  async getSecret(key: string): Promise<string | null> {
    const { value } = await Preferences.get({ key });
    return value;
  },
  async setSecret(key: string, value: string): Promise<void> {
    await Preferences.set({ key, value });
  },
  async deleteSecret(key: string): Promise<void> {
    await Preferences.remove({ key });
  },
};
