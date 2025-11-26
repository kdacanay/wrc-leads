// src/utils/buildLeadChangesSummary.js
export function buildLeadChangesSummary(oldLead, newLead) {
  const fieldsToWatch = {
    status: "Status",
    leadType: "Lead type",
    relationshipRanking: "Relationship ranking",
    urgencyRanking: "Urgency ranking",
    source: "Source",
    assignedAgentName: "Assigned agent",
    firstAttemptDate: "First attempt date",
    nextEvaluationDate: "Next evaluation date",
  };

  const changes = [];

  Object.entries(fieldsToWatch).forEach(([key, label]) => {
    const before = oldLead?.[key];
    const after = newLead?.[key];

    // Treat null/undefined/"" as equivalent
    const norm = (v) =>
      v === null || v === undefined || v === "" ? "" : String(v);

    if (norm(before) !== norm(after)) {
      const beforeText = norm(before) || "—";
      const afterText = norm(after) || "—";
      changes.push(`${label} changed from "${beforeText}" to "${afterText}"`);
    }
  });

  if (changes.length === 0) return "";
  return `Lead updated: ${changes.join("; ")}`;
}
