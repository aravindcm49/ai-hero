import { and, eq } from "drizzle-orm";
import type { Message } from "ai";
import { randomUUID } from "crypto";
import { db } from "./index";
import { chats, messages } from "./schema";

export const upsertChat = async (opts: {
  userId: string;
  chatId?: string;
  title?: string;
  messages: Message[];
}) => {
  const { userId, chatId: oldChatId, messages: msgs } = opts;

  const chatId = oldChatId ?? randomUUID();

  const title =
    opts.title ??
    (msgs.find((m) => m.role === "user")?.content as string)?.substring(
      0,
      20,
    ) ??
    "Untitled Chat";

  // Ensure chat belongs to user if it exists
  const existing = await db
    .select()
    .from(chats)
    .where(and(eq(chats.id, chatId), eq(chats.userId, userId)))
    .limit(1);

  if (existing.length > 0) {
    // Update chat title and timestamp
    await db
      .update(chats)
      .set({ title, updatedAt: new Date() })
      .where(eq(chats.id, chatId));
    // Remove old messages
    await db.delete(messages).where(eq(messages.chatId, chatId));
  } else {
    // Create new chat with provided id
    await db.insert(chats).values({ id: chatId, userId, title });
  }

  // Insert all messages for this chat

  await db.insert(messages).values(
    msgs.map((m, index) => ({
      chatId: chatId,
      role: m.role,
      parts: m.parts,
      order: index,
    }))
  );

  return chatId;
};

/**
 * Retrieve a single chat (with its messages) for a user.
 * Returns null if not found or if it does not belong to the user.
 */
export const getChat = async (opts: {
  userId: string;
  chatId: string;
}) => {
  const { userId, chatId } = opts;

  // Fetch chat metadata
  const chatRows = await db
    .select()
    .from(chats)
    .where(and(eq(chats.id, chatId), eq(chats.userId, userId)))
    .limit(1);

  if (chatRows.length === 0) return null;
  const chat = chatRows[0]!;

  // Fetch associated messages in order
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(messages.order);

  return { ...chat, messages: msgs };
};

/**
 * Retrieve all chats (without their messages) for a given user.
 */
export const getChats = async (opts: { userId: string }) => {
  const { userId } = opts;
  return await db
    .select({
      id: chats.id,
      title: chats.title,
    })
    .from(chats)
    .where(eq(chats.userId, userId));
};