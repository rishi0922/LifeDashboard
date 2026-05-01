const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const user = await prisma.user.findFirst();
  if (!user) {
    console.log("No user found");
    return;
  }
  try {
    const t = await prisma.task.create({
      data: {
        title: "Test Task from Node",
        category: "Work",
        userId: user.id
      }
    });
    console.log("Created successfully:", t);
  } catch(e) {
    console.error("Failed to create task:", e);
  }
}
check();
