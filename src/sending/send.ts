// Everything that leaves DCA goes through `send`. It enforces, in order:
//   global pause → sending stage (A draft-only, B test allow-list, C live trial ownership) → exact approval
//   → approval not stale → one sender per case → the send log's duplicate key.
// A send whose result is unknown is marked "uncertain" and is never retried automatically.

import { createHash, randomUUID } from 'node:crypto';

export type Stage = 'A' | 'B' | 'C';

export type Payload = {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  attachments?: string[]; // document ids
  then?: string;          // what happens next, e.g. "status: Filed"
};

export type Approval = { id: string; draftId: string; payloadHash: string; claimVersion: number; approvedBy: string; revoked?: boolean };

export type ActionState = 'pending' | 'sending' | 'sent' | 'uncertain' | 'failed' | 'cancelled';
export type Action = {
  id: string;
  key: string;
  claimId: string | null;
  actionType: string;
  payloadHash: string;
  approvalId: string | null;
  state: ActionState;
  rfcMessageId: string;
  providerRef?: string;
  lastError?: string;
};

export type Lock = { claimId: string; heldBy: string; expiresAt: number };

/** Storage. The Postgres version uses the unique key on outbound_actions and a row in case_locks. */
export interface Store {
  settings(): { stage: Stage; paused: boolean; allowList: string[] };
  claim(id: string): { version: number; managedInNewSystem: boolean } | null;
  approval(id: string): Approval | null;
  /** Insert if the key is new; otherwise return the existing action. Must be atomic. */
  insertAction(a: Action): { inserted: boolean; action: Action };
  updateAction(id: string, patch: Partial<Action>): void;
  /** Take the case lock if free, expired, or already ours. Must be atomic. */
  acquireLock(claimId: string, by: string, ttlMs: number, now: number): Lock | null;
  releaseLock(claimId: string, by: string): void;
  markDraftStale(draftId: string): void;
  audit(actor: string, action: string, details: Record<string, unknown>): void;
}

export type TransportResult = { ok: true; providerRef: string } | { ok: false; definite: true; error: string };
export interface Transport {
  /** Must use the given Message-ID header so the message can be found in Sent later. May throw on timeout. */
  send(p: Payload, rfcMessageId: string): Promise<TransportResult>;
  /** Looks in the Sent folder for a message with this Message-ID. */
  findSent(rfcMessageId: string): Promise<boolean>;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const addrs = (a?: string[]) => (a ?? []).map((x) => x.trim().toLowerCase()).sort();

/** Hash of exactly what is approved: recipients, text, attachments and the follow-up step. */
export function payloadHash(p: Payload): string {
  return sha(JSON.stringify({
    to: addrs(p.to), cc: addrs(p.cc), bcc: addrs(p.bcc), subject: p.subject, body: p.body,
    attachments: [...(p.attachments ?? [])].sort(), then: p.then ?? null,
  }));
}

/**
 * The duplicate key. For approved messages it is tied to the approval and its exact content.
 * For scheduled actions (reminders) pass `occurrence`, e.g. the due date, so each reminder can go once.
 */
export function actionKey(claimId: string | null, actionType: string, hash: string, occurrence?: string): string {
  return sha([claimId ?? '-', actionType, occurrence ?? hash].join('|'));
}

export type SendRequest = {
  claimId: string | null;
  actionType: string;
  payload: Payload;
  approvalId: string | null;   // required for anything except approved automatic actions
  draftId?: string;
  actor: string;               // user id or automation name
  occurrence?: string;
  domain: string;              // e.g. dcaclaims.com, for Message-IDs
  now?: number;
};

export type SendOutcome =
  | { status: 'sent'; action: Action }
  | { status: 'uncertain'; action: Action }
  | { status: 'failed'; action: Action; error: string }
  | { status: 'refused'; reason:
      | 'paused' | 'draft_only_stage' | 'recipient_not_allowed' | 'case_not_in_trial'
      | 'no_approval' | 'approval_mismatch' | 'stale' | 'locked_by_other'
      | 'already_sent' | 'in_doubt' | 'unknown_claim'; detail?: string };

const LOCK_TTL = 5 * 60_000;

export async function send(store: Store, transport: Transport, req: SendRequest): Promise<SendOutcome> {
  const now = req.now ?? Date.now();
  const s = store.settings();
  const refuse = (reason: Extract<SendOutcome, { status: 'refused' }>['reason'], detail?: string): SendOutcome => {
    store.audit(req.actor, 'send_refused', { reason, detail, claimId: req.claimId, actionType: req.actionType });
    return { status: 'refused', reason, detail };
  };

  // 1. Global pause.
  if (s.paused) return refuse('paused');

  // 2. Stage.
  const recipients = [...addrs(req.payload.to), ...addrs(req.payload.cc), ...addrs(req.payload.bcc)];
  if (s.stage === 'A') return refuse('draft_only_stage');
  if (s.stage === 'B') {
    const allow = new Set(s.allowList.map((x) => x.trim().toLowerCase()));
    const bad = recipients.filter((r) => !allow.has(r));
    if (bad.length) return refuse('recipient_not_allowed', bad.join(', '));
  }
  const claim = req.claimId ? store.claim(req.claimId) : null;
  if (req.claimId && !claim) return refuse('unknown_claim');
  if (s.stage === 'C' && claim && !claim.managedInNewSystem) return refuse('case_not_in_trial');

  // 3. Exact approval, not stale.
  const hash = payloadHash(req.payload);
  if (!req.approvalId) return refuse('no_approval');
  const appr = store.approval(req.approvalId);
  if (!appr || appr.revoked) return refuse('no_approval');
  if (appr.payloadHash !== hash) return refuse('approval_mismatch', 'the message changed after it was approved');
  if (claim && appr.claimVersion !== claim.version) {
    if (req.draftId) store.markDraftStale(req.draftId);
    return refuse('stale', `case changed since approval (v${appr.claimVersion} → v${claim.version})`);
  }

  // 4. One sender per case. Each attempt has its own lock token, so even the same person double-clicking
  //    cannot have two sends in flight on one case.
  const lockToken = `${req.actor}#${randomUUID()}`;
  if (req.claimId) {
    const lock = store.acquireLock(req.claimId, lockToken, LOCK_TTL, now);
    if (!lock) return refuse('locked_by_other', 'another reply on this case is being sent');
  }
  try {
    // 5. Send log: the unique key is the duplicate control.
    const key = actionKey(req.claimId, req.actionType, hash, req.occurrence);
    const fresh: Action = {
      id: randomUUID(), key, claimId: req.claimId, actionType: req.actionType, payloadHash: hash,
      approvalId: req.approvalId, state: 'sending', rfcMessageId: `<${randomUUID()}@${req.domain}>`,
    };
    const { inserted, action: existing } = store.insertAction(fresh);
    let action = inserted ? fresh : existing;
    if (!inserted) {
      if (existing.state === 'sent') return refuse('already_sent');
      if (existing.state === 'sending' || existing.state === 'uncertain' || existing.state === 'pending') return refuse('in_doubt', 'a previous attempt may have gone; check before retrying');
      if (existing.state === 'cancelled') return refuse('no_approval', 'this action was cancelled');
      // 'failed' was a definite rejection: a person may try again with the same key and Message-ID.
      store.updateAction(existing.id, { state: 'sending', lastError: undefined });
      action = { ...existing, state: 'sending' };
    }

    // Last check: someone may have pressed pause while we were getting here.
    if (store.settings().paused) {
      store.updateAction(action.id, { state: 'failed', lastError: 'paused before sending' });
      return refuse('paused');
    }

    let result: TransportResult;
    try {
      result = await transport.send(req.payload, action.rfcMessageId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      store.updateAction(action.id, { state: 'uncertain', lastError: msg });
      store.audit(req.actor, 'send_uncertain', { actionId: action.id, error: msg });
      return { status: 'uncertain', action: { ...action, state: 'uncertain', lastError: msg } };
    }
    if (result.ok) {
      store.updateAction(action.id, { state: 'sent', providerRef: result.providerRef });
      store.audit(req.actor, 'sent', { actionId: action.id, claimId: req.claimId, actionType: req.actionType, rfcMessageId: action.rfcMessageId });
      return { status: 'sent', action: { ...action, state: 'sent', providerRef: result.providerRef } };
    }
    store.updateAction(action.id, { state: 'failed', lastError: result.error });
    store.audit(req.actor, 'send_failed', { actionId: action.id, error: result.error });
    return { status: 'failed', action: { ...action, state: 'failed', lastError: result.error }, error: result.error };
  } finally {
    if (req.claimId) store.releaseLock(req.claimId, lockToken);
  }
}

/** For an "uncertain" send: look in the Sent folder. Found → sent. Not found → stays uncertain for a person to decide. */
export async function reconcile(store: Store, transport: Transport, action: Action, actor: string): Promise<'sent' | 'still_uncertain'> {
  if (action.state !== 'uncertain') throw new Error('only uncertain sends are reconciled');
  if (await transport.findSent(action.rfcMessageId)) {
    store.updateAction(action.id, { state: 'sent', lastError: undefined });
    store.audit(actor, 'reconciled_sent', { actionId: action.id });
    return 'sent';
  }
  store.audit(actor, 'reconcile_not_found', { actionId: action.id });
  return 'still_uncertain';
}

/** A person decides an uncertain send did NOT go out; only then can it be retried. */
export function resolveUncertainAsNotSent(store: Store, action: Action, user: string) {
  store.updateAction(action.id, { state: 'failed', lastError: `confirmed not sent by ${user}` });
  store.audit(user, 'resolved_not_sent', { actionId: action.id });
}
