alter table public.finance_month_snapshots
  add column if not exists source_updated_at timestamptz;

comment on column public.finance_month_snapshots.source_updated_at is
  'Versão exata de finance_state que originou este snapshot; usada para impedir que gravações antigas sobrescrevam versões mais novas.';
