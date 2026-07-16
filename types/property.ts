export type Property = {
  id: string;
  host_id: string | null;
  name: string;
  short_description: string;
  city: string;
  state: string;
  postal_code: string;
  site_address: string;
  price_per_hour: number;
  acreage: number | null;
  is_fully_fenced: boolean;
  fence_height_feet: number | null;
  instant_book: boolean;
  average_rating: number;
  review_count: number;
  hero_image_url: string | null;
  hero_image_signed_url?: string;
  is_published: boolean;
  is_temporarily_closed: boolean;
  view_count: number;
  booking_count?: number;
  created_at: string;
  updated_at: string;
};

export type PropertyDraftDetails = {
  property_id: string;
  parking_instructions: string;
  gate_access_instructions: string;
  arrival_instructions: string;
  property_rules: string;
  availability_notes: string;
};

export type PropertyImage = {
  id: string;
  property_id: string;
  storage_path: string;
  alt_text: string;
  display_order: number;
  is_cover: boolean;
  signed_url?: string;
};

export type PropertyAvailability = {
  day_of_week: number;
  start_time: string;
  end_time: string;
};

export type PropertyDateAvailability = {
  id: string;
  property_id: string;
  availability_date: string;
  is_open: boolean;
  start_time: string | null;
  end_time: string | null;
  created_at: string;
  updated_at: string;
};
