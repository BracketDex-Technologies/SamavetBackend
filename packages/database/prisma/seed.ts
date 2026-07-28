import argon2 from 'argon2';
import { AccountStatus, PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_SUPER_ADMIN_EMAIL;
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD;
  const name = process.env.SEED_SUPER_ADMIN_NAME ?? 'Digital Mandal Super Admin';

  if (!email || !password) {
    throw new Error('SEED_SUPER_ADMIN_EMAIL and SEED_SUPER_ADMIN_PASSWORD are required.');
  }

  if (password.length < 12) {
    throw new Error('SEED_SUPER_ADMIN_PASSWORD must be at least 12 characters.');
  }

  await prisma.user.upsert({
    create: {
      email: email.toLowerCase(),
      name,
      passwordHash: await argon2.hash(password),
      role: UserRole.SUPER_ADMIN,
      status: AccountStatus.ACTIVE,
    },
    update: {
      name,
      status: AccountStatus.ACTIVE,
    },
    where: {
      email: email.toLowerCase(),
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
