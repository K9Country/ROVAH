const US_PHONE_DIGIT_COUNT = 10;

export function formatUsPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, '');
  const localNumber =
    digits.length > US_PHONE_DIGIT_COUNT && digits.startsWith('1')
      ? digits.slice(1, US_PHONE_DIGIT_COUNT + 1)
      : digits.slice(0, US_PHONE_DIGIT_COUNT);

  if (localNumber.length <= 3) return localNumber;
  if (localNumber.length <= 6) {
    return `${localNumber.slice(0, 3)}-${localNumber.slice(3)}`;
  }

  return `${localNumber.slice(0, 3)}-${localNumber.slice(3, 6)}-${localNumber.slice(6)}`;
}

export function hasValidUsPhoneNumber(value: string) {
  return value.replace(/\D/g, '').length === US_PHONE_DIGIT_COUNT;
}

export const phoneNumberHelpText =
  'Enter a 10-digit phone number with the area code, for example 248-555-1234.';
