import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { prisma } from "./prisma";

/**
 * Resolve the signed-in user's DB row (creating it on first sight), or
 * null when nobody is signed in.
 *
 * This replaces the scattered `prisma.user.findFirst()` fallbacks that
 * several routes used when no session was present. That pattern returned
 * whichever User row was inserted first — in practice a stale dev stub —
 * so widgets read/wrote the wrong account. Worse, on a deployed instance
 * the "first user" is a real person, so an unauthenticated request could
 * read their data. Callers must treat null as signed-out and return an
 * empty payload or 401, never fall back to an arbitrary user.
 */
export async function getSessionUser() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return null;
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: session.user?.name || email.split("@")[0] },
  });
}
