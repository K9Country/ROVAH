import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { colors } from '../constants/theme';

type ConversationAvatarProps = {
  hasUnread: boolean;
  imageUrl?: string;
  name: string;
};

export function ConversationAvatar({ hasUnread, imageUrl, name }: ConversationAvatarProps) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.avatar}>
        <Image
          accessibilityLabel={imageUrl ? `${name}'s profile photo` : 'Default ROVAH profile image'}
          contentFit="cover"
          source={imageUrl ? { uri: imageUrl } : require('../assets/images/k9-11.png')}
          style={styles.image}
        />
      </View>
      {hasUnread ? <View style={styles.unreadDot} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { height: 52, position: 'relative', width: 52 },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.lightGreen,
    borderColor: colors.border,
    borderRadius: 26,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 52,
  },
  image: { height: '100%', width: '100%' },
  unreadDot: {
    backgroundColor: colors.brown,
    borderColor: colors.warmWhite,
    borderRadius: 7,
    borderWidth: 2,
    height: 14,
    position: 'absolute',
    right: -1,
    top: -1,
    width: 14,
  },
});
