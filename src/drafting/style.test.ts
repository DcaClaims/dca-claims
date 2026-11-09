import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkStyle } from './style.ts';

test('an airline letter needs a deadline and a firm escalation "without further notice"', () => {
  const soft = 'Dear Sir, we would be grateful if you could reconsider. Kind regards';
  assert.deepEqual(checkStyle('airline', soft).map((f) => f.rule), ['deadline', 'escalation']);
  const halfway = 'Please pay within 14 days, otherwise we may contact the CAA.';
  assert.deepEqual(checkStyle('airline', halfway).map((f) => f.rule), ['firmness']);
  const firm = 'Please pay within 14 days. Otherwise we will refer the claim to the CAA and issue legal proceedings without further notice.';
  assert.deepEqual(checkStyle('airline', firm), []);
});

test('El Al letters must not describe the claim as assigned', () => {
  const t = 'Our client has assigned the claim to DCA. Pay within 14 days or we will issue legal proceedings without further notice.';
  assert.ok(checkStyle('airline', t, { airline: 'LY' }).some((f) => f.rule === 'el_al_assignment'));
  assert.ok(!checkStyle('airline', t, { airline: 'LH' }).some((f) => f.rule === 'el_al_assignment'));
});

test('a first reply to a new client states the fee, gives the upload link and mentions the T&Cs', () => {
  assert.deepEqual(checkStyle('client_first_reply', 'Hi, you may be due £220. Send your booking.').map((f) => f.rule), ['fee', 'upload_link', 'terms']);
  const ok = 'We charge 25% no win no fee. Upload here (you accept our Terms & Conditions on the page): https://claims.dcaclaims.com/u/x1';
  assert.deepEqual(checkStyle('client_first_reply', ok), []);
  assert.deepEqual(checkStyle('client_first_reply', 'אנו גובים 25% ללא הצלחה ללא תשלום. העלאה ואישור התנאים: https://claims.dcaclaims.com/u/x1'), []);
});

test('an upload request needs the personal link; if T&Cs are not accepted yet it must mention them', () => {
  const body = 'Please upload here: https://claims.dcaclaims.com/u/abc123';
  assert.deepEqual(checkStyle('client_upload_request', body, { clientAcceptedTerms: true }), []);
  assert.deepEqual(checkStyle('client_upload_request', body, { clientAcceptedTerms: false }).map((f) => f.rule), ['terms']);
  assert.deepEqual(checkStyle('client_upload_request', body + ' You will be asked to accept our T&Cs.', { clientAcceptedTerms: false }), []);
  assert.deepEqual(checkStyle('client_upload_request', 'Please send your booking.', { clientAcceptedTerms: true }).map((f) => f.rule), ['upload_link']);
});
