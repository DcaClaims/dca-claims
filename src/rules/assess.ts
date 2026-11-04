// Compensation assessment for one passenger on one disrupted journey.
// Principles (from the design): every result shows its working; missing facts give
// "insufficient_information", never "not_covered"; anything uncertain is flagged for review, not decided.

import { readFileSync } from 'node:fs';
import { airport, greatCircleKm, inEU261Territory, inIsrael, inUK, AIRPORT_SOURCE, type Airport } from './geo.ts';
import { RULE_SETS, type RuleSet } from './ruleSets.ts';

export type Licence = 'EU' | 'UK' | 'OTHER' | 'AMBIGUOUS' | 'UNKNOWN';

const carrierFile = JSON.parse(readFileSync(new URL('../../data/carriers.json', import.meta.url), 'utf8')) as {
  carriers: Record<string, Licence>;
};
export function carrierLicence(code: string | null | undefined): Licence {
  if (!code) return 'UNKNOWN';
  return carrierFile.carriers[code.trim().toUpperCase()] ?? 'UNKNOWN';
}

export type SectorInput = {
  flightNo: string;
  operatingCarrier?: string | null;
  dep: string;
  arr: string;
  schedDep?: string | null; // ISO
  schedArr?: string | null; // ISO
};

export type DisruptionInput = {
  kind: 'delay' | 'cancellation' | 'denied_boarding' | 'missed_connection';
  /** Index in `sectors` of the flight that caused the disruption. */
  sectorIndex: number;
  noticeDays?: number | null;
  /** Rerouting actually offered: departure from the disrupted point, arrival at the final destination. */
  reroute?: { dep: string; arr: string } | null;
  /** Actual arrival at the final destination, if known. */
  finalArrival?: string | null;
  finalArrivalSource?: string | null;
  voluntary?: boolean;
  extraordinary?: 'none_known' | 'claimed_by_airline' | 'established';
};

export type AssessmentInput = {
  sectors: SectorInput[];
  singleReservation: boolean | null;
  disruption: DisruptionInput;
  passenger?: { name?: string; isInfant?: boolean };
  ruleSets?: Partial<Record<RuleSet['regime'], RuleSet>>;
};

export type Fact = { label: string; value: string; source: string };

export type RegimeResult = {
  regime: RuleSet['regime'];
  ruleVersion: number;
  ruleStatus: RuleSet['status'];
  view: 'journey' | 'sector';
  outcome: 'potentially_covered' | 'not_covered' | 'insufficient_information';
  amount: number | null;
  currency: RuleSet['currency'];
  reduction50Possible: boolean;
  needsReview: boolean;
  facts: Fact[];
  steps: string[];
  missing: string[];
  flags: string[];
};

export type Assessment = { results: RegimeResult[]; flags: string[]; needsReview: boolean };

const MIN = 60_000;
const minutesBetween = (later: string, earlier: string) => Math.round((Date.parse(later) - Date.parse(earlier)) / MIN);
const fmtMin = (m: number) => `${Math.floor(Math.abs(m) / 60)}h ${String(Math.abs(m) % 60).padStart(2, '0')}m${m < 0 ? ' early' : ''}`;

type Scope = 'yes' | 'no' | 'uncertain';

function scope(regime: RuleSet['regime'], dep: Airport, arr: Airport, lic: Licence): { scope: Scope; why: string } {
  const unknownLic = lic === 'UNKNOWN' || lic === 'AMBIGUOUS';
  if (regime === 'EU261') {
    if (inEU261Territory(dep.country)) return { scope: 'yes', why: `departs from ${dep.country}, inside the EU/EEA/Switzerland (Art 3(1)(a))` };
    if (inEU261Territory(arr.country)) {
      if (lic === 'EU') return { scope: 'yes', why: `arrives in ${arr.country} on an EU-licensed operating carrier (Art 3(1)(b))` };
      if (unknownLic) return { scope: 'uncertain', why: `arrives in ${arr.country}; covered only if the operating carrier is EU-licensed, which is not established` };
      return { scope: 'no', why: `arrives in ${arr.country} from outside the EU on a non-EU carrier` };
    }
    return { scope: 'no', why: `neither departs from nor arrives in the EU/EEA/Switzerland (${dep.country} → ${arr.country})` };
  }
  if (regime === 'UK261') {
    if (inUK(dep.country)) return { scope: 'yes', why: 'departs from the UK' };
    if (inUK(arr.country)) {
      const fromEU = inEU261Territory(dep.country);
      if (lic === 'UK') return { scope: 'yes', why: 'arrives in the UK on a UK-licensed operating carrier' };
      if (!fromEU && lic === 'EU') return { scope: 'yes', why: 'arrives in the UK from outside the UK and EU on an EU-licensed carrier' };
      if (unknownLic) return { scope: 'uncertain', why: 'arrives in the UK; coverage depends on the operating carrier\'s licence, which is not established' };
      return { scope: 'no', why: fromEU ? 'arrives in the UK from the EU on a non-UK carrier' : 'arrives in the UK on a carrier that is neither UK nor EU' };
    }
    return { scope: 'no', why: 'neither departs from nor arrives in the UK' };
  }
  // ASL
  if (inIsrael(dep.country) || inIsrael(arr.country)) return { scope: 'yes', why: 'flight departs from or arrives in Israel' };
  return { scope: 'no', why: 'does not depart from or arrive in Israel' };
}

function bandIndex(rs: RuleSet, km: number): number {
  const i = rs.bands.findIndex((b) => b.maxKm !== null && km <= b.maxKm);
  return i === -1 ? rs.bands.length - 1 : i;
}

function assessOne(rs: RuleSet, view: 'journey' | 'sector', input: AssessmentInput): RegimeResult {
  const { sectors, disruption: d } = input;
  const disrupted = sectors[d.sectorIndex];
  const first = view === 'journey' ? sectors[0] : disrupted;
  const last = view === 'journey' ? sectors[sectors.length - 1] : disrupted;

  const res: RegimeResult = {
    regime: rs.regime, ruleVersion: rs.version, ruleStatus: rs.status, view,
    outcome: 'insufficient_information', amount: null, currency: rs.currency,
    reduction50Possible: false, needsReview: false, facts: [], steps: [], missing: [], flags: [],
  };
  if (rs.status !== 'approved') res.flags.push(`${rs.regime} rules v${rs.version} are a draft, not yet approved by you`);

  const dep = airport(first.dep);
  const arr = airport(last.arr);
  if (!dep || !arr) {
    res.missing.push(`airport not found: ${!dep ? first.dep : last.arr}`);
    return res;
  }
  res.facts.push(
    { label: view === 'journey' ? 'First departure' : 'Departure', value: `${dep.iata} ${dep.name} (${dep.country})`, source: AIRPORT_SOURCE() },
    { label: view === 'journey' ? 'Final destination' : 'Arrival', value: `${arr.iata} ${arr.name} (${arr.country})`, source: AIRPORT_SOURCE() },
  );

  const lic = carrierLicence(disrupted.operatingCarrier);
  res.facts.push({ label: 'Operating carrier of disrupted flight', value: `${disrupted.operatingCarrier ?? 'not stated'} (${lic})`, source: 'carrier licence table (draft)' });

  const sc = scope(rs.regime, dep, arr, lic);
  res.steps.push(`Scope: ${sc.scope === 'yes' ? 'in scope' : sc.scope === 'no' ? 'out of scope' : 'uncertain'}: ${sc.why}.`);
  if (sc.scope === 'no') { res.outcome = 'not_covered'; return res; }
  if (sc.scope === 'uncertain') { res.needsReview = true; res.missing.push('operating carrier licence'); }

  const km = greatCircleKm(dep, arr);
  res.facts.push({ label: 'Great-circle distance', value: `${km.toLocaleString('en-GB')} km`, source: 'calculated from airport coordinates' });
  const internal =
    (rs.regime === 'EU261' && inEU261Territory(dep.country) && inEU261Territory(arr.country)) ||
    (rs.regime === 'UK261' && inUK(dep.country) && inUK(arr.country));
  // Internal flights over 1,500 km are treated as the middle band, whatever the distance (Art 7(1)(b), 7(2)(b)).
  const bi = internal && km > 1500 && rs.internalOver1500Amount !== undefined ? 1 : bandIndex(rs, km);
  let amount = rs.bands[bi].amount;
  if (rs.datedAmounts) {
    const flightDate = (disrupted.schedDep ?? last.schedArr ?? '').slice(0, 10);
    const table = flightDate
      ? [...rs.datedAmounts].filter((t) => t.from <= flightDate).sort((a, b) => b.from.localeCompare(a.from))[0]
      : undefined;
    amount = table ? table.amounts[bi] ?? null : null;
    if (table) res.facts.push({ label: 'Amount table', value: `in force from ${table.from}`, source: table.source });
    else res.missing.push(flightDate ? `${rs.regime} amounts in force on ${flightDate}` : 'flight date, to choose the amount table');
  }
  if (internal && km > 1500 && rs.internalOver1500Amount !== undefined) {
    amount = rs.internalOver1500Amount;
    res.steps.push(`Distance ${km} km, internal flight over 1,500 km: ${amount} ${rs.currency}.`);
  } else {
    res.steps.push(`Distance ${km} km falls in the band "${rs.bands[bi].label}"${amount === null ? '' : `: ${amount} ${rs.currency}`}.`);
  }
  if (amount === null) res.flags.push(`${rs.regime} amount for this band has not been entered`);

  // When did the passenger arrive, compared with the schedule?
  const schedArr = last.schedArr;
  let delayMin: number | null = null;
  if (d.finalArrival && schedArr) {
    // In the sector view the measured arrival is only meaningful if the disrupted flight was the last one.
    if (view === 'journey' || d.sectorIndex === sectors.length - 1) {
      delayMin = minutesBetween(d.finalArrival, schedArr);
      res.facts.push({ label: 'Arrival delay', value: fmtMin(delayMin), source: `${d.finalArrivalSource ?? 'arrival time on file'} vs scheduled ${schedArr}` });
    }
  }

  const covered = (why: string) => {
    res.outcome = 'potentially_covered';
    res.amount = amount;
    res.steps.push(why);
  };

  switch (d.kind) {
    case 'delay':
    case 'missed_connection': {
      if (d.kind === 'missed_connection' && view === 'sector') {
        res.flags.push('Missed connection assessed on the single flight only; the journey view applies only to a single reservation');
      }
      if (delayMin === null) { res.missing.push('actual arrival time at the destination'); return finish(res, input); }
      const asCancellation = rs.delayCountsAsCancellationMin !== undefined && delayMin >= rs.delayCountsAsCancellationMin;
      if (delayMin < rs.delayThresholdMin) {
        res.outcome = 'not_covered';
        res.steps.push(`Arrived ${fmtMin(delayMin)} late, under the ${rs.delayThresholdMin / 60}-hour threshold for compensation.`);
        return finish(res, input);
      }
      covered(asCancellation
        ? `Delay of ${fmtMin(delayMin)} is ${rs.delayThresholdMin / 60} hours or more and counts as a cancellation.`
        : `Arrived ${fmtMin(delayMin)} late: ${rs.delayThresholdMin / 60} hours or more.`);
      const cap = rs.delayReductionBelowMin?.[bi];
      if (cap !== undefined && delayMin < cap) {
        res.reduction50Possible = true;
        res.steps.push(`Delay under ${cap / 60} hours on this distance: the airline may reduce compensation by 50%.`);
      }
      break;
    }
    case 'cancellation': {
      const n = rs.cancellationNotice!;
      if (d.noticeDays === null || d.noticeDays === undefined) { res.missing.push('when the passenger was told of the cancellation'); return finish(res, input); }
      if (d.noticeDays >= n.fullNoticeDays) {
        res.outcome = 'not_covered';
        res.steps.push(`Told ${d.noticeDays} days ahead: ${n.fullNoticeDays} days or more, so no compensation.`);
        return finish(res, input);
      }
      if (d.noticeDays >= 0) {
        const lim = d.noticeDays >= n.midNoticeDays ? n.mid : n.short;
        if (d.reroute && disrupted.schedDep && schedArr) {
          const earlier = minutesBetween(disrupted.schedDep, d.reroute.dep);
          const later = minutesBetween(d.reroute.arr, schedArr);
          if (earlier <= lim.depEarlierMaxMin && later < lim.arrLaterMaxMin) {
            res.outcome = 'not_covered';
            res.steps.push(`Told ${d.noticeDays} days ahead and offered rerouting leaving ${fmtMin(Math.max(earlier, 0))} earlier and arriving ${fmtMin(later)} later: within the limits, so no compensation.`);
            return finish(res, input);
          }
          res.steps.push(`Rerouting offered left ${fmtMin(Math.max(earlier, 0))} earlier and arrived ${fmtMin(later)} later, outside the limits for ${d.noticeDays} days' notice.`);
        } else if (d.reroute) {
          res.missing.push('scheduled times, to test the rerouting offered');
          return finish(res, input);
        }
      }
      covered(`Cancelled with ${d.noticeDays} days' notice: under ${n.fullNoticeDays} days.`);
      reroutingReduction(res, rs, bi, delayMin);
      break;
    }
    case 'denied_boarding': {
      if (d.voluntary) { res.outcome = 'not_covered'; res.steps.push('Gave up the seat voluntarily: benefits are as agreed with the airline.'); return finish(res, input); }
      covered('Denied boarding against the passenger\'s will.');
      reroutingReduction(res, rs, bi, delayMin);
      break;
    }
  }

  if (d.kind !== 'denied_boarding') {
    if (d.extraordinary === 'established') {
      res.outcome = 'not_covered';
      res.amount = null;
      res.steps.push('Extraordinary circumstances are established: compensation is not due (care and expenses may still be).');
    } else if (d.extraordinary === 'claimed_by_airline') {
      res.needsReview = true;
      res.flags.push('The airline cites extraordinary circumstances; evidence about the disrupted flight is needed');
    }
  }
  return finish(res, input);
}

function reroutingReduction(res: RegimeResult, rs: RuleSet, bi: number, delayMin: number | null) {
  const within = rs.reroutingReductionWithinMin?.[bi];
  if (within === undefined) return;
  if (delayMin === null) { res.steps.push('Arrival time on the rerouting not established, so a 50% reduction cannot be ruled out.'); return; }
  if (delayMin <= within) {
    res.reduction50Possible = true;
    res.steps.push(`Rerouted arrival ${fmtMin(delayMin)} late, within ${within / 60} hours: the airline may reduce compensation by 50%.`);
  }
}

function finish(res: RegimeResult, input: AssessmentInput): RegimeResult {
  if (input.passenger?.isInfant) {
    res.needsReview = true;
    res.flags.push('Infant passenger: check the fare paid (free-of-charge passengers are excluded)');
  }
  if (res.outcome === 'insufficient_information') res.amount = null;
  if (res.flags.length && res.outcome !== 'not_covered') res.needsReview = res.needsReview || res.flags.some((f) => !f.includes('draft'));
  return res;
}

/** Assess every regime, in both the journey view and the disrupted-flight view where they could differ. */
export function assess(input: AssessmentInput): Assessment {
  const sets = { ...RULE_SETS, ...input.ruleSets };
  const multi = input.sectors.length > 1;
  const views: ('journey' | 'sector')[] =
    !multi ? ['journey'] : input.singleReservation === true ? ['journey', 'sector'] : input.singleReservation === false ? ['sector'] : ['journey', 'sector'];

  const results: RegimeResult[] = [];
  for (const regime of ['EU261', 'UK261', 'ASL'] as const) {
    for (const v of views) results.push(assessOne(sets[regime], v, input));
  }

  const flags: string[] = [];
  if (multi && input.singleReservation === null) {
    flags.push('Not established whether the flights were one reservation: both the whole journey and the disrupted flight alone are shown');
  }
  if (multi && input.singleReservation === true) {
    // The journey view is the default for a single reservation; flag regimes where the views disagree.
    for (const regime of ['EU261', 'UK261', 'ASL'] as const) {
      const j = results.find((r) => r.regime === regime && r.view === 'journey')!;
      const s = results.find((r) => r.regime === regime && r.view === 'sector')!;
      if (j.outcome !== s.outcome || j.amount !== s.amount) {
        flags.push(`${regime}: the whole journey (${label(j)}) and the disrupted flight alone (${label(s)}) give different answers; review which applies`);
        j.needsReview = s.needsReview = true;
      }
    }
  }
  const coveredRegimes = [...new Set(results.filter((r) => r.outcome === 'potentially_covered').map((r) => r.regime))];
  if (coveredRegimes.length > 1) {
    flags.push(`More than one regime may apply (${coveredRegimes.join(', ')}): choose which to pursue; payment under one may be offset against another`);
  }
  return { results, flags, needsReview: flags.length > 0 || results.some((r) => r.needsReview) };
}

function label(r: RegimeResult) {
  if (r.outcome === 'potentially_covered') return r.amount === null ? 'covered, amount not entered' : `${r.amount} ${r.currency}`;
  return r.outcome.replaceAll('_', ' ');
}
