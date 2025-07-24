import { streamText, type Message, type TelemetrySettings, type StreamTextResult } from "ai";
import { model } from "~/models";
import { searchSerper } from "~/serper";
import { crawlMultipleUrls } from "~/server/crawler/crawler";
import { SystemContext } from "~/system-context";
import { getNextAction } from "~/deep-search";
import { answerQuestion } from "~/answer-question";
import Langfuse from "langfuse";
import { env } from "./env";

// Reuse the tool calls as functions
const search = async (query: string, abortSignal?: AbortSignal) => {
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
};

const scrapeUrl = async (urls: string[]) => {
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
};

export async function runAgentLoop(opts: {
    messages: Message[];
    onFinish: Parameters<typeof streamText>[0]["onFinish"];
    telemetry: TelemetrySettings;
}): Promise<StreamTextResult<{}, string>> {
    const { messages, onFinish, telemetry } = opts;
    const langfuse = new Langfuse({
        environment: env.NODE_ENV,
    });
    const trace = langfuse.trace({
        userId: telemetry.metadata!.userId as string,
    });
    // A persistent container for the state of our system
    const ctx = new SystemContext();
    ctx.reportUserQuery(messages[messages.length - 1]!.content);

    // A loop that continues until we have an answer
    // or we've taken 10 actions
    while (ctx.step < 10) {
        // We choose the next action based on the state of our system
        const nextAction = await getNextAction(ctx);

        // We execute the action and update the state of our system
        if (nextAction.type === "search") {
            if (!nextAction.query) {
                throw new Error("Search action requires a query.");
            }
            console.log(JSON.stringify(nextAction))

            // Create a span for the search action with comprehensive input
            const searchSpan = trace.span({
                name: "search",
                input: {
                    query: nextAction.query,
                    step: ctx.step,
                    userId: telemetry.metadata?.userId,
                    chatId: telemetry.metadata?.chatId,
                }
            });

            const result = await search(nextAction.query);
            ctx.reportQueries([{ query: nextAction.query, results: result.map(r => ({ ...r, url: r.link, date: r.date || "" })) }]);

            searchSpan?.end({
                output: {
                    resultsCount: result.length,
                    resultUrls: result.map(r => r.link)
                }
            });
        } else if (nextAction.type === "scrape") {
            if (!nextAction.urls) {
                throw new Error("Scrape action requires URLs.");
            }

            // Create a span for the scrape action with comprehensive input
            const scrapeSpan = trace.span({
                name: "scrape",
                input: {
                    urls: nextAction.urls,
                    step: ctx.step,
                    userId: telemetry.metadata?.userId,
                    chatId: telemetry.metadata?.chatId,
                }
            });

            const result = await scrapeUrl(nextAction.urls);
            // Assuming scrapeUrl returns an object with a 'pages' array
            // and each page has a 'url' and 'content' property.
            // Adjust this based on the actual return type of scrapeUrl.
            ctx.reportScrapes(result.pages.map(page => ({ url: page.url, result: page.content || "" })));

            scrapeSpan?.end({
                output: {
                    pagesScraped: result.pages.length,
                    success: result.success,
                    scrapedUrls: result.pages.map(p => p.url)
                }
            });
        } else if (nextAction.type === "answer") {
            // Create a span for the answer action with comprehensive input
            const answerSpan = trace.span({
                name: "answer",
                input: {
                    step: ctx.step,
                    userId: telemetry.metadata?.userId,
                    chatId: telemetry.metadata?.chatId,
                    isFinal: false
                }
            });

            const result = await answerQuestion(ctx, messages, { onFinish, telemetry });

            answerSpan?.end({
                output: {
                    status: "completed"
                }
            });

            return result;
        }

        // We increment the step counter
        ctx.incrementStep();
    }

    // If we've taken 10 actions and still don't have an answer,
    // we ask the LLM to give its best attempt at an answer
    const finalAnswerSpan = trace.span({
        name: "answer",
        input: {
            step: ctx.step,
            userId: telemetry.metadata?.userId,
            chatId: telemetry.metadata?.chatId,
            isFinal: true
        }
    });

    const result = answerQuestion(ctx, messages, { isFinal: true, onFinish, telemetry });

    finalAnswerSpan?.end({
        output: {
            status: "final-attempt"
        }
    });

    return result;
}
