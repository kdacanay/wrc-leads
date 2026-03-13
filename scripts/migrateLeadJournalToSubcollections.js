/**
 * MIGRATION: leads.journal[]  ->  leads/{leadId}/adminJournal/{entryId}
 * Optional: action-item/instruction -> leads/{leadId}/instructions/{entryId}
 *
 * DRY RUN by default. Use: --commit to actually write.
 *
 * Run:
 *   node scripts/migrateLeadJournalToSubcollections.js --commit
 */

const admin = require("firebase-admin");

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    commit: args.includes("--commit"),
    limit: (() => {
      const i = args.indexOf("--limit");
      if (i >= 0 && args[i + 1]) return Number(args[i + 1]);
      return null;
    })(),
  };
}

function pickDocId(entry, fallback) {
  const raw = entry?.id || entry?.uuid || entry?.entryId;
  const safe = typeof raw === "string" && raw.trim() ? raw.trim() : fallback;
  // Firestore doc IDs cannot contain '/'
  return safe.replaceAll("/", "_");
}

function isInstructionEntry(entry) {
  const type = String(entry?.type || "").toLowerCase().trim();
  // ✅ TUNE THIS:
  // If you ONLY want admin-created “instructions” to show to agents,
  // keep it narrow (e.g. only "instruction").
  return type === "instruction" || type === "action-item";
}

async function main() {
  const { commit, limit } = parseArgs();

  // Uses GOOGLE_APPLICATION_CREDENTIALS (recommended) or ADC
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  }

  const db = admin.firestore();

  console.log("--------------------------------------------------");
  console.log("MIGRATION: leads.journal[] -> subcollections");
  console.log("Mode:", commit ? "COMMIT (WRITING)" : "DRY RUN (NO WRITES)");
  console.log("Limit:", limit ?? "none");
  console.log("--------------------------------------------------");

  const leadsRef = db.collection("leads");

  let processed = 0;
  let migrated = 0;
  let lastDoc = null;

  while (true) {
    let q = leadsRef.orderBy(admin.firestore.FieldPath.documentId()).limit(200);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();

    if (snap.empty) break;

    for (const docSnap of snap.docs) {
      lastDoc = docSnap;
      processed++;
      if (limit && processed > limit) break;

      const leadId = docSnap.id;
      const data = docSnap.data() || {};
      const journal = Array.isArray(data.journal) ? data.journal : [];

      if (journal.length === 0) continue;

      const adminJournalRef = leadsRef.doc(leadId).collection("adminJournal");
      const instructionsRef = leadsRef.doc(leadId).collection("instructions");

      console.log(`\nLead ${leadId}: journal entries = ${journal.length}`);

      if (!commit) {
        migrated++;
        continue;
      }

      // Batched writes (500 op limit). We'll chunk safely.
      let batch = db.batch();
      let ops = 0;

      for (let i = 0; i < journal.length; i++) {
        const entry = journal[i] || {};
        const entryId = pickDocId(entry, `entry_${i}`);

        // Store the full entry for admins
        const adminDocRef = adminJournalRef.doc(entryId);
        batch.set(
          adminDocRef,
          {
            ...entry,
            _migratedFromArray: true,
            _migratedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        ops++;

        // Optional: store “instructions” separately (visible to agents later)
        if (isInstructionEntry(entry)) {
          const instrDocRef = instructionsRef.doc(entryId);
          batch.set(
            instrDocRef,
            {
              text: entry.text || "",
              createdAt: entry.createdAt || admin.firestore.FieldValue.serverTimestamp(),
              createdBy: entry.createdBy || null,
              createdByEmail: entry.createdByEmail || "",
              type: String(entry.type || "instruction"),
              source: "migrated-from-journal",
            },
            { merge: true }
          );
          ops++;
        }

        // Commit in chunks before hitting 500
        if (ops >= 450) {
          await batch.commit();
          batch = db.batch();
          ops = 0;
        }
      }

      // Clear/remove journal from the lead doc so agents don’t see old history.
      // If your code expects journal to exist, keep it as [] (safe).
      // If you prefer removing entirely, use FieldValue.delete() instead.
      const leadDocRef = leadsRef.doc(leadId);
      batch.update(leadDocRef, {
        journal: [], // or: admin.firestore.FieldValue.delete()
        journalLastEntry: admin.firestore.FieldValue.delete(),
        latestActivity: admin.firestore.FieldValue.delete(),
        _adminJournalPreserved: true,
        _adminJournalMigratedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      ops++;

      if (ops > 0) await batch.commit();

      migrated++;
      console.log(`✅ Migrated lead ${leadId}`);
    }

    if (limit && processed >= limit) break;
  }

  console.log("\n--------------------------------------------------");
  console.log("DONE");
  console.log("Processed:", processed);
  console.log("Migrated:", migrated);
  console.log("--------------------------------------------------");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
