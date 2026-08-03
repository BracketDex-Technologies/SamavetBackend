import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { AppConfig } from '../config/app-config';
import { TranslationService } from './translation.service';

function createService(overrides: Partial<AppConfig> = {}) {
  const values = {
    AZURE_TRANSLATOR_ENDPOINT: 'https://api.cognitive.microsofttranslator.com',
    AZURE_TRANSLATOR_KEY: 'test-key',
    AZURE_TRANSLATOR_REGION: 'centralindia',
    GOOGLE_TRANSLATE_API_KEY: '',
    GROQ_API_KEY: '',
    GROQ_TRANSLATION_MODEL: 'llama-3.3-70b-versatile',
    ...overrides,
  };
  const config = { get: (key: keyof AppConfig) => values[key as keyof typeof values] } as ConfigService<AppConfig, true>;
  return new TranslationService(config);
}

describe('TranslationService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns Devanagari input unchanged without calling Azure', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    await expect(createService().transliterateMarathi('पुणे')).resolves.toEqual({ provider: 'unchanged', text: 'पुणे' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('uses the canonical Marathi spelling for known Pune localities', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const service = createService({ AZURE_TRANSLATOR_KEY: '' });

    await expect(service.transliterateMarathi('Wanawadi')).resolves.toEqual({
      provider: 'locality-glossary',
      text: 'वानवडी',
    });
    await expect(service.transliterateMarathi('  WANWADI  ')).resolves.toEqual({
      provider: 'locality-glossary',
      text: 'वानवडी',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('corrects known locality variants returned by Azure', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([{ script: 'Deva', text: 'वनावाडी, पुणे' }]), { status: 200 }),
    );

    await expect(createService().transliterateMarathi('Wanawadi, Pune')).resolves.toEqual({
      provider: 'azure',
      text: 'वानवडी, पुणे',
    });
  });

  it('calls Azure Marathi Latin-to-Devanagari transliteration and caches the result', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify([{ script: 'Deva', text: 'सदाशिव पेठ' }]), { status: 200 }));
    const service = createService();

    await expect(service.transliterateMarathi('Sadashiv Peth')).resolves.toEqual({ provider: 'azure', text: 'सदाशिव पेठ' });
    await expect(service.transliterateMarathi('sadashiv peth')).resolves.toEqual({ provider: 'azure-cache', text: 'सदाशिव पेठ' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('uses Groq first and caches a validated Marathi result', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'सदाशिव पेठ, मुख्य रस्ता' } }],
    }), { status: 200 }));
    const service = createService({ GROQ_API_KEY: 'groq-key' });

    await expect(service.transliterateMarathi('Sadashiv Peth, Main Road')).resolves.toEqual({
      provider: 'groq',
      text: 'सदाशिव पेठ, मुख्य रस्ता',
    });
    await expect(service.transliterateMarathi('sadashiv peth, main road')).resolves.toEqual({
      provider: 'groq-cache',
      text: 'सदाशिव पेठ, मुख्य रस्ता',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('falls back to Azure when Groq is unavailable', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ script: 'Deva', text: 'सदाशिव पेठ' }]), { status: 200 }));

    await expect(createService({ GROQ_API_KEY: 'groq-key' }).transliterateMarathi('Sadashiv Peth'))
      .resolves.toEqual({ provider: 'azure', text: 'सदाशिव पेठ' });
    expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(fetchSpy.mock.calls[1]?.[0]).toContain('api.cognitive.microsofttranslator.com/transliterate');
  });

  it('uses Google NMT when Azure is not configured and caches its Marathi translation', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: { translations: [{ translatedText: 'मुख्य रस्ता, पुणे' }] },
    }), { status: 200 }));
    const service = createService({ AZURE_TRANSLATOR_KEY: '', GOOGLE_TRANSLATE_API_KEY: 'google-key' });

    await expect(service.transliterateMarathi('Main road, Pune')).resolves.toEqual({
      provider: 'google',
      text: 'मुख्य रस्ता, पुणे',
    });
    await expect(service.transliterateMarathi('main road, pune')).resolves.toEqual({
      provider: 'google-cache',
      text: 'मुख्य रस्ता, पुणे',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://translation.googleapis.com/language/translate/v2?key=google-key',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('falls back to Google when Azure quota is exhausted', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { translations: [{ translatedText: 'सदाशिव पेठ' }] },
      }), { status: 200 }));

    await expect(createService({ GOOGLE_TRANSLATE_API_KEY: 'google-key' }).transliterateMarathi('Sadashiv Peth'))
      .resolves.toEqual({ provider: 'google', text: 'सदाशिव पेठ' });
    expect(fetchSpy.mock.calls[0]?.[0]).toContain('api.cognitive.microsofttranslator.com/transliterate');
    expect(fetchSpy.mock.calls[1]?.[0]).toBe('https://translation.googleapis.com/language/translate/v2?key=google-key');
  });

  it('uses a clear unavailable response when the key is missing', async () => {
    await expect(createService({ AZURE_TRANSLATOR_KEY: '' }).transliterateMarathi('Pune')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
