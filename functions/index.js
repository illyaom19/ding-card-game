// functions/index.js
const { setGlobalOptions } = require("firebase-functions/v2");
const { onDocumentUpdated, onDocumentCreated } = require("firebase-functions/v2/firestore");
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
      body: `It's your turn in ${roomName}.`,
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

exports.notifyChat = onDocumentCreated("rooms/{roomId}/roomLog/{logId}", async (event) => {
  const entry = event.data.data() || {};
  if (entry.type !== "chat") return null;
  const roomId = event.params.roomId;
  const message = (entry.message || "").toString();
  if (!message) return null;

  const roomSnap = await admin.firestore().doc(`rooms/${roomId}`).get();
  if (!roomSnap.exists) return null;
  const roomData = roomSnap.data() || {};
  const roomName = roomData.roomName || "Player's Lobby";
  const senderUid = entry.playerUid || null;
  const senderName = entry.playerName || "Player";

  const players = Array.isArray(roomData.players) ? roomData.players : [];
  const targetUids = players
    .map((p) => p && p.uid)
    .filter(Boolean)
    .filter((uid) => uid !== senderUid);
  if (!targetUids.length) return null;

  const userRefs = targetUids.map((uid) => admin.firestore().doc(`users/${uid}`));
  const userSnaps = await admin.firestore().getAll(...userRefs);
  const tokens = [];
  const tokenToUid = new Map();
  userSnaps.forEach((snap, idx) => {
    if (!snap.exists) return;
    const uid = targetUids[idx];
    const userData = snap.data() || {};
    const pushTokens = Array.isArray(userData.pushTokens) ? userData.pushTokens : [];
    pushTokens.forEach((token) => {
      if (!token) return;
      tokens.push(token);
      tokenToUid.set(token, uid);
    });
  });

  const uniqueTokens = Array.from(new Set(tokens));
  if (!uniqueTokens.length) return null;

  const payload = {
    data: {
      roomId,
      roomName,
      title: "DING Online",
      body: `${senderName} sent a message in ${roomName}: ${message}`,
    },
  };

  const sendOnce = async (tokensToSend) =>
    admin.messaging().sendEachForMulticast({
      tokens: tokensToSend,
      ...payload,
    });

  const res = await sendOnce(uniqueTokens);

  const invalidByUid = new Map();
  const retryable = [];
  res.responses.forEach((r, idx) => {
    if (!r.success && r.error) {
      const code = r.error.code;
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token"
      ) {
        const token = uniqueTokens[idx];
        const uid = tokenToUid.get(token);
        if (!uid) return;
        if (!invalidByUid.has(uid)) invalidByUid.set(uid, []);
        invalidByUid.get(uid).push(token);
      } else if (code === "messaging/internal-error" || code === "messaging/server-unavailable") {
        retryable.push(uniqueTokens[idx]);
      }
    }
  });

  if (retryable.length) {
    try {
      await sendOnce(retryable);
    } catch (err) {
      console.warn("Retry chat push send failed:", err);
    }
  }

  const invalidWrites = [];
  invalidByUid.forEach((tokensToRemove, uid) => {
    invalidWrites.push(
      admin.firestore().doc(`users/${uid}`).update({
        pushTokens: admin.firestore.FieldValue.arrayRemove(...tokensToRemove),
      })
    );
  });
  if (invalidWrites.length) {
    await Promise.allSettled(invalidWrites);
  }
  return null;
});
