export type HostStatus = 'pending' | 'active' | 'suspended' | 'rejected';

export type HostProfile = {
  id: string;
  user_id: string;
  full_name: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  primary_site_address: string | null;
  primary_site_city: string | null;
  primary_site_state: string | null;
  primary_site_postal_code: string | null;
  controls_property: boolean;
  accepted_host_terms_at: string | null;
  onboarding_completed_at: string | null;
  status: HostStatus;
  is_verified: boolean;
  is_active: boolean;
  profile_image_path: string | null;
  created_at: string;
  updated_at: string;
};
