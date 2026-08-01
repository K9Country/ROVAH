export const propertyTimeZones = [
  { value: 'America/New_York', label: 'Eastern Time' },
  { value: 'America/Detroit', label: 'Eastern Time (Michigan)' },
  { value: 'America/Chicago', label: 'Central Time' },
  { value: 'America/Denver', label: 'Mountain Time' },
  { value: 'America/Phoenix', label: 'Arizona Time' },
  { value: 'America/Los_Angeles', label: 'Pacific Time' },
  { value: 'America/Anchorage', label: 'Alaska Time' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time' },
] as const;

export type PropertyTimeZone = typeof propertyTimeZones[number]['value'];

export function propertyTimeZoneLabel(timeZone: string | null | undefined) {
  return propertyTimeZones.find((item) => item.value === timeZone)?.label ?? timeZone ?? 'Local site time';
}
