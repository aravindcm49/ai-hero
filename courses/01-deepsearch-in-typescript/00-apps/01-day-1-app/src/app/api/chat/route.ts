import type { Message } from "ai";
import { appendResponseMessages, createDataStreamResponse, streamText } from "ai";
import { z } from "zod";
import { model } from "~/models";
import { searchSerper } from "~/serper";
import { auth } from "~/server/auth";
import { getChat, upsertChat } from "~/server/db/queries";

export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }


  const {
    messages,
    chatId,
    isNewChat
  }: { messages: Message[]; chatId: string; isNewChat?: boolean; } = await request.json();

  // const =
  //   oldChatId ??
  if (isNewChat) {
    await upsertChat({
      userId: session.user.id,
      chatId: chatId,
      messages,
    });
  }


  return createDataStreamResponse({
    execute: async (dataStream) => {
      if (isNewChat) {
        dataStream.writeData({
          type: "NEW_CHAT_CREATED",
          chatId: chatId,
        });
      }
      const result = streamText({
        model,
        messages,
        system: `You are a helpful assistant that can search the web.
            Please use the search web tool to answer the user's questions.
            When you have finished searching,
            please cite your sources with inline links in markdown format of (title)[url], Never include raw urls.`,
        tools: {
          searchWeb: {
            parameters: z.object({
              query: z.string().describe("The query to search the web for"),
            }),
            execute: async ({ query }, { abortSignal }) => {
              const results = await searchSerper(
                { q: query, num: 10 },
                abortSignal,
              );

              return results.organic.map((result) => ({
                title: result.title,
                link: result.link,
                snippet: result.snippet,
              }));
            },
          },
        },
        onFinish: async ({ response }) => {
          const responseMessages = response.messages;
          const updatedMessages = appendResponseMessages({
            messages,
            responseMessages,
          });

          const chat = await getChat({ userId: session.user.id, chatId });

          if (chat) {
            await upsertChat({
              userId: session.user.id,
              chatId,
              title: chat.title,
              messages: updatedMessages,
            });
          }
        },
        maxSteps: 10,
      });

      result.mergeIntoDataStream(dataStream);
    },
    onError: (e) => {
      console.error(e);
      return "Oops, an error occured!";
    },
  });
}
