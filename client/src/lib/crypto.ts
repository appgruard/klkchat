// End-to-end encryption utilities using Web Crypto API

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;

// Generate a new key pair for asymmetric encryption
export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );
}

// Export public key to base64 string for sharing
export async function exportPublicKey(publicKey: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey("spki", publicKey);
  return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

// Import public key from base64 string
export async function importPublicKey(publicKeyBase64: string): Promise<CryptoKey> {
  const binaryString = atob(publicKeyBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return await crypto.subtle.importKey(
    "spki",
    bytes.buffer,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true,
    ["encrypt"]
  );
}

// Export private key for storage
export async function exportPrivateKey(privateKey: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey("pkcs8", privateKey);
  return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

// Import private key from storage
export async function importPrivateKey(privateKeyBase64: string): Promise<CryptoKey> {
  const binaryString = atob(privateKeyBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return await crypto.subtle.importKey(
    "pkcs8",
    bytes.buffer,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true,
    ["decrypt"]
  );
}

// Generate a symmetric key for message encryption
export async function generateSymmetricKey(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    {
      name: ALGORITHM,
      length: KEY_LENGTH,
    },
    true,
    ["encrypt", "decrypt"]
  );
}

// Encrypt message with symmetric key
export async function encryptMessage(
  message: string,
  symmetricKey: CryptoKey
): Promise<{ encryptedContent: string; iv: string }> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const encryptedData = await crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv,
    },
    symmetricKey,
    data
  );

  return {
    encryptedContent: btoa(String.fromCharCode(...new Uint8Array(encryptedData))),
    iv: btoa(String.fromCharCode(...iv)),
  };
}

// Decrypt message with symmetric key
export async function decryptMessage(
  encryptedContent: string,
  ivBase64: string,
  symmetricKey: CryptoKey
): Promise<string> {
  const encryptedBytes = Uint8Array.from(atob(encryptedContent), c => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));

  const decryptedData = await crypto.subtle.decrypt(
    {
      name: ALGORITHM,
      iv,
    },
    symmetricKey,
    encryptedBytes
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedData);
}

// Encrypt symmetric key with recipient's public key
export async function encryptSymmetricKey(
  symmetricKey: CryptoKey,
  recipientPublicKey: CryptoKey
): Promise<string> {
  const exportedKey = await crypto.subtle.exportKey("raw", symmetricKey);
  const encryptedKey = await crypto.subtle.encrypt(
    {
      name: "RSA-OAEP",
    },
    recipientPublicKey,
    exportedKey
  );
  return btoa(String.fromCharCode(...new Uint8Array(encryptedKey)));
}

// Decrypt symmetric key with private key
export async function decryptSymmetricKey(
  encryptedKeyBase64: string,
  privateKey: CryptoKey
): Promise<CryptoKey> {
  const encryptedKeyBytes = Uint8Array.from(atob(encryptedKeyBase64), c => c.charCodeAt(0));
  const decryptedKeyData = await crypto.subtle.decrypt(
    {
      name: "RSA-OAEP",
    },
    privateKey,
    encryptedKeyBytes
  );
  return await crypto.subtle.importKey(
    "raw",
    decryptedKeyData,
    {
      name: ALGORITHM,
      length: KEY_LENGTH,
    },
    true,
    ["encrypt", "decrypt"]
  );
}

// Store keys in localStorage (simplified - in production use IndexedDB with proper security)
const PRIVATE_KEY_STORAGE_KEY = "fourOneChat_privateKey";
const PUBLIC_KEY_STORAGE_KEY = "fourOneChat_publicKey";

export async function storeKeys(keyPair: CryptoKeyPair): Promise<void> {
  const privateKeyStr = await exportPrivateKey(keyPair.privateKey);
  const publicKeyStr = await exportPublicKey(keyPair.publicKey);
  localStorage.setItem(PRIVATE_KEY_STORAGE_KEY, privateKeyStr);
  localStorage.setItem(PUBLIC_KEY_STORAGE_KEY, publicKeyStr);
}

export async function getStoredKeys(): Promise<{ privateKey: CryptoKey; publicKey: CryptoKey } | null> {
  const privateKeyStr = localStorage.getItem(PRIVATE_KEY_STORAGE_KEY);
  const publicKeyStr = localStorage.getItem(PUBLIC_KEY_STORAGE_KEY);
  
  if (!privateKeyStr || !publicKeyStr) {
    return null;
  }
  
  try {
    const privateKey = await importPrivateKey(privateKeyStr);
    const publicKey = await importPublicKey(publicKeyStr);
    return { privateKey, publicKey };
  } catch {
    return null;
  }
}

export function getStoredPublicKeyString(): string | null {
  return localStorage.getItem(PUBLIC_KEY_STORAGE_KEY);
}

export function clearStoredKeys(): void {
  localStorage.removeItem(PRIVATE_KEY_STORAGE_KEY);
  localStorage.removeItem(PUBLIC_KEY_STORAGE_KEY);
}

// Simple symmetric encryption for conversation (using shared secret derived from conversation ID)
// This is a simplified approach - full E2EE would use the RSA keys for key exchange
export async function deriveConversationKey(conversationId: string, userSecret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(conversationId + userSecret),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  
  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode("fourOneSolutions"),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    {
      name: ALGORITHM,
      length: KEY_LENGTH,
    },
    true,
    ["encrypt", "decrypt"]
  );
}
