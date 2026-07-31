import AsyncStorage from '@react-native-async-storage/async-storage';

// This intentionally stores no account identifier or profile data. It is only
// a device-local navigation preference after someone explicitly signs out.
const explicitMemberSignOutKey = '@rovah/member-explicit-sign-out';

export async function markExplicitMemberSignOut() {
  await AsyncStorage.setItem(explicitMemberSignOutKey, 'true');
}

export async function clearExplicitMemberSignOut() {
  await AsyncStorage.removeItem(explicitMemberSignOutKey);
}

export async function hasExplicitMemberSignOut() {
  return (await AsyncStorage.getItem(explicitMemberSignOutKey)) === 'true';
}
