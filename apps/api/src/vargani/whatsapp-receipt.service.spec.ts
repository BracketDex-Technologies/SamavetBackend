import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/app-config';
import { WhatsAppReceiptService } from './whatsapp-receipt.service';

const configValues: Partial<Record<keyof AppConfig, unknown>> = {
  AUTHKEY_API_KEY: 'test-authkey',
  AUTHKEY_WHATSAPP_COUNTRY_CODE: '91',
  AUTHKEY_WHATSAPP_ENABLED: true,
  AUTHKEY_WHATSAPP_HEADER_FILE_NAME: 'Receipt',
  AUTHKEY_WHATSAPP_HEADER_MEDIA_URL: '',
  AUTHKEY_WHATSAPP_RECEIPT_WID: 'global-wid',
  AUTHKEY_WHATSAPP_TEMPLATE_TYPE: 'media',
  AUTHKEY_WHATSAPP_WID: '',
};

function createService() {
  const config = {
    get: jest.fn((key: keyof AppConfig) => configValues[key]),
  } as unknown as ConfigService<AppConfig, true>;
  return new WhatsAppReceiptService(config);
}

describe('WhatsAppReceiptService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('normalizes and caches the Authkey template catalogue', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: [
        {
          temp_body: 'Hello {{1}} from {{2}} — {{3}}',
          temp_category: 'Utility',
          temp_language: 'mr',
          temp_name: 'approved_receipt',
          temp_status: 1,
          wid: 43015,
        },
        {
          temp_body: 'Hello {{4}}',
          temp_category: 'Utility',
          temp_language: 'en',
          temp_name: 'pending_incompatible',
          temp_status: 0,
          wid: 43048,
        },
      ],
      status: true,
    }), { status: 200 }));
    const service = createService();

    const first = await service.listTemplates();
    const second = await service.listTemplates();

    expect(first.cached).toBe(false);
    expect(first.defaultWid).toBe('global-wid');
    expect(first.items[0]).toMatchObject({
      approved: true,
      compatible: true,
      name: 'approved_receipt',
      variableCount: 3,
      wid: '43015',
    });
    expect(first.items[1]).toMatchObject({ approved: false, compatible: false, variableCount: 1 });
    expect(second.cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses a mandal WID and omits body values for a zero-variable template', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const service = createService();

    const result = await service.sendReceipt({
      contributorName: 'Darshan',
      mandalName: 'Ganesh Mandal',
      mediaUrl: 'https://example.com/receipt.png',
      phone: '9876543210',
      receiptUrl: 'https://example.com/receipt',
      slipNumber: 'DM-GAN-2026-000001',
      templateVariableCount: 0,
      templateWid: '42702',
    });

    const request = fetchMock.mock.calls[0]?.[1];
    const payload = JSON.parse(String(request?.body)) as Record<string, unknown>;
    expect(payload.wid).toBe('42702');
    expect(payload.bodyValues).toBeUndefined();
    expect(request?.signal).toBeInstanceOf(AbortSignal);
    expect(result).toMatchObject({ ok: true, status: 'sent' });
  });
});
