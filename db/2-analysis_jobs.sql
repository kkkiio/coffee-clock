-- Create the analysis_jobs table to store background task results
create table public.analysis_jobs (
  id uuid not null default gen_random_uuid (),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  user_id uuid not null default auth.uid (), -- Owner of the job
  status text not null default 'pending', -- pending, processing, completed, failed
  result jsonb null, -- Stores the GLM analysis result
  error_message text null,
  
  constraint analysis_jobs_pkey primary key (id),
  constraint analysis_jobs_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade
);

-- Enable Row Level Security
alter table public.analysis_jobs enable row level security;

-- Policies

-- 1. Users can view their own jobs
create policy "Users can view their own analysis jobs" on public.analysis_jobs
  for select
  using (auth.uid() = user_id);

-- 2. Users can insert their own jobs (Initial state)
create policy "Users can create their own analysis jobs" on public.analysis_jobs
  for insert
  with check (auth.uid() = user_id);

-- 3. Service Role (Server-side) bypasses RLS automatically, but explicit policies for updates can be added if needed.
-- Ideally, we don't allow users to UPDATE the result manually, only the system.
-- But standard RLS prevents update unless we add a policy.
-- Since the background function uses the SERVICE_ROLE_KEY, it bypasses RLS completely.
-- So users DO NOT need an UPDATE policy, which protects the data integrity.
