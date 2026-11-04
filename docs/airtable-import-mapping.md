# Airtable → new system: import mapping

Source: base `appq7TzI6DS5RaxZp` (DCA Claims), schema read 4 Nov 2026. The import is **read-only** on Airtable.
Every imported row keeps its Airtable record ID (`airtable_record_id`) so the import can be re-run and reconciled.

## Tables

| Airtable table | New table(s) | Notes |
|---|---|---|
| Claims | `claims`, `clients`, `client_emails`, `deadlines`, `audit_log` | One Airtable claim → one claim. Client fields become a client (deduplicated by email). |
| Booking ref | `bookings` | `Booking ref` → `pnr`. `single_reservation` is not in Airtable: imported as *not established*. |
| Passengers | `passengers`, `claim_passengers` | `Regular / infant` → `is_infant`. `Claim participation` decides whether the passenger is linked to the claim. |
| Segments | `sectors`, `disruptions` | `Segment order` → `seq`; `Airline` → `operating_carrier` (needs checking: Airtable does not say operating vs marketing). `is_affected_flight` → the disruption's `sector_id`. |
| Users | `users` | Role `Admin` → `owner`, `Employee` → `caseworker` (to confirm). |
| Travel Agents | `partners` | `Travel agent URL` / record ID → `slug`. Commission rate is not in Airtable: left empty until you set it. |
| Documents | `documents` | Each attachment is **downloaded during the import** (Airtable file links expire), hashed (SHA-256) and stored as an original. `Document type` → `kind`. `Expense amount / currency / type` are kept as the document's declared total, to be checked against the line-by-line reader later. |
| Incoming emails | `messages` (direction `in`), `message_claims` | `Email thread ID` is kept as metadata. Airtable does not store the Message-ID header, so imported mail is linked to claims by the existing Claims link, marked `matched_by = manual`. |
| Outgoing emails | `messages` (direction `out`), `message_claims` | Same as above. Each is also written to the send log as a completed action, so nothing already sent can be sent again. |
| Drafts | not imported | Old drafts are history only; the PDFs stay in Airtable. |
| Tasks | `deadlines` (kind `other`) and the claim's `next_action` | Open tasks become deadlines; done tasks go to the audit log. |
| Airlines, Escalation Authorities | directory (email domains) now; playbooks later | `Airline email` / `Escalation email` domains feed the email matcher. `Is_EU_or_UK_Carrier` is compared with the carrier licence table and differences are listed for you. |

## Claims fields

| Airtable field | New field | Notes |
|---|---|---|
| Claim Number | `legacy_ref` | Kept so you can find "161" by its old number. New claims get new numbers. |
| Status | `status` | Mapped one to one; list below. |
| Client name / email / phone / Preferred language | `clients` | Language: English → `en`, Hebrew → `he`, French → `fr`. |
| Airline Ref | `airline_case_ref` | Used by the email matcher. |
| Escalation Ref | `authority_case_ref` | Used by the email matcher. |
| Airlines (link) | `airline` (IATA code from the linked airline) | |
| Users (link) | `owner_user_id` | |
| Travel Agents (link) | `bookings.partner_id` | |
| Origin, Destination, Flight number, Scheduled/actual times | `sectors`, `disruptions` | Only when there are no Segments rows for the claim. |
| Actual arrival time UTC | `disruptions.final_arrival` | Source recorded as "Airtable (imported)". |
| Compensation type | `disruptions.kind` | Delay / cancellation / denied boarding / baggage. |
| APPLICABLE LAW, COMPENSATION AMOUNT DUE | not imported as facts | Recalculated by the new rules engine; the old values are kept in the import report for comparison. |
| TS – … timestamps | `audit_log` | One "status reached" event per filled timestamp, so the history is preserved. |
| Days Since Claim Filed, counts, rollups | not imported | Calculated by the new system. |
| Internal notes, Client message, Initial check response, Claim summary | kept as notes on the claim | |
| Terms & services, Has not claimed before | claim flags | The T&Cs version is not in Airtable; `fee_agreements` gets `tnc_version = 'pre-2027 (Airtable)'` and 25% until confirmed per case. |

## Things Airtable doesn't hold (filled as "not established")

- Whether the flights were one reservation.
- Operating carrier per flight (the Segments `Airline` field may be the marketing carrier).
- When the passenger was told of a cancellation, and any rerouting offered.
- Expense line items (Airtable holds one total per document).
- Message-ID headers for imported emails.

## Reconciliation report (produced by every import run)

For each table: rows in Airtable, rows imported, rows skipped with the reason. For claims: number of documents
and emails per claim on both sides, and the sum of expense totals. Any difference stops the switch.
