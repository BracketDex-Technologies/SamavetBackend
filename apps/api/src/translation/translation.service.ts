import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/app-config';

interface GroqChatCompletionResult {
  choices?: Array<{ message?: { content?: string } }>;
}

type RemoteTranslationProvider = 'groq' | 'openrouter';

// Transliteration engines cannot infer the canonical spelling of ambiguous
// place names. Keep verified, domain-specific spellings ahead of the provider.
const MARATHI_ADDRESS_GLOSSARY: Readonly<Record<string, string>> = {
  'natu baug': 'नातूबाग',
  natubag: 'नातूबाग',
  natubaug: 'नातूबाग',
  wanawadi: 'वानवडी',
  'wanawadi gaon': 'वानवडी गाव',
  wanowrie: 'वानवडी',
  wanwadi: 'वानवडी',
  'wanwadi gaon': 'वानवडी गाव',
};

const MARATHI_OUTPUT_CORRECTIONS: Readonly<Record<string, string>> = {
  नटुबाग: 'नातूबाग',
  नटूबाग: 'नातूबाग',
  वणवडी: 'वानवडी',
  वनवडी: 'वानवडी',
  वनावाडी: 'वानवडी',
  वाणावडी: 'वानवडी',
  वानवाडी: 'वानवडी',
};

function normalizeLookup(text: string) {
  return text.toLocaleLowerCase('en-IN').replace(/\s+/g, ' ').trim();
}

function correctKnownMarathiSpellings(text: string) {
  return Object.entries(MARATHI_OUTPUT_CORRECTIONS).reduce(
    (current, [variant, canonical]) => current.replaceAll(variant, canonical),
    text,
  );
}

function applyVerifiedLocalities(text: string) {
  return Object.entries(MARATHI_ADDRESS_GLOSSARY)
    .sort(([left], [right]) => right.length - left.length)
    .reduce((current, [variant, canonical]) => {
      const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      return current.replace(new RegExp(`(^|[^A-Za-z])${escaped}(?=$|[^A-Za-z])`, 'gi'), (_, prefix: string) => `${prefix}${canonical}`);
    }, text);
}

@Injectable()
export class TranslationService {
  private readonly cache = new Map<string, { provider: RemoteTranslationProvider; text: string }>();

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async transliterateMarathi(input: string) {
    const text = input.trim();
    if (!/[A-Za-z]/.test(text)) return { provider: 'unchanged', text };

    const lookup = normalizeLookup(text);
    const glossaryMatch = MARATHI_ADDRESS_GLOSSARY[lookup];
    if (glossaryMatch) return { provider: 'locality-glossary', text: glossaryMatch };

    const cached = this.cache.get(lookup);
    if (cached) return { provider: `${cached.provider}-cache`, text: cached.text };
    const providerInput = applyVerifiedLocalities(text);

    const groqKey = (this.config.get('GROQ_API_KEY', { infer: true }) ?? '').trim();
    if (groqKey) {
      try {
        const translated = await this.translateWithGroq(providerInput, groqKey);
        const corrected = correctKnownMarathiSpellings(translated);
        this.remember(text, corrected, 'groq');
        return { provider: 'groq', text: corrected };
      } catch {
        // Free-plan quota exhaustion, provider errors, and timeouts fall through
        // to OpenRouter when it has been configured.
      }
    }

    const openRouterKey = (this.config.get('OPENROUTER_API_KEY', { infer: true }) ?? '').trim();
    if (openRouterKey) {
      try {
        const translated = await this.translateWithOpenRouter(providerInput, openRouterKey);
        const corrected = correctKnownMarathiSpellings(translated);
        this.remember(text, corrected, 'openrouter');
        return { provider: 'openrouter', text: corrected };
      } catch {
        // The frontend retains its immediate local transliteration when every
        // configured remote provider is unavailable.
      }
    }

    throw new ServiceUnavailableException('Marathi translation providers are temporarily unavailable.');
  }

  private async translateWithGroq(text: string, key: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4_000);
    const model = this.config.get('GROQ_TRANSLATION_MODEL', { infer: true }).trim();

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        body: JSON.stringify({
          max_tokens: 256,
          messages: [
            {
              content: [
                'You are an expert Marathi address editor for official receipts.',
                'Convert the supplied English or Romanized Marathi text to natural Marathi in Devanagari.',
                'Transliterate proper names, buildings, societies and localities phonetically; do not translate their meaning.',
                'Translate generic address words naturally: Main Road means मुख्य रस्ता, Road means रस्ता, Near means जवळ and Lane Number means गल्ली क्रमांक.',
                'Text already written in Devanagari is verified and must be copied exactly without respelling it.',
                'Preserve all numbers using the same digits and preserve punctuation. Never add, remove, infer or explain information.',
                'Return only the converted Marathi text, without quotes, labels, markdown or commentary.',
              ].join(' '),
              role: 'system',
            },
            { content: text, role: 'user' },
          ],
          model,
          temperature: 0.1,
        }),
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ServiceUnavailableException(`Groq Marathi translation failed with status ${response.status}.`);
      }

      const payload = await response.json() as GroqChatCompletionResult;
      const translated = sanitizeMarathiTranslation(payload.choices?.[0]?.message?.content, text);
      if (!translated) throw new ServiceUnavailableException('Groq Marathi translation returned invalid text.');
      return translated;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async translateWithOpenRouter(text: string, key: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4_000);
    const model = this.config.get('OPENROUTER_TRANSLATION_MODEL', { infer: true }).trim();
    const webBaseUrl = this.config.get('PUBLIC_WEB_BASE_URL', { infer: true });

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        body: JSON.stringify({
          max_tokens: 256,
          messages: [
            {
              content: [
                'You are an expert Marathi address editor for official receipts.',
                'Convert the supplied English or Romanized Marathi text to natural Marathi in Devanagari.',
                'Transliterate proper names, buildings, societies and localities phonetically; do not translate their meaning.',
                'Translate generic address words naturally: Main Road means मुख्य रस्ता, Road means रस्ता, Near means जवळ and Lane Number means गल्ली क्रमांक.',
                'Text already written in Devanagari is verified and must be copied exactly without respelling it.',
                'Preserve all numbers using the same digits and preserve punctuation. Never add, remove, infer or explain information.',
                'Return only the converted Marathi text, without quotes, labels, markdown or commentary.',
              ].join(' '),
              role: 'system',
            },
            { content: text, role: 'user' },
          ],
          model,
          temperature: 0.1,
        }),
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': webBaseUrl,
          'X-Title': 'Samavet ePawati',
        },
        method: 'POST',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ServiceUnavailableException(`OpenRouter Marathi translation failed with status ${response.status}.`);
      }

      const payload = await response.json() as GroqChatCompletionResult;
      const translated = sanitizeMarathiTranslation(payload.choices?.[0]?.message?.content, text);
      if (!translated) throw new ServiceUnavailableException('OpenRouter Marathi translation returned invalid text.');
      return translated;
    } finally {
      clearTimeout(timeout);
    }
  }

  private remember(source: string, translated: string, provider: RemoteTranslationProvider) {
    const cacheKey = source.toLocaleLowerCase('en-IN');
    if (this.cache.size >= 1_000) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(cacheKey, { provider, text: translated });
  }
}

function sanitizeMarathiTranslation(value: string | undefined, source: string) {
  if (!value) return '';
  const text = value
    .trim()
    .replace(/^```(?:text)?\s*/i, '')
    .replace(/\s*```$/, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim();
  if (!text || /\r|\n/.test(text) || !/[\u0900-\u097F]/.test(text)) return '';
  if (text.length > Math.max(80, source.length * 5)) return '';
  const normalizedDigits = text.replace(/[०-९]/g, (digit) => String('०१२३४५६७८९'.indexOf(digit)));
  const sourceNumbers = source.match(/\d+/g) ?? [];
  const translatedNumbers = normalizedDigits.match(/\d+/g) ?? [];
  if (sourceNumbers.join('|') !== translatedNumbers.join('|')) return '';
  return normalizedDigits;
}
