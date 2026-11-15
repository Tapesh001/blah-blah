import type { EventBus, GameEvents } from '@contracts';
export class TypedEventBus implements EventBus {
  private listeners = new Map<
    keyof GameEvents,
    Set<(payload: never) => void>
  >();
  on<K extends keyof GameEvents>(
    event: K,
    handler: (payload: GameEvents[K]) => void,
  ): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    const listener = handler as (payload: never) => void;
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }
  emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void {
    for (const handler of [...(this.listeners.get(event) ?? [])])
      handler(payload as never);
  }
  clear(): void {
    this.listeners.clear();
  }
}
