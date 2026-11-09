import 'server-only';
import { adminClient } from '@/lib/supabase/server';
import { buildDataset, type Tables } from '@/src/data/build.ts';
import type { Dataset } from '@/src/demo/view.ts';

const TABLES: (keyof Tables)[] = [
  'claims', 'bookings', 'passengers', 'claim_passengers', 'sectors', 'disruptions', 'deadlines', 'documents',
  'fee_agreements', 'case_facts', 'clients', 'client_emails', 'messages', 'message_claims', 'drafts',
];

/** Reads everything the screens need. Fine for hundreds of cases; paging comes with the Airtable import. */
export async function loadLive(): Promise<Dataset> {
  const db = adminClient();
  const results = await Promise.all(TABLES.map((t) => db.from(t).select('*').limit(10000)));
  const tables = {} as Tables;
  results.forEach((r, n) => {
    if (r.error) throw new Error(`Could not read ${TABLES[n]}: ${r.error.message}`);
    tables[TABLES[n]] = r.data ?? [];
  });
  return buildDataset(tables, new Date().toISOString());
}
