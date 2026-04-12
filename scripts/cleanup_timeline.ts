import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupDuplicates() {
  console.log("🧹 Starting Timeline Cleanup...");
  
  const user = await prisma.user.findFirst();
  if (!user) {
    console.log("❌ No user found. Aborting.");
    return;
  }

  // 1. Deduplicate Tasks
  const tasks = await prisma.task.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' }
  });

  const seenTasks = new Set();
  const tasksToDelete = [];

  for (const task of tasks) {
    const key = `${task.title.toLowerCase()}|${task.category}`;
    if (seenTasks.has(key)) {
      tasksToDelete.push(task.id);
    } else {
      seenTasks.add(key);
    }
  }

  if (tasksToDelete.length > 0) {
    await prisma.task.deleteMany({
      where: { id: { in: tasksToDelete } }
    });
    console.log(`✅ Purged ${tasksToDelete.length} duplicate tasks.`);
  } else {
    console.log("✨ No duplicate tasks found.");
  }

  console.log("🏁 Cleanup Complete!");
}

cleanupDuplicates()
  .catch(err => console.error("❌ Cleanup failed:", err))
  .finally(() => prisma.$disconnect());
