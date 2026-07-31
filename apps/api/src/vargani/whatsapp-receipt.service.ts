import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/app-config';

interface SendReceiptInput {
  contributorName: string;
  mandalName: string;
  mediaUrl?: string | null;
  organizationName?: string | null;
  phone?: string | null;
  receiptUrl: string;
  slipNumber: string;
}

export interface WhatsAppSendResult {
  ok: boolean;
  provider?: 'AUTHKEY';
  reason?: string;
  receiptUrl?: string;
  status: 'failed' | 'sent' | 'skipped';
}

@Injectable()
export class WhatsAppReceiptService {
  private readonly logger = new Logger(WhatsAppReceiptService.name);

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async sendReceipt(input: SendReceiptInput): Promise<WhatsAppSendResult> {
    const enabled = this.config.get('AUTHKEY_WHATSAPP_ENABLED', { infer: true });
    const authkey = this.config.get('AUTHKEY_API_KEY', { infer: true }).trim();
    const wid =
      this.config.get('AUTHKEY_WHATSAPP_RECEIPT_WID', { infer: true }).trim() ||
      this.config.get('AUTHKEY_WHATSAPP_WID', { infer: true }).trim();
    const phone = normalizeIndianWhatsAppNumber(input.phone);
    const templateType = this.config.get('AUTHKEY_WHATSAPP_TEMPLATE_TYPE', { infer: true });
    const headerMediaUrl =
      input.mediaUrl?.trim() || this.config.get('AUTHKEY_WHATSAPP_HEADER_MEDIA_URL', { infer: true }).trim();

    if (!enabled) return { ok: true, reason: 'whatsapp_disabled', status: 'skipped' };
    if (!authkey || !wid) return { ok: true, reason: 'authkey_not_configured', status: 'skipped' };
    if (!phone) return { ok: false, reason: 'missing_whatsapp_number', status: 'failed' };
    if (templateType === 'media' && !isPublicMediaUrl(headerMediaUrl)) {
      this.logger.warn(
        `Authkey WhatsApp skipped for ${input.slipNumber}: media template requires a public image/document URL.`,
      );
      return { ok: false, provider: 'AUTHKEY', reason: 'missing_public_header_media_url', status: 'failed' };
    }

    const contributorName = transliterateReceiptTextToMarathi(input.contributorName.trim());
    const organizationName = transliterateReceiptTextToMarathi(
      input.organizationName?.trim() || input.mandalName.trim(),
    );
    const mandalName = transliterateReceiptTextToMarathi(input.mandalName.trim());
    const payload = {
      country_code: this.config.get('AUTHKEY_WHATSAPP_COUNTRY_CODE', { infer: true }).trim() || '91',
      mobile: phone,
      wid,
      type: templateType,
      bodyValues: {
        '1': contributorName,
        '2': organizationName,
        '3': mandalName,
      },
      ...(templateType === 'media'
        ? {
            headerValues: {
              headerData: headerMediaUrl,
              headerFileName:
                `${this.config.get('AUTHKEY_WHATSAPP_HEADER_FILE_NAME', { infer: true })} ${input.slipNumber}`.trim(),
            },
          }
        : {}),
    };

    this.logger.log(`Authkey WhatsApp payload for ${input.slipNumber}: ${JSON.stringify(payload)}`);

    try {
      const response = await fetch('https://console.authkey.io/restapi/requestjson.php', {
        body: JSON.stringify(payload),
        headers: {
          Authorization: `Basic ${authkey}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });

      const responseText = await response.text();
      this.logger.log(`Authkey WhatsApp response for ${input.slipNumber}: ${response.status} ${responseText}`);
      if (!response.ok) {
        this.logger.warn(`Authkey WhatsApp failed for ${input.slipNumber}: ${response.status} ${responseText}`);
        return { ok: false, provider: 'AUTHKEY', reason: `authkey_http_${response.status}`, status: 'failed' };
      }

      return { ok: true, provider: 'AUTHKEY', status: 'sent' };
    } catch (error) {
      this.logger.warn(
        `Authkey WhatsApp error for ${input.slipNumber}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { ok: false, provider: 'AUTHKEY', reason: 'authkey_request_failed', status: 'failed' };
    }
  }
}

function normalizeIndianWhatsAppNumber(phone?: string | null) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return digits;
}

function isPublicMediaUrl(value?: string | null) {
  if (!value) return false;

  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    if (['localhost', '127.0.0.1'].includes(url.hostname)) return false;
    return /\.(?:apng|avif|gif|jpe?g|pdf|png|webp)(?:$|\?)/i.test(url.pathname);
  } catch {
    return false;
  }
}

function hasDevanagari(value: string) {
  return /[\u0900-\u097F]/.test(value);
}

function toMarathiDigits(value: string) {
  const map: Record<string, string> = {
    '0': '०',
    '1': '१',
    '2': '२',
    '3': '३',
    '4': '४',
    '5': '५',
    '6': '६',
    '7': '७',
    '8': '८',
    '9': '९',
  };
  return value.replace(/[0-9]/g, (digit) => map[digit] ?? digit);
}

const LATIN_TO_MARATHI_WORDS: Record<string, string> = {
  aditya: 'आदित्य',
  akash: 'आकाश',
  amit: 'अमित',
  aniket: 'अनिकेत',
  barathe: 'बाराथे',
  chaudhari: 'चौधरी',
  chaudhary: 'चौधरी',
  chingu: 'चिंगू',
  choudhari: 'चौधरी',
  choudhary: 'चौधरी',
  chowdhari: 'चौधरी',
  chowdhary: 'चौधरी',
  darshan: 'दर्शन',
  dhiraj: 'धीरज',
  gade: 'गाडे',
  gadhave: 'गाढवे',
  gadekar: 'गाडेकर',
  gaikwad: 'गायकवाड',
  ghorpade: 'घोरपडे',
  ghadekar: 'घाडेकर',
  gorpade: 'घोरपडे',
  hande: 'हांडे',
  kakde: 'काकडे',
  mandal: 'मंडळ',
  maurya: 'मौर्य',
  mitra: 'मित्र',
  mogre: 'मोगरे',
  omkar: 'ओंकार',
  pawan: 'पवन',
  pramod: 'प्रमोद',
  prateek: 'प्रतीक',
  pratik: 'प्रतीक',
  pawar: 'पवार',
  pune: 'पुणे',
  rohan: 'रोहन',
  shashikant: 'शशिकांत',
  shirsat: 'शिरसाट',
  siddharth: 'सिद्धार्थ',
  soshikant: 'सोशिकांत',
  suraj: 'सुरज',
  superkar: 'सुपेकर',
  wanawadigaon: 'वानवडीगाव',
  wasti: 'वस्ती',
  yash: 'यश',
  yogesh: 'योगेश',
};

const DEVANAGARI_VOWELS: Record<string, string> = {
  aa: 'आ',
  ai: 'ऐ',
  au: 'औ',
  ee: 'ई',
  ii: 'ई',
  oo: 'ऊ',
  a: 'अ',
  e: 'ए',
  i: 'इ',
  o: 'ओ',
  u: 'उ',
};

const DEVANAGARI_MATRAS: Record<string, string> = {
  aa: 'ा',
  ai: 'ै',
  au: 'ौ',
  ee: 'ी',
  ii: 'ी',
  oo: 'ू',
  a: '',
  e: 'े',
  i: 'ि',
  o: 'ो',
  u: 'ु',
};

const DEVANAGARI_CONSONANTS: Record<string, string> = {
  bh: 'भ',
  ch: 'च',
  dh: 'ध',
  gh: 'घ',
  jh: 'झ',
  kh: 'ख',
  ph: 'फ',
  sh: 'श',
  th: 'थ',
  b: 'ब',
  c: 'क',
  d: 'द',
  f: 'फ',
  g: 'ग',
  h: 'ह',
  j: 'ज',
  k: 'क',
  l: 'ल',
  m: 'म',
  n: 'न',
  p: 'प',
  q: 'क',
  r: 'र',
  s: 'स',
  t: 'त',
  v: 'व',
  w: 'व',
  x: 'क्स',
  y: 'य',
  z: 'झ',
};

const DEVANAGARI_LETTER_NAMES: Record<string, string> = {
  A: 'ए',
  B: 'बी',
  C: 'सी',
  D: 'डी',
  E: 'ई',
  F: 'एफ',
  G: 'जी',
  H: 'एच',
  I: 'आय',
  J: 'जे',
  K: 'के',
  L: 'एल',
  M: 'एम',
  N: 'एन',
  O: 'ओ',
  P: 'पी',
  Q: 'क्यू',
  R: 'आर',
  S: 'एस',
  T: 'टी',
  U: 'यू',
  V: 'वी',
  W: 'डब्ल्यू',
  X: 'एक्स',
  Y: 'वाय',
  Z: 'झेड',
};

function readTransliterationToken(source: string, index: number, map: Record<string, string>) {
  const keys = Object.keys(map).sort((a, b) => b.length - a.length);
  return keys.find((key) => source.startsWith(key, index));
}

function transliterateLatinWordToMarathi(word: string) {
  if (!word || hasDevanagari(word)) return word;
  if (/^[A-Z]$/.test(word)) return DEVANAGARI_LETTER_NAMES[word] ?? word;
  if (/^[A-Z]{2,}$/.test(word)) {
    return word
      .split('')
      .map((letter) => DEVANAGARI_LETTER_NAMES[letter] ?? letter)
      .join('');
  }

  const exact = LATIN_TO_MARATHI_WORDS[word.toLowerCase()];
  if (exact) return exact;

  const lower = word.toLowerCase();
  let output = '';
  let index = 0;

  while (index < lower.length) {
    const vowel = readTransliterationToken(lower, index, DEVANAGARI_VOWELS);
    if (vowel) {
      output += DEVANAGARI_VOWELS[vowel];
      index += vowel.length;
      continue;
    }

    const consonant = readTransliterationToken(lower, index, DEVANAGARI_CONSONANTS);
    if (!consonant) {
      output += word[index] ?? '';
      index += 1;
      continue;
    }

    const nextIndex = index + consonant.length;
    const nextVowel = readTransliterationToken(lower, nextIndex, DEVANAGARI_MATRAS);
    output += DEVANAGARI_CONSONANTS[consonant];

    if (nextVowel) {
      output += DEVANAGARI_MATRAS[nextVowel];
      index = nextIndex + nextVowel.length;
    } else {
      const hasMoreLatin = /[a-z]/.test(lower.slice(nextIndex));
      const nextIsConsonant = Boolean(readTransliterationToken(lower, nextIndex, DEVANAGARI_CONSONANTS));
      output += hasMoreLatin && nextIsConsonant ? '्' : '';
      index = nextIndex;
    }
  }

  return output;
}

function transliterateReceiptTextToMarathi(value: string) {
  if (!value) return value;
  if (hasDevanagari(value)) return toMarathiDigits(value);
  return toMarathiDigits(value.replace(/[A-Za-z]+/g, (word) => transliterateLatinWordToMarathi(word)));
}
