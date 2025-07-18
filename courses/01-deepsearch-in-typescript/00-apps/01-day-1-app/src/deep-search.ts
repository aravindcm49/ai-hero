import {
    streamText,
    type Message,
    type TelemetrySettings,
} from "ai";
import { model } from "~/models";
import { z } from "zod";
import { searchSerper } from "~/serper";
import { crawlMultipleUrls } from "~/server/crawler/crawler";

export const streamFromDeepSearch = (opts: {
    messages: Message[];
    onFinish: Parameters<
        typeof streamText
    >[0]["onFinish"];
    telemetry: TelemetrySettings;
}) =>
    streamText({
        model,
        messages: opts.messages,
        maxSteps: 10,
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
        onFinish: opts.onFinish,
        experimental_telemetry: opts.telemetry,
    });

export async function askDeepSearch(
    messages: Message[],
) {
    const result = streamFromDeepSearch({
        messages,
        onFinish: () => { }, // just a stub
        telemetry: {
            isEnabled: false,
        },
    });

    // Consume the stream - without this,
    // the stream will never finish
    await result.consumeStream();

    return await result.text;
}
