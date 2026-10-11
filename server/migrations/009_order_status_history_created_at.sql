ALTER TABLE public.order_status_history
  ADD COLUMN IF NOT EXISTS created_at timestamptz;

DO $$
DECLARE
  has_changed_at boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'order_status_history'
       AND column_name = 'changed_at'
  ) INTO has_changed_at;

  IF has_changed_at THEN
    EXECUTE
      'UPDATE public.order_status_history
          SET created_at = changed_at
        WHERE created_at IS NULL';
  END IF;

  UPDATE public.order_status_history
     SET created_at = now()
   WHERE created_at IS NULL;

  ALTER TABLE public.order_status_history
    ALTER COLUMN created_at SET DEFAULT now(),
    ALTER COLUMN created_at SET NOT NULL;
END $$;

CREATE INDEX IF NOT EXISTS order_status_history_order_status_created_idx
  ON public.order_status_history (order_id, status, created_at DESC, id DESC);
