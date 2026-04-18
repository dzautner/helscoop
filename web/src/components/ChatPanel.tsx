"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ToastProvider";
import { useTranslation } from "@/components/LocaleProvider";
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
  const { toast } = useToast();
  const { t } = useTranslation();

  async function send() {
    if (!input.trim() || loading) return;
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
    <div
      className="animate-slide"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--bg-secondary)",
      }}
    >
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid var(--border)",
          fontSize: 13,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {t('editor.aiAssistant')}
      </div>
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {messages.length === 0 && (
          <div style={{ color: "var(--text-muted)", fontSize: 13, padding: "24px 12px", textAlign: "center", lineHeight: 2 }}>
            {t('editor.describePrompt')}
            <br />
            <span style={{ color: "#c4915c", opacity: 0.7 }}>
              &ldquo;{t('editor.exampleRoof')}&rdquo;
            </span>
            <br />
            <span style={{ color: "#c4915c", opacity: 0.7 }}>
              &ldquo;{t('editor.exampleWindow')}&rdquo;
            </span>
          </div>
        )}
        {messages.map((msg, i) => {
          const code = msg.role === "assistant" ? extractCode(msg.content) : null;
          const textContent = msg.content
            .replace(/```(?:javascript|js)?\n[\s\S]*?```/g, "[code block]")
            .trim();

          return (
            <div
              key={i}
              className="animate-in"
              style={{
                alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "88%",
              }}
            >
              <div
                style={{
                  padding: "8px 12px",
                  borderRadius: msg.role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                  fontSize: 13,
                  lineHeight: 1.5,
                  background: msg.role === "user" ? "var(--accent)" : "var(--bg-elevated)",
                  color: msg.role === "user" ? "#fff" : "var(--text-primary)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {textContent}
              </div>
              {code && (
                <button
                  className="btn"
                  onClick={() => onApplyCode(code)}
                  style={{
                    marginTop: 6,
                    padding: "4px 10px",
                    background: "var(--success-muted)",
                    color: "var(--success)",
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {t('editor.applyToScene')}
                </button>
              )}
            </div>
          );
        })}
        {loading && (
          <div style={{ color: "var(--accent)", fontSize: 13, padding: 8 }}>
            <span style={{ animation: "pulse 1.5s infinite" }}>{t('editor.thinking')}</span>
          </div>
        )}
      </div>
      <div
        style={{
          padding: 12,
          borderTop: "1px solid var(--border)",
          display: "flex",
          gap: 6,
        }}
      >
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder={t('editor.describeChange')}
          style={{ flex: 1, padding: "8px 12px", fontSize: 13 }}
        />
        <button
          className="btn btn-primary"
          onClick={send}
          disabled={loading || !input.trim()}
          style={{
            padding: "8px 14px",
            fontSize: 13,
            opacity: loading || !input.trim() ? 0.4 : 1,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
