import { Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../../../constants/theme';

export default function EverythingDogsCategoryScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ title: 'Everything Dogs' }} />
      <View style={styles.content}>
        <Text style={styles.message}>Under Construction</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.cream, flex: 1 },
  content: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  message: { color: colors.forest, fontSize: 26, fontWeight: '900', textAlign: 'center' },
});
