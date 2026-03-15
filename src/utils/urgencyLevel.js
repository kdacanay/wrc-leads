export const URGENCY_LEVEL_OPTIONS = [
  {
    value: 4,
    pillLabel: "Level 4",
    dropdownLabel: "Level 4 — Must be contacted that day",
    shortLabel: "Level 4",
    desc: "Zero tolerance level. This lead must be contacted that day.",
  },
  {
    value: 3,
    pillLabel: "Level 3",
    dropdownLabel: "Level 3 — Must be contacted from -1 day to +1 day",
    shortLabel: "Level 3",
    desc: "This lead must be contacted within the window of -1 day to +1 day from the due date.",
  },
  {
    value: 2,
    pillLabel: "Level 2",
    dropdownLabel: "Level 2 — Must be contacted from -1 day to +2 days",
    shortLabel: "Level 2",
    desc: "This lead must be contacted within the window of -1 day to +2 days from the due date.",
  },
  {
    value: 1,
    pillLabel: "Level 1",
    dropdownLabel: "Level 1 — Can be contacted from -1 day to +3 days",
    shortLabel: "Level 1",
    desc: "This lead can be contacted within the window of -1 day to +3 days from the due date.",
  },
];

export const SCHEDULING_PRIORITY_HELP = [
  {
    key: "priority-overview",
    title: "What is Scheduling Priority Level?",
    bullets: [
      [
        "Purpose",
        "Scheduling Priority Level determines how strict the timing is for contacting a lead based on the due date.",
      ],
      [
        "How reminders work",
        "Admin reminder emails are sent one day before the due date.",
      ],
      [
        "How calls work",
        "The priority level determines how much flexibility the agent has around the due date to complete the call.",
      ],
    ],
  },
  {
    key: "level-4",
    title: "Level 4",
    bullets: [
      ["Definition", "Zero tolerance priority."],
      ["Call timing", "The lead must be contacted on the due date."],
      ["Example", "If the due date is June 10, the call must happen on June 10."],
    ],
  },
  {
    key: "level-3",
    title: "Level 3",
    bullets: [
      ["Call window", "The lead should be contacted from 1 day before to 1 day after the due date."],
      ["Example", "If the due date is June 10, the call window is June 9–June 11."],
    ],
  },
  {
    key: "level-2",
    title: "Level 2",
    bullets: [
      ["Call window", "The lead should be contacted from 1 day before to 2 days after the due date."],
      ["Example", "If the due date is June 10, the call window is June 9–June 12."],
    ],
  },
  {
    key: "level-1",
    title: "Level 1",
    bullets: [
      ["Call window", "The lead can be contacted from 1 day before to 3 days after the due date."],
      ["Example", "If the due date is June 10, the call window is June 9–June 13."],
    ],
  },
];

export function normalizeUrgencyLevel(value) {
  const num = Number(value);

  if (num === 5) return 4;
  if ([1, 2, 3, 4].includes(num)) return num;

  return 1;
}

export function getUrgencyOption(value) {
  const normalized = normalizeUrgencyLevel(value);
  return (
    URGENCY_LEVEL_OPTIONS.find((opt) => opt.value === normalized) ||
    URGENCY_LEVEL_OPTIONS[URGENCY_LEVEL_OPTIONS.length - 1]
  );
}

export function urgencyLevelPillLabel(value) {
  return getUrgencyOption(value).pillLabel;
}

export function urgencyLevelDropdownLabel(value) {
  return getUrgencyOption(value).dropdownLabel;
}

export function urgencyLevelDescription(value) {
  return getUrgencyOption(value).desc;
}

export function urgencyLevelTone(value) {
  const normalized = normalizeUrgencyLevel(value);

  switch (normalized) {
    case 4:
      return "red";
    case 3:
      return "orange";
    case 2:
      return "blue";
    case 1:
    default:
      return "gray";
  }
}

export function urgencyLevelSortValue(value) {
  return normalizeUrgencyLevel(value);
}

export function schedulingPriorityDays(value) {
  const normalized = normalizeUrgencyLevel(value);

  switch (normalized) {
    case 4:
      return 0;
    case 3:
      return 1;
    case 2:
      return 2;
    case 1:
    default:
      return 3;
  }
}

export function schedulingPrioritySubject(value) {
  const normalized = normalizeUrgencyLevel(value);

  switch (normalized) {
    case 4:
      return "Level 4 lead, must be contacted that day";
    case 3:
      return "Level 3 lead, must be contacted from -1 day to +1 day";
    case 2:
      return "Level 2 lead, must be contacted from -1 day to +2 days";
    case 1:
    default:
      return "Level 1 lead, can be contacted from -1 day to +3 days";
  }
}

export function calculateUrgencyLevelFromDueDate(dueDate) {
  if (!dueDate) return 1;

  let due;
  if (dueDate?.toDate) {
    due = dueDate.toDate();
  } else if (dueDate instanceof Date) {
    due = dueDate;
  } else {
    due = new Date(dueDate);
  }

  if (Number.isNaN(due.getTime())) return 1;

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());

  const diffDays = Math.round(
    (startOfDue.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays <= 0) return 4;
  if (diffDays <= 1) return 3;
  if (diffDays <= 2) return 2;
  return 1;
}