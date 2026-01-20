import { createRoot } from "react-dom/client";
import "./lib/i18n";
import { initializeCapacitor, isNative } from "./lib/capacitor";
import App from "./App";
import "./index.css";

// Register Service Worker (only for web, not native apps)
if (!isNative && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(registration => {
      console.log('SW registered: ', registration);
    }).catch(registrationError => {
      console.log('SW registration failed: ', registrationError);
    });
  });
}

// PWA Install Logic (only for web)
if (!isNative) {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later.
    (window as any).deferredPrompt = e;
  });
}

// Initialize Capacitor for native apps
initializeCapacitor();

createRoot(document.getElementById("root")!).render(<App />);
