import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDataset, type Tables } from './build.ts';
import { makeView, DEMO_DATASET } from '../demo/view.ts';

// Rows exported from a database loaded with scripts/demo-seed.ts: the live screens must match the demo screens.
const tables = JSON.parse(readFileSync(new URL('./fixtures/seeded-tables.json', import.meta.url), 'utf8')) as Tables;

test('database rows give the same cases, assessments and checks as the demo data', () => {
  const live = makeView(buildDataset(tables, DEMO_DATASET.now));
  const demo = makeView(DEMO_DATASET);
  const sum = (v: ReturnType<typeof makeView>) => v.allCases().map((c) => {
    const h = v.headline(c);
    return `${c.title.replace(" (new lead)", "")}|${h.result.regime}|${h.perPassenger}|${h.total}|${c.isLead ? 'lead' : ''}|${c.terms.acceptedOn ?? '-'}`;
  }).sort();
  assert.deepEqual(sum(live), sum(demo));
});

test('mail sorting and draft checks come out the same from the database', () => {
  const live = makeView(buildDataset(tables, DEMO_DATASET.now));
  const demo = makeView(DEMO_DATASET);
  const mail = (v: ReturnType<typeof makeView>) => v.inbox().filter((i) => i.kind === 'email')
    .map((i) => `${i.subject}|${i.classification}|${i.lead.action}|${(i.match?.attachTo ?? []).map((a) => v.caseById(a.claimId)?.title).join(',')}|${i.match?.suspicious.length}`).sort();
  assert.deepEqual(mail(live), mail(demo));
  const drafts = (v: ReturnType<typeof makeView>) => v.drafts().map((d) => `${d.subject}|${d.state}|${d.flags.map((f) => f.text)}|${d.awaitingAcceptance}`).sort();
  assert.deepEqual(drafts(live), drafts(demo));
});

test('your manual decisions on mail are applied', () => {
  const t = structuredClone(tables);
  const levi = t.messages.find((m) => m.subject === 'Any news?')!;
  const claim = t.claims.find((c) => c.title === 'Levi v Lufthansa (FRA–TLV)')!;
  t.message_claims.push({ message_id: levi.id, claim_id: claim.id, matched_by: 'manual' });
  const spam = t.messages.find((m) => m.subject === 'Delayed flight from Luton')!;
  spam.override = 'spam';
  const v = makeView(buildDataset(t, DEMO_DATASET.now));
  const i = v.inbox().find((x) => x.subject === 'Any news?')!;
  assert.equal(i.classification, 'case');
  assert.equal(v.caseById(i.match!.attachTo[0].claimId)?.title, 'Levi v Lufthansa (FRA–TLV)');
  assert.equal(v.inbox().find((x) => x.subject === 'Delayed flight from Luton')!.lead.action, 'spam');
});
