-- The simplified member site review records two additional public Yes/No answers.
-- Existing reviews remain valid and intentionally have no value for these new questions.
alter table public.booking_reviews
  add column if not exists property_matches_listing text
    check (property_matches_listing in ('yes', 'no')),
  add column if not exists would_book_again text
    check (would_book_again in ('yes', 'no'));
