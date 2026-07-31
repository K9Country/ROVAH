import { useEffect } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, {
  cancelAnimation,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { colors } from '../constants/theme';

type HostFeedbackButtonProps = {
  hasUnread: boolean;
  onPress: () => void;
};

export function HostFeedbackButton({ hasUnread, onPress }: HostFeedbackButtonProps) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(pulse);
    pulse.value = hasUnread
      ? withRepeat(withSequence(withTiming(1, { duration: 900 }), withTiming(0, { duration: 900 })), -1, false)
      : withTiming(0, { duration: 160 });
    return () => cancelAnimation(pulse);
  }, [hasUnread, pulse]);

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(pulse.value, [0, 1], [colors.warmWhite, '#D99B84']),
    borderColor: interpolateColor(pulse.value, [0, 1], [colors.forest, '#A63E35']),
  }));

  return (
    <Pressable
      accessibilityHint="Opens your private feedback from hosts."
      accessibilityLabel={hasUnread ? 'Host Feedback. New feedback available.' : 'Host Feedback'}
      accessibilityRole="button"
      onPress={onPress}
    >
      <Animated.View style={[styles.button, animatedStyle]}>
        <Text style={styles.label}>Host Feedback</Text>
        {hasUnread ? <Text style={styles.notice}>New</Text> : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', justifyContent: 'center', minHeight: 42, paddingHorizontal: 14 },
  label: { color: colors.forest, fontSize: 14, fontWeight: '900' },
  notice: { color: colors.red, fontSize: 12, fontWeight: '900', marginLeft: 8 },
});
