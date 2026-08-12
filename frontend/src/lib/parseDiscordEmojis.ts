/**
 * Convierte menciones de emoji de Discord en <img> del CDN
 * para la vista previa (react-markdown + rehype-raw).
 */
const DISCORD_EMOJI_RE = /<(a?):([a-zA-Z0-9_]+):(\d{17,20})>/g;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function emojiImgTag(animated: boolean, name: string, id: string): string {
  const ext = animated ? "gif" : "webp";
  const src = `https://cdn.discordapp.com/emojis/${id}.${ext}?size=44&quality=lossless`;
  const safeName = escapeHtml(name);
  return `<img src="${src}" alt=":${safeName}:" title=":${safeName}:" class="discord-emoji inline-block h-5 w-5 align-middle" draggable="false" />`;
}

/**
 * Escapa HTML del usuario e inserta solo <img> controladas para emojis Discord.
 */
export function parseDiscordEmojis(text: string): string {
  const parts: string[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(DISCORD_EMOJI_RE)) {
    const full = match[0];
    const animatedFlag = match[1] ?? "";
    const name = match[2] ?? "emoji";
    const id = match[3] ?? "";
    const index = match.index ?? 0;

    parts.push(escapeHtml(text.slice(lastIndex, index)));
    parts.push(emojiImgTag(animatedFlag === "a", name, id));
    lastIndex = index + full.length;
  }

  parts.push(escapeHtml(text.slice(lastIndex)));
  return parts.join("");
}
