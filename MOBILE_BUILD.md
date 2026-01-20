# KLK! Chat - Mobile App Build Guide

This guide explains how to build native Android and iOS apps from the KLK! Chat web application using Capacitor.

## Prerequisites

### For Android
- Android Studio (latest version)
- Android SDK with API level 24 or higher
- Java JDK 17+

### For iOS
- macOS with Xcode 15+
- CocoaPods (`sudo gem install cocoapods`)
- Apple Developer account for distribution

## Initial Setup

### 1. Build the web app for production

```bash
npm run build
```

This creates the production build in `dist/public/`.

### 2. Initialize Capacitor platforms

```bash
# Add Android platform
npx cap add android

# Add iOS platform (macOS only)
npx cap add ios
```

### 3. Sync web assets to native projects

```bash
npx cap sync
```

## Configuration

### Environment Variables

Before building, set the production API URL in `capacitor.config.ts`:

```typescript
server: {
  url: 'https://klk.fourone.com.do',  // Your production API
  cleartext: false,
  androidScheme: 'https',
}
```

### App Icons and Splash Screens

Place your app icons in:
- **Android**: `android/app/src/main/res/mipmap-*`
- **iOS**: `ios/App/App/Assets.xcassets/AppIcon.appiconset`

Splash screen images:
- **Android**: `android/app/src/main/res/drawable/splash.png`
- **iOS**: `ios/App/App/Assets.xcassets/Splash.imageset`

## Building for Android

### Development Build

```bash
# Open in Android Studio
npx cap open android
```

Then in Android Studio:
1. Wait for Gradle sync to complete
2. Click "Run" or press Shift+F10
3. Select a device or emulator

### Production Build (APK/AAB)

```bash
cd android
./gradlew assembleRelease      # For APK
./gradlew bundleRelease        # For AAB (Play Store)
```

The APK will be at: `android/app/build/outputs/apk/release/app-release.apk`
The AAB will be at: `android/app/build/outputs/bundle/release/app-release.aab`

### Signing Configuration

Edit `android/app/build.gradle` to add signing config:

```groovy
android {
    signingConfigs {
        release {
            storeFile file("path/to/keystore.jks")
            storePassword "your_store_password"
            keyAlias "your_key_alias"
            keyPassword "your_key_password"
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
```

## Building for iOS

### Development Build

```bash
# Open in Xcode
npx cap open ios
```

Then in Xcode:
1. Select your development team in Signing & Capabilities
2. Select a simulator or device
3. Click "Run" or press Cmd+R

### Production Build

1. In Xcode, select "Any iOS Device" as the target
2. Go to Product > Archive
3. Once archived, click "Distribute App"
4. Choose "App Store Connect" for distribution

## Push Notifications Setup

### Firebase Cloud Messaging (Android)

1. Create a Firebase project at https://console.firebase.google.com
2. Add Android app with package name `com.fourone.klk`
3. Download `google-services.json` and place in `android/app/`
4. The Capacitor Push Notifications plugin will handle registration

### Apple Push Notification Service (iOS)

1. Enable Push Notifications in Apple Developer Portal
2. Create an APNs key or certificate
3. Configure in Xcode Signing & Capabilities
4. Enable "Push Notifications" capability

## Deep Linking

The app supports deep links for:
- Opening specific conversations: `klk://chat/{conversationId}`
- Handling push notification taps

Configure deep links in:
- **Android**: `android/app/src/main/AndroidManifest.xml`
- **iOS**: `ios/App/App/Info.plist`

## Updating the App

After making changes to the web app:

```bash
npm run build
npx cap sync
```

For live reload during development:

```bash
npx cap run android --livereload --external
npx cap run ios --livereload --external
```

## Troubleshooting

### Build Issues

1. **Gradle sync failed**: Run `./gradlew clean` in the android directory
2. **CocoaPods issues**: Run `pod install --repo-update` in ios/App
3. **WebView not loading**: Check CORS configuration on the server

### Runtime Issues

1. **Push notifications not working**: Verify FCM/APNs configuration
2. **API calls failing**: Check allowed origins in server CORS config
3. **Session not persisting**: Ensure cookies are configured for mobile origins

## Production Checklist

- [ ] Update `capacitor.config.ts` with production API URL
- [ ] Configure app signing for release builds
- [ ] Set up push notification services (FCM/APNs)
- [ ] Test on real devices before publishing
- [ ] Create app store listings (screenshots, descriptions)
- [ ] Configure privacy policies and terms of service

## Allowed Origins

The server is configured to accept requests from:
- https://klk.fourone.com.do
- https://fourone.com.do
- https://captain.gruard.com.do
- https://gruard.com
- https://app.gruard.com
- capacitor://localhost (mobile apps)
- ionic://localhost (mobile apps)
