// src/utils/importVleadsXlsx.js
import * as XLSX from "xlsx";
import {
  doc,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";

// ---------- helpers ----------
const norm = (v) => (v ?? "").toString().trim();

const clean = (v) => {
  const s = norm(v);
  if (!s) return "";
  const up = s.toUpperCase();
  if (up === "NA" || up === "N/A" || up === "NONE") return "";
  return s;
};

const normalizeEmail = (email) => clean(email).toLowerCase();
const normalizePhone = (phone) => clean(phone).replace(/[^\d]/g, "");

const safeNumber = (v) => {
  const s = clean(v).replace(/[$,]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

// deterministic hash (stable across sessions)
function stableHash(str) {
  let h1 = 0xdeadbeef ^ str.length,
    h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

function splitName(fullName) {
  const s = clean(fullName);
  if (!s) return { firstName: "", lastName: "" };
  const parts = s.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

/**
 * Handles:
 * - Firestore Timestamp
 * - JS Date
 * - unix ms (13 digits) or seconds (10 digits)
 * - Excel serial date (e.g., 46028)
 * - date strings
 */
function parseExcelDate(raw) {
  if (raw == null || raw === "") return null;

  if (raw instanceof Timestamp) return raw;

  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return Timestamp.fromDate(raw);
  }

  const s = norm(raw);
  const isDigitsOnly = /^[0-9]+$/.test(s);
  const asNum =
    typeof raw === "number" ? raw : isDigitsOnly ? Number(s) : NaN;

  if (Number.isFinite(asNum)) {
    // unix ms
    if (asNum >= 1e12 && asNum <= 9e15) {
      const ts = Timestamp.fromMillis(asNum);
      if (ts.seconds > 253402300799) return null; // year 9999
      return ts;
    }
    // unix seconds
    if (asNum >= 1e9 && asNum < 1e12) {
      const ts = Timestamp.fromMillis(asNum * 1000);
      if (ts.seconds > 253402300799) return null;
      return ts;
    }
    // excel serial days
    if (asNum >= 20000 && asNum <= 80000) {
      const d = XLSX.SSF.parse_date_code(asNum);
      if (d) {
        const js = new Date(
          d.y,
          d.m - 1,
          d.d,
          d.H || 0,
          d.M || 0,
          d.S || 0
        );
        if (!Number.isNaN(js.getTime())) return Timestamp.fromDate(js);
      }
    }
  }

  // date string
  if (s && !isDigitsOnly) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return Timestamp.fromDate(d);
  }

  return null;
}

function adminActivityPatch(text) {
  return {
    latestActivityAdmin: text,
    latestActivity: text,
    latestActivityAt: serverTimestamp(),
  };
}

function getCol(row, ...candidates) {
  // direct hit
  for (const k of candidates) {
    if (k in (row || {})) return row[k];
  }
  // case/space tolerant
  const map = {};
  for (const key of Object.keys(row || {})) {
    map[key.trim().toLowerCase()] = key;
  }
  for (const c of candidates) {
    const real = map[c.trim().toLowerCase()];
    if (real) return row[real];
  }
  return "";
}

function recordingIdFromLink(url) {
  const s = clean(url);
  if (!s) return "";
  try {
    const u = new URL(s);
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  } catch {
    const parts = s.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  }
}

/**
 * Deterministic lead ID:
 * 1) phone
 * 2) email
 * 3) recording id (vocaroo)
 * 4) fingerprint hash of stable fields
 */
function leadIdFromRow(row) {
  const phone = normalizePhone(getCol(row, "Phone Number", "Phone"));
  if (phone) return `vleads_phone_${phone}`;

  const email = normalizeEmail(
    getCol(row, "Customer's Email", "Customer's email", "Email")
  );
  if (email) return `vleads_email_${email}`;

  const recId = recordingIdFromLink(getCol(row, "Recording Link", "Recording link"));
  if (recId) return `vleads_rec_${recId}`;

  const name = clean(getCol(row, "Customer Name", "Name"))
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  const zip = clean(getCol(row, "Zip Code", "Zip")).toLowerCase().trim();

  const addr = clean(getCol(row, "Customer's Address", "Customer's address"))
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  // include county/state if present to reduce collisions
  const county = clean(getCol(row, "County")).toLowerCase().trim();
  const state = clean(getCol(row, "State")).toLowerCase().trim();

  const fingerprint = `vleads|name:${name}|zip:${zip}|addr:${addr}|county:${county}|state:${state}`;
  return `vleads_fp_${stableHash(fingerprint)}`;
}

function isMostlyEmptyRow(obj) {
  const vals = Object.values(obj || {});
  for (const v of vals) {
    if (clean(v)) return false;
  }
  return true;
}

function mapVleadsStatusToAppStatus(v) {
  const s = clean(v).toLowerCase();
  if (!s) return "pending";
  if (s === "pending") return "pending";
  if (s.includes("do not call")) return "do_not_call";
  return "pending";
}

/**
 * Deterministic journal entries (ids based on leadId + label + value + timestamp)
 */
function buildJournalArray(row, actor, leadId) {
  const entries = [];
  const tsParsed = parseExcelDate(getCol(row, "Timestamp"));

  const createdAt = tsParsed || Timestamp.fromDate(new Date());

  const baseMeta = {
    createdAt,
    createdBy: actor?.uid || "vleads_import",
    createdByEmail: actor?.email || "vleads_import",
    source: "vleads_import",
  };

  const addEntry = (label, value) => {
    const v = clean(value);
    if (!v) return;

    const tsKey = createdAt?.seconds ? String(createdAt.seconds) : "no_ts";
    const key = `${leadId}|${label}|${v}|${tsKey}`;
    const id = `imp_${stableHash(key)}`;

    entries.push({
      id,
      text: `${label}\n${v}`,
      type: "import",
      ...baseMeta,
    });
  };

  addEntry(
    "Nicholas's Comments:",
    getCol(row, "Nicholas 's Comments", "Nicholas's Comments")
  );
  addEntry(
    "Rich Natoli's Comments:",
    getCol(row, "Rich Natoli's Comments", "Rich Natoli's comments")
  );
  addEntry("Quality Comment:", getCol(row, "Quality Comment"));
  addEntry("Comments:", getCol(row, "Comments", "Comment", "comments"));

  const rec = clean(getCol(row, "Recording Link", "Recording link"));
  if (rec) addEntry("Recording Link:", rec);

  return entries;
}

// ---------- main ----------
export async function importVleadsXlsx(file, actor) {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Read as 2D matrix so we can detect header row
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  if (!Array.isArray(matrix) || matrix.length === 0) {
    return { imported: 0, skipped: 0, reason: "empty_sheet" };
  }

  const REQUIRED = [
    "customer name",
    "phone number",
    "timestamp",
    "status",
    "lead quality",
  ];
  let headerRowIndex = -1;

  for (let r = 0; r < Math.min(matrix.length, 30); r++) {
    const row = (matrix[r] || []).map((c) => norm(c).toLowerCase());
    const hits = REQUIRED.filter((k) => row.includes(k)).length;
    if (hits >= 3) {
      headerRowIndex = r;
      break;
    }
  }

  if (headerRowIndex === -1) {
    console.error("[vleads] Could not find header row. First rows:", matrix.slice(0, 6));
    throw new Error("Could not detect header row in this Excel file.");
  }

  const headers = (matrix[headerRowIndex] || []).map((h) => norm(h));
  const dataRows = matrix.slice(headerRowIndex + 1);

  const rows = dataRows
    .map((arr) => {
      const obj = {};
      headers.forEach((h, idx) => {
        if (!h) return;
        obj[h] = arr?.[idx] ?? "";
      });
      return obj;
    })
    .filter((obj) => !isMostlyEmptyRow(obj));

  console.log("[vleads] header row index:", headerRowIndex + 1, "headers:", headers);
  console.log("[vleads] first row sample:", rows[0]);

  if (!rows.length) {
    return { imported: 0, skipped: 0, reason: "no_data_rows_after_header" };
  }

  const CHUNK = 350;
  let imported = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);

    // 1) First batch: lead docs only
    {
      const batch = writeBatch(db);

      for (let j = 0; j < slice.length; j++) {
        const row = slice[j];

        const leadId = leadIdFromRow(row);
        const leadRef = doc(db, "leads", leadId);

        const createdAtTs = parseExcelDate(getCol(row, "Timestamp"));
        const { firstName, lastName } = splitName(
          clean(getCol(row, "Customer Name"))
        );

        const phone = clean(getCol(row, "Phone Number"));
        const email = normalizeEmail(getCol(row, "Customer's Email"));

        if (!firstName && !lastName && !phone && !email) {
          skipped++;
          continue;
        }

        const journalEntries = buildJournalArray(row, actor, leadId);
        const journalLastEntry = journalEntries.length
          ? journalEntries[journalEntries.length - 1].text
          : "";

        const vleadsStatusRaw = clean(getCol(row, "Status"));
        const mappedStatus = mapVleadsStatusToAppStatus(vleadsStatusRaw);

        const leadQuality = clean(getCol(row, "Lead Quality"));

        const activity = `Lead imported from vleads Excel (${sheetName}).`;

        // optional debug / audit fingerprint
        const importKey = leadId;

        const leadDoc = {
          firstName,
          lastName,
          phone,
          email,
          contact: [phone ? `📞 ${phone}` : "", email ? `✉️ ${email}` : ""]
            .filter(Boolean)
            .join(" • "),

          // ✅ use status from XLSX
          status: mappedStatus,

          leadType: "seller",
          relationshipRanking: "0",
          urgencyRanking: "unsure",
          source: "vleads",

          // ✅ top-level
          leadQuality,

          registeredDateRaw: createdAtTs || null,
          nextEvaluationDate: null,

          assignedAgentId: null,
          assignedAgentName: null,
          assignedAgentEmail: null,
          assignedAgentIds: [],
          assignedAgentEmailNorms: [],
          assignedAgents: [],

          actionItem: "Review new vlead",

          vleads: {
            leadQuality,
            vleadsStatus: clean(vleadsStatusRaw),
            qualityComment: clean(getCol(row, "Quality Comment")),
            recordingLink: clean(getCol(row, "Recording Link", "Recording link")),
            customerAddress: clean(getCol(row, "Customer's Address", "Customer's address")),
            state: clean(getCol(row, "State")),
            county: clean(getCol(row, "County")),
            zip: clean(getCol(row, "Zip Code", "Zip Code ")),
            propertyType: clean(getCol(row, "Property Type", "property type")),
            bedsBaths: clean(getCol(row, "No. of Bedrooms/Bathrooms", "no of bedrooms/bathrooms")),
            squareFeet: safeNumber(getCol(row, "Square Feet of House", "square feet of house")),
            expectedPropertyValue: safeNumber(
              getCol(row, "Expected Property Value $$$$$$$", "Expected Property Value", "expected property value")
            ),
            sellingDuration: clean(getCol(row, "Duration of Selling the Property", "duration of selling the property")),

            // helpful import auditing
            importKey,
            lastImportedAt: serverTimestamp(),
            lastImportedBy: actor?.email || actor?.uid || "vleads_import",
          },

          journalLastEntry: journalLastEntry || activity,

          // keep createdAt stable if it already exists:
          // if it already exists in Firestore, merge:true won't overwrite unless you set it;
          // we still set it to createdAtTs/serverTimestamp for first import.
          createdAt: createdAtTs || serverTimestamp(),
          updatedAt: serverTimestamp(),
          updatedBy: actor?.uid || null,

          ...adminActivityPatch(activity),
        };

        batch.set(leadRef, leadDoc, { merge: true });
        imported++;
      }

      await batch.commit();
    }

    // 2) Second step: journal subcollection writes (in safe mini-batches)
    {
      let writeCount = 0;
      let journalBatch = writeBatch(db);

      for (let j = 0; j < slice.length; j++) {
        const row = slice[j];
        const leadId = leadIdFromRow(row);

        const journalEntries = buildJournalArray(row, actor, leadId);

        for (const entry of journalEntries) {
          const entryRef = doc(db, "leads", leadId, "journal", entry.id);
          journalBatch.set(entryRef, entry, { merge: true });
          writeCount++;

          // Firestore batch max is 500 writes — stay under it
          if (writeCount >= 450) {
            await journalBatch.commit();
            journalBatch = writeBatch(db);
            writeCount = 0;
          }
        }
      }

      if (writeCount > 0) {
        await journalBatch.commit();
      }
    }
  }

  return { imported, skipped };
}
