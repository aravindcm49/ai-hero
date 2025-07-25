import type { Message } from "ai";
import { createDataStreamResponse, appendResponseMessages } from "ai";
import { Langfuse } from "langfuse";
import { env } from "~/env";
import { auth } from "~/server/auth";
import { getChat, upsertChat } from "~/server/db/queries";
import { streamFromDeepSearch } from "~/deep-search";
import { checkRateLimit, recordRateLimit, type RateLimitConfig } from "~/server/redis/redis-ratelimit";


export const maxDuration = 60;

const config: RateLimitConfig = {
  maxRequests: 1,
  maxRetries: 3,
  windowMs: 60_000,
  keyPrefix: "global",
};
export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const rateLimitCheck = await checkRateLimit(config);

  if (!rateLimitCheck.allowed) {
    console.log("Rate limit exceeded, waiting...");
    const isAllowed = await rateLimitCheck.retry();
    // If the rate limit is still exceeded, return a 429
    if (!isAllowed) {
      return new Response("Rate limit exceeded", {
        status: 429,
      });
    }
  }

  // Always record the request when it's allowed (either initially or after retry)
  await recordRateLimit(config);


  const langfuse = new Langfuse({
    environment: env.NODE_ENV,
  });

  const {
    messages,
    chatId,
    isNewChat
  }: { messages: Message[]; chatId: string; isNewChat?: boolean; } = await request.json();

  // const =
  //   oldChatId ??

  const trace = langfuse.trace({
    name: "chat",
    userId: session.user.id,
  });

  if (isNewChat) {
    const upsertChatSpan = trace.span({
      name: "upsert-chat-initial",
      input: { userId: session.user.id, chatId, messages },
    });
    await upsertChat({
      userId: session.user.id,
      chatId: chatId,
      messages,
    });
    upsertChatSpan.end({ output: { status: "success" } });
  }

  trace.update({
    sessionId: chatId,
  });

  return createDataStreamResponse({
    execute: async (dataStream) => {
      if (isNewChat) {
        dataStream.writeData({
          type: "NEW_CHAT_CREATED",
          chatId: chatId,
        });
      }

      const result = await streamFromDeepSearch({
        messages,
        onFinish: async ({ response }) => {
          const responseMessages = response.messages;
          const updatedMessages = appendResponseMessages({
            messages,
            responseMessages,
          });

          const getChatSpan = trace.span({
            name: "get-chat",
            input: { userId: session.user.id, chatId },
          });
          const chat = await getChat({ userId: session.user.id, chatId });
          getChatSpan.end({ output: chat });

          if (chat) {
            const upsertChatSpan = trace.span({
              name: "upsert-chat-on-finish",
              input: { userId: session.user.id, chatId, title: chat.title, messages: updatedMessages },
            });
            await upsertChat({
              userId: session.user.id,
              chatId,
              title: chat.title,
              messages: updatedMessages,
            });
            upsertChatSpan.end({ output: { status: "success" } });
          }

          await langfuse.flushAsync();
        },
        telemetry: {
          isEnabled: true,
          functionId: 'agent',
          metadata: {
            langfuseTraceId: trace.id,
            userId: session.user.id,
            chatId: chatId,
            initialMessageCount: messages.length,
            isNewChat: !!isNewChat,
          },
        },
      });

      result.mergeIntoDataStream(dataStream);
    },
    onError: (e) => {
      console.error(e);
      return "Oops, an error occured!";
    },
  });
}
