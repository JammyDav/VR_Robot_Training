/** Minimal typed event emitter used by the simulation core. */
export class Emitter<Events extends Record<string, unknown>> {
  private handlers: { [K in keyof Events]?: Array<(e: Events[K]) => void> } = {};

  on<K extends keyof Events>(type: K, fn: (e: Events[K]) => void): () => void {
    (this.handlers[type] ??= []).push(fn);
    return () => {
      const list = this.handlers[type];
      if (list) list.splice(list.indexOf(fn), 1);
    };
  }

  emit<K extends keyof Events>(type: K, e: Events[K]) {
    const list = this.handlers[type];
    if (list) for (const fn of list.slice()) fn(e);
  }
}
