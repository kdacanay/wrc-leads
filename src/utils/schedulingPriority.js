export const SCHEDULING_PRIORITY_OPTIONS = [
  {
    value: 4,
    pillLabel: "Level 4",
    dropdownLabel: "Level 4 — Must be contacted that day",
  },
  {
    value: 3,
    pillLabel: "Level 3",
    dropdownLabel: "Level 3 — Must be contacted from -1 day to +1 day",
  },
  {
    value: 2,
    pillLabel: "Level 2",
    dropdownLabel: "Level 2 — Must be contacted from -1 day to +2 days",
  },
  {
    value: 1,
    pillLabel: "Level 1",
    dropdownLabel: "Level 1 — Can be contacted from -1 day to +3 days",
  },
];

export function normalizeUrgencyLevel(value) {
  const num = Number(value);

  if ([1, 2, 3, 4].includes(num)) return num;

  return 1;
}