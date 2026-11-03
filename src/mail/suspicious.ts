// Outside content is evidence, never instructions. This module only DETECTS content that looks like an
// attempt to instruct the system or to redirect money, so it can be flagged to a person. The real protection
// is structural: the drafting AI cannot take actions (see src/drafting/guard.ts and src/sending/).

import type { Directory, IncomingMessage, Suspicion } from './types.ts';

const INSTRUCTION_PATTERNS: [RegExp, string][] = [
  [/\b(ignore|disregard|forget)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|your)\b[^.\n]{0,20}\b(instructions?|rules|prompts?)\b/i, 'asks to ignore instructions'],
  [/\b(system|developer)\s+(prompt|message|instructions?)\b/i, 'mentions system instructions'],
  [/\byou are (now )?(an? )?(ai|assistant|language model|chatgpt|claude|gpt)\b/i, 'addresses an AI directly'],
  [/\b(as an? )?(ai|assistant)[, ]+(you must|please|you should)\b/i, 'addresses an AI directly'],
  [/\b(send|forward|email|share|upload)\b[^.\n]{0,40}\b(all|every|other)\b[^.\n]{0,40}\b(passports?|documents|files|clients?|cases?|claims?|data|records)\b/i, 'asks for other data to be sent'],
  [/\b(do not|don't|never)\s+(tell|inform|notify|alert|copy)\b/i, 'asks to keep something from you'],
  [/\b(approve|mark|set)\b[^.\n]{0,30}\b(as )?(paid|approved|closed|settled)\b[^.\n]{0,30}\b(automatically|without review|now)\b/i, 'asks for an automatic status change'],
];

const BANK_PATTERNS: RegExp[] = [
  /\b(bank|account|payment|iban|sort code|beneficiary)\b[^.\n]{0,30}\b(details|information|number|account)?\b[^.\n]{0,20}\b(have|has|were|was)?\s*(changed|updated|replaced|moved)\b/i,
  /\bnew\s+(bank|iban|account|sort code|beneficiary)\b/i,
  /\b(pay|transfer|send)\b[^.\n]{0,40}\b(to|into)\b[^.\n]{0,20}\b(this|the following|our new|a different)\s+(account|iban)\b/i,
];

export const domainOf = (address: string) => address.trim().toLowerCase().split('@').pop() ?? '';

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

/** Registrable name, e.g. "lufthansa" from "mail.lufthansa.com"; good enough for lookalike checks. */
const brand = (domain: string) => {
  const parts = domain.split('.');
  return parts.length >= 2 ? parts[parts.length - 2] : domain;
};

export function knownDomain(domain: string, dir: Directory): boolean {
  const all = [...dir.ownDomains, ...dir.parties.map((p) => p.domain)];
  return all.some((d) => domain === d || domain.endsWith('.' + d));
}

export function detectSuspicious(msg: IncomingMessage, dir: Directory): Suspicion[] {
  const out: Suspicion[] = [];
  const texts: [string, string][] = [
    ['subject', msg.subject ?? ''],
    ['body', msg.bodyText ?? ''],
    ...(msg.attachments ?? []).map((a) => [`attachment ${a.filename}`, a.text ?? ''] as [string, string]),
  ];
  for (const [where, text] of texts) {
    for (const [re, detail] of INSTRUCTION_PATTERNS) if (re.test(text)) out.push({ kind: 'instruction', detail, where });
    if (BANK_PATTERNS.some((re) => re.test(text))) out.push({ kind: 'bank_change', detail: 'mentions changed or new bank details', where });
  }

  const domain = domainOf(msg.from.address);
  if (!knownDomain(domain, dir)) {
    const known = [...dir.ownDomains, ...dir.parties.map((p) => p.domain)];
    for (const k of known) {
      const kb = brand(k);
      const db = brand(domain);
      const close = editDistance(domain, k) <= 2 || (kb.length >= 4 && db !== kb && editDistance(db, kb) <= 1);
      const contains = kb.length >= 4 && domain.includes(kb);
      if (close || contains) {
        out.push({ kind: 'lookalike_domain', detail: `${domain} looks like ${k}`, where: 'sender' });
        break;
      }
    }
    const name = (msg.from.name ?? '').toLowerCase();
    for (const p of dir.parties) {
      if (name && name.includes(p.name.toLowerCase())) {
        out.push({ kind: 'name_spoof', detail: `sender name says "${p.name}" but the address is ${domain}`, where: 'sender' });
        break;
      }
    }
  }
  // De-duplicate identical findings.
  return out.filter((s, i) => out.findIndex((t) => t.kind === s.kind && t.detail === s.detail && t.where === s.where) === i);
}
