import { test } from 'node:test';
import assert from 'node:assert/strict';
import { payloadHash, reconcile, resolveUncertainAsNotSent, send, type Payload, type SendRequest, type Transport } from './send.ts';
import { MemoryStore } from './memoryStore.ts';

const payload: Payload = { to: ['test1@dca-test.example'], subject: 'Re: your claim', body: 'Dear Samuel, …', then: 'status: Awaiting airline' };

function setup(stage: 'A' | 'B' | 'C' = 'B') {
  const store = new MemoryStore();
  store.stage = stage;
  store.allowList = ['test1@dca-test.example', 'test2@dca-test.example'];
  store.claims.set('c1', { version: 3, managedInNewSystem: false });
  store.approvals.set('ap1', { id: 'ap1', draftId: 'd1', payloadHash: payloadHash(payload), claimVersion: 3, approvedBy: 'aaron' });
  const sent: string[] = [];
  const transport: Transport & { mode: 'ok' | 'timeout' | 'reject' } = {
    mode: 'ok',
    async send(_p, id) {
      if (this.mode === 'timeout') { sent.push(id); throw new Error('ETIMEDOUT'); } // it may have gone!
      if (this.mode === 'reject') return { ok: false, definite: true, error: '550 mailbox unavailable' };
      sent.push(id);
      return { ok: true, providerRef: `prov-${sent.length}` };
    },
    async findSent(id) { return sent.includes(id); },
  };
  const req = (over: Partial<SendRequest> = {}): SendRequest => ({
    claimId: 'c1', actionType: 'reply', payload, approvalId: 'ap1', draftId: 'd1', actor: 'aaron', domain: 'dcaclaims.com', ...over,
  });
  return { store, transport, req, sent };
}

test('Stage A sends nothing at all', async () => {
  const { store, transport, req, sent } = setup('A');
  const r = await send(store, transport, req());
  assert.deepEqual(r, { status: 'refused', reason: 'draft_only_stage', detail: undefined });
  assert.equal(sent.length, 0);
});

test('Stage B sends only to the allow-list, checking cc and bcc too', async () => {
  const { store, transport, req, sent } = setup('B');
  const ok = await send(store, transport, req());
  assert.equal(ok.status, 'sent');
  const p2: Payload = { ...payload, bcc: ['reviews@trustpilot.example'] };
  store.approvals.set('ap2', { id: 'ap2', draftId: 'd2', payloadHash: payloadHash(p2), claimVersion: 3, approvedBy: 'aaron' });
  const bad = await send(store, transport, req({ payload: p2, approvalId: 'ap2' }));
  assert.equal(bad.status, 'refused');
  assert.equal(bad.status === 'refused' && bad.reason, 'recipient_not_allowed');
  assert.equal(sent.length, 1);
});

test('Stage C sends only on cases ticked as managed in the new system', async () => {
  const { store, transport, req } = setup('C');
  const r = await send(store, transport, req());
  assert.equal(r.status === 'refused' && r.reason, 'case_not_in_trial');
  store.claims.set('c1', { version: 3, managedInNewSystem: true });
  assert.equal((await send(store, transport, req())).status, 'sent');
});

test('nothing goes out while paused', async () => {
  const { store, transport, req, sent } = setup('B');
  store.paused = true;
  const r = await send(store, transport, req());
  assert.equal(r.status === 'refused' && r.reason, 'paused');
  assert.equal(sent.length, 0);
});

test('the same approved message cannot be sent twice (double click, retry)', async () => {
  const { store, transport, req, sent } = setup('B');
  const [a, b] = await Promise.all([send(store, transport, req()), send(store, transport, req())]);
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, ['refused', 'sent']);
  const again = await send(store, transport, req());
  assert.equal(again.status === 'refused' && again.reason, 'already_sent');
  assert.equal(sent.length, 1);
});

test('a message edited after approval needs a fresh approval', async () => {
  const { store, transport, req } = setup('B');
  const r = await send(store, transport, req({ payload: { ...payload, body: 'Dear Samuel, Lufthansa will pay €1,200.' } }));
  assert.equal(r.status === 'refused' && r.reason, 'approval_mismatch');
});

test('a change to the case after approval (new airline reply) makes the draft stale', async () => {
  const { store, transport, req } = setup('B');
  store.claims.set('c1', { version: 4, managedInNewSystem: false });
  const r = await send(store, transport, req());
  assert.equal(r.status === 'refused' && r.reason, 'stale');
  assert.ok(store.staleDrafts.has('d1'));
});

test('a second sender on the same case is blocked while the first holds it', async () => {
  const { store, transport, req } = setup('B');
  store.acquireLock('c1', 'caseworker-2', 60_000, Date.now());
  const r = await send(store, transport, req());
  assert.equal(r.status === 'refused' && r.reason, 'locked_by_other');
  store.releaseLock('c1', 'caseworker-2');
  assert.equal((await send(store, transport, req())).status, 'sent');
});

test('a timeout is "uncertain", never retried automatically; Sent-folder check resolves it', async () => {
  const { store, transport, req, sent } = setup('B');
  transport.mode = 'timeout';
  const r = await send(store, transport, req());
  assert.equal(r.status, 'uncertain');
  transport.mode = 'ok';
  const retry = await send(store, transport, req());
  assert.equal(retry.status === 'refused' && retry.reason, 'in_doubt');
  assert.equal(sent.length, 1);
  const action = [...store.actions.values()][0];
  assert.equal(await reconcile(store, transport, action, 'aaron'), 'sent');
  assert.equal(store.actions.get(action.id)!.state, 'sent');
});

test('an uncertain send not found in Sent stays uncertain until a person decides', async () => {
  const { store, transport, req, sent } = setup('B');
  transport.findSent = async () => false;
  transport.mode = 'timeout';
  await send(store, transport, req());
  const action = [...store.actions.values()][0];
  assert.equal(await reconcile(store, transport, { ...action, state: 'uncertain' }, 'aaron'), 'still_uncertain');
  resolveUncertainAsNotSent(store, action, 'aaron');
  transport.mode = 'ok';
  const r = await send(store, transport, req());
  assert.equal(r.status, 'sent');
  // The retry uses the same Message-ID, so even if the first did arrive, the recipient's mail client sees one message.
  assert.equal(sent[0], sent[1]);
});

test('a definite rejection can be retried by a person', async () => {
  const { store, transport, req } = setup('B');
  transport.mode = 'reject';
  assert.equal((await send(store, transport, req())).status, 'failed');
  transport.mode = 'ok';
  assert.equal((await send(store, transport, req())).status, 'sent');
});

test('a scheduled reminder goes once per due date', async () => {
  const { store, transport, req } = setup('B');
  const r1 = await send(store, transport, req({ actionType: 'reminder_7d', occurrence: '2026-11-10' }));
  const r2 = await send(store, transport, req({ actionType: 'reminder_7d', occurrence: '2026-11-10' }));
  assert.equal(r1.status, 'sent');
  assert.equal(r2.status === 'refused' && r2.reason, 'already_sent');
});

test('every refusal and send is in the audit log', async () => {
  const { store, transport, req } = setup('A');
  await send(store, transport, req());
  store.stage = 'B';
  await send(store, transport, req());
  assert.deepEqual(store.log.map((l) => l.action), ['send_refused', 'sent']);
});
