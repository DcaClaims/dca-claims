// Suggests whether to take a case. It never decides: the owner accepts or declines, and nothing is sent to a new
// client before that. Rules come from the owner's own replies (practice-rules doc, 4 Nov 2026).

import type { Assessment } from '../rules/assess.ts';
import { carrierLicence } from '../rules/assess.ts';

export type Suggestion = 'accept' | 'offer_to_try' | 'decline' | 'ask_for_details' | 'your_decision';

export type AcceptanceInput = {
  assessment: Assessment;
  airline: string;              // IATA code of the carrier claimed against
  depCountry: string;
  arrCountry: string;
  passengers: number;
  warRelated?: boolean;         // airline or news cites the war / airspace closure
  airlineCitesWeatherOrSimilar?: boolean;
  baggageOnly?: boolean;
  notOurLine?: 'travel_insurance' | 'ticket_dispute' | 'refund_only';
};

export type AcceptanceAdvice = { suggestion: Suggestion; reasons: string[] };

const ISRAELI = ['LY', 'IZ', '6H'];

export function suggestAcceptance(i: AcceptanceInput): AcceptanceAdvice {
  const r = i.assessment.results;
  // Clear results first: a law that applies only if an unconfirmed fact holds (e.g. carrier licence) comes last.
  const covered = r.filter((x) => x.outcome === 'potentially_covered').sort((a, b) => Number(a.needsReview) - Number(b.needsReview));
  const reasons: string[] = [];

  if (i.notOurLine) {
    return { suggestion: 'decline', reasons: [`not our line of work (${i.notOurLine.replace('_', ' ')}): polite decline`] };
  }
  if (i.baggageOnly) {
    return { suggestion: 'decline', reasons: ['baggage only: suggest the client applies themselves; we deal mainly with flight delay compensation'] };
  }
  if (!covered.length) {
    const under3h = r.some((x) => x.steps.some((s) => /under the \d+-hour threshold/.test(s)));
    if (under3h) return { suggestion: 'decline', reasons: ['arrived under the threshold for compensation (no win no fee needs a viable chance)'] };
    if (r.some((x) => x.outcome === 'insufficient_information')) {
      return { suggestion: 'ask_for_details', reasons: ['missing facts: ' + [...new Set(r.flatMap((x) => x.missing))].join('; ')] };
    }
    return { suggestion: 'decline', reasons: ['no law we use covers this flight'] };
  }

  if (i.warRelated) return { suggestion: 'your_decision', reasons: ['war-related disruption: usually declined, but you decide case by case'] };

  if (ISRAELI.includes(i.airline) && i.depCountry !== 'IL' && i.arrCountry !== 'IL') {
    if (i.depCountry === 'GB') reasons.push('Israeli airline flying from the UK: enforceable here');
    else return { suggestion: 'offer_to_try', reasons: ['Israeli airline outside Israel: hard to enforce; offer to try'] };
  }
  if (i.airlineCitesWeatherOrSimilar) {
    return { suggestion: 'offer_to_try', reasons: ['airline cites weather or similar: it must prove it; offer to try, or suggest the client files first'] };
  }
  if (carrierLicence(i.airline) === 'UNKNOWN') reasons.push('carrier not in the licence table yet: check before filing');

  const best = covered[0];
  reasons.unshift(`${best.regime} potentially covers it${best.amount !== null ? ` (${best.amount} ${best.currency} per passenger)` : ''}`);
  if (i.passengers === 1) reasons.push('one passenger: fine to claim, but court would not be worth it if the airline refuses');
  return { suggestion: 'accept', reasons };
}
