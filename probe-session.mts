import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const token = process.argv[2];
const mode = process.argv[3];

async function main() {
  const hash = createHash("sha256").update(token).digest("hex");
  if (mode === "create") {
    const owner = await prisma.user.findFirst({ where: { role: "owner" } });
    await prisma.session.create({
      data: { userId: owner!.id, tokenHash: hash, userAgent: "verify-probe",
              expiresAt: new Date(Date.now() + 3600_000) },
    });
    console.log("session created for", owner!.email);
  } else {
    const r = await prisma.session.deleteMany({ where: { tokenHash: hash, userAgent: "verify-probe" } });
    console.log("sessions removed:", r.count);
  }
  await prisma.$disconnect();
}
main();
