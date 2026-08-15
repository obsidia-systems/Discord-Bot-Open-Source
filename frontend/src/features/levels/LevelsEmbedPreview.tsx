import type { LevelsConfig, LevelsReward } from "@adobos/shared";

/** Colores fijos de los embeds (preview y bot). */
const LEVEL_UP_EMBED_COLOR = "#34E21D";
const LEADERBOARD_EMBED_COLOR = "#CA7AFF";

const MOCK = {
  user: "@UsuarioDePrueba",
  level: 5,
  avatar: "https://cdn.discordapp.com/embed/avatars/0.png",
  nextLevel: 10,
  /** Fallback si el servidor no tiene icono. */
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
    <div className="overflow-hidden rounded-md bg-[#2b2d31] text-[13px] text-[#dbdee1] shadow-sm">
      <div className="flex">
        <div
          className="w-1 shrink-0 self-stretch"
          style={{ backgroundColor: color }}
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
    return `🎉 Desbloqueaste el rol: @RolNivel${current.level}`;
  }
  const next = rewards
    .filter((r) => r.level > MOCK.level)
    .sort((a, b) => a.level - b.level)[0];
  if (next) {
    return `🔒 Próxima recompensa: @RolNivel${next.level} al Nivel **${next.level}**.`;
  }
  if (rewards.length === 0) {
    return `🔒 Próxima recompensa: @RolEjemplo al Nivel **${MOCK.nextLevel}**.`;
  }
  return "🌟 ¡Has alcanzado el máximo nivel de recompensas!";
}

export function LevelUpDiscordPreview({
  config,
}: {
  config: LevelsConfig;
}) {
  return (
    <DiscordEmbedMock
      color={LEVEL_UP_EMBED_COLOR}
      title="¡Subida de Nivel!"
      description={`¡Felicidades ${MOCK.user}! Has alcanzado el **Nivel ${MOCK.level}**.`}
      thumbnailUrl={MOCK.avatar}
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
  guildIconUrl,
}: {
  config?: LevelsConfig;
  guildIconUrl?: string | null;
}) {
  const ranking = [
    "🥇 | @UsuarioDePrueba | UsuarioDePrueba | Nivel **5** | `2,500 XP`",
    "🥈 | @OtroUsuario | OtroUsuario | Nivel **4** | `1,800 XP`",
    "🥉 | @Tercero | Tercero | Nivel **3** | `1,200 XP`",
  ].join("\n");

  return (
    <DiscordEmbedMock
      color={LEADERBOARD_EMBED_COLOR}
      title="🏆 Tabla de Clasificación"
      description={ranking}
      thumbnailUrl={guildIconUrl || MOCK.guildIcon}
      footer="Actualización automática · Rangos y XP"
    />
  );
}
