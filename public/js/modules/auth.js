/**
 * Authentication helpers for sign-in UI and Firebase auth button wiring.
 */
export function createAuthController({
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
}){
  function updateAuthUI(){
    if(els.authStatus){
      if(state.isSignedIn){
        els.authStatus.textContent = `Signed in as ${state.selfName || "Player"}.`;
      } else {
        els.authStatus.textContent = "Not signed in.";
      }
    }
    if(els.signInBtn) els.signInBtn.style.display = state.isSignedIn ? "none" : "inline-block";
    if(els.signOutBtn) els.signOutBtn.style.display = state.isSignedIn ? "inline-block" : "none";
    if(els.shareRoomBtn) els.shareRoomBtn.disabled = !state.roomId;
    if(els.headerGreeting){
      if(state.isSignedIn && state.selfName){
        els.headerGreeting.textContent = "";
        els.headerGreeting.appendChild(document.createTextNode(`Hi ${state.selfName} - welcome back!`));
        if(hasFirebase()){
          els.headerGreeting.appendChild(document.createElement("br"));
          els.headerGreeting.appendChild(document.createTextNode("Connection status: "));
          appendConnectionStatus(els.headerGreeting);
        }
        els.headerGreeting.style.display = "block";
      } else if(state.isSignedIn){
        els.headerGreeting.textContent = "";
        els.headerGreeting.appendChild(document.createTextNode("Hi there - welcome back!"));
        if(hasFirebase()){
          els.headerGreeting.appendChild(document.createElement("br"));
          els.headerGreeting.appendChild(document.createTextNode("Connection status: "));
          appendConnectionStatus(els.headerGreeting);
        }
        els.headerGreeting.style.display = "block";
      } else {
        els.headerGreeting.textContent = "";
        els.headerGreeting.style.display = "none";
      }
    }
    updateNicknameUI();
    updateRoomNameUI();
    updateRoomJoinUI();
    updateChatPlacement();
    updateRoomMenuUI();
    renderRoomList();
    updateRoomLobbyUI();
    if(!state.isSignedIn) hidePwaPrompt();
  }

  function bindAuthButtons(){
    if(els.signInBtn){
      els.signInBtn.addEventListener("click", async ()=>{
        if(!firebaseAuth || !googleProvider){
          setError("Firebase not configured.");
          return;
        }
        try{
          await signInWithPopup(firebaseAuth, googleProvider);
        } catch (err){
          if(err && err.code === "auth/popup-blocked"){
            await signInWithRedirect(firebaseAuth, googleProvider);
            return;
          }
          console.error("Sign-in failed:", err);
          setError("Sign-in failed.");
        }
      });
    }
    if(els.signOutBtn){
      els.signOutBtn.addEventListener("click", async ()=>{
        if(!firebaseAuth) return;
        try{
          await signOut(firebaseAuth);
        } finally {
          leaveRoom();
          updateAuthUI();
        }
      });
    }
  }

  return { updateAuthUI, bindAuthButtons };
}
