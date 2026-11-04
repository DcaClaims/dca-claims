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
  /**
   * Index-linked amounts (ASL). One table per period, each with the date it applies from; amounts follow `bands`.
   * The table in force on the flight date is used (to confirm with the lawyers which date decides).
   * When present, these replace the band amounts.
   */
  datedAmounts?: { from: string; amounts: (number | null)[]; source: string }[];
  /** Periods when statutory compensation is not due (e.g. ASL Swords of Iron emergency provisions). Dates are flight dates, inclusive. */
  noCompensationPeriods?: { from: string; to: string; minNoticeDays?: number; why: string }[];
  /** Days the airline has to pay after a written claim, and the limitation period, for deadlines. */
  airlinePaymentDays?: number;
  limitationYears?: number;
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
  // From the Kol Zchut page "פיצוי במקרה של טיסה שהתבטלה" (page updated 7 Oct 2026), pasted by the owner 4 Nov 2026.
  // Start date ASSUMED to be 1 Jan 2026 (yearly indexation) — to confirm. Earlier years: to be added.
  datedAmounts: [
    { from: '2026-01-01', amounts: [1530, 2450, 3670], source: 'Kol Zchut, cancelled-flight compensation, updated 7 Oct 2026' },
  ],
  reroutingReductionWithinMin: { 0: 120, 1: 180, 2: 240 },
  noCompensationPeriods: [
    { from: '2023-10-07', to: '2023-11-30', why: 'Swords of Iron emergency provisions' },
    { from: '2024-04-12', to: '2024-04-18', why: 'Swords of Iron emergency provisions' },
    { from: '2024-08-03', to: '2024-08-08', why: 'Swords of Iron emergency provisions' },
    { from: '2024-10-01', to: '2024-10-05', why: 'Swords of Iron emergency provisions' },
    { from: '2023-12-01', to: '2024-02-29', minNoticeDays: 3, why: 'Swords of Iron emergency provisions (cancellation notified at least 3 days ahead)' },
  ],
  airlinePaymentDays: 45,
  limitationYears: 4,
  cancellationNotice: EU_CANCELLATION,
  sources: [
    { title: 'Aviation Services Law (Compensation and Assistance for Flight Cancellation or Change of Conditions), 5772-2012', url: '' }, // official link to be added when the text is checked
    { title: 'Kol Zchut: compensation for a cancelled flight (yearly amounts)', url: 'https://www.kolzchut.org.il/he/%D7%A4%D7%99%D7%A6%D7%95%D7%99_%D7%91%D7%9E%D7%A7%D7%A8%D7%94_%D7%A9%D7%9C_%D7%98%D7%99%D7%A1%D7%94_%D7%A9%D7%94%D7%AA%D7%91%D7%98%D7%9C%D7%94' },
  ],
  notes: [
    'Amounts are index-linked and change each year; each yearly table is entered with the date it applies from.',
    'Notice periods (14 / 7 days; 2h-4h and 1h-2h rerouting windows) match EU261. Rerouted arrival within 2h / 3h / 4h by band: half compensation.',
    'No compensation for strikes, avoiding Shabbat or a festival, special circumstances outside the airline\'s control, or an emergency (e.g. airspace closure in the war with Iran). Damages may still be claimable.',
    'Airline must pay compensation within 45 days of the written claim (refunds 21 days). Limitation 4 years. Section 11: up to 12,240 NIS without proof of damage. Small claims limit 39,900 NIS (Jan 2026).',
  ],
};

export const RULE_SETS = { EU261: EU261_V1, UK261: UK261_V1, ASL: ASL_V1 } as const;
