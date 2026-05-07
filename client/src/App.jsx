import { useState, useRef, useEffect } from "react";
import "./App.css";

const API = "http://localhost:5000";

const STAGE = {
  AWAITING_URL: "awaiting_url",
  PROCESSING:   "processing",
  READY:        "ready",
};

// parse **bold**, *italic*, `code`, and newlines into html
function parseMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g,     "<em>$1</em>")
    .replace(/`(.+?)`/g,       "<code>$1</code>")
    .replace(/\n/g,            "<br />");
}

// streams full text into an existing message word by word
function streamInto(id, fullText, setMessages, onDone) {
  const words = fullText.split(" ");
  let i = 0;
  function tick() {
    if (i >= words.length) { onDone?.(); return; }
    i++;
    const partial = words.slice(0, i).join(" ");
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, text: partial } : m))
    );
    setTimeout(tick, 20);
  }
  tick();
}

const isValidYouTubeUrl = (url) => {
  const regex = /(?:youtube\.com\/(?:.*v=|.*\/)|youtu\.be\/)([^#&?]*).*/;
  const match = url.match(regex);
  return match && match[1].length === 11;
};

const extractVideoId = (url) => {
  const regex = /(?:youtube\.com\/(?:.*v=|.*\/)|youtu\.be\/)([^#&?]*).*/;
  const match = url.match(regex);
  return match ? match[1] : null;
};

const TypingBubble = () => (
  <div className="msg bot">
    <span className="msg-who">crux</span>
    <div className="bubble">
      <span className="typing-dots"><span /><span /><span /></span>
    </div>
  </div>
);

// renders a message bubble — bot bubbles use dangerouslySetInnerHTML for markdown
function BubbleContent({ msg }) {
  if (msg.from === "bot") {
    return (
      <p dangerouslySetInnerHTML={{ __html: parseMarkdown(msg.text) }} />
    );
  }
  return <p>{msg.text}</p>;
}

export default function App() {
  const [messages, setMessages] = useState([
    {
      id: "init",
      from: "bot",
      text: "hey. paste a youtube video url and i'll summarize it for you.",
    },
  ]);
  const [input, setInput]         = useState("");
  const [stage, setStage]         = useState(STAGE.AWAITING_URL);
  const [videoId, setVideoId]     = useState(null);
  const [isTyping, setIsTyping]   = useState(false);
  const [showTranslate, setShowTranslate] = useState(false);
  const [translating, setTranslating]     = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const addBot = (text, extra = {}) => {
    const id = crypto.randomUUID();
    setMessages((prev) => [...prev, { id, from: "bot", text, ...extra }]);
    return id;
  };

  const addUser = (text) =>
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), from: "user", text }]);

  const withTyping = (fn, delay = 650) => {
    setIsTyping(true);
    setTimeout(async () => {
      setIsTyping(false);
      await fn();
    }, delay);
  };

  // adds a bot message then streams full text into it word by word
  const addBotStreamed = (fullText, extra = {}, onDone) => {
    const id = crypto.randomUUID();
    setMessages((prev) => [...prev, { id, from: "bot", text: "", ...extra }]);
    setTimeout(() => streamInto(id, fullText, setMessages, onDone), 50);
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || stage === STAGE.PROCESSING) return;
    setInput("");

    // ── awaiting url ──
    if (stage === STAGE.AWAITING_URL) {
      addUser(trimmed);

      if (!isValidYouTubeUrl(trimmed)) {
        withTyping(() => {
          addBot(
            "that doesn't look like a valid youtube video url. make sure it has a proper video id (e.g. youtube.com/watch?v=xxxxx or youtu.be/xxxxx)."
          );
        }, 500);
        return;
      }

      const vid = extractVideoId(trimmed);
      setVideoId(vid);
      setStage(STAGE.PROCESSING);

      withTyping(async () => {
        addBot("got it. fetching transcript and generating summary — this might take a moment...");
        setIsTyping(true);

        try {
          const res  = await fetch(`${API}/transcript?url=${encodeURIComponent(trimmed)}`);
          const data = await res.json();

          if (!res.ok) throw new Error(data.error || `server error ${res.status}`);
          if (!data.summary) throw new Error(`no summary in response. got: ${JSON.stringify(data)}`);

          setIsTyping(false);

          // stream the summary in word by word
          addBotStreamed(data.summary, { isSummary: true }, () => {
            // after streaming finishes, show follow-up
            setTimeout(() => {
              withTyping(() => {
                addBot("that's the summary. got any questions about the video?");
                setShowTranslate(true);
                setStage(STAGE.READY);
              }, 400);
            }, 300);
          });

        } catch (err) {
          setIsTyping(false);
          addBot(`something went wrong — ${err.message}`);
          setStage(STAGE.AWAITING_URL);
        }
      }, 700);

      return;
    }

    // ── ready for questions ──
    if (stage === STAGE.READY) {
      addUser(trimmed);
      setIsTyping(true);

      try {
        const res  = await fetch(`${API}/chat`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ videoId, question: trimmed }),
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || `server error ${res.status}`);

        setIsTyping(false);
        addBotStreamed(data.answer || "no answer returned.");
      } catch (err) {
        setIsTyping(false);
        addBot(`error: ${err.message}`);
      }
    }
  };

  const handleTranslate = async () => {
    setShowTranslate(false);
    setTranslating(true);

    try {
      const res  = await fetch(`${API}/translate-summary`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ videoId }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || `server error ${res.status}`);

      setTranslating(false);
      addBotStreamed(data.translated, { isSummary: true, isTranslation: true, lang: data.language });
    } catch (err) {
      setTranslating(false);
      addBot(`translation failed — ${err.message}`);
    }
  };

  const placeholder =
    stage === STAGE.AWAITING_URL ? "paste a youtube url..."             :
    stage === STAGE.PROCESSING   ? "processing..."                      :
                                   "ask something about the video...";

  return (
    <div className="root">
      <header className="header">
        <span className="logo">crux<span className="logo-dim">tube</span></span>
        <span className="header-sub">video intelligence</span>
      </header>

      <div className="feed">
        {messages.map((msg) => (
          <div key={msg.id} className={`msg ${msg.from}`}>
            <span className="msg-who">{msg.from === "bot" ? "crux" : "you"}</span>
            <div className={`bubble${msg.isSummary ? " summary-bubble" : ""}`}>
              {msg.isSummary && (
                <div className="summary-tag">
                  {msg.isTranslation ? `translated · ${msg.lang}` : "summary · english"}
                </div>
              )}
              <BubbleContent msg={msg} />
            </div>
          </div>
        ))}

        {isTyping && <TypingBubble />}

        {showTranslate && !translating && (
          <div className="translate-nudge">
            <span>video not in english?</span>
            <button onClick={handleTranslate} className="nudge-btn">
              translate summary →
            </button>
          </div>
        )}
        {translating && (
          <div className="translate-nudge">
            <span className="nudge-loading">translating<span className="ellipsis" /></span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="composer">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder={placeholder}
          disabled={stage === STAGE.PROCESSING}
          className="composer-input"
          autoFocus
        />
        <button
          onClick={handleSend}
          disabled={stage === STAGE.PROCESSING || !input.trim()}
          className="composer-btn"
          aria-label="send"
        >
          ↵
        </button>
      </div>
    </div>
  );
}