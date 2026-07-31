import { colors, typography } from './theme';

// Shared presentation for authenticated member screens. Kept separate from
// host styles so member visual updates cannot affect host tools.
export const memberUi = {
  pageTitle: {
    color: colors.forest,
    fontFamily: typography.display,
    fontSize: 30,
    fontWeight: '900' as const,
    lineHeight: 36,
    textAlign: 'left' as const,
  },
  pageDescription: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 16,
    lineHeight: 23,
    marginTop: 8,
    textAlign: 'left' as const,
  },
  cardTitle: {
    color: colors.forest,
    fontFamily: typography.body,
    fontSize: 16,
    fontWeight: '900' as const,
    lineHeight: 20,
    textAlign: 'left' as const,
  },
  cardDescription: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
    textAlign: 'left' as const,
  },
} as const;
