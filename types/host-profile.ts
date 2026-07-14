export type HostProfile = {
  user_id: string;
  full_name: string;
  phone_number: string;
  city: string;
  state: string;
  confirms_property_control: boolean;
  agrees_to_host_terms: boolean;
  onboarding_status: 'started' | 'submitted' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
};
