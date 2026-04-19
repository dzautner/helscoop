"use client";

import { useState, useRef, useEffect } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ToastProvider";
import { useTranslation } from "@/components/LocaleProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import ConfirmDialog from "@/components/ConfirmDialog";
import type { ChatMessage } from "@/types";

export default function ChatPanel({
  sceneJs,
  onApplyCode,
}: {
  sceneJs: string;
  onApplyCode: (code: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [skipConfirm, setSkipConfirm] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const usedSuggestionRef = useRef(false);
  const { toast } = useToast();
  const { t } = useTranslation();
  const { track } = useAnalytics();

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    if (messages.length > 0 && !expanded) {
      setExpanded(true);
    }
  }, [messages, expanded]);

  function handleApplyClick(code: string) {
    track("chat_code_applied", {} as Record<string, never>);
    if (skipConfirm) {
      onApplyCode(code);
      return;
    }
    setPendingCode(code);
  }

  function handleConfirmApply() {
    if (pendingCode) {
      onApplyCode(pendingCode);
      setPendingCode(null);
    }
  }

  async function send() {
    if (!input.trim() || loading) return;
    track("chat_message_sent", { suggestion_used: usedSuggestionRef.current });
    usedSuggestionRef.current = false;
    const userMsg: ChatMessage = { role: "user", content: input };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const reply = await api.chat(newMessages, sceneJs);
      setMessages([...newMessages, reply]);
    } catch (err) {
      toast(err instanceof Error ? err.message : t('toast.aiError'), "error");
      setMessages([
        ...newMessages,
        { role: "assistant", content: t('editor.chatError') },
      ]);
    }
    setLoading(false);
  }

  function extractCode(content: string): string | null {
    const match = content.match(/```(?:javascript|js)?\n([\s\S]*?)```/);
    return match ? match[1].trim() : null;
  }

  return (
    <div className="chat-embedded">
      {/* Messages area - expands when there are messages */}
      {expanded && messages.length > 0 && (
        <div className="chat-messages-area">
          <button
            className="chat-collapse-btn"
            onClick={() => setExpanded(false)}
            title="Minimize"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          <div className="chat-messages-scroll">
            {messages.map((msg, i) => {
              const code = msg.role === "assistant" ? extractCode(msg.content) : null;
              const textContent = msg.content
                .replace(/```(?:javascript|js)?\n[\s\S]*?```/g, "")
                .trim();

              return (
                <div
                  key={i}
                  className={`chat-msg ${msg.role === "user" ? "chat-msg-user" : "chat-msg-ai"}`}
                >
                  {msg.role === "assistant" && (
                    <div className="chat-msg-avatar">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                      </svg>
                    </div>
                  )}
                  <div className="chat-msg-content">
                    {textContent && <span>{textContent}</span>}
                    {code && (
                      <button
                        className="chat-apply-btn"
                        onClick={() => handleApplyClick(code)}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        {t('editor.applyToScene')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {loading && (
              <div className="chat-msg chat-msg-ai">
                <div className="chat-msg-avatar">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                </div>
                <div className="chat-msg-content">
                  <div className="typing-dots">
                    <span /><span /><span />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      )}

      {/* Collapsed indicator when there are messages but panel is collapsed */}
      {!expanded && messages.length > 0 && (
        <button
          className="chat-expand-btn"
          onClick={() => setExpanded(true)}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
          <span>{messages.length} {messages.length === 1 ? t('editor.message') || "message" : t('editor.messages') || "messages"}</span>
        </button>
      )}

      {/* Suggestion chips when empty */}
      {messages.length === 0 && !loading && (
        <div style={{
          display: "flex",
          gap: 6,
          padding: "0 0 6px 0",
          flexWrap: "wrap",
        }}>
          {[
            t('editor.suggestionRoof') || "Add a pitched roof",
            t('editor.suggestionWindow') || "Add a window",
            t('editor.suggestionGarage') || "Attach a garage",
          ].map((suggestion) => (
            <button
              key={suggestion}
              className="chat-suggestion-chip"
              onClick={() => {
                setInput(suggestion);
                usedSuggestionRef.current = true;
                inputRef.current?.focus();
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {/* Input bar - always visible */}
      <div className="chat-input-bar">
        <svg className="chat-input-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        <input
          ref={inputRef}
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder={messages.length === 0 ? t('editor.describeChange') : t('editor.describeChange')}
          disabled={loading}
        />
        <button
          className="chat-send-btn"
          onClick={send}
          disabled={loading || !input.trim()}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>

      <ConfirmDialog
        open={pendingCode !== null}
        title={t('editor.confirmApplyTitle') || "Apply AI-generated code?"}
        message={
          (t('editor.confirmApplyMessage') ||
            "This will replace your current scene script with the AI-generated code.") +
          "\n\n" +
          (t('editor.confirmApplyUndo') || "You can undo with") +
          ` ${navigator.platform?.includes("Mac") ? "Cmd" : "Ctrl"}+Z`
        }
        confirmText={t('editor.applyToScene') || "Apply to scene"}
        cancelText={t('editor.cancel') || "Cancel"}
        onConfirm={handleConfirmApply}
        onCancel={() => setPendingCode(null)}
      />
      {pendingCode !== null && (
        <div className="chat-skip-confirm">
          <input
            type="checkbox"
            id="skip-confirm"
            checked={skipConfirm}
            onChange={(e) => setSkipConfirm(e.target.checked)}
            style={{ accentColor: "var(--accent)" }}
          />
          <label htmlFor="skip-confirm" style={{ cursor: "pointer" }}>
            {t('editor.dontAskAgain') || "Don't ask again this session"}
          </label>
        </div>
      )}
    </div>
  );
}
