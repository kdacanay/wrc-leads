import React from "react";

export default function LeadJournal({ lead }) {
  return (
    <div className="text-sm text-gray-600">
      Lead journal placeholder for{" "}
      <span className="font-semibold text-gray-800">
        {lead?.fullName || lead?.name || "this lead"}
      </span>
      .
    </div>
  );
}