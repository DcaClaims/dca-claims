begin;
do $$
declare n int;
begin
  select count(*) into n from pg_tables where schemaname = 'public' and not rowsecurity;
  if n > 0 then raise exception '% table(s) without row-level security', n; end if;
end $$;
rollback;
