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
  /[a-zA-Z0-9-]+\.(com|net|org|io|co|app|dev|me)[^\s]*/gi,
];

// Address patterns (basic)
const addressPatterns = [
  /\b\d+\s+[A-Za-z]+\s+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct|way|circle|cir|place|pl)\b/gi,
  /\bcalle\s+[A-Za-z0-9\s]+(?:no?\.?\s*\d+)?/gi, // Spanish: Calle X No. 123
  /\bavenida\s+[A-Za-z0-9\s]+/gi, // Spanish: Avenida X
  /\b(?:apt|apartment|suite|unit|#)\s*\d+/gi,
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
  // =========================
  // INGLÉS (base + variantes)
  // =========================
  'fuck','fucking','fucker','motherfucker','mf',
  'shit','bullshit','shithead',
  'bitch','bitches','bitching',
  'ass','asshole','dumbass','badass',
  'dick','dicks','dickhead',
  'cock','cocks',
  'pussy','pussies',
  'cunt','cunts',
  'whore','whores',
  'slut','sluts',
  'porn','porno','pornhub',
  'sex','sexy','sexual',
  'xxx','hardcore','softcore',
  'nude','nudes','naked',
  'horny','kinky',
  'bastard', 'tosser', 'wanker', 'twat', 'clunge', 'bollocks', 'bloody', 'bugger',
  'shag', 'jizz', 'cum', 'ejaculate', 'orgasm', 'fetish', 'bdsm', 'erotic',

  // evasiones comunes
  'fvck','f*ck','f**k',
  'sh1t','$hit',
  'b1tch',
  'p0rn','s3x',
  'n00d','n00ds',
  'f u c k', 's h i t',

  // =========================
  // ESPAÑOL GENERAL
  // =========================
  'puta','puto','putas','putos','putita','putazo',
  'mierda','mierdas',
  'joder','jodido','jodete',
  'coño','cojones',
  'verga','vergazo',
  'culo','culos','culazo',
  'pene','penes',
  'vagina','vaginas',
  'sexo','sexual','sexualidad',
  'zorra','zorras',
  'perra','perras',
  'chingar','chingando','chingadera',
  'coger','cogiendo','cogida',
  'follar','follando',
  'mamar','mamando','mamado',
  'pajero','pajeros','paja',
  'masturbar','masturbacion','masturbando',
  'orgasmo','orgasmos',
  'eyacular','eyaculacion',
  'semen',
  'pendejo', 'pendeja', 'pendejada', 'pendejos',
  'estupido', 'estupida', 'idiota', 'imbecil', 'baboso', 'boludo',
  'maricon', 'mariconazo', 'culon', 'culona', 'tetas', 'tetonas',
  'chupar', 'chupada', 'lamer', 'clavar', 'reventar',

  // =========================
  // CARIBE / RD / DOMINICANO
  // =========================
  'cabron','cabrón','cabrona','cabrones',
  'mamaguevo','mamagueva','mamaguevos',
  'mmg','mmgv',
  'singar','singando','singao',
  'cuero','cuera','cueros',       // RD: prostituta
  'come mierda','comemierda',
  'rastrero','rastrera',
  'pariguayo','pariguaya',
  'boludo','boluda',              // muy usado informalmente
  'mardito','maldito','maldita',
  'diablo','diache',              // usados como insulto
  'ñema','ñemazo',                // vulgar RD
  'toto','totico',
  'bimbin','bimbazo',
  'popola', 'greca', 'chapeadora', 'tiguere', 'guayando',
  'palomo', 'guerrero', 'chopo', 'chopa', 'tutu', 'fulano',

  // =========================
  // INSULTOS SEXUALES / ACOSO
  // =========================
  'pervertido','pervertida',
  'degenerado','degenerada',
  'asqueroso','asquerosa',
  'cochino','cochina',
  'enfermo','enferma',
  'acosador', 'acosadora', 'violador', 'pedofilo', 'violacion',

  // =========================
  // REDES / CONTACTO SEXUAL
  // (útiles para bloquear intentos)
  // =========================
  'onlyfans','fansly',
  'snapchat','snap',
  'telegram','tg',
  'whatsapp','wsp','ws',
  'instagram','insta','ig',
  'xhamster', 'redtube', 'xnxx', 'youporn',

  // =========================
  // ABREVIATURAS / CLAVES
  // =========================
  'hpt','hp',
  'ptm','ctm',
  'lpm','jpm',
  'vete a la mierda', 'vete a la verga', 'hijo de puta', 'hija de puta',

  // =========================
  // ADICIONALES (Para llegar a 100+)
  // =========================
  'anal', 'anus', 'balls', 'blowjob', 'boobs', 'butt', 'clitoris', 'condom',
  'deepthroat', 'dildo', 'erection', 'escort', 'foreskin', 'handjob', 'hentai',
  'incest', 'intercourse', 'labia', 'milf', 'orgies', 'orgy', 'panties', 'pedophile',
  'penis', 'prostitute', 'rape', 'rectum', 'scrotum', 'sperm', 'strip', 'testicle',
  'vagina', 'vulva', 'gay', 'lesbian', 'bisexual', 'transgender', 'queer', 'homo',
  'dyke', 'faggot', 'nigger', 'nigga', 'beaner', 'chink', 'gook', 'kike', 'spic',
  'wetback', 'retard', 'spastic', 'cripple', 'whore', 'hoe', 'skank', 'tramp',
  'wench', 'bimbo', 'gigolo', 'hooker', 'pimp', 'stripper', 'bondage', 'dominatrix',
  'sadism', 'masochism', 'swapping', 'threesome', 'foursome', 'gangbang', 'gloryhole',
  'bukkake', 'facials', 'creampie', 'squirt', 'bondage', 'kink', 'fetish', 'bdsm',
  'voyeur', 'exhibitionist', 'necrophilia', 'bestiality', 'zoophilia', 'pedophilia'
];

export interface ModerationResult {
  allowed: boolean;
  reason?: string;
  isExplicit: boolean;
}

export function moderateContent(text: string): ModerationResult {
  if (!text || typeof text !== 'string') {
    return { allowed: true, isExplicit: false };
  }

  // 1. Normalize text for aggressive pattern matching (Remove spaces and common separators)
  const compressedText = text
    .replace(/\s+/g, '')
    .replace(/[-.\(\)]/g, '');

  // 2. Check for phone numbers
  // Check compressed text for long digit sequences (likely phone numbers)
  if (/\d{7,}/.test(compressedText)) {
    // Basic verification to avoid blocking simple numbers like "123456" (if they are shorter than 7)
    // But 8090000000 is 10 digits, so it will be caught.
    return { 
      allowed: false, 
      reason: 'phone_number',
      isExplicit: false 
    };
  }

  // Check original text for patterns
  for (const pattern of phonePatterns) {
    if (pattern.test(text)) {
      return { 
        allowed: false, 
        reason: 'phone_number',
        isExplicit: false 
      };
    }
    pattern.lastIndex = 0;
  }

  // Check for emails
  for (const pattern of emailPatterns) {
    if (pattern.test(text)) {
      return { 
        allowed: false, 
        reason: 'email',
        isExplicit: false 
      };
    }
    pattern.lastIndex = 0;
  }

  // Check for social media
  for (const pattern of socialPatterns) {
    if (pattern.test(text)) {
      return { 
        allowed: false, 
        reason: 'social_media',
        isExplicit: false 
      };
    }
    pattern.lastIndex = 0;
  }

  // Check for URLs/links
  for (const pattern of urlPatterns) {
    if (pattern.test(text)) {
      return { 
        allowed: false, 
        reason: 'external_link',
        isExplicit: false 
      };
    }
    pattern.lastIndex = 0;
  }

  // Check for addresses
  for (const pattern of addressPatterns) {
    if (pattern.test(text)) {
      return { 
        allowed: false, 
        reason: 'address',
        isExplicit: false 
      };
    }
    pattern.lastIndex = 0;
  }

  // Check for personal identifiers
  for (const pattern of idPatterns) {
    if (pattern.test(text)) {
      return { 
        allowed: false, 
        reason: 'personal_id',
        isExplicit: false 
      };
    }
    pattern.lastIndex = 0;
  }

  // 2. Normalize text for explicit content detection
  // Lowercase, remove accents, remove all symbols and whitespace
  const normalizedText = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9]/g, '');      // Remove everything except letters and numbers

  // 3. Check for explicit content using normalized text
  const isExplicit = explicitWords.some(word => {
    // Normalize the target word as well (just in case)
    const normalizedWord = word
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
    
    // Check if the normalized text contains the normalized word
    return normalizedText.includes(normalizedWord);
  });

  return { allowed: true, isExplicit };
}

// Generate random pseudonym for anonymous identity
const adjectives = [
  'Swift', 'Bright', 'Calm', 'Bold', 'Cool', 'Fast', 'Kind', 'Wise', 'Free', 'Pure',
  'Veloz', 'Alegre', 'Sereno', 'Audaz', 'Fresco', 'Amable', 'Sabio', 'Libre', 'Noble', 'Fuerte'
];

const nouns = [
  'Fox', 'Eagle', 'Wolf', 'Bear', 'Hawk', 'Lion', 'Tiger', 'Panda', 'Otter', 'Raven',
  'Zorro', 'Aguila', 'Lobo', 'Oso', 'Halcon', 'Leon', 'Tigre', 'Delfin', 'Buho', 'Cuervo'
];

export function generatePseudonym(): string {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 100);
  return `${adj}${noun}${num}`;
}

// Rate limit cooldowns in milliseconds
export const RATE_LIMITS = {
  text: 9000,      // 9 seconds
  audio: 38000,    // 38 seconds
  sticker: 24000,  // 24 seconds
  gif: 24000,      // 24 seconds
};

export const MAX_MESSAGES_PER_24H = 100;
export const MAX_AUDIO_DURATION = 30; // seconds
export const SILENCE_DURATION_HOURS = 1;
export const BLOCKS_BEFORE_SILENCE = 5;
