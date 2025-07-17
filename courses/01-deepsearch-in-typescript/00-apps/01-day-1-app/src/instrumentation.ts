import { env } from "~/env";
import { registerOTel } from "@vercel/otel";
import { LangfuseExporter } from "langfuse-vercel";

export function register() {
    registerOTel({
        serviceName: "langfuse-vercel-ai-nextjs-example",
        traceExporter: new LangfuseExporter({
            environment: env.NODE_ENV,
        }),
    });
}