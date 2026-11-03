import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assess, type AssessmentInput } from './assess.ts';
import { EU261_V1 } from './ruleSets.ts';

const pick = (a: ReturnType<typeof assess>, regime: string, view = 'journey') =>
  a.results.find((r) => r.regime === regime && r.view === view)!;

test('JFK→ZRH on Swiss, 5h late: EU261 €600 (Airtable formula said NOT COVERED)', () => {
  const a = assess({
    sectors: [{ flightNo: 'LX17', operatingCarrier: 'LX', dep: 'JFK', arr: 'ZRH', schedDep: '2025-03-01T22:00:00Z', schedArr: '2025-03-02T06:00:00Z' }],
    singleReservation: true,
    disruption: { kind: 'delay', sectorIndex: 0, finalArrival: '2025-03-02T11:00:00Z', finalArrivalSource: 'flight-data test' },
  });
  const eu = pick(a, 'EU261');
  assert.equal(eu.outcome, 'potentially_covered');
  assert.equal(eu.amount, 600);
  assert.equal(eu.reduction50Possible, false);
  assert.equal(pick(a, 'UK261').outcome, 'not_covered');
  assert.equal(pick(a, 'ASL').outcome, 'not_covered');
});

test('JFK→TLV on El Al, 5h late: only the ASL can apply, and 5h is under its 8h threshold', () => {
  const a = assess({
    sectors: [{ flightNo: 'LY2', operatingCarrier: 'LY', dep: 'JFK', arr: 'TLV', schedArr: '2025-03-02T16:00:00Z' }],
    singleReservation: true,
    disruption: { kind: 'delay', sectorIndex: 0, finalArrival: '2025-03-02T21:00:00Z' },
  });
  assert.equal(pick(a, 'EU261').outcome, 'not_covered');
  assert.equal(pick(a, 'UK261').outcome, 'not_covered');
  assert.equal(pick(a, 'ASL').outcome, 'not_covered');
  assert.match(pick(a, 'ASL').steps.join(' '), /under the 8-hour threshold/);
});

test('TLV→ZRH on Swiss, 4h late: EU261 and ASL both possible, flagged to choose', () => {
  const a = assess({
    sectors: [{ flightNo: 'LX253', operatingCarrier: 'LX', dep: 'TLV', arr: 'ZRH', schedArr: '2025-05-01T10:00:00Z' }],
    singleReservation: true,
    disruption: { kind: 'delay', sectorIndex: 0, finalArrival: '2025-05-01T19:00:00Z' },
  });
  assert.equal(pick(a, 'EU261').amount, 400);
  assert.equal(pick(a, 'ASL').outcome, 'potentially_covered'); // 9h ≥ 8h
  assert.equal(pick(a, 'ASL').amount, null); // amounts not entered yet
  assert.ok(a.flags.some((f) => f.includes('More than one regime')));
  assert.equal(a.needsReview, true);
});

test('De Jong: TLV→MUC→MAN, MUC→MAN cancelled on the day, arrived 8h50 late', () => {
  const input: AssessmentInput = {
    sectors: [
      { flightNo: 'LH687', operatingCarrier: 'LH', dep: 'TLV', arr: 'MUC', schedDep: '2024-07-21T10:00:00Z', schedArr: '2024-07-21T14:00:00Z' },
      { flightNo: 'LH2504', operatingCarrier: 'LH', dep: 'MUC', arr: 'MAN', schedDep: '2024-07-21T16:00:00Z', schedArr: '2024-07-21T17:10:00Z' },
    ],
    singleReservation: true,
    disruption: { kind: 'cancellation', sectorIndex: 1, noticeDays: 0, finalArrival: '2024-07-22T02:00:00Z', finalArrivalSource: 'Eurowings EW2470 booking' },
  };
  const a = assess(input);
  // EU261: the whole journey (Tel Aviv → Manchester) is outside EU261, but the cancelled flight departs Munich.
  assert.equal(pick(a, 'EU261', 'journey').outcome, 'not_covered');
  assert.equal(pick(a, 'EU261', 'sector').outcome, 'potentially_covered');
  assert.equal(pick(a, 'EU261', 'sector').amount, 250);
  // UK261: Tel Aviv → Manchester on an EU carrier is in scope as a whole journey, over 3,500 km.
  assert.equal(pick(a, 'UK261', 'journey').amount, 520);
  assert.equal(pick(a, 'UK261', 'sector').outcome, 'not_covered');
  // Different answers → must be reviewed, not decided.
  assert.ok(a.flags.some((f) => f.startsWith('EU261: the whole journey')));
  assert.ok(a.flags.some((f) => f.startsWith('UK261: the whole journey')));
  assert.equal(a.needsReview, true);
  // Distance is shown in the working.
  assert.ok(pick(a, 'UK261').facts.some((f) => f.label === 'Great-circle distance' && /3,7\d\d km/.test(f.value)));
});

test('Missing arrival time gives insufficient information, never "not covered"', () => {
  const a = assess({
    sectors: [{ flightNo: 'FR123', operatingCarrier: 'FR', dep: 'STN', arr: 'DUB', schedArr: '2025-01-01T10:00:00Z' }],
    singleReservation: true,
    disruption: { kind: 'delay', sectorIndex: 0 },
  });
  const uk = pick(a, 'UK261');
  assert.equal(uk.outcome, 'insufficient_information');
  assert.equal(uk.amount, null);
  assert.deepEqual(uk.missing, ['actual arrival time at the destination']);
});

test('Cancellation: 14+ days notice → no compensation; 10 days with rerouting inside limits → none; outside → covered', () => {
  const base: AssessmentInput = {
    sectors: [{ flightNo: 'LH100', operatingCarrier: 'LH', dep: 'FRA', arr: 'MUC', schedDep: '2025-06-01T08:00:00Z', schedArr: '2025-06-01T09:00:00Z' }],
    singleReservation: true,
    disruption: { kind: 'cancellation', sectorIndex: 0, noticeDays: 20 },
  };
  assert.equal(pick(assess(base), 'EU261').outcome, 'not_covered');

  const inside = { ...base, disruption: { ...base.disruption, noticeDays: 10, reroute: { dep: '2025-06-01T07:00:00Z', arr: '2025-06-01T11:00:00Z' } } };
  assert.equal(pick(assess(inside), 'EU261').outcome, 'not_covered');

  const outside = { ...base, disruption: { ...base.disruption, noticeDays: 10, reroute: { dep: '2025-06-01T07:00:00Z', arr: '2025-06-01T14:00:00Z' } } };
  const r = pick(assess(outside), 'EU261');
  assert.equal(r.outcome, 'potentially_covered');
  assert.equal(r.amount, 250);

  const noNotice = { ...base, disruption: { ...base.disruption, noticeDays: null } };
  assert.equal(pick(assess(noNotice), 'EU261').outcome, 'insufficient_information');
});

test('Intra-EU flight over 3,500 km (Gran Canaria → Helsinki) is in the €400 band', () => {
  const a = assess({
    sectors: [{ flightNo: 'AY1000', operatingCarrier: 'AY', dep: 'LPA', arr: 'HEL', schedArr: '2025-02-01T18:00:00Z' }],
    singleReservation: true,
    disruption: { kind: 'delay', sectorIndex: 0, finalArrival: '2025-02-01T22:00:00Z' },
  });
  const eu = pick(a, 'EU261');
  assert.equal(eu.amount, 400);
  assert.equal(eu.reduction50Possible, false);
});

test('Long-haul delay of 3h30 may be reduced by 50%', () => {
  const a = assess({
    sectors: [{ flightNo: 'LH400', operatingCarrier: 'LH', dep: 'FRA', arr: 'JFK', schedArr: '2025-02-01T15:00:00Z' }],
    singleReservation: true,
    disruption: { kind: 'delay', sectorIndex: 0, finalArrival: '2025-02-01T18:30:00Z' },
  });
  const eu = pick(a, 'EU261');
  assert.equal(eu.amount, 600);
  assert.equal(eu.reduction50Possible, true);
});

test('Arriving in the EU on a carrier whose licence is unknown is flagged, not decided', () => {
  const a = assess({
    sectors: [{ flightNo: 'ZZ1', operatingCarrier: 'ZZ', dep: 'JFK', arr: 'CDG', schedArr: '2025-02-01T08:00:00Z' }],
    singleReservation: true,
    disruption: { kind: 'delay', sectorIndex: 0, finalArrival: '2025-02-01T14:00:00Z' },
  });
  const eu = pick(a, 'EU261');
  assert.equal(eu.needsReview, true);
  assert.ok(eu.missing.includes('operating carrier licence'));
  assert.notEqual(eu.outcome, 'not_covered');
});

test('Infant passengers and airline-claimed extraordinary circumstances are flagged; established ones remove compensation', () => {
  const base: AssessmentInput = {
    sectors: [{ flightNo: 'BA1', operatingCarrier: 'BA', dep: 'LHR', arr: 'EDI', schedArr: '2025-02-01T08:00:00Z' }],
    singleReservation: true,
    disruption: { kind: 'delay', sectorIndex: 0, finalArrival: '2025-02-01T12:00:00Z', extraordinary: 'claimed_by_airline' },
    passenger: { isInfant: true },
  };
  const uk = pick(assess(base), 'UK261');
  assert.equal(uk.outcome, 'potentially_covered');
  assert.equal(uk.amount, 220);
  assert.equal(uk.needsReview, true);
  assert.equal(uk.flags.filter((f) => f.includes('Infant') || f.includes('extraordinary')).length, 2);

  const est = pick(assess({ ...base, disruption: { ...base.disruption, extraordinary: 'established' } }), 'UK261');
  assert.equal(est.outcome, 'not_covered');
  assert.equal(est.amount, null);
});

test('Results record the rule version and say when it is still a draft', () => {
  const a = assess({
    sectors: [{ flightNo: 'LH1', operatingCarrier: 'LH', dep: 'FRA', arr: 'BER', schedArr: '2025-02-01T08:00:00Z' }],
    singleReservation: true,
    disruption: { kind: 'delay', sectorIndex: 0, finalArrival: '2025-02-01T12:00:00Z' },
  });
  assert.equal(pick(a, 'EU261').ruleVersion, 1);
  assert.equal(pick(a, 'EU261').ruleStatus, 'draft');
  const approved = assess({
    sectors: [{ flightNo: 'LH1', operatingCarrier: 'LH', dep: 'FRA', arr: 'BER', schedArr: '2025-02-01T08:00:00Z' }],
    singleReservation: true,
    disruption: { kind: 'delay', sectorIndex: 0, finalArrival: '2025-02-01T12:00:00Z' },
    ruleSets: { EU261: { ...EU261_V1, status: 'approved', version: 2 } },
  });
  assert.equal(pick(approved, 'EU261').ruleVersion, 2);
  assert.ok(!pick(approved, 'EU261').flags.some((f) => f.includes('draft')));
});
