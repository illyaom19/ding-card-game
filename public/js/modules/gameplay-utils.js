/**
 * Gameplay utilities for deck construction and card rules.
 */
export const SUITS = ["C", "D", "H", "S"];
export const SUIT_ICON = { C: "♣", D: "♦", H: "♥", S: "♠" };
export const RANK_LABEL = { 11: "J", 12: "Q", 13: "K", 14: "A" };

const rankValue = (card) => card.rank;

export function makeDecks(count){
  const deck = [];
  for(let d = 0; d < count; d += 1){
    for(const suit of SUITS){
      for(let rank = 2; rank <= 14; rank += 1){
        deck.push({ suit, rank, id: `${rank}${suit}_${d}` });
      }
    }
  }
  return deck;
}

export function makeDeck(){
  return makeDecks(1);
}

export function shuffle(arr){
  for(let i = arr.length - 1; i > 0; i -= 1){
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function cardLabel(card){
  const label = RANK_LABEL[card.rank] ?? String(card.rank);
  return `${label}${SUIT_ICON[card.suit]}`;
}

export function isRedSuit(suit){
  return suit === "H" || suit === "D";
}

export function canFollowSuit(hand, suit){
  return hand.some((card) => card.suit === suit);
}

export function determineTrickWinner(plays, leadSuit, trumpSuit){
  const trumps = plays.filter((play) => play.card.suit === trumpSuit);
  const candidates = trumps.length ? trumps : plays.filter((play) => play.card.suit === leadSuit);
  let best = candidates[0];
  for(const play of candidates){
    if(rankValue(play.card) > rankValue(best.card)) best = play;
  }
  return best.playerIndex;
}

export function checkFastTrackWin({ winnerIdx, state, endHand }){
  const winner = state.players[winnerIdx];
  if(!winner || typeof winner.score !== "number") return false;
  const projectedScore = winner.score - winner.tricksWonThisHand;
  if(projectedScore <= 0){
    endHand();
    return true;
  }
  return false;
}
