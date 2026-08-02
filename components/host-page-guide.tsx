import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../constants/theme';

type HostGuideStep = {
  title: string;
  text: string;
};

export function HostPageGuide({
  title = 'How to use this page',
  intro,
  steps,
  tone = 'default',
}: {
  title?: string;
  intro?: string;
  steps: HostGuideStep[];
  tone?: 'default' | 'forest';
}) {
  const isForest = tone === 'forest';
  const [isOpen, setIsOpen] = useState(false);

  return (
    <View style={[styles.card, isForest && styles.forestCard]}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: isOpen }} onPress={() => setIsOpen((current) => !current)} style={styles.header}>
        <Text style={[styles.title, isForest && styles.forestText]}>{title}</Text>
        <Text style={[styles.arrow, isForest && styles.forestText]}>{isOpen ? '⌃' : '⌄'}</Text>
      </Pressable>
      {isOpen && intro ? <Text style={[styles.intro, isForest && styles.forestMutedText]}>{intro}</Text> : null}
      {isOpen && steps.map((step, index) => (
        <View key={step.title} style={styles.step}>
          <Text style={[styles.number, isForest && styles.forestNumber]}>{index + 1}</Text>
          <View style={styles.copy}>
            <Text style={[styles.stepTitle, isForest && styles.forestText]}>{step.title}</Text>
            <Text style={[styles.stepText, isForest && styles.forestMutedText]}>{step.text}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#F1F2EF', borderColor: '#D4D6D0', borderRadius: 12, borderWidth: 1, marginTop: 12, paddingHorizontal: 13, paddingVertical: 6 },
  forestCard: { backgroundColor: colors.forest, borderColor: '#315738' },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 32 },
  title: { color: colors.forest, flex: 1, fontSize: 14, fontWeight: '900', paddingRight: 10 }, arrow: { color: colors.forest, fontSize: 18, fontWeight: '900' },
  intro: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  step: { flexDirection: 'row', marginTop: 13 },
  number: { alignItems: 'center', backgroundColor: colors.lightGreen, borderColor: '#CBD1BD', borderRadius: 13, borderWidth: 1, color: colors.forest, fontSize: 13, fontWeight: '900', height: 26, lineHeight: 24, marginRight: 10, textAlign: 'center', width: 26 },
  copy: { flex: 1 },
  stepTitle: { color: colors.forest, fontSize: 14, fontWeight: '900' },
  stepText: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 2 },
  forestText: { color: colors.warmWhite },
  forestMutedText: { color: '#F4EBDD' },
  forestNumber: { backgroundColor: 'rgba(255,255,255,0.14)', borderColor: 'rgba(255,255,255,0.38)', color: colors.warmWhite },
});
