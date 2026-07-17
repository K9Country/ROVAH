import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    Modal,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../../constants/theme';
import { ensureMessagingSession } from '../../lib/anonymous-session';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../services/auth-context';
import type { Property } from '../../types/property';

type DiscoverImage = {
  id: string;
  property_id: string;
  storage_path: string;
  display_order: number;
  is_cover: boolean;
  signed_url?: string;
};

type DiscoverProperty = Property & {
  images: DiscoverImage[];
  amenities: string[];
};

const amenityFilters = [
  { code: 'water', label: 'Water bowl' },
  { code: 'shade', label: 'Shade' },
  { code: 'picnic_table', label: 'Picnic table' },
  { code: 'restroom', label: 'Restroom' },
  { code: 'parking', label: 'Parking' },
  { code: 'cell_service', label: 'Cell service' },
  { code: 'wheelchair_accessible', label: 'Wheelchair accessible' },
] as const;

const activityFilters = [
  { code: 'tennis_ball', label: 'Play area' },
  { code: 'frisbee', label: 'Frisbee space' },
  { code: 'agility_equipment', label: 'Agility equipment' },
] as const;

const propertyFeatureFilters = [
  { code: 'swimming_pool', label: 'Swimming pool' },
  { code: 'agility_course', label: 'Agility course' },
  { code: 'hiking_trails', label: 'Hiking trails' },
  { code: 'lake_access', label: 'Lake access' },
] as const;

export default function SearchScreen() {
  const { isMember, session } = useAuth();
  const [query, setQuery] = useState('');
  const [radiusMiles, setRadiusMiles] = useState('');
  const [properties, setProperties] = useState<DiscoverProperty[]>([]);
  const [favoritePropertyIds, setFavoritePropertyIds] = useState<string[]>([]);
  const [favoriteSavingId, setFavoriteSavingId] = useState<string | null>(null);
  const [selectedImageIdByProperty, setSelectedImageIdByProperty] = useState<
    Record<string, string>
  >({});
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [requiresFullFence, setRequiresFullFence] = useState(false);
  const [minimumFenceHeight, setMinimumFenceHeight] = useState(0);
  const [minimumAcreage, setMinimumAcreage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [canAccessHostDashboard, setCanAccessHostDashboard] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    null
  );

  const normalizedQuery = query.trim().toLowerCase();

  const filteredProperties = useMemo(() => {
    return properties.filter((property) => {
      const searchableText = [
        property.name,
        property.short_description,
        property.city,
        property.state,
        property.postal_code,
      ]
        .join(' ')
        .toLowerCase();

      const matchesQuery =
        !normalizedQuery || searchableText.includes(normalizedQuery);
      const matchesFence =
        !requiresFullFence || property.is_fully_fenced;
      const matchesFenceHeight =
        minimumFenceHeight === 0 ||
        (property.fence_height_feet ?? 0) >= minimumFenceHeight;
      const matchesAcreage =
        minimumAcreage === 0 || (property.acreage ?? 0) >= minimumAcreage;
      const matchesAmenities = selectedAmenities.every((amenity) =>
        property.amenities.includes(amenity)
      );

      return (
        matchesQuery &&
        matchesFence &&
        matchesFenceHeight &&
        matchesAcreage &&
        matchesAmenities
      );
    });
  }, [
    minimumAcreage,
    minimumFenceHeight,
    normalizedQuery,
    properties,
    requiresFullFence,
    selectedAmenities,
  ]);

  const memberId = isMember ? session?.user.id : undefined;

  const loadProperties = useCallback(async () => {
    setErrorMessage(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    await ensureMessagingSession(session);

    const { data, error } = await supabase
      .from('properties')
      .select(
        `
          id,
          host_id,
          name,
          short_description,
          city,
          state,
          postal_code,
          price_per_hour,
          acreage,
          is_fully_fenced,
          fence_height_feet,
          instant_book,
          average_rating,
          review_count,
          hero_image_url,
          is_published,
          created_at,
          updated_at
        `
      )
      .eq('is_published', true)
      .order('created_at', { ascending: false });

    if (error) {
      setErrorMessage(error.message);
      setProperties([]);
      return;
    }

    const propertyRows = (data ?? []) as Property[];
    const { data: reviewRows } = propertyRows.length > 0
      ? await supabase.from('booking_reviews').select('property_id, bone_rating').eq('review_type', 'guest_to_host').in('property_id', propertyRows.map((property) => property.id))
      : { data: [] as { property_id: string; bone_rating: number }[] };
    const ratingsByProperty = new Map<string, number[]>();
    (reviewRows ?? []).forEach((review) => ratingsByProperty.set(review.property_id, [...(ratingsByProperty.get(review.property_id) ?? []), review.bone_rating]));
    const ratedPropertyRows = propertyRows.map((property) => {
      const ratings = ratingsByProperty.get(property.id) ?? [];
      return ratings.length === 0 ? property : { ...property, average_rating: ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length, review_count: ratings.length };
    });
    const propertyIds = propertyRows.map((property) => property.id);

    if (propertyIds.length === 0) {
      setProperties([]);
      setFavoritePropertyIds([]);
      return;
    }

    const [imageResult, amenityResult, favoriteResult] = await Promise.all([
      supabase
        .from('property_images')
        .select('id, property_id, storage_path, display_order, is_cover')
        .in('property_id', propertyIds)
        .order('display_order'),
      supabase
        .from('property_amenities')
        .select('property_id, amenity_code')
        .in('property_id', propertyIds),
      memberId
        ? supabase
            .from('property_favorites')
            .select('property_id')
            .eq('user_id', memberId)
            .in('property_id', propertyIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (imageResult.error || amenityResult.error || favoriteResult.error) {
      setErrorMessage(imageResult.error?.message ?? amenityResult.error?.message ?? favoriteResult.error?.message ?? 'Unable to load property details.');
      setProperties([]);
      return;
    }

    setFavoritePropertyIds(
      (favoriteResult.data ?? []).map((favorite) => favorite.property_id)
    );

    const imagesWithUrls = await Promise.all(
      ((imageResult.data ?? []) as DiscoverImage[]).map(async (image) => {
        const { data: signedImage } = await supabase.storage
          .from('property-images')
          .createSignedUrl(image.storage_path, 60 * 60);

        return { ...image, signed_url: signedImage?.signedUrl };
      })
    );

    const amenitiesByProperty = (amenityResult.data ?? []).reduce<Record<string, string[]>>(
      (groupedAmenities, amenity) => {
        groupedAmenities[amenity.property_id] = [
          ...(groupedAmenities[amenity.property_id] ?? []),
          amenity.amenity_code,
        ];
        return groupedAmenities;
      },
      {}
    );

    const imagesByProperty = imagesWithUrls.reduce<Record<string, DiscoverImage[]>>(
      (groupedImages, image) => {
        groupedImages[image.property_id] = [
          ...(groupedImages[image.property_id] ?? []),
          image,
        ];
        return groupedImages;
      },
      {}
    );

    setProperties(
      ratedPropertyRows.map((property) => ({
        ...property,
        images: imagesByProperty[property.id] ?? [],
        amenities: amenitiesByProperty[property.id] ?? [],
      }))
    );
  }, [memberId]);

  useEffect(() => {
    const checkHostAccess = async () => {
      if (!session?.user.id) {
        setCanAccessHostDashboard(false);
        return;
      }

      const { data, error } = await supabase
        .from('host_profiles')
        .select('user_id')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (!error) {
        setCanAccessHostDashboard(Boolean(data));
      } else {
        setCanAccessHostDashboard(false);
      }
    };

    void checkHostAccess();
  }, [session?.user.id]);

  useEffect(() => {
    const initialize = async () => {
      try {
        setIsLoading(true);
        await loadProperties();
      } catch {
        setErrorMessage(
          'We could not load properties. Please try again.'
        );
      } finally {
        setIsLoading(false);
      }
    };

    void initialize();
  }, [loadProperties]);

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      await loadProperties();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleUseCurrentLocation = () => {
    Alert.alert(
      'Location access',
      'Current-location searching will be connected when we add maps and device location.'
    );
  };

  const activeFilterCount =
    selectedAmenities.length +
    Number(requiresFullFence) +
    Number(minimumFenceHeight > 0) +
    Number(minimumAcreage > 0);

  const toggleAmenity = (amenity: string) => {
    setSelectedAmenities((current) =>
      current.includes(amenity)
        ? current.filter((item) => item !== amenity)
        : [...current, amenity]
    );
  };

  const clearFilters = () => {
    setSelectedAmenities([]);
    setRequiresFullFence(false);
    setMinimumFenceHeight(0);
    setMinimumAcreage(0);
  };

  const toggleFavorite = async (propertyId: string) => {
    if (!memberId) {
      Alert.alert(
        'Sign in to save favorites',
        'Create or sign in to a member account to save private spaces to your Favorites folder.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Sign In', onPress: () => router.push('/sign-in') },
        ]
      );
      return;
    }

    const isFavorite = favoritePropertyIds.includes(propertyId);

    try {
      setFavoriteSavingId(propertyId);

      const { error } = isFavorite
        ? await supabase
            .from('property_favorites')
            .delete()
            .eq('user_id', memberId)
            .eq('property_id', propertyId)
        : await supabase
            .from('property_favorites')
            .insert({ user_id: memberId, property_id: propertyId });

      if (error) {
        Alert.alert('Unable to update favorite', error.message);
        return;
      }

      setFavoritePropertyIds((current) =>
        isFavorite
          ? current.filter((id) => id !== propertyId)
          : [...current, propertyId]
      );
    } finally {
      setFavoriteSavingId(null);
    }
  };

  const renderProperty = ({ item }: { item: DiscoverProperty }) => {
    const location = `${item.city}, ${item.state}`;

    let fenceLabel = 'Not fully fenced';

    if (item.is_fully_fenced) {
      fenceLabel = item.fence_height_feet
        ? `${item.fence_height_feet}-ft fence`
        : 'Fully fenced';
    }

    const acreageLabel =
      item.acreage !== null
        ? `${item.acreage} acre${item.acreage === 1 ? '' : 's'}`
        : 'Acreage not listed';

    const selectedImageId = selectedImageIdByProperty[item.id];
    const selectedImage =
      item.images.find((image) => image.id === selectedImageId) ??
      item.images.find((image) => image.is_cover) ??
      item.images[0];
    const selectedImageUrl =
      selectedImage?.signed_url ??
      item.hero_image_signed_url ??
      item.hero_image_url;
    const isFavorite = favoritePropertyIds.includes(item.id);

    return (
      <View style={styles.propertyCard}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/property/${item.id}` as never)}
          style={({ pressed }) => pressed && styles.cardPressed}
        >
        {selectedImageUrl ? (
          <Image
            accessibilityLabel={`${item.name} selected property photo`}
            source={{ uri: selectedImageUrl }}
            style={styles.propertyImage}
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.imagePlaceholderIcon}>🌳</Text>

            <Text style={styles.imagePlaceholderText}>
              Property photo
            </Text>
          </View>
        )}

        {item.images.length > 1 ? (
          <View style={styles.photoCounter}>
            <Text style={styles.photoCounterText}>
              {(item.images.findIndex((image) => image.id === selectedImage?.id) + 1)} / {item.images.length}
            </Text>
          </View>
        ) : null}
        </Pressable>

        <Pressable
          accessibilityLabel={
            isFavorite
              ? `Remove ${item.name} from favorites`
              : `Save ${item.name} to favorites`
          }
          accessibilityRole="button"
          disabled={favoriteSavingId === item.id}
          onPress={() => void toggleFavorite(item.id)}
          style={({ pressed }) => [
            styles.favoriteButton,
            isFavorite && styles.favoriteButtonSelected,
            pressed && styles.cardPressed,
          ]}
        >
          {favoriteSavingId === item.id ? (
            <ActivityIndicator color={isFavorite ? colors.warmWhite : colors.brown} size="small" />
          ) : (
            <Text style={[styles.favoriteIcon, isFavorite && styles.favoriteIconSelected]}>
              {isFavorite ? '♥' : '♡'}
            </Text>
          )}
        </Pressable>

        {item.images.length > 1 ? (
          <ScrollView
            contentContainerStyle={styles.thumbnailRow}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {item.images.map((image) => {
              const isSelected = image.id === selectedImage?.id;

              return (
                <Pressable
                  accessibilityLabel={`Show property photo ${item.images.findIndex((candidate) => candidate.id === image.id) + 1}`}
                  accessibilityRole="button"
                  key={image.id}
                  onPress={() =>
                    setSelectedImageIdByProperty((current) => ({
                      ...current,
                      [item.id]: image.id,
                    }))
                  }
                  style={[
                    styles.thumbnailButton,
                    isSelected && styles.thumbnailButtonSelected,
                  ]}
                >
                  {image.signed_url ? (
                    <Image source={{ uri: image.signed_url }} style={styles.thumbnailImage} />
                  ) : (
                    <View style={styles.thumbnailPlaceholder} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/property/${item.id}` as never)}
          style={({ pressed }) => [
            styles.propertyContent,
            pressed && styles.cardPressed,
          ]}
        >
          <View style={styles.propertyHeader}>
            <View style={styles.propertyHeading}>
              <Text style={styles.propertyName}>{item.name}</Text>

              <Text style={styles.propertyLocation}>
                {location}
              </Text>
            </View>

            {item.instant_book ? (
              <View style={styles.instantBookBadge}>
                <Text style={styles.instantBookText}>
                  Instant Book
                </Text>
              </View>
            ) : null}
          </View>

          <View style={{ alignItems: 'flex-start', marginTop: 8 }}>
            <Text style={{ color: colors.brown, fontSize: 14, fontWeight: '900' }}>🦴 {Number(item.average_rating).toFixed(1)} guest rating</Text>
          </View>

          <Text
            numberOfLines={2}
            style={styles.propertyDescription}
          >
            {item.short_description}
          </Text>

          <View style={styles.detailRow}>
            <Text style={styles.detailText}>
              {acreageLabel}
            </Text>

            <Text style={styles.detailDot}>•</Text>

            <Text style={styles.detailText}>{fenceLabel}</Text>
          </View>

          <View style={styles.propertyFooter}>
            <Text style={styles.priceText}>
              ${Number(item.price_per_hour).toFixed(0)}
              <Text style={styles.priceUnit}> / hour</Text>
            </Text>
          </View>
        </Pressable>

        <Pressable
          accessibilityLabel={`Message the host of ${item.name}`}
          accessibilityRole="button"
          onPress={() => router.push(`/messages/${item.id}` as never)}
          style={({ pressed }) => [styles.messageHostButton, pressed && styles.cardPressed]}
        >
          <Text style={styles.messageHostIcon}>💬</Text>
          <Text style={styles.messageHostText}>Message Host</Text>
        </Pressable>
      </View>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centeredState}>
          <ActivityIndicator size="large" color="#263A24" />

          <Text style={styles.stateText}>
            Finding private spaces...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={filteredProperties}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <Text style={styles.backButtonText}>
                ← Member Dashboard
              </Text>
            </Pressable>

            <Image source={require('../../assets/images/k9-8.png')} style={styles.discoverHeaderImage} />

            <Text style={styles.title}>
              Find a private space
            </Text>

            <Text style={styles.subtitle}>
              Search for peaceful outdoor properties where your
              family and dog can enjoy exclusive access.
            </Text>

            {canAccessHostDashboard ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/host-dashboard' as never)}
                style={styles.hostReturnLink}
              >
                <Text style={styles.hostReturnLinkText}>Return to Host Dashboard</Text>
              </Pressable>
            ) : null}

            <View style={styles.searchPanel}>
              <Text style={styles.inputLabel}>
                Where do you want to go?
              </Text>

              <TextInput
                accessibilityLabel="Search by city, ZIP code, or property name"
                autoCapitalize="words"
                autoCorrect={false}
                onChangeText={setQuery}
                placeholder="City, ZIP code, or property name"
                placeholderTextColor="#8A877D"
                returnKeyType="search"
                style={styles.searchInput}
                value={query}
              />

              <Pressable
                accessibilityRole="button"
                onPress={handleUseCurrentLocation}
                style={styles.locationButton}
              >
                <Text style={styles.locationButtonText}>
                  ◎ Use my current location
                </Text>
              </Pressable>

              <Text style={styles.radiusLabel}>
                Search radius (miles)
              </Text>

              <TextInput
                accessibilityLabel="Search radius in miles"
                keyboardType="number-pad"
                maxLength={3}
                onChangeText={setRadiusMiles}
                placeholder="Enter miles"
                placeholderTextColor="#8A877D"
                style={styles.radiusInput}
                value={radiusMiles}
              />
            </View>

            <View style={styles.resultsHeading}>
              <Text style={styles.resultsTitle}>
                <Text style={styles.resultsCount}>{filteredProperties.length}</Text>{' '}
                <Text style={styles.resultsLabel}>(spaces found)</Text>
              </Text>

              <Pressable
                accessibilityRole="button"
                onPress={() => setIsFilterOpen(true)}
                style={styles.filterButton}
              >
                <Text style={styles.filterButtonText}>
                  {activeFilterCount > 0
                    ? `Search Filter (${activeFilterCount})`
                    : 'Search Filter'}
                </Text>
              </Pressable>
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🐾</Text>

            <Text style={styles.emptyTitle}>
              {errorMessage
                ? 'Unable to load properties'
                : normalizedQuery
                  ? 'No matching spaces found'
                  : 'Private spaces are coming soon'}
            </Text>

            <Text style={styles.emptyDescription}>
              {errorMessage
                ? errorMessage
                : normalizedQuery
                  ? 'Try another city, ZIP code, or property name.'
                  : 'Published K9 Country properties will appear here as hosts complete their listings.'}
            </Text>

            {errorMessage ? (
              <Pressable
                accessibilityRole="button"
                onPress={handleRefresh}
                style={styles.retryButton}
              >
                <Text style={styles.retryButtonText}>
                  Try Again
                </Text>
              </Pressable>
            ) : null}
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#263A24"
          />
        }
        renderItem={renderProperty}
        showsVerticalScrollIndicator={false}
      />

      <Modal
        animationType="slide"
        transparent
        visible={isFilterOpen}
        onRequestClose={() => setIsFilterOpen(false)}
      >
        <View style={styles.filterBackdrop}>
          <View style={styles.filterSheet}>
            <View style={styles.filterHeader}>
              <View>
                <Text style={styles.filterEyebrow}>REFINE YOUR SEARCH</Text>
                <Text style={styles.filterTitle}>Filters</Text>
              </View>
              <Pressable
                accessibilityLabel="Close filters"
                accessibilityRole="button"
                onPress={() => setIsFilterOpen(false)}
                style={styles.closeFiltersButton}
              >
                <Text style={styles.closeFiltersText}>×</Text>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.filterSectionTitle}>Safety</Text>
              <View style={styles.filterChipRow}>
                <FilterChip
                  label="Fully fenced"
                  selected={requiresFullFence}
                  onPress={() => setRequiresFullFence((current) => !current)}
                />
                {[4, 5, 6].map((height) => (
                  <FilterChip
                    key={height}
                    label={`${height}+ ft fence`}
                    selected={minimumFenceHeight === height}
                    onPress={() =>
                      setMinimumFenceHeight((current) =>
                        current === height ? 0 : height
                      )
                    }
                  />
                ))}
              </View>

              <Text style={styles.filterSectionTitle}>Amenities</Text>
              <View style={styles.filterChipRow}>
                {amenityFilters.map((amenity) => (
                  <FilterChip
                    key={amenity.code}
                    label={amenity.label}
                    selected={selectedAmenities.includes(amenity.code)}
                    onPress={() => toggleAmenity(amenity.code)}
                  />
                ))}
              </View>

              <Text style={styles.filterSectionTitle}>Activities</Text>
              <View style={styles.filterChipRow}>
                {activityFilters.map((activity) => (
                  <FilterChip
                    key={activity.code}
                    label={activity.label}
                    selected={selectedAmenities.includes(activity.code)}
                    onPress={() => toggleAmenity(activity.code)}
                  />
                ))}
              </View>

              <Text style={styles.filterSectionTitle}>Property Features</Text>
              <View style={styles.filterChipRow}>
                {propertyFeatureFilters.map((feature) => (
                  <FilterChip
                    key={feature.code}
                    label={feature.label}
                    selected={selectedAmenities.includes(feature.code)}
                    onPress={() => toggleAmenity(feature.code)}
                  />
                ))}
              </View>

              <Text style={styles.filterSectionTitle}>Property size</Text>
              <View style={styles.filterChipRow}>
                {[0.25, 1, 5].map((acreage) => (
                  <FilterChip
                    key={acreage}
                    label={`${acreage}+ ${acreage === 1 ? 'acre' : 'acres'}`}
                    selected={minimumAcreage === acreage}
                    onPress={() =>
                      setMinimumAcreage((current) =>
                        current === acreage ? 0 : acreage
                      )
                    }
                  />
                ))}
              </View>

            </ScrollView>

            <View style={styles.filterActions}>
              <Pressable
                accessibilityRole="button"
                onPress={clearFilters}
                style={styles.clearFiltersButton}
              >
                <Text style={styles.clearFiltersText}>Clear All</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setIsFilterOpen(false)}
                style={styles.applyFiltersButton}
              >
                <Text style={styles.applyFiltersText}>
                  Show {filteredProperties.length}{' '}
                  {filteredProperties.length === 1 ? 'Space' : 'Spaces'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function FilterChip({
  label,
  onPress,
  selected,
}: {
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.filterChip, selected && styles.filterChipSelected]}
    >
      <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.cream,
  },

  discoverHeaderImage: { alignSelf: 'center', height: 220, resizeMode: 'contain', width: '100%' },


  listContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 36,
  },

  backButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    marginBottom: 6,
  },

  backButtonText: {
    color: colors.forest,
    fontSize: 16,
    fontWeight: '800',
  },

  eyebrow: {
    color: colors.brown,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.4,
    marginBottom: 7,
  },

  title: {
    color: colors.forest,
    fontSize: 31,
    fontWeight: '900',
    marginBottom: 10,
  },

  subtitle: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 8,
  },

  hostReturnLink: {
    alignSelf: 'flex-start',
    marginBottom: 16,
  },

  hostReturnLinkText: {
    color: colors.brown,
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },

  searchPanel: {
    backgroundColor: colors.warmWhite,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 18,
    marginBottom: 24,
  },

  inputLabel: {
    color: colors.forest,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 8,
  },

  searchInput: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    backgroundColor: colors.cream,
    color: colors.forest,
    fontSize: 16,
    paddingHorizontal: 15,
  },

  locationButton: {
    minHeight: 44,
    justifyContent: 'center',
    marginTop: 4,
  },

  locationButtonText: {
    color: colors.brown,
    fontSize: 14,
    fontWeight: '800',
  },

  radiusLabel: {
    color: colors.forest,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 10,
    marginBottom: 10,
  },

  radiusInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.cream,
    color: colors.forest,
    fontSize: 16,
    paddingHorizontal: 15,
  },

  resultsHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },

  resultsTitle: {
    color: colors.forest,
    fontWeight: '900',
  },

  resultsCount: {
    fontSize: 28,
  },

  resultsLabel: {
    fontSize: 13,
    fontWeight: '400',
  },

  filterButton: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.brown,
    borderRadius: 20,
    paddingHorizontal: 17,
  },

  filterButtonText: {
    color: colors.brown,
    fontSize: 14,
    fontWeight: '800',
  },

  filterBackdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
    flex: 1,
    justifyContent: 'flex-end',
  },

  filterSheet: {
    backgroundColor: colors.cream,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '86%',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 22,
  },

  filterHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },

  filterEyebrow: {
    color: colors.brown,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
  },

  filterTitle: {
    color: colors.forest,
    fontSize: 25,
    fontWeight: '900',
    marginTop: 3,
  },

  closeFiltersButton: {
    alignItems: 'center',
    backgroundColor: colors.warmWhite,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },

  closeFiltersText: {
    color: colors.forest,
    fontSize: 26,
    fontWeight: '500',
    lineHeight: 29,
  },

  filterSectionTitle: {
    color: colors.forest,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 10,
    marginTop: 16,
  },

  filterChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  filterChip: {
    backgroundColor: colors.warmWhite,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },

  filterChipSelected: {
    backgroundColor: colors.forest,
    borderColor: colors.forest,
  },

  filterChipText: {
    color: colors.forest,
    fontSize: 13,
    fontWeight: '800',
  },

  filterChipTextSelected: {
    color: colors.warmWhite,
  },

  filterActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },

  clearFiltersButton: {
    alignItems: 'center',
    borderColor: colors.brown,
    borderRadius: 13,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
  },

  clearFiltersText: {
    color: colors.brown,
    fontSize: 15,
    fontWeight: '900',
  },

  applyFiltersButton: {
    alignItems: 'center',
    backgroundColor: colors.forest,
    borderRadius: 13,
    flex: 2,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 10,
  },

  applyFiltersText: {
    color: colors.warmWhite,
    fontSize: 15,
    fontWeight: '900',
  },

  propertyCard: {
    overflow: 'hidden',
    backgroundColor: colors.warmWhite,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    marginBottom: 16,
  },

  imagePlaceholder: {
    height: 210,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.lightGreen,
  },

  propertyImage: {
    height: 210,
    width: '100%',
  },

  photoCounter: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    backgroundColor: 'rgba(38, 58, 36, 0.88)',
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },

  favoriteButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 253, 248, 0.94)',
    borderColor: colors.brown,
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    position: 'absolute',
    right: 12,
    top: 12,
    width: 40,
  },

  favoriteButtonSelected: {
    backgroundColor: colors.warmWhite,
  },

  favoriteIcon: {
    color: colors.brown,
    fontSize: 25,
    lineHeight: 28,
  },

  favoriteIconSelected: {
    color: colors.brown,
  },

  photoCounterText: {
    color: colors.warmWhite,
    fontSize: 12,
    fontWeight: '900',
  },

  thumbnailRow: {
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  thumbnailButton: {
    borderColor: 'transparent',
    borderRadius: 9,
    borderWidth: 3,
    overflow: 'hidden',
  },

  thumbnailButtonSelected: {
    borderColor: colors.forest,
  },

  thumbnailImage: {
    height: 54,
    width: 74,
  },

  thumbnailPlaceholder: {
    backgroundColor: colors.lightGreen,
    height: 54,
    width: 74,
  },

  imagePlaceholderIcon: {
    fontSize: 42,
  },

  imagePlaceholderText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
  },

  propertyContent: {
    padding: 17,
  },

  messageHostButton: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 48,
  },

  messageHostIcon: {
    fontSize: 17,
    marginRight: 7,
  },

  messageHostText: {
    color: colors.brown,
    fontSize: 14,
    fontWeight: '900',
  },

  propertyHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },

  propertyHeading: {
    flex: 1,
    paddingRight: 10,
  },

  propertyName: {
    color: colors.forest,
    fontSize: 24,
    fontWeight: '900',
  },

  propertyLocation: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 2,
  },

  instantBookBadge: {
    borderRadius: 12,
    backgroundColor: colors.lightGreen,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },

  instantBookText: {
    color: colors.olive,
    fontSize: 11,
    fontWeight: '900',
  },

  propertyDescription: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 19,
    marginTop: 8,
  },

  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 8,
  },

  detailText: {
    color: colors.forest,
    fontSize: 13,
    fontWeight: '700',
  },

  detailDot: {
    color: colors.muted,
    marginHorizontal: 7,
  },

  propertyFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },

  ratingText: {
    color: colors.brown,
    fontSize: 14,
    fontWeight: '800',
  },

  priceText: {
    color: colors.forest,
    fontSize: 20,
    fontWeight: '900',
  },

  priceUnit: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
  },

  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 42,
    paddingBottom: 60,
  },

  emptyIcon: {
    fontSize: 50,
  },

  emptyTitle: {
    color: colors.forest,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 15,
  },

  emptyDescription: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    marginTop: 10,
  },

  retryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: colors.brown,
    paddingHorizontal: 24,
    marginTop: 20,
  },

  retryButtonText: {
    color: colors.warmWhite,
    fontSize: 15,
    fontWeight: '800',
  },

  centeredState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },

  stateText: {
    color: colors.muted,
    fontSize: 15,
    marginTop: 14,
  },

  cardPressed: {
    opacity: 0.76,
    transform: [{ scale: 0.99 }],
  },
});
