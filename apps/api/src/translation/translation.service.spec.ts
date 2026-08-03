import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { AppConfig } from '../config/app-config';
import { TranslationService } from './translation.service';

function createService(overrides: Partial<AppConfig> = {}) {
  const values = {
    AZURE_TRANSLATOR_ENDPOINT: 'https://api.cognitive.microsofttranslator.com',
    AZURE_TRANSLATOR_KEY: 'test-key',
    AZURE_TRANSLATOR_REGION: 'centralindia',
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

  it('uses a clear unavailable response when the key is missing', async () => {
    await expect(createService({ AZURE_TRANSLATOR_KEY: '' }).transliterateMarathi('Pune')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
