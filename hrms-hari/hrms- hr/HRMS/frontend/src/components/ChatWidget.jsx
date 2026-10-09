import { useState, useRef, useEffect } from "react";
import API from "../api/axios";
import { v4 as uuidv4 } from "uuid";
import { useBranding } from "../context/BrandingContext";
import { useAuth } from "../context/AuthContext";
import { marked } from "marked";
import { FiSend, FiX, FiUser, FiLoader, FiCpu } from "react-icons/fi";
import { TbRobot } from "react-icons/tb";

const botMsg = (text, suggestions = []) => ({
  id: Date.now() + Math.random(),
  type: "bot",
  text,
  suggestions,
  time: new Date().toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  }),
});

const userMsg = (text) => ({
  id: Date.now() + Math.random(),
  type: "user",
  text,
  time: new Date().toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  }),
});

const getInitialMessage = (companyName) =>
  botMsg(
    `Hello! Welcome to **${companyName || "our company"}**!

I'm your intelligent HR Assistant. I can help you with:

• Leave balance & applications
• Payslip & salary details
• Attendance summary
• Employee profile
• HR support tickets

How can I assist you today?`,
    [
      "Check leave balance",
      "View my payslip",
      "Check attendance",
      "Raise support ticket",
    ],
  );

export default function ChatWidget() {
  const { branding } = useBranding();
  const { user } = useAuth();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => uuidv4());

  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const bubbleRef = useRef(null);

  // Floating chat bubble position
  const [position, setPosition] = useState(() => ({
    x: typeof window !== "undefined" ? window.innerWidth - 80 : 20,
    y: typeof window !== "undefined" ? window.innerHeight - 80 : 20,
  }));

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hasDragged, setHasDragged] = useState(false);

  // Keep the chat bubble inside the screen when resized
  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => ({
        x: Math.max(20, Math.min(prev.x, window.innerWidth - 60)),
        y: Math.max(20, Math.min(prev.y, window.innerHeight - 60)),
      }));
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Close the chat when clicking outside it
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        open &&
        !event.target.closest(".chat-bubble") &&
        !event.target.closest(".chat-window")
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  // Initialize the greeting message
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([getInitialMessage(branding?.company_name)]);
    }
  }, [branding?.company_name, messages.length]);

  // Scroll to the latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, loading]);

  // Send a message to the HR backend.
  // API keys must remain on the backend, never in frontend code.
  const sendMessage = async (text) => {
    const message = text.trim();

    if (!message || loading) return;

    setMessages((prev) => [...prev, userMsg(message)]);

    setInput("");

    // Reset the textarea height after sending
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    setLoading(true);

    try {
      const { data } = await API.post("/chat", {
        message,
        sessionId,
      });

      const replyText =
        typeof data?.message === "string" ? data.message.trim() : "";

      if (replyText && replyText !== "I cannot answer that.") {
        setMessages((prev) => [
          ...prev,
          botMsg(
            replyText,
            Array.isArray(data?.suggestions) ? data.suggestions : [],
          ),
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          botMsg(
            "I could not find an answer to that question. Please try rephrasing it or contact your HR team.",
          ),
        ]);
      }
    } catch (error) {
      console.error("HR chat request failed:", error);

      setMessages((prev) => [
        ...prev,
        botMsg(
          "Sorry, the chat service is currently unavailable. Please try again later.",
        ),
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  // Enter sends; Shift + Enter creates a new line
  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage(input);
    }
  };

  // Format message text as Markdown
  const formatText = (text) => {
    return marked.parse(String(text ?? ""), {
      async: false,
    });
  };

  // Start dragging the floating chat bubble
  const handlePointerDown = (event) => {
    setIsDragging(true);
    setHasDragged(false);

    setDragStart({
      x: event.clientX - position.x,
      y: event.clientY - position.y,
    });

    if (bubbleRef.current) {
      bubbleRef.current.setPointerCapture(event.pointerId);
    }
  };

  // Move the floating chat bubble
  const handlePointerMove = (event) => {
    if (!isDragging) return;

    setHasDragged(true);

    const newX = Math.max(
      20,
      Math.min(event.clientX - dragStart.x, window.innerWidth - 60),
    );

    const newY = Math.max(
      20,
      Math.min(event.clientY - dragStart.y, window.innerHeight - 60),
    );

    setPosition({
      x: newX,
      y: newY,
    });
  };

  // Stop dragging
  const handlePointerUp = (event) => {
    setIsDragging(false);

    if (
      bubbleRef.current &&
      bubbleRef.current.hasPointerCapture(event.pointerId)
    ) {
      bubbleRef.current.releasePointerCapture(event.pointerId);
    }
  };

  // Toggle the chat window when the bubble is clicked
  const handleBubbleClick = () => {
    if (!hasDragged) {
      setOpen((previous) => !previous);
    }
  };

  const profileImage = user?.profile_image;

  const profileImageSrc = profileImage
    ? profileImage.startsWith("http") || profileImage.startsWith("data:")
      ? profileImage
      : `${import.meta.env.VITE_API_BASE_URL || ""}${profileImage}`
    : null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 9999,
      }}
    >
      {/* Floating chat bubble */}
      <button
        ref={bubbleRef}
        id="chat-copilot-btn"
        className={`chat-bubble ${open ? "active" : ""}`}
        title={branding?.company_name || "HR Assistant"}
        aria-label={open ? "Close HR assistant" : "Open HR assistant"}
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "1.5rem",
          transform: open ? "rotate(90deg)" : "none",
          transition: isDragging
            ? "none"
            : "transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
          padding: 0,
          background: !open ? "var(--gradient-primary)" : undefined,
          overflow: "hidden",
          border: "none",
          position: "absolute",
          left: `${position.x}px`,
          top: `${position.y}px`,
          pointerEvents: "auto",
          cursor: isDragging ? "grabbing" : "grab",
          touchAction: "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={handleBubbleClick}
      >
        {open ? <FiX /> : <TbRobot />}
      </button>

      {/* Chat window */}
      {open && (
        <div
          className="chat-window"
          style={{
            pointerEvents: "auto",
            ...(window.innerWidth > 768
              ? {
                  bottom: `${window.innerHeight - position.y + 20}px`,
                  right: `${window.innerWidth - position.x - 60}px`,
                }
              : {}),
          }}
        >
          {/* Header */}
          <div className="chat-header">
            <div
              className="chat-avatar"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                padding: 0,
                background: "#fff",
              }}
            >
              <TbRobot
                size={20}
                style={{
                  color: "var(--accent-primary)",
                }}
              />
            </div>

            <div>
              <div className="chat-title">
                {branding?.company_name || "HR Assistant"}
              </div>

              <div className="chat-subtitle">
                <span
                  style={{
                    width: 8,
                    height: 8,
                    background: "#10b981",
                    borderRadius: "50%",
                    display: "inline-block",
                    marginRight: 6,
                  }}
                />
                Online — Intelligent HR Assistant
              </div>
            </div>

            <button
              className="chat-close"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
            >
              <FiX />
            </button>
          </div>

          {/* Messages */}
          <div className="chat-messages" id="chat-messages" aria-live="polite">
            {messages.map((msg) => (
              <div key={msg.id} className={`chat-msg ${msg.type}`}>
                <div
                  className="chat-msg-avatar"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    padding: 0,
                    background:
                      msg.type === "bot" ? "#fff" : "var(--gradient-primary)",
                  }}
                >
                  {msg.type === "bot" ? (
                    <TbRobot
                      size={16}
                      style={{
                        color: "var(--accent-primary)",
                      }}
                    />
                  ) : profileImageSrc ? (
                    <img
                      src={profileImageSrc}
                      alt="User profile"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    user?.name?.[0] || <FiUser size={16} />
                  )}
                </div>

                <div className="chat-msg-content">
                  <div
                    className="chat-bubble-text"
                    dangerouslySetInnerHTML={{
                      __html: formatText(msg.text),
                    }}
                  />

                  {msg.suggestions?.length > 0 && (
                    <div className="chat-suggestions">
                      {msg.suggestions.map((suggestion, index) => (
                        <button
                          key={`${suggestion}-${index}`}
                          className="chat-suggestion-chip"
                          onClick={() => sendMessage(suggestion)}
                          disabled={loading}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="chat-msg-time">{msg.time}</div>
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div className="chat-msg bot">
                <div
                  className="chat-msg-avatar"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    padding: 0,
                    background: "#fff",
                  }}
                >
                  <FiCpu
                    size={16}
                    style={{
                      color: "var(--accent-primary)",
                    }}
                  />
                </div>

                <div className="chat-typing">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Message input */}
          <div className="chat-input-area">
            <textarea
              ref={inputRef}
              className="chat-input"
              placeholder="Type your message..."
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                event.target.style.height = "auto";
                event.target.style.height = `${event.target.scrollHeight}px`;
              }}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={loading}
              id="chat-input-field"
              aria-label="Type a message"
              style={{
                maxHeight: 120,
                overflowY: "auto",
              }}
            />

            <button
              className="chat-send-btn"
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
              id="chat-send-btn"
              aria-label="Send message"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: input.trim()
                  ? "var(--gradient-primary)"
                  : "var(--border-color)",
                color: "#fff",
                border: "none",
                borderRadius: "50%",
                width: 44,
                height: 44,
                cursor: "pointer",
                transition: "all 0.3s ease",
                boxShadow: input.trim()
                  ? "0 4px 12px rgba(99,102,241,0.3)"
                  : "none",
              }}
            >
              {loading ? <FiLoader className="spin" /> : <FiSend />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
