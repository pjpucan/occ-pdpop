import { PrismaClient } from "@prisma/client";
import members from "./members.json";

const prisma = new PrismaClient();

function toCategoryEnum(category: string) {
  return category.toUpperCase().replace(/ /g, "_");
}

async function main() {
  console.log(`Seeding ${members.length} members...`);

  for (const m of members as any[]) {
    await prisma.member.create({
      data: {
        firstName: m.first,
        lastName: m.last,
        category: toCategoryEnum(m.category) as any,
        leaderStatus: m.activeLeader ? "ACTIVE" : m.potentialLeader ? "POTENTIAL" : "NONE",
        leaderName: m.activeLeader || m.potentialLeader || null,
        isVisitor: !!m.isVisitor,
        ...(m.bibleStudyGroup && {
          bibleStudy: {
            create: {
              group: {
                connectOrCreate: {
                  where: { name: m.bibleStudyGroup },
                  create: { name: m.bibleStudyGroup },
                },
              },
            },
          },
        }),
        ...(m.volunteer && {
          volunteer: { create: { ministry: m.ministry || null } },
        }),
      },
    });
  }

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
