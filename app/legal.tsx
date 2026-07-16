import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../constants/theme';

const sections = [
  ['Community rules', 'Treat every person, dog, and private site with care. Keep communication respectful, follow the host’s listed rules, and do not bring unregistered dogs or guests.'],
  ['Reservations and cancellations', 'A reservation holds the selected time for the guest and site. Guests may cancel until one hour before the visit. Hosts may cancel an upcoming visit when necessary and should message the guest promptly. Payment collection and refunds are not active until K9 Country completes its payment launch.'],
  ['Private location information', 'Listings show city and state while guests decide. The exact address and map link are intended for confirmed reservations so private sites remain private.'],
  ['Reviews', 'Guests review individual sites, and hosts review individual guests after a completed visit. Reviews must be honest, relevant, and free from personal contact information, threats, discrimination, or harassment.'],
  ['Privacy', 'Guest home address, phone number, and email are stored for the guest’s private reservation profile and are not displayed to hosts. Hosts and guests may see the profile information and review history necessary to make informed reservation decisions.'],
  ['Safety and reports', 'Use the in-app Safety & Support form to report listing, conduct, review, message, or safety concerns. For immediate danger, contact local emergency services first.'],
];

export default function LegalScreen() {
  return <SafeAreaView style={styles.safeArea}><ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
    <Pressable onPress={() => router.back()} style={styles.backButton}><Text style={styles.backText}>← Back</Text></Pressable>
    <Text style={styles.title}>Terms, Privacy & Community Rules</Text>
    <Text style={styles.updated}>Effective July 16, 2026 · K9 Country operating policies</Text>
    <View style={styles.notice}><Text style={styles.noticeText}>These in-app operating policies are ready for users to read. Before a public commercial launch, have a licensed attorney review and finalize your state-specific terms, privacy notice, host agreement, liability waiver, and insurance language.</Text></View>
    {sections.map(([title, content]) => <View key={title} style={styles.section}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionText}>{content}</Text></View>)}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ safeArea: { flex: 1, backgroundColor: colors.cream }, container: { padding: 20, paddingBottom: 40 }, backButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }, backText: { color: colors.forest, fontSize: 16, fontWeight: '800' }, title: { color: colors.forest, fontSize: 29, fontWeight: '900', marginTop: 8 }, updated: { color: colors.muted, fontSize: 13, marginTop: 8 }, notice: { backgroundColor: '#FFF5E8', borderColor: '#E7C79D', borderRadius: 16, borderWidth: 1, marginTop: 20, padding: 15 }, noticeText: { color: colors.muted, fontSize: 14, lineHeight: 21 }, section: { backgroundColor: colors.warmWhite, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginTop: 14, padding: 17 }, sectionTitle: { color: colors.forest, fontSize: 18, fontWeight: '900' }, sectionText: { color: colors.muted, fontSize: 15, lineHeight: 23, marginTop: 8 } });
