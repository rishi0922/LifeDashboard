import { PrismaClient } from '@prisma/client'

async function main() {
  const prisma = new PrismaClient()
  try {
    const tasks = await prisma.task.findMany()
    console.log('Successfully fetched tasks:', tasks)
  } catch (error) {
    console.error('Error fetching tasks:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
