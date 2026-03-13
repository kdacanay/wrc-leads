import React from "react";

export default function LeadActivityFeed({ lead }) {
  return (
    <div className="text-sm text-gray-600">
      Lead activity feed placeholder for{" "}
      <span className="font-semibold text-gray-800">
        {lead?.fullName || lead?.name || "this lead"}
      </span>
      .
    </div>
  );
}