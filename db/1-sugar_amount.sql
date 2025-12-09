-- Add sugar_amount column to coffee_logs table
-- Default to 0 so existing logs represent sugar-free drinks (or unknown)
alter table public.coffee_logs
add column sugar_amount integer not null default 0; -- in grams
