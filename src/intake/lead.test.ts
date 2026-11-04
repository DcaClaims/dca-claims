import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leadFromEmail, leadFromForm } from './lead.ts';
import { matchMessage } from '../mail/match.ts';

const dir = { ownDomains: ['dcaclaims.com'], parties: [] };

test('a real website enquiry creates a lead', () => {
  const d = leadFromForm({ name: 'Chaim B', email: 'chaim@gmail.com', airline: 'United', flightNo: 'UA90', flightDate: '2026-03-20', message: 'Delayed 5 hours' });
  assert.equal(d.action, 'create_lead');
});

test('a short Hebrew message about a cancelled flight, without details, still creates a lead', () => {
  const d = leadFromForm({ name: 'מיכל', email: 'm@gmail.com', message: 'הטיסה שלנו בוטלה, מגיע לנו פיצוי?' });
  assert.equal(d.action, 'create_lead');
});

test('the Google Ads form spam ("I need a lawyer", no flight details) does not create a lead', () => {
  const d = leadFromForm({ name: 'Kikelomo olaoye', email: 'realoneolaoye@gmail.com', airline: '', flightNo: '', flightDate: '', claimType: '', message: 'I need a lawyer' });
  assert.notEqual(d.action, 'create_lead');
  assert.equal(d.action, 'review');
});

test('obvious spam goes to the spam folder: bots, adverts, link farms, throwaway addresses', () => {
  assert.equal(leadFromForm({ email: 'a@b.com', message: 'hi', honeypot: 'x' }).action, 'spam');
  assert.equal(leadFromForm({ email: 'seo@agency.example', message: 'We can rank on Google, cheap SEO backlinks' }).action, 'spam');
  assert.equal(leadFromForm({ email: 'x@y.example', message: 'see http://a.example and http://b.example' }).action, 'spam');
  assert.equal(leadFromForm({ email: 'z@mailinator.com', flightNo: 'LY1', message: 'delay' }).action, 'spam');
  assert.equal(leadFromForm({ message: 'flight delayed' }).action, 'spam');
});

test('emails: only clear new enquiries create leads; newsletters never do', () => {
  const base = { id: '1', mailbox: 'info@', rfcMessageId: '<1@x>', to: ['info@dcaclaims.com'] };
  const enquiry = matchMessage({ ...base, from: { address: 'new@gmail.com' }, subject: 'Delayed flight', bodyText: 'Our flight was delayed 6 hours' }, [], dir);
  assert.equal(leadFromEmail(enquiry).action, 'create_lead');
  const news = matchMessage({ ...base, from: { address: 'news@shop.example' }, subject: 'Flight deals!', bodyText: 'Cheap flights', headers: { 'List-Unsubscribe': '<x>' } }, [], dir);
  assert.equal(leadFromEmail(news).action, 'spam');
  const unknown = matchMessage({ ...base, from: { address: 'someone@corp.example' }, subject: 'Invoice 2231', bodyText: 'Please find attached.' }, [], dir);
  assert.equal(leadFromEmail(unknown).action, 'review');
});
