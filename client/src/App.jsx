import { useState, useRef, useEffect } from "react";

export default function App() {
  const [url, setUrl] = useState("");
  const [videoId, setVideoId] = useState("");
  const [summary, setSummary] = useState("");
  const [translated, setTranslated] = useState("");
  const [showOriginal, setShowOriginal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [chat, setChat] = useState([]);
  const [question, setQuestion] = useState("");

  const chatEndRef = useRef(null);

  const getVideoId = (url) => {
    const match = url.match(/(?:v=|youtu\.be\/)([^&]+)/);
    return match ? match[1] : null;
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  // ✨ Skeleton Loader
  const Skeleton = () => (
    <div className="animate-pulse space-y-3">
      <div className="h-4 bg-gray-700 rounded w-3/4"></div>
      <div className="h-4 bg-gray-700 rounded w-2/3"></div>
      <div className="h-4 bg-gray-700 rounded w-1/2"></div>
    </div>
  );

  // ✨ Streaming Effect
  const streamText = (text, baseChat) => {
    let i = 0;
    let current = "";

    const interval = setInterval(() => {
      current += text[i];
      i++;

      setChat([
        ...baseChat,
        { type: "bot", text: current + " ▌" },
      ]);

      if (i >= text.length) {
        clearInterval(interval);
        setChat([...baseChat, { type: "bot", text }]);
      }
    }, 8);
  };

  // 🎥 Process Video
  const handleSubmit = async () => {
    if (!url) return;

    setLoading(true);
    setSummary("");
    setChat([]);
    setShowOriginal(false);

    const id = getVideoId(url);
    setVideoId(id);

    try {
      const res = await fetch(
        `http://localhost:5000/transcript?url=${url}`
      );
      const data = await res.json();

      setSummary(data.summary);
      setChat([
        {
          type: "bot",
          text: "Summary ready. Ask me anything about the video.",
        },
      ]);
    } catch {
      setSummary("Something went wrong.");
    }

    setLoading(false);
  };

  // 💬 Chat
  const askQuestion = async () => {
    if (!question || !videoId) return;

    const newChat = [...chat, { type: "user", text: question }];
    setChat([...newChat, { type: "bot", text: "" }]);
    setQuestion("");

    try {
      const res = await fetch("http://localhost:5000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, question }),
      });

      const data = await res.json();
      streamText(data.answer, newChat);
    } catch {
      console.error("Chat error");
    }
  };

  // 🌐 Translate
  const translateSummary = async () => {
    try {
      const res = await fetch(
        "http://localhost:5000/translate-summary",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoId }),
        }
      );

      const data = await res.json();
      setTranslated(data.translated);
      setShowOriginal(true);
    } catch {
      console.error("Translate error");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#020617] to-black text-white flex flex-col items-center px-4 py-8">

      {/* Header */}
      <h1 className="text-4xl font-bold bg-gradient-to-r from-sky-400 to-blue-500 bg-clip-text text-transparent mb-10">
        CruxTube
      </h1>

      {/* Glass Container */}
      <div className="w-full max-w-2xl bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl shadow-xl p-5 space-y-5">

        {/* Bot Intro */}
        <div className="bg-white/10 px-4 py-3 rounded-xl w-fit text-gray-200">
          Hey! Send me a YouTube URL 👇
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Paste YouTube URL..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 px-4 py-2 rounded-lg bg-white/10 border border-white/10 focus:outline-none focus:ring-2 focus:ring-sky-500"
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />
          <button
            onClick={handleSubmit}
            className="bg-sky-500 px-5 py-2 rounded-lg hover:bg-sky-600 transition"
          >
            Send
          </button>
        </div>

        {/* Loading */}
        {loading && <Skeleton />}

        {/* Summary */}
        {summary && (
          <div className="bg-white/10 p-4 rounded-xl text-gray-200 leading-relaxed">
            {showOriginal ? translated : summary}

            {!showOriginal && (
              <button
                onClick={translateSummary}
                className="block mt-3 text-sm text-sky-400 hover:underline"
              >
                Convert to original language
              </button>
            )}
          </div>
        )}

        {/* Chat */}
        {chat.length > 0 && (
          <div className="max-h-[350px] overflow-y-auto space-y-3 pr-2">
            {chat.map((msg, i) => (
              <div
                key={i}
                className={`max-w-[75%] px-4 py-2 rounded-xl text-sm ${
                  msg.type === "user"
                    ? "ml-auto bg-sky-500 text-black"
                    : "bg-white/10 text-gray-200"
                }`}
              >
                {msg.text}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        )}

        {/* Chat Input */}
        {chat.length > 0 && (
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Ask anything..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="flex-1 px-4 py-2 rounded-lg bg-white/10 border border-white/10 focus:outline-none focus:ring-2 focus:ring-sky-500"
              onKeyDown={(e) => e.key === "Enter" && askQuestion()}
            />
            <button
              onClick={askQuestion}
              className="bg-sky-500 px-4 py-2 rounded-lg hover:bg-sky-600 transition"
            >
              Send
            </button>
          </div>
        )}
      </div>
    </div>
  );
}