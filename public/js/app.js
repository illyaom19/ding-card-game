/**
 * Main entry point for DING Online. Wires together state, UI rendering,
 * Firebase services, and feature modules.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, getDocFromServer, updateDoc, deleteDoc, onSnapshot, collection, serverTimestamp, writeBatch, addDoc, query, orderBy, arrayUnion, arrayRemove, enableNetwork } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-messaging.js";
import {
  SUIT_ICON,
  RANK_LABEL,
  makeDecks,
  shuffle,
  cardLabel,
  isRedSuit,
  canFollowSuit,
  determineTrickWinner,
  checkFastTrackWin,
} from "./modules/gameplay-utils.js";
import { createAnimationController } from "./modules/animations.js";
import { createAuthController } from "./modules/auth.js";
import {
  normalizeRoomCode,
  normalizeRoomName,
  getRoomDisplayName,
  getNameInitial,
  getDefaultRoomName,
  makeRoomCode,
  roomShareLink,
} from "./modules/rooms.js";
/** =========================
 *  Ding Prototype (Hotseat)
 *  =========================
 *  Adjustable house rules:
 *  - Next hand dealer: set DEALER_RULE
 *    "LAST_TRICK_WINNER" (default) or "ROTATE"
 */
const DEALER_RULE = "ROTATE"; // or "ROTATE"

const PHASE = {
  LOBBY: "LOBBY",
  SWAP: "SWAP",
  TRICK: "TRICK",
  HAND_END: "HAND_END",
  GAME_OVER: "GAME_OVER",
};
const MODE = {
  HOTSEAT: "HOTSEAT",
  MULTI: "MULTI",
};

const firebaseConfig = globalThis.FIREBASE_CONFIG || null;
const appCommit = globalThis.APP_COMMIT || "";
const firebaseVapidKey = globalThis.FIREBASE_VAPID_KEY || "";
const firebaseApp = firebaseConfig ? initializeApp(firebaseConfig) : null;
const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null;
const firebaseDb = firebaseApp ? getFirestore(firebaseApp) : null;
const firebaseMessaging = firebaseApp ? getMessaging(firebaseApp) : null;
const googleProvider = firebaseAuth ? new GoogleAuthProvider() : null;
const ROOM_COLLECTION = "rooms";
const USER_COLLECTION = "users";
const LOG_COLLECTION = "roomLog";
const MAX_PLAYERS = 6;
const MAX_NICKNAME_LENGTH = 18;
const PWA_FIRST_LAUNCH_KEY = "dingPwaFirstLaunch";
const CHAT_VOICE_MAX_SECONDS = 10;
const CHAT_VOICE_MAX_BYTES = 700000;
const CHAT_VOICE_TTL_MS = 30 * 60 * 1000;
const CHAT_SCROLL_FUZZ = 12;
// removed unused helper: clone()

const state = {
  mode: MODE.MULTI,
  phase: PHASE.LOBBY,
  lastPhase: PHASE.LOBBY,
  players: [],
  playerOrder: [],
  startVotes: [],
  roomId: null,
  roomName: null,
  roomNameDraft: "",
  roomCreatedBySelf: false,
  joinRoomActive: false,
  playerMenuTarget: null,
  playRequestPending: false,
  playRequestTimer: null,
  hasMadeFirstMove: false,
  pwaPromptDismissed: false,
  pushToken: null,
  swRegistration: null,
  swUpdateListenerReady: false,
  swReloading: false,
  hostUid: null,
  selfUid: null,
  selfName: null,
  selfNickname: null,
  roomNicknames: {},
  lastRoomId: null,
  roomIds: [],
  roomList: {},
  unsubRoomList: [],
  profileLoaded: false,
  selfIndex: null,
  selfHand: [],
  isSignedIn: false,
  unsubRoom: null,
  unsubPlayers: null,
  unsubHand: null,
  unsubLog: null,
  roomSynced: false,
  handSynced: false,
  roomResyncing: false,
  handResyncing: false,
  isApplyingRemote: false,
  dealerIndex: 0,
  leaderIndex: 0,        // who leads the current trick
  currentTurnIndex: 0,   // whose action is required (swap or play)
  trickNumber: 0,
  deck: [],
  trumpCard: null,
  trumpSuit: null,
  currentTrick: { plays: [], leadSuit: null },
  handId: 0,
  gameId: 0,
  selectedCardIds: new Set(),
  selectedForSwap: new Set(),
  // animation & deal helpers
  incomingCardIds: new Set(), // cards that should animate in
  incomingAnimationPlayed: new Set(),
  // per-player initial reveal flags: players with pending initial reveal
  playersPendingInitial: new Set(),
  dealing: false,             // whether a deal animation is in progress
  dealTimeouts: [],          // timeout handles for canceling scheduled deals
  autoPassTimer: null,
  lockOn: false,
  pendingRevealForIndex: null,
  lastTrickWinnerIndex: null,
  lastTrickWinnerKey: null,
  lastCompletedTrick: null,
  winnerIndex: null,
  settings: {
    startingScore: 20,
    dingPenalty: "reset",
    foldThreshold: 5,
    foldPenalty: "threshold",
    decks: 1,
    hyperrealistic: false,
  },
  settingsCollapsed: true,
  appCommit,
  debugLogEnabled: false,
  debugLogLines: [],
  discardPile: [],
  playedCards: [],
  logEntries: [],
  logCollapsed: true,
  chatHasUnseen: false,
  lastChatCount: 0,
  chatVoiceDraft: null,
  chatVoiceNotice: null,
  chatVoicePanelActivated: false,
  chatVoiceRecording: false,
  chatVoiceRecordingStartedAt: 0,
  chatVoiceRecorder: null,
  chatVoiceStream: null,
  chatVoiceChunks: [],
  chatVoiceTimer: null,
  chatVoiceTimeout: null,
  connectionStatus: "unknown",
  connectionStatusDetail: "",
  lastConnectionChangeAt: 0,
  connectionStatusTimer: null,
  offlineFallbackEnabled: false,
  reconnecting: false,
  handEndedByFolds: false,
  foldWinIndex: null,
  lastPopupKey: "",
  lastNotificationKey: "",
  lastNotificationAcked: "",
  unsubConnectivity: null,
  reconnectTimer: null,
  popupTimer: null,
  popupDismissTimer: null,
  popupHideTimer: null,
  popupDismissible: false,
  swapCounts: {},
  swapNoticeHistory: new Set(),
  swapAnnouncementTimer: null,
  swapAnnouncementHideTimer: null,
  incomingTimers: [],
  dealFadePending: false,
  lastDealtHandId: null,
  collapsed: { game:false, table:false, hand:false },
};

const els = {
  phasePill: document.getElementById("phasePill"),
  trumpPill: document.getElementById("trumpPill"),
  leadPill: document.getElementById("leadPill"),
  phasePillWrap: document.getElementById("phasePillWrap"),
  trumpPillWrap: document.getElementById("trumpPillWrap"),
  leadPillWrap: document.getElementById("leadPillWrap"),
  homeIconBtn: document.getElementById("homeIconBtn"),
  headerGreeting: document.getElementById("headerGreeting"),
  headerTapZone: document.getElementById("headerTapZone"),
  gameTitle: document.getElementById("gameTitle"),
  pwaPrompt: document.getElementById("pwaPrompt"),
  pwaPromptTitle: document.getElementById("pwaPromptTitle"),
  pwaPromptBody: document.getElementById("pwaPromptBody"),
  pwaPromptSteps: document.getElementById("pwaPromptSteps"),
  pwaPromptStatus: document.getElementById("pwaPromptStatus"),
  pwaEnableBtn: document.getElementById("pwaEnableBtn"),
  pwaDismissBtn: document.getElementById("pwaDismissBtn"),
  commitHash: document.getElementById("commitHash"),
  debugLog: document.getElementById("debugLog"),
  footerDebug: document.getElementById("footerDebug"),

  lobbyArea: document.getElementById("lobbyArea"),
  controlsArea: document.getElementById("controlsArea"),
  namesInput: document.getElementById("namesInput"),
  startActions: document.getElementById("startActions"),
  startGameBtn: document.getElementById("startGameBtn"),
  voteStartBtn: document.getElementById("voteStartBtn"),
  voteStartStatus: document.getElementById("voteStartStatus"),
  voteStartBlock: document.getElementById("voteStartBlock"),
  startHandBtn: document.getElementById("startHandBtn"),
  roomMenuWrap: document.getElementById("roomMenuWrap"),
  roomMenuBtn: document.getElementById("roomMenuBtn"),
  roomMenu: document.getElementById("roomMenu"),
  menuResetBtn: document.getElementById("menuResetBtn"),
  menuResetHandBtn: document.getElementById("menuResetHandBtn"),
  menuBackLobbyBtn: document.getElementById("menuBackLobbyBtn"),
  menuInviteRoomBtn: document.getElementById("menuInviteRoomBtn"),
  menuLeaveRoomBtn: document.getElementById("menuLeaveRoomBtn"),
  menuEnableNotificationsBtn: document.getElementById("menuEnableNotificationsBtn"),
  menuDivider: document.getElementById("menuDivider"),
  modeHotseatBtn: document.getElementById("modeHotseatBtn"),
  modeMultiBtn: document.getElementById("modeMultiBtn"),
  modeHint: document.getElementById("modeHint"),
  mpCard: document.getElementById("mpCard"),
  signInBtn: document.getElementById("signInBtn"),
  signOutBtn: document.getElementById("signOutBtn"),
  authStatus: document.getElementById("authStatus"),
  nicknameRow: document.getElementById("nicknameRow"),
  nicknameInput: document.getElementById("nicknameInput"),
  saveNicknameBtn: document.getElementById("saveNicknameBtn"),
  nicknameStatus: document.getElementById("nicknameStatus"),
  nicknameDivider: document.getElementById("nicknameDivider"),
  roomNameRow: document.getElementById("roomNameRow"),
  roomNameInput: document.getElementById("roomNameInput"),
  saveRoomNameBtn: document.getElementById("saveRoomNameBtn"),
  roomNameStatus: document.getElementById("roomNameStatus"),
  roomNameDivider: document.getElementById("roomNameDivider"),
  roomCodeInput: document.getElementById("roomCodeInput"),
  createRoomBtn: document.getElementById("createRoomBtn"),
  joinRoomBtn: document.getElementById("joinRoomBtn"),
  shareRoomBtn: document.getElementById("shareRoomBtn"),
  roomStatus: document.getElementById("roomStatus"),
  lobbyHotseatIntro: document.getElementById("lobbyHotseatIntro"),
  lobbyPlayers: document.getElementById("lobbyPlayers"),
  roomLobbyCard: document.getElementById("roomLobbyCard"),
  roomLobbyTitle: document.getElementById("roomLobbyTitle"),
  roomLobbySub: document.getElementById("roomLobbySub"),
  roomListSection: document.getElementById("roomListSection"),
  roomList: document.getElementById("roomList"),
  roomListEmpty: document.getElementById("roomListEmpty"),
  lobbyChatSlot: document.getElementById("lobbyChatSlot"),
  tableArea: document.getElementById("tableArea"),
  logCard: document.getElementById("logCard"),
  logHeader: document.getElementById("logHeader"),
  logCaret: document.getElementById("logCaret"),
  logList: document.getElementById("logList"),
  logHint: document.getElementById("logHint"),
  chatBlock: document.getElementById("chatBlock"),
  chatList: document.getElementById("chatList"),
  chatHint: document.getElementById("chatHint"),
  chatUnreadDot: document.getElementById("chatUnreadDot"),
  chatInput: document.getElementById("chatInput"),
  chatSendBtn: document.getElementById("chatSendBtn"),
  chatMicBtn: document.getElementById("chatMicBtn"),
  chatVoiceDraft: document.getElementById("chatVoiceDraft"),
  chatVoiceStatus: document.getElementById("chatVoiceStatus"),
  chatVoiceTimer: document.getElementById("chatVoiceTimer"),
  chatVoiceAudio: document.getElementById("chatVoiceAudio"),
  chatVoiceDeleteBtn: document.getElementById("chatVoiceDeleteBtn"),
  chatVoiceSendBtn: document.getElementById("chatVoiceSendBtn"),
  playerMenu: document.getElementById("playerMenu"),
  playerMenuChangeNameBtn: document.getElementById("playerMenuChangeNameBtn"),
  playerMenuNameRow: document.getElementById("playerMenuNameRow"),
  playerMenuNameInput: document.getElementById("playerMenuNameInput"),
  playerMenuSaveNameBtn: document.getElementById("playerMenuSaveNameBtn"),
  playerMenuNameDivider: document.getElementById("playerMenuNameDivider"),
  playerMenuKickBtn: document.getElementById("playerMenuKickBtn"),
  playerMenuMakeHostBtn: document.getElementById("playerMenuMakeHostBtn"),
  reconnectOverlay: document.getElementById("reconnectOverlay"),
  reconnectStatus: document.getElementById("reconnectStatus"),
  offlineModeBtn: document.getElementById("offlineModeBtn"),
  fullscreenPopup: document.getElementById("fullscreenPopup"),
  popupCard: document.getElementById("popupCard"),
  popupTitle: document.getElementById("popupTitle"),
  popupSubtitle: document.getElementById("popupSubtitle"),
  confetti: document.getElementById("confetti"),

  scoreboard: document.getElementById("scoreboard"),
  gameOverActions: document.getElementById("gameOverActions"),
  gameOverActionRow: document.getElementById("gameOverActionRow"),
  gameOverHint: document.getElementById("gameOverHint"),
  newGameBtn: document.getElementById("newGameBtn"),
  statusText: document.getElementById("statusText"),
  deckText: document.getElementById("deckText"),
  errorBox: document.getElementById("errorBox"),

  trickArea: document.getElementById("trickArea"),
  tableHint: document.getElementById("tableHint"),
  swapSummary: document.getElementById("swapSummary"),
  swapSummaryList: document.getElementById("swapSummaryList"),
  swapAnnouncement: document.getElementById("swapAnnouncement"),
  swapAnnouncementCards: document.getElementById("swapAnnouncementCards"),
  swapAnnouncementText: document.getElementById("swapAnnouncementText"),
  handArea: document.getElementById("handArea"),
  handHint: document.getElementById("handHint"),
  autoPassViz: document.getElementById("autoPassViz"),
  autoPassRing: document.getElementById("autoPassRing"),
  autoPassLabel: document.getElementById("autoPassLabel"),
  passBtn: document.getElementById("passBtn"),
  selectedCount: document.getElementById("selectedCount"),
  confirmSwapBtn: document.getElementById("confirmSwapBtn"),
  confirmPlayBtn: document.getElementById("confirmPlayBtn"),

  turnName: document.getElementById("turnName"),
  dealerName: document.getElementById("dealerName"),
  trickNum: document.getElementById("trickNum"),
  tableChips: document.getElementById("tableChips"),

  lock: document.getElementById("lock"),
  lockTitle: document.getElementById("lockTitle"),
  lockText: document.getElementById("lockText"),
  revealBtn: document.getElementById("revealBtn"),
  foldBtn: document.getElementById("foldBtn"),
  settingsCard: document.getElementById("settingsCard"),
  settingsHeader: document.getElementById("settingsHeader"),
  settingsCaret: document.getElementById("settingsCaret"),
  settingsBody: document.getElementById("settingsBody"),
  settingsLockPill: document.getElementById("settingsLockPill"),
  startingScoreInput: document.getElementById("startingScoreInput"),
  startingScoreValue: document.getElementById("startingScoreValue"),
  foldThresholdInput: document.getElementById("foldThresholdInput"),
  foldThresholdValue: document.getElementById("foldThresholdValue"),
  foldPenaltyThresholdInput: document.getElementById("foldPenaltyThresholdInput"),
  foldPenaltyIncreaseInput: document.getElementById("foldPenaltyIncreaseInput"),
  deckCountInput: document.getElementById("deckCountInput"),
  deckCountValue: document.getElementById("deckCountValue"),
  hyperrealisticInput: document.getElementById("hyperrealisticInput"),
  gamePanel: document.getElementById("gamePanel"),
  tablePanel: document.getElementById("tablePanel"),
  handPanel: document.getElementById("handPanel"),
  gameHeader: document.getElementById("gameHeader"),
  tableHeader: document.getElementById("tableHeader"),
  handHeader: document.getElementById("handHeader"),
  gameCaret: document.getElementById("gameCaret"),
  tableCaret: document.getElementById("tableCaret"),
  handCaret: document.getElementById("handCaret"),
  collapseGameBtn: document.getElementById("collapseGameBtn"),
  collapseTableBtn: document.getElementById("collapseTableBtn"),
  collapseHandBtn: document.getElementById("collapseHandBtn"),
  gameSummary: document.getElementById("gameSummary"),
  tableSummary: document.getElementById("tableSummary"),
  handSummary: document.getElementById("handSummary"),
};

const animations = createAnimationController({ state, els, render });
const {
  animateFoldOut,
  clearIncomingTimers,
  queueIncomingCards,
  resetIncomingAnimationState,
  markDealFade,
  clearSwapAnnouncementTimers,
  showSwapAnnouncement,
  spawnConfetti,
  hideFullscreenPopup,
  showFullscreenPopup,
  triggerPopupOnce,
} = animations;

function syncSettingsUI(){
  const s = state.settings;
  if(els.startingScoreInput){
    els.startingScoreInput.value = String(s.startingScore);
    els.startingScoreValue.textContent = String(s.startingScore);
  }
  if(els.foldThresholdInput){
    els.foldThresholdInput.max = String(s.startingScore);
    els.foldThresholdInput.value = String(s.foldThreshold);
    els.foldThresholdValue.textContent = String(s.foldThreshold);
  }
  if(els.foldPenaltyThresholdInput && els.foldPenaltyIncreaseInput){
    const isIncrease = s.foldPenalty === "increase";
    els.foldPenaltyIncreaseInput.checked = isIncrease;
    els.foldPenaltyThresholdInput.checked = !isIncrease;
  }
  if(els.deckCountInput){
    els.deckCountInput.value = String(s.decks);
    els.deckCountValue.textContent = String(s.decks);
  }
  if(els.hyperrealisticInput){
    els.hyperrealisticInput.checked = !!s.hyperrealistic;
    const label = els.hyperrealisticInput.closest(".settingToggle");
    if(label) label.lastChild.nodeValue = s.hyperrealistic ? " ON" : " OFF";
  }
}

function clampSettings(){
  const s = state.settings;
  if(s.foldThreshold > s.startingScore) s.foldThreshold = s.startingScore;
  if(s.foldThreshold < 1) s.foldThreshold = 1;
  if(s.startingScore < 5) s.startingScore = 5;
  if(s.startingScore > 50) s.startingScore = 50;
  if(s.foldPenalty !== "threshold" && s.foldPenalty !== "increase") s.foldPenalty = "threshold";
  if(s.decks < 1) s.decks = 1;
  if(s.decks > 2) s.decks = 2;
}

let settingsSyncTimer = null;
function scheduleSettingsSync(){
  if(!isMultiplayer() || !state.roomId) return;
  if(state.selfUid !== state.hostUid) return;
  if(state.phase !== PHASE.LOBBY && state.phase !== PHASE.GAME_OVER) return;
  if(settingsSyncTimer) clearTimeout(settingsSyncTimer);
  settingsSyncTimer = setTimeout(()=>{
    settingsSyncTimer = null;
    syncRoomState("settings");
  }, 200);
}

function foldCurrentPlayer(){
  if(state.phase !== PHASE.SWAP) return;
  const isMulti = isMultiplayer();
  if(isMulti && !ensureConnectedForAction({ requireHand: true })) return;
  if(isMulti && state.selfIndex !== state.currentTurnIndex){
    setError("Not your turn.");
    return;
  }
  const p = isMulti ? state.players[state.selfIndex] : state.players[state.currentTurnIndex];
  if(!p || p.folded) return;
  if(state.currentTurnIndex === state.dealerIndex){
    setError("Dealer cannot fold.");
    return;
  }
  if(p.score < state.settings.foldThreshold){
    if(state.settings.foldPenalty === "increase"){
      p.score += 1;
    } else {
      p.score = state.settings.foldThreshold;
    }
  }
  // mark folded and mark as swapped so they are excluded from further swap turns
  p.folded = true;
  p.hasSwapped = true;
  if(isMulti){
    logRoomEvent({
      type: "fold",
      handId: state.handId,
      gameId: state.gameId,
      playerIndex: state.currentTurnIndex,
      playerName: p.name,
    });
  }
  // move their hand to discard pile (also handle trump if present)
  const hand = isMulti ? state.selfHand : p.hand;
  if(hand && hand.length){
    // if trump is in their hand, clear the global trump reference
    const trumpIdx = hand.findIndex(c => state.trumpCard && c.id === state.trumpCard.id);
    if(trumpIdx !== -1){
      state.discardPile.push(...hand);
      state.trumpCard = null;
      state.trumpSuit = null;
    } else {
      state.discardPile.push(...hand);
    }
    animateFoldOut();
    if(isMulti){
      state.selfHand = [];
      syncSelfHand();
    } else {
      p.hand = [];
    }
  }
  state.selectedForSwap.clear();
  setError(null);
  render();

  // If too few players remain, end the hand immediately
  if(activePlayersCount() < 2){
    const remainingIdx = firstActiveIndex(0);
    if(remainingIdx !== null && remainingIdx === state.dealerIndex){
      state.players[remainingIdx].tricksWonThisHand = 5;
      state.lastTrickWinnerIndex = remainingIdx;
    }
    state.handEndedByFolds = true;
    state.foldWinIndex = remainingIdx;
    endHand();
    return;
  }

  // Otherwise advance to next unswapped/active player
  advanceSwapTurn();
  if(isMulti) handleFirstMultiplayerMove();
  if(isMulti) syncRoomState("fold");
}

// wire fold button
if(els.foldBtn){
  els.foldBtn.addEventListener('click', ()=> foldCurrentPlayer());
} 

function setError(msg){
  if(!msg){
    els.errorBox.style.display = "none";
    els.errorBox.textContent = "";
    return;
  }
  els.errorBox.style.display = "block";
  els.errorBox.textContent = msg;
}

function isMultiplayer(){ return state.mode === MODE.MULTI; }
function hasFirebase(){ return !!(firebaseApp && firebaseAuth && firebaseDb); }
function roomRef(roomId){ return doc(firebaseDb, ROOM_COLLECTION, roomId); }
function userRef(uid){ return doc(firebaseDb, USER_COLLECTION, uid); }
function appMetaRef(){ return doc(firebaseDb, "meta", "app"); }
function ensureConnectedForAction(options = {}){
  const { requireHand = false } = options;
  if(!isMultiplayer()) return true;
  if(!state.isSignedIn){
    setError("Sign in first.");
    return false;
  }
  if(state.connectionStatus !== "connected"){
    setConnectionStatus("reconnecting", "Reconnecting to the database.");
    setError("Reconnecting...");
    return false;
  }
  if(!state.roomSynced){
    refreshRoomFromServer().catch(()=>{});
    setError("Syncing game state. Try again in a moment.");
    return false;
  }
  if(requireHand && !state.handSynced){
    refreshHandFromServer().catch(()=>{});
    setError("Syncing your hand. Try again in a moment.");
    return false;
  }
  return true;
}
function currentTurnKey(){
  return `${state.handId || 0}-${state.trickNumber || 0}-${state.currentTurnIndex || 0}-${state.phase || ""}`;
}
async function ackTurnNotification(turnKey){
  if(!turnKey || !state.selfUid || !firebaseDb) return;
  try{
    await setDoc(userRef(state.selfUid), {
      lastTurnAck: turnKey,
      lastTurnAckAt: serverTimestamp(),
    }, { merge: true });
    state.lastNotificationAcked = turnKey;
  } catch (err){
    console.error("Failed to ack turn notification:", err);
  }
}
function ackTurnNotificationIfNeeded(){
  if(!isMultiplayer() || !state.selfUid) return;
  if(state.selfIndex === null || state.selfIndex === undefined || state.selfIndex < 0) return;
  const isYourTurn = state.players[state.currentTurnIndex]?.uid === state.selfUid;
  if(!isYourTurn) return;
  const key = currentTurnKey();
  if(key && key !== state.lastNotificationAcked){
    ackTurnNotification(key);
  }
}
function formatCommitHash(commit){
  if(!commit) return "dev";
  return commit.length > 8 ? commit.slice(0, 7) : commit;
}
function updateCommitHashUI(){
  if(!els.commitHash) return;
  const label = formatCommitHash(state.appCommit);
  els.commitHash.textContent = `${label}`;
}
function renderDebugLog(){
  if(!els.debugLog) return;
  if(!state.debugLogEnabled){
    els.debugLog.style.display = "none";
    if(els.footerDebug) els.footerDebug.style.pointerEvents = "none";
    return;
  }
  els.debugLog.style.display = "block";
  if(els.footerDebug) els.footerDebug.style.pointerEvents = "auto";
  els.debugLog.textContent = state.debugLogLines.join("\n");
  els.debugLog.scrollTop = els.debugLog.scrollHeight;
}
function appendDebugLine(type, args){
  const parts = [];
  for(const arg of args){
    if(typeof arg === "string"){
      parts.push(arg);
      continue;
    }
    try{
      parts.push(JSON.stringify(arg));
    } catch (err){
      parts.push(String(arg));
    }
  }
  const line = `[${type}] ${parts.join(" ")}`;
  state.debugLogLines.push(line);
  if(state.debugLogLines.length > 200){
    state.debugLogLines = state.debugLogLines.slice(-200);
  }
  renderDebugLog();
}
function toggleDebugLog(){
  state.debugLogEnabled = !state.debugLogEnabled;
  renderDebugLog();
}
function handRef(roomId, uid){ return doc(firebaseDb, ROOM_COLLECTION, roomId, "hands", uid); }
function logCollectionRef(roomId){ return collection(firebaseDb, ROOM_COLLECTION, roomId, LOG_COLLECTION); }
function flashRoomStatus(msg){
  if(!els.roomStatus) return;
  const prev = els.roomStatus.textContent;
  els.roomStatus.textContent = msg;
  setTimeout(()=>{ updateRoomStatus(); }, 2000);
}
async function shareRoomCode(){
  const roomCode = normalizeRoomCode(state.roomId || (els.roomCodeInput ? els.roomCodeInput.value : ""));
  if(!roomCode){
    setError("Create or join a room first.");
    return;
  }
  const link = roomShareLink(roomCode);
  try{
    if(navigator.share){
      await navigator.share({
        title: "DING Online - Room invite",
        text: `Join my DING room: ${roomCode}`,
        url: link,
      });
      return;
    }
  } catch (err){
    // fall back to clipboard
  }
  try{
    if(navigator.clipboard && navigator.clipboard.writeText){
      await navigator.clipboard.writeText(link);
      flashRoomStatus("Room link copied.");
      return;
    }
  } catch (err){
    // fall back to input selection
  }
  if(els.roomCodeInput){
    els.roomCodeInput.value = roomCode;
    els.roomCodeInput.focus();
    els.roomCodeInput.select();
    document.execCommand("copy");
    flashRoomStatus("Room code copied.");
  }
}

function getEligibleStartVoteUids(){
  return state.players.map(p => p.uid).filter(Boolean);
}
function getStartVoteCounts(){
  const eligible = getEligibleStartVoteUids();
  const eligibleSet = new Set(eligible);
  const rawVotes = Array.isArray(state.startVotes) ? state.startVotes : [];
  const filteredVotes = eligibleSet.size
    ? rawVotes.filter(uid => eligibleSet.has(uid))
    : rawVotes.filter(Boolean);
  const uniqueVotes = Array.from(new Set(filteredVotes));
  return {
    votes: uniqueVotes,
    voteCount: uniqueVotes.length,
    totalCount: eligible.length || state.players.length,
  };
}
function hasVotedToStart(){
  if(!state.selfUid) return false;
  const { votes } = getStartVoteCounts();
  return votes.includes(state.selfUid);
}
function placeVoteStartBlock(){
  if(!els.voteStartBlock) return;
  const showGameOver = state.phase === PHASE.GAME_OVER;
  const target = showGameOver ? els.gameOverActionRow : els.startActions;
  if(target && els.voteStartBlock.parentElement !== target){
    target.appendChild(els.voteStartBlock);
  }
}
function updateVoteStartUI(){
  if(!els.voteStartStatus || !els.voteStartBlock || !els.voteStartBtn) return;
  const isMulti = isMultiplayer();
  const showStart = state.phase === PHASE.LOBBY || state.phase === PHASE.GAME_OVER;
  const showVote = showStart && isMulti && !!state.roomId;
  placeVoteStartBlock();
  els.voteStartBlock.style.display = showVote ? "flex" : "none";
  if(!showVote) return;
  const { voteCount, totalCount } = getStartVoteCounts();
  els.voteStartStatus.textContent = `Votes: ${voteCount}/${totalCount}`;
  els.voteStartBtn.textContent = state.phase === PHASE.GAME_OVER ? "Vote to start new game" : "Vote to start";
  const canVote = !!(state.roomId && state.isSignedIn
    && (state.phase === PHASE.LOBBY || state.phase === PHASE.GAME_OVER));
  els.voteStartBtn.disabled = !canVote || hasVotedToStart();
}
function maybeAutoStartFromVotes(){
  if(!isMultiplayer() || (state.phase !== PHASE.LOBBY && state.phase !== PHASE.GAME_OVER)) return;
  if(!state.roomId || !state.isSignedIn) return;
  if(state.selfUid !== state.hostUid) return;
  const { voteCount, totalCount } = getStartVoteCounts();
  if(totalCount < 2) return;
  if(voteCount >= totalCount){
    startMultiplayerGame();
  }
}
async function voteToStartGame(){
  if(!state.roomId){
    setError("Join a room first.");
    return;
  }
  if(!ensureConnectedForAction()) return;
  if(state.phase !== PHASE.LOBBY && state.phase !== PHASE.GAME_OVER){
    setError("Voting is only available in the lobby or after game over.");
    return;
  }
  if(!state.selfUid){
    setError("Sign in first.");
    return;
  }
  const { votes } = getStartVoteCounts();
  if(votes.includes(state.selfUid)){
    updateVoteStartUI();
    return;
  }
  state.startVotes = [...votes, state.selfUid];
  syncRoomState("vote-start");
  updateVoteStartUI();
  maybeAutoStartFromVotes();
}

function renderLobbyPlayers(){
  if(!els.lobbyPlayers) return;
  els.lobbyPlayers.innerHTML = "";
  if(state.mode !== MODE.MULTI){
    return;
  }
  const players = state.players || [];
  if(!players.length){
    const empty = document.createElement("div");
    empty.className = "small";
    empty.textContent = "Your lobby is empty. 2-6 players are needed to start. Create a room and share the room code to invite players.";
    els.lobbyPlayers.appendChild(empty);
    return;
  }
  players.forEach((p)=>{
    const row = document.createElement("div");
    row.className = "lobbyPlayer";
    row.addEventListener("click", (e)=>{
      e.stopPropagation();
      maybeOpenPlayerMenu(p, row);
    });
    const name = document.createElement("span");
    name.textContent = p.name || "Player";
    row.appendChild(name);
    if(state.hostUid && p.uid && p.uid === state.hostUid){
      const host = document.createElement("span");
      host.className = "hostBadge";
      host.textContent = "Host";
      row.appendChild(host);
    }
    els.lobbyPlayers.appendChild(row);
  });
}

function navigateToRoomFromNotification(roomId){
  const code = normalizeRoomCode(roomId || "");
  if(!code) return;
  const current = normalizeRoomCode(location.hash.replace("#", ""));
  if(current !== code){
    location.hash = code;
  }
  if(state.isSignedIn){
    if(state.roomId !== code){
      joinRoom(code);
    }
  }
}
function normalizeNickname(name){
  return (name || "").trim().replace(/\s+/g, " ").slice(0, MAX_NICKNAME_LENGTH);
}
function getRoomNickname(roomId){
  if(!roomId || !state.roomNicknames || typeof state.roomNicknames !== "object") return null;
  const nickname = state.roomNicknames[roomId];
  return (nickname && typeof nickname === "string") ? nickname : null;
}
function getNicknameDraft(){
  const saved = getRoomNickname(state.roomId);
  if(saved) return saved;
  if(state.selfIndex !== null && state.selfIndex !== undefined && state.selfIndex >= 0){
    return state.players[state.selfIndex]?.name || "";
  }
  return "";
}
function getSelfRoomName(roomId){
  return getRoomNickname(roomId) || state.selfName || "Player";
}
function setNicknameStatus(msg){
  if(!els.nicknameStatus) return;
  if(!msg){
    els.nicknameStatus.textContent = "";
    els.nicknameStatus.style.display = "none";
    return;
  }
  els.nicknameStatus.textContent = msg;
  els.nicknameStatus.style.display = "block";
}
function flashNicknameStatus(msg){
  setNicknameStatus(msg);
  setTimeout(()=> setNicknameStatus(""), 2000);
}
function updateNicknameUI(){
  if(!els.nicknameRow || !els.nicknameInput || !els.saveNicknameBtn) return;
  const inRoom = !!state.roomId;
  const canEdit = state.isSignedIn && inRoom;
  if(!canEdit){
    els.nicknameRow.style.display = "none";
    if(els.nicknameDivider) els.nicknameDivider.style.display = "none";
    setNicknameStatus("");
    return;
  }
  els.nicknameRow.style.display = "flex";
  if(els.nicknameDivider) els.nicknameDivider.style.display = "block";
  els.nicknameInput.disabled = false;
  els.saveNicknameBtn.disabled = false;
  const saved = getRoomNickname(state.roomId);
  if(saved){
    if(document.activeElement !== els.nicknameInput){
      els.nicknameInput.value = saved;
    }
    setNicknameStatus("");
    return;
  }
  if(!els.nicknameInput.value && state.selfIndex !== null && state.selfIndex !== undefined && state.selfIndex >= 0){
    const currentName = state.players[state.selfIndex]?.name;
    if(currentName) els.nicknameInput.value = currentName;
  }
  setNicknameStatus("");
}
function syncPlayerMenuNameInput(){
  if(!els.playerMenuNameInput) return;
  const draft = getNicknameDraft();
  if(draft && document.activeElement !== els.playerMenuNameInput){
    els.playerMenuNameInput.value = draft;
  }
}
function updateGameTitle(){
  if(!els.gameTitle) return;
  const inRoom = isMultiplayer() && !!state.roomId;
  const title = inRoom ? getRoomDisplayName(state.roomName) : "Game Lobby";
  let textNode = null;
  for(const node of els.gameTitle.childNodes){
    if(node.nodeType === Node.TEXT_NODE){
      textNode = node;
      break;
    }
  }
  if(textNode){
    textNode.textContent = title;
  } else {
    els.gameTitle.appendChild(document.createTextNode(title));
  }
}
function isIos(){
  const ua = navigator.userAgent || "";
  const isApple = /iPad|iPhone|iPod/i.test(ua);
  const isIpadOs = ua.includes("Mac") && "ontouchend" in document;
  return isApple || isIpadOs;
}
function isStandalone(){
  if(window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
  return window.navigator.standalone === true;
}
function supportsPush(){
  return ("Notification" in window) && ("serviceWorker" in navigator);
}
function isFirstPwaLaunch(){
  try{
    return !localStorage.getItem(PWA_FIRST_LAUNCH_KEY);
  } catch (err){
    return false;
  }
}
function markPwaLaunched(){
  try{
    localStorage.setItem(PWA_FIRST_LAUNCH_KEY, "1");
  } catch (err){}
}
function setPwaPromptStatus(msg){
  if(!els.pwaPromptStatus) return;
  if(!msg){
    els.pwaPromptStatus.textContent = "";
    els.pwaPromptStatus.style.display = "none";
    return;
  }
  els.pwaPromptStatus.textContent = msg;
  els.pwaPromptStatus.style.display = "block";
}
function setPwaPromptContent({ title, body, steps, buttonLabel }){
  if(els.pwaPromptTitle) els.pwaPromptTitle.textContent = title || "";
  if(els.pwaPromptBody) els.pwaPromptBody.textContent = body || "";
  if(els.pwaPromptSteps){
    if(Array.isArray(steps) && steps.length){
      els.pwaPromptSteps.innerHTML = steps.map((step, idx)=>(
        `<div class="pwaStep"><span class="pwaStepNum">${idx + 1}</span>${step}</div>`
      )).join("");
      els.pwaPromptSteps.style.display = "flex";
    } else {
      els.pwaPromptSteps.innerHTML = "";
      els.pwaPromptSteps.style.display = "none";
    }
  }
  if(els.pwaEnableBtn && buttonLabel) els.pwaEnableBtn.textContent = buttonLabel;
}
function showPwaInstallPrompt(){
  setPwaPromptContent({
    title: "Install DING Online for turn alerts",
    body: "Add this game to your Home Screen so iPhone can send you turn notifications and open faster.",
    steps: [
      "Tap the Share button in Safari.",
      "Select \"Add to Home Screen\".",
      "Open the new app icon to enable alerts.",
    ],
    buttonLabel: "Enable turn alerts",
  });
  setPwaPromptStatus("");
  showPwaPrompt();
}
function showPwaEnablePrompt(){
  setPwaPromptContent({
    title: "Enable turn alerts",
    body: "Allow notifications so you get pinged when it is your turn.",
    steps: [],
    buttonLabel: "Enable notifications",
  });
  setPwaPromptStatus("");
  showPwaPrompt();
}
function notifyPushSetupIssue(msg){
  if(!msg){
    setPwaPromptStatus("");
    return;
  }
  setPwaPromptStatus(msg);
  const promptOpen = !!(els.pwaPrompt && els.pwaPrompt.style.display === "flex");
  if(promptOpen) return;
  if(isMultiplayer() && els.roomStatus && els.roomStatus.offsetParent !== null){
    flashRoomStatus(msg);
    return;
  }
  setError(msg);
}
function setConnectionStatus(status, detail = ""){
  if(state.connectionStatusTimer){
    clearTimeout(state.connectionStatusTimer);
    state.connectionStatusTimer = null;
  }
  if(state.connectionStatus === status && state.connectionStatusDetail === detail) return;
  const prevStatus = state.connectionStatus;
  state.connectionStatus = status;
  state.connectionStatusDetail = detail;
  state.lastConnectionChangeAt = Date.now();
  renderConnectionOverlay();
  updateAuthUI();
  if(status === "connected" && prevStatus !== "connected"){
    if(isMultiplayer() && state.roomId){
      if(!state.roomSynced) refreshRoomFromServer().catch(()=>{});
      if(state.selfUid && !state.handSynced) refreshHandFromServer().catch(()=>{});
    }
  }
}
const CONNECTION_STATUS_DELAY_MS = 1200;
function scheduleConnectionStatus(status, detail = ""){
  if(state.connectionStatusTimer){
    clearTimeout(state.connectionStatusTimer);
  }
  state.connectionStatusTimer = setTimeout(()=>{
    state.connectionStatusTimer = null;
    setConnectionStatus(status, detail);
  }, CONNECTION_STATUS_DELAY_MS);
}
function renderConnectionOverlay(){
  if(!els.reconnectOverlay) return;
  const show = isMultiplayer() && state.isSignedIn && state.connectionStatus !== "connected" && !state.offlineFallbackEnabled;
  els.reconnectOverlay.style.display = show ? "flex" : "none";
  if(els.reconnectStatus){
    els.reconnectStatus.textContent = state.connectionStatusDetail || "Trying to restore database access.";
  }
}
function ensureReconnectLoop(){
  if(state.reconnectTimer){
    clearInterval(state.reconnectTimer);
    state.reconnectTimer = null;
  }
  state.reconnectTimer = setInterval(()=>{
    if(state.connectionStatus === "connected") return;
    if(!firebaseDb) return;
    enableNetwork(firebaseDb).catch(()=>{});
  }, 15000);
}
function startConnectivityMonitor(){
  if(!firebaseDb || !state.isSignedIn) return;
  if(state.unsubConnectivity){ state.unsubConnectivity(); state.unsubConnectivity = null; }
  scheduleConnectionStatus("reconnecting", "Connecting to the database.");
  state.unsubConnectivity = onSnapshot(appMetaRef(), { includeMetadataChanges: true }, (snap)=>{
    const fromCache = snap.metadata.fromCache;
    if(fromCache){
      scheduleConnectionStatus("reconnecting", "Reconnecting to the database.");
    } else {
      setConnectionStatus("connected", "");
    }
  }, (err)=>{
    console.error("Connectivity monitor error:", err);
    setConnectionStatus("reconnecting", "Reconnecting to the database.");
  });
  ensureReconnectLoop();
}
if(els.fullscreenPopup){
  els.fullscreenPopup.addEventListener("click", ()=>{
    if(!state.popupDismissible) return;
    hideFullscreenPopup();
  });
}
function showPwaPrompt(){
  if(!els.pwaPrompt) return;
  els.pwaPrompt.style.display = "flex";
  els.pwaPrompt.setAttribute("aria-hidden", "false");
}
function hidePwaPrompt(){
  if(!els.pwaPrompt) return;
  els.pwaPrompt.style.display = "none";
  els.pwaPrompt.setAttribute("aria-hidden", "true");
  setPwaPromptStatus("");
}
function setupServiceWorkerUpdates(reg){
  if(!reg || state.swUpdateListenerReady) return;
  state.swUpdateListenerReady = true;
  const reloadOnce = ()=>{
    if(state.swReloading) return;
    state.swReloading = true;
    location.reload();
  };
  if(navigator.serviceWorker){
    navigator.serviceWorker.addEventListener("controllerchange", reloadOnce);
  }
  if(reg.waiting){
    try{ reg.waiting.postMessage({ type: "SKIP_WAITING" }); } catch (err){}
  }
  reg.addEventListener("updatefound", ()=>{
    const newWorker = reg.installing;
    if(!newWorker) return;
    newWorker.addEventListener("statechange", ()=>{
      if(newWorker.state === "installed" && navigator.serviceWorker.controller){
        try{ newWorker.postMessage({ type: "SKIP_WAITING" }); } catch (err){}
      }
    });
  });
}
async function registerServiceWorker(){
  if(state.swRegistration){
    setupServiceWorkerUpdates(state.swRegistration);
    try{ await state.swRegistration.update(); } catch (err){}
    return state.swRegistration;
  }
  if(!("serviceWorker" in navigator)){
    notifyPushSetupIssue("Service workers are not supported here.");
    return null;
  }
  if(!window.isSecureContext){
    notifyPushSetupIssue("Service workers require HTTPS.");
    return null;
  }
  try{
    const existing = await navigator.serviceWorker.getRegistration();
    if(existing){
      state.swRegistration = existing;
      setupServiceWorkerUpdates(existing);
      try{ await existing.update(); } catch (err){}
      return existing;
    }
  } catch (err){}
  try{
    const reg = await navigator.serviceWorker.register("./sw.js");
    state.swRegistration = reg;
    setupServiceWorkerUpdates(reg);
    try{ await reg.update(); } catch (err){}
    return reg;
  } catch (err){
    console.error("Service worker registration failed:", err);
    const detail = (err && err.message) ? err.message : "Unknown error";
    notifyPushSetupIssue(`Service worker registration failed: ${detail}`);
    return null;
  }
}
async function savePushToken(token){
  if(!token || !state.selfUid || !firebaseDb) return;
  state.pushToken = token;
  try{
    await setDoc(userRef(state.selfUid), {
      pushTokens: arrayUnion(token),
      pushEnabled: true,
      pushUpdatedAt: serverTimestamp(),
    }, { merge: true });
    updateRoomMenuUI();
  } catch (err){
    console.error("Failed to save push token:", err);
    notifyPushSetupIssue("Failed to save notification settings.");
  }
}
async function enableTurnNotifications(fromUser){
  if(!state.isSignedIn || !state.selfUid){
    notifyPushSetupIssue("Sign in to enable notifications.");
    return false;
  }
  if(!supportsPush()){
    notifyPushSetupIssue("Notifications are not supported on this device.");
    return false;
  }
  if(!firebaseMessaging || !firebaseDb){
    notifyPushSetupIssue("Firebase messaging not configured.");
    return false;
  }
  if(!firebaseVapidKey){
    notifyPushSetupIssue("Missing VAPID key for push.");
    return false;
  }
  if(isIos() && !isStandalone()){
    notifyPushSetupIssue("App must be installed to enable notifications.");
    return false;
  }
  if(Notification.permission === "denied"){
    notifyPushSetupIssue("Notifications are blocked in settings.");
    return false;
  }
  if(Notification.permission === "default"){
    if(!fromUser) return false;
    try{
      const permission = await Notification.requestPermission();
      if(permission !== "granted"){
        notifyPushSetupIssue("Notifications not enabled.");
        return false;
      }
    } catch (err){
      console.error("Notification permission error:", err);
      notifyPushSetupIssue("Notifications not enabled.");
      return false;
    }
  }
  const reg = await registerServiceWorker();
  if(!reg){
    return false;
  }
  try{
    const token = await getToken(firebaseMessaging, {
      vapidKey: firebaseVapidKey,
      serviceWorkerRegistration: reg,
    });
    if(!token){
      notifyPushSetupIssue("No push token available yet.");
      return false;
    }
    await savePushToken(token);
    setPwaPromptStatus("Turn alerts enabled.");
    if(els.pwaPrompt && els.pwaPrompt.style.display === "flex"){
      hidePwaPrompt();
      state.pwaPromptDismissed = true;
      if(firebaseDb && state.selfUid){
        setDoc(userRef(state.selfUid), { pwaPromptDismissed: true }, { merge: true })
          .catch((err)=> console.error("Failed to save PWA prompt dismissal:", err));
      }
    }
    return true;
  } catch (err){
    console.error("Failed to get push token:", err);
    const detail = (err && err.message) ? ` (${err.message})` : "";
    if(isIos() && !isStandalone()){
      notifyPushSetupIssue(`App must be installed to enable notifications.${detail}`);
    } else {
      notifyPushSetupIssue(`Failed to enable notifications.${detail}`);
    }
    return false;
  }
}
function handleFirstMultiplayerMove(){
  if(!state.isSignedIn || !state.selfUid) return;
  if(state.hasMadeFirstMove) return;
  state.hasMadeFirstMove = true;
  if(firebaseDb){
    setDoc(userRef(state.selfUid), { hasMadeFirstMove: true }, { merge: true })
      .catch((err)=> console.error("Failed to save first move flag:", err));
  }
  if(isIos() && !isStandalone()){
    if(!state.pwaPromptDismissed) showPwaInstallPrompt();
    return;
  }
  enableTurnNotifications(true);
}
let messagingListenerReady = false;
function initMessagingListeners(){
  if(messagingListenerReady || !firebaseMessaging) return;
  if(!supportsPush()) return;
  messagingListenerReady = true;
  onMessage(firebaseMessaging, (payload)=>{
    if(Notification.permission !== "granted") return;
    if(document.visibilityState === "visible") return;
    const data = payload?.data || {};
    const title = data.title || payload?.notification?.title || "DING Online";
    const body = data.body || payload?.notification?.body || "It's your turn...";
    const turnKey = data.turnKey || "";
    if(turnKey && state.lastNotificationKey === turnKey) return;
    if(turnKey) state.lastNotificationKey = turnKey;
    try{
      const notice = new Notification(title, {
        body,
        tag: data.roomId || "ding-turn",
        data: { roomId: data.roomId || "", turnKey },
      });
      notice.onclick = ()=> {
        try{ notice.close(); } catch (err){}
        if(window.focus) window.focus();
        navigateToRoomFromNotification(data.roomId || "");
      };
      if(turnKey){
        ackTurnNotification(turnKey);
      }
    } catch (err){
      console.error("Foreground notification failed:", err);
    }
  });
}
function maybeRestorePushNotifications(){
  if(!state.isSignedIn) return;
  if(!supportsPush()) return;
  if(Notification.permission !== "granted") return;
  registerServiceWorker().then(()=> enableTurnNotifications(false)).catch(()=> enableTurnNotifications(false));
}
function maybePromptNotificationPermissionOnPwa(){
  if(!state.isSignedIn) return;
  if(!isStandalone()) return;
  if(!supportsPush()) return;
  if(!firebaseVapidKey || !firebaseMessaging || !firebaseDb) return;
  const firstLaunch = isFirstPwaLaunch();
  if(!firstLaunch && Notification.permission !== "default") return;
  if(firstLaunch) markPwaLaunched();
  if(Notification.permission === "default"){
    showPwaEnablePrompt();
    return;
  }
  enableTurnNotifications(true);
}
function setRoomNameStatus(msg){
  if(!els.roomNameStatus) return;
  if(!msg){
    els.roomNameStatus.textContent = "";
    els.roomNameStatus.style.display = "none";
    return;
  }
  els.roomNameStatus.textContent = msg;
  els.roomNameStatus.style.display = "block";
}
function flashRoomNameStatus(msg){
  setRoomNameStatus(msg);
  setTimeout(()=> setRoomNameStatus(""), 2000);
}
function updateRoomNameUI(){
  if(!els.roomNameRow || !els.roomNameInput || !els.saveRoomNameBtn) return;
  if(state.roomCreatedBySelf && state.phase !== PHASE.LOBBY){
    state.roomCreatedBySelf = false;
  }
  if(!state.isSignedIn){
    els.roomNameRow.style.display = "none";
    if(els.roomNameDivider) els.roomNameDivider.style.display = "none";
    setRoomNameStatus("");
    return;
  }
  const inRoom = !!state.roomId;
  const isHost = inRoom && state.selfUid && (state.hostUid ? state.selfUid === state.hostUid : state.roomCreatedBySelf);
  const canEdit = inRoom && isHost && state.roomCreatedBySelf && state.phase === PHASE.LOBBY;
  if(!canEdit){
    els.roomNameRow.style.display = "none";
    if(els.roomNameDivider) els.roomNameDivider.style.display = "none";
    setRoomNameStatus("");
    return;
  }
  els.roomNameRow.style.display = "flex";
  if(els.roomNameDivider) els.roomNameDivider.style.display = "block";
  els.roomNameInput.disabled = false;
  els.saveRoomNameBtn.disabled = false;
  const current = getRoomDisplayName(state.roomName);
  if(document.activeElement !== els.roomNameInput){
    els.roomNameInput.value = current;
  }
  setRoomNameStatus("");
}
function resetJoinRoomState({ clearInput = false } = {}){
  state.joinRoomActive = false;
  if(clearInput && els.roomCodeInput) els.roomCodeInput.value = "";
  updateRoomJoinUI();
}
function updateRoomJoinUI(){
  if(!els.roomCodeInput || !els.joinRoomBtn) return;
  const isMulti = isMultiplayer();
  const inRoom = !!state.roomId;
  if(inRoom && state.joinRoomActive){
    state.joinRoomActive = false;
  }
  const showInput = isMulti && state.isSignedIn && (state.joinRoomActive || (state.roomCreatedBySelf && inRoom));
  els.roomCodeInput.style.display = showInput ? "block" : "none";
  if(showInput && inRoom && state.roomId && document.activeElement !== els.roomCodeInput){
    els.roomCodeInput.value = state.roomId;
  }
  if(state.joinRoomActive){
    els.joinRoomBtn.textContent = "Confirm join";
    els.joinRoomBtn.classList.add("good");
  } else {
    els.joinRoomBtn.textContent = "Join Room";
    els.joinRoomBtn.classList.remove("good");
  }
  els.joinRoomBtn.disabled = !state.isSignedIn || inRoom;
}
function updateChatPlacement(){
  if(!els.chatBlock) return;
  const inLobby = isMultiplayer() && state.isSignedIn && state.roomId && state.phase === PHASE.LOBBY;
  if(inLobby && els.lobbyChatSlot){
    if(els.chatBlock.parentElement !== els.lobbyChatSlot){
      els.lobbyChatSlot.appendChild(els.chatBlock);
    }
    return;
  }
  if(els.tableArea && els.chatBlock.parentElement !== els.tableArea){
    els.tableArea.appendChild(els.chatBlock);
  }
}
function canManagePlayers(){
  return !!(isMultiplayer() && state.roomId && state.isSignedIn && state.selfUid && state.hostUid && state.selfUid === state.hostUid);
}
function canChangeOwnName(){
  return !!(isMultiplayer() && state.roomId && state.isSignedIn && state.selfUid);
}
function showPlayerMenuNameEditor(){
  if(!els.playerMenuNameRow || !els.playerMenuNameDivider) return;
  els.playerMenuNameRow.style.display = "flex";
  els.playerMenuNameDivider.style.display = "block";
  syncPlayerMenuNameInput();
  if(els.playerMenuNameInput){
    els.playerMenuNameInput.focus();
    els.playerMenuNameInput.select();
  }
}
function hidePlayerMenuNameEditor(){
  if(els.playerMenuNameRow) els.playerMenuNameRow.style.display = "none";
  if(els.playerMenuNameDivider) els.playerMenuNameDivider.style.display = "none";
}
function closePlayerMenu(){
  if(!els.playerMenu) return;
  els.playerMenu.classList.remove("open");
  els.playerMenu.style.left = "";
  els.playerMenu.style.top = "";
  hidePlayerMenuNameEditor();
  state.playerMenuTarget = null;
}
function openPlayerMenu(target, anchor){
  if(!els.playerMenu || !target || !anchor) return;
  state.playerMenuTarget = target;
  const isSelf = target.uid && target.uid === state.selfUid;
  const isTargetHost = target.uid && target.uid === state.hostUid;
  const canManage = canManagePlayers();
  const showManageActions = canManage && !isSelf;
  const showChangeName = isSelf && canChangeOwnName();
  if(els.playerMenuKickBtn){
    els.playerMenuKickBtn.disabled = isSelf || isTargetHost;
    els.playerMenuKickBtn.style.display = showManageActions ? "" : "none";
  }
  if(els.playerMenuMakeHostBtn){
    els.playerMenuMakeHostBtn.disabled = isSelf || isTargetHost;
    els.playerMenuMakeHostBtn.style.display = showManageActions ? "" : "none";
  }
  if(els.playerMenuChangeNameBtn){
    els.playerMenuChangeNameBtn.style.display = showChangeName ? "" : "none";
  }
  hidePlayerMenuNameEditor();
  if(showChangeName){
    syncPlayerMenuNameInput();
  }
  els.playerMenu.classList.add("open");
  const rect = anchor.getBoundingClientRect();
  const menuRect = els.playerMenu.getBoundingClientRect();
  let left = rect.left;
  let top = rect.bottom + 6;
  if(left + menuRect.width > window.innerWidth - 8){
    left = window.innerWidth - menuRect.width - 8;
  }
  if(top + menuRect.height > window.innerHeight - 8){
    top = rect.top - menuRect.height - 6;
  }
  left = Math.max(8, left);
  top = Math.max(8, top);
  els.playerMenu.style.left = `${left}px`;
  els.playerMenu.style.top = `${top}px`;
}
function maybeOpenPlayerMenu(target, anchor){
  if(!target || !target.uid) return;
  const isSelf = target.uid === state.selfUid;
  const canOpenSelf = isSelf && canChangeOwnName();
  if(!canManagePlayers() && !canOpenSelf) return;
  if(els.playerMenu && state.playerMenuTarget && state.playerMenuTarget.uid === target.uid && els.playerMenu.classList.contains("open")){
    closePlayerMenu();
    return;
  }
  openPlayerMenu({ uid: target.uid, name: target.name || "Player" }, anchor);
}
function handleKickedFromRoom(roomName){
  const name = getRoomDisplayName(roomName);
  const msg = `You have been kicked from ${name}.`;
  leaveRoom();
  location.hash = "";
  setError(msg);
  flashRoomStatus(msg);
}
async function kickPlayerFromRoom(target){
  if(!canManagePlayers()) return;
  if(!target || !target.uid || target.uid === state.selfUid || target.uid === state.hostUid) return;
  if(!ensureConnectedForAction()) return;
  closePlayerMenu();
  try{
    const snap = await getDoc(roomRef(state.roomId));
    if(!snap.exists()) return;
    const data = snap.data() || {};
    const players = Array.isArray(data.players) ? data.players : [];
    const leavingIdx = players.findIndex(p => p.uid === target.uid);
    if(leavingIdx < 0) return;
    const leavingName = players[leavingIdx]?.name || target.name || "Player";
    const updatedPlayers = players.filter((_, i)=> i !== leavingIdx);
    const payload = { players: updatedPlayers };
    if(data.hostUid && data.hostUid === target.uid){
      const nextHost = updatedPlayers.find(p => p.uid)?.uid || null;
      payload.hostUid = nextHost;
    }
    if(leavingIdx >= 0){
      const adjustIndex = (value)=>{
        if(typeof value !== "number") return value;
        if(value > leavingIdx) return value - 1;
        if(value === leavingIdx){
          return updatedPlayers.length ? Math.min(value, updatedPlayers.length - 1) : 0;
        }
        return value;
      };
      if(typeof data.dealerIndex === "number") payload.dealerIndex = adjustIndex(data.dealerIndex);
      if(typeof data.leaderIndex === "number") payload.leaderIndex = adjustIndex(data.leaderIndex);
      if(typeof data.currentTurnIndex === "number") payload.currentTurnIndex = adjustIndex(data.currentTurnIndex);
    }
    await updateDoc(roomRef(state.roomId), payload);
    try{ await deleteDoc(handRef(state.roomId, target.uid)); } catch (err){}
    await logRoomEventForRoom(state.roomId, {
      type: "chat",
      message: `${leavingName} has been kicked.`,
      playerName: "System",
      playerUid: state.selfUid || null,
    });
  } catch (err){
    console.error("Failed to kick player:", err);
    setError("Failed to kick player.");
  }
}
async function makeHostForPlayer(target){
  if(!canManagePlayers()) return;
  if(!target || !target.uid || target.uid === state.selfUid || target.uid === state.hostUid) return;
  if(!ensureConnectedForAction()) return;
  closePlayerMenu();
  try{
    const snap = await getDoc(roomRef(state.roomId));
    if(!snap.exists()) return;
    const data = snap.data() || {};
    const players = Array.isArray(data.players) ? data.players : [];
    const found = players.find(p => p.uid === target.uid);
    if(!found) return;
    const targetName = found.name || target.name || "Player";
    await updateDoc(roomRef(state.roomId), { hostUid: target.uid });
    await logRoomEventForRoom(state.roomId, {
      type: "chat",
      message: `${targetName} has been made host.`,
      playerName: "System",
      playerUid: state.selfUid || null,
    });
  } catch (err){
    console.error("Failed to make host:", err);
    setError("Failed to make host.");
  }
}
function buildPlayer(uid, name, seed=null, startingScoreOverride=null){
  const startingScore = typeof startingScoreOverride === "number"
    ? startingScoreOverride
    : state.settings.startingScore;
  return {
    uid,
    name: name || "Player",
    hand: [],
    tricksWonThisHand: 0,
    wonTricks: [],
    score: startingScore,
    dingCount: (seed && typeof seed.dingCount === "number") ? seed.dingCount : 0,
    totalWins: (seed && typeof seed.totalWins === "number") ? seed.totalWins : 0,
    hasSwapped: false,
    folded: false,
  };
}

function updateModeUI(){
  const isMulti = state.mode === MODE.MULTI;
  if(els.modeHotseatBtn) els.modeHotseatBtn.classList.toggle("active", !isMulti);
  if(els.modeMultiBtn) els.modeMultiBtn.classList.toggle("active", isMulti);
  if(els.mpCard) els.mpCard.style.display = isMulti ? "block" : "none";
  if(els.namesInput){
    els.namesInput.disabled = isMulti;
    els.namesInput.style.display = isMulti ? "none" : "block";
  }
  if(els.lobbyHotseatIntro) els.lobbyHotseatIntro.style.display = isMulti ? "none" : "block";
  if(els.modeHint){
    if(!hasFirebase()){
      els.modeHint.textContent = "Multiplayer config missing. Multiplayer disabled.";
    } else {
      els.modeHint.textContent = isMulti
        ? ""
        : "Hotseat runs on one device.";
    }
  }
  if(els.modeMultiBtn) els.modeMultiBtn.disabled = !hasFirebase();
  renderLobbyPlayers();
  renderRoomLog();
  renderRoomList();
  updateRoomNameUI();
  updateRoomJoinUI();
  updateChatPlacement();
  updateRoomMenuUI();
  updateRoomLobbyUI();
  updateGameTitle();
}

function appendConnectionStatus(container){
  if(!hasFirebase() || !container) return;
  const wrap = document.createElement("span");
  wrap.className = "connectionStatus";
  const indicator = document.createElement("span");
  if(state.connectionStatus === "connected"){
    indicator.className = "statusDot";
    wrap.appendChild(indicator);
    wrap.appendChild(document.createTextNode("Connected"));
  } else {
    indicator.className = "statusSpinner";
    wrap.appendChild(indicator);
    wrap.appendChild(document.createTextNode("Reconnecting"));
  }
  container.appendChild(wrap);
}

function setMode(mode){
  if(mode === state.mode){
    updateModeUI();
    return;
  }
  if(mode === MODE.MULTI && !hasFirebase()){
    setError("Firebase config missing.");
    updateModeUI();
    return;
  }
  state.mode = mode;
  if(mode === MODE.MULTI){
    state.offlineFallbackEnabled = false;
  }
  if(mode === MODE.HOTSEAT){
    leaveRoom();
    resetAll();
  }
  if(mode === MODE.MULTI){
    setLock(false, null);
    if(state.isSignedIn) maybeAutoJoinRoom();
  }
  updateModeUI();
  render();
}

function updateRoomStatus(){
  if(els.roomStatus){
    if(!state.roomId){
      els.roomStatus.textContent = "";
      if(els.shareRoomBtn) els.shareRoomBtn.disabled = true;
      updateNicknameUI();
      updateRoomNameUI();
      updateRoomJoinUI();
      updateChatPlacement();
      updateRoomMenuUI();
      updateRoomLobbyUI();
      updateGameTitle();
      return;
    }
    const role = (state.selfUid && state.hostUid && state.selfUid === state.hostUid) ? "host" : "guest";
    els.roomStatus.textContent = `Room ${state.roomId} (${role}).`;
  }
  if(els.roomCodeInput && state.roomId) els.roomCodeInput.value = state.roomId;
  if(els.shareRoomBtn) els.shareRoomBtn.disabled = !state.roomId;
  updateNicknameUI();
  updateRoomNameUI();
  updateRoomJoinUI();
  updateChatPlacement();
  updateRoomMenuUI();
  updateRoomLobbyUI();
  updateGameTitle();
}

function areNotificationsEnabled(){
  if(!supportsPush()) return false;
  if(typeof Notification === "undefined") return false;
  if(Notification.permission !== "granted") return false;
  return !!state.pushToken;
}

function updateRoomMenuUI(){
  if(!els.roomMenuWrap || !els.roomMenuBtn || !els.roomMenu) return;
  const isMulti = isMultiplayer();
  const inRoom = !!state.roomId;
  const isHost = !isMulti || (state.selfUid && state.hostUid && state.selfUid === state.hostUid);
  if(els.menuResetBtn) els.menuResetBtn.style.display = isHost ? "block" : "none";
  if(els.menuResetHandBtn) els.menuResetHandBtn.style.display = (isMulti && isHost) ? "block" : "none";
  if(els.menuBackLobbyBtn) els.menuBackLobbyBtn.style.display = isMulti ? "block" : "none";
  if(els.menuInviteRoomBtn) els.menuInviteRoomBtn.style.display = isMulti ? "block" : "none";
  if(els.menuLeaveRoomBtn) els.menuLeaveRoomBtn.style.display = isMulti ? "block" : "none";
  if(els.menuEnableNotificationsBtn) els.menuEnableNotificationsBtn.style.display = isMulti ? "block" : "none";
  if(els.menuDivider) els.menuDivider.style.display = isMulti ? "block" : "none";
  if(els.menuBackLobbyBtn) els.menuBackLobbyBtn.disabled = !inRoom;
  if(els.menuInviteRoomBtn) els.menuInviteRoomBtn.disabled = !inRoom;
  if(els.menuLeaveRoomBtn) els.menuLeaveRoomBtn.disabled = !inRoom;
  if(els.menuEnableNotificationsBtn) els.menuEnableNotificationsBtn.disabled = !state.isSignedIn || areNotificationsEnabled();
}

function updateRoomLobbyUI(){
  if(!els.roomLobbyCard || !els.roomLobbyTitle || !els.roomLobbySub) return;
  const isMulti = isMultiplayer();
  const inRoom = !!state.roomId;
  if(!isMulti || !state.isSignedIn || !inRoom){
    els.roomLobbyCard.style.display = "none";
    return;
  }
  const role = (state.selfUid && state.hostUid && state.selfUid === state.hostUid) ? "host" : "guest";
  els.roomLobbyTitle.textContent = getRoomDisplayName(state.roomName);
  els.roomLobbySub.textContent = `Room ${state.roomId} (${role})`;
  els.roomLobbyCard.style.display = "flex";
}

function closeRoomMenu(){
  if(!els.roomMenu || !els.roomMenuBtn) return;
  els.roomMenu.classList.remove("open");
  els.roomMenuBtn.setAttribute("aria-expanded", "false");
}

function toggleRoomMenu(){
  if(!els.roomMenu || !els.roomMenuBtn) return;
  const open = els.roomMenu.classList.contains("open");
  if(open){
    closeRoomMenu();
  } else {
    els.roomMenu.classList.add("open");
    els.roomMenuBtn.setAttribute("aria-expanded", "true");
  }
}

function clearRoomListSubscriptions(){
  if(Array.isArray(state.unsubRoomList)){
    state.unsubRoomList.forEach(unsub => {
      try{ if(typeof unsub === "function") unsub(); } catch (err){}
    });
  }
  state.unsubRoomList = [];
}

function setRoomIds(ids){
  const unique = Array.from(new Set((ids || []).map(normalizeRoomCode).filter(Boolean)));
  state.roomIds = unique;
  subscribeToRoomList();
}

function subscribeToRoomList(){
  clearRoomListSubscriptions();
  state.roomList = {};
  if(!state.isSignedIn || !firebaseDb || !state.roomIds.length){
    renderRoomList();
    return;
  }
  state.roomIds.forEach((roomId)=>{
    const ref = roomRef(roomId);
    const unsub = onSnapshot(ref, (snap)=>{
      if(!snap.exists()){
        delete state.roomList[roomId];
        renderRoomList();
        return;
      }
      const data = snap.data() || {};
      const players = Array.isArray(data.players) ? data.players : [];
      const playerCount = players.length;
      const selfIndex = players.findIndex(p => p.uid === state.selfUid);
      const phase = data.phase || "";
      const isYourTurn = selfIndex >= 0
        && data.currentTurnIndex === selfIndex
        && (phase === PHASE.SWAP || phase === PHASE.TRICK);
      state.roomList[roomId] = {
        roomId,
        roomName: getRoomDisplayName(data.roomName),
        playerCount,
        hostUid: data.hostUid || null,
        isHost: !!(data.hostUid && data.hostUid === state.selfUid),
        isYourTurn,
      };
      renderRoomList();
    }, (err)=>{
      console.error("Room list sync failed:", err);
    });
    state.unsubRoomList.push(unsub);
  });
  renderRoomList();
}

function renderRoomList(){
  if(!els.roomListSection || !els.roomList) return;
  if(!state.isSignedIn || state.mode !== MODE.MULTI){
    els.roomListSection.style.display = "none";
    return;
  }
  els.roomListSection.style.display = "flex";
  els.roomList.innerHTML = "";
  const ids = state.roomIds || [];
  if(!ids.length){
    if(els.roomListEmpty) els.roomListEmpty.style.display = "block";
    return;
  }
  if(els.roomListEmpty) els.roomListEmpty.style.display = "none";
  const entries = ids.map((roomId)=>{
    if(state.roomList[roomId]) return state.roomList[roomId];
    const fallbackName = (state.roomId === roomId && state.roomName) ? state.roomName : "Player's Lobby";
    return { roomId, roomName: fallbackName, playerCount: null, isHost:false, isYourTurn:false };
  });
  entries.sort((a,b)=> a.roomId.localeCompare(b.roomId));
  entries.forEach((room)=>{
    const card = document.createElement("div");
    card.className = "roomCard";

    const meta = document.createElement("div");
    meta.className = "roomMeta";
    const titleWrap = document.createElement("div");
    titleWrap.style.display = "flex";
    titleWrap.style.flexDirection = "column";
    titleWrap.style.minWidth = "0";
    const badgeRow = document.createElement("div");
    badgeRow.className = "roomBadgeRow";
    const title = document.createElement("div");
    title.className = "roomTitle";
    title.textContent = room.roomName || "Player's Lobby";
    const count = document.createElement("div");
    count.className = "roomCount";
    const countText = (typeof room.playerCount === "number") ? `${room.playerCount}/${MAX_PLAYERS}` : `-/${MAX_PLAYERS}`;
    count.textContent = `${room.roomId} · ${countText}`;
    if(room.isHost){
      const host = document.createElement("span");
      host.className = "hostBadge";
      host.textContent = "Host";
      badgeRow.appendChild(host);
    }
    if(room.isYourTurn){
      const turn = document.createElement("span");
      turn.className = "roomTurnBadge";
      turn.textContent = "Your turn";
      badgeRow.appendChild(turn);
    }
    if(badgeRow.childNodes.length) titleWrap.appendChild(badgeRow);
    titleWrap.appendChild(title);
    titleWrap.appendChild(count);
    meta.appendChild(titleWrap);

    const actions = document.createElement("div");
    actions.className = "roomActions";
    const buttons = document.createElement("div");
    buttons.className = "roomButtons";
    const enterBtn = document.createElement("button");
    enterBtn.className = "btn roomEnterBtn";
    const isCurrent = state.roomId === room.roomId;
    enterBtn.textContent = isCurrent ? "In room" : "Enter";
    enterBtn.disabled = isCurrent;
    enterBtn.addEventListener("click", ()=> joinRoom(room.roomId));
    const leaveBtn = document.createElement("button");
    leaveBtn.className = "btn danger";
    leaveBtn.textContent = "Leave";
    leaveBtn.addEventListener("click", ()=> leaveRoomPermanently(room.roomId));
    buttons.appendChild(enterBtn);
    buttons.appendChild(leaveBtn);
    actions.appendChild(buttons);

    card.appendChild(meta);
    card.appendChild(actions);
    els.roomList.appendChild(card);
  });
}

async function addRoomToProfile(roomId){
  const code = normalizeRoomCode(roomId || "");
  if(!code || !state.selfUid || !firebaseDb) return;
  const nextIds = Array.from(new Set([...(state.roomIds || []), code]));
  setRoomIds(nextIds);
  try{
    await setDoc(userRef(state.selfUid), { rooms: arrayUnion(code), lastRoomId: code }, { merge: true });
    state.lastRoomId = code;
  } catch (err){
    console.error("Failed to save room membership:", err);
  }
}

async function leaveRoomPermanently(roomId){
  const code = normalizeRoomCode(roomId || state.roomId || "");
  if(!code){
    setError("Join a room first.");
    return;
  }
  if(!state.isSignedIn || !state.selfUid){
    setError("Sign in first.");
    return;
  }
  if(!hasFirebase()){
    setError("Firebase config missing.");
    return;
  }
  if(!confirm("Permanently leave this room?")){
    return;
  }
  try{
    const snap = await getDoc(roomRef(code));
    if(snap.exists()){
      const data = snap.data() || {};
      const players = Array.isArray(data.players) ? data.players : [];
      const leavingIdx = players.findIndex(p => p.uid === state.selfUid);
      const leavingName = leavingIdx >= 0 ? (players[leavingIdx]?.name || "Player") : null;
      let updatedPlayers = players;
      if(leavingIdx >= 0){
        updatedPlayers = players.filter((_, i)=> i !== leavingIdx);
      }
      const payload = { players: updatedPlayers };
      if(data.hostUid && data.hostUid === state.selfUid){
        const nextHost = updatedPlayers.find(p => p.uid)?.uid || null;
        payload.hostUid = nextHost;
      }
      if(leavingIdx >= 0){
        const adjustIndex = (value)=>{
          if(typeof value !== "number") return value;
          if(value > leavingIdx) return value - 1;
          if(value === leavingIdx){
            return updatedPlayers.length ? Math.min(value, updatedPlayers.length - 1) : 0;
          }
          return value;
        };
        if(typeof data.dealerIndex === "number") payload.dealerIndex = adjustIndex(data.dealerIndex);
        if(typeof data.leaderIndex === "number") payload.leaderIndex = adjustIndex(data.leaderIndex);
        if(typeof data.currentTurnIndex === "number") payload.currentTurnIndex = adjustIndex(data.currentTurnIndex);
      }
      await updateDoc(roomRef(code), payload);
      try{ await deleteDoc(handRef(code, state.selfUid)); } catch (err){}
      if(leavingName){
        await logRoomEventForRoom(code, {
          type: "chat",
          message: `${leavingName} has permanently left the room.`,
          playerName: "System",
          playerUid: state.selfUid || null,
        });
      }
    }
    const userPayload = { rooms: arrayRemove(code) };
    if(state.lastRoomId === code){
      userPayload.lastRoomId = null;
      state.lastRoomId = null;
    }
    await setDoc(userRef(state.selfUid), userPayload, { merge: true });
  } catch (err){
    console.error("Failed to leave room:", err);
    setError("Failed to leave room.");
    return;
  }
  state.roomIds = (state.roomIds || []).filter(id => id !== code);
  delete state.roomList[code];
  subscribeToRoomList();
  renderRoomList();
  if(state.roomId === code){
    leaveRoom();
    location.hash = "";
  }
  updateRoomMenuUI();
}

function backToLobby(){
  if(!state.roomId) return;
  leaveRoom();
  location.hash = "";
  updateRoomMenuUI();
}

function leaveRoom(){
  if(state.unsubRoom){ state.unsubRoom(); state.unsubRoom = null; }
  if(state.unsubHand){ state.unsubHand(); state.unsubHand = null; }
  if(state.unsubLog){ state.unsubLog(); state.unsubLog = null; }
  state.roomId = null;
  state.roomName = null;
  state.hostUid = null;
  state.selfIndex = null;
  state.selfNickname = null;
  state.selfHand = [];
  state.players = [];
  state.logEntries = [];
  state.chatHasUnseen = false;
  state.lastChatCount = 0;
  clearChatVoiceDraft();
  cleanupChatVoiceRecording();
  updateChatUnreadIndicator();
  updateRoomStatus();
  closeRoomMenu();
  resetAll();
  renderRoomList();
}

function serializePlayersForRoom(){
  return state.players.map(p => ({
    uid: p.uid ?? null,
    name: p.name,
    tricksWonThisHand: p.tricksWonThisHand || 0,
    wonTricks: Array.isArray(p.wonTricks)
      ? p.wonTricks.map((trick)=>({
          plays: Array.isArray(trick) ? trick : (trick && Array.isArray(trick.plays) ? trick.plays : []),
        }))
      : [],
    score: typeof p.score === "number" ? p.score : state.settings.startingScore,
    dingCount: p.dingCount || 0,
    totalWins: p.totalWins || 0,
    hasSwapped: !!p.hasSwapped,
    folded: !!p.folded,
  }));
}

function serializeRoomState(){
  const players = serializePlayersForRoom();
  return {
    mode: MODE.MULTI,
    phase: state.phase,
    players,
    dealerIndex: state.dealerIndex,
    leaderIndex: state.leaderIndex,
    currentTurnIndex: state.currentTurnIndex,
    turnUid: state.players[state.currentTurnIndex]?.uid ?? null,
    trickNumber: state.trickNumber,
    handId: state.handId,
    gameId: state.gameId,
    deck: state.deck,
    trumpCard: state.trumpCard,
    trumpSuit: state.trumpSuit,
    currentTrick: state.currentTrick,
    lastTrickWinnerIndex: state.lastTrickWinnerIndex,
    lastCompletedTrick: state.lastCompletedTrick,
    winnerIndex: state.winnerIndex,
    handEndedByFolds: state.handEndedByFolds,
    foldWinIndex: state.foldWinIndex,
    settings: state.settings,
    discardPile: state.discardPile,
    playedCards: state.playedCards,
    swapCounts: state.swapCounts,
    startVotes: Array.isArray(state.startVotes) ? state.startVotes : [],
    updatedAt: serverTimestamp(),
  };
}

function applyRoomState(data){
  if(!data) return;
  const prevPhase = state.phase;
  const prevTurn = state.currentTurnIndex;
  const prevHandId = state.handId;
  const prevSwapCounts = state.swapCounts || {};
  let handIdChanged = false;
  let kicked = false;
  let kickedRoomName = "";
  state.isApplyingRemote = true;
  try{
    state.mode = MODE.MULTI;
    state.phase = data.phase ?? state.phase;
    if(state.roomCreatedBySelf && prevPhase === PHASE.LOBBY && state.phase !== PHASE.LOBBY){
      state.roomCreatedBySelf = false;
    }
    state.players = Array.isArray(data.players)
      ? data.players.map((p, idx)=>{
          const rawWonTricks = Array.isArray(p.wonTricks) ? p.wonTricks : [];
          const wonTricks = rawWonTricks.map((trick)=>{
            if(Array.isArray(trick)) return trick;
            if(trick && Array.isArray(trick.plays)) return trick.plays;
            return [];
          });
          return {
            id: p.id ?? `p${idx}`,
            uid: p.uid ?? null,
            name: p.name ?? "Player",
            hand: [],
            tricksWonThisHand: p.tricksWonThisHand || 0,
            wonTricks,
            score: typeof p.score === "number" ? p.score : state.settings.startingScore,
            dingCount: p.dingCount || 0,
            totalWins: p.totalWins || 0,
            hasSwapped: !!p.hasSwapped,
            folded: !!p.folded,
          };
        })
      : state.players;
    const eligibleUids = state.players.map(p => p.uid).filter(Boolean);
    const eligibleSet = new Set(eligibleUids);
    const rawVotes = Array.isArray(data.startVotes) ? data.startVotes : [];
    const filteredVotes = eligibleSet.size
      ? rawVotes.filter(uid => eligibleSet.has(uid))
      : rawVotes.filter(Boolean);
    state.startVotes = Array.from(new Set(filteredVotes));
    state.dealerIndex = data.dealerIndex ?? state.dealerIndex;
    state.leaderIndex = data.leaderIndex ?? state.leaderIndex;
    state.currentTurnIndex = data.currentTurnIndex ?? state.currentTurnIndex;
    state.trickNumber = data.trickNumber ?? state.trickNumber;
    state.handId = data.handId ?? state.handId;
    state.gameId = data.gameId ?? state.gameId;
    state.deck = Array.isArray(data.deck) ? data.deck : state.deck;
    state.trumpCard = data.trumpCard ?? null;
    state.trumpSuit = data.trumpSuit ?? null;
    state.currentTrick = data.currentTrick || { plays: [], leadSuit: null };
    state.lastTrickWinnerIndex = data.lastTrickWinnerIndex ?? null;
    state.lastCompletedTrick = data.lastCompletedTrick ?? null;
    state.winnerIndex = data.winnerIndex ?? null;
    state.handEndedByFolds = !!data.handEndedByFolds;
    state.foldWinIndex = data.foldWinIndex ?? null;
    if("roomName" in data) state.roomName = getRoomDisplayName(data.roomName);
    state.settings = { ...state.settings, ...(data.settings || {}) };
    state.discardPile = Array.isArray(data.discardPile) ? data.discardPile : [];
    state.playedCards = Array.isArray(data.playedCards) ? data.playedCards : [];
    handIdChanged = (data.handId !== undefined && data.handId !== prevHandId);
    if(handIdChanged){
      state.swapNoticeHistory.clear();
      state.swapCounts = {};
      state.lastDealtHandId = null;
      state.lastTrickWinnerIndex = null;
      state.lastCompletedTrick = null;
    }
    const nextSwapCounts = (data.swapCounts && typeof data.swapCounts === "object") ? data.swapCounts : {};
    state.swapCounts = { ...nextSwapCounts };
    state.hostUid = data.hostUid ?? state.hostUid;
    state.selfIndex = state.players.findIndex(p => p.uid === state.selfUid);
    if(state.selfUid && state.roomId && state.selfIndex < 0){
      kicked = true;
      kickedRoomName = getRoomDisplayName(data.roomName);
    }
    if(state.selfIndex < 0) state.selfHand = [];
    state.lockOn = false;
    state.pendingRevealForIndex = null;
    if(prevPhase !== state.phase || prevTurn !== state.currentTurnIndex){
      state.selectedCardIds.clear();
      state.selectedForSwap.clear();
    }
  } finally {
    state.isApplyingRemote = false;
  }
  if(state.phase === PHASE.SWAP || state.phase === PHASE.TRICK){
    const compareSwapCounts = handIdChanged ? {} : prevSwapCounts;
    for(let i = 0; i < state.players.length; i++){
      const player = state.players[i];
      const key = swapKeyForPlayer(player, i);
      const prevCount = compareSwapCounts[key];
      const nextCount = state.swapCounts[key];
      if(typeof nextCount !== "number") continue;
      if(prevCount === nextCount) continue;
      const noticeKey = `${state.handId}-${key}`;
      if(state.swapNoticeHistory.has(noticeKey)) continue;
      state.swapNoticeHistory.add(noticeKey);
      showSwapAnnouncement(player.name || "Player", nextCount);
      break;
    }
  }
  if(kicked){
    handleKickedFromRoom(kickedRoomName);
    return;
  }
  ackTurnNotificationIfNeeded();
  syncSettingsUI();
  updateModeUI();
  updateRoomStatus();
  updateVoteStartUI();
  maybeAutoStartFromVotes();
  renderLobbyPlayers();
  render();
  if(prevPhase !== state.phase && state.phase === PHASE.GAME_OVER){
    showGameOverNotice();
  }
}

function trimSelectionsToHand(){
  if(!Array.isArray(state.selfHand)) return;
  const ids = new Set(state.selfHand.map(c => c.id));
  for(const id of Array.from(state.selectedCardIds)){
    if(!ids.has(id)) state.selectedCardIds.delete(id);
  }
  for(const id of Array.from(state.selectedForSwap)){
    if(!ids.has(id)) state.selectedForSwap.delete(id);
  }
  for(const id of Array.from(state.incomingCardIds)){
    if(!ids.has(id)){
      state.incomingCardIds.delete(id);
      state.incomingAnimationPlayed.delete(id);
    }
  }
}

function swapKeyForPlayer(player, idx){
  if(player && player.uid) return player.uid;
  if(player && player.id) return player.id;
  return `p${idx}`;
}
function announceSwap(playerIndex, count){
  const player = state.players[playerIndex];
  if(!player) return;
  const key = swapKeyForPlayer(player, playerIndex);
  state.swapCounts[key] = count;
  const noticeKey = `${state.handId}-${key}`;
  if(state.swapNoticeHistory.has(noticeKey)) return;
  state.swapNoticeHistory.add(noticeKey);
  showSwapAnnouncement(player.name || "Player", count);
}
function dealerHasPlayedFirstCard(){
  if(state.phase !== PHASE.TRICK) return false;
  if(state.trickNumber > 1) return true;
  return state.currentTrick.plays.some(p => p.playerIndex === state.dealerIndex);
}

function setSelfHandFromServer(nextHand){
  state.selfHand = Array.isArray(nextHand) ? nextHand : [];
  trimSelectionsToHand();
  markDealFade();
}

async function refreshRoomFromServer(){
  if(!isMultiplayer() || !state.roomId || !firebaseDb) return false;
  if(state.roomResyncing) return false;
  state.roomResyncing = true;
  const roomId = state.roomId;
  try{
    const snap = await getDocFromServer(roomRef(roomId));
    if(state.roomId !== roomId) return false;
    if(!snap.exists()) return false;
    applyRoomState(snap.data());
    state.roomSynced = true;
    return true;
  } catch (err){
    console.error("Failed to refresh room state:", err);
    return false;
  } finally {
    state.roomResyncing = false;
  }
}

async function refreshHandFromServer(){
  if(!isMultiplayer() || !state.roomId || !state.selfUid || !firebaseDb) return false;
  if(state.handResyncing) return false;
  state.handResyncing = true;
  const roomId = state.roomId;
  const selfUid = state.selfUid;
  try{
    const snap = await getDocFromServer(handRef(roomId, selfUid));
    if(state.roomId !== roomId || state.selfUid !== selfUid) return false;
    if(!snap.exists()){
      setSelfHandFromServer([]);
      state.handSynced = true;
      render();
      return true;
    }
    const data = snap.data() || {};
    setSelfHandFromServer(Array.isArray(data.hand) ? data.hand : []);
    state.handSynced = true;
    render();
    return true;
  } catch (err){
    console.error("Failed to refresh hand:", err);
    return false;
  } finally {
    state.handResyncing = false;
  }
}

async function syncRoomState(reason){
  if(!isMultiplayer() || !state.roomId || !firebaseDb) return;
  if(state.isApplyingRemote) return;
  try{
    const payload = serializeRoomState();
    if(state.hostUid) payload.hostUid = state.hostUid;
    await setDoc(roomRef(state.roomId), payload, { merge: true });
    updateRoomStatus();
  } catch (err){
    console.error("Failed to sync room state:", reason, err);
    setError("Failed to sync room state.");
    setConnectionStatus("reconnecting", "Reconnecting to the database.");
    state.roomSynced = false;
  }
}

function subscribeToRoom(roomId){
  if(state.unsubRoom){ state.unsubRoom(); state.unsubRoom = null; }
  state.mode = MODE.MULTI;
  state.roomId = roomId;
  state.roomSynced = false;
  state.roomResyncing = false;
  updateRoomStatus();
  const ref = roomRef(roomId);
  state.unsubRoom = onSnapshot(ref, { includeMetadataChanges: true }, (snap)=>{
    const isStale = snap.metadata.fromCache && !snap.metadata.hasPendingWrites;
    state.roomSynced = !isStale;
    if(!snap.exists()){
      state.roomSynced = false;
      setError("Room not found.");
      return;
    }
    applyRoomState(snap.data());
    ensureRoomNicknameApplied().catch((err)=> console.error("Failed to apply nickname:", err));
  }, (err)=>{
    console.error("Room subscription error:", err);
    state.roomSynced = false;
    setError("Room sync failed.");
    setConnectionStatus("reconnecting", "Reconnecting to the database.");
  });
}

function subscribeToHand(){
  if(state.unsubHand){ state.unsubHand(); state.unsubHand = null; }
  state.handSynced = false;
  state.handResyncing = false;
  if(!state.roomId || !state.selfUid || !firebaseDb) return;
  const ref = handRef(state.roomId, state.selfUid);
  state.unsubHand = onSnapshot(ref, { includeMetadataChanges: true }, (snap)=>{
    const isStale = snap.metadata.fromCache && !snap.metadata.hasPendingWrites;
    state.handSynced = !isStale;
    if(!snap.exists()){
      setSelfHandFromServer([]);
      render();
      return;
    }
    const data = snap.data();
    setSelfHandFromServer(Array.isArray(data.hand) ? data.hand : []);
    render();
  }, (err)=>{
    console.error("Hand subscription error:", err);
    state.handSynced = false;
    setConnectionStatus("reconnecting", "Reconnecting to the database.");
  });
}

async function syncSelfHand(){
  if(!isMultiplayer() || !state.roomId || !state.selfUid || !firebaseDb) return;
  try{
    await setDoc(handRef(state.roomId, state.selfUid), {
      hand: state.selfHand,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (err){
    console.error("Failed to sync hand:", err);
    setError("Failed to sync hand.");
    state.handSynced = false;
    refreshHandFromServer().catch(()=>{});
  }
}

function subscribeToLog(){
  if(state.unsubLog){ state.unsubLog(); state.unsubLog = null; }
  if(!state.roomId || !firebaseDb) return;
  const q = query(logCollectionRef(state.roomId), orderBy("createdAt", "asc"));
  state.unsubLog = onSnapshot(q, (snap)=>{
    state.logEntries = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderRoomLog();
  }, (err)=>{
    console.error("Log subscription error:", err);
    setConnectionStatus("reconnecting", "Reconnecting to the database.");
  });
}

async function logRoomEventForRoom(roomId, entry){
  if(!roomId || !firebaseDb) return;
  const isChatEntry = entry && (entry.type === "chat" || entry.type === "chat_voice");
  const payload = (isChatEntry && !("likes" in entry))
    ? { ...entry, likes: [] }
    : entry;
  try{
    await addDoc(logCollectionRef(roomId), {
      ...payload,
      createdAt: serverTimestamp(),
    });
  } catch (err){
    console.error("Failed to write log entry:", err);
  }
}
async function logRoomEvent(entry){
  if(!isMultiplayer() || !state.roomId) return;
  await logRoomEventForRoom(state.roomId, entry);
}
async function sendChatMessage(){
  if(!isMultiplayer() || !state.roomId || !firebaseDb) return;
  if(!els.chatInput) return;
  const message = (els.chatInput.value || "").trim();
  if(!message) return;
  const name = state.players[state.selfIndex]?.name || state.selfName || "Player";
  await logRoomEvent({
    type: "chat",
    message: message.slice(0, 240),
    likes: [],
    playerName: name,
    playerUid: state.selfUid || null,
  });
  els.chatInput.value = "";
}

function getChatEntryTimestamp(entry){
  if(entry && entry.createdAt && typeof entry.createdAt.toMillis === "function"){
    return entry.createdAt.toMillis();
  }
  if(typeof entry.clientCreatedAt === "number"){
    return entry.clientCreatedAt;
  }
  return 0;
}

function getChatDistanceFromBottom(){
  if(!els.chatList) return 0;
  return els.chatList.scrollHeight - els.chatList.scrollTop - els.chatList.clientHeight;
}

function isChatNearBottom(){
  return getChatDistanceFromBottom() <= CHAT_SCROLL_FUZZ;
}

function updateChatUnreadIndicator(){
  if(!els.chatUnreadDot) return;
  els.chatUnreadDot.classList.toggle("visible", !!state.chatHasUnseen);
}

function selectVoiceMimeType(){
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  if(typeof MediaRecorder === "undefined") return "";
  const supported = candidates.find(type => MediaRecorder.isTypeSupported(type));
  return supported || "";
}

function updateChatVoiceUI(){
  if(els.chatMicBtn){
    els.chatMicBtn.classList.toggle("recording", !!state.chatVoiceRecording);
    els.chatMicBtn.disabled = !isMultiplayer() || !state.roomId;
  }
  if(!els.chatVoiceDraft) return;
  const hasDraft = !!state.chatVoiceDraft;
  const showPanel = state.chatVoicePanelActivated;
  els.chatVoiceDraft.hidden = !showPanel;
  if(els.chatVoiceAudio){
    els.chatVoiceAudio.hidden = !hasDraft;
  }
  if(els.chatVoiceSendBtn) els.chatVoiceSendBtn.disabled = !hasDraft;
  if(els.chatVoiceDeleteBtn) els.chatVoiceDeleteBtn.disabled = !hasDraft;
  if(els.chatVoiceStatus){
    els.chatVoiceStatus.classList.toggle("chatVoiceStatusError", !!state.chatVoiceNotice?.isError);
    if(state.chatVoiceNotice){
      els.chatVoiceStatus.textContent = state.chatVoiceNotice.message;
    } else if(state.chatVoiceRecording){
      els.chatVoiceStatus.textContent = "Recording... tap the mic to stop.";
    } else if(hasDraft){
      els.chatVoiceStatus.textContent = "Review your voice message.";
    } else {
      els.chatVoiceStatus.textContent = "Tap the mic to record.";
    }
  }
  if(els.chatVoiceTimer){
    if(state.chatVoiceRecording){
      const elapsed = Math.min(Date.now() - state.chatVoiceRecordingStartedAt, CHAT_VOICE_MAX_SECONDS * 1000);
      const seconds = Math.floor(elapsed / 1000);
      els.chatVoiceTimer.textContent = `0:${String(seconds).padStart(2, "0")} / 0:${CHAT_VOICE_MAX_SECONDS}`;
    } else if(hasDraft && typeof state.chatVoiceDraft?.duration === "number"){
      const seconds = Math.ceil(state.chatVoiceDraft.duration);
      els.chatVoiceTimer.textContent = `Length 0:${String(seconds).padStart(2, "0")}`;
    } else {
      els.chatVoiceTimer.textContent = "";
    }
  }
}

function setChatVoiceNotice(message, options = {}){
  if(!message){
    state.chatVoiceNotice = null;
    updateChatVoiceUI();
    return;
  }
  state.chatVoicePanelActivated = true;
  state.chatVoiceNotice = {
    message,
    isError: options.isError !== false,
  };
  updateChatVoiceUI();
}

function clearChatVoiceNotice(){
  state.chatVoiceNotice = null;
}

function clearChatVoiceDraft(){
  if(state.chatVoiceDraft?.url){
    URL.revokeObjectURL(state.chatVoiceDraft.url);
  }
  state.chatVoiceDraft = null;
  if(els.chatVoiceAudio){
    els.chatVoiceAudio.src = "";
  }
  clearChatVoiceNotice();
  if(!state.chatVoiceRecording){
    state.chatVoicePanelActivated = false;
  }
  updateChatVoiceUI();
}

function cleanupChatVoiceRecording(){
  if(state.chatVoiceTimeout){ clearTimeout(state.chatVoiceTimeout); }
  if(state.chatVoiceTimer){ clearInterval(state.chatVoiceTimer); }
  state.chatVoiceTimeout = null;
  state.chatVoiceTimer = null;
  state.chatVoiceRecording = false;
  state.chatVoiceRecordingStartedAt = 0;
  if(state.chatVoiceStream){
    state.chatVoiceStream.getTracks().forEach(track => track.stop());
  }
  state.chatVoiceStream = null;
  state.chatVoiceRecorder = null;
  state.chatVoiceChunks = [];
}

async function startChatVoiceRecording(){
  if(state.chatVoiceRecording) return;
  if(!isMultiplayer() || !state.roomId) return;
  state.chatVoicePanelActivated = true;
  if(!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function" || typeof MediaRecorder === "undefined"){
    setChatVoiceNotice("Voice messages are not supported in this browser.");
    return;
  }
  try{
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    clearChatVoiceNotice();
    clearChatVoiceDraft();
    const mimeType = selectVoiceMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    state.chatVoiceStream = stream;
    state.chatVoiceRecorder = recorder;
    state.chatVoiceRecording = true;
    state.chatVoiceRecordingStartedAt = Date.now();
    state.chatVoiceChunks = [];
    recorder.addEventListener("dataavailable", (event)=>{
      if(event.data && event.data.size){
        state.chatVoiceChunks.push(event.data);
      }
    });
    recorder.addEventListener("error", (event)=>{
      console.error("Voice recording error:", event.error || event);
      setChatVoiceNotice("Voice recording failed.");
      cleanupChatVoiceRecording();
      updateChatVoiceUI();
    });
    recorder.addEventListener("stop", ()=>{
      const chunks = state.chatVoiceChunks || [];
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
      cleanupChatVoiceRecording();
      if(!blob.size){
        state.chatVoicePanelActivated = false;
        updateChatVoiceUI();
        return;
      }
      if(blob.size > CHAT_VOICE_MAX_BYTES){
        setChatVoiceNotice("Voice message is too large. Try a shorter recording.");
        updateChatVoiceUI();
        return;
      }
      const url = URL.createObjectURL(blob);
      const draft = { blob, url, mimeType: blob.type || recorder.mimeType || mimeType };
      state.chatVoiceDraft = draft;
      if(els.chatVoiceAudio){
        els.chatVoiceAudio.src = url;
        els.chatVoiceAudio.onloadedmetadata = ()=>{
          draft.duration = Number.isFinite(els.chatVoiceAudio.duration) ? els.chatVoiceAudio.duration : null;
          updateChatVoiceUI();
        };
        els.chatVoiceAudio.onerror = ()=>{
          setChatVoiceNotice("Unable to play back this recording.");
          clearChatVoiceDraft();
        };
      }
      updateChatVoiceUI();
    });
    recorder.start();
    state.chatVoiceTimer = setInterval(()=> updateChatVoiceUI(), 200);
    state.chatVoiceTimeout = setTimeout(()=> stopChatVoiceRecording(), CHAT_VOICE_MAX_SECONDS * 1000);
    updateChatVoiceUI();
  } catch (err){
    console.error("Failed to start voice recording:", err);
    setChatVoiceNotice("Microphone access was denied.");
    cleanupChatVoiceRecording();
    updateChatVoiceUI();
  }
}

function stopChatVoiceRecording(){
  if(!state.chatVoiceRecording || !state.chatVoiceRecorder) return;
  if(state.chatVoiceRecorder.state !== "inactive"){
    state.chatVoiceRecorder.stop();
  }
}

async function blobToDataUrl(blob){
  return await new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = ()=> resolve(String(reader.result || ""));
    reader.onerror = ()=> reject(reader.error || new Error("Failed to read audio data."));
    reader.readAsDataURL(blob);
  });
}

async function sendChatVoiceMessage(){
  if(!state.chatVoiceDraft?.blob) return;
  if(!isMultiplayer() || !state.roomId || !firebaseDb) return;
  if(state.chatVoiceDraft.blob.size > CHAT_VOICE_MAX_BYTES){
    setChatVoiceNotice("Voice message is too large. Try a shorter recording.");
    return;
  }
  const name = state.players[state.selfIndex]?.name || state.selfName || "Player";
  try{
    const dataUrl = await blobToDataUrl(state.chatVoiceDraft.blob);
    await logRoomEvent({
      type: "chat_voice",
      voiceData: dataUrl,
      voiceMime: state.chatVoiceDraft.mimeType || "audio/webm",
      voiceDuration: state.chatVoiceDraft.duration || null,
      likes: [],
      playerName: name,
      playerUid: state.selfUid || null,
      clientCreatedAt: Date.now(),
    });
    clearChatVoiceDraft();
  } catch (err){
    console.error("Failed to send voice message:", err);
    setChatVoiceNotice("Failed to send voice message.");
  }
}

async function toggleChatLike(entry){
  if(!entry || !entry.id) return;
  if(!ensureConnectedForAction()) return;
  if(!state.selfUid){
    setError("Sign in first.");
    return;
  }
  const likeIndex = buildChatLikeIndex(state.logEntries || []);
  const likeMap = likeIndex.get(entry.id);
  const selfInfo = likeMap ? likeMap.get(state.selfUid) : null;
  const hasLiked = selfInfo ? selfInfo.liked === true : false;
  const nextLiked = !hasLiked;
  const name = state.players[state.selfIndex]?.name || state.selfName || "Player";
  try{
    await logRoomEvent({
      type: "chat_like",
      targetId: entry.id,
      liked: nextLiked,
      playerName: name,
      playerUid: state.selfUid || null,
      clientCreatedAt: Date.now(),
    });
  } catch (err){
    console.error("Failed to update chat like:", err);
  }
}

function buildChatLikeIndex(entries){
  const getEntryTimestamp = (entry)=>{
    if(entry && entry.createdAt && typeof entry.createdAt.toMillis === "function"){
      return entry.createdAt.toMillis();
    }
    if(typeof entry.clientCreatedAt === "number"){
      return entry.clientCreatedAt;
    }
    return 0;
  };
  const index = new Map();
  for(const entry of entries){
    if(entry.type !== "chat" && entry.type !== "chat_voice") continue;
    if(!entry.id) continue;
    if(!Array.isArray(entry.likes)) continue;
    let map = index.get(entry.id);
    if(!map){
      map = new Map();
      index.set(entry.id, map);
    }
    for(const uid of entry.likes){
      if(uid && !map.has(uid)) map.set(uid, { liked: true, ts: 0 });
    }
  }
  for(const entry of entries){
    if(entry.type !== "chat_like") continue;
    if(!entry.targetId || !entry.playerUid) continue;
    const ts = getEntryTimestamp(entry);
    let map = index.get(entry.targetId);
    if(!map){
      map = new Map();
      index.set(entry.targetId, map);
    }
    const prev = map.get(entry.playerUid);
    if(!prev || ts >= prev.ts){
      map.set(entry.playerUid, { liked: entry.liked !== false, ts });
    }
  }
  return index;
}

function renderRoomLog(){
  if(!els.logList) return;
  const chatWasNearBottom = els.chatList ? isChatNearBottom() : true;
  const chatDistanceFromBottom = els.chatList ? getChatDistanceFromBottom() : 0;
  const previousChatCount = state.lastChatCount;
  els.logList.innerHTML = "";
  if(els.chatList) els.chatList.innerHTML = "";
  let hint = "Multiplayer only";
  if(state.mode !== MODE.MULTI){
    if(els.chatBlock) els.chatBlock.style.display = "none";
    const empty = document.createElement("div");
    empty.className = "small";
    empty.textContent = "Room log is available in multiplayer.";
    els.logList.appendChild(empty);
  } else if(!state.roomId){
    if(els.chatBlock) els.chatBlock.style.display = "none";
    const empty = document.createElement("div");
    empty.className = "small";
    empty.textContent = "Join a room to see the log.";
    els.logList.appendChild(empty);
    hint = "No room";
  } else if(!state.logEntries.length){
    if(els.chatBlock) els.chatBlock.style.display = "flex";
    const empty = document.createElement("div");
    empty.className = "small";
    empty.textContent = "No hands logged yet.";
    els.logList.appendChild(empty);
    hint = "No hands yet";
  } else {
    if(els.chatBlock) els.chatBlock.style.display = "flex";
    const games = new Map();
    const gameWinners = new Map();
    state.logEntries.forEach((entry)=>{
      if(entry.type === "chat" || entry.type === "chat_voice") return;
      const handId = Number(entry.handId || 0);
      if(!handId) return;
      const gameId = Number(entry.gameId || 1);
      if(!games.has(gameId)) games.set(gameId, new Map());
      if(!gameWinners.has(gameId) && entry.type === "hand_end" && Array.isArray(entry.scores)){
        const winner = entry.scores.find(s => typeof s.score === "number" && s.score <= 0);
        if(winner && winner.name) gameWinners.set(gameId, winner.name);
      }
      const gameHands = games.get(gameId);
      if(!gameHands.has(handId)) gameHands.set(handId, { plays: [], end: null, events: [] });
      const hand = gameHands.get(handId);
      if(entry.type === "play") hand.plays.push(entry);
      if(entry.type === "hand_end") hand.end = entry;
      if(entry.type === "fold") hand.events.push(entry);
    });
    const currentHandId = Number(state.handId || 0);
    const hasActiveHand = currentHandId && (state.phase === PHASE.SWAP || state.phase === PHASE.TRICK);
    if(hasActiveHand){
      const currentGameId = Number(state.gameId || 0);
      const normalizedGameId = Number.isFinite(currentGameId) ? currentGameId : 0;
      let currentGameHands = games.get(normalizedGameId);
      if(!currentGameHands){
        currentGameHands = new Map();
        games.set(normalizedGameId, currentGameHands);
      }
      if(!currentGameHands.has(currentHandId)){
        currentGameHands.set(currentHandId, { plays: [], end: null, events: [] });
      }
    }
    const gameIds = Array.from(games.keys()).sort((a,b)=>a-b);
    const totalHands = gameIds.reduce((sum, gameId)=> sum + games.get(gameId).size, 0);
    hint = totalHands ? `${totalHands} hand${totalHands === 1 ? "" : "s"}` : "No hands yet";
    if(gameIds.length > 1){
      hint = `${hint} · ${gameIds.length} game${gameIds.length === 1 ? "" : "s"}`;
    }
    if(!totalHands){
      const empty = document.createElement("div");
      empty.className = "small";
      empty.textContent = "No hands logged yet.";
      els.logList.appendChild(empty);
    }
    const latestGameId = gameIds.length ? gameIds[gameIds.length - 1] : null;
    gameIds.forEach((gameId)=>{
      const gameHands = games.get(gameId);
      const handIds = Array.from(gameHands.keys()).sort((a,b)=>a-b);
      const gameDetails = document.createElement("details");
      gameDetails.className = "gameLog";
      gameDetails.open = gameId === latestGameId;
      const gameSummary = document.createElement("summary");
      const gameTitle = document.createElement("div");
      gameTitle.className = "gameTitle";
      const winnerName = gameWinners.get(gameId);
      gameTitle.textContent = winnerName ? `Game ${gameId} - ${winnerName} won` : `Game ${gameId}`;
      const gameMeta = document.createElement("div");
      gameMeta.className = "gameMeta";
      gameMeta.textContent = `${handIds.length} hand${handIds.length === 1 ? "" : "s"}`;
      gameSummary.appendChild(gameTitle);
      gameSummary.appendChild(gameMeta);
      gameDetails.appendChild(gameSummary);

      const gameWrap = document.createElement("div");
      gameWrap.className = "gameHands";
      handIds.forEach((handId)=>{
        const hand = gameHands.get(handId);
        const details = document.createElement("details");
        details.className = "handLog";
        const summary = document.createElement("summary");
        const title = document.createElement("div");
        title.className = "handTitle";
        const scores = (hand.end && Array.isArray(hand.end.scores)) ? hand.end.scores : [];
        if(scores.length){
          const columns = `repeat(${scores.length}, minmax(0, 1fr))`;
          const table = document.createElement("div");
          table.className = "scoreMiniTable";
          const initialRow = document.createElement("div");
          initialRow.className = "scoreMiniRow initials";
          initialRow.style.gridTemplateColumns = columns;
          const scoreRow = document.createElement("div");
          scoreRow.className = "scoreMiniRow scores";
          scoreRow.style.gridTemplateColumns = columns;
          scores.forEach((s)=>{
            const initial = document.createElement("div");
            initial.className = "scoreMiniCell";
            initial.textContent = getNameInitial(s.name);
            initialRow.appendChild(initial);
            const scoreCell = document.createElement("div");
            scoreCell.className = "scoreMiniCell";
            scoreCell.textContent = typeof s.score === "number" ? String(s.score) : "-";
            scoreRow.appendChild(scoreCell);
          });
          table.appendChild(initialRow);
          table.appendChild(scoreRow);
          title.appendChild(table);
        } else {
          title.textContent = `Hand ${handId} (in progress)`;
        }
        const meta = document.createElement("div");
        meta.className = "handScores";
        meta.textContent = scores.length ? `Hand ${handId}` : "Scores pending";
        summary.appendChild(title);
        summary.appendChild(meta);
        details.appendChild(summary);

        const playsByTrick = new Map();
        hand.plays.forEach((play)=>{
          const trick = Number(play.trickNumber || 0);
          if(!playsByTrick.has(trick)) playsByTrick.set(trick, []);
          playsByTrick.get(trick).push(play);
        });
        const trickIds = Array.from(playsByTrick.keys()).sort((a,b)=>a-b);
        const playsWrap = document.createElement("div");
        playsWrap.className = "handPlays";
        trickIds.forEach((trickId)=>{
          const trickBlock = document.createElement("div");
          trickBlock.className = "trickLog";
          const trickTitle = document.createElement("div");
          trickTitle.className = "small";
          trickTitle.textContent = `Trick ${trickId}`;
          trickBlock.appendChild(trickTitle);
          playsByTrick.get(trickId).forEach((play)=>{
            const line = document.createElement("div");
            line.className = "playLine";
            const name = play.playerName || "Player";
            const card = play.card ? cardLabel(play.card) : "—";
            line.innerHTML = `<span>${name}</span><span>${card}</span>`;
            trickBlock.appendChild(line);
          });
          playsWrap.appendChild(trickBlock);
        });
        if(hand.events && hand.events.length){
          const eventsBlock = document.createElement("div");
          eventsBlock.className = "trickLog";
          const header = document.createElement("div");
          header.className = "small";
          header.textContent = "Events";
          eventsBlock.appendChild(header);
          hand.events.forEach((event)=>{
            const line = document.createElement("div");
            line.className = "playLine";
            const name = event.playerName || "Player";
            line.innerHTML = `<span>${name}</span><span>Folded</span>`;
            eventsBlock.appendChild(line);
          });
          playsWrap.appendChild(eventsBlock);
        }
        if(hand.end && hand.end.reason === "all_folded"){
          const endLine = document.createElement("div");
          endLine.className = "small";
          const winnerName = hand.end.winnerName || "Player";
          endLine.textContent = `${winnerName} won the hand because everyone folded.`;
          playsWrap.appendChild(endLine);
        }
        if(!playsWrap.childNodes.length){
          const empty = document.createElement("div");
          empty.className = "small";
          empty.textContent = "No plays recorded.";
          playsWrap.appendChild(empty);
        }
        details.appendChild(playsWrap);
        gameWrap.appendChild(details);
      });
      if(!handIds.length){
        const empty = document.createElement("div");
        empty.className = "small";
        empty.textContent = "No hands logged yet.";
        gameWrap.appendChild(empty);
      }
      gameDetails.appendChild(gameWrap);
      els.logList.appendChild(gameDetails);
    });
  }
  if(els.chatBlock && els.chatList){
    const likeIndex = buildChatLikeIndex(state.logEntries || []);
    const now = Date.now();
    const chatEntries = state.logEntries.filter(entry=>{
      if(entry.type === "chat") return true;
      if(entry.type === "chat_voice"){
        return !!entry.voiceData;
      }
      return false;
    });
    if(els.chatHint){
      els.chatHint.textContent = chatEntries.length ? `${chatEntries.length} message${chatEntries.length === 1 ? "" : "s"}` : "No messages yet";
    }
    chatEntries.forEach((entry)=>{
      const item = document.createElement("div");
      item.className = "chatMessage";
      const name = entry.playerName || "Player";
      const meta = document.createElement("div");
      meta.className = "chatMeta";
      meta.textContent = name;
      const row = document.createElement("div");
      row.className = "chatRow";
      const text = document.createElement("div");
      text.className = "chatText";
      if(name === "System"){
        text.classList.add("chatTextSystem");
      }
      const isVoice = entry.type === "chat_voice";
      if(isVoice){
        const voiceWrap = document.createElement("div");
        voiceWrap.className = "chatVoiceClip";
        const audio = document.createElement("audio");
        audio.controls = true;
        audio.preload = "metadata";
        if(entry.voiceData){
          audio.src = entry.voiceData;
        }
        voiceWrap.appendChild(audio);
        if(typeof entry.voiceDuration === "number"){
          const badge = document.createElement("span");
          badge.className = "chatVoiceBadge";
          badge.textContent = `0:${String(Math.ceil(entry.voiceDuration)).padStart(2, "0")}`;
          voiceWrap.appendChild(badge);
        }
        const blurb = document.createElement("em");
        blurb.textContent = "Voice message.";
        text.appendChild(blurb);
        row.appendChild(text);
        row.appendChild(voiceWrap);
      } else {
        text.textContent = entry.message || "";
        row.appendChild(text);
      }
      const heart = document.createElement("div");
      heart.className = "chatHeart";
      const likeMap = likeIndex.get(entry.id);
      let likeCount = 0;
      let likedBySelf = false;
      if(likeMap){
        for(const [uid, info] of likeMap.entries()){
          if(!info.liked) continue;
          likeCount += 1;
          if(state.selfUid && uid === state.selfUid) likedBySelf = true;
        }
      }
      heart.classList.toggle("hidden", likeCount === 0);
      heart.classList.toggle("liked", likedBySelf);
      heart.innerHTML = `&#9829; ${likeCount}`;
      row.appendChild(heart);
      item.appendChild(meta);
      item.appendChild(row);
      item.addEventListener("dblclick", (e)=>{
        e.preventDefault();
        toggleChatLike(entry);
      });
      let lastTap = 0;
      item.addEventListener("touchend", (e)=>{
        const now = Date.now();
        if(now - lastTap < 350){
          lastTap = 0;
          e.preventDefault();
          toggleChatLike(entry);
          return;
        }
        lastTap = now;
      });
      els.chatList.appendChild(item);
    });
    const canChat = state.mode === MODE.MULTI && state.roomId;
    if(els.chatInput) els.chatInput.disabled = !canChat;
    if(els.chatSendBtn) els.chatSendBtn.disabled = !canChat;
    if(els.chatList){
      if(chatWasNearBottom){
        els.chatList.scrollTop = els.chatList.scrollHeight;
        state.chatHasUnseen = false;
      } else {
        const scrollTop = Math.max(0, els.chatList.scrollHeight - els.chatList.clientHeight - chatDistanceFromBottom);
        els.chatList.scrollTop = scrollTop;
        if(chatEntries.length > previousChatCount){
          state.chatHasUnseen = true;
        }
      }
    }
    state.lastChatCount = chatEntries.length;
    updateChatUnreadIndicator();
  }
  if(els.logHint) els.logHint.textContent = hint;
  updateChatVoiceUI();
  requestAnimationFrame(()=> scrollLogToBottom());
}

function scrollLogToBottom(){
  if(!els.logList) return;
  els.logList.scrollTop = els.logList.scrollHeight;
}

async function loadUserProfile(){
  state.roomNicknames = {};
  state.lastRoomId = null;
  state.roomIds = [];
  state.hasMadeFirstMove = false;
  state.pwaPromptDismissed = false;
  state.pushToken = null;
  state.profileLoaded = true;
  if(!state.selfUid || !firebaseDb) return;
  try{
    const snap = await getDoc(userRef(state.selfUid));
    if(snap.exists()){
      const data = snap.data() || {};
      state.lastRoomId = data.lastRoomId || null;
      state.hasMadeFirstMove = !!data.hasMadeFirstMove;
      state.pwaPromptDismissed = !!data.pwaPromptDismissed;
      if(Array.isArray(data.pushTokens) && data.pushTokens.length){
        state.pushToken = data.pushTokens[0];
      }
      if(data.roomNicknames && typeof data.roomNicknames === "object"){
        state.roomNicknames = { ...data.roomNicknames };
      }
      if(Array.isArray(data.rooms)){
        setRoomIds(data.rooms);
      } else if(state.lastRoomId){
        setRoomIds([state.lastRoomId]);
      } else {
        setRoomIds([]);
      }
    }
  } catch (err){
    console.error("Failed to load user profile:", err);
  }
  if(!state.roomIds.length) setRoomIds([]);
  updateRoomMenuUI();
  updateNicknameUI();
  ensureRoomNicknameApplied().catch((err)=> console.error("Failed to apply nickname:", err));
}

async function ensureRoomNicknameApplied(){
  if(!state.roomId || !state.isSignedIn) return;
  const nickname = getRoomNickname(state.roomId);
  if(!nickname) return;
  if(state.selfIndex === null || state.selfIndex === undefined || state.selfIndex < 0) return;
  if(state.players[state.selfIndex]?.name === nickname){
    state.selfNickname = nickname;
    return;
  }
  state.players[state.selfIndex].name = nickname;
  state.selfNickname = nickname;
  renderLobbyPlayers();
  render();
  if(!firebaseDb) return;
  try{
    await updateDoc(roomRef(state.roomId), { players: serializePlayersForRoom() });
  } catch (err){
    console.error("Failed to update nickname in room:", err);
  }
}

async function persistNickname(rawValue){
  if(!state.isSignedIn || !state.roomId){
    return { nickname: null, error: "unavailable" };
  }
  if(!state.profileLoaded){
    await loadUserProfile();
  }
  const nickname = normalizeNickname(rawValue);
  if(!nickname){
    return { nickname: null, error: "empty" };
  }
  state.roomNicknames = { ...(state.roomNicknames || {}), [state.roomId]: nickname };
  if(firebaseDb && state.selfUid){
    try{
      await setDoc(userRef(state.selfUid), { roomNicknames: state.roomNicknames }, { merge: true });
    } catch (err){
      console.error("Failed to save nickname:", err);
      return { nickname: null, error: "save-failed" };
    }
  }
  await ensureRoomNicknameApplied();
  return { nickname };
}

async function saveNickname(){
  if(!els.nicknameInput) return;
  if(!state.isSignedIn || !state.roomId){
    setNicknameStatus("");
    return;
  }
  const result = await persistNickname(els.nicknameInput.value);
  if(!result.nickname){
    if(result.error === "save-failed"){
      setNicknameStatus("Nickname save failed.");
    } else {
      setNicknameStatus("");
    }
    return;
  }
  if(els.nicknameInput) els.nicknameInput.value = result.nickname;
  if(els.playerMenuNameInput) els.playerMenuNameInput.value = result.nickname;
  flashNicknameStatus("Nickname saved.");
}

async function savePlayerMenuName(){
  if(!els.playerMenuNameInput) return;
  const result = await persistNickname(els.playerMenuNameInput.value);
  if(!result.nickname){
    if(result.error === "save-failed"){
      flashNicknameStatus("Nickname save failed.");
    } else {
      setNicknameStatus("");
    }
    return;
  }
  els.playerMenuNameInput.value = result.nickname;
  if(els.nicknameInput) els.nicknameInput.value = result.nickname;
  flashNicknameStatus("Nickname saved.");
  closePlayerMenu();
}

async function saveRoomName(){
  if(!els.roomNameInput) return;
  if(!state.isSignedIn){
    setRoomNameStatus("");
    return;
  }
  const name = normalizeRoomName(els.roomNameInput.value);
  if(!name){
    setRoomNameStatus("");
    return;
  }
  state.roomNameDraft = name;
  if(!state.roomId){
    if(els.roomNameInput) els.roomNameInput.value = name;
    flashRoomNameStatus("Room name saved for your next room.");
    return;
  }
  const isHost = state.selfUid && state.hostUid && state.selfUid === state.hostUid;
  if(!isHost){
    flashRoomNameStatus("Only the host can rename this room.");
    return;
  }
  if(!firebaseDb){
    flashRoomNameStatus("Firebase config missing.");
    return;
  }
  try{
    await updateDoc(roomRef(state.roomId), { roomName: name });
  } catch (err){
    console.error("Failed to save room name:", err);
    flashRoomNameStatus("Room name save failed.");
    return;
  }
  state.roomName = name;
  if(state.roomList && state.roomId && state.roomList[state.roomId]){
    state.roomList[state.roomId].roomName = name;
  }
  if(els.roomNameInput) els.roomNameInput.value = name;
  updateRoomLobbyUI();
  updateGameTitle();
  renderRoomList();
  updateRoomNameUI();
  flashRoomNameStatus("Room name saved.");
}

async function maybeAutoJoinRoom(){
  if(!state.isSignedIn || !hasFirebase()) return;
  if(state.roomId) return;
  const hashRoom = normalizeRoomCode(location.hash.replace("#", ""));
  if(hashRoom){
    await joinRoom(hashRoom);
    return;
  }
  if(!state.profileLoaded){
    await loadUserProfile();
  }
  if(state.roomIds && state.roomIds.length > 1) return;
  const preferred = state.lastRoomId || (state.roomIds && state.roomIds.length === 1 ? state.roomIds[0] : null);
  if(preferred){
    await joinRoom(preferred);
  }
}

async function createRoom(){
  resetJoinRoomState({ clearInput: true });
  if(!state.isSignedIn){ setError("Sign in first."); return; }
  if(!hasFirebase()){ setError("Firebase config missing."); return; }
  state.handId = 0;
  state.startVotes = [];
  const nameInput = els.roomNameInput ? normalizeRoomName(els.roomNameInput.value) : "";
  const roomName = getRoomDisplayName(nameInput || state.roomNameDraft || getDefaultRoomName(state.selfName));
  state.roomNameDraft = roomName;
  let roomId = "";
  for(let i=0;i<5;i++){
    const candidate = makeRoomCode();
    const snap = await getDoc(roomRef(candidate));
    if(!snap.exists()){
      roomId = candidate;
      break;
    }
  }
  if(!roomId){
    setError("Couldn't create a room. Try again.");
    return;
  }
  const player = buildPlayer(state.selfUid, getSelfRoomName(roomId));
  const roomState = {
    hostUid: state.selfUid,
    roomName,
    createdAt: serverTimestamp(),
    ...serializeRoomState(),
    phase: PHASE.LOBBY,
    players: [player],
    dealerIndex: 0,
    leaderIndex: 0,
    currentTurnIndex: 0,
    trickNumber: 0,
    deck: [],
    trumpCard: null,
    trumpSuit: null,
    currentTrick: { plays: [], leadSuit: null },
    lastTrickWinnerIndex: null,
    lastCompletedTrick: null,
    winnerIndex: null,
    discardPile: [],
    playedCards: [],
  };
  await setDoc(roomRef(roomId), roomState);
  state.roomName = roomName;
  state.roomCreatedBySelf = true;
  await addRoomToProfile(roomId);
  if(els.roomCodeInput) els.roomCodeInput.value = roomId;
  location.hash = roomId;
  subscribeToRoom(roomId);
  subscribeToHand();
  subscribeToLog();
  updateRoomJoinUI();
  updateRoomNameUI();
}

async function joinRoom(roomId){
  if(!state.isSignedIn){ setError("Sign in first."); return; }
  if(!hasFirebase()){ setError("Firebase config missing."); return; }
  const code = normalizeRoomCode(roomId || (els.roomCodeInput ? els.roomCodeInput.value : ""));
  if(!code){
    setError("Enter a valid room code.");
    return;
  }
  const snap = await getDoc(roomRef(code));
  if(!snap.exists()){
    setError("Room not found.");
    return;
  }
  const data = snap.data();
  state.roomName = getRoomDisplayName(data.roomName);
  state.roomCreatedBySelf = false;
  const players = Array.isArray(data.players) ? data.players.slice() : [];
  const existingIdx = players.findIndex(p => p.uid === state.selfUid);
  if(existingIdx === -1){
    if(players.length >= MAX_PLAYERS){
      setError("Room is full.");
      return;
    }
    const newPlayerName = getSelfRoomName(code);
    const startingScore = typeof data.settings?.startingScore === "number"
      ? data.settings.startingScore
      : state.settings.startingScore;
    const newPlayer = buildPlayer(state.selfUid, newPlayerName, null, startingScore);
    const isMidHand = data.phase === PHASE.SWAP || data.phase === PHASE.TRICK;
    if(isMidHand){
      newPlayer.folded = true;
      newPlayer.hasSwapped = true;
    }
    players.push(newPlayer);
    await updateDoc(roomRef(code), { players });
    if(isMidHand){
      try{
        await logRoomEventForRoom(code, {
          type: "chat",
          message: `${newPlayerName} has joined.`,
          likes: [],
          playerName: "System",
          playerUid: null,
        });
      } catch (err){
        console.error("Failed to log join message:", err);
      }
    }
  }
  await addRoomToProfile(code);
  if(els.roomCodeInput) els.roomCodeInput.value = code;
  location.hash = code;
  subscribeToRoom(code);
  subscribeToHand();
  subscribeToLog();
  resetJoinRoomState();
}

async function startMultiplayerGame(){
  if(!state.roomId){
    setError("Join a room first.");
    return;
  }
  if(!ensureConnectedForAction()) return;
  if(state.selfUid !== state.hostUid){
    setError("Only the host can start the game.");
    return;
  }
  if(state.players.length < 2){
    setError("Need at least 2 players.");
    return;
  }
  const players = state.players.map(p => buildPlayer(p.uid, p.name, p));
  state.players = players;
  state.phase = PHASE.HAND_END;
  state.dealerIndex = 0;
  state.leaderIndex = 0;
  state.currentTurnIndex = 0;
  state.trickNumber = 0;
  state.deck = [];
  state.handId = 0;
  advanceGameId();
  state.trumpCard = null;
  state.trumpSuit = null;
  state.currentTrick = { plays: [], leadSuit: null };
  state.lastTrickWinnerIndex = null;
  state.lastTrickWinnerKey = null;
  state.lastCompletedTrick = null;
  state.winnerIndex = null;
  state.handEndedByFolds = false;
  state.foldWinIndex = null;
  state.discardPile = [];
  state.playedCards = [];
  state.startVotes = [];
  state.selectedCardIds.clear();
  state.selectedForSwap.clear();
  state.settingsCollapsed = true;
  state.selfHand = [];
  if(firebaseDb && state.roomId){
    const batch = writeBatch(firebaseDb);
    for(const p of state.players){
      if(p.uid){
        batch.set(handRef(state.roomId, p.uid), { hand: [], updatedAt: serverTimestamp() }, { merge: true });
      }
    }
    batch.commit().catch((err)=>{
      console.error("Failed to reset hands:", err);
    });
  }
  syncRoomState("start-game");
}

async function resetRoomState(){
  if(!state.roomId || !isMultiplayer()){
    resetAll();
    return;
  }
  if(!ensureConnectedForAction()) return;
  if(state.selfUid !== state.hostUid){
    setError("Only the host can reset the room.");
    return;
  }
  if(!confirm("Reset the game for everyone?")){
    return;
  }
  await logRoomEvent({
    type: "chat",
    message: "Host has reset game.",
    playerName: "System",
    playerUid: state.selfUid || null,
  });
  const players = state.players.map(p => buildPlayer(p.uid, p.name));
  state.players = players;
  state.phase = PHASE.LOBBY;
  state.dealerIndex = 0;
  state.leaderIndex = 0;
  state.currentTurnIndex = 0;
  state.trickNumber = 0;
  state.deck = [];
  state.trumpCard = null;
  state.trumpSuit = null;
  state.currentTrick = { plays: [], leadSuit: null };
  state.lastTrickWinnerIndex = null;
  state.lastTrickWinnerKey = null;
  state.lastCompletedTrick = null;
  state.winnerIndex = null;
  state.handEndedByFolds = false;
  state.foldWinIndex = null;
  state.discardPile = [];
  state.playedCards = [];
  state.startVotes = [];
  state.selectedCardIds.clear();
  state.selectedForSwap.clear();
  state.swapCounts = {};
  state.swapNoticeHistory.clear();
  state.dealFadePending = false;
  state.lastDealtHandId = null;
  clearIncomingTimers();
  resetIncomingAnimationState();
  state.playersPendingInitial.clear();
  clearSwapAnnouncementTimers();
  state.selfHand = [];
  if(firebaseDb && state.roomId){
    const batch = writeBatch(firebaseDb);
    for(const p of state.players){
      if(p.uid){
        batch.set(handRef(state.roomId, p.uid), { hand: [], updatedAt: serverTimestamp() }, { merge: true });
      }
    }
    batch.commit().catch((err)=>{
      console.error("Failed to reset hands:", err);
    });
  }
  syncRoomState("reset");
}

async function resetHandState(){
  if(!state.roomId || !isMultiplayer()){
    setError("Join a room first.");
    return;
  }
  if(!ensureConnectedForAction()) return;
  if(state.selfUid !== state.hostUid){
    setError("Only the host can reset the hand.");
    return;
  }
  if(!confirm("Reset the current hand for everyone?")){
    return;
  }
  await logRoomEvent({
    type: "chat",
    message: "Host has reset hand.",
    playerName: "System",
    playerUid: state.selfUid || null,
  });
  for(const p of state.players){
    p.hand = [];
    p.tricksWonThisHand = 0;
    p.wonTricks = [];
    p.hasSwapped = false;
    p.folded = false;
  }
  state.phase = PHASE.HAND_END;
  state.leaderIndex = state.dealerIndex;
  state.currentTurnIndex = state.dealerIndex;
  state.trickNumber = 0;
  state.deck = [];
  state.trumpCard = null;
  state.trumpSuit = null;
  state.currentTrick = { plays: [], leadSuit: null };
  state.lastTrickWinnerIndex = null;
  state.lastTrickWinnerKey = null;
  state.lastCompletedTrick = null;
  state.winnerIndex = null;
  state.handEndedByFolds = false;
  state.foldWinIndex = null;
  state.discardPile = [];
  state.playedCards = [];
  state.selectedCardIds.clear();
  state.selectedForSwap.clear();
  resetIncomingAnimationState();
  state.playersPendingInitial.clear();
  clearIncomingTimers();
  state.dealFadePending = false;
  state.lastDealtHandId = null;
  state.swapCounts = {};
  state.swapNoticeHistory.clear();
  clearSwapAnnouncementTimers();
  state.dealTimeouts.forEach(t => clearTimeout(t));
  state.dealTimeouts = [];
  state.lastPlayedCardId = null;
  state.playRequestPending = false;
  if(state.playRequestTimer){ clearTimeout(state.playRequestTimer); state.playRequestTimer = null; }
  state.autoPassCountdown = null;
  if(state.autoPassTimer){ clearInterval(state.autoPassTimer); state.autoPassTimer = null; }
  state.dealing = false;
  state.lockOn = false;
  state.pendingRevealForIndex = null;
  state.selfHand = [];
  if(firebaseDb && state.roomId){
    const batch = writeBatch(firebaseDb);
    for(const p of state.players){
      if(p.uid){
        batch.set(handRef(state.roomId, p.uid), { hand: [], updatedAt: serverTimestamp() }, { merge: true });
      }
    }
    batch.commit().catch((err)=>{
      console.error("Failed to reset hands:", err);
    });
  }
  syncRoomState("reset-hand");
}

// Toggle to temporarily disable lock behavior while testing.
// Set to `false` to restore normal lock UI/behavior.
const LOCKS_DISABLED = false;

function setLock(on, forIndex=null){
  if(isMultiplayer()){
    state.lockOn = false;
    state.pendingRevealForIndex = null;
    if (els && els.lock) els.lock.style.display = "none";
    return;
  }
  // Short-circuit lock behavior when disabled for tests.
  if (typeof LOCKS_DISABLED !== "undefined" && LOCKS_DISABLED) {
    state.lockOn = false;
    state.pendingRevealForIndex = null;
    if (els && els.lock) els.lock.style.display = "none";
    return;
  }

  state.lockOn = on;
  state.pendingRevealForIndex = forIndex;
  els.lock.style.display = on ? "flex" : "none";
  if(on && forIndex !== null){
    const name = state.players[forIndex]?.name ?? "Next player";
    const isSelf = forIndex === state.currentTurnIndex;
    // special messaging for a player who just swapped and needs to inspect new cards
    if(state.phase === PHASE.SWAP && state.players[forIndex]?.hasSwapped){
      els.lockTitle.textContent = `Inspect ${name}`;
      els.lockText.textContent = `You just swapped — tap Reveal to inspect your new cards. Press Pass when ready.`;
    } else {
      els.lockTitle.textContent = `Pass to ${name}`;
      els.lockText.textContent = `Give the device to ${name}. Tap reveal when ready.`;
    }
  }
}

function resetAll(){
  state.phase = PHASE.LOBBY;
  state.lastPhase = PHASE.LOBBY;
  state.players = [];
  state.selfHand = [];
  state.startVotes = [];
  state.joinRoomActive = false;
  state.roomCreatedBySelf = false;
  state.playRequestPending = false;
  if(state.playRequestTimer){ clearTimeout(state.playRequestTimer); state.playRequestTimer = null; }
  closePlayerMenu();
  state.roomSynced = false;
  state.handSynced = false;
  state.roomResyncing = false;
  state.handResyncing = false;
  state.dealerIndex = 0;
  state.leaderIndex = 0;
  state.currentTurnIndex = 0;
  state.trickNumber = 0;
  state.deck = [];
  state.trumpCard = null;
  state.trumpSuit = null;
  state.currentTrick = { plays: [], leadSuit: null };
  state.gameId = 0;
  state.selectedCardIds = new Set();
  state.selectedForSwap = new Set();
  resetIncomingAnimationState();
  state.playersPendingInitial.clear();
  state.dealTimeouts.forEach(t => clearTimeout(t));
  state.dealTimeouts = [];
  state.lastPlayedCardId = null;
  state.autoPassCountdown = null;
  if(state.autoPassTimer){ clearInterval(state.autoPassTimer); state.autoPassTimer = null; }
  state.dealing = false;
  state.lastTrickWinnerIndex = null;
  state.lastTrickWinnerKey = null;
  state.lastCompletedTrick = null;
  state.winnerIndex = null;
  state.discardPile = [];
  state.playedCards = [];
  state.collapsed = { game:false, table:false, hand:false };
  state.settingsCollapsed = true;
  clampSettings();
  syncSettingsUI();
  setLock(false, null);
  setError(null);
  updateCommitHashUI();
  render();
}

function advanceGameId(){
  const current = Number(state.gameId || 0);
  state.gameId = current + 1;
}

function startNewGame(){
  setError(null);
  if(state.phase !== PHASE.GAME_OVER){
    setError("Game is not over yet.");
    return;
  }
  if(isMultiplayer() && state.selfUid !== state.hostUid){
    setError("Only the host can start a new game.");
    return;
  }
  if(isMultiplayer() && !ensureConnectedForAction()) return;
  if(isMultiplayer()){
    advanceGameId();
  }
  state.phase = PHASE.HAND_END;
  state.dealerIndex = 0;
  state.leaderIndex = 0;
  state.currentTurnIndex = 0;
  state.trickNumber = 0;
  state.deck = [];
  state.trumpCard = null;
  state.trumpSuit = null;
  state.currentTrick = { plays: [], leadSuit: null };
  state.handId = 0;
  state.lastTrickWinnerIndex = null;
  state.lastTrickWinnerKey = null;
  state.lastCompletedTrick = null;
  state.winnerIndex = null;
  state.discardPile = [];
  state.playedCards = [];
  state.selectedCardIds.clear();
  state.selectedForSwap.clear();
  resetIncomingAnimationState();
  state.playersPendingInitial.clear();
  clearIncomingTimers();
  state.dealFadePending = false;
  state.lastDealtHandId = null;
  state.swapCounts = {};
  state.swapNoticeHistory.clear();
  clearSwapAnnouncementTimers();
  state.dealTimeouts.forEach(t => clearTimeout(t));
  state.dealTimeouts = [];
  state.lastPlayedCardId = null;
  state.playRequestPending = false;
  if(state.playRequestTimer){ clearTimeout(state.playRequestTimer); state.playRequestTimer = null; }
  state.autoPassCountdown = null;
  if(state.autoPassTimer){ clearInterval(state.autoPassTimer); state.autoPassTimer = null; }
  state.dealing = false;
  state.selfHand = [];
  for(const p of state.players){
    p.hand = [];
    p.tricksWonThisHand = 0;
    p.wonTricks = [];
    p.score = state.settings.startingScore;
    p.hasSwapped = false;
    p.folded = false;
  }
  state.settingsCollapsed = true;
  setLock(false, null);
  render();

  if(isMultiplayer() && firebaseDb && state.roomId){
    const batch = writeBatch(firebaseDb);
    for(const p of state.players){
      if(p.uid){
        batch.set(handRef(state.roomId, p.uid), { hand: [], updatedAt: serverTimestamp() }, { merge: true });
      }
    }
    batch.commit().catch((err)=>{
      console.error("Failed to reset hands:", err);
    });
    syncRoomState("new-game");
  }
}

// collapse toggles: only Game header is collapsible; Table & Hand are fixed open
if(els.gameHeader){
  els.gameHeader.style.cursor = 'pointer';
  els.gameHeader.tabIndex = 0;
  const toggleGame = ()=>{ state.collapsed.game = !state.collapsed.game; render(); };
  els.gameHeader.addEventListener('click', toggleGame);
  els.gameHeader.addEventListener('keydown', (e)=>{ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); toggleGame(); } });
  // prevent clicks on the right-side header controls from toggling the header
  const gameRow = els.gameHeader.querySelector('.row2'); if(gameRow){ gameRow.addEventListener('click', e=>e.stopPropagation()); gameRow.addEventListener('keydown', e=>e.stopPropagation()); }
}
// tableHeader and handHeader are intentionally not made collapsible here

function initPlayers(names){
  state.players = names.map((n,i)=>({
    id: `p${i}`,
    name: n,
    hand: [],
    tricksWonThisHand: 0,
    wonTricks: [],
    score: state.settings.startingScore,
    dingCount: 0,
    totalWins: 0,
    hasSwapped: false,
    folded: false,
  }));
  state.dealerIndex = 0;
  state.leaderIndex = 0;
  state.currentTurnIndex = 0;
  state.winnerIndex = null;
}

function dealHand(){
  setError(null);
  if(state.phase === PHASE.GAME_OVER){
    setError("Game over. Start a new game.");
    return;
  }
  if(state.dealing) return;
  state.handEndedByFolds = false;
  state.foldWinIndex = null;
  if(isMultiplayer()){
    if(!ensureConnectedForAction()) return;
    if(state.phase !== PHASE.HAND_END){
      setError("Can't deal: finish the current hand first.");
      return;
    }
    if(state.selfIndex === null || state.selfIndex !== state.dealerIndex){
      setError("Only the dealer can deal.");
      return;
    }
    state.dealing = true;
    state.handId = (state.handId || 0) + 1;
    state.swapCounts = {};
    state.swapNoticeHistory.clear();
    clearSwapAnnouncementTimers();
    clearIncomingTimers();
    state.dealFadePending = false;
    state.lastDealtHandId = null;
    state.lastTrickWinnerIndex = null;
    state.lastCompletedTrick = null;

    // reset hand-only fields
    const handsByUid = new Map();
    for(const p of state.players){
      p.tricksWonThisHand = 0;
      p.wonTricks = [];
      p.hasSwapped = false;
      p.folded = false;
      if(p.uid) handsByUid.set(p.uid, []);
    }
    state.deck = shuffle(makeDecks(state.settings.decks));
    resetIncomingAnimationState();
    state.playersPendingInitial.clear();

    for(let i=0;i<5;i++){
      for(const p of state.players){
        const hand = handsByUid.get(p.uid);
        if(hand && state.deck.length){
          hand.push(state.deck.pop());
        }
      }
    }

    const dealerUid = state.players[state.dealerIndex]?.uid;
    const dealerHand = dealerUid ? handsByUid.get(dealerUid) : null;
    if(dealerHand && dealerHand.length){
      state.trumpCard = dealerHand[dealerHand.length - 1];
      state.trumpSuit = state.trumpCard.suit;
    } else {
      state.trumpCard = null;
      state.trumpSuit = null;
    }

    state.selfHand = handsByUid.get(state.selfUid) || [];
    if(state.selfHand.length){
      queueIncomingCards(state.selfHand, { stage: true });
    }
    if(firebaseDb && state.roomId){
      const batch = writeBatch(firebaseDb);
      for(const [uid, hand] of handsByUid.entries()){
        batch.set(handRef(state.roomId, uid), { hand, updatedAt: serverTimestamp() }, { merge: true });
      }
      batch.commit().catch((err)=>{
        console.error("Failed to deal hands:", err);
        setError("Failed to deal hands.");
      });
    }

    state.phase = PHASE.SWAP;
    state.currentTurnIndex = firstActiveIndex((state.dealerIndex + 1) % state.players.length);
    state.leaderIndex = state.dealerIndex;
    state.trickNumber = 0;
    state.currentTrick = { plays: [], leadSuit: null };
    state.selectedCardIds.clear();
    state.selectedForSwap.clear();
    state.dealTimeouts.forEach(t=> clearTimeout(t));
    state.dealTimeouts = [];
    state.dealing = false;
    state.lockOn = false;
    state.pendingRevealForIndex = null;
    syncRoomState("deal");
    render();
    return;
  }
  state.dealing = true;
  state.handId = (state.handId || 0) + 1;
  state.swapCounts = {};
  state.swapNoticeHistory.clear();
  clearSwapAnnouncementTimers();
  clearIncomingTimers();
  state.dealFadePending = false;
  state.lastDealtHandId = null;
  state.lastTrickWinnerIndex = null;
  state.lastCompletedTrick = null;

  // reset hand-only fields
  for(const p of state.players){
    p.hand = [];
    p.tricksWonThisHand = 0;
    p.wonTricks = [];
    p.hasSwapped = false;
    p.folded = false;
  }
  state.deck = shuffle(makeDecks(state.settings.decks));

  // clear any pending incoming flags and per-player initial reveal markers
  resetIncomingAnimationState();
  state.playersPendingInitial.clear();

  // deal 5 cards to each player instantly, but DO NOT animate them yet
  for(let i=0;i<5;i++){
    for(const p of state.players){
      p.hand.push(state.deck.pop());
    }
  }

  // mark everyone as needing an initial reveal animation when they press Reveal
  // set the initial trump card to dealer's last dealt card (dealer keeps it)
  const dealer = state.players[state.dealerIndex];
  if(dealer && dealer.hand.length){
    state.trumpCard = dealer.hand[dealer.hand.length - 1];
    state.trumpSuit = state.trumpCard.suit;
  } else {
    state.trumpCard = null;
    state.trumpSuit = null;
  }
  // finalize swap state and animate the dealt cards into each player's hand
  state.phase = PHASE.SWAP;
  state.currentTurnIndex = firstActiveIndex((state.dealerIndex + 1) % state.players.length); // swap starts left of dealer
  state.leaderIndex = state.dealerIndex; // per rules: dealer leads first trick
  state.trickNumber = 0;
  state.currentTrick = { plays: [], leadSuit: null };
  state.selectedCardIds.clear();
  state.selectedForSwap.clear();

  // Deal is immediate, but the reveal animation will stagger cards into view.
  state.dealTimeouts.forEach(t=> clearTimeout(t));
  state.dealTimeouts = [];
  state.dealing = false;

  // after dealing, require initial reveal for each player (so Reveal can animate if desired)
  for(let i=0;i<state.players.length;i++) state.playersPendingInitial.add(i);
  // lock to first swap player (left of dealer)
  setLock(true, state.currentTurnIndex);
  render();
}

// removed unused helper: allPlayersSwapped()

function advanceSwapTurn(){
  // next player in order who hasn't swapped
  for(let k=1;k<=state.players.length;k++){
    const idx = (state.currentTurnIndex + k) % state.players.length;
    if(!state.players[idx].hasSwapped){
      state.currentTurnIndex = idx;
      state.selectedForSwap.clear();
      setLock(true, idx);
      render();
      return;
    }
  }
  // everyone swapped
  state.phase = PHASE.TRICK;
  state.trickNumber = 1;
  state.currentTurnIndex = firstActiveIndex(state.leaderIndex);
  state.currentTrick = { plays: [], leadSuit: null };
  state.selectedCardIds.clear();
  setLock(true, state.currentTurnIndex);
  render();
}

// Find the next player index (starting at 'start') who has NOT swapped yet. Returns null if all have swapped.
// removed unused helper: nextUnswappedIndex()

// Return the first active (non-folded) index at or after `start`, or null if none
function firstActiveIndex(start){
  if(!state.players.length) return null;
  for(let k=0;k<state.players.length;k++){
    const idx = (start + k) % state.players.length;
    if(!state.players[idx].folded) return idx;
  }
  return null;
}

// Return next active index AFTER `idx`, or null if none
function getNextActiveIndex(idx){
  if(!state.players.length) return null;
  for(let k=1;k<=state.players.length;k++){
    const i = (idx + k) % state.players.length;
    if(!state.players[i].folded) return i;
  }
  return null;
}

function activePlayersCount(){
  return state.players.reduce((n,p)=> n + (p.folded ? 0 : 1), 0);
}

function confirmSwap(){
  if(isMultiplayer()){
    confirmSwapMultiplayer();
    return;
  }
  setError(null);
  if(state.phase !== PHASE.SWAP) return;
  const p = state.players[state.currentTurnIndex];

  // prevent multiple swaps per hand
  if(p.hasSwapped){ setError("You have already swapped this hand."); return; }

  const discards = Array.from(state.selectedForSwap);
  // record discarded card objects into discard pile
  if(discards.length){
    const discardedCards = p.hand.filter(c => discards.includes(c.id));
    state.discardPile.push(...discardedCards);
  }
  if(discards.length > 3){
    setError("You can swap at most 3 cards.");
    return;
  }
  if(state.dealing){ setError("Deal animation in progress."); return; }
  announceSwap(state.currentTurnIndex, discards.length);

  // if nothing selected, interpret as a 0-card swap (allowed), but still mark as swapped

  // replace each selected card in-place, left-to-right, with animated out/in sequence (~350ms per card)
  const positions = Array.from(state.selectedForSwap)
    .map(id => ({ id, idx: p.hand.findIndex(c => c.id===id) }))
    .filter(x => x.idx !== -1)
    .sort((a,b)=> a.idx - b.idx);

  // mark those discards into discard pile (by object)
  for(const pos of positions){
    const discarded = p.hand[pos.idx];
    if(discarded) state.discardPile.push(discarded);
  }

  // function for delay
  const sleep = (ms)=> new Promise(r=> setTimeout(r, ms));

  // sequentially replace
  (async ()=>{
    const perCardMs = Math.max(300, Math.floor(1000 / Math.max(1, positions.length)) ); // approx 1s total distributed
    for(const pos of positions){
      const id = pos.id;
      // animate outgoing clone if present
      const node = els.handArea.querySelector(`[data-card-id="${id}"]`);
      if(node){
        const rect = node.getBoundingClientRect();
        const clone = node.cloneNode(true);
        clone.style.position = 'fixed';
        clone.style.left = rect.left + 'px';
        clone.style.top = rect.top + 'px';
        clone.style.width = rect.width + 'px';
        clone.style.height = rect.height + 'px';
        clone.style.margin = '0';
        clone.style.zIndex = 9999;
        document.body.appendChild(clone);
        requestAnimationFrame(()=> clone.classList.add('fly-out'));
        // remove clone after animation
        setTimeout(()=> clone.remove(), Math.max(360, perCardMs));
      }

      // actually remove the card at the target index (use current hand state - indices shift as we replace sequentially)
      const curIdx = p.hand.findIndex(c => c.id === id);
      if(curIdx !== -1) p.hand.splice(curIdx, 1);

      // draw one replacement and insert at same index
      if(state.deck.length){
        const card = state.deck.pop();
        const insertIdx = Math.min(curIdx === -1 ? p.hand.length : curIdx, p.hand.length);
        p.hand.splice(insertIdx, 0, card);
        state.incomingAnimationPlayed.delete(card.id);
        state.incomingCardIds.add(card.id);
        render();
        // hold the incoming indicator for the per-card interval
        await sleep(perCardMs);
        state.incomingCardIds.delete(card.id);
        state.incomingAnimationPlayed.delete(card.id);
        render();
      } else {
        // no card to draw; continue after a short pause
        await sleep(perCardMs);
      }
    }

    p.hasSwapped = true;
    state.selectedForSwap.clear();
    // leave device unlocked so player can immediately inspect their new cards without clicking Reveal
    setLock(false, null);
    render();

    // start auto-pass countdown: inform user and advance after 3s (if still in SWAP)
    if(state.phase === PHASE.SWAP){
      state.autoPassCountdown = 3;
      if(state.autoPassTimer){ clearInterval(state.autoPassTimer); }
      state.autoPassTimer = setInterval(()=>{
        state.autoPassCountdown -= 1;
        if(state.autoPassCountdown <= 0){
          clearInterval(state.autoPassTimer);
          state.autoPassTimer = null;
          state.autoPassCountdown = null;
          // only advance if still in SWAP phase
          if(state.phase === PHASE.SWAP){
            advanceSwapTurn();
          }
          render();
        } else {
          render();
        }
      }, 1000);
    }
  })();

  // No-op for trump here (trump already set at deal)


  // Trump already set during deal; do not draw an extra trump here.
}

function confirmSwapMultiplayer(){
  setError(null);
  if(state.phase !== PHASE.SWAP) return;
  if(!ensureConnectedForAction({ requireHand: true })) return;
  if(state.selfIndex === null || state.selfIndex !== state.currentTurnIndex){
    setError("Not your turn.");
    return;
  }
  const p = state.players[state.selfIndex];
  if(!p){
    setError("Player not found.");
    return;
  }
  if(!Array.isArray(state.selfHand)){
    setError("Hand not loaded.");
    return;
  }
  if(p.hasSwapped){
    setError("You have already swapped this hand.");
    return;
  }
  const discards = Array.from(state.selectedForSwap);
  if(discards.length > 3){
    setError("You can swap at most 3 cards.");
    return;
  }
  if(state.dealing){
    setError("Deal in progress.");
    return;
  }
  announceSwap(state.selfIndex, discards.length);

  if(discards.length){
    discards.forEach((id, idx)=>{
      const node = els.handArea.querySelector(`[data-card-id="${id}"]`);
      if(!node) return;
      const rect = node.getBoundingClientRect();
      const clone = node.cloneNode(true);
      clone.classList.add("fly-out");
      clone.style.position = "fixed";
      clone.style.left = rect.left + "px";
      clone.style.top = rect.top + "px";
      clone.style.width = rect.width + "px";
      clone.style.height = rect.height + "px";
      clone.style.margin = "0";
      clone.style.zIndex = 9999;
      document.body.appendChild(clone);
      setTimeout(()=> clone.remove(), 420 + (idx * 60));
    });
  }

  const workingHand = (state.selfHand || []).slice();
  const newCards = [];
  for(const id of discards){
    const curIdx = workingHand.findIndex(c => c.id === id);
    if(curIdx === -1) continue;
    const discarded = workingHand[curIdx];
    if(discarded) state.discardPile.push(discarded);
    workingHand.splice(curIdx, 1);
    if(state.deck.length){
      const card = state.deck.pop();
      const insertIdx = Math.min(curIdx, workingHand.length);
      workingHand.splice(insertIdx, 0, card);
      newCards.push(card);
    }
  }

  state.selfHand = workingHand;
  syncSelfHand();
  render();
  if(newCards.length){
    queueIncomingCards(newCards, { stagger: 160, duration: 520 });
  }
  p.hasSwapped = true;
  state.selectedForSwap.clear();
  if(state.autoPassTimer){ clearInterval(state.autoPassTimer); state.autoPassTimer = null; }
  state.autoPassCountdown = null;

  // advance swap turn or move to trick
  advanceSwapTurn();
  handleFirstMultiplayerMove();
  syncRoomState("swap");
}

function playableCardIdsForCurrentPlayer(){
  const isMulti = isMultiplayer();
  if(isMulti && state.selfIndex !== state.currentTurnIndex) return new Set();
  const p = isMulti ? state.players[state.selfIndex] : state.players[state.currentTurnIndex];
  const hand = isMulti ? state.selfHand : (p ? p.hand : null);
  if(!hand) return new Set();
  const lead = state.currentTrick.leadSuit;
  if(!lead) return new Set(hand.map(c=>c.id));
  if(canFollowSuit(hand, lead)){
    return new Set(hand.filter(c=>c.suit===lead).map(c=>c.id));
  }
  return new Set(hand.map(c=>c.id));
}

function playSelectedCard(){
  setError(null);
  if(state.phase !== PHASE.TRICK) return;
  if(state.playRequestPending) return;
  const isMulti = isMultiplayer();
  if(isMulti && !ensureConnectedForAction({ requireHand: true })) return;
  if(isMulti && state.selfIndex !== state.currentTurnIndex){
    setError("Not your turn.");
    return;
  }
  const selected = Array.from(state.selectedCardIds);
  if(selected.length !== 1){
    setError("Select exactly 1 card to play.");
    return;
  }
  const p = isMulti ? state.players[state.selfIndex] : state.players[state.currentTurnIndex];
  const hand = isMulti ? state.selfHand : (p ? p.hand : null);
  if(!p){
    setError("Player not found.");
    return;
  }
  if(!hand){
    setError("Hand not loaded.");
    return;
  }
  const card = hand.find(c => c.id === selected[0]);
  if(!card){
    setError("That card isn't in your hand.");
    return;
  }
  // enforce follow suit unless hyperrealistic mode is on
  const lead = state.currentTrick.leadSuit;
  if(!state.settings.hyperrealistic && lead){
    if(canFollowSuit(hand, lead) && card.suit !== lead){
      setError(`You must follow suit (${SUIT_ICON[lead]}) if you can.`);
      return;
    }
  }
  state.playRequestPending = true;
  if(state.playRequestTimer){ clearTimeout(state.playRequestTimer); }
  state.playRequestTimer = setTimeout(()=>{
    state.playRequestPending = false;
    state.playRequestTimer = null;
    render();
  }, 6000);
  if(isMulti) handleFirstMultiplayerMove();
  // animate play: clone the card DOM and fly it to the trick area, then commit the play
  const node = els.handArea.querySelector(`[data-card-id="${card.id}"]`);
  const syncIfMulti = ()=>{ if(isMulti) syncRoomState("play"); };
  const commitPlay = ()=>{
    state.playRequestPending = false;
    if(state.playRequestTimer){ clearTimeout(state.playRequestTimer); state.playRequestTimer = null; }
    // commit play
    if(isMulti){
      state.selfHand = state.selfHand.filter(c => c.id !== card.id);
      syncSelfHand();
    } else {
      p.hand = p.hand.filter(c => c.id !== card.id);
    }
    state.currentTrick.plays.push({ playerIndex: state.currentTurnIndex, card });
    if(isMulti){
      const name = state.players[state.currentTurnIndex]?.name ?? "Player";
      logRoomEvent({
        type: "play",
        handId: state.handId,
        gameId: state.gameId,
        trickNumber: state.trickNumber,
        playerIndex: state.currentTurnIndex,
        playerName: name,
        card: { suit: card.suit, rank: card.rank, id: card.id },
      });
    }
    if(!state.currentTrick.leadSuit){
      state.currentTrick.leadSuit = card.suit;
      // a new trick is starting: clear the previous completed trick that was left on the table
      state.lastCompletedTrick = null;
    }
    state.selectedCardIds.clear();
    // mark this card as recently played so renderTrickArea can add an entry animation
    state.lastPlayedCardId = card.id;
    render();
    // clear the marker after the animation window
    setTimeout(()=>{ state.lastPlayedCardId = null; render(); }, 520);
    // continue with logic after render
    // if trick complete:
    if(state.currentTrick.plays.length === activePlayersCount()){
      const winnerIdx = determineTrickWinner(state.currentTrick.plays, state.currentTrick.leadSuit, state.trumpSuit);
      state.players[winnerIdx].tricksWonThisHand += 1;
      state.lastTrickWinnerIndex = winnerIdx;

      // record the completed trick (array of plays) into the winner's wonTricks for visualization
      const trickRecord = state.currentTrick.plays.map(p => ({ playerIndex: p.playerIndex, card: p.card }));
      state.players[winnerIdx].wonTricks = state.players[winnerIdx].wonTricks || [];
      state.players[winnerIdx].wonTricks.push(trickRecord);

      // store the completed trick on the table so it remains visible until the next lead
      state.lastCompletedTrick = trickRecord;

      // add played cards to log
      for(const pl of state.currentTrick.plays) state.playedCards.push(pl.card);

      // next leader is trick winner
      state.leaderIndex = winnerIdx;

      if(checkFastTrackWin({ winnerIdx, state, endHand })) return;

      // next trick or end hand
      if(state.trickNumber >= 5){
        endHand();
        return;
      } else {
        state.trickNumber += 1;
        state.currentTrick = { plays: [], leadSuit: null };
        state.currentTurnIndex = firstActiveIndex(state.leaderIndex);
        setLock(true, state.currentTurnIndex);
        render();
        syncIfMulti();
        return;
      }
    }

    // otherwise next player's turn
    const nextIdx = getNextActiveIndex(state.currentTurnIndex);
    if(nextIdx !== null) state.currentTurnIndex = nextIdx;
    setLock(true, state.currentTurnIndex);
    render();
    syncIfMulti();
  };

  if(node){
    const rect = node.getBoundingClientRect();
    const target = els.trickArea.getBoundingClientRect();
    const clone = node.cloneNode(true);
    clone.classList.add('playClone');
    clone.style.width = rect.width + 'px';
    clone.style.height = rect.height + 'px';
    clone.style.left = rect.left + 'px';
    clone.style.top = rect.top + 'px';
    clone.style.margin = '0';
    clone.style.transform = 'translate3d(0,0,0) scale(1)';
    document.body.appendChild(clone);

    // compute center target (center of trickArea)
    const dx = (target.left + target.width/2) - (rect.left + rect.width/2);
    const dy = (target.top + target.height/2) - (rect.top + rect.height/2);

    requestAnimationFrame(()=>{
      clone.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(0.92)`;
      clone.style.opacity = '0.98';
    });

    // wait for animation to complete
    setTimeout(()=>{
      clone.remove();
      commitPlay();
    }, 460);
    return;
  } else {
    // no DOM node found - fall back to instant commit
    commitPlay();
    return;
  }

  // if trick complete:
  if(state.currentTrick.plays.length === activePlayersCount()){
    const winnerIdx = determineTrickWinner(state.currentTrick.plays, state.currentTrick.leadSuit, state.trumpSuit);
    state.players[winnerIdx].tricksWonThisHand += 1;
    state.lastTrickWinnerIndex = winnerIdx;

    // record the completed trick (array of plays) into the winner's wonTricks for visualization
    const trickRecord = state.currentTrick.plays.map(p => ({ playerIndex: p.playerIndex, card: p.card }));
    state.players[winnerIdx].wonTricks = state.players[winnerIdx].wonTricks || [];
    state.players[winnerIdx].wonTricks.push(trickRecord);

    // store the completed trick on the table so it remains visible until the next lead
    state.lastCompletedTrick = trickRecord;

    // add played cards to log
    for(const pl of state.currentTrick.plays) state.playedCards.push(pl.card);

    // next leader is trick winner
    state.leaderIndex = winnerIdx;

    if(checkFastTrackWin({ winnerIdx, state, endHand })) return;

    // next trick or end hand
    if(state.trickNumber >= 5){
      endHand();
      return;
    } else {
      state.trickNumber += 1;
      state.currentTrick = { plays: [], leadSuit: null };
      state.currentTurnIndex = firstActiveIndex(state.leaderIndex);
      setLock(true, state.currentTurnIndex);
      render();
      return;
    }
  }

  // otherwise next player's turn
  const nextIdx = getNextActiveIndex(state.currentTurnIndex);
  if(nextIdx !== null) state.currentTurnIndex = nextIdx;
  setLock(true, state.currentTurnIndex);
  render();
}

function showGameOverNotice(){
  if(state.phase !== PHASE.GAME_OVER) return;
  if(!isMultiplayer()) return;
  const selfIdx = state.selfIndex;
  if(selfIdx === null || selfIdx < 0) return;
  const winnerIdx = state.winnerIndex;
  const isSelfWinner = winnerIdx !== null && selfIdx === winnerIdx;
  const title = isSelfWinner
    ? "YOU WON, vote to start a new game"
    : "Game over, vote to start a new game";
  const noticeKey = `gameover-${state.gameId || state.handId || "0"}-${winnerIdx}-${selfIdx}`;
  triggerPopupOnce(noticeKey, {
    title,
    subtitle: "",
    tone: isSelfWinner ? "good" : "danger",
    confetti: isSelfWinner,
  });
}

function endHand(){
  state.phase = PHASE.HAND_END;

  // scoring: count down from STARTING_SCORE, reset on DUNG
  const dingedIndexes = [];
  const allTricksPlayed = state.trickNumber >= 5 && !state.handEndedByFolds;
  state.players.forEach((p, idx)=>{
    if(allTricksPlayed && p.tricksWonThisHand === 0 && !p.folded){
      p.score = state.settings.startingScore;
      p.dingCount = (p.dingCount || 0) + 1;
      dingedIndexes.push(idx);
    } else {
      p.score = Math.max(0, p.score - p.tricksWonThisHand);
    }
  });
  const winnerIdx = state.players.findIndex(p => p.score <= 0);
  if(winnerIdx >= 0){
    state.winnerIndex = winnerIdx;
    state.players[winnerIdx].totalWins = (state.players[winnerIdx].totalWins || 0) + 1;
    state.phase = PHASE.GAME_OVER;
  } else {
    state.winnerIndex = null;
  }
  if(isMultiplayer()){
    const scores = state.players.map(p => ({ name: p.name, score: p.score }));
    logRoomEvent({
      type: "hand_end",
      handId: state.handId,
      gameId: state.gameId,
      scores,
      reason: state.handEndedByFolds ? "all_folded" : "complete",
      winnerName: state.handEndedByFolds ? (state.players[state.foldWinIndex]?.name ?? null) : null,
    });
  }

  // dealer update
  if(DEALER_RULE === "LAST_TRICK_WINNER" && state.lastTrickWinnerIndex !== null){
    state.dealerIndex = state.lastTrickWinnerIndex;
  } else if(DEALER_RULE === "ROTATE"){
    state.dealerIndex = (state.dealerIndex + 1) % state.players.length;
  }

  // move trump to discard pile so it appears in logs (remove from any player's hand)
  if(state.trumpCard){
    for(const pl of state.players){
      if(!Array.isArray(pl.hand)) continue;
      const i = pl.hand.findIndex(c => c.id === state.trumpCard.id);
      if(i !== -1){ pl.hand.splice(i,1); break; }
    }
    state.discardPile.push(state.trumpCard);
    state.trumpCard = null;
    state.trumpSuit = null;
  }

  // reset turn pointers
  state.currentTurnIndex = state.dealerIndex;
  state.selectedCardIds.clear();
  state.selectedForSwap.clear();

  // auto lock to dealer (who will hit deal)
  if(state.phase === PHASE.GAME_OVER){
    setLock(false, null);
  } else {
    setLock(true, state.dealerIndex);
  }
  render();
  if(isMultiplayer()) syncRoomState("end-hand");

  const selfIdx = isMultiplayer() ? state.selfIndex : null;
  const selfDinged = selfIdx !== null && dingedIndexes.includes(selfIdx);
  if(state.phase === PHASE.GAME_OVER){
    showGameOverNotice();
  } else if(selfDinged){
    triggerPopupOnce(`ding-${state.handId}-${selfIdx}`, {
      title: "YOU GOT DUNG",
      subtitle: "Reset to the starting score.",
      tone: "danger",
    });
  }
}

function renderScoreboard(){
  els.scoreboard.innerHTML = "";
  state.players.forEach((p, idx)=>{
    const row = document.createElement("div");
    row.className = "playerRow";
    row.addEventListener("click", (e)=>{
      e.stopPropagation();
      maybeOpenPlayerMenu(p, row);
    });
    // highlight active turn
    if(idx === state.currentTurnIndex) row.classList.add('activeTurn');
    const left = document.createElement("div");
    left.className = "playerInfo";
    const turnMark = idx === state.currentTurnIndex ? '<span class="turnDot">&bull;</span>' : '';
    const dealerMark = idx === state.dealerIndex ? '<span class="dealerBadge">Dealer</span>' : '';
    const hostMark = (state.hostUid && p.uid === state.hostUid) ? '<span class="hostBadge">Host</span>' : '';
    left.innerHTML = `
      <div class="playerTop">
        ${turnMark}
        <div class="name">${p.name}</div>
        ${dealerMark}
        ${hostMark}
      </div>
    `;

    const row2 = document.createElement("div");
    row2.className = "scoreRow scoreRowSplit";
    const visual = document.createElement('div');
    visual.className = 'trickVisualizer';
    const chips = document.createElement('div');
    chips.className = 'trickChipsRow';
    const MAX_TRICKS = 5;
    for(let i=0;i<MAX_TRICKS;i++){
      const chip = document.createElement('div');
      const isFilled = i < p.tricksWonThisHand;
      chip.className = 'trickChip ' + (isFilled ? 'filled' : 'empty');
      if(isFilled){
        const inner = document.createElement('div');
        inner.className = 'chipInner';
        // show small trophy glyph centered inside the gold mini-card
        inner.textContent = '🏆';
        chip.appendChild(inner);
      }
      // highlight the most-recently-won chip for last trick winner
      if(i === p.tricksWonThisHand - 1 && state.lastTrickWinnerIndex === idx){
        chip.classList.add('recent');
      }
      chip.title = `${i+1} of ${MAX_TRICKS}`;
      chips.appendChild(chip);
    }

    visual.appendChild(chips);
    const right = document.createElement("div");
    // total score pill: bold, gold
    right.className = "totalScore";
    right.innerHTML = `<div class="scoreLabel">Score</div><strong class="mono scoreValue">${p.score}</strong>`;
    row2.appendChild(visual);
    row2.appendChild(right);

    const row3 = document.createElement("div");
    row3.className = "scoreRow";
    row3.innerHTML = `
      <span class="dingBadge">DING <strong class="mono">${p.dingCount || 0}</strong></span>
      <span class="winsBadge">Wins <strong class="mono">${p.totalWins || 0}</strong></span>
    `;

    left.appendChild(row2);
    left.appendChild(row3);
    row.appendChild(left);
    els.scoreboard.appendChild(row);
  });
}
function animateTrickWinner(summary){
  if(!summary || !els.tablePanel) return;
  const tableRect = els.tablePanel.getBoundingClientRect();
  const summaryRect = summary.getBoundingClientRect();
  if(!tableRect.width || !tableRect.height || !summaryRect.width || !summaryRect.height) return;
  const tableCenterX = tableRect.left + (tableRect.width / 2);
  const tableCenterY = tableRect.top + (tableRect.height / 2);
  const summaryCenterX = summaryRect.left + (summaryRect.width / 2);
  const summaryCenterY = summaryRect.top + (summaryRect.height / 2);
  const fullScale = Math.max(tableRect.width / summaryRect.width, tableRect.height / summaryRect.height);
  const scale = Math.max(1, fullScale * 0.5);
  const tx = tableCenterX - summaryCenterX;
  const ty = tableCenterY - summaryCenterY;

  summary.classList.add("trickWinnerHero");
  summary.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;

  requestAnimationFrame(()=>{
    summary.classList.add("trickWinnerReturn");
    summary.style.transform = "translate(0px, 0px) scale(1)";
    setTimeout(()=>{
      summary.classList.remove("trickWinnerHero", "trickWinnerReturn");
      summary.style.transform = "";
    }, 700);
  });
}

function renderTrickArea(){
  els.trickArea.innerHTML = "";
  if(state.phase === PHASE.LOBBY){
    els.trickArea.innerHTML = `<div class="small">Start a game, deal a hand, then play.</div>`;
    return;
  }

  const infoRow = document.createElement("div");
  infoRow.className = "trickInfoRow";
  let hasInfo = false;
  let summary = null;
  const showFoldWin = state.handEndedByFolds && state.foldWinIndex !== null
    && (state.phase === PHASE.HAND_END || state.phase === PHASE.GAME_OVER);

  // show the last trick winner after each completed trick (styled pill with mini-card)
  if(!showFoldWin && state.lastCompletedTrick && state.lastTrickWinnerIndex !== null){
    summary = document.createElement("div");
    summary.className = "pill trick-winner";
    const winner = state.players[state.lastTrickWinnerIndex]?.name ?? "-";
    // find the winning play so we can show the winning card visually
    const winningPlay = state.lastCompletedTrick.find(p => p.playerIndex === state.lastTrickWinnerIndex);
    const cardText = winningPlay ? `${RANK_LABEL[winningPlay.card.rank] ?? winningPlay.card.rank}${SUIT_ICON[winningPlay.card.suit]}` : '';

    summary.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px">
        <div class="miniCard winner">${cardText}</div>
        <div style="display:flex;flex-direction:column">
          <div class="label">Trick winner</div>
          <strong>${winner}</strong>
        </div>
      </div>
    `;
    infoRow.appendChild(summary);
    hasInfo = true;
  }

  if(showFoldWin){
    const winnerName = state.players[state.foldWinIndex]?.name ?? "Player";
    const banner = document.createElement("div");
    banner.className = "pill";
    banner.innerHTML = `<strong>${winnerName}</strong> won the hand because everyone folded.`;
    infoRow.appendChild(banner);
    hasInfo = true;
  }

  if(hasInfo){
    els.trickArea.appendChild(infoRow);
  }

  // show current trick plays
  if(state.phase === PHASE.TRICK || state.phase === PHASE.HAND_END || state.phase === PHASE.GAME_OVER){
    const playRow = document.createElement("div");
    playRow.className = "trickPlayRow";
    const plays = state.currentTrick.plays;
    const renderPlays = plays.length ? plays : (state.lastCompletedTrick || []);
    if(renderPlays.length === 0){
      const d = document.createElement("div");
      d.className = "small";
      d.textContent = "No cards played yet for this trick.";
      playRow.appendChild(d);
    } else {
      for(const pl of renderPlays){
        const p = state.players[pl.playerIndex];
        const slot = document.createElement("div");
        slot.className = "trickSlot";

        const c = pl.card;
        const face = document.createElement("div");
        face.className = "cardFace " + (isRedSuit(c.suit) ? "red":"");
        // entry animation for recently played card
        if(state.lastPlayedCardId && c.id === state.lastPlayedCardId){
          face.classList.add('enter');
        }
        face.innerHTML = `<div class="top">${RANK_LABEL[c.rank] ?? c.rank}${SUIT_ICON[c.suit]}</div>
                          <div class="mid">${SUIT_ICON[c.suit]}</div>
                          <div class="bot">${RANK_LABEL[c.rank] ?? c.rank}${SUIT_ICON[c.suit]}</div>`;

        const name = document.createElement("div");
        name.className = "small";
        name.style.textAlign = "center";
        name.style.marginTop = "6px";
        name.textContent = p.name;

        slot.appendChild(face);
        slot.appendChild(name);
        playRow.appendChild(slot);
      }
    }
    els.trickArea.appendChild(playRow);
  }

  if(summary){
    const key = `${state.handId || 0}-${state.trickNumber || 0}-${state.lastTrickWinnerIndex}`;
    if(state.lastTrickWinnerKey !== key){
      state.lastTrickWinnerKey = key;
      requestAnimationFrame(()=> animateTrickWinner(summary));
    }
  }
}
function renderTableHint(){
  if(!els.tableHint) return;
  const isMulti = isMultiplayer();
  const isSelfTurn = !isMulti || state.selfIndex === state.currentTurnIndex;
  const currentName = state.players[state.currentTurnIndex]?.name ?? "Player";
  let text = "";
  if(state.phase === PHASE.SWAP && !isSelfTurn){
    text = `Waiting for ${currentName} to swap.`;
  } else if(state.phase === PHASE.TRICK && !isSelfTurn){
    text = `Waiting for ${currentName} to play.`;
  }
  els.tableHint.textContent = text;
  els.tableHint.style.display = text ? "block" : "none";
}
function renderSwapSummary(){
  if(!els.swapSummary || !els.swapSummaryList) return;
  const show = (state.phase === PHASE.SWAP) || (state.phase === PHASE.TRICK && !dealerHasPlayedFirstCard());
  if(!show){
    els.swapSummary.style.display = "none";
    els.swapSummaryList.innerHTML = "";
    return;
  }
  els.swapSummaryList.innerHTML = "";
  state.players.forEach((player, idx)=>{
    const key = swapKeyForPlayer(player, idx);
    const hasCount = typeof state.swapCounts[key] === "number";
    if(!player.folded && !player.hasSwapped && !hasCount) return;
    const count = hasCount ? state.swapCounts[key] : 0;
    const item = document.createElement("div");
    item.className = "swapSummaryItem";
    const statusLabel = player.folded ? "FOLDED" : String(count);
    item.innerHTML = `<span>${player.name}</span><span class="mono">${statusLabel}</span>`;
    els.swapSummaryList.appendChild(item);
  });
  if(!els.swapSummaryList.childNodes.length){
    const empty = document.createElement("div");
    empty.className = "small";
    empty.textContent = "No swaps yet.";
    els.swapSummaryList.appendChild(empty);
  }
  els.swapSummary.style.display = "flex";
}
function renderHand(){
  els.handArea.innerHTML = "";
  els.selectedCount.textContent = "0";
  els.confirmPlayBtn.style.display = "none";

  const isMulti = isMultiplayer();
  const selfIndex = isMulti ? state.selfIndex : state.currentTurnIndex;
  const selfPlayer = (selfIndex !== null && selfIndex !== undefined) ? state.players[selfIndex] : null;
  const isSelfTurn = !isMulti || (state.selfIndex === state.currentTurnIndex);

  if(state.phase === PHASE.LOBBY){
    els.handHint.textContent = isMulti ? "Join a room to see your hand." : "Start a hand to see cards.";
    return;
  }
  if(state.phase === PHASE.GAME_OVER){
    const hostNote = isMulti
      ? (state.selfUid === state.hostUid ? "Start a new game to reset scores." : "Waiting for host to start a new game.")
      : "Start a new game to reset scores.";
    els.handHint.textContent = `Game over. ${hostNote}`;
    return;
  }

  // if locked, hide hand
  if(!isMulti && state.lockOn){
    els.handHint.textContent = "Hand hidden. Tap Reveal on the lock screen.";
    return;
  }

  if(!selfPlayer){
    els.handHint.textContent = isMulti ? "Join a room to see your hand." : "Waiting for players.";
    return;
  }

  if(state.phase === PHASE.SWAP){
    els.handHint.textContent = isSelfTurn
      ? "Select 0-3 cards to discard, then confirm."
      : "Not your turn.";
  } else if(state.phase === PHASE.TRICK){
    els.handHint.textContent = isSelfTurn
      ? "Select 1 card to play, then confirm."
      : "Not your turn.";
  } else {
    els.handHint.textContent = "Hand ended - deal next hand.";
  }
  // ensure hand visual is shown in player-held order (do not sort)
  const handForRender = isMulti ? (state.selfHand || []).slice() : (selfPlayer.hand || []).slice();

  const playable = (state.phase === PHASE.TRICK && isSelfTurn) ? playableCardIdsForCurrentPlayer() : null;
  const hyper = state.settings.hyperrealistic;
  const actionAllowed = !isMulti || isSelfTurn;

  handForRender.forEach(card=>{
      const btn = document.createElement("div");
      btn.className = "cardBtn " + (isRedSuit(card.suit) ? "red":"");
      btn.dataset.cardId = card.id;
      // highlight trumps in-hand with a subtle gold outline (disabled in hyperrealistic)
      if(!hyper && state.trumpSuit && card.suit === state.trumpSuit){ btn.classList.add('trump'); }
      // animate incoming cards (only once per draw to avoid repeated re-renders)
      if(state.incomingCardIds.has(card.id)){
        if(!state.incomingAnimationPlayed.has(card.id)){
          btn.classList.add('fly-in');
          state.incomingAnimationPlayed.add(card.id);
        }
      }

      const top = `${RANK_LABEL[card.rank] ?? card.rank}${SUIT_ICON[card.suit]}`;
      btn.innerHTML = `<div class="top">${top}</div>
                       <div class="mid">${SUIT_ICON[card.suit]}</div>
                       <div class="bot">${top}</div>`;

      const isDisabled =
        !actionAllowed ||
        (!hyper && state.phase === PHASE.TRICK && playable && !playable.has(card.id)) ||
        (state.phase === PHASE.HAND_END) ||
        (state.phase === PHASE.GAME_OVER);

      if(isDisabled) btn.classList.add("disabled");

      btn.addEventListener("click", ()=>{
        setError(null);
        if(!actionAllowed) return;
        if(state.phase === PHASE.HAND_END || state.phase === PHASE.GAME_OVER) return;
        if(state.phase === PHASE.SWAP){
          // prevent selecting after the player already swapped
          if(selfPlayer && selfPlayer.hasSwapped){ setError("You have already swapped this hand."); return; }
          if(isDisabled) return;
          if(state.selectedForSwap.has(card.id)){
            state.selectedForSwap.delete(card.id);
            btn.classList.remove("selected");
          } else {
            if(state.selectedForSwap.size >= 3){
              setError("Max 3 cards for swap.");
              return;
            }
            state.selectedForSwap.add(card.id);
            btn.classList.add("selected");
          }
          els.selectedCount.textContent = String(state.selectedForSwap.size);
          // visibility/label handled centrally in render()
          return;
        }

        if(state.phase === PHASE.TRICK){
          if(isDisabled) return;
          // single select
          state.selectedCardIds.clear();
          // clear UI selections
          els.handArea.querySelectorAll(".cardBtn.selected").forEach(x=>x.classList.remove("selected"));
          state.selectedCardIds.add(card.id);
          btn.classList.add("selected");
          els.selectedCount.textContent = "1";
          els.confirmPlayBtn.style.display = "inline-block";
        }
      });

      // pre-mark selected for swap
      if(state.phase === PHASE.SWAP && state.selectedForSwap.has(card.id)){
        btn.classList.add("selected");
      }
      if(state.phase === PHASE.TRICK && state.selectedCardIds.has(card.id)){
        btn.classList.add("selected");
      }

      els.handArea.appendChild(btn);
    });

  if(state.phase === PHASE.SWAP){
    els.selectedCount.textContent = actionAllowed ? String(state.selectedForSwap.size) : "0";
    // visibility and label are managed centrally in render(); here only ensure the button isn't disabled incorrectly
    if(actionAllowed && selfPlayer && !selfPlayer.hasSwapped){
      els.confirmSwapBtn.disabled = false; // allow 0-card keep
    }
  }
  if(state.phase === PHASE.TRICK){
    els.selectedCount.textContent = actionAllowed ? String(state.selectedCardIds.size) : "0";
    if(actionAllowed){
      els.confirmPlayBtn.style.display = "inline-block";
    }
    els.confirmPlayBtn.disabled = !actionAllowed || state.playRequestPending;
  }

  // update auto-pass visual in hand header
  if(els.autoPassViz){
    if(isMulti){
      els.autoPassViz.style.display = 'none';
      if(els.passBtn) els.passBtn.style.display = 'none';
      return;
    }
    if(state.autoPassCountdown && state.phase === PHASE.SWAP){
      els.autoPassViz.style.display = 'flex';
      els.autoPassRing.textContent = String(state.autoPassCountdown);
      els.autoPassLabel.style.display = 'block';
      if(els.passBtn) els.passBtn.style.display = 'inline-block';
    } else {
      els.autoPassViz.style.display = 'none';
      if(els.passBtn) els.passBtn.style.display = 'none';
    }
  }
}

function renderHeaderPills(){
  const phaseLabel = state.phase === PHASE.GAME_OVER ? "GAME OVER" : state.phase;
  els.phasePill.textContent = phaseLabel;
  const showPills = state.phase !== PHASE.LOBBY;
  if(els.phasePillWrap) els.phasePillWrap.style.display = showPills ? "inline-flex" : "none";
  if(els.trumpPillWrap) els.trumpPillWrap.style.display = showPills ? "inline-flex" : "none";
  if(els.leadPillWrap) els.leadPillWrap.style.display = showPills ? "inline-flex" : "none";
  if(state.trumpSuit){
    els.trumpPill.textContent = `${SUIT_ICON[state.trumpSuit]} (${cardLabel(state.trumpCard)})`;
    if(isRedSuit(state.trumpSuit)) els.trumpPill.classList.add('red'); else els.trumpPill.classList.remove('red');
  } else {
    els.trumpPill.textContent = "—";
    els.trumpPill.classList.remove('red');
  }
  els.leadPill.textContent = state.currentTrick.leadSuit ? SUIT_ICON[state.currentTrick.leadSuit] : "—";
  if(state.currentTrick.leadSuit){ if(isRedSuit(state.currentTrick.leadSuit)) els.leadPill.classList.add('red'); else els.leadPill.classList.remove('red'); } else { els.leadPill.classList.remove('red'); }
} 

function renderMeta(){
  if(state.players.length){
    els.turnName.textContent = state.players[state.currentTurnIndex]?.name ?? "—";
    els.dealerName.textContent = state.players[state.dealerIndex]?.name ?? "—";
  } else {
    els.turnName.textContent = "—";
    els.dealerName.textContent = "—";
  }
  els.trickNum.textContent = state.phase === PHASE.TRICK ? String(state.trickNumber) : "-";
  // deck count is shown in the deck visualizer; keep header pill clean
  els.deckText.textContent = "";
  if(els.tableChips){
    const overflow = els.tableChips.scrollWidth - els.tableChips.clientWidth;
    els.tableChips.scrollLeft = overflow > 0 ? overflow : 0;
  }
}

function getHandWinnerIndex(){
  if(state.handEndedByFolds && state.foldWinIndex !== null) return state.foldWinIndex;
  if(state.phase !== PHASE.HAND_END) return null;
  let maxTricks = -1;
  let winnerIndex = null;
  let hasTie = false;
  state.players.forEach((player, idx)=>{
    if(player.tricksWonThisHand > maxTricks){
      maxTricks = player.tricksWonThisHand;
      winnerIndex = idx;
      hasTie = false;
    } else if(player.tricksWonThisHand === maxTricks){
      hasTie = true;
    }
  });
  if(winnerIndex === null || hasTie) return null;
  return winnerIndex;
}

function renderStatus(){
  let msg = "—";
  const isMulti = isMultiplayer();
  const isHost = !isMulti || (state.selfUid && state.hostUid && state.selfUid === state.hostUid);
  const selfIndex = isMulti ? state.selfIndex : 0;
  const handWinnerIndex = getHandWinnerIndex();
  const isSelfHandWinner = selfIndex !== null && handWinnerIndex !== null && selfIndex === handWinnerIndex;
  const isSelfDealer = !isMulti || (selfIndex !== null && selfIndex === state.dealerIndex);
  const handEndNotes = [];
  if(state.phase === PHASE.HAND_END){
    if(isSelfHandWinner) handEndNotes.push("You won the hand.");
    if(isSelfDealer) handEndNotes.push("It's your deal.");
  }
  const winnerBanner = document.getElementById('winnerBanner');
  const winnerDetail = document.getElementById('winnerDetail');
  if(winnerBanner){
    if(state.winnerIndex !== null && state.players[state.winnerIndex]){
      winnerBanner.style.display = 'flex';
      const winnerName = state.players[state.winnerIndex].name;
      winnerDetail.textContent = `${winnerName} hit 0 and wins the game.`;
    } else {
      winnerBanner.style.display = 'none';
    }
  }
  // If notifier exists, populate it with richer UI; otherwise fall back to statusText
  const notifier = document.getElementById('notifier');
  const title = document.getElementById('notifierTitle');
  const detail = document.getElementById('notifierDetail');
  const icon = document.getElementById('notifierIcon');
  const playerBadge = document.getElementById('notifierPlayer');
  const actionBtn = document.getElementById('notifierAction');
  if(!notifier){
    // legacy fallback
    if(state.autoPassCountdown && state.autoPassCountdown > 0 && state.phase === PHASE.SWAP){
      msg = `Auto-passing in ${state.autoPassCountdown}s — ${state.players[state.currentTurnIndex]?.name}`;
      els.statusText.textContent = msg;
      return;
    }
    if(state.phase === PHASE.LOBBY) msg = isMulti ? "Sign in and join a room to start." : "Enter names and start the game.";
    if(state.phase === PHASE.SWAP) msg = `Swap turn: ${state.players[state.currentTurnIndex].name}`;
    if(state.phase === PHASE.TRICK) {
      const lead = state.currentTrick.leadSuit ? ` | Lead: ${SUIT_ICON[state.currentTrick.leadSuit]}` : "";
      msg = `Play a card: ${state.players[state.currentTurnIndex].name}${lead}`;
    }
    if(state.phase === PHASE.HAND_END) msg = `Hand over. Dealer is ${state.players[state.dealerIndex].name}. Deal next hand when ready.`;
    if(handEndNotes.length) msg = `${msg} ${handEndNotes.join(" ")}`;
    if(state.phase === PHASE.GAME_OVER) msg = isHost ? "Game over. Start a new game to reset scores." : "Game over. Waiting for host to start a new game.";
    els.statusText.textContent = msg;
    return;
  }

  // show notifier
  notifier.style.display = 'flex';
  title.textContent = '';
  detail.textContent = '';
  playerBadge.style.display = 'none';
  actionBtn.style.display = 'none';

  if(state.phase === PHASE.LOBBY){
    icon.textContent = '♠';
    title.textContent = 'Waiting to start';
    detail.textContent = isMulti ? 'Sign in and join a room to start.' : 'Enter 2–6 player names and start the game.';
  }

  if(state.phase === PHASE.SWAP){
    const name = state.players[state.currentTurnIndex]?.name ?? 'Player';
    icon.textContent = '🔁';
    title.textContent = `Swap — ${name}`;
    detail.textContent = `${name} may discard 0–3 cards, then draw.`;
    playerBadge.style.display = 'inline-flex'; playerBadge.textContent = `${name}'s turn`;
    if(state.autoPassCountdown && state.autoPassCountdown > 0){ detail.textContent += ` — Auto-pass in ${state.autoPassCountdown}s`; }
  }

  if(state.phase === PHASE.TRICK){
    const name = state.players[state.currentTurnIndex]?.name ?? 'Player';
    icon.textContent = '▶️';
    const lead = state.currentTrick.leadSuit ? `${SUIT_ICON[state.currentTrick.leadSuit]}` : '—';
    title.textContent = `Play — ${name}`;
    detail.textContent = `Lead: ${lead} · Select 1 card to play.`;
    playerBadge.style.display = 'inline-flex'; playerBadge.textContent = `${name}'s turn`;
  }

  if(state.phase === PHASE.HAND_END){
    icon.textContent = '🏁';
    title.textContent = 'Hand complete';
    detail.textContent = `Dealer: ${state.players[state.dealerIndex]?.name ?? '—'}. Deal next hand when ready.`;
    if(handEndNotes.length) detail.textContent += ` ${handEndNotes.join(" ")}`;
    // notifications are informational only; actions are handled in the main UI
  }

  if(state.phase === PHASE.GAME_OVER){
    const winnerName = state.players[state.winnerIndex]?.name ?? 'Player';
    icon.textContent = 'WIN';
    title.textContent = `${winnerName} wins`;
    detail.textContent = isHost ? "Start a new game to reset scores." : "Waiting for host to start a new game.";
  }

  // keep legacy status text for compact header summary
  els.statusText.textContent = detail.textContent || '—';
}

// deck visualizer removed

function render(){
  if(state.phase !== PHASE.LOBBY && state.lastPhase === PHASE.LOBBY){
    state.settingsCollapsed = true;
    state.roomCreatedBySelf = false;
  }
  renderHeaderPills();
  renderMeta();
  const isMulti = isMultiplayer();
  const isSelfTurn = !isMulti || state.selfIndex === state.currentTurnIndex;
  const isHost = !isMulti || (state.selfUid && state.hostUid && state.selfUid === state.hostUid);
  const isSelfDealer = !isMulti || (state.selfIndex !== null && state.selfIndex === state.dealerIndex);

  // apply collapsed classes & update collapse button icons
  if(els.gamePanel) els.gamePanel.classList.toggle('collapsed', !!state.collapsed.game);
  if(els.tablePanel) els.tablePanel.classList.toggle('collapsed', !!state.collapsed.table);
  // ensure hand panel defaults to open
  state.collapsed.hand = !!state.collapsed.hand;
  if(els.handPanel) els.handPanel.classList.toggle('collapsed', !!state.collapsed.hand);
  if(els.logCard) els.logCard.classList.toggle('collapsed', !!state.logCollapsed);
  if(els.collapseGameBtn) els.collapseGameBtn.textContent = state.collapsed.game ? '▸' : '▾';
  if(els.collapseTableBtn) els.collapseTableBtn.textContent = state.collapsed.table ? '▸' : '▾';
  if(els.collapseHandBtn) els.collapseHandBtn.textContent = state.collapsed.hand ? '▸' : '▾';

  // update left carets and aria-expanded attributes
  if(els.gameCaret){ els.gameCaret.classList.toggle('collapsed', !!state.collapsed.game); }
  if(els.tableCaret){ els.tableCaret.classList.toggle('collapsed', !!state.collapsed.table); }
  if(els.handCaret){ els.handCaret.classList.toggle('collapsed', !!state.collapsed.hand); }
  if(els.gameHeader){ els.gameHeader.setAttribute('aria-expanded', String(!state.collapsed.game)); }
  if(els.tableHeader){ els.tableHeader.setAttribute('aria-expanded', String(!state.collapsed.table)); }
  if(els.handHeader){ els.handHeader.setAttribute('aria-expanded', String(!state.collapsed.hand)); }
  if(els.logHeader){ els.logHeader.setAttribute('aria-expanded', String(!state.logCollapsed)); }

  // remove rough subtitles from headers (keep headers minimal)
  if(els.gameSummary){ els.gameSummary.textContent = ''; }
  if(els.tableSummary){ els.tableSummary.textContent = ''; }
  if(els.handSummary){ els.handSummary.textContent = ''; }

  if(state.phase === PHASE.LOBBY){
    els.lobbyArea.style.display = "flex";
    els.controlsArea.style.display = "none";
    if(els.startGameBtn){
      els.startGameBtn.disabled = isMulti ? (!isHost || state.players.length < 2) : false;
      els.startGameBtn.style.display = "inline-block";
    }
    updateVoteStartUI();
    renderLobbyPlayers();
  } else {
    els.lobbyArea.style.display = "none";
    els.controlsArea.style.display = "flex";
    if(els.startGameBtn) els.startGameBtn.style.display = "none";
    if(state.phase === PHASE.GAME_OVER){
      updateVoteStartUI();
    } else if(els.voteStartBlock){
      els.voteStartBlock.style.display = "none";
    }
    renderScoreboard();
    // disable deal button while a hand is in progress
    els.startHandBtn.disabled = (state.phase !== PHASE.HAND_END) || (state.players.length < 2) || !isSelfDealer;
    // hide Deal Hands unless it's time to deal
    if(els.startHandBtn){ els.startHandBtn.style.display = (state.phase === PHASE.HAND_END && state.players.length >= 2 && isSelfDealer) ? 'inline-block' : 'none'; }
  }
  if(els.tablePanel){
    els.tablePanel.style.display = (state.phase === PHASE.LOBBY) ? "none" : "block";
  }
  if(els.gameOverActions){
    const showGameOver = state.phase === PHASE.GAME_OVER;
    els.gameOverActions.style.display = showGameOver ? "block" : "none";
    if(els.newGameBtn){
      els.newGameBtn.disabled = !isHost;
      els.newGameBtn.style.display = showGameOver ? "inline-block" : "none";
    }
    if(els.gameOverHint && showGameOver){
      els.gameOverHint.textContent = isHost
        ? "Game over. Start a new game to reset scores."
        : "Game over. Waiting for host to start a new game.";
    }
  }

  // settings: lock after lobby, except hosts can edit at game over
  const canEditSettings = (state.phase === PHASE.LOBBY || state.phase === PHASE.GAME_OVER)
    && (!isMulti || isHost);
  const settingsLocked = !canEditSettings;
  if(els.settingsCard){
    els.settingsCard.classList.toggle('collapsed', !!state.settingsCollapsed);
  }
  if(els.settingsCaret){
    els.settingsCaret.classList.toggle('collapsed', !!state.settingsCollapsed);
  }
  if(els.settingsLockPill){
    els.settingsLockPill.style.display = settingsLocked ? 'inline-flex' : 'none';
  }
  const setDisabled = (el, disabled)=>{ if(el) el.disabled = disabled; };
  setDisabled(els.startingScoreInput, settingsLocked);
  setDisabled(els.foldThresholdInput, settingsLocked);
  setDisabled(els.foldPenaltyThresholdInput, settingsLocked);
  setDisabled(els.foldPenaltyIncreaseInput, settingsLocked);
  setDisabled(els.deckCountInput, settingsLocked);
  setDisabled(els.hyperrealisticInput, settingsLocked);

  // Confirm-swap button: disable once the current player has already confirmed swap (or if not in SWAP)
  if(els.confirmSwapBtn){
    const cur = state.players[state.currentTurnIndex];
    const canSwap = !!(state.phase === PHASE.SWAP && cur && !cur.folded && !cur.hasSwapped && !state.dealing);
    const showSwap = canSwap && (!isMulti || isSelfTurn);
    els.confirmSwapBtn.disabled = !showSwap;
    // hide confirm swap unless actually in swap and current player can swap
    els.confirmSwapBtn.style.display = showSwap ? 'inline-block' : 'none';
    // update label based on number of selected cards when visible
    if(showSwap){
      // simple swap button — always use 'Swap'
      els.confirmSwapBtn.textContent = 'Swap';
    }
  }

  // Fold button: show during SWAP unless already folded; if the player has already swapped, keep it visible but disabled (greyed out)
  if(els.foldBtn){
    const cur = state.players[state.currentTurnIndex];
    const canFold = !!(state.phase === PHASE.SWAP && cur && !cur.folded && state.currentTurnIndex !== state.dealerIndex);
    const showFold = canFold && (!isMulti || isSelfTurn);
    els.foldBtn.style.display = showFold ? 'inline-block' : 'none';
    els.foldBtn.disabled = !showFold || !!(cur && cur.hasSwapped);
  }

  // Pass device button removed; auto-pass handles progression.

  renderTrickArea();
  renderTableHint();
  renderSwapSummary();
  renderHand();
  renderStatus();
  renderRoomLog();
  updateChatPlacement();
  renderConnectionOverlay();
  state.lastPhase = state.phase;

  // keep Game header summary empty; notifier handles status now
  if(els.gameSummary){ els.gameSummary.textContent = ''; }
}

els.startGameBtn.addEventListener("click", ()=>{
  setError(null);
  if(isMultiplayer()){
    startMultiplayerGame();
    return;
  }
  const names = els.namesInput.value
    .split("\n")
    .map(s=>s.trim())
    .filter(Boolean);

  if(names.length < 2 || names.length > 6){
    setError("Enter 2–6 player names (one per line).");
    return;
  }
  initPlayers(names);
  state.phase = PHASE.SWAP; // we'll immediately wait for deal
  state.phase = PHASE.HAND_END; // show controls and let dealer deal
  state.dealerIndex = 0;
  state.currentTurnIndex = 0;
  state.winnerIndex = null;
  state.settingsCollapsed = true;
  setLock(true, 0);
  render();
});

if(els.newGameBtn){
  els.newGameBtn.addEventListener("click", ()=>{
    startNewGame();
  });
}

els.startHandBtn.addEventListener("click", ()=>{
  if(state.players.length < 2) return;
  if(state.phase === PHASE.GAME_OVER){ setError("Game over. Start a new game."); return; }
  if(state.phase !== PHASE.HAND_END){ setError("Can't deal: finish the current hand first."); return; }
  dealHand();
});

els.confirmSwapBtn.addEventListener("click", ()=>{
  if(state.lockOn){ setError("Reveal first."); return; }
  confirmSwap();
});

els.confirmPlayBtn.addEventListener("click", ()=>{
  if(state.lockOn){ setError("Reveal first."); return; }
  playSelectedCard();
});

if(els.passBtn){
  els.passBtn.addEventListener("click", ()=>{
    if(state.phase !== PHASE.SWAP) return;
    if(state.autoPassTimer){ clearInterval(state.autoPassTimer); state.autoPassTimer = null; }
    state.autoPassCountdown = null;
    advanceSwapTurn();
    render();
  });
}

// Pass button removed — auto-pass handles swap progression.

if(els.roomMenuBtn){
  els.roomMenuBtn.addEventListener("click", (e)=>{
    e.preventDefault();
    toggleRoomMenu();
  });
}
if(els.menuResetBtn){
  els.menuResetBtn.addEventListener("click", ()=>{
    closeRoomMenu();
    if(isMultiplayer()){
      resetRoomState();
      return;
    }
    resetAll();
  });
}
if(els.menuResetHandBtn){
  els.menuResetHandBtn.addEventListener("click", ()=>{
    closeRoomMenu();
    resetHandState();
  });
}
if(els.menuBackLobbyBtn){
  els.menuBackLobbyBtn.addEventListener("click", ()=>{
    closeRoomMenu();
    backToLobby();
  });
}
if(els.menuInviteRoomBtn){
  els.menuInviteRoomBtn.addEventListener("click", ()=>{
    closeRoomMenu();
    shareRoomCode();
  });
}
if(els.homeIconBtn){
  els.homeIconBtn.addEventListener("click", ()=>{
    backToLobby();
  });
}
if(els.menuLeaveRoomBtn){
  els.menuLeaveRoomBtn.addEventListener("click", ()=>{
    closeRoomMenu();
    leaveRoomPermanently(state.roomId);
  });
}
if(els.voteStartBtn){
  els.voteStartBtn.addEventListener("click", ()=>{
    voteToStartGame();
  });
}
document.addEventListener("click", (e)=>{
  if(!els.roomMenuWrap || !els.roomMenu) return;
  if(els.roomMenuWrap.contains(e.target)) return;
  closeRoomMenu();
});
document.addEventListener("keydown", (e)=>{
  if(e.key === "Escape") closeRoomMenu();
});

els.revealBtn.addEventListener("click", ()=>{
  if(state.lockOn && state.pendingRevealForIndex !== null && state.phase === PHASE.SWAP){
    const idx = state.pendingRevealForIndex;
    if(state.playersPendingInitial.has(idx)){
      state.playersPendingInitial.delete(idx);
    }
  }

  setLock(false, null);
  render();
});
if(els.settingsHeader){
  const toggleSettings = ()=>{
    state.settingsCollapsed = !state.settingsCollapsed;
    render();
  };
  els.settingsHeader.addEventListener("click", (e)=>{
    e.preventDefault();
    toggleSettings();
  });
  els.settingsHeader.addEventListener("keydown", (e)=>{
    if(e.key === "Enter" || e.key === " "){
      e.preventDefault();
      toggleSettings();
    }
  });
}
if(els.logHeader){
  const toggleLog = ()=>{
    state.logCollapsed = !state.logCollapsed;
    render();
    if(!state.logCollapsed) requestAnimationFrame(()=> scrollLogToBottom());
  };
  els.logHeader.addEventListener("click", (e)=>{
    e.preventDefault();
    toggleLog();
  });
  els.logHeader.addEventListener("keydown", (e)=>{
    if(e.key === "Enter" || e.key === " "){
      e.preventDefault();
      toggleLog();
    }
  });
}
if(els.startingScoreInput){
  els.startingScoreInput.addEventListener("input", ()=>{
    state.settings.startingScore = Number(els.startingScoreInput.value);
    clampSettings();
    if(state.settings.foldThreshold > state.settings.startingScore){
      state.settings.foldThreshold = state.settings.startingScore;
    }
    syncSettingsUI();
    scheduleSettingsSync();
  });
}
if(els.foldThresholdInput){
  els.foldThresholdInput.addEventListener("input", ()=>{
    state.settings.foldThreshold = Number(els.foldThresholdInput.value);
    clampSettings();
    syncSettingsUI();
    scheduleSettingsSync();
  });
}
if(els.foldPenaltyThresholdInput && els.foldPenaltyIncreaseInput){
  const updateFoldPenalty = (value)=>{
    state.settings.foldPenalty = value;
    clampSettings();
    syncSettingsUI();
    scheduleSettingsSync();
  };
  els.foldPenaltyThresholdInput.addEventListener("change", ()=>{
    if(els.foldPenaltyThresholdInput.checked) updateFoldPenalty("threshold");
  });
  els.foldPenaltyIncreaseInput.addEventListener("change", ()=>{
    if(els.foldPenaltyIncreaseInput.checked) updateFoldPenalty("increase");
  });
}
if(els.deckCountInput){
  els.deckCountInput.addEventListener("input", ()=>{
    state.settings.decks = Number(els.deckCountInput.value);
    clampSettings();
    syncSettingsUI();
    scheduleSettingsSync();
  });
}
const nativeConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
};
console.log = (...args)=>{ nativeConsole.log(...args); appendDebugLine("log", args); };
console.info = (...args)=>{ nativeConsole.info(...args); appendDebugLine("info", args); };
console.warn = (...args)=>{ nativeConsole.warn(...args); appendDebugLine("warn", args); };
console.error = (...args)=>{ nativeConsole.error(...args); appendDebugLine("error", args); };

const { updateAuthUI, bindAuthButtons } = createAuthController({
  state,
  els,
  hasFirebase,
  appendConnectionStatus,
  updateNicknameUI,
  updateRoomNameUI,
  updateRoomJoinUI,
  updateChatPlacement,
  updateRoomMenuUI,
  renderRoomList,
  updateRoomLobbyUI,
  hidePwaPrompt,
  firebaseAuth,
  googleProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  setError,
  leaveRoom,
});

if(els.hyperrealisticInput){
  els.hyperrealisticInput.addEventListener("change", ()=>{
    state.settings.hyperrealistic = !!els.hyperrealisticInput.checked;
    syncSettingsUI();
    render();
    scheduleSettingsSync();
  });
}
if(els.menuEnableNotificationsBtn){
  els.menuEnableNotificationsBtn.addEventListener("click", ()=>{
    if(areNotificationsEnabled()) return;
    state.pwaPromptDismissed = false;
    if(isStandalone()){
      if(Notification.permission === "default"){
        showPwaEnablePrompt();
      }
      enableTurnNotifications(true);
      return;
    }
    showPwaInstallPrompt();
  });
}
if(els.headerTapZone){
  let tapCount = 0;
  let tapTimer = null;
  els.headerTapZone.addEventListener("click", ()=>{
    tapCount += 1;
    if(tapTimer) clearTimeout(tapTimer);
    tapTimer = setTimeout(()=>{ tapCount = 0; }, 1200);
    if(tapCount >= 5){
      tapCount = 0;
      toggleDebugLog();
    }
  });
}

if(els.modeHotseatBtn){
  els.modeHotseatBtn.addEventListener("click", ()=> setMode(MODE.HOTSEAT));
}
if(els.modeMultiBtn){
  els.modeMultiBtn.addEventListener("click", ()=> setMode(MODE.MULTI));
}
if(els.roomCodeInput){
  els.roomCodeInput.addEventListener("input", ()=>{
    els.roomCodeInput.value = normalizeRoomCode(els.roomCodeInput.value);
  });
  els.roomCodeInput.addEventListener("keydown", (e)=>{
    if(e.key === "Enter"){
      e.preventDefault();
      if(state.joinRoomActive) joinRoom();
    }
  });
}
if(els.createRoomBtn){
  els.createRoomBtn.addEventListener("click", ()=> createRoom());
}
if(els.joinRoomBtn){
  els.joinRoomBtn.addEventListener("click", ()=>{
    if(state.joinRoomActive){
      joinRoom();
      return;
    }
    state.joinRoomActive = true;
    updateRoomJoinUI();
    if(els.roomCodeInput){
      els.roomCodeInput.value = "";
      els.roomCodeInput.focus();
    }
  });
}
if(els.shareRoomBtn){
  els.shareRoomBtn.addEventListener("click", ()=> shareRoomCode());
}
if(els.playerMenu){
  els.playerMenu.addEventListener("click", (e)=> e.stopPropagation());
}
if(els.playerMenuChangeNameBtn){
  els.playerMenuChangeNameBtn.addEventListener("click", ()=>{
    showPlayerMenuNameEditor();
  });
}
if(els.playerMenuSaveNameBtn){
  els.playerMenuSaveNameBtn.addEventListener("click", async ()=>{
    await savePlayerMenuName();
  });
}
if(els.playerMenuNameInput){
  els.playerMenuNameInput.addEventListener("keydown", (e)=>{
    if(e.key === "Enter"){
      e.preventDefault();
      savePlayerMenuName();
    }
  });
}
if(els.playerMenuKickBtn){
  els.playerMenuKickBtn.addEventListener("click", ()=>{
    if(state.playerMenuTarget) kickPlayerFromRoom(state.playerMenuTarget);
  });
}
if(els.playerMenuMakeHostBtn){
  els.playerMenuMakeHostBtn.addEventListener("click", ()=>{
    if(state.playerMenuTarget) makeHostForPlayer(state.playerMenuTarget);
  });
}
if(els.saveNicknameBtn){
  els.saveNicknameBtn.addEventListener("click", async ()=>{
    await saveNickname();
  });
}
if(els.nicknameInput){
  els.nicknameInput.addEventListener("keydown", (e)=>{
    if(e.key === "Enter"){
      e.preventDefault();
      saveNickname();
    }
  });
}
if(els.saveRoomNameBtn){
  els.saveRoomNameBtn.addEventListener("click", async ()=>{
    await saveRoomName();
  });
}
if(els.roomNameInput){
  els.roomNameInput.addEventListener("input", ()=>{
    state.roomNameDraft = normalizeRoomName(els.roomNameInput.value);
  });
  els.roomNameInput.addEventListener("keydown", (e)=>{
    if(e.key === "Enter"){
      e.preventDefault();
      saveRoomName();
    }
  });
}
if(els.pwaDismissBtn){
  els.pwaDismissBtn.addEventListener("click", ()=>{
    hidePwaPrompt();
    state.pwaPromptDismissed = true;
    if(firebaseDb && state.selfUid){
      setDoc(userRef(state.selfUid), { pwaPromptDismissed: true }, { merge: true })
        .catch((err)=> console.error("Failed to save PWA prompt dismissal:", err));
    }
  });
}
if(els.pwaEnableBtn){
  els.pwaEnableBtn.addEventListener("click", ()=>{
    enableTurnNotifications(true);
  });
}
if(els.chatSendBtn){
  els.chatSendBtn.addEventListener("click", ()=>{ sendChatMessage(); });
}
if(els.chatInput){
  els.chatInput.addEventListener("keydown", (e)=>{
    if(e.key === "Enter"){
      e.preventDefault();
      sendChatMessage();
    }
  });
}
if(els.chatMicBtn){
  const toggleRecording = (e)=>{
    e.preventDefault();
    if(state.chatVoiceRecording){
      stopChatVoiceRecording();
      return;
    }
    state.chatVoicePanelActivated = true;
    updateChatVoiceUI();
    startChatVoiceRecording();
  };
  els.chatMicBtn.addEventListener("click", toggleRecording);
}
if(els.chatVoiceDeleteBtn){
  els.chatVoiceDeleteBtn.addEventListener("click", ()=>{ clearChatVoiceDraft(); });
}
if(els.chatVoiceSendBtn){
  els.chatVoiceSendBtn.addEventListener("click", ()=>{ sendChatVoiceMessage(); });
}
if(els.chatList){
  els.chatList.addEventListener("scroll", ()=>{
    if(isChatNearBottom()){
      if(state.chatHasUnseen){
        state.chatHasUnseen = false;
        updateChatUnreadIndicator();
      }
    }
  });
}
if(els.offlineModeBtn){
  els.offlineModeBtn.addEventListener("click", ()=>{
    state.offlineFallbackEnabled = true;
    setMode(MODE.HOTSEAT);
    renderConnectionOverlay();
  });
}
window.addEventListener("online", ()=>{
  if(!hasFirebase()) return;
  if(!state.isSignedIn) return;
  setConnectionStatus("reconnecting", "Reconnecting to the database.");
  if(state.isSignedIn) startConnectivityMonitor();
});
window.addEventListener("offline", ()=>{
  if(!hasFirebase()) return;
  if(!state.isSignedIn) return;
  setConnectionStatus("reconnecting", "Offline. Waiting to reconnect.");
});
document.addEventListener("visibilitychange", ()=>{
  if(document.visibilityState === "visible"){
    if(state.isSignedIn){
      maybeRestorePushNotifications();
    } else if(supportsPush()){
      registerServiceWorker();
    }
  }
});
document.addEventListener("click", ()=> closePlayerMenu());
document.addEventListener("keydown", (e)=>{
  if(e.key === "Escape") closePlayerMenu();
});
window.addEventListener("resize", ()=> closePlayerMenu());
bindAuthButtons();

if(firebaseAuth){
  onAuthStateChanged(firebaseAuth, async (user)=>{
    state.isSignedIn = !!user;
    state.selfUid = user ? user.uid : null;
    state.selfName = user ? (user.displayName || (user.email ? user.email.split("@")[0] : "Player")) : null;
    state.selfNickname = null;
    state.roomNicknames = {};
    state.lastRoomId = null;
    state.roomName = null;
    state.roomNameDraft = "";
    state.roomSynced = false;
    state.handSynced = false;
    state.roomResyncing = false;
    state.handResyncing = false;
    state.hasMadeFirstMove = false;
    state.pwaPromptDismissed = false;
    state.pushToken = null;
    state.swRegistration = null;
    if(state.unsubConnectivity){ state.unsubConnectivity(); state.unsubConnectivity = null; }
    if(state.reconnectTimer){ clearInterval(state.reconnectTimer); state.reconnectTimer = null; }
    setConnectionStatus("unknown", "");
    state.roomIds = [];
    state.roomList = {};
    clearRoomListSubscriptions();
    state.profileLoaded = false;
    updateAuthUI();
    if(!user){
      leaveRoom();
      return;
    }
    await loadUserProfile();
    updateAuthUI();
    initMessagingListeners();
    maybeRestorePushNotifications();
    maybePromptNotificationPermissionOnPwa();
    startConnectivityMonitor();
    if(state.mode === MODE.MULTI){
      await maybeAutoJoinRoom();
    }
  });
}

resetAll();
updateModeUI();
updateAuthUI();
updateRoomStatus();
if(supportsPush()) registerServiceWorker();
initMessagingListeners();
