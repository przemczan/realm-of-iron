// =====================================================================
// EventBus.js — tiny pub/sub. Lets systems announce things
// ("game:over", "status", "floatText") without knowing who listens.
// Keeps gameplay code decoupled from UI and screen flow.
// =====================================================================

export class EventBus {
  constructor() {
    this._listeners = new Map();
  }

  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(fn);
    return () => this.off(event, fn); // unsubscribe handle
  }

  off(event, fn) {
    this._listeners.get(event)?.delete(fn);
  }

  emit(event, payload) {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const fn of [...set]) fn(payload);
  }

  clear() {
    this._listeners.clear();
  }
}
