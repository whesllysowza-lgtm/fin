-- Enable Realtime changes for the authenticated user's finance snapshot.
-- Existing row-level security policies continue to restrict events by user_id.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'finance_state'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.finance_state;
  END IF;
END
$$;
