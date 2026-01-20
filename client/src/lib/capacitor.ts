import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { PushNotifications } from '@capacitor/push-notifications';
import { Preferences } from '@capacitor/preferences';

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform();

export async function initializeCapacitor() {
  if (!isNative) return;

  try {
    // Hide splash screen after app is ready
    await SplashScreen.hide();

    // Configure status bar for dark theme
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#000000' });

    // Handle app state changes for WebSocket reconnection
    App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        // App came to foreground - reconnect WebSocket if needed
        window.dispatchEvent(new CustomEvent('app-foreground'));
      } else {
        // App went to background
        window.dispatchEvent(new CustomEvent('app-background'));
      }
    });

    // Handle deep links
    App.addListener('appUrlOpen', ({ url }) => {
      console.log('Deep link opened:', url);
      // Handle deep links here
    });

    // Initialize push notifications
    await initializePushNotifications();

  } catch (error) {
    console.error('Error initializing Capacitor:', error);
  }
}

async function initializePushNotifications() {
  if (!isNative) return;

  try {
    // Request permission
    const permStatus = await PushNotifications.requestPermissions();
    
    if (permStatus.receive === 'granted') {
      // Register with FCM/APNs
      await PushNotifications.register();
    }

    // Listen for registration token
    PushNotifications.addListener('registration', (token) => {
      console.log('Push registration token:', token.value);
      // Send token to server for push notifications
      sendPushTokenToServer(token.value);
    });

    // Listen for registration errors
    PushNotifications.addListener('registrationError', (error) => {
      console.error('Push registration error:', error);
    });

    // Listen for push notifications received
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('Push notification received:', notification);
      // Handle foreground notification
    });

    // Listen for push notification action
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('Push notification action:', action);
      // Handle notification tap - navigate to conversation
      const conversationId = action.notification.data?.conversationId;
      if (conversationId) {
        window.location.href = `/chat/${conversationId}`;
      }
    });

  } catch (error) {
    console.error('Error initializing push notifications:', error);
  }
}

async function sendPushTokenToServer(token: string) {
  try {
    await fetch('/api/push/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token, platform }),
    });
  } catch (error) {
    console.error('Error sending push token to server:', error);
  }
}

// Secure storage utilities for native apps
export async function secureSet(key: string, value: string) {
  if (isNative) {
    await Preferences.set({ key, value });
  } else {
    localStorage.setItem(key, value);
  }
}

export async function secureGet(key: string): Promise<string | null> {
  if (isNative) {
    const { value } = await Preferences.get({ key });
    return value;
  }
  return localStorage.getItem(key);
}

export async function secureRemove(key: string) {
  if (isNative) {
    await Preferences.remove({ key });
  } else {
    localStorage.removeItem(key);
  }
}
