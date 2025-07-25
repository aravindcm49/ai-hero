## MCP Tools

<Note type="warning">
  The MCP tools feature is experimental and may change in the future.
</Note>

The AI SDK supports connecting to [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) servers to access their tools.
This enables your AI applications to discover and use tools across various services through a standardized interface.

### Initializing an MCP Client

Create an MCP client using either:

- `SSE` (Server-Sent Events): Uses HTTP-based real-time communication, better suited for remote servers that need to send data over the network
- `stdio`: Uses standard input and output streams for communication, ideal for local tool servers running on the same machine (like CLI tools or local services)
- Custom transport: Bring your own transport by implementing the `MCPTransport` interface, ideal when implementing transports from MCP's official Typescript SDK (e.g. `StreamableHTTPClientTransport`)

#### SSE Transport

The SSE can be configured using a simple object with a `type` and `url` property:

```typescript
import { experimental_createMCPClient as createMCPClient } from "ai";

const mcpClient = await createMCPClient({
  transport: {
    type: "sse",
    url: "https://my-server.com/sse",

    // optional: configure HTTP headers, e.g. for authentication
    headers: {
      Authorization: "Bearer my-api-key",
    },
  },
});
```

#### Stdio Transport

The Stdio transport requires importing the `StdioMCPTransport` class from the `ai/mcp-stdio` package:

```typescript
import { experimental_createMCPClient as createMCPClient } from "ai";
import { Experimental_StdioMCPTransport as StdioMCPTransport } from "ai/mcp-stdio";

const mcpClient = await createMCPClient({
  transport: new StdioMCPTransport({
    command: "node",
    args: ["src/stdio/dist/server.js"],
  }),
});
```

#### Custom Transport

You can also bring your own transport, as long as it implements the `MCPTransport` interface. Below is an example of using the new `StreamableHTTPClientTransport` from MCP's official Typescript SDK:

```typescript
import {
  MCPTransport,
  experimental_createMCPClient as createMCPClient,
} from "ai";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp";

const url = new URL("http://localhost:3000/mcp");
const mcpClient = await createMCPClient({
  transport: new StreamableHTTPClientTransport(url, {
    sessionId: "session_123",
  }),
});
```

<Note>
  The client returned by the `experimental_createMCPClient` function is a
  lightweight client intended for use in tool conversion. It currently does not
  support all features of the full MCP client, such as: authorization, session
  management, resumable streams, and receiving notifications.
</Note>

#### Closing the MCP Client

After initialization, you should close the MCP client based on your usage pattern:

- For short-lived usage (e.g., single requests), close the client when the response is finished
- For long-running clients (e.g., command line apps), keep the client open but ensure it's closed when the application terminates

When streaming responses, you can close the client when the LLM response has finished. For example, when using `streamText`, you should use the `onFinish` callback:

```typescript
const mcpClient = await experimental_createMCPClient({
  // ...
});

const tools = await mcpClient.tools();

const result = await streamText({
  model: openai("gpt-4.1"),
  tools,
  prompt: "What is the weather in Brooklyn, New York?",
  onFinish: async () => {
    await mcpClient.close();
  },
});
```

When generating responses without streaming, you can use try/finally or cleanup functions in your framework:

```typescript
let mcpClient: MCPClient | undefined;

try {
  mcpClient = await experimental_createMCPClient({
    // ...
  });
} finally {
  await mcpClient?.close();
}
```

### Using MCP Tools

The client's `tools` method acts as an adapter between MCP tools and AI SDK tools. It supports two approaches for working with tool schemas:

#### Schema Discovery

The simplest approach where all tools offered by the server are listed, and input parameter types are inferred based the schemas provided by the server:

```typescript
const tools = await mcpClient.tools();
```

**Pros:**

- Simpler to implement
- Automatically stays in sync with server changes

**Cons:**

- No TypeScript type safety during development
- No IDE autocompletion for tool parameters
- Errors only surface at runtime
- Loads all tools from the server

#### Schema Definition

You can also define the tools and their input schemas explicitly in your client code:

```typescript
import { z } from "zod";

const tools = await mcpClient.tools({
  schemas: {
    "get-data": {
      inputSchema: z.object({
        query: z.string().describe("The data query"),
        format: z.enum(["json", "text"]).optional(),
      }),
    },
    // For tools with zero arguments, you should use an empty object:
    "tool-with-no-args": {
      inputSchema: z.object({}),
    },
  },
});
```

**Pros:**

- Control over which tools are loaded
- Full TypeScript type safety
- Better IDE support with autocompletion
- Catch parameter mismatches during development

**Cons:**

- Need to manually keep schemas in sync with server
- More code to maintain

When you define `schemas`, the client will only pull the explicitly defined tools, even if the server offers additional tools. This can be beneficial for:

- Keeping your application focused on the tools it needs
- Reducing unnecessary tool loading
- Making your tool dependencies explicit

## Examples

You can see tools in action using various frameworks in the following examples:
