import { streamText, smoothStream, type Message, type TelemetrySettings, type StreamTextResult } from "ai";
import { model } from "~/models";
import type { SystemContext } from "~/system-context";
import { markdownJoinerTransform } from "~/markdown-joiner-transform";

export function answerQuestion(
    context: SystemContext,
    messages: Message[],
    opts?: {
        isFinal?: boolean;
        onFinish?: Parameters<typeof streamText>[0]["onFinish"];
        telemetry?: TelemetrySettings;
    },
): StreamTextResult<{}, string> {
    const systemPrompt = `You are a helpful assistant designed to answer user questions based on provided context.

Here is the user's original question:
${context.getUserQuery()}

Here is the context from the search and scrape operations:

${context.getQueryHistory()}

${context.getScrapeHistory()}

${opts?.isFinal
            ? "You have taken 10 actions and still don't have a definitive answer. Please make your best effort to answer the question based on the information you have, even if it's incomplete."
            : ""
        }

Please provide a comprehensive answer to the user's question based on the context. Cite your sources with inline links in markdown format of (title)[url]. Never include raw urls.`;

    return streamText({
        model,
        messages: [
            { role: "system", content: systemPrompt },
            ...messages,
        ],
        onFinish: opts?.onFinish,
        experimental_telemetry: opts?.telemetry,
        experimental_transform: [
            markdownJoinerTransform(),
            smoothStream({
                delayInMs: 20,
                chunking: "line",
            }),
        ],
    });
