/**
 * Room helpers for codes, labels, and share links.
 */
const MAX_ROOM_NAME_LENGTH = 32;

export function normalizeRoomCode(code){
  return (code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

export function normalizeRoomName(name){
  return (name || "").trim().replace(/\s+/g, " ").slice(0, MAX_ROOM_NAME_LENGTH);
}

export function getRoomDisplayName(name){
  return normalizeRoomName(name) || "Player's Lobby";
}

export function getNameInitial(name){
  const clean = (name || "").trim();
  if(!clean) return "?";
  const parts = clean.split(/\s+/).filter(Boolean);
  if(parts.length <= 1) return clean[0].toUpperCase();
  return parts.map((part) => part[0]).join("").toUpperCase();
}

export function getDefaultRoomName(selfName = ""){
  const raw = (selfName || "").trim();
  const first = raw ? raw.split(/\s+/)[0] : "Player";
  return normalizeRoomName(`${first}'s Lobby`) || "Player's Lobby";
}

export function makeRoomCode(){
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for(let i = 0; i < 6; i += 1){
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function roomShareLink(code){
  const roomCode = normalizeRoomCode(code);
  if(!roomCode) return "";
  return `${location.origin}${location.pathname}#${roomCode}`;
}
