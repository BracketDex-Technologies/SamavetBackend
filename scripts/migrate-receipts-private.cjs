const { PrismaClient } = require('@prisma/client');
const { createClient } = require('@supabase/supabase-js');

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required.`);
}

const sourceBucket = process.env.SUPABASE_STORAGE_BUCKET || 'digital-vargani';
const targetBucket = process.env.SUPABASE_RECEIPT_BUCKET || 'digital-vargani-receipts';
const apply = process.env.APPLY === 'true';
const prisma = new PrismaClient();
const storage = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function legacyObjectKey(url) {
  try {
    const parsed = new URL(url);
    const marker = `/storage/v1/object/public/${sourceBucket}/`;
    const offset = parsed.pathname.indexOf(marker);
    if (offset < 0) return null;
    const key = decodeURIComponent(parsed.pathname.slice(offset + marker.length));
    return key.includes('/receipts/') ? key : null;
  } catch {
    return null;
  }
}

function privateReference(key) {
  return `supabase://${encodeURIComponent(targetBucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

async function main() {
  const slips = await prisma.varganiSlip.findMany({
    select: { id: true, receiptImageUrl: true, slipNumber: true },
    where: { receiptImageUrl: { not: null } },
  });
  const candidates = slips
    .map((slip) => ({ ...slip, key: legacyObjectKey(slip.receiptImageUrl) }))
    .filter((slip) => slip.key);

  console.log(`${candidates.length} legacy public receipt(s) found. APPLY=${apply}`);
  if (!apply) {
    for (const slip of candidates.slice(0, 20)) console.log(`DRY RUN ${slip.slipNumber}: ${slip.key}`);
    return;
  }

  const { data: buckets, error: listError } = await storage.storage.listBuckets();
  if (listError) throw listError;
  if (!buckets.some((bucket) => bucket.name === targetBucket)) {
    const { error } = await storage.storage.createBucket(targetBucket, {
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      fileSizeLimit: 10 * 1024 * 1024,
      public: false,
    });
    if (error) throw error;
  }

  for (const slip of candidates) {
    const { data: file, error: downloadError } = await storage.storage.from(sourceBucket).download(slip.key);
    if (downloadError) throw new Error(`${slip.slipNumber}: ${downloadError.message}`);
    const body = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await storage.storage.from(targetBucket).upload(slip.key, body, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    });
    if (uploadError && !/already exists/i.test(uploadError.message)) throw uploadError;

    await prisma.varganiSlip.update({
      data: { receiptImageUrl: privateReference(slip.key) },
      where: { id: slip.id },
    });
    const { error: removeError } = await storage.storage.from(sourceBucket).remove([slip.key]);
    if (removeError) throw removeError;
    console.log(`MIGRATED ${slip.slipNumber}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
