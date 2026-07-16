export type ReviewDirection = 'guest_to_host' | 'host_to_guest';
export type ReviewAnswer = 'yes' | 'no' | 'not_sure';

export type BookingReview = {
  id: string;
  booking_id: string;
  property_id: string;
  reviewer_id: string;
  reviewee_id: string;
  review_type: ReviewDirection;
  bone_rating: number;
  review_text: string;
  comment_visibility: 'public' | 'private';
  fence_security: ReviewAnswer;
  cleanliness: ReviewAnswer;
  nearby_distractions: string[];
  unexpected_encounters: string;
  photo_urls: string[];
  created_at: string;
};
