-- Reviews are immutable records. New reviews are allowed through the narrowly
-- scoped INSERT policies; no authenticated client can alter or remove one.
revoke update, delete on table public.booking_reviews from authenticated;
