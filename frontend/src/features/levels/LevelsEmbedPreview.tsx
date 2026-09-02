import {
  applyLevelsTokens,
  buildLevelsTokenMap,
  type LevelsConfig,
  type LevelsReward,
} from "@adobos/shared";

const MOCK = {
  userId: "1",
  username: "UsuarioDePrueba",
  level: 5,
  xp: 2500,
  serverName: "Servidor",
  avatar: "https://cdn.discordapp.com/embed/avatars/0.png",
  nextLevel: 10,
  guildIcon: "https://cdn.discordapp.com/embed/avatars/1.png",
};

/** Simula markdown básico (**bold**) para la preview. */
function renderRichText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const m = part.match(/^\*\*([^*]+)\*\*$/);
    if (m) {
      return (
        <strong key={i} className="font-semibold text-white">
          {m[1]}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function DiscordEmbedMock({
  color,
  title,
  description,
  thumbnailUrl,
  fields,
  footer,
}: {
  color: string;
  title?: string;
  description: string;
  thumbnailUrl?: string | null;
  fields?: { name: string; value: string }[];
  footer?: string;
}) {
  return (
    <div className="overflow-hidden rounded-md bg-[#2b2d31] text-[13px] text-[#dbdee1]">
      <div className="flex">
        <div
          className="w-1 shrink-0 self-stretch"
          style={{ backgroundColor: color || "#5865F2" }}
        />
        <div className="min-w-0 flex-1 space-y-2 p-3">
          <div className="flex gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              {title ? (
                <p className="text-sm font-semibold text-white">{title}</p>
              ) : null}
              <p className="whitespace-pre-wrap leading-relaxed text-[#dbdee1]">
                {renderRichText(description)}
              </p>
            </div>
            {thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt=""
                className="size-16 shrink-0 rounded-md object-cover"
              />
            ) : null}
          </div>
          {fields?.map((field) => (
            <div key={field.name} className="space-y-0.5">
              <p className="text-xs font-semibold text-white">{field.name}</p>
              <p className="whitespace-pre-wrap text-[#dbdee1]">
                {renderRichText(field.value)}
              </p>
            </div>
          ))}
          {footer ? (
            <p className="text-[11px] text-[#949ba4]">{footer}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function previewRewardsField(rewards: LevelsReward[]): string {
  const current = rewards.find((r) => r.level === MOCK.level);
  if (current) {
    return `Desbloqueaste el rol: @RolNivel${current.level}`;
  }
  const next = rewards
    .filter((r) => r.level > MOCK.level)
    .sort((a, b) => a.level - b.level)[0];
  if (next) {
    return `Próxima recompensa: @RolNivel${next.level} al Nivel **${next.level}**.`;
  }
  if (rewards.length === 0) {
    return `Próxima recompensa: @RolEjemplo al Nivel **${MOCK.nextLevel}**.`;
  }
  return "Has alcanzado el máximo nivel de recompensas.";
}

function mockTokens() {
  return buildLevelsTokenMap({
    userId: MOCK.userId,
    username: MOCK.username,
    level: MOCK.level,
    serverName: MOCK.serverName,
    xp: MOCK.xp,
  });
}

export function LevelUpDiscordPreview({
  config,
}: {
  config: LevelsConfig;
}) {
  const tokens = mockTokens();
  const mention = `@${MOCK.username}`;
  const filled = (raw: string) =>
    applyLevelsTokens(raw, { ...tokens, "{user}": mention });
  return (
    <DiscordEmbedMock
      color={config.levelUpEmbedColor || "#34E21D"}
      title={filled(config.levelUpEmbedTitle) || "¡Subida de Nivel!"}
      description={filled(config.levelUpMessage)}
      thumbnailUrl={config.levelUpShowThumbnail ? MOCK.avatar : null}
      fields={[
        {
          name: "Recompensas",
          value: previewRewardsField(config.rewards),
        },
      ]}
    />
  );
}

export function LeaderboardDiscordPreview({
  config,
  guildIconUrl,
}: {
  config?: LevelsConfig;
  guildIconUrl?: string | null;
}) {
  const ranking = [
    "1 | @UsuarioDePrueba | UsuarioDePrueba | Nivel **5** | `2,500 XP`",
    "2 | @OtroUsuario | OtroUsuario | Nivel **4** | `1,800 XP`",
    "3 | @Tercero | Tercero | Nivel **3** | `1,200 XP`",
  ].join("\n");
  const intro = applyLevelsTokens(
    config?.leaderboardEmbedDescription ?? "",
    { "{total}": "3" },
  ).trim();
  const description = [intro, ranking].filter(Boolean).join("\n\n");

  return (
    <DiscordEmbedMock
      color={config?.leaderboardEmbedColor || "#CA7AFF"}
      title={config?.leaderboardEmbedTitle || "Tabla de Clasificación"}
      description={description}
      thumbnailUrl={
        config?.leaderboardShowThumbnail
          ? guildIconUrl || MOCK.guildIcon
          : null
      }
      footer="Actualización automática · Levels"
    />
  );
}
