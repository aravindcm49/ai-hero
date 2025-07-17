import type { Message } from "ai";
import { appendResponseMessages, createDataStreamResponse, streamText } from "ai";
import { Langfuse } from "langfuse";
import { z } from "zod";
import { env } from "~/env";
import { model } from "~/models";
import { searchSerper } from "~/serper";
import { auth } from "~/server/auth";
import { crawlMultipleUrls } from "~/server/crawler/crawler";
import { getChat, upsertChat } from "~/server/db/queries";


export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

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
      const result = streamText({
        experimental_telemetry: {
          isEnabled: true,
          functionId: 'agent',
          metadata: {
            langfuseTraceId: trace.id,
          },
        },
        model,
        messages,
        system: `You are a helpful assistant that can search the web and scrape web pages for detailed content.
            
            The current date is ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}. When the user asks for up-to-date information, please use this date in your queries.

            Available tools:
            1. searchWeb: Use this to search the web and get search results with titles, links, snippets, and publication dates. This is useful for finding relevant websites and getting an overview of available information.
            
            2. scrapePages: Use this to get the full text content of specific web pages in markdown format. This is useful when you need detailed information from specific URLs that you've found through search or that the user has provided. Use this tool when:
               - You need the complete content of a webpage, not just a snippet
               - You want to analyze or summarize the full text of articles, blog posts, or documentation
               - The user asks for detailed information that requires reading the full content of specific pages
               - You have specific URLs from search results that contain relevant information
            
            Workflow recommendation:
            1. First use searchWeb to find relevant URLs.
            2. Then, always use scrapePages on at least 4-5 of the most promising URLs to get detailed content.
            3. Provide comprehensive answers based on the scraped content.
            
            When you have finished searching and scraping,
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
                date: result.date,
              }));
            },
          },
          scrapePages: {
            parameters: z.object({
              urls: z.array(z.string()).describe("Array of URLs to scrape for full content"),
            }),
            execute: async ({ urls }) => {
              const result = await crawlMultipleUrls(urls);

              const pages = result.results.map(({ url, result: crawlResult }) => {
                if (crawlResult.success) {
                  return {
                    url,
                    success: true as const,
                    content: crawlResult.data,
                    error: undefined,
                  };
                } else {
                  return {
                    url,
                    success: false as const,
                    content: undefined,
                    error: crawlResult.error,
                  };
                }
              });

              if (result.success) {
                return {
                  success: true,
                  pages,
                };
              } else {
                return {
                  success: false,
                  error: result.error,
                  pages,
                };
              }
            },
          },
        },
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
