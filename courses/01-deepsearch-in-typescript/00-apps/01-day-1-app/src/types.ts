import type { Message } from "ai";

import { z } from "zod";

export type MessagePart = NonNullable<
  Message["parts"]
>[number];

export type Action = {
  type: "search" | "scrape" | "answer";
  query?: string;
  urls?: string[];
};

export const actionSchema = z.object({
  type: z
    .enum(["search", "scrape", "answer"])
    .describe(
      `The type of action to take.
      - 'search': Search the web for more information.
      - 'scrape': Scrape a URL.
      - 'answer': Answer the user's question and complete the loop.`,
    ),
  query: z
    .string()
    .describe(
      "The query to search for. Required if type is 'search'.",
    )
    .optional(),
  urls: z
    .array(z.string())
    .describe(
      "The URLs to scrape. Required if type is 'scrape'.",
    )
    .optional(),
});
