import { PrismaClient } from '@prisma/client';
require('dotenv').config();

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

async function main() {
  console.log('--- DIAGNOSTIC START ---');
  console.log('DATABASE_URL:', process.env.DATABASE_URL);
  try {
    const userCount = await prisma.user.count();
    console.log('Connection successful! User count:', userCount);
  } catch (err: any) {
    console.error('Connection failed!');
    console.error('Error Name:', err.name);
    console.error('Error Message:', err.message);
    if (err.code) console.error('Error Code:', err.code);
    if (err.meta) console.error('Error Meta:', JSON.stringify(err.meta));
  } finally {
    await prisma.$disconnect();
    console.log('--- DIAGNOSTIC END ---');
  }
}

main();
