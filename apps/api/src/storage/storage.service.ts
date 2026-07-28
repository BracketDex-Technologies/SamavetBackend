import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppConfig } from '../config/app-config';

interface UploadDataUrlInput {
  dataUrl: string;
  folder: string;
  fileName?: string;
}

export interface StoredAsset {
  bucket: string;
  key: string | null;
  storage: 'inline' | 'supabase';
  url: string;
}

@Injectable()
export class StorageService {
  private readonly bucket: string;
  private bucketReady = false;
  private readonly client?: SupabaseClient;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    this.bucket = this.config.get('SUPABASE_STORAGE_BUCKET', { infer: true });
    const url = this.config.get('SUPABASE_URL', { infer: true });
    const serviceRoleKey = this.config.get('SUPABASE_SERVICE_ROLE_KEY', { infer: true });

    if (url && serviceRoleKey) {
      this.client = createClient(url, serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
    }
  }

  isConfigured() {
    return Boolean(this.client);
  }

  async uploadDataUrl(input: UploadDataUrlInput): Promise<StoredAsset> {
    const parsed = parseDataUrl(input.dataUrl);
    if (!parsed) {
      if (/^https?:\/\//.test(input.dataUrl) || input.dataUrl.startsWith('/')) {
        return {
          bucket: this.bucket,
          key: null,
          storage: 'inline',
          url: input.dataUrl,
        };
      }

      throw new BadRequestException('Template asset must be an image data URL or URL.');
    }

    if (!this.client) {
      return {
        bucket: this.bucket,
        key: null,
        storage: 'inline',
        url: input.dataUrl,
      };
    }

    await this.ensureBucket();

    const extension = extensionForContentType(parsed.contentType);
    const safeName = safeFileName(input.fileName ?? `template.${extension}`);
    const key = `${trimSlashes(input.folder)}/${Date.now()}-${safeName}`;
    const { error } = await this.client.storage.from(this.bucket).upload(key, parsed.body, {
      contentType: parsed.contentType,
      upsert: true,
    });

    if (error) {
      throw new InternalServerErrorException(`Supabase Storage upload failed: ${error.message}`);
    }

    const { data } = this.client.storage.from(this.bucket).getPublicUrl(key);
    return {
      bucket: this.bucket,
      key,
      storage: 'supabase',
      url: data.publicUrl,
    };
  }

  private async ensureBucket() {
    if (!this.client || this.bucketReady) return;

    const { data: buckets, error: listError } = await this.client.storage.listBuckets();
    if (listError) {
      throw new InternalServerErrorException(`Supabase Storage bucket check failed: ${listError.message}`);
    }

    if (!buckets?.some((bucket) => bucket.name === this.bucket)) {
      const { error: createError } = await this.client.storage.createBucket(this.bucket, {
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'],
        fileSizeLimit: 10 * 1024 * 1024,
        public: true,
      });

      if (createError) {
        throw new InternalServerErrorException(`Supabase Storage bucket create failed: ${createError.message}`);
      }
    }

    this.bucketReady = true;
  }
}

function parseDataUrl(dataUrl: string) {
  const match = /^data:([^;]+);base64,(.+)$/u.exec(dataUrl);
  if (!match) return null;

  return {
    body: Buffer.from(match[2], 'base64'),
    contentType: match[1],
  };
}

function safeFileName(value: string) {
  return value
    .trim()
    .replace(/[^a-z0-9._-]+/giu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'asset.png';
}

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, '');
}

function extensionForContentType(contentType: string) {
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'image/svg+xml') return 'svg';
  return 'png';
}
