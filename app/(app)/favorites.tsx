import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../services/auth-context';
import type { Property } from '../../types/property';

type FavoriteProperty = Property & { cover_image_url?: string };

export default function FavoritesScreen() {
  const { isMember, session } = useAuth();
  const [properties, setProperties] = useState<FavoriteProperty[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const memberId = isMember ? session?.user.id : undefined;

  const loadFavorites = useCallback(async () => {
    if (!memberId) {
      setProperties([]);
      return;
    }

    setErrorMessage(null);

    const { data: favoriteRows, error: favoritesError } = await supabase
      .from('property_favorites')
      .select('property_id, created_at')
      .eq('user_id', memberId)
      .order('created_at', { ascending: false });

    if (favoritesError) {
      setErrorMessage(favoritesError.message);
      setProperties([]);
      return;
    }

    const propertyIds = (favoriteRows ?? []).map((favorite) => favorite.property_id);

    if (propertyIds.length === 0) {
      setProperties([]);
      return;
    }

    const [propertyResult, imageResult] = await Promise.all([
      supabase.from('properties').select('*').in('id', propertyIds).eq('is_published', true),
      supabase
        .from('property_images')
        .select('property_id, storage_path, is_cover, display_order')
        .in('property_id', propertyIds)
        .order('display_order'),
    ]);

    if (propertyResult.error || imageResult.error) {
      setErrorMessage(propertyResult.error?.message ?? imageResult.error?.message ?? 'Unable to load favorites.');
      setProperties([]);
      return;
    }

    const coverImages = await Promise.all(
      (imageResult.data ?? [])
        .filter((image) => image.is_cover)
        .map(async (image) => {
          const { data } = await supabase.storage
            .from('property-images')
            .createSignedUrl(image.storage_path, 60 * 60);
          return [image.property_id, data?.signedUrl] as const;
        })
    );

    const coverByProperty = Object.fromEntries(coverImages);
    const propertyById = new Map(
      ((propertyResult.data ?? []) as Property[]).map((property) => [property.id, property])
    );

    setProperties(
      propertyIds
        .map((propertyId) => propertyById.get(propertyId))
        .filter((property): property is Property => Boolean(property))
        .map((property) => ({
          ...property,
          cover_image_url: coverByProperty[property.id] ?? property.hero_image_signed_url ?? property.hero_image_url ?? undefined,
        }))
    );
  }, [memberId]);

  useEffect(() => {
    const initialize = async () => {
      try {
        setIsLoading(true);
        await loadFavorites();
      } finally {
        setIsLoading(false);
      }
    };

    void initialize();
  }, [loadFavorites]);

  const removeFavorite = async (property: FavoriteProperty) => {
    if (!memberId) {
      return;
    }

    try {
      setRemovingId(property.id);
      const { error } = await supabase
        .from('property_favorites')
        .delete()
        .eq('user_id', memberId)
        .eq('property_id', property.id);

      if (error) {
        Alert.alert('Unable to remove favorite', error.message);
        return;
      }

      setProperties((current) => current.filter((item) => item.id !== property.id));
    } finally {
      setRemovingId(null);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centeredState}>
          <ActivityIndicator color={colors.forest} size="large" />
          <Text style={styles.stateText}>Loading your favorites...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        contentContainerStyle={styles.content}
        data={properties}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <>
            <Text style={styles.title}>My Favorites</Text>
            <Text style={styles.description}>Keep the private spaces you love in one easy-to-find place.</Text>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>♡</Text>
            <Text style={styles.emptyTitle}>{errorMessage ? 'Unable to load favorites' : 'No saved spaces yet'}</Text>
            <Text style={styles.emptyText}>{errorMessage ?? 'Tap the heart on any private space to save it here.'}</Text>
            {!errorMessage ? (
              <Pressable onPress={() => router.replace('/search')} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Find a Private Space</Text>
              </Pressable>
            ) : null}
          </View>
        }
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={async () => { setIsRefreshing(true); await loadFavorites(); setIsRefreshing(false); }} tintColor={colors.forest} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Pressable onPress={() => router.push(`/property/${item.id}` as never)}>
              {item.cover_image_url ? <Image source={{ uri: item.cover_image_url }} style={styles.image} /> : <View style={styles.imagePlaceholder}><Text style={styles.imagePlaceholderText}>🌳</Text></View>}
              <View style={styles.cardContent}>
                <Text style={styles.propertyName}>{item.name}</Text>
                <Text style={styles.location}>{item.city}, {item.state}</Text>
                <Text style={styles.propertyDescription} numberOfLines={2}>{item.short_description}</Text>
                <Text style={styles.price}>${Number(item.price_per_hour).toFixed(0)} <Text style={styles.priceUnit}>/ hour</Text></Text>
              </View>
            </Pressable>
            <Pressable accessibilityLabel={`Remove ${item.name} from favorites`} disabled={removingId === item.id} onPress={() => void removeFavorite(item)} style={styles.removeButton}>
              {removingId === item.id ? <ActivityIndicator color={colors.red} size="small" /> : <Text style={styles.removeButtonText}>♥ Remove</Text>}
            </Pressable>
          </View>
        )}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream },
  content: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 36 },
  backButton: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 44, marginBottom: 12 },
  backButtonText: { color: colors.forest, fontSize: 16, fontWeight: '800' },
  eyebrow: { color: colors.brown, fontSize: 12, fontWeight: '900', letterSpacing: 1.3, marginBottom: 6 },
  title: { color: colors.forest, fontSize: 31, fontWeight: '900', marginBottom: 9 },
  description: { color: colors.muted, fontSize: 16, lineHeight: 23, marginBottom: 22 },
  card: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 20, borderWidth: 1, marginBottom: 16, overflow: 'hidden' },
  image: { height: 190, width: '100%' },
  imagePlaceholder: { alignItems: 'center', backgroundColor: colors.lightGreen, height: 190, justifyContent: 'center' },
  imagePlaceholderText: { fontSize: 44 },
  cardContent: { padding: 16 },
  propertyName: { color: colors.forest, fontSize: 20, fontWeight: '900' },
  location: { color: colors.muted, fontSize: 14, marginTop: 4 },
  propertyDescription: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 10 },
  price: { color: colors.forest, fontSize: 19, fontWeight: '900', marginTop: 13 },
  priceUnit: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  removeButton: { alignItems: 'center', borderTopColor: colors.border, borderTopWidth: 1, justifyContent: 'center', minHeight: 48 },
  removeButtonText: { color: colors.red, fontSize: 14, fontWeight: '900' },
  centeredState: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  stateText: { color: colors.muted, fontSize: 15, marginTop: 14 },
  emptyState: { alignItems: 'center', paddingHorizontal: 26, paddingTop: 52 },
  emptyIcon: { color: colors.brown, fontSize: 58 },
  emptyTitle: { color: colors.forest, fontSize: 22, fontWeight: '900', marginTop: 12, textAlign: 'center' },
  emptyText: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 9, textAlign: 'center' },
  primaryButton: { alignItems: 'center', backgroundColor: colors.brown, borderRadius: 14, justifyContent: 'center', marginTop: 22, minHeight: 52, paddingHorizontal: 22 },
  primaryButtonText: { color: colors.warmWhite, fontSize: 16, fontWeight: '900' },
});
