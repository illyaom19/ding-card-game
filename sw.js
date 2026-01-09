if(typeof self.window === "undefined"){
  self.window = self;
}
importScripts("https://www.gstatic.com/firebasejs/10.12.4/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.4/firebase-messaging-compat.js");
importScripts("./firebase-config.js");

self.addEventListener("install", ()=>{
  self.skipWaiting();
});
self.addEventListener("activate", (event)=>{
  event.waitUntil(self.clients.claim());
});
self.addEventListener("message", (event)=>{
  if(event.data && event.data.type === "SKIP_WAITING"){
    self.skipWaiting();
  }
});

if(self.FIREBASE_CONFIG && self.firebase){
  firebase.initializeApp(self.FIREBASE_CONFIG);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload)=>{
    const data = payload && payload.data ? payload.data : {};
    const roomName = data.roomName || "your lobby";
    const title = (payload && payload.notification && payload.notification.title) || "DING Online";
    const body = (payload && payload.notification && payload.notification.body)
      || `DING Online - It's your turn in ${roomName}`;
    const options = {
      body,
      tag: data.roomId ? `ding-turn-${data.roomId}` : "ding-turn",
      data: { roomId: data.roomId || "" },
      icon: "icon.svg",
      badge: "icon.svg",
    };
    self.registration.showNotification(title, options);
  });
}

self.addEventListener("notificationclick", (event)=>{
  event.notification.close();
  const roomId = event.notification && event.notification.data && event.notification.data.roomId;
  const base = (self.registration && self.registration.scope) ? self.registration.scope : "/";
  const targetUrl = roomId ? `${base}#${roomId}` : base;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList)=>{
      for(const client of clientList){
        if("focus" in client){
          client.focus();
          if("navigate" in client) client.navigate(targetUrl);
          return;
        }
      }
      if(clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
