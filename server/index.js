require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const Groq = require('groq-sdk');

const app = express();
app.use(cors());
app.use(express.json());

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// MEMORY STORE
const videoStore = {};
const cache = {};

function getVideoId(url) {
  const regex = /(?:youtube\.com\/(?:.*v=|.*\/)|youtu\.be\/)([^#&?]*).*/;
  const match = url.match(regex);
  return (match && match[1].length === 11) ? match[1] : null;
}

function splitText(text, chunkSize = 3000) {
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

function parseVTT(filePath) {
  const data = fs.readFileSync(filePath, 'utf-8');

  return data.split('\n').filter(line =>
      line &&
      !line.includes('WEBVTT') &&
      !line.includes('-->') &&
      isNaN(line.trim())
    ).join(' ').replace(/\s+/g, ' ').trim();
}

function getTranscriptWithYtDlp(url, videoId) {
  return new Promise((resolve) => {
    const outputTemplate = `sub_${videoId}.%(ext)s`;

    const command = `yt-dlp --quiet --no-warnings --write-subs --write-auto-subs --sub-langs "all" --skip-download --sub-format vtt -o "${outputTemplate}" ${url}`;

    exec(command, () => {
      const files = fs.readdirSync(__dirname);
      const subtitleFiles = files.filter(f =>
        f.startsWith(`sub_${videoId}`) && f.endsWith('.vtt')
      );

      if (subtitleFiles.length === 0) {
        return resolve(null);
      }

      let selectedFile =
        subtitleFiles.find(f => f.includes('.en.')) || subtitleFiles[0];

      const filePath = path.join(__dirname, selectedFile);
      const transcript = parseVTT(filePath);
      subtitleFiles.forEach(f => fs.unlinkSync(path.join(__dirname, f)));

      resolve(transcript);
    });
  });
}

function downloadAudio(videoId) {
  return new Promise((resolve, reject) => {
    const output = `audio_${videoId}.mp3`;
    const url = `https://www.youtube.com/watch?v=${videoId}`;

    const command = `yt-dlp --quiet -x --audio-format mp3 -o "${output}" ${url}`;
    exec(command, (err) => {
      if (err) return reject(err);
      resolve(output);
    });
  });
}

async function transcribeWithWhisper(filePath) {
  const formData = new FormData();
  formData.append("file", fs.createReadStream(filePath));
  formData.append("model", "whisper-large-v3");

  const response = await axios.post(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    formData,
    {
      headers: {
        ...formData.getHeaders(),
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      maxBodyLength: Infinity
    }
  );

  return response.data.text;
}

async function detectLanguage(text) {
  const response = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [
      {
        role: "system", content: "Detect the language of the text. Return only the language name (e.g., English, German, Hindi)."
      },
      {
        role: "user",
        content: text.slice(0, 2000)
      }
    ]
  });
  return response.choices[0].message.content.trim();
}

async function getTranscript(videoUrl, videoId) {
  console.log("➡️ Trying subtitles:", videoId);

  let transcript = await getTranscriptWithYtDlp(videoUrl, videoId);
  if (transcript) {
    console.log("Subtitles used");
    return transcript;
  }

  console.log("Falling back to Whisper");
  try {
    const audioPath = await downloadAudio(videoId);
    const text = await transcribeWithWhisper(audioPath);

    fs.unlinkSync(audioPath);

    return text;
  } catch (err) {
    console.error("Whisper failed:", err.message);
    return null;
  }
}

async function summarizeText(text) {
  const chunks = splitText(text, 3000);

  const summaries = await Promise.all(
    chunks.map(chunk =>
      groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "user", content: `Summarize the following texts in english:\n${chunk}`
          }
        ]
      }).then(res => res.choices[0].message.content)
    )
  );

  const combined = summaries.join("\n\n");
  const final = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [
      {
        role: "user", content: `Create final summary in english:\n${combined}`
      }
    ]
  });

  return final.choices[0].message.content;
}

async function checkRelevance(summary, question) {
  const response = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [
      {
        role: "system",
        content: `Determine if the question is related to the video topic. Be lenient:
                  - Questions about meaning, summary, explanation → YES
                  - Only reject completely unrelated questions. Answer ONLY "yes" or "no".`
      },
      {
        role: "user",
        content: `Summary: ${summary} Question: ${question}`
      }
    ]
  });

  const reply = response.choices[0].message.content.toLowerCase();
  return reply.includes("yes") || reply.includes("related");
}

app.get('/transcript', async (req, res) => {
  try {
    const url = req.query.url;

    const language = await detectLanguage(transcript);

    const videoId = getVideoId(url);
    if (!videoId) {
      return res.status(400).json({ error: "Invalid URL" });
    }

    //CACHE
    if (cache[videoId]) {
      return res.json(cache[videoId]);
    }

    const transcript = await getTranscript(url, videoId);
    if (!transcript) {
      return res.status(404).json({ error: "Transcript not available" });
    }

    const summary = await summarizeText(transcript.slice(0, 12000));
    const chunks = splitText(transcript, 500);

    //STORE FOR CHAT
    videoStore[videoId] = { 
      summary, chunks, language
    };

    const result = { transcript, summary };
    cache[videoId] = result;
    res.json(result);

  } catch (err) {
    console.error("💥 ERROR:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

function getRelevantChunks(chunks, query) {
  return chunks
    .map(chunk => ({
      text: chunk,
      score: query.toLowerCase().split(" ").filter(word => chunk.toLowerCase().includes(word)).length
    }))
    .sort((a, b) => b.score - a.score).slice(0, 3).map(item => item.text);
}

app.post('/translate-summary', async (req, res) => {
  try {
    const { videoId } = req.body;
    const data = videoStore[videoId];

    if (!data) {
      return res.status(404).json({ error: "Video not found" });
    }

    const { summary, language } = data;
    const response = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "user", content: `Translate this summary to ${language}:\n${summary}`
        }
      ]
    });
    res.json({
      translated: response.choices[0].message.content,
      language
    });
  } catch (err) {
    res.status(500).json({ error: "Server Error" });
  }
});

app.post('/chat', async (req, res) => {
  try {
    const { videoId, question } = req.body;

    const data = videoStore[videoId];

    if (!data) {
      return res.status(404).json({error:"Process video first"});
    }

    const {summary, chunks} = data;

    const isRelated = await checkRelevance(summary, question);

    if (!isRelated) {
      return res.json({
        answer: "This question is not related to the video."
      });
    }

    const relevantChunks = getRelevantChunks(chunks, question);
    const context = relevantChunks.join("\n\n");

    const response = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content: "Answer using context + general knowledge, stay within topic."
        },
        {
          role: "user",
          content: `Summary: ${summary} Context: ${context} Question: ${question}`
        }
      ]
    });

    res.json({
      answer: response.choices[0].message.content
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server Error" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});