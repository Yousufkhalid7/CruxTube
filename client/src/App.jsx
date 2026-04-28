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

  // 🔹 Process Video
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
        { type: "bot", text: "Summary ready. Ask me anything about the video." },
      ]);
    } catch (err) {
      console.error(err);
      setSummary("Error generating summary.");
    }

    setLoading(false);
  };

  // 🔹 Chat
  const askQuestion = async () => {
    if (!question || !videoId) return;

    const newChat = [...chat, { type: "user", text: question }];
    setChat(newChat);
    setQuestion("");

    try {
      const res = await fetch("http://localhost:5000/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ videoId, question }),
      });

      const data = await res.json();

      setChat([
        ...newChat,
        { type: "bot", text: data.answer || "No response" },
      ]);
    } catch (err) {
      console.error(err);
    }
  };

  // 🔹 Translate
  const translateSummary = async () => {
    try {
      const res = await fetch(
        "http://localhost:5000/translate-summary",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ videoId }),
        }
      );

      const data = await res.json();

      setTranslated(data.translated);
      setShowOriginal(true);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col items-center p-6">

      {/* 🔹 Header */}
      <h1 className="text-3xl font-bold text-sky-400 mb-6">
        CruxTube
      </h1>

      {/* 🔹 Main Container */}
      <div className="w-full max-w-2xl flex flex-col space-y-4">

        {/* Bot Intro */}
        <div className="bg-gray-200 text-black px-4 py-3 rounded-xl w-fit">
          Hey! Send me the URL...
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Paste YouTube URL..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 px-4 py-2 rounded-lg text-black"
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />
          <button
            onClick={handleSubmit}
            className="bg-sky-500 px-4 py-2 rounded-lg hover:bg-sky-600"
          >
            Send
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-gray-400 animate-pulse">
            Generating summary...
          </div>
        )}

        {/* Summary */}
        {summary && (
          <div className="bg-gray-200 text-black px-4 py-3 rounded-xl">
            <p>{showOriginal ? translated : summary}</p>

            {!showOriginal && (
              <button
                onClick={translateSummary}
                className="mt-2 text-sm text-blue-600 underline"
              >
                Convert to original language
              </button>
            )}
          </div>
        )}

        {/* Chat Box */}
        {chat.length > 0 && (
          <div className="flex flex-col space-y-3 max-h-[350px] overflow-y-auto border border-gray-700 p-3 rounded-lg">
            {chat.map((msg, i) => (
              <div
                key={i}
                className={`px-4 py-2 rounded-xl w-fit max-w-[80%] ${
                  msg.type === "user"
                    ? "bg-red-500 text-black self-end"
                    : "bg-gray-200 text-black"
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
              placeholder="Ask something..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="flex-1 px-4 py-2 rounded-lg text-black"
              onKeyDown={(e) => e.key === "Enter" && askQuestion()}
            />
            <button
              onClick={askQuestion}
              className="bg-sky-500 px-4 py-2 rounded-lg hover:bg-sky-600"
            >
              Send
            </button>
          </div>
        )}
      </div>
    </div>
  );
}