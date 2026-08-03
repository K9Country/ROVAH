import { useEffect } from 'react';
import { Image, StyleSheet, Text, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
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

type UnreadMessageIconProps = {
  hasUnread: boolean;
  imageSource?: ImageSourcePropType;
  size?: 'member' | 'small' | 'regular';
  style?: StyleProp<ViewStyle>;
};

export function UnreadMessageIcon({
  hasUnread,
  imageSource,
  size = 'regular',
  style,
}: UnreadMessageIconProps) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(pulse);
    pulse.value = hasUnread
      ? withRepeat(
          withSequence(
            withTiming(1, { duration: 700 }),
            withTiming(0, { duration: 700 })
          ),
          -1,
          false
        )
      : withTiming(0, { duration: 160 });

    return () => cancelAnimation(pulse);
  }, [hasUnread, pulse]);

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      pulse.value,
      [0, 1],
      [colors.warmWhite, '#D99B84']
    ),
  }));

  return (
    <Animated.View
      accessibilityLabel={hasUnread ? 'Unread messages' : 'Messages'}
      style={[
        styles.badge,
        size === 'member' && styles.memberBadge,
        size === 'small' && styles.smallBadge,
        animatedStyle,
        style,
      ]}
    >
      {imageSource ? (
        <Image
          accessibilityLabel={hasUnread ? 'Unread messages' : 'Messages'}
          resizeMode="contain"
          source={imageSource}
          style={[styles.image, size === 'member' && styles.memberImage, size === 'small' && styles.smallImage]}
        />
      ) : (
        <Text style={[styles.icon, size === 'small' && styles.smallIcon]}>💬</Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  smallBadge: {
    borderRadius: 16,
    height: 32,
    width: 32,
  },
  icon: {
    fontSize: 21,
  },
  smallIcon: {
    fontSize: 16,
  },
  memberBadge: {
    borderRadius: 19,
    height: 38,
    width: 38,
  },
  image: {
    height: 38,
    width: 38,
  },
  smallImage: {
    height: 30,
    width: 30,
  },
  memberImage: {
    height: 36,
    width: 36,
  },
});
