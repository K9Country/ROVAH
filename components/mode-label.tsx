import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../constants/theme';

type ModeLabelProps = {
  mode: 'Guest' | 'Host';
  page: number;
};

export function ModeLabel({ mode, page }: ModeLabelProps) {
  return (
    <View accessible={false} style={styles.container}>
      <Text style={styles.text}>
        {mode.toUpperCase()} {String(page).padStart(2, '0')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  text: {
    color: colors.brown,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
});
