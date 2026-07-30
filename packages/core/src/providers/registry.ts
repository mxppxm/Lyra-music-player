import type { ModelProvider, ProviderId } from "../types";

export class ProviderRegistry {
  private providers = new Map<ProviderId, ModelProvider>();

  register(p: ModelProvider): void {
    this.providers.set(p.id, p);
  }

  get(id: ProviderId): ModelProvider {
    const p = this.providers.get(id);
    if (!p) throw new Error(`provider not registered: ${id}`);
    return p;
  }

  has(id: ProviderId): boolean {
    return this.providers.has(id);
  }

  list(): ProviderId[] {
    return [...this.providers.keys()];
  }
}

export const registry = new ProviderRegistry();
