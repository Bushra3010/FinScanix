"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bot, Lock, MessageCircle, Send, ShieldAlert, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonStyles } from "@/components/ui/button";
import { answerInDomain, classifyDomain, OUT_OF_DOMAIN_REPLY } from "@/lib/assistant";
import { useSession } from "@/components/app/session-context";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/types";

const SUGGESTIONS = [
  "How is the Over / Under / Par verdict decided?",
  "What is a city cost index factor?",
  "Where does the market price come from?",
  "How are AMC and housekeeping rates benchmarked?",
];

/** FR-10.1 — available across the platform; FR-10.2/10.3 — domain restricted. */
export function AssistantWidget() {
  const { entitled } = useSession();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const counter = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const allowed = entitled("ai_assistant");

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  function send(question: string) {
    const trimmed = question.trim();
    if (!trimmed || thinking) return;

    counter.current += 1;
    const userMessage: ChatMessage = {
      id: `m${counter.current}`,
      role: "user",
      content: trimmed,
      at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setThinking(true);

    // The domain guard is real logic; only the answer body is canned.
    const verdict = classifyDomain(trimmed);
    const reply = verdict.inDomain ? answerInDomain(trimmed) : OUT_OF_DOMAIN_REPLY;

    setTimeout(() => {
      counter.current += 1;
      setMessages((prev) => [
        ...prev,
        {
          id: `m${counter.current}`,
          role: "assistant",
          content: reply,
          outOfDomain: !verdict.inDomain,
          at: new Date().toISOString(),
        },
      ]);
      setThinking(false);
    }, 420);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close assistant" : "Open assistant"}
        className={cn(
          "fixed right-5 bottom-5 z-50 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full shadow-pop transition-transform hover:scale-105",
          "bg-brand text-brand-foreground",
        )}
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>

      {open && (
        <div className="fixed right-5 bottom-20 z-50 flex h-[min(34rem,calc(100vh-7rem))] w-[min(23.5rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-pop">
          <header className="flex items-center gap-2.5 border-b border-border bg-surface-sunken/60 px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <Bot className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold text-foreground">FinScanix Assistant</p>
              <p className="text-[11.5px] text-muted-foreground">
                Construction, FM & engineering only
              </p>
            </div>
            <Badge tone="par" dot>
              Online
            </Badge>
          </header>

          {!allowed ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-sunken text-muted-foreground">
                <Lock className="h-5 w-5" />
              </div>
              <p className="text-sm font-semibold text-foreground">Assistant is not on your plan</p>
              <p className="text-[13px] text-muted-foreground">
                The AI assistant is available from the Professional tier upwards.
              </p>
              <Link
                href="/app/settings/billing"
                className={buttonStyles({ size: "sm", className: "mt-1" })}
              >
                View plans
              </Link>
            </div>
          ) : (
            <>
              <div ref={scrollRef} className="scrollbar-thin flex-1 space-y-3 overflow-y-auto px-4 py-4">
                <div className="flex gap-2.5">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
                    <Sparkles className="h-3.5 w-3.5" />
                  </div>
                  <div className="rounded-lg rounded-tl-sm bg-muted px-3 py-2 text-[13px] leading-relaxed text-foreground">
                    I can help with rate verification, Schedule of Rates, market pricing,
                    extraction and reports. Ask me anything in the construction and facilities
                    management domain.
                  </div>
                </div>

                {messages.length === 0 && (
                  <div className="space-y-1.5 pt-1 pl-8.5">
                    {SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => send(suggestion)}
                        className="block w-full cursor-pointer rounded-lg border border-border bg-background px-3 py-2 text-left text-[12.5px] text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}

                {messages.map((message) =>
                  message.role === "user" ? (
                    <div key={message.id} className="flex justify-end">
                      <div className="max-w-[85%] rounded-lg rounded-tr-sm bg-brand px-3 py-2 text-[13px] leading-relaxed text-brand-foreground">
                        {message.content}
                      </div>
                    </div>
                  ) : (
                    <div key={message.id} className="flex gap-2.5">
                      <div
                        className={cn(
                          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                          message.outOfDomain
                            ? "bg-warning-soft text-warning"
                            : "bg-brand-soft text-brand",
                        )}
                      >
                        {message.outOfDomain ? (
                          <ShieldAlert className="h-3.5 w-3.5" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div
                          className={cn(
                            "rounded-lg rounded-tl-sm px-3 py-2 text-[13px] leading-relaxed whitespace-pre-line",
                            message.outOfDomain
                              ? "bg-warning-soft text-foreground"
                              : "bg-muted text-foreground",
                          )}
                        >
                          {message.content}
                        </div>
                        {message.outOfDomain && (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Out-of-domain question — standard refusal returned.
                          </p>
                        )}
                      </div>
                    </div>
                  ),
                )}

                {thinking && (
                  <div className="flex gap-2.5">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
                      <Sparkles className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex items-center gap-1 rounded-lg bg-muted px-3 py-2.5">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="animate-pulse-soft h-1.5 w-1.5 rounded-full bg-muted-foreground"
                          style={{ animationDelay: `${i * 0.15}s` }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  send(input);
                }}
                className="flex items-center gap-2 border-t border-border p-3"
              >
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Ask about rates, SoR, pricing…"
                  className="h-9 flex-1 rounded-lg border border-border-strong bg-background px-3 text-[13px] text-foreground placeholder:text-muted-foreground/70 focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
                />
                <Button type="submit" size="icon" disabled={!input.trim() || thinking}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
}
