// Minimal service worker so the app can be installed on the phone's home screen.
// Data is always live from the server, so requests go straight to the network.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
