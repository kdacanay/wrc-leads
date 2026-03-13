import React, { useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";

export default function LeadAgreementPage() {
  const { user, leadPolicyVersion } = useAuth();
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const location = useLocation();

  const goBackTo = useMemo(() => {
    // if they were redirected here, go back there; otherwise go home
    return location.state?.from || "/";
  }, [location.state]);

  const policyText = useMemo(
    () => [
      "Lead Agreement & Use Policy",
      "By creating an account and accessing the WRC Leads system, you acknowledge and agree to the following:",
      "• All leads provided through this system are the property of Weichert Realtors® Cornerstone.",
      "• Leads may not be transferred, reassigned, exported, or used outside of Weichert Realtors® Cornerstone without written approval.",
      "• Any transaction resulting from a lead assigned through this platform is subject to the brokerage’s standard commission policies, including applicable lead referral or commission splits.",
      "• You agree to update lead status and activity accurately and in good faith within the system.",
      "• Unauthorized use, removal, or misuse of leads may result in loss of access to the platform and further action per company policy.",
      "• Assigned leads are subject to a 50/50 commission split between the agent and Weichert Realtors® Cornerstone unless otherwise specified in writing.",
      "By checking the box below, you confirm that you understand and agree to these terms.",
    ],
    []
  );

  const handleAccept = async () => {
    setError("");

    if (!checked) {
      setError("Please check the box to agree before continuing.");
      return;
    }
    if (!user?.uid) {
      setError("You must be signed in to accept.");
      return;
    }

    setSaving(true);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        acceptedLeadAgreement: true,
        acceptedLeadAgreementVersion: leadPolicyVersion,
        acceptedLeadAgreementAt: serverTimestamp(),
      });
      
      // sessionStorage.setItem(`wrc_leads_agreement_ack_${user.uid}`, "1");

      navigate(goBackTo, { replace: true });
    } catch (err) {
      console.error(err);
      setError("Could not save your agreement. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="max-w-2xl w-full bg-white border border-gray-200 rounded-xl shadow-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-9 w-9 bg-wrcYellow rounded flex items-center justify-center text-wrcBlack font-bold text-lg">
            W
          </div>
          <div>
            <div className="font-bold text-base text-wrcBlack">Weichert Realtors Cornerstone</div>
            <div className="text-xs text-gray-600">Lead Agreement (Required)</div>
          </div>
        </div>

        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
          <div className="font-bold text-sm text-wrcBlack mb-2">{policyText[0]}</div>
          <div className="text-xs text-gray-700 space-y-2">
            {policyText.slice(1).map((line, idx) => (
              <p key={idx} className="leading-5">
                {line}
              </p>
            ))}
          </div>
        </div>

        <label className="mt-4 flex items-start gap-2 text-sm text-gray-800">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          <span>
            <span className="font-semibold">I agree</span> to the Lead Agreement & Use Policy.
          </span>
        </label>

        {error && (
          <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button
            onClick={handleAccept}
            disabled={saving}
            className="bg-wrcBlack text-wrcYellow font-semibold text-sm px-4 py-2.5 rounded-lg hover:bg-black disabled:opacity-60"
          >
            {saving ? "Saving..." : "Accept & Continue"}
          </button>

          <button
            onClick={() => navigate("/login", { replace: true })}
            className="text-sm px-4 py-2.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
          >
            Back to login
          </button>
        </div>

        <div className="mt-3 text-[11px] text-gray-500">
          Policy version: <span className="font-mono">{leadPolicyVersion}</span>
        </div>
      </div>
    </div>
  );
}
