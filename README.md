# DCA Claims

Case-management system for DCA Ventures Ltd (DCA Claims). This repository is the **Milestone 1 core**:
the parts that decide things and the parts that keep sending safe. Screens, the mailbox connection and
the Airtable importer are built on top of it once hosting accounts exist.

## What is here

| Folder | What it does |
|---|---|
| `db/migrations` | Postgres schema (Supabase). Tested by `npm run db:test` against a throwaway local Postgres. |
| `src/rules` | EU261 / UK261 / ASL assessment. Shows its working, never says "not covered" for missing facts, flags uncertainty. Rules are versioned data in `ruleSets.ts`, all **draft** until approved. |
| `src/mail` | Sorts incoming mail (case, new enquiry, spam, unrelated, uncertain) and matches it to cases. Uncertain mail is never forced into a case. Flags suspicious content and lookalike senders. |
| `src/drafting` | Wraps outside content as evidence for the AI, and checks drafts for other cases' data and unsupported amounts or dates. |
| `src/sending` | The only way anything leaves: pause, sending stage (A/B/C), exact approval, stale-approval check, one sender per case, duplicate key, "uncertain" handling. |
| `data` | Airport coordinates (OurAirports, public domain) and carrier licences (draft). |
| `docs` | Airtable import mapping. |

## Running

Requires Node 22.18+ (runs TypeScript directly) and, for the schema test, Postgres 16 binaries.

```
npm test          # unit tests
npm run db:test   # schema tests
npm run typecheck
```

## Status

Draft rules: every legal rule set is `status: 'draft'` and every result says so until the owner approves it.
Carrier licences in `data/carriers.json` are a draft list to be checked.
