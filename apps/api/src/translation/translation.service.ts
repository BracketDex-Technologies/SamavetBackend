import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/app-config';

interface AzureTransliterationResult {
  script?: string;
  text?: string;
}

@Injectable()
export class TranslationService {
  private readonly cache = new Map<string, string>();

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async transliterateMarathi(input: string) {
    const text = input.trim();
    if (!/[A-Za-z]/.test(text)) return { provider: 'unchanged', text };

    const cached = this.cache.get(text.toLocaleLowerCase('en-IN'));
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

      this.remember(text, translated);
      return { provider: 'azure', text: translated };
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
