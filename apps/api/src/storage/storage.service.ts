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
  private?: boolean;
}

interface UploadBufferInput {
  body: Buffer;
  contentType: string;
  folder: string;
  fileName?: string;
  private?: boolean;
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
  private readonly receiptBucket: string;
  private readonly signedUrlTtlSeconds: number;
  private readonly readyBuckets = new Set<string>();
  private readonly client?: SupabaseClient;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    this.bucket = this.config.get('SUPABASE_STORAGE_BUCKET', { infer: true });
    this.receiptBucket = this.config.get('SUPABASE_RECEIPT_BUCKET', { infer: true });
    this.signedUrlTtlSeconds = this.config.get('STORAGE_SIGNED_URL_TTL_SECONDS', { infer: true });
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

    return this.uploadBuffer({
      body: parsed.body,
      contentType: parsed.contentType,
      fileName: input.fileName,
      folder: input.folder,
      private: input.private,
    });
  }

  async uploadBuffer(input: UploadBufferInput): Promise<StoredAsset> {
    if (!input.contentType.startsWith('image/')) {
      throw new BadRequestException('Only image uploads are allowed.');
    }
    if (input.body.byteLength > 6 * 1024 * 1024) {
      throw new BadRequestException('Image must be 6 MB or smaller.');
    }

    if (!this.client) {
      return {
        bucket: this.bucket,
        key: null,
        storage: 'inline',
        url: `data:${input.contentType};base64,${input.body.toString('base64')}`,
      };
    }

    const targetBucket = input.private ? this.receiptBucket : this.bucket;
    await this.ensureBucket(targetBucket, !input.private);

    const extension = extensionForContentType(input.contentType);
    const safeName = safeFileName(input.fileName ?? `template.${extension}`);
    const key = `${trimSlashes(input.folder)}/${Date.now()}-${safeName}`;
    const { error } = await this.client.storage.from(targetBucket).upload(key, input.body, {
      cacheControl: '31536000',
      contentType: input.contentType,
      upsert: true,
    });

    if (error) {
      throw new InternalServerErrorException(`Supabase Storage upload failed: ${error.message}`);
    }

    const url = input.private
      ? storageReference(targetBucket, key)
      : this.client.storage.from(targetBucket).getPublicUrl(key).data.publicUrl;
    return {
      bucket: targetBucket,
      key,
      storage: 'supabase',
      url,
    };
  }

  async resolveUrl(value: string | null | undefined, expiresInSeconds = this.signedUrlTtlSeconds) {
    if (!value || !value.startsWith('supabase://') || !this.client) return value ?? null;
    const reference = parseStorageReference(value);
    if (!reference) return null;
    const { data, error } = await this.client.storage
      .from(reference.bucket)
      .createSignedUrl(reference.key, expiresInSeconds);
    if (error) {
      throw new InternalServerErrorException(`Supabase Storage signed URL failed: ${error.message}`);
    }
    return data.signedUrl;
  }

  private async ensureBucket(bucketName: string, isPublic: boolean) {
    if (!this.client || this.readyBuckets.has(bucketName)) return;

    const { data: buckets, error: listError } = await this.client.storage.listBuckets();
    if (listError) {
      throw new InternalServerErrorException(`Supabase Storage bucket check failed: ${listError.message}`);
    }

    const existingBucket = buckets?.find((bucket) => bucket.name === bucketName);
    if (!existingBucket) {
      const { error: createError } = await this.client.storage.createBucket(bucketName, {
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'],
        fileSizeLimit: 10 * 1024 * 1024,
        public: isPublic,
      });

      if (createError) {
        throw new InternalServerErrorException(`Supabase Storage bucket create failed: ${createError.message}`);
      }
    } else if (existingBucket.public !== isPublic) {
      const { error: updateError } = await this.client.storage.updateBucket(bucketName, {
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'],
        fileSizeLimit: 10 * 1024 * 1024,
        public: isPublic,
      });
      if (updateError) {
        throw new InternalServerErrorException(`Supabase Storage bucket policy update failed: ${updateError.message}`);
      }
    }

    this.readyBuckets.add(bucketName);
  }
}

function storageReference(bucket: string, key: string) {
  return `supabase://${encodeURIComponent(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

function parseStorageReference(value: string) {
  try {
    const url = new URL(value);
    const bucket = decodeURIComponent(url.hostname);
    const key = url.pathname.split('/').filter(Boolean).map(decodeURIComponent).join('/');
    return bucket && key ? { bucket, key } : null;
  } catch {
    return null;
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
  const normalized = value
    .trim()
    .replace(/[^a-z0-9._-]+/giu, '-');
  return trimEdgeCharacter(normalized, '-').slice(0, 120) || 'asset.png';
}

function trimSlashes(value: string) {
  return trimEdgeCharacter(value, '/');
}

function trimEdgeCharacter(value: string, character: string) {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === character) start += 1;
  while (end > start && value[end - 1] === character) end -= 1;
  return value.slice(start, end);
}

function extensionForContentType(contentType: string) {
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'image/svg+xml') return 'svg';
  return 'png';
}
