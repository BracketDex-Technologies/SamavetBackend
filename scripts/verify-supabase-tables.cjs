const { PrismaClient } = require('../packages/database/node_modules/@prisma/client');

const expectedTables = [
  'audit_events',
  'custom_fields',
  'expense_categories',
  'expenses',
  'festivals',
  'mandals',
  'member_groups',
  'members',
  'slip_sequences',
  'slip_template_versions',
  'slip_templates',
  'user_sessions',
  'users',
  'vargani_slips',
];

async function main() {
  const prisma = new PrismaClient();
  const rows = await prisma.$queryRaw`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
    order by table_name
  `;
  await prisma.$disconnect();

  const actualTables = rows.map((row) => row.table_name);
  const missingTables = expectedTables.filter((table) => !actualTables.includes(table));

  console.log(actualTables.join('\n'));

  if (missingTables.length > 0) {
    console.error(`Missing tables: ${missingTables.join(', ')}`);
    process.exit(1);
  }
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
