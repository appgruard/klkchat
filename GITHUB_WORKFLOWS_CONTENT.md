# GitHub Workflows - Copiar manualmente a GitHub

Debido a restricciones de OAuth, estos workflows deben crearse directamente en GitHub.

## Instrucciones

1. Ve a https://github.com/appgruard/klkchat
2. Click en "Add file" > "Create new file"
3. Copia el nombre del archivo y su contenido

---

## Archivo 1: `.github/workflows/build-android.yml`

```yaml
name: Build Android

on:
  push:
    branches: [main, master]
    paths-ignore:
      - '**.md'
      - 'docs/**'
  pull_request:
    branches: [main, master]
  workflow_dispatch:
    inputs:
      build_type:
        description: 'Build type (apk or bundle)'
        required: true
        default: 'bundle'
        type: choice
        options:
          - apk
          - bundle

env:
  NODE_VERSION: '20'
  JAVA_VERSION: '17'

jobs:
  build:
    name: Build Android App
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Java
        uses: actions/setup-java@v4
        with:
          distribution: 'zulu'
          java-version: ${{ env.JAVA_VERSION }}
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build web app
        run: npm run build
      
      - name: Add Android platform if not exists
        run: |
          if [ ! -d "android" ]; then
            npx cap add android
          fi
      
      - name: Sync Capacitor
        run: npx cap sync android
      
      - name: Make gradlew executable
        run: chmod +x android/gradlew
      
      - name: Decode keystore
        if: github.event_name != 'pull_request' && secrets.RELEASE_KEYSTORE != ''
        env:
          RELEASE_KEYSTORE: ${{ secrets.RELEASE_KEYSTORE }}
        run: |
          echo "$RELEASE_KEYSTORE" | base64 -d > android/app/release.jks
      
      - name: Build Android APK (Debug)
        if: github.event_name == 'pull_request'
        run: |
          cd android
          ./gradlew assembleDebug
      
      - name: Build Android Release (Unsigned)
        if: github.event_name != 'pull_request' && secrets.RELEASE_KEYSTORE == ''
        run: |
          cd android
          BUILD_TYPE="${{ github.event.inputs.build_type || 'bundle' }}"
          if [ "$BUILD_TYPE" = "apk" ]; then
            ./gradlew assembleRelease
          else
            ./gradlew bundleRelease
          fi
      
      - name: Build Android Release (Signed)
        if: github.event_name != 'pull_request' && secrets.RELEASE_KEYSTORE != ''
        run: |
          cd android
          BUILD_TYPE="${{ github.event.inputs.build_type || 'bundle' }}"
          if [ "$BUILD_TYPE" = "apk" ]; then
            ./gradlew assembleRelease \
              -Pandroid.injected.signing.store.file=$PWD/app/release.jks \
              -Pandroid.injected.signing.store.password="${{ secrets.RELEASE_KEYSTORE_PASSWORD }}" \
              -Pandroid.injected.signing.key.alias="${{ secrets.KEYSTORE_KEY_ALIAS }}" \
              -Pandroid.injected.signing.key.password="${{ secrets.KEYSTORE_KEY_PASSWORD }}"
          else
            ./gradlew bundleRelease \
              -Pandroid.injected.signing.store.file=$PWD/app/release.jks \
              -Pandroid.injected.signing.store.password="${{ secrets.RELEASE_KEYSTORE_PASSWORD }}" \
              -Pandroid.injected.signing.key.alias="${{ secrets.KEYSTORE_KEY_ALIAS }}" \
              -Pandroid.injected.signing.key.password="${{ secrets.KEYSTORE_KEY_PASSWORD }}"
          fi
      
      - name: Upload Debug APK
        if: github.event_name == 'pull_request'
        uses: actions/upload-artifact@v4
        with:
          name: app-debug.apk
          path: android/app/build/outputs/apk/debug/app-debug.apk
          retention-days: 7
      
      - name: Upload Release APK
        if: github.event_name != 'pull_request' && github.event.inputs.build_type == 'apk'
        uses: actions/upload-artifact@v4
        with:
          name: app-release.apk
          path: android/app/build/outputs/apk/release/app-release*.apk
          retention-days: 30
      
      - name: Upload Release AAB
        if: github.event_name != 'pull_request' && github.event.inputs.build_type != 'apk'
        uses: actions/upload-artifact@v4
        with:
          name: app-release.aab
          path: android/app/build/outputs/bundle/release/app-release.aab
          retention-days: 30
```

---

## Archivo 2: `.github/workflows/build-ios.yml`

```yaml
name: Build iOS

on:
  push:
    branches: [main, master]
    paths-ignore:
      - '**.md'
      - 'docs/**'
  pull_request:
    branches: [main, master]
  workflow_dispatch:
    inputs:
      export_method:
        description: 'Export method'
        required: true
        default: 'app-store'
        type: choice
        options:
          - app-store
          - ad-hoc
          - development

env:
  NODE_VERSION: '20'

jobs:
  build:
    name: Build iOS App
    runs-on: macos-14
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build web app
        run: npm run build
      
      - name: Add iOS platform if not exists
        run: |
          if [ ! -d "ios" ]; then
            npx cap add ios
          fi
      
      - name: Sync Capacitor
        run: npx cap sync ios
      
      - name: Install CocoaPods dependencies
        run: |
          cd ios/App
          pod install --repo-update
      
      - name: Check signing secrets
        id: check_secrets
        if: github.event_name != 'pull_request'
        run: |
          if [ -n "${{ secrets.BUILD_CERTIFICATE_BASE64 }}" ]; then
            echo "has_signing=true" >> $GITHUB_OUTPUT
          else
            echo "has_signing=false" >> $GITHUB_OUTPUT
            echo "::warning::Signing secrets not configured. Skipping signed build."
          fi
      
      - name: Install Apple certificate and provisioning profile
        if: github.event_name != 'pull_request' && steps.check_secrets.outputs.has_signing == 'true'
        env:
          BUILD_CERTIFICATE_BASE64: ${{ secrets.BUILD_CERTIFICATE_BASE64 }}
          P12_PASSWORD: ${{ secrets.P12_PASSWORD }}
          BUILD_PROVISION_PROFILE_BASE64: ${{ secrets.BUILD_PROVISION_PROFILE_BASE64 }}
          KEYCHAIN_PASSWORD: ${{ secrets.KEYCHAIN_PASSWORD }}
        run: |
          CERTIFICATE_PATH=$RUNNER_TEMP/build_certificate.p12
          PP_PATH=$RUNNER_TEMP/build_pp.mobileprovision
          KEYCHAIN_PATH=$RUNNER_TEMP/app-signing.keychain-db
          
          echo -n "$BUILD_CERTIFICATE_BASE64" | base64 --decode -o $CERTIFICATE_PATH
          echo -n "$BUILD_PROVISION_PROFILE_BASE64" | base64 --decode -o $PP_PATH
          
          security create-keychain -p "$KEYCHAIN_PASSWORD" $KEYCHAIN_PATH
          security set-keychain-settings -lut 21600 $KEYCHAIN_PATH
          security unlock-keychain -p "$KEYCHAIN_PASSWORD" $KEYCHAIN_PATH
          
          security import $CERTIFICATE_PATH -P "$P12_PASSWORD" -A -t cert -f pkcs12 -k $KEYCHAIN_PATH
          security list-keychain -d user -s $KEYCHAIN_PATH
          
          mkdir -p ~/Library/MobileDevice/Provisioning\ Profiles
          cp $PP_PATH ~/Library/MobileDevice/Provisioning\ Profiles
      
      - name: Create exportOptions.plist
        if: github.event_name != 'pull_request' && steps.check_secrets.outputs.has_signing == 'true'
        run: |
          EXPORT_METHOD="${{ github.event.inputs.export_method || 'app-store' }}"
          
          cat > ios/App/exportOptions.plist << EOF
          <?xml version="1.0" encoding="UTF-8"?>
          <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
          <plist version="1.0">
          <dict>
              <key>method</key>
              <string>${EXPORT_METHOD}</string>
              <key>teamID</key>
              <string>${{ secrets.APPLE_TEAM_ID }}</string>
              <key>signingStyle</key>
              <string>manual</string>
              <key>provisioningProfiles</key>
              <dict>
                  <key>com.fourone.klk</key>
                  <string>${{ secrets.PROVISIONING_PROFILE_NAME }}</string>
              </dict>
          </dict>
          </plist>
          EOF
      
      - name: Build iOS (Debug - Simulator)
        if: github.event_name == 'pull_request'
        run: |
          xcodebuild -workspace ios/App/App.xcworkspace \
            -scheme App \
            -sdk iphonesimulator \
            -configuration Debug \
            -destination 'platform=iOS Simulator,name=iPhone 15' \
            build
      
      - name: Build iOS Archive
        if: github.event_name != 'pull_request' && steps.check_secrets.outputs.has_signing == 'true'
        run: |
          xcodebuild -workspace ios/App/App.xcworkspace \
            -scheme App \
            -sdk iphoneos \
            -configuration Release \
            -archivePath $RUNNER_TEMP/App.xcarchive \
            clean archive \
            CODE_SIGN_STYLE=Manual \
            DEVELOPMENT_TEAM="${{ secrets.APPLE_TEAM_ID }}"
      
      - name: Export IPA
        if: github.event_name != 'pull_request' && steps.check_secrets.outputs.has_signing == 'true'
        run: |
          xcodebuild -exportArchive \
            -archivePath $RUNNER_TEMP/App.xcarchive \
            -exportOptionsPlist ios/App/exportOptions.plist \
            -exportPath $RUNNER_TEMP/build
      
      - name: Upload IPA
        if: github.event_name != 'pull_request' && steps.check_secrets.outputs.has_signing == 'true'
        uses: actions/upload-artifact@v4
        with:
          name: app-release.ipa
          path: ${{ runner.temp }}/build/*.ipa
          retention-days: 30
      
      - name: Clean up keychain
        if: always() && github.event_name != 'pull_request'
        run: |
          security delete-keychain $RUNNER_TEMP/app-signing.keychain-db 2>/dev/null || true
```

---

## Cómo crear en GitHub

1. Ve a tu repositorio en GitHub
2. Click "Add file" > "Create new file"
3. En el campo de nombre escribe: `.github/workflows/build-android.yml`
4. Pega el contenido del Archivo 1
5. Click "Commit changes"
6. Repite para el Archivo 2: `.github/workflows/build-ios.yml`
