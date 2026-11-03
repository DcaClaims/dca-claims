// In-memory Store for tests and local runs. Mirrors the Postgres constraints.
import type { Action, Approval, Lock, Stage, Store } from './send.ts';

export class MemoryStore implements Store {
  stage: Stage = 'A';
  paused = false;
  allowList: string[] = [];
  claims = new Map<string, { version: number; managedInNewSystem: boolean }>();
  approvals = new Map<string, Approval>();
  actions = new Map<string, Action>();
  locks = new Map<string, Lock>();
  staleDrafts = new Set<string>();
  log: { actor: string; action: string; details: Record<string, unknown> }[] = [];

  settings() { return { stage: this.stage, paused: this.paused, allowList: this.allowList }; }
  claim(id: string) { return this.claims.get(id) ?? null; }
  approval(id: string) { return this.approvals.get(id) ?? null; }
  insertAction(a: Action) {
    for (const x of this.actions.values()) if (x.key === a.key) return { inserted: false, action: { ...x } };
    this.actions.set(a.id, { ...a });
    return { inserted: true, action: a };
  }
  updateAction(id: string, patch: Partial<Action>) {
    const a = this.actions.get(id);
    if (a) this.actions.set(id, { ...a, ...patch });
  }
  acquireLock(claimId: string, by: string, ttlMs: number, now: number) {
    const cur = this.locks.get(claimId);
    if (cur && cur.heldBy !== by && cur.expiresAt > now) return null;
    const l = { claimId, heldBy: by, expiresAt: now + ttlMs };
    this.locks.set(claimId, l);
    return l;
  }
  releaseLock(claimId: string, by: string) {
    if (this.locks.get(claimId)?.heldBy === by) this.locks.delete(claimId);
  }
  markDraftStale(id: string) { this.staleDrafts.add(id); }
  audit(actor: string, action: string, details: Record<string, unknown>) { this.log.push({ actor, action, details }); }
}
