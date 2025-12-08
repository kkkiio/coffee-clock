-- Enable Row Level Security (RLS) is recommended for all tables
-- Create the coffee logs table
create table public.coffee_logs (
  id uuid not null default gen_random_uuid (),
  created_at timestamp with time zone not null default now(),
  user_id uuid not null default auth.uid (), -- Automatically gets the current user's ID
  drank_at timestamp with time zone not null default now(),
  caffeine_amount integer not null default 100, -- in mg
  coffee_type text null,
  
  constraint coffee_logs_pkey primary key (id),
  constraint coffee_logs_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade
);

-- Enable RLS
alter table public.coffee_logs enable row level security;

-- Create policies
-- Policy to allow users to see only their own logs
create policy "Users can view their own coffee logs" on public.coffee_logs
  for select
  using (auth.uid() = user_id);

-- Policy to allow users to insert their own logs
create policy "Users can insert their own coffee logs" on public.coffee_logs
  for insert
  with check (auth.uid() = user_id);

-- Policy to allow users to update their own logs
create policy "Users can update their own coffee logs" on public.coffee_logs
  for update
  using (auth.uid() = user_id);

-- Policy to allow users to delete their own logs
create policy "Users can delete their own coffee logs" on public.coffee_logs
  for delete
  using (auth.uid() = user_id);
