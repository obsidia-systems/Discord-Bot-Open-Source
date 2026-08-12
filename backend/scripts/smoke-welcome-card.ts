import { writeFileSync } from "node:fs";
import { buildWelcomeCard } from "../src/bot/utils/WelcomeCardBuilder.js";

async function main(): Promise<void> {
  const buf = await buildWelcomeCard({
    user: {
      username: "Oliver",
      displayName: "Oliver",
      avatarUrl: "https://cdn.discordapp.com/embed/avatars/0.png",
    },
    primaryText: "¡Bienvenido a Adobos!",
    secondaryText: "Oliver",
    textX: 1276,
    textY: 393,
    avatarX: 442,
    avatarY: 556,
    avatarSize: 280,
    textColor: "#FFFFFF",
    blurAmount: 0,
  });
  writeFileSync("/tmp/welcome-test.png", buf);
  console.log(`[ok] welcome-test.png (${buf.length} bytes)`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
