import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/app-config';

interface AzureTransliterationResult {
  script?: string;
  text?: string;
}

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
  वनवडी: 'वानवडी',
  वनावाडी: 'वानवडी',
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

@Injectable()
export class TranslationService {
  private readonly cache = new Map<string, string>();

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async transliterateMarathi(input: string) {
    const text = input.trim();
    if (!/[A-Za-z]/.test(text)) return { provider: 'unchanged', text };

    const lookup = normalizeLookup(text);
    const glossaryMatch = MARATHI_ADDRESS_GLOSSARY[lookup];
    if (glossaryMatch) return { provider: 'locality-glossary', text: glossaryMatch };

    const cached = this.cache.get(lookup);
    if (cached) return { provider: 'azure-cache', text: cached };

    const key = this.config.get('AZURE_TRANSLATOR_KEY', { infer: true }).trim();
    if (!key) {
      throw new ServiceUnavailableException('Azure Marathi transliteration is not configured.');
    }

    const endpoint = this.config.get('AZURE_TRANSLATOR_ENDPOINT', { infer: true }).replace(/\/$/, '');
    const region = this.config.get('AZURE_TRANSLATOR_REGION', { infer: true }).trim();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2_000);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': key,
      };
      if (region) headers['Ocp-Apim-Subscription-Region'] = region;

      const response = await fetch(
        `${endpoint}/transliterate?api-version=3.0&language=mr&fromScript=Latn&toScript=Deva`,
        {
          body: JSON.stringify([{ Text: text }]),
          headers,
          method: 'POST',
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new ServiceUnavailableException(`Azure Marathi transliteration failed with status ${response.status}.`);
      }

      const payload = await response.json() as AzureTransliterationResult[];
      const translated = payload[0]?.text?.trim();
      if (!translated) throw new ServiceUnavailableException('Azure Marathi transliteration returned no text.');

      const corrected = correctKnownMarathiSpellings(translated);
      this.remember(text, corrected);
      return { provider: 'azure', text: corrected };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('Azure Marathi transliteration is temporarily unavailable.');
    } finally {
      clearTimeout(timeout);
    }
  }

  private remember(source: string, translated: string) {
    const cacheKey = source.toLocaleLowerCase('en-IN');
    if (this.cache.size >= 1_000) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(cacheKey, translated);
  }
}
