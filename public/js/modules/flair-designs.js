export const FLAIR_STYLES = [
  { id: "none", label: "None", className: "" },
  { id: "surprise", label: "Classic (Surprise)", className: "flair-surprise" },
  { id: "gold", label: "Gold Sparkle", className: "flair-gold" },
  { id: "fire", label: "Fire", className: "flair-fire" },
  { id: "hearts", label: "Hearts", className: "flair-hearts" },
  { id: "laser", label: "Laser Fight", className: "flair-laser" },
  { id: "nuke", label: "Nuke", className: "flair-nuke" },
  { id: "bubbles", label: "Bubbles", className: "flair-bubbles" },
  { id: "glitch", label: "Glitch", className: "flair-glitch" },
  { id: "quake", label: "Earthquake", className: "flair-quake" },
  { id: "flowers", label: "Flowers", className: "flair-flowers" },
  { id: "burnout", label: "Burnout", className: "flair-burnout" },
  { id: "strobe", label: "Strobe Lights", className: "flair-strobe" },
  { id: "subwoofer", label: "Subwoofer", className: "flair-subwoofer" },
  { id: "speed", label: "Speed Lines", className: "flair-speed" },
  { id: "mini", label: "Mini", className: "flair-mini" },
  { id: "smoke", label: "Smoke", className: "flair-smoke" },
];

const flairById = new Map(FLAIR_STYLES.map((style)=> [style.id, style]));

export const FLAIR_CLASS_LIST = FLAIR_STYLES
  .map((style)=> style.className)
  .filter(Boolean);

export function getFlairById(id){
  return flairById.get(id) || FLAIR_STYLES[0];
}

export function normalizeFlairId(id){
  return flairById.has(id) ? id : "none";
}

export function getFlairIndexById(id){
  const normalized = normalizeFlairId(id);
  return Math.max(0, FLAIR_STYLES.findIndex((style)=> style.id === normalized));
}
