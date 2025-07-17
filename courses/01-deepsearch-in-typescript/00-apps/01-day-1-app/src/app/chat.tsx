"use client";

import { useChat } from "@ai-sdk/react";
import { LoaderCircle } from "lucide-react";
import { ChatMessage } from "~/components/chat-message";
import { SignInModal } from "~/components/sign-in-modal";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { isNewChatCreated } from "~/utils";
import { type Message } from "ai";
import { StickToBottom } from "use-stick-to-bottom";
interface ChatProps {
  userName: string;
  isAuthenticated: boolean;
  chatId: string;
  initialMessages: Message[];
  isNewChat?: boolean;
}

export const ChatPage = ({
  userName,
  isAuthenticated,
  chatId,
  initialMessages,
  isNewChat,
}: ChatProps) => {
  const { messages, input, handleInputChange, handleSubmit, status, data } =
    useChat({
      body: {
        chatId,
        isNewChat,
      },
      initialMessages,
    });
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(false);
  useEffect(() => {
    if (status === "submitted" || status === "streaming") {
      setIsLoading(true);
    } else {
      setIsLoading(false);
    }
  }, [status]);

  useEffect(() => {
    const lastDataItem = data?.[data.length - 1] as {
      type: string;
      chatId: string;
    };

    if (lastDataItem && isNewChatCreated(lastDataItem)) {
      router.push(`?id=${lastDataItem.chatId}`);
    }
  }, [data]);

  return (
    <>
      <div className="flex flex-1 flex-col">
        <StickToBottom
          className="mx-auto w-full max-w-[65ch] flex-1 overflow-auto [&>div]:scrollbar-thin [&>div]:scrollbar-track-gray-800 [&>div]:scrollbar-thumb-gray-600 [&>div]:hover:scrollbar-thumb-gray-500"
          resize="smooth"
          initial="smooth"
          role="log"
          aria-label="Chat messages"
        >
          <StickToBottom.Content className="flex flex-col gap-4 p-4">
            {messages.map((message) => {
              const parts = message.parts ?? [
                { type: "text", text: message.content },
              ];
              return (
                <ChatMessage
                  key={message.id}
                  parts={parts}
                  role={message.role}
                  userName={userName}
                />
              );
            })}
          </StickToBottom.Content>
        </StickToBottom>

        <div className="border-t border-gray-700">
          <form onSubmit={handleSubmit} className="mx-auto max-w-[65ch] p-4">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={handleInputChange}
                placeholder="Say something..."
                autoFocus
                aria-label="Chat input"
                className="flex-1 rounded border border-gray-700 bg-gray-800 p-2 text-gray-200 placeholder-gray-400 focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading}
                className="rounded bg-gray-700 px-4 py-2 text-white hover:bg-gray-600 focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 disabled:hover:bg-gray-700"
              >
                {isLoading ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  "Send"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      <SignInModal isOpen={false} onClose={() => {}} />
    </>
  );
};
