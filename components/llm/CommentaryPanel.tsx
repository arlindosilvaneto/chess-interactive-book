"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isStaticToolUIPart } from "ai";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { Button } from "@/components/ui/button";
import { getMoveTokens } from "@/components/boards/MoveList";
import { getNodeByPath } from "@/lib/chess/moveTree";
import { useChapterStore } from "@/lib/store/chapterStore";
import { useLlmSettingsStore } from "@/lib/store/llmSettingsStore";
import type { Chapter } from "@/types/chapter";
import type { ChatRequestBody } from "@/types/llm";

export interface CommentaryPanelProps {
  chapter: Chapter;
  onOpenSettings?: () => void;
}

function buildPgnContext(root: Chapter["root"], path: string[]): string {
  const tokens = getMoveTokens(root, path);
  return tokens
    .map((token) => (token.color === "w" ? `${token.moveNumber}. ${token.san}` : token.san))
    .join(" ");
}

/**
 * Position-aware LLM commentary chat. Tracks the deepest currently-open
 * board as "the position being discussed" and attaches its FEN + PGN-so-far
 * to every request alongside the user's LLM settings (provider/model/key/rating).
 */
export function CommentaryPanel({ chapter, onOpenSettings }: CommentaryPanelProps) {
  const settings = useLlmSettingsStore((state) => state.settings);
  const isConfigured = useLlmSettingsStore((state) => state.isConfigured());
  const slice = useChapterStore((state) => state.chapters[chapter.id]);

  // Discuss whichever position the reader is currently focused on — the
  // deepest open board (the most specific thing they've drilled into),
  // falling back to the mainline board when no sideline is open.
  const root = slice?.root ?? chapter.root;
  const boardPaths = slice?.boardPaths ?? [[]];
  const path = boardPaths[boardPaths.length - 1];
  const currentNode = getNodeByPath(root, path) ?? root;
  const fen = currentNode.fenAfter;

  // The transport is created once and kept stable; its `body` reads the
  // stores' current state imperatively (via `getState()`) at send time
  // rather than closing over a React ref, since `chapter` is the only
  // render-scoped value it needs and that's stable for the panel's lifetime.
  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: (): Omit<ChatRequestBody, "messages"> => {
          const currentSlice = useChapterStore.getState().chapters[chapter.id];
          const currentRoot = currentSlice?.root ?? chapter.root;
          const currentBoardPaths = currentSlice?.boardPaths ?? [[]];
          const currentPath = currentBoardPaths[currentBoardPaths.length - 1];
          const node = getNodeByPath(currentRoot, currentPath) ?? currentRoot;
          return {
            llm: useLlmSettingsStore.getState().settings,
            fen: node.fenAfter,
            pgnContext: buildPgnContext(currentRoot, currentPath),
          };
        },
      })
  );

  const { messages, sendMessage, status, error } = useChat({ transport });

  const handleSubmit = (message: PromptInputMessage) => {
    if (!message.text.trim() || !isConfigured) return;
    sendMessage({ text: message.text });
  };

  if (!isConfigured) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Set up your LLM provider, model, and API key to enable position
          commentary.
        </p>
        {onOpenSettings && (
          <Button type="button" variant="outline" onClick={onOpenSettings}>
            Open LLM settings
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3">
      <Conversation className="flex-1">
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState
              title="Ask about this position"
              description="The assistant sees the current FEN and moves so far, and can look up opening/tablebase info via Lichess."
            />
          ) : (
            messages.map((message) => (
              <Message from={message.role} key={message.id}>
                <MessageContent>
                  {message.parts.map((part, index) => {
                    if (part.type === "text") {
                      return <MessageResponse key={index}>{part.text}</MessageResponse>;
                    }
                    if (part.type === "dynamic-tool") {
                      return (
                        <Tool key={index}>
                          <ToolHeader
                            type="dynamic-tool"
                            state={part.state}
                            toolName={part.toolName}
                          />
                          <ToolContent>
                            <ToolInput input={part.input} />
                            <ToolOutput output={part.output} errorText={part.errorText} />
                          </ToolContent>
                        </Tool>
                      );
                    }
                    if (isStaticToolUIPart(part)) {
                      return (
                        <Tool key={index}>
                          <ToolHeader type={part.type} state={part.state} />
                          <ToolContent>
                            <ToolInput input={part.input} />
                            <ToolOutput output={part.output} errorText={part.errorText} />
                          </ToolContent>
                        </Tool>
                      );
                    }
                    return null;
                  })}
                </MessageContent>
              </Message>
            ))
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error.message || "The request failed."} Check that your API key and model
          name are correct in LLM settings, then try again.
        </div>
      )}

      <PromptInput onSubmit={handleSubmit}>
        <PromptInputBody>
          <PromptInputTextarea
            placeholder={`Ask about this position (commentary pitched at ~${settings.rating})…`}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <span className="truncate text-xs text-muted-foreground">{fen}</span>
          <PromptInputSubmit status={status} />
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
