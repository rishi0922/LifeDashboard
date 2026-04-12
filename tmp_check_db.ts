import { prisma } from "./src/lib/prisma";

async function main() {
  const user = await prisma.user.findFirst();
  if (!user) {
    console.log("No user found");
    return;
  }

  const tasks = await prisma.task.findMany({
    where: { userId: user.id }
  });
  console.log("DB TASKS:", JSON.stringify(tasks, null, 2));

  const prefs = await prisma.userPreference.findMany({
    where: { userId: user.id }
  });
  console.log("USER PREFS:", JSON.stringify(prefs, null, 2));
}

main();
