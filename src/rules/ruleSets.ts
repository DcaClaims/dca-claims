// Legal rules as data. Every rule set starts as DRAFT and must be approved by the owner before the
// system treats its results as anything more than a suggestion. Each assessment records the version used.

export type Band = { maxKm: number | null; amount: number | null; label: string };

export type RuleSet = {
  regime: 'EU261' | 'UK261' | 'ASL';
  version: number;
  status: 'draft' | 'approved';
  currency: 'EUR' | 'GBP' | 'ILS';
  /** Distance bands in ascending order; the last has maxKm null. */
  bands: Band[];
  /** Amount for flights within the regime's own territory over 1500 km (intra-EU / UK domestic), if different. */
  internalOver1500Amount?: number | null;
  /** Arrival delay at final destination (minutes) from which compensation is due. */
  delayThresholdMin: number;
  /** For delays: band index -> max delay (minutes) under which a 50% reduction may apply. */
  delayReductionBelowMin?: Record<number, number>;
  /** For cancellation / denied boarding with rerouting: band index -> max arrival delay (min) for 50% reduction. */
  reroutingReductionWithinMin?: Record<number, number>;
  /** Cancellation notice rules (Art 5(1)(c) style). */
  cancellationNotice?: { fullNoticeDays: number; midNoticeDays: number; mid: { depEarlierMaxMin: number; arrLaterMaxMin: number }; short: { depEarlierMaxMin: number; arrLaterMaxMin: number } };
  /** ASL-style: a delay this long counts as a cancellation. */
  delayCountsAsCancellationMin?: number;
  sources: { title: string; url: string }[];
  notes: string[];
};

const EU_CANCELLATION = {
  fullNoticeDays: 14,
  midNoticeDays: 7,
  mid: { depEarlierMaxMin: 120, arrLaterMaxMin: 240 },
  short: { depEarlierMaxMin: 60, arrLaterMaxMin: 120 },
};

export const EU261_V1: RuleSet = {
  regime: 'EU261',
  version: 1,
  status: 'draft',
  currency: 'EUR',
  bands: [
    { maxKm: 1500, amount: 250, label: 'up to 1,500 km' },
    { maxKm: 3500, amount: 400, label: '1,500–3,500 km' },
    { maxKm: null, amount: 600, label: 'over 3,500 km' },
  ],
  internalOver1500Amount: 400,
  delayThresholdMin: 180,
  delayReductionBelowMin: { 2: 240 },
  reroutingReductionWithinMin: { 0: 120, 1: 180, 2: 240 },
  cancellationNotice: EU_CANCELLATION,
  sources: [
    { title: 'Regulation (EC) No 261/2004, Articles 3, 5, 7', url: 'https://eur-lex.europa.eu/eli/reg/2004/261/oj' },
    { title: 'CJEU C-402/07 and C-432/07 Sturgeon (delay of 3 hours or more)', url: 'https://curia.europa.eu/juris/liste.jsf?num=C-402/07' },
    { title: 'CJEU C-11/11 Folkerts (connecting flights: delay at final destination)', url: 'https://curia.europa.eu/juris/liste.jsf?num=C-11/11' },
    { title: 'CJEU C-559/16 Bossen (distance: great circle, first departure to final destination)', url: 'https://curia.europa.eu/juris/liste.jsf?num=C-559/16' },
  ],
  notes: [
    'Intra-EU flights over 1,500 km are in the €400 band whatever the distance (Art 7(1)(b)).',
    'Long-haul delays between 3 and 4 hours may be reduced by 50% (Sturgeon, applying Art 7(2)(c)).',
  ],
};

export const UK261_V1: RuleSet = {
  regime: 'UK261',
  version: 1,
  status: 'draft',
  currency: 'GBP',
  bands: [
    { maxKm: 1500, amount: 220, label: 'up to 1,500 km' },
    { maxKm: 3500, amount: 350, label: '1,500–3,500 km' },
    { maxKm: null, amount: 520, label: 'over 3,500 km' },
  ],
  internalOver1500Amount: 350,
  delayThresholdMin: 180,
  delayReductionBelowMin: { 2: 240 },
  reroutingReductionWithinMin: { 0: 120, 1: 180, 2: 240 },
  cancellationNotice: EU_CANCELLATION,
  sources: [
    { title: 'Regulation (EC) No 261/2004 as retained in UK law (UK261)', url: 'https://www.legislation.gov.uk/eur/2004/261/contents' },
    { title: 'Civil Aviation Authority: delays and cancellations', url: 'https://www.caa.co.uk/' },
  ],
  notes: [
    'Scope follows the CAA summary: departing the UK on any airline; arriving in the UK from the EU on a UK airline; arriving in the UK from elsewhere on a UK or EU airline. To be checked against Article 3 before approval.',
  ],
};

export const ASL_V1: RuleSet = {
  regime: 'ASL',
  version: 1,
  status: 'draft',
  currency: 'ILS',
  bands: [
    { maxKm: 2000, amount: null, label: 'up to 2,000 km' },
    { maxKm: 4500, amount: null, label: '2,000–4,500 km' },
    { maxKm: null, amount: null, label: 'over 4,500 km' },
  ],
  delayThresholdMin: 480,
  delayCountsAsCancellationMin: 480,
  cancellationNotice: EU_CANCELLATION,
  sources: [
    { title: 'Aviation Services Law (Compensation and Assistance for Flight Cancellation or Change of Conditions), 5772-2012', url: '' } // official link to be added when the text is checked,
  ],
  notes: [
    'Amounts are index-linked and change; they are left blank until you enter the current table.',
    'Notice periods and alternative-flight reductions under the ASL differ in detail from EU261 and must be checked before approval.',
  ],
};

export const RULE_SETS = { EU261: EU261_V1, UK261: UK261_V1, ASL: ASL_V1 } as const;
