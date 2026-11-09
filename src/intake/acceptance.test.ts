import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assess, type AssessmentInput } from '../rules/assess.ts';
import { suggestAcceptance } from './acceptance.ts';

const flight = (dep: string, arr: string, carrier: string, delayH: number | null): AssessmentInput => ({
  sectors: [{ flightNo: carrier + '1', operatingCarrier: carrier, dep, arr, schedDep: '2026-10-01T08:00:00Z', schedArr: '2026-10-01T11:00:00Z' }],
  singleReservation: true,
  disruption: { kind: 'delay', sectorIndex: 0, finalArrival: delayH === null ? null : new Date(Date.parse('2026-10-01T11:00:00Z') + delayH * 3600_000).toISOString() },
});
const base = { airline: 'BA', depCountry: 'GB', arrCountry: 'GB', passengers: 2 };

test('covered → accept, with the amount as the reason', () => {
  const a = suggestAcceptance({ ...base, assessment: assess(flight('LHR', 'EDI', 'BA', 5)) });
  assert.equal(a.suggestion, 'accept');
  assert.match(a.reasons[0], /UK261 potentially covers it \(220 GBP/);
});

test('under 3 hours → decline', () => {
  assert.equal(suggestAcceptance({ ...base, assessment: assess(flight('LHR', 'EDI', 'BA', 2)) }).suggestion, 'decline');
});

test('arrival time unknown → ask for details, not decline', () => {
  assert.equal(suggestAcceptance({ ...base, assessment: assess(flight('LHR', 'EDI', 'BA', null)) }).suggestion, 'ask_for_details');
});

test('weather cited → offer to try; war → your decision', () => {
  const a = assess(flight('LHR', 'EDI', 'BA', 5));
  assert.equal(suggestAcceptance({ ...base, assessment: a, airlineCitesWeatherOrSimilar: true }).suggestion, 'offer_to_try');
  assert.equal(suggestAcceptance({ ...base, assessment: a, warRelated: true }).suggestion, 'your_decision');
});

test('Israeli airline outside Israel: offer to try, unless flying from the UK', () => {
  const ath = assess(flight('ATH', 'LCA', 'IZ', 9));
  // Not covered by any of our laws at all (Greece → Cyprus is EU261 territory, so EU261 applies from Athens)
  const r = suggestAcceptance({ airline: 'IZ', depCountry: 'GR', arrCountry: 'CY', passengers: 2, assessment: ath });
  assert.equal(r.suggestion, 'offer_to_try');
  const uk = assess(flight('LTN', 'ATH', 'IZ', 9));
  assert.equal(suggestAcceptance({ airline: 'IZ', depCountry: 'GB', arrCountry: 'GR', passengers: 2, assessment: uk }).suggestion, 'accept');
});

test('baggage only and travel insurance are declined politely', () => {
  const a = assess(flight('LHR', 'EDI', 'BA', 5));
  assert.equal(suggestAcceptance({ ...base, assessment: a, baggageOnly: true }).suggestion, 'decline');
  assert.equal(suggestAcceptance({ ...base, assessment: a, notOurLine: 'travel_insurance' }).suggestion, 'decline');
});
