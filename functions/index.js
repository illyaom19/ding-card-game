// functions/index.js
const { setGlobalOptions } = require("firebase-functions/v2");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
admin.initializeApp();

setGlobalOptions({ region: "us-central1" });

exports.notifyTurn = onDocumentUpdated("rooms/{roomId}", async (event) => {
  const before = event.data.before.data() || {};
  const after = event.data.after.data() || {};
  const beforeUid = before.turnUid || null;
  const afterUid = after.turnUid || null;

  if (!afterUid || beforeUid === afterUid) return null;

  const userSnap = await admin.firestore().doc(`users/${afterUid}`).get();
  const userData = userSnap.data() || {};
  const tokens = Array.isArray(userData.pushTokens) ? userData.pushTokens : [];
  const uniqueTokens = Array.from(new Set(tokens.filter(Boolean)));
  if (!uniqueTokens.length) return null;

  const roomName = after.roomName || "Player's Lobby";
  const turnKey = `${after.handId || 0}-${after.trickNumber || 0}-${after.currentTurnIndex || 0}-${after.phase || ""}`;
  const payload = {
    data: {
      roomId: event.params.roomId,
      roomName,
      title: "DING Online",
      body: "It's your turn...",
      turnKey,
    },
  };

  const sendOnce = async (tokensToSend) =>
    admin.messaging().sendEachForMulticast({
      tokens: tokensToSend,
      ...payload,
    });

  const res = await sendOnce(uniqueTokens);

  const invalid = [];
  const retryable = [];
  res.responses.forEach((r, idx) => {
    if (!r.success && r.error) {
      const code = r.error.code;
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token"
      ) {
        invalid.push(uniqueTokens[idx]);
      } else if (code === "messaging/internal-error" || code === "messaging/server-unavailable") {
        retryable.push(uniqueTokens[idx]);
      }
    }
  });

  if (retryable.length) {
    try {
      await sendOnce(retryable);
    } catch (err) {
      console.warn("Retry push send failed:", err);
    }
  }

  if (invalid.length) {
    await admin.firestore().doc(`users/${afterUid}`).update({
      pushTokens: admin.firestore.FieldValue.arrayRemove(...invalid),
    });
  }

  await admin.firestore().doc(`users/${afterUid}`).set(
    {
      lastTurnNotification: turnKey,
      lastTurnNotifiedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await new Promise((resolve) => setTimeout(resolve, 15000));

  const latestRoomSnap = await admin.firestore().doc(`rooms/${event.params.roomId}`).get();
  const latestRoom = latestRoomSnap.data() || {};
  const latestKey = `${latestRoom.handId || 0}-${latestRoom.trickNumber || 0}-${latestRoom.currentTurnIndex || 0}-${latestRoom.phase || ""}`;
  if (latestRoom.turnUid !== afterUid || latestKey !== turnKey) return null;

  const ackSnap = await admin.firestore().doc(`users/${afterUid}`).get();
  const ackData = ackSnap.data() || {};
  if (ackData.lastTurnAck !== turnKey) {
    try {
      await sendOnce(uniqueTokens);
    } catch (err) {
      console.warn("Retry notification send failed:", err);
    }
  }
  return null;
});
