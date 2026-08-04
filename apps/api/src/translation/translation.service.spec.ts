import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/app-config';
import { TranslationService } from './translation.service';

function createService(overrides: Partial<AppConfig> = {}) {
  const values = {
    GROQ_API_KEY: '',
    GROQ_TRANSLATION_MODEL: 'llama-3.3-70b-versatile',
    OPENROUTER_API_KEY: '',
    OPENROUTER_TRANSLATION_MODEL: 'openrouter/free',
    PUBLIC_WEB_BASE_URL: 'https://epawati.samavet.in',
    ...overrides,
  };
  const config = { get: (key: keyof AppConfig) => values[key as keyof typeof values] } as ConfigService<AppConfig, true>;
  return new TranslationService(config);
}

describe('TranslationService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns Devanagari input unchanged without calling a remote provider', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    await expect(createService().transliterateMarathi('\u092a\u0941\u0923\u0947')).resolves.toEqual({
      provider: 'unchanged',
      text: '\u092a\u0941\u0923\u0947',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('uses the canonical Marathi spelling for known Pune localities', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const service = createService();

    await expect(service.transliterateMarathi('Wanawadi')).resolves.toEqual({
      provider: 'locality-glossary',
      text: '\u0935\u093e\u0928\u0935\u0921\u0940',
    });
    await expect(service.transliterateMarathi('  WANWADI  ')).resolves.toEqual({
      provider: 'locality-glossary',
      text: '\u0935\u093e\u0928\u0935\u0921\u0940',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('uses Groq first and caches a validated Marathi result', async () => {
    const translated = '\u0938\u0926\u093e\u0936\u093f\u0935 \u092a\u0947\u0920, \u092e\u0941\u0916\u094d\u092f \u0930\u0938\u094d\u0924\u093e';
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: translated } }],
    }), { status: 200 }));
    const service = createService({ GROQ_API_KEY: 'groq-key' });

    await expect(service.transliterateMarathi('Sadashiv Peth, Main Road')).resolves.toEqual({
      provider: 'groq',
      text: translated,
    });
    await expect(service.transliterateMarathi('sadashiv peth, main road')).resolves.toEqual({
      provider: 'groq-cache',
      text: translated,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('locks verified Pune locality spellings inside longer Groq addresses and preserves ASCII digits', async () => {
    const translated = '\u092b\u094d\u0932\u0945\u091f \u0967\u0968, \u0915\u0947\u0926\u093e\u0930\u0940 \u0928\u0917\u0930, \u092e\u0941\u0916\u094d\u092f \u0930\u0938\u094d\u0924\u093e \u091c\u0935\u0933, \u0935\u093e\u0928\u0935\u0921\u0940, \u092a\u0941\u0923\u0947';
    const expected = '\u092b\u094d\u0932\u0945\u091f 12, \u0915\u0947\u0926\u093e\u0930\u0940 \u0928\u0917\u0930, \u092e\u0941\u0916\u094d\u092f \u0930\u0938\u094d\u0924\u093e \u091c\u0935\u0933, \u0935\u093e\u0928\u0935\u0921\u0940, \u092a\u0941\u0923\u0947';
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: translated } }],
    }), { status: 200 }));

    await expect(createService({ GROQ_API_KEY: 'groq-key' }).transliterateMarathi(
      'Flat 12, Kedari Nagar, Near Main Road, Wanawadi, Pune',
    )).resolves.toEqual({
      provider: 'groq',
      text: expected,
    });

    const request = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body)) as { messages: Array<{ content: string }> };
    expect(request.messages[1]?.content).toContain('\u0935\u093e\u0928\u0935\u0921\u0940');
    expect(request.messages[1]?.content).not.toContain('Wanawadi');
  });

  it('falls back to OpenRouter when Groq is unavailable', async () => {
    const translated = '\u0938\u0926\u093e\u0936\u093f\u0935 \u092a\u0947\u0920';
    const fetchSpy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: translated } }],
      }), { status: 200 }));

    await expect(createService({
      GROQ_API_KEY: 'groq-key',
      OPENROUTER_API_KEY: 'openrouter-key',
    }).transliterateMarathi('Sadashiv Peth')).resolves.toEqual({
      provider: 'openrouter',
      text: translated,
    });
    expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(fetchSpy.mock.calls[1]?.[0]).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(fetchSpy.mock.calls[1]?.[1]).toEqual(expect.objectContaining({
      headers: expect.objectContaining({
        'HTTP-Referer': 'https://epawati.samavet.in',
        'X-Title': 'Samavet ePawati',
      }),
      method: 'POST',
    }));
  });

  it('uses OpenRouter directly when Groq is not configured and caches its Marathi translation', async () => {
    const translated = '\u092e\u0941\u0916\u094d\u092f \u0930\u0938\u094d\u0924\u093e, \u092a\u0941\u0923\u0947';
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: translated } }],
    }), { status: 200 }));
    const service = createService({ OPENROUTER_API_KEY: 'openrouter-key' });

    await expect(service.transliterateMarathi('Main road, Pune')).resolves.toEqual({
      provider: 'openrouter',
      text: translated,
    });
    await expect(service.transliterateMarathi('main road, pune')).resolves.toEqual({
      provider: 'openrouter-cache',
      text: translated,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('uses a clear unavailable response when remote keys are missing', async () => {
    await expect(createService().transliterateMarathi('Pune')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('uses a clear unavailable response when Groq is over quota and OpenRouter is missing', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 429 }));

    await expect(createService({ GROQ_API_KEY: 'groq-key' }).transliterateMarathi('Sadashiv Peth'))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://api.groq.com/openai/v1/chat/completions');
  });
});
