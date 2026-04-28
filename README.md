# 🎥 CruxTube AI

CruxTube AI is a full-stack application that transforms YouTube videos and playlists into concise summaries and allows users to interact with the content through an AI-powered chat interface.

---

## 🚀 Features

### 📌 Core Functionality

* 🔗 Paste any YouTube video or playlist URL
* 🧠 Automatically extract transcript (with fallback to Whisper if needed)
* ✍️ Generate concise summaries (default: English)
* 🌐 Optional translation to original video language
* 💬 Chat with the video/playlist using contextual AI

---

### ⚡ Performance Optimizations

* 🧠 Smart chunking + parallel summarization
* 💾 In-memory + disk caching (instant reloads)
* ⏱ Reduced API calls (optimized pipeline)
* 🧩 Context-aware chunk retrieval for chat (faster + cheaper)

---

### 🌍 Multilingual Intelligence

* Summary always generated in English (default)
* One-click translation to original language
* Chat responses adapt to user's language automatically

---

## 🏗️ Tech Stack

### Frontend

* ⚛️ React (Vite)
* 🎨 Tailwind CSS
* 🌐 Fetch API

### Backend

* 🟢 Node.js + Express
* 🎥 yt-dlp (video + subtitle extraction)
* 🎙️ Whisper (fallback transcription)
* 🤖 Groq API (LLM)

### Utilities

* 📁 File System (disk caching)
* ⚙️ Husky (optional: pre-commit checks)

---

## 📂 Project Structure

```text
CruxTube/
│
├── server/
│   ├── index.js
│   ├── cache/
│   ├── .env
│   └── package.json
│
├── client/
│   ├── src/
│   │   ├── components/
│   │   ├── App.jsx
│   │   └── index.css
│   └── package.json
│
└── README.md
```

---

## ⚙️ Setup Instructions

### 1️⃣ Clone Repository

```bash
git clone https://github.com/your-username/cruxtube.git
cd cruxtube
```

---

### 2️⃣ Backend Setup

```bash
cd server
npm install
```

Create `.env` file:

```env
GROQ_API_KEY=your_api_key_here
```

Run backend:

```bash
node index.js
```

---

### 3️⃣ Frontend Setup

```bash
cd client
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

---

## 🧠 How It Works

```text
User Input
↓
Extract Video ID
↓
Fetch Transcript (yt-dlp / Whisper fallback)
↓
Chunk + Summarize (parallel processing)
↓
Store in Cache (memory + disk)
↓
Return Summary
↓
User can Chat → context-aware answers
```

---

## ⚡ Performance Design

* 🚫 Avoid unnecessary LLM calls (no LLM-based language detection)
* 📉 Reduced token usage via chunk trimming
* ⚡ Disk caching avoids recomputation
* 🔍 Relevant chunk selection for chat (not full transcript)

---

## 🧪 Future Improvements

* 🔄 Multi-LLM fallback system (Groq → OpenAI → Gemini)
* 🎥 Video preview integration
* 🧠 Embeddings-based retrieval (semantic search)

---

## 📌 Notes

* Subsequent requests are instant due to caching
* Whisper is only used when subtitles are unavailable

---

## 🧑‍💻 Author

**Yousuf Khalid**

---

## ⭐ If you like this project

Give it a ⭐ on GitHub and feel free to contribute!

---
