// Service worker — Burkina Ambiance
// Stratégie simple : "network first, fallback cache" pour la page principale
// (pour toujours avoir la dernière version si le réseau est là), et
// "cache first" pour les ressources statiques (icônes, manifest).
// Firestore et les CDN externes (React, Firebase, jsPDF) gèrent leur propre
// cache réseau et ne sont pas interceptés ici.

const CACHE_NAME = "burkina-ambiance-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        APP_SHELL.map((url) =>
          cache.add(url).catch(() => {
            // Ignore silencieusement les fichiers absents (ex: icon-512.png
            // pas encore ajouté) pour ne pas bloquer l'installation.
          })
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((noms) =>
      Promise.all(
        noms
          .filter((nom) => nom !== CACHE_NAME)
          .map((nom) => caches.delete(nom))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // On ne touche qu'aux requêtes GET same-origin (donc jamais Firestore/CDN).
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  const estPageHTML = request.mode === "navigate" || request.destination === "document";

  if (estPageHTML) {
    // Network first : si en ligne, on prend toujours la dernière version de l'app.
    event.respondWith(
      fetch(request)
        .then((reponse) => {
          const copie = reponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copie));
          return reponse;
        })
        .catch(() =>
          caches.match(request).then((reponse) => reponse || caches.match("./index.html"))
        )
    );
    return;
  }

  // Cache first pour le reste (icônes, manifest, etc.)
  event.respondWith(
    caches.match(request).then((reponse) => {
      if (reponse) return reponse;
      return fetch(request)
        .then((fresh) => {
          const copie = fresh.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copie));
          return fresh;
        })
        .catch(() => reponse);
    })
  );
});
