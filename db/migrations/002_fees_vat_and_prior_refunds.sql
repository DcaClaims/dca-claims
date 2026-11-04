-- Owner's rules, 4 Nov 2026:
--  * VAT is added to the fee only when the claim goes to DCA's Israeli lawyers.
--  * The 25% is charged on what DCA recovers, not on money the client had already received before DCA acted.
alter table fee_agreements
  add column lawyers_used boolean not null default false,
  add column received_before_dca numeric(10,2) not null default 0,
  add column received_before_dca_currency char(3);
comment on column fee_agreements.vat_rate is 'Applied only when lawyers_used is true.';
