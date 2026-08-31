import type { Options } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

/** rehype-raw + sanitize: permite <img> de parseDiscordEmojis, no HTML libre. */
export const discordMarkdownRehype: NonNullable<Options["rehypePlugins"]> = [
  rehypeRaw,
  [
    rehypeSanitize,
    {
      ...defaultSchema,
      attributes: {
        ...defaultSchema.attributes,
        img: [
          ...(defaultSchema.attributes?.img ?? []),
          "src",
          "alt",
          "title",
          "className",
          "class",
          "width",
          "height",
          "draggable",
        ],
      },
    },
  ],
];
