CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  storage_path text NOT NULL,
  mime text,
  size_bytes bigint,
  status text NOT NULL DEFAULT 'queued',
  error text,
  tree jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own docs select" ON public.documents FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "own docs insert" ON public.documents FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "own docs update" ON public.documents FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "own docs delete" ON public.documents FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE TABLE public.backlog_stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  points int NOT NULL,
  confidence numeric,
  rationale text,
  risk text,
  criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backlog_stories TO authenticated;
GRANT ALL ON public.backlog_stories TO service_role;
ALTER TABLE public.backlog_stories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own stories select" ON public.backlog_stories FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "own stories insert" ON public.backlog_stories FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "own stories delete" ON public.backlog_stories FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE POLICY "own files read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own files insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own files delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);