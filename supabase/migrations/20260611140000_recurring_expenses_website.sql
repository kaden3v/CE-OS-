-- Optional website/domain for a subscription, used to fetch the company logo
-- (e.g. "shopify.com"). Nullable; the UI guesses from the name when blank.
alter table public.recurring_expenses
  add column if not exists website text;
