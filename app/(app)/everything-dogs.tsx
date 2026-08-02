import { Stack, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../../constants/theme';

const resourceCategories = [
  { title: 'Veterinarians', slug: 'veterinarians', description: 'Routine care, urgent care, and trusted medical support.' },
  { title: 'Dog Walking', slug: 'dog-walking', description: 'Professional walks and exercise support for your dog.' },
  { title: 'Dog Trainers', slug: 'dog-trainers', description: 'Training support for everyday skills and behavior.' },
  { title: 'Dog Groomers', slug: 'dog-groomers', description: 'Grooming, bathing, and care to keep dogs feeling their best.' },
  { title: 'Boarding & Daycare', slug: 'boarding-daycare', description: 'Reliable care when your dog needs a place to stay or play.' },
  { title: 'K9 Products', slug: 'k9-products', description: 'Dog essentials, treats, gear, and helpful must-haves.' },
];

export default function EverythingDogsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ title: 'Everything Dogs' }} />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Image
          accessibilityLabel="Everything Dogs"
          contentFit="contain"
          source={require('../../assets/images/k9-everything-dogs-header.png')}
          style={styles.heroImage}
        />

        <View style={styles.content}>
          <View style={styles.categorySection}>
            <View style={styles.categoryList}>
              {resourceCategories.map((category) => (
                <Pressable
                  key={category.title}
                  accessibilityRole="link"
                  accessibilityLabel={`Open ${category.title}`}
                  onPress={() => router.push(`/everything-dogs/${category.slug}` as never)}
                  style={({ pressed }) => [styles.categoryCard, pressed && styles.categoryCardPressed]}
                >
                  {category.title === 'Dog Groomers' ? (
                    <Image accessibilityLabel="Dog Groomers" contentFit="contain" source={require('../../assets/images/k9-groomers-icon.png')} style={styles.categoryImage} />
                  ) : category.title === 'Veterinarians' ? (
                    <Image accessibilityLabel="Veterinarians" contentFit="cover" source={require('../../assets/images/k9-veterinarians-icon.png')} style={styles.categoryImage} />
                  ) : category.title === 'Boarding & Daycare' ? (
                    <Image accessibilityLabel="Boarding and Daycare" contentFit="contain" source={require('../../assets/images/k9-boarding-daycare-icon.png')} style={styles.categoryImage} />
                  ) : category.title === 'Dog Walking' ? (
                    <Image accessibilityLabel="Dog Walking" contentFit="contain" source={require('../../assets/images/k9-everything-dogs-icon.png')} style={styles.categoryImage} />
                  ) : category.title === 'Dog Trainers' ? (
                    <Image accessibilityLabel="Dog Trainers" contentFit="contain" source={require('../../assets/images/k9-training-icon.png')} style={styles.trainingImage} />
                  ) : (
                    <Image accessibilityLabel="K9 Products" contentFit="contain" source={require('../../assets/images/k9-products-icon.png')} style={styles.k9ProductsImage} />
                  )}
                  <View style={styles.categoryCopy}>
                    <Text style={styles.categoryTitle}>{category.title}</Text>
                    <Text style={styles.categoryDescription}>{category.description}</Text>
                  </View>
                </Pressable>
              ))}
            </View>

            <View style={styles.disclosureCard}>
              <View style={styles.disclosureAccent} />
              <Text style={styles.disclosureEyebrow}>GOOD TO KNOW</Text>
              <Text style={styles.disclosureTitle}>Business Directory &amp; Product Information</Text>

              <View style={styles.disclosureSection}>
                <Text style={styles.disclosureHeading}>Independent businesses</Text>
                <Text style={styles.disclosureText}>The businesses featured in this directory are independent providers, and many are paid advertising partners of ROVAH.</Text>
              </View>

              <View style={styles.disclosureSection}>
                <Text style={styles.disclosureHeading}>Products and partners</Text>
                <Text style={styles.disclosureText}>Certain products may be sold directly by ROVAH, while others may be offered by third-party businesses or affiliate partners.</Text>
              </View>

              <View style={styles.disclosureSection}>
                <Text style={styles.disclosureHeading}>Your choice</Text>
                <Text style={styles.disclosureText}>Listings and advertisements are provided to help members discover products and services but do not constitute an endorsement, certification, or guarantee of any third-party business, product, or service. Members are encouraged to evaluate providers and products before making a purchase or booking a service.</Text>
              </View>

              <View style={styles.disclosureSection}>
                <Text style={styles.disclosureHeading}>ROVAH responsibility</Text>
                <Text style={styles.disclosureText}>ROVAH is responsible only for products sold directly by ROVAH and is not responsible for the products, services, pricing, availability, or performance of independent third-party businesses.</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.cream, flex: 1 },
  container: { paddingBottom: 40 },
  heroImage: { aspectRatio: 3 / 2, width: '100%' },
  content: { paddingHorizontal: 0 },
  categorySection: { marginTop: 0 },
  categoryList: { gap: 14, marginHorizontal: 10, marginTop: 12 },
  categoryCard: { alignItems: 'center', backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 18, borderWidth: 1, flexDirection: 'row', minHeight: 88, paddingHorizontal: 20, paddingVertical: 10, width: '100%' },
  categoryCardPressed: { opacity: 0.82 },
  categoryImage: { borderRadius: 27, height: 54, marginRight: 15, width: 54 },
  trainingImage: { backgroundColor: colors.warmWhite, borderRadius: 27, height: 54, marginRight: 15, width: 54 },
  k9ProductsImage: { borderRadius: 27, height: 54, marginRight: 15, width: 54 },
  categoryCopy: { flex: 1 },
  categoryTitle: { color: colors.forest, fontSize: 17, fontWeight: '900' },
  categoryDescription: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 3 },
  disclosureCard: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginTop: 28, overflow: 'hidden', padding: 20 },
  disclosureAccent: { backgroundColor: colors.forest, bottom: 0, left: 0, position: 'absolute', top: 0, width: 5 },
  disclosureEyebrow: { color: colors.brown, fontSize: 11, fontWeight: '900', letterSpacing: 1.2, marginBottom: 5 },
  disclosureTitle: { color: colors.forest, fontSize: 18, fontWeight: '900', lineHeight: 24, marginBottom: 18 },
  disclosureSection: { borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 14, marginTop: 14 },
  disclosureHeading: { color: colors.forest, fontSize: 14, fontWeight: '900', marginBottom: 5 },
  disclosureText: { color: colors.forest, fontSize: 14, lineHeight: 21 },
});
