-- A Parent Profile must exist before its first dog profile can be created.
-- Allow a temporary zero-dog draft during that required onboarding step.
alter table public.guest_profiles
  drop constraint if exists guest_profiles_dog_count_check;

alter table public.guest_profiles
  add constraint guest_profiles_dog_count_check
  check (dog_count >= 0 and dog_count <= 20);
