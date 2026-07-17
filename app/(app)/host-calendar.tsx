import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, shadows, typography } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../services/auth-context';
import type { Property } from '../../types/property';

export default function HostCalendarScreen() {
  const { session } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadProperties = useCallback(async () => {
    if (!session?.user.id) {
      setIsLoading(false);
      return;
    }

    const { data } = await supabase
      .from('properties')
      .select('*')
      .eq('host_id', session.user.id)
      .order('created_at', { ascending: false });

    setProperties((data ?? []) as Property[]);
    setIsLoading(false);
  }, [session?.user.id]);

  useEffect(() => {
    void loadProperties();
  }, [loadProperties]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => router.replace('/host-dashboard')} style={styles.backButton}>
          <Text style={styles.backButtonText}>{'<'} Host Dashboard</Text>
        </Pressable>
        <Text style={styles.title}>Calendar & Schedule</Text>
        <Text style={styles.description}>
          Choose a property to set regular availability. Reservation requests will appear here as bookings are added.
        </Text>

        {isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={colors.forest} size="large" />
          </View>
        ) : properties.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Add a property first</Text>
            <Text style={styles.emptyText}>Your calendar will be available once you create your first private space.</Text>
            <Pressable onPress={() => router.push('/create-property')} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Add a Private Space</Text>
            </Pressable>
          </View>
        ) : (
          properties.map((property) => (
            <Pressable
              key={property.id}
              onPress={() => router.push(`/property-draft/${property.id}` as never)}
              style={styles.propertyCard}
            >
              <Text style={styles.propertyName}>{property.name}</Text>
              <Text style={styles.propertyLocation}>{property.city}, {property.state}</Text>
              <Text style={styles.propertyAction}>Edit availability {'>'}</Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream },
  container: { padding: 20, paddingBottom: 40 },
  backButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  backButtonText: { color: colors.forest, fontSize: 16, fontWeight: '800' },
  eyebrow: { color: colors.brown, fontSize: 12, fontWeight: '900', letterSpacing: 1.3, marginTop: 10 },
  title: { color: colors.forest, fontFamily: typography.display, fontSize: 30, fontWeight: '900' },
  description: { color: colors.muted, fontSize: 16, lineHeight: 23, marginBottom: 22, marginTop: 10 },
  loadingState: { alignItems: 'center', paddingTop: 50 },
  emptyCard: { backgroundColor: colors.lightGreen, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 18, ...shadows.card },
  emptyTitle: { color: colors.forest, fontSize: 18, fontWeight: '900' },
  emptyText: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 7 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.brown, borderRadius: 13, justifyContent: 'center', marginTop: 18, minHeight: 52 },
  primaryButtonText: { color: colors.warmWhite, fontSize: 15, fontWeight: '900' },
  propertyCard: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginBottom: 12, padding: 17 },
  propertyName: { color: colors.forest, fontSize: 17, fontWeight: '900' },
  propertyLocation: { color: colors.muted, fontSize: 14, marginTop: 5 },
  propertyAction: { color: colors.brown, fontSize: 13, fontWeight: '900', marginTop: 13 },
});
