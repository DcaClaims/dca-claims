'use server';
// Everything a button can do. Each action checks the login (with Authy) first and writes an audit entry.
// Stage A: approving records your decision; nothing is sent.
import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { adminClient, currentStaff } from '@/lib/supabase/server';
import { liveMode } from './view';

async function staffOrThrow() {
  if (!liveMode()) throw new Error('Demo mode: connect the database to use the buttons.');
  const s = await currentStaff();
  if (!s) throw new Error('Not logged in.');
  if (s.role === 'readonly') throw new Error('Read-only accounts cannot change anything.');
  return s;
}

async function audit(actor: string, action: string, entity: string, entityId: string, details: Record<string, unknown> = {}) {
  await adminClient().from('audit_log').insert({ actor, action, entity, entity_id: entityId, details });
}

function must<T>(r: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  if (r.data === null || r.data === undefined) throw new Error(`${what}: not found`);
  return r.data as NonNullable<T>;
}
/** For writes, where no rows come back. */
function ok(r: { error: { message: string } | null }, what: string) {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
}

const done = (path?: string) => {
  revalidatePath('/', 'layout');
  if (path) redirect(path);
};

const payloadHash = (to: string[], subject: string, body: string) =>
  createHash('sha256').update(JSON.stringify({ to: to.map((x) => x.trim().toLowerCase()).sort(), subject, body })).digest('hex');

/** Accept, decline or ask for details on a new lead. Accepting also approves the first reply (sent from Stage C). */
export async function decideLead(form: FormData) {
  const s = await staffOrThrow();
  const claimId = String(form.get('claimId'));
  const decision = String(form.get('decision')) as 'accepted' | 'declined' | 'asked_for_details';
  const db = adminClient();
  const status = decision === 'accepted' ? 'Accepted: awaiting documents' : decision === 'declined' ? 'declined' : 'new_lead';
  ok(await db.from('claims').update({ decision, decided_at: new Date().toISOString(), decided_by: s.id, status }).eq('id', claimId), 'Saving the decision');
  if (decision === 'accepted') {
    const drafts = must(await db.from('drafts').select('*').eq('claim_id', claimId).eq('kind', 'client_first_reply').eq('status', 'draft'), 'Finding the first reply');
    for (const d of drafts ?? []) await approveDraftRow(s.id, d.id);
  }
  await audit(s.id, `lead_${decision}`, 'claim', claimId);
  done(`/cases/${claimId}`);
}

/** Attach a message to a case by hand (from the review queue). */
export async function attachMessage(form: FormData) {
  const s = await staffOrThrow();
  const messageId = String(form.get('messageId'));
  const claimId = String(form.get('claimId'));
  if (!claimId) throw new Error('Choose a case first.');
  const db = adminClient();
  ok(await db.from('message_claims').upsert({ message_id: messageId, claim_id: claimId, matched_by: 'manual', created_by: s.id }), 'Attaching');
  ok(await db.from('messages').update({ reviewed_by: s.id, reviewed_at: new Date().toISOString(), override: null }).eq('id', messageId), 'Marking reviewed');
  await audit(s.id, 'message_attached', 'message', messageId, { claimId });
  done(`/inbox/${messageId}`);
}

/** Mark a message as spam, not about a claim, or a new lead. */
export async function setMessageOverride(form: FormData) {
  const s = await staffOrThrow();
  const messageId = String(form.get('messageId'));
  const override = String(form.get('override'));
  if (!['spam', 'lead', 'unrelated'].includes(override)) throw new Error('Unknown choice.');
  ok(await adminClient().from('messages').update({ override, reviewed_by: s.id, reviewed_at: new Date().toISOString() }).eq('id', messageId), 'Saving');
  await audit(s.id, `message_${override}`, 'message', messageId);
  done(`/inbox/${messageId}`);
}

async function approveDraftRow(userId: string, draftId: string) {
  const db = adminClient();
  const d = must(await db.from('drafts').select('*').eq('id', draftId).single(), 'Finding the draft');
  const c = must(await db.from('claims').select('version').eq('id', d.claim_id).single(), 'Finding the case');
  // Approving means you have read it against the case as it is now: pin the approval to the current version.
  ok(await db.from('approvals').insert({ draft_id: draftId, payload_hash: payloadHash(d.to_addresses, d.subject, d.body), claim_version: c.version, approved_by: userId }), 'Recording the approval');
  ok(await db.from('drafts').update({ status: 'approved', based_on_claim_version: c.version }).eq('id', draftId), 'Updating the draft');
  await audit(userId, 'draft_approved', 'draft', draftId, { claimVersion: c.version, stage: 'A (nothing sent)' });
}

export async function approveDraft(form: FormData) {
  const s = await staffOrThrow();
  await approveDraftRow(s.id, String(form.get('draftId')));
  done('/approvals');
}

/** Save your edit. Every edit is kept beside the original and labelled substantive or stylistic. Any approval lapses. */
export async function editDraft(form: FormData) {
  const s = await staffOrThrow();
  const draftId = String(form.get('draftId'));
  const body = String(form.get('body') ?? '');
  const kind = String(form.get('kind'));
  if (!['substantive', 'stylistic'].includes(kind)) throw new Error('Say whether the change is substantive or stylistic.');
  const db = adminClient();
  const d = must(await db.from('drafts').select('*').eq('id', draftId).single(), 'Finding the draft');
  if (body.trim() && body !== d.body) {
    ok(await db.from('draft_corrections').insert({ draft_id: draftId, before_body: d.body, after_body: body, kind, note: String(form.get('note') ?? '') || null, user_id: s.id }), 'Keeping the original');
    ok(await db.from('drafts').update({ body, status: 'draft' }).eq('id', draftId), 'Saving the edit');
    await db.from('approvals').update({ revoked_at: new Date().toISOString() }).eq('draft_id', draftId).is('revoked_at', null);
    await audit(s.id, 'draft_edited', 'draft', draftId, { kind });
  }
  done('/approvals');
}

export async function discardDraft(form: FormData) {
  const s = await staffOrThrow();
  const draftId = String(form.get('draftId'));
  ok(await adminClient().from('drafts').update({ status: 'discarded' }).eq('id', draftId), 'Discarding');
  await audit(s.id, 'draft_discarded', 'draft', draftId);
  done('/approvals');
}
