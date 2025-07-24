import {
    generateObject,
    type Message,
    type TelemetrySettings,
    type StreamTextResult,
    type streamText, // Keep streamText for Parameters type
} from "ai";
import { model } from "~/models";
import { z } from "zod";
import { actionSchema, type Action } from "~/types";
import type { SystemContext } from "~/system-context";
import { runAgentLoop } from "./run-agent-loop";

export const streamFromDeepSearch = async (opts: {
    messages: Message[];
    onFinish: Parameters<typeof streamText>[0]["onFinish"];
    telemetry: TelemetrySettings;
}): Promise<StreamTextResult<{}, string>> => {
    const result = await runAgentLoop({
        messages: opts.messages,
        onFinish: opts.onFinish,
        telemetry: opts.telemetry,
    });
    return result;
};

export async function askDeepSearch(
    messages: Message[],
) {
    const result = await streamFromDeepSearch({
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

export const getNextAction = async (
    context: SystemContext,
): Promise<Action> => {
    const result = await generateObject({
        model,
        schema: actionSchema,
        prompt: `
You are a helpful assistant that can search the web, scrape a URL, or answer the user's question.

The current date is ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.

Here is the user's original question:
${context.getUserQuery()}

Here is the context:

${context.getQueryHistory()}

${context.getScrapeHistory()}

Based on the context, what is the next action you should take?
    `,
    });

    return result.object;
};
