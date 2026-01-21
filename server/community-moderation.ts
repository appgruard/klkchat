// Content moderation for community chat
// Detects and blocks: phone numbers, emails, social media handles, addresses, personal identifiers

// Phone number patterns (various formats)
const phonePatterns = [
  /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, // 123-456-7890, 123.456.7890, 123 456 7890
  /\b\(\d{3}\)\s?\d{3}[-.\s]?\d{4}\b/g, // (123) 456-7890
  /\b\+?\d{1,3}[-.\s]?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, // +1 123 456 7890
  /\b\d{10,15}\b/g, // 10-15 digit numbers
  /\btel[:\s]?\d+/gi, // tel:123456
];

// Email patterns
const emailPatterns = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  /\b[A-Za-z0-9._%+-]+\s*(?:@|arroba|at)\s*[A-Za-z0-9.-]+\s*(?:\.|punto|dot)\s*[A-Z|a-z]{2,}\b/gi,
];

// Social media patterns
const socialPatterns = [
  /@[a-zA-Z0-9_]{1,30}/g, // @username
  /(?:instagram|ig|insta)[:\s]*@?[a-zA-Z0-9_.]+/gi,
  /(?:twitter|x\.com|tw)[:\s]*@?[a-zA-Z0-9_]+/gi,
  /(?:facebook|fb)[:\s]*[a-zA-Z0-9.]+/gi,
  /(?:tiktok|tt)[:\s]*@?[a-zA-Z0-9_.]+/gi,
  /(?:snapchat|snap)[:\s]*[a-zA-Z0-9_]+/gi,
  /(?:whatsapp|wa)[:\s]*\+?[0-9]+/gi,
  /(?:telegram|tg)[:\s]*@?[a-zA-Z0-9_]+/gi,
  /(?:linkedin)[:\s]*[a-zA-Z0-9]+/gi,
  /(?:discord)[:\s]*[a-zA-Z0-9#]+/gi,
];

// URL patterns
const urlPatterns = [
  /https?:\/\/[^\s]+/gi,
  /www\.[^\s]+/gi,
  /\b[a-z0-9-]+\.(?:com|net|org|io|co|app|dev|me|es|do|biz|info|us|uk|ca|fr|de|jp|cn|it|ru|br|in|au|mx|ar|cl|pe|ve|co|pa|sv|uy|online|site|tech|xyz|top|icu|club|vip|shop|store|link|work|pro|live)\b[^\s]*/gi,
];

// Address patterns (basic)
const addressPatterns = [
  /\b\d+\s+[A-Za-z]+\s+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct|way|circle|cir|place|pl)\b/gi,
  /\bcalle\s+[A-Za-z0-9\s]+(?:no?\.?\s*\d+)?/gi, // Spanish: Calle X No. 123
  /\bc\/[a-z0-9\s]+/gi, // C/ Principal, C/ 1ra, etc.
  /\bavenida\s+[A-Za-z0-9\s]+/gi, // Spanish: Avenida X
  /\b(?:apt|apartment|suite|unit|#)\s*\d+/gi,
  /\bvivo\s+en\s+[A-Za-z0-9\s]+/gi, // "Vivo en X"
  /\bla\s+milagrosa\b/gi, // Case-insensitive specific reference
  /\bnos\s+vemos\s+en\s+[A-Za-z0-9\s]+/gi, // Meeting points: "Nos vemos en X"
  /\bquedamos\s+en\s+[A-Za-z0-9\s]+/gi, // Spanish meeting points
  /\ben\s+el\s+parque\s+[A-Za-z0-9\s]+/gi, // "En el parque X"
  /\bparque\s+caceres\b/gi, // Case-insensitive specific location
  /\bmi\s+ubicacion\s+es\b/gi, // "Mi ubicación es"
  /\bmi\s+casa\s+es\b/gi, // "Mi casa es"
  /\bestoy\s+en\b/gi, // "Estoy en"
];

// Personal identifier patterns
const idPatterns = [
  /\b\d{3}-\d{2}-\d{4}\b/g, // SSN format
  /\bcédula[:\s]*[\d-]+/gi, // Dominican cedula
  /\b(?:rnc|cedula|dni|nif|nie)[:\s]*[\d-]+/gi,
  /\bpassport[:\s]*[A-Z0-9]+/gi,
];

// Explicit content word list (expanded)
const explicitWords = [
  'fuck','fucking','fucker','motherfucker','mf','shit','bullshit','shithead',
  'bitch','bitches','bitching','ass','asshole','dumbass','badass',
  'dick','dicks','dickhead','cock','cocks','pussy','pussies','cunt','cunts',
  'whore','whores','slut','sluts','porn','porno','pornhub','sex','sexy','sexual',
  'xxx','hardcore','softcore','nude','nudes','naked','horny','kinky','bastard',
  'tosser','wanker','twat','clunge','bollocks','bloody','bugger','shag','jizz',
  'cum','ejaculate','orgasm','fetish','bdsm','erotic','fvck','f*ck','f**k',
  'sh1t','$hit','b1tch','p0rn','s3x','n00d','n00ds','puta','puto','putas','putos',
  'putita','putazo','mierda','mierdas','joder','jodido','jodete','coño','cojones',
  'verga','vergazo','culo','culos','culazo','pene','penes','vagina','vaginas',
  'zorra','zorras','perra','perras','chingar','chingando','chingadera','coger',
  'cogiendo','cogida','follar','follando','mamar','mamando','mamado','pajero',
  'pajeros','paja','masturbar','masturbacion','masturbando','orgasmo','semen',
  'pendejo','pendeja','pendejos','estupido','idiota','imbecil','baboso','boludo',
  'maricon','tetas','tetonas','chupar','cabron','mamaguevo','mmg','mmgv','singar',
  'cuero','comemierda','rastrero','pariguayo','mardito','maldito','diablo',
  'ñema','toto','popola','onlyfans','snapchat','snap','hpt','hp','ptm','anal'
];

export interface ModerationResult {
  allowed: boolean;
  reason?: string;
  isExplicit: boolean;
}

const homoglyphs: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b',
  '@': 'a', '$': 's', '€': 'e', '£': 'l', '¢': 'c', '¥': 'y',
  '¡': 'i', '¿': '?', '!' : 'i',
  '⓪': '0', '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5', '⑥': '6', '⑦': '7', '⑧': '8', '⑨': '9',
  'ⓐ': 'a', 'ⓑ': 'b', 'ⓒ': 'c', 'ⓓ': 'd', 'ⓔ': 'e', 'ⓕ': 'f', 'ⓖ': 'g', 'ⓗ': 'h', 'ⓘ': 'i', 'ⓙ': 'j',
  'ⓚ': 'k', 'ⓛ': 'l', 'ⓜ': 'm', 'ⓝ': 'n', 'ⓞ': 'o', 'ⓟ': 'p', 'ⓠ': 'q', 'ⓡ': 'r', 'ⓢ': 's', 'ⓣ': 't',
  'ⓤ': 'u', 'ⓥ': 'v', 'ⓦ': 'w', 'ⓧ': 'x', 'ⓨ': 'y', 'ⓩ': 'z'
};

function normalizeAdvanced(text: string): string {
  let normalized = text.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  let result = '';
  for (const char of normalized) {
    result += homoglyphs[char] || char;
  }

  return result.replace(/[^a-z0-9]/g, '');
}

const PROFANITY_LIST = [
  "mierda", "puta", "hijo de puta", "cabron", "cabrón", "malparido", "pendejo", "zorra", "maldito", "idiota", "estupido", "estúpido", "maricon", "maricón",
  "fuck", "shit", "bitch", "asshole", "dick", "cunt"
];

export function filterProfanity(text: string, age: number): string {
  if (age >= 16) return text;
  
  let filtered = text;
  PROFANITY_LIST.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    filtered = filtered.replace(regex, '****');
  });
  return filtered;
}

export function moderateContent(text: string, contentType?: string, content?: string): ModerationResult {
  if (!text && !content) {
    return { allowed: true, isExplicit: false };
  }

  // Block only uploaded gallery stickers in community chat
  // content might be a URL or a filename. We check for /uploads/ prefix
  if (contentType === 'sticker' && content) {
    const isUpload = content.includes('/uploads/') || content.startsWith('sticker-');
    if (isUpload) {
      return { allowed: false, reason: 'gallery_stickers_blocked', isExplicit: false };
    }
  }

  // Allow GIFs (Giphy/external URLs)
  if (contentType === 'gif') {
    return { allowed: true, isExplicit: false };
  }

  if (!text || typeof text !== 'string') {
    return { allowed: true, isExplicit: false };
  }

  const normalized = normalizeAdvanced(text);

  if (/\d{7,}/.test(normalized)) {
    return { allowed: false, reason: 'phone_number', isExplicit: false };
  }

  const blockedPhrases = [
    'vivoen', 'estoyen', 'nosvemosen', 'quedamosen', 'micasaes', 'miubicaciones',
    'lamilagrosa', 'parquecaceres', 'calle', 'avenida', 'sector', 'barrio', 'edificio',
    'apartamento', 'num', 'numero', 'tel', 'whatsapp', 'wsp', 'escribeme', 'llamame'
  ];

  if (blockedPhrases.some(phrase => normalized.includes(phrase))) {
    return { allowed: false, reason: 'personal_info', isExplicit: false };
  }

  const compressedNoSymbols = text.replace(/[^a-z0-9.]/gi, '').toLowerCase();
  if (/\b[a-z0-9-]+\.[a-z]{2,}\b/i.test(compressedNoSymbols)) {
    return { allowed: false, reason: 'external_link', isExplicit: false };
  }

  const isExplicit = explicitWords.some(word => {
    const normalizedWord = word.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
    return normalized.includes(normalizedWord);
  });

  return { allowed: true, isExplicit };
}

export const adjectives = ['Swift', 'Bright', 'Calm', 'Bold', 'Cool', 'Fast', 'Kind', 'Wise', 'Free', 'Pure'];
export const nouns = ['Fox', 'Eagle', 'Wolf', 'Bear', 'Hawk', 'Lion', 'Tiger', 'Panda', 'Otter', 'Raven'];

export function generatePseudonym(): string {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 100);
  return `${adj}${noun}${num}`;
}

export const RATE_LIMITS = { text: 9000, audio: 38000, sticker: 24000, gif: 24000 };
export const MAX_MESSAGES_PER_24H = 100;
export const MAX_AUDIO_DURATION = 30;
export const SILENCE_DURATION_HOURS = 1;
export const BLOCKS_BEFORE_SILENCE = 5;
