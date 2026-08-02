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
  templateVariableCount?: number | null;
  templateWid?: string | null;
}

interface AuthkeyTemplateApiRecord {
  error_desc_creation?: unknown;
  temp_body?: unknown;
  temp_category?: unknown;
  temp_language?: unknown;
  temp_name?: unknown;
  temp_status?: unknown;
  wid?: unknown;
}

interface AuthkeyTemplateApiResponse {
  data?: unknown;
  status?: unknown;
}

export interface AuthkeyWhatsAppTemplate {
  approved: boolean;
  body: string;
  category: string;
  compatible: boolean;
  language: string;
  name: string;
  rejectionReason: string | null;
  variableCount: number;
  wid: string;
}

export interface AuthkeyWhatsAppTemplateCatalog {
  cached: boolean;
  defaultWid: string | null;
  items: AuthkeyWhatsAppTemplate[];
  syncedAt: string;
}

export interface WhatsAppSendResult {
  ok: boolean;
  provider?: 'AUTHKEY';
  reason?: string;
  receiptUrl?: string;
  status: 'failed' | 'sent' | 'skipped';
  templateWid?: string;
}

@Injectable()
export class WhatsAppReceiptService {
  private readonly logger = new Logger(WhatsAppReceiptService.name);
  private templateCache: { expiresAt: number; items: AuthkeyWhatsAppTemplate[]; syncedAt: string } | null = null;
  private templateRequest: Promise<AuthkeyWhatsAppTemplateCatalog> | null = null;

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async listTemplates(forceRefresh = false): Promise<AuthkeyWhatsAppTemplateCatalog> {
    const now = Date.now();
    if (!forceRefresh && this.templateCache && this.templateCache.expiresAt > now) {
      return {
        cached: true,
        defaultWid: this.defaultTemplateWid() || null,
        items: this.templateCache.items,
        syncedAt: this.templateCache.syncedAt,
      };
    }

    if (this.templateRequest) return this.templateRequest;

    this.templateRequest = this.fetchTemplates().finally(() => {
      this.templateRequest = null;
    });
    return this.templateRequest;
  }

  async sendReceipt(input: SendReceiptInput): Promise<WhatsAppSendResult> {
    const enabled = this.config.get('AUTHKEY_WHATSAPP_ENABLED', { infer: true });
    const authkey = this.config.get('AUTHKEY_API_KEY', { infer: true }).trim();
    const wid = input.templateWid?.trim() ||
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
      return {
        ok: false,
        provider: 'AUTHKEY',
        reason: 'missing_public_header_media_url',
        status: 'failed',
        templateWid: wid,
      };
    }

    const contributorName = input.contributorName.trim();
    const organizationName = input.organizationName?.trim() || input.mandalName.trim();
    const mandalName = input.mandalName.trim();
    const templateVariableCount = Number.isInteger(input.templateVariableCount)
      ? Math.max(0, Math.min(3, Number(input.templateVariableCount)))
      : 3;
    const bodyValueCandidates = [contributorName, organizationName, mandalName];
    const bodyValues = Object.fromEntries(
      bodyValueCandidates.slice(0, templateVariableCount).map((value, index) => [String(index + 1), value]),
    );
    const payload = {
      country_code: this.config.get('AUTHKEY_WHATSAPP_COUNTRY_CODE', { infer: true }).trim() || '91',
      mobile: phone,
      wid,
      type: templateType,
      ...(templateVariableCount > 0 ? { bodyValues } : {}),
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

    this.logger.log(
      `Sending Authkey WhatsApp receipt slip=${input.slipNumber} template=${wid} type=${templateType}`,
    );

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
      if (!response.ok) {
        // Provider bodies can echo names, phone numbers, media URLs, or credentials.
        // Keep application logs metadata-only; the provider dashboard remains the
        // source for inspecting delivery-specific response content.
        this.logger.warn(
          `Authkey WhatsApp failed slip=${input.slipNumber} template=${wid} status=${response.status} bodyBytes=${Buffer.byteLength(responseText)}`,
        );
        return {
          ok: false,
          provider: 'AUTHKEY',
          reason: `authkey_http_${response.status}`,
          status: 'failed',
          templateWid: wid,
        };
      }

      this.logger.log(
        `Authkey WhatsApp accepted slip=${input.slipNumber} template=${wid} status=${response.status}`,
      );
      return { ok: true, provider: 'AUTHKEY', status: 'sent', templateWid: wid };
    } catch (error) {
      const errorName = error instanceof Error ? error.name : 'UnknownError';
      this.logger.warn(`Authkey WhatsApp request error slip=${input.slipNumber} template=${wid} type=${errorName}`);
      return {
        ok: false,
        provider: 'AUTHKEY',
        reason: 'authkey_request_failed',
        status: 'failed',
        templateWid: wid,
      };
    }
  }

  private async fetchTemplates(): Promise<AuthkeyWhatsAppTemplateCatalog> {
    const authkey = this.config.get('AUTHKEY_API_KEY', { infer: true }).trim();
    if (!authkey) throw new Error('Authkey API key is not configured.');

    try {
      const response = await fetch('https://console.authkey.io/restapi/getAllTemplate.php', {
        body: JSON.stringify({ channel: 'whatsapp' }),
        headers: {
          Authorization: `Basic ${authkey}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) throw new Error(`Authkey template API returned HTTP ${response.status}.`);
      const payload = await response.json() as AuthkeyTemplateApiResponse;
      const records = Array.isArray(payload.data) ? payload.data as AuthkeyTemplateApiRecord[] : [];
      const items = records
        .map((record) => normalizeTemplate(record))
        .filter((record): record is AuthkeyWhatsAppTemplate => record !== null)
        .sort((left, right) => Number(right.approved) - Number(left.approved) || left.name.localeCompare(right.name));
      const syncedAt = new Date().toISOString();

      this.templateCache = {
        expiresAt: Date.now() + 5 * 60_000,
        items,
        syncedAt,
      };
      return { cached: false, defaultWid: this.defaultTemplateWid() || null, items, syncedAt };
    } catch (error) {
      if (this.templateCache) {
        this.logger.warn(`Authkey template refresh failed; serving cached catalogue: ${errorMessage(error)}`);
        return {
          cached: true,
          defaultWid: this.defaultTemplateWid() || null,
          items: this.templateCache.items,
          syncedAt: this.templateCache.syncedAt,
        };
      }
      throw error;
    }
  }

  private defaultTemplateWid() {
    return this.config.get('AUTHKEY_WHATSAPP_RECEIPT_WID', { infer: true }).trim() ||
      this.config.get('AUTHKEY_WHATSAPP_WID', { infer: true }).trim();
  }
}

function normalizeTemplate(record: AuthkeyTemplateApiRecord): AuthkeyWhatsAppTemplate | null {
  const wid = String(record.wid ?? '').trim();
  const name = String(record.temp_name ?? '').trim();
  if (!/^\d+$/.test(wid) || !name) return null;

  const body = String(record.temp_body ?? '');
  const variableIndexes = [...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)]
    .map((match) => Number(match[1]))
    .filter((value, index, values) => Number.isInteger(value) && values.indexOf(value) === index)
    .sort((left, right) => left - right);
  const variableCount = variableIndexes.length;
  const compatible = variableCount <= 3 && variableIndexes.every((value, index) => value === index + 1);

  return {
    approved: String(record.temp_status ?? '').trim() === '1',
    body,
    category: String(record.temp_category ?? '').trim() || 'Unknown',
    compatible,
    language: String(record.temp_language ?? '').trim() || 'unknown',
    name,
    rejectionReason: String(record.error_desc_creation ?? '').trim() || null,
    variableCount,
    wid,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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
