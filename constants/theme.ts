import { Platform } from 'react-native';

export const colors = {
  forest: '#263A24',
  forestDark: '#263A24',
  olive: '#3D522C',
  sage: '#E8ECDD',
  lightGreen: '#E8ECDD',
  cream: '#F4ECDD',
  canvas: '#F4ECDD',
  warmWhite: '#FFFDF8',
  tan: '#D7CBB8',
  brown: '#8A4F17',
  gold: '#F0B56F',
  bark: '#263A24',
  muted: '#6D6A60',
  border: '#D7CBB8',
  danger: '#A84432',
  red: '#A84432',
  dangerSurface: '#F9E8E2',
  success: '#3D522C',
  successSurface: '#E8ECDD',
  overlay: 'rgba(30, 50, 37, 0.58)',
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  small: 10,
  medium: 16,
  large: 22,
  pill: 999,
} as const;

export const typography = {
  display: Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui' }),
  body: Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui' }),
} as const;

export const shadows = {
  card: {
    elevation: 0,
    shadowColor: colors.bark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0,
    shadowRadius: 0,
  },
} as const;

export const sharedStyles = {
  page: { flex: 1, backgroundColor: colors.cream },
  card: {
    backgroundColor: colors.warmWhite,
    borderColor: colors.border,
    borderRadius: radius.large,
    borderWidth: 1,
    ...shadows.card,
  },
  input: {
    backgroundColor: colors.warmWhite,
    borderColor: colors.border,
    borderRadius: radius.medium,
    borderWidth: 1,
    color: colors.forestDark,
    minHeight: 54,
    paddingHorizontal: spacing.md,
  },
} as const;
