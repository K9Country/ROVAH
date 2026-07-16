export type GuestProfile = {
  user_id: string;
  full_name: string;
  email: string;
  phone: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  postal_code: string;
  dog_count: number;
  dog_details: string;
  profile_image_path: string | null;
  profile_completed_at: string | null;
  created_at: string;
  updated_at: string;
};
