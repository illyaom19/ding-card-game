// functions/index.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

exports.notifyTurn = functions.firestore
  .document("rooms/{roomId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    const beforeUid = before.turnUid || null;
    const afterUid = after.turnUid || null;

    if (!afterUid || beforeUid === afterUid) return null;

    const userSnap = await admin.firestore().doc(`users/${afterUid}`).get();
    const userData = userSnap.data() || {};
    const tokens = Array.isArray(userData.pushTokens) ? userData.pushTokens : [];
    if (!tokens.length) return null;

    const roomName = after.roomName || "Player's Lobby";
    const payload = {
      notification: {
        title: "DING Online",
        body: `DING Online - It's your turn in ${roomName}`,
      },
      data: {
        roomId: context.params.roomId,
        roomName,
      },
    };

    const res = await admin.messaging().sendEachForMulticast({
      tokens,
      ...payload,
    });

    const invalid = [];
    res.responses.forEach((r, idx) => {
      if (!r.success && r.error) {
        const code = r.error.code;
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token"
        ) {
          invalid.push(tokens[idx]);
        }
      }
    });

    if (invalid.length) {
      await admin.firestore().doc(`users/${afterUid}`).update({
        pushTokens: admin.firestore.FieldValue.arrayRemove(...invalid),
      });
    }
    return null;
  });
