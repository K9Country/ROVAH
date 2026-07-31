import { supabase } from './supabase';

export type PendingSiteReview = {
  bookingId: string;
  propertyId: string;
  siteName: string;
  completedAt: string;
};

type ReviewBookingRow = {
  id: string;
  property_id: string;
  end_at: string;
  properties: { name: string } | { name: string }[] | null;
};

/**
 * Returns only the signed-in member's completed, still-unreviewed visits.
 * RLS additionally protects both source tables; this client filter is only
 * presentation logic and never grants access by itself.
 */
export async function getPendingSiteReviews(userId: string): Promise<PendingSiteReview[]> {
  const now = new Date().toISOString();
  const [bookingsResult, reviewsResult] = await Promise.all([
    supabase
      .from('bookings')
      .select('id, property_id, end_at, properties(name)')
      .eq('guest_id', userId)
      .eq('status', 'confirmed')
      .lte('end_at', now)
      .order('end_at', { ascending: false }),
    supabase
      .from('booking_reviews')
      .select('booking_id')
      .eq('reviewer_id', userId)
      .eq('review_type', 'guest_to_host'),
  ]);

  if (bookingsResult.error) throw bookingsResult.error;
  if (reviewsResult.error) throw reviewsResult.error;

  const reviewedBookingIds = new Set((reviewsResult.data ?? []).map((review) => review.booking_id));

  return ((bookingsResult.data ?? []) as ReviewBookingRow[])
    .filter((booking) => !reviewedBookingIds.has(booking.id))
    .map((booking) => {
      const property = Array.isArray(booking.properties)
        ? booking.properties[0] ?? null
        : booking.properties;

      return {
        bookingId: booking.id,
        propertyId: booking.property_id,
        siteName: property?.name ?? 'Private space',
        completedAt: booking.end_at,
      };
    });
}
