#!/bin/bash

# KLK! Chat - GitHub Secrets Generator
# This script generates the required secrets for GitHub Actions builds

set -e

echo "================================================"
echo "  KLK! Chat - GitHub Secrets Generator"
echo "================================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Create output directory
SECRETS_DIR="./secrets-output"
mkdir -p "$SECRETS_DIR"

echo -e "${YELLOW}This script will generate secrets for GitHub Actions.${NC}"
echo -e "${YELLOW}The generated files will be saved to: $SECRETS_DIR${NC}"
echo ""

# ============================================
# ANDROID SECRETS
# ============================================
echo -e "${BLUE}=== ANDROID SECRETS ===${NC}"
echo ""

KEYSTORE_FILE="$SECRETS_DIR/release.jks"
KEYSTORE_ALIAS="klk-release"

if [ -f "$KEYSTORE_FILE" ]; then
    echo -e "${YELLOW}Keystore already exists. Skipping generation.${NC}"
else
    echo "Generating Android keystore..."
    echo ""
    echo -e "${YELLOW}You will be prompted to enter keystore details.${NC}"
    echo -e "${YELLOW}Remember the passwords you set!${NC}"
    echo ""
    
    # Generate keystore
    keytool -genkey -v \
        -keystore "$KEYSTORE_FILE" \
        -alias "$KEYSTORE_ALIAS" \
        -keyalg RSA \
        -keysize 2048 \
        -validity 10000 \
        -storepass changeit \
        -keypass changeit \
        -dname "CN=KLK Chat, OU=FourOne Solutions, O=FourOne, L=Santo Domingo, ST=DN, C=DO"
    
    echo ""
    echo -e "${GREEN}Keystore generated successfully!${NC}"
fi

# Encode keystore to base64
echo ""
echo "Encoding keystore to base64..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    KEYSTORE_BASE64=$(base64 -i "$KEYSTORE_FILE")
else
    # Linux
    KEYSTORE_BASE64=$(base64 -w 0 "$KEYSTORE_FILE")
fi

echo "$KEYSTORE_BASE64" > "$SECRETS_DIR/RELEASE_KEYSTORE.txt"

echo ""
echo -e "${GREEN}Android secrets generated!${NC}"
echo ""
echo "================================================"
echo "ANDROID GITHUB SECRETS:"
echo "================================================"
echo ""
echo -e "${BLUE}RELEASE_KEYSTORE:${NC}"
echo "  File: $SECRETS_DIR/RELEASE_KEYSTORE.txt"
echo "  (Copy entire contents of file)"
echo ""
echo -e "${BLUE}RELEASE_KEYSTORE_PASSWORD:${NC}"
echo "  changeit"
echo ""
echo -e "${BLUE}KEYSTORE_KEY_ALIAS:${NC}"
echo "  $KEYSTORE_ALIAS"
echo ""
echo -e "${BLUE}KEYSTORE_KEY_PASSWORD:${NC}"
echo "  changeit"
echo ""

# ============================================
# iOS SECRETS INSTRUCTIONS
# ============================================
echo -e "${BLUE}=== iOS SECRETS ===${NC}"
echo ""
echo -e "${YELLOW}iOS certificates must be generated on macOS.${NC}"
echo ""
echo "To generate iOS secrets, follow these steps:"
echo ""
echo "1. Create Distribution Certificate:"
echo "   - Open Xcode > Settings > Accounts"
echo "   - Select your Apple ID > Manage Certificates"
echo "   - Click + > Apple Distribution"
echo "   - Export from Keychain Access as .p12 file"
echo ""
echo "2. Create Provisioning Profile:"
echo "   - Go to https://developer.apple.com/account/resources/profiles"
echo "   - Click + to create new profile"
echo "   - Select 'App Store' distribution"
echo "   - Select App ID: com.fourone.klk"
echo "   - Download .mobileprovision file"
echo ""
echo "3. Encode for GitHub Secrets:"
echo ""
echo "   # Certificate:"
echo "   base64 -i certificate.p12 > BUILD_CERTIFICATE_BASE64.txt"
echo ""
echo "   # Provisioning Profile:"
echo "   base64 -i profile.mobileprovision > BUILD_PROVISION_PROFILE_BASE64.txt"
echo ""
echo "4. Add these secrets to GitHub:"
echo ""
echo "   BUILD_CERTIFICATE_BASE64    - Contents of BUILD_CERTIFICATE_BASE64.txt"
echo "   P12_PASSWORD                - Password used when exporting certificate"
echo "   BUILD_PROVISION_PROFILE_BASE64 - Contents of BUILD_PROVISION_PROFILE_BASE64.txt"
echo "   KEYCHAIN_PASSWORD           - Random string (e.g., generate with: openssl rand -hex 16)"
echo "   APPLE_TEAM_ID               - Your Apple Developer Team ID"
echo "   PROVISIONING_PROFILE_NAME   - Name of provisioning profile"
echo ""

# Generate random keychain password
KEYCHAIN_PWD=$(openssl rand -hex 16 2>/dev/null || echo "random-keychain-password-$(date +%s)")
echo "$KEYCHAIN_PWD" > "$SECRETS_DIR/KEYCHAIN_PASSWORD.txt"
echo -e "${GREEN}Generated random KEYCHAIN_PASSWORD:${NC} $KEYCHAIN_PWD"
echo "  Saved to: $SECRETS_DIR/KEYCHAIN_PASSWORD.txt"
echo ""

# ============================================
# SUMMARY
# ============================================
echo "================================================"
echo -e "${GREEN}SUMMARY${NC}"
echo "================================================"
echo ""
echo "Generated files in $SECRETS_DIR/:"
ls -la "$SECRETS_DIR/"
echo ""
echo -e "${RED}IMPORTANT: Keep these files secure!${NC}"
echo -e "${RED}Do NOT commit them to your repository.${NC}"
echo -e "${RED}Delete them after adding to GitHub Secrets.${NC}"
echo ""
echo "To add secrets to GitHub:"
echo "1. Go to your repository on GitHub"
echo "2. Click Settings > Secrets and variables > Actions"
echo "3. Click 'New repository secret'"
echo "4. Add each secret with the values from above"
echo ""
echo -e "${GREEN}Done!${NC}"
