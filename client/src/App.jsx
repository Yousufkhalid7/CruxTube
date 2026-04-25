import { useState } from "react";
import "./App.css";

function App() {
  const [url, setUrl] = useState("");
  const [summary, setSummary] = useState("");
  const [videoId, setVideoId] = useState("");
  const [question, setQuestion] = useState("");
  const [chat, setChat] = useState([]);
  const [loading, setLoading] = useState(false);

  const getVideoId = (url) => {
    const match = url.match(/(?:v=|youtu\.be\/)([^&]+)/);
    return match ? match[1] : null;
  };

  const processVideo = async () => {
    if (!url) return;

    setLoading(true);

    try {
      const res = await fetch(
        `http://localhost:5000/transcript?url=${url}`
      );
      const data = await res.json();

      setSummary(data.summary);
      setVideoId(getVideoId(url));
      setChat([]); // reset chat
    } catch (err) {
      console.error(err);
    }

    setLoading(false);
  };

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

  return (
    <div className="container">
      <h1>CruxTube</h1>

      {/* URL Input */}
      <div className="url-box">
        <input
          type="text"
          placeholder="Paste YouTube URL..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button onClick={processVideo}>
          {loading ? "Processing..." : "Get Summary"}
        </button>
      </div>

      {/* Summary */}
      {summary && (
        <div className="summary">
          <h3>Summary</h3>
          <p>{summary}</p>
        </div>
      )}

      {/* Chat */}
      <div className="chat-box">
        {chat.map((msg, i) => (
          <div
            key={i}
            className={msg.type === "user" ? "user" : "bot"}
          >
            {msg.text}
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="input-box">
        <input
          type="text"
          placeholder="Ask something..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && askQuestion()}
        />
        <button onClick={askQuestion}>Send</button>
      </div>
    </div>
  );
}

export default App;