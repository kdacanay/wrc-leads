// functions/index.js
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const auth = admin.auth();
const db = admin.firestore();

/**
 * Callable function for admins to delete a user by UID.
 * Deletes from Firebase Auth and from the `users` collection.
 */
exports.deleteUserByUid = onCall(async (request) => {
  const context = request.auth;
  const data = request.data;

  // 1) Require auth
  if (!context) {
    throw new HttpsError(
      "unauthenticated",
      "You must be signed in to delete a user."
    );
  }

  const callerUid = context.uid;

  // 2) Look up the caller's Firestore user document
  const callerDoc = await db.collection("users").doc(callerUid).get();

  if (!callerDoc.exists) {
    throw new HttpsError(
      "permission-denied",
      "Caller user doc not found; cannot verify admin role."
    );
  }

  const callerData = callerDoc.data();
  if (callerData.role !== "admin") {
    throw new HttpsError(
      "permission-denied",
      "Only admins can delete users."
    );
  }

  // 3) Validate target UID
  const uid = data?.uid;
  if (!uid) {
    throw new HttpsError("invalid-argument", "Missing uid.");
  }

  try {
    logger.info(`Deleting user ${uid} from Auth and Firestore...`);

    // 4) Delete Auth user
    await auth.deleteUser(uid);

    // 5) Delete Firestore user doc
    await db.collection("users").doc(uid).delete();

    logger.info(`Successfully deleted user ${uid}.`);
    return { success: true };
  } catch (err) {
    logger.error("deleteUserByUid error:", err);
    throw new HttpsError("internal", "Failed to delete user.");
  }
});