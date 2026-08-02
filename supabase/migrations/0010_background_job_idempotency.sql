ALTER TABLE public.background_jobs
  ADD COLUMN IF NOT EXISTS deduplication_key text;

CREATE UNIQUE INDEX IF NOT EXISTS background_jobs_deduplication_key_key
  ON public.background_jobs (deduplication_key)
  WHERE deduplication_key IS NOT NULL;
