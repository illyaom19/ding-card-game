/**
 * UI animation helpers for card movements, swap announcements, and popups.
 */
const POPUP_MIN_MS = 3000;
const POPUP_IN_MS = 380;
const POPUP_OUT_MS = 450;

export function createAnimationController({ state, els, render }){
  function animateFoldOut(){
    if(!els.handArea) return;
    const nodes = Array.from(els.handArea.querySelectorAll(".cardBtn"));
    if(!nodes.length) return;
    nodes.forEach((node, idx)=>{
      const rect = node.getBoundingClientRect();
      const clone = node.cloneNode(true);
      clone.classList.add("foldFly");
      clone.style.left = `${rect.left}px`;
      clone.style.top = `${rect.top}px`;
      clone.style.width = `${rect.width}px`;
      clone.style.height = `${rect.height}px`;
      const spread = 120 + Math.random() * 140;
      const x = (Math.random() * spread * 2) - spread;
      const y = 120 + Math.random() * 180;
      const rot = (Math.random() * 70) - 35;
      clone.style.setProperty("--fold-x", `${x}px`);
      clone.style.setProperty("--fold-y", `${y}px`);
      clone.style.setProperty("--fold-rot", `${rot}deg`);
      clone.style.animationDelay = `${idx * 40}ms`;
      document.body.appendChild(clone);
      setTimeout(()=> clone.remove(), 720);
    });
  }

  function clearIncomingTimers(){
    if(!state.incomingTimers || !state.incomingTimers.length) return;
    state.incomingTimers.forEach((timer)=> clearTimeout(timer));
    state.incomingTimers = [];
  }

  function resetIncomingAnimationState(){
    state.incomingCardIds.clear();
    state.incomingAnimationPlayed.clear();
  }

  function queueIncomingCards(cards, { stagger = 140, duration = 520 } = {}){
    if(!Array.isArray(cards) || !cards.length) return;
    clearIncomingTimers();
    resetIncomingAnimationState();
    cards.forEach((card, idx)=>{
      const startAt = idx * stagger;
      const addTimer = setTimeout(()=>{
        state.incomingAnimationPlayed.delete(card.id);
        state.incomingCardIds.add(card.id);
        render();
      }, startAt);
      const removeTimer = setTimeout(()=>{
        state.incomingCardIds.delete(card.id);
        state.incomingAnimationPlayed.delete(card.id);
        render();
      }, startAt + duration);
      state.incomingTimers.push(addTimer, removeTimer);
    });
  }

  function markDealFade(){
    if(!state.handId) return;
    if(state.lastDealtHandId === state.handId) return;
    state.dealFadePending = true;
    state.lastDealtHandId = state.handId;
  }

  function clearSwapAnnouncementTimers(){
    if(state.swapAnnouncementTimer){
      clearTimeout(state.swapAnnouncementTimer);
      state.swapAnnouncementTimer = null;
    }
    if(state.swapAnnouncementHideTimer){
      clearTimeout(state.swapAnnouncementHideTimer);
      state.swapAnnouncementHideTimer = null;
    }
    if(els.swapAnnouncement){
      els.swapAnnouncement.classList.remove("show", "exit");
      els.swapAnnouncement.style.display = "none";
    }
  }

  function showSwapAnnouncement(playerName, count){
    if(!els.swapAnnouncement || !els.swapAnnouncementText || !els.swapAnnouncementCards) return;
    clearSwapAnnouncementTimers();
    const safeCount = Math.max(0, Number(count) || 0);
    els.swapAnnouncementCards.innerHTML = "";
    for(let i = 0; i < safeCount; i += 1){
      const card = document.createElement("div");
      card.className = "swapGhostCard";
      const spread = 70 + Math.random() * 70;
      const x = (Math.random() * spread * 2) - spread;
      const y = -90 - Math.random() * 80;
      const rot = (Math.random() * 60) - 30;
      card.style.setProperty("--ghost-x", `${x}px`);
      card.style.setProperty("--ghost-y", `${y}px`);
      card.style.setProperty("--ghost-rot", `${rot}deg`);
      card.style.animationDelay = `${i * 90}ms`;
      els.swapAnnouncementCards.appendChild(card);
    }
    const label = safeCount
      ? `${playerName} swapped ${safeCount} card${safeCount === 1 ? "" : "s"}`
      : `${playerName} didn't swap any cards`;
    els.swapAnnouncementText.textContent = label;
    els.swapAnnouncement.style.display = "flex";
    els.swapAnnouncement.classList.remove("exit");
    els.swapAnnouncement.classList.add("show");
    state.swapAnnouncementTimer = setTimeout(()=>{
      els.swapAnnouncement.classList.add("exit");
      state.swapAnnouncementHideTimer = setTimeout(()=>{
        els.swapAnnouncement.classList.remove("show", "exit");
        els.swapAnnouncement.style.display = "none";
      }, 420);
    }, 2400);
  }

  function clearPopupTimers(){
    if(state.popupTimer){ clearTimeout(state.popupTimer); state.popupTimer = null; }
    if(state.popupDismissTimer){ clearTimeout(state.popupDismissTimer); state.popupDismissTimer = null; }
    if(state.popupHideTimer){ clearTimeout(state.popupHideTimer); state.popupHideTimer = null; }
  }

  function spawnConfetti(){
    if(!els.confetti) return;
    els.confetti.innerHTML = "";
    const colors = ["#8f7cff", "#67e69f", "#ffdf8c", "#5cc8ff", "#ff7ca1"];
    const count = 28;
    for(let i = 0; i < count; i += 1){
      const piece = document.createElement("span");
      piece.className = "confettiPiece";
      const size = 6 + Math.random() * 6;
      piece.style.width = `${size}px`;
      piece.style.height = `${Math.round(size * 1.6)}px`;
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.top = `${-20 - Math.random() * 20}%`;
      piece.style.setProperty("--confetti-color", colors[i % colors.length]);
      piece.style.setProperty("--confetti-duration", `${2.6 + Math.random() * 1.6}s`);
      piece.style.setProperty("--confetti-delay", `${Math.random() * 0.25}s`);
      piece.style.setProperty("--confetti-rot", `${180 + Math.random() * 360}deg`);
      els.confetti.appendChild(piece);
    }
  }

  function hideFullscreenPopup(){
    if(!els.fullscreenPopup) return;
    if(!els.fullscreenPopup.classList.contains("show")) return;
    clearPopupTimers();
    state.popupDismissible = false;
    els.fullscreenPopup.classList.add("hiding");
    els.fullscreenPopup.classList.remove("show");
    state.popupHideTimer = setTimeout(()=>{
      els.fullscreenPopup.classList.remove("hiding", "confettiOn");
      if(els.confetti) els.confetti.innerHTML = "";
    }, POPUP_OUT_MS);
  }

  function showFullscreenPopup({ title, subtitle = "", tone = "", confetti = false, minDuration = POPUP_MIN_MS }){
    if(!els.fullscreenPopup || !els.popupTitle || !els.popupCard) return;
    clearPopupTimers();
    state.popupDismissible = false;
    els.popupTitle.textContent = title;
    if(els.popupSubtitle){
      els.popupSubtitle.textContent = subtitle;
      els.popupSubtitle.style.display = subtitle ? "block" : "none";
    }
    els.popupCard.classList.remove("danger", "good");
    if(tone) els.popupCard.classList.add(tone);
    els.fullscreenPopup.classList.remove("show", "hiding", "confettiOn");
    if(confetti){
      els.fullscreenPopup.classList.add("confettiOn");
      spawnConfetti();
    } else if(els.confetti){
      els.confetti.innerHTML = "";
    }
    void els.fullscreenPopup.offsetWidth;
    els.fullscreenPopup.classList.add("show");
    state.popupDismissTimer = setTimeout(()=>{
      state.popupDismissible = true;
    }, POPUP_IN_MS);
    state.popupTimer = setTimeout(()=>{
      hideFullscreenPopup();
    }, Math.max(minDuration, POPUP_MIN_MS));
  }

  function triggerPopupOnce(key, options){
    if(!key || state.lastPopupKey === key) return;
    state.lastPopupKey = key;
    showFullscreenPopup(options);
  }

  return {
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
  };
}
