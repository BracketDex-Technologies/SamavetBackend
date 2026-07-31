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

    const contributorName = input.contributorName.trim();
    const organizationName = input.organizationName?.trim() || input.mandalName.trim();
    const mandalName = input.mandalName.trim();
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
