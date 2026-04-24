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

const cache = {};

const videoStore = {};

function isPlaylist(url) {
  return url.includes("list=");
}

function getVideoId(url) {
  const regex = /(?:youtube\.com\/(?:.*v=|.*\/)|youtu\.be\/)([^#&?]*).*/;
  const match = url.match(regex);
  return (match && match[1].length === 11) ? match[1] : null;
}

function getPlaylistVideos(url) {
  return new Promise((resolve, reject) => {
    const command = `yt-dlp --quiet --flat-playlist --print "%(id)s" ${url}`;

    exec(command, (err, stdout) => {
      if (err) return reject(err);

      const ids = stdout
        .split("\n")
        .map(id => id.trim())
        .filter(Boolean);

      resolve(ids);
    });
  });
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

function parseVTT(filePath) {
  const data = fs.readFileSync(filePath, 'utf-8');

  return data
    .split('\n')
    .filter(line =>
      line &&
      !line.includes('WEBVTT') &&
      !line.includes('-->') &&
      isNaN(line.trim())
    )
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function downloadAudio(videoId) {
  return new Promise((resolve, reject) => {
    const output = `audio_${videoId}.mp3`;
    const url = `https://www.youtube.com/watch?v=${videoId}`;

    const command = `yt-dlp --quiet -x --audio-format mp3 --ffmpeg-location "C:\\Users\\yousu\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1-full_build\\bin" -o "${output}" ${url}`;

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

async function getTranscript(videoUrl, videoId) {
  let transcript = await getTranscriptWithYtDlp(videoUrl, videoId);

  if (transcript) {
    return transcript;
  }

  console.log("⚠️ Falling back to Whisper:", videoId);

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

function splitText(text, chunkSize = 3000) {
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

async function summarizeText(text) {
  const chunks = splitText(text, 3000);
  //PARALLEL PROCESSING
  const summaries = await Promise.all(
    chunks.map((chunk, i) => {
      console.log(`🔹 Chunk ${i + 1}/${chunks.length}`);

      return groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "user",
            content: `
Summarize this part of a YouTube transcript.
Focus on key ideas and insights.

Text:
${chunk}
`
          }
        ]
      }).then(res => res.choices[0].message.content);
    })
  );

  const combined = summaries.join("\n\n");

  const finalRes = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [
      {
        role: "user",
        content: `
Combine and refine these summaries into a clear final summary.

${combined}
`
      }
    ]
  });

  return finalRes.choices[0].message.content;
}

async function processInBatches(tasks, batchSize = 2) {
  const results = [];

  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);
    const res = await Promise.all(batch.map(fn => fn()));
    results.push(...res);
  }

  return results;
}

async function  checkRelevance(summary, question) {
  const response = await groq.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [
      {
        role: "system",
        content: "Answer ONLY yes or no. Is the question related to the video?"
      }
      {
        role: "user",
        content:`Summary: ${summary} ${question}`
      }
    ]
  })
  return response.choices[0].message.content.toLowerCase().includes("yes")
}

function getRelevantChunks(chunks, query){
  return chunks.map(chunk => ({
    text: chunk, score: query
    .toLowerCase().split(" ").filter(word => chunk.toLowerCase().includes(word)).length
  }))
  .sort((a, b) => b.score - a.score).slice(0, 3).map(item => item.text)
}

app.get('/transcript', async (req, res) => {
  try {
    const url = req.query.url;

    if (!url) {
      return res.status(400).json({ error: "URL required" });
    }

    // PLAYLIST
    if (isPlaylist(url)) {
      let videoIds = await getPlaylistVideos(url);
      videoIds = videoIds.slice(0, 10);

      const results = await processInBatches(
        videoIds.map(id => async () => {
          if (cache[id]) {
            return cache[id];
          }

          const videoUrl = `https://www.youtube.com/watch?v=${id}`;

          const transcript = await getTranscript(videoUrl, id);

          if (!transcript) {
            return { videoId: id, summary: "Not available" };
          }

          const summary = await summarizeText(transcript.slice(0, 12000));

          const result = { videoId: id, transcript, summary };
          cache[id] = result;

          return result;
        }),
        2
      );

      return res.json({ playlist: true, results });
    }

    // SINGLE VIDEO
    const videoId = getVideoId(url);

    const chunks = splitText(transcript(0, 500);
    videoStore[videoId] = {
      summary, chunks
    }

    if (!videoId) {
      return res.status(400).json({ error: "Invalid URL" });
    }

    // CACHE
    if (cache[videoId]) {
      console.log("⚡ Cache hit:", videoId);
      return res.json(cache[videoId]);
    }

    const transcript = await getTranscript(url, videoId);

    if (!transcript) {
      return res.status(404).json({ error: "Transcript not available" });
    }

    const summary = await summarizeText(transcript.slice(0, 12000));

    const result = {
      playlist: false,
      transcript,
      summary
    };

    cache[videoId] = result;

    res.json(result);

  } catch (err) {
    console.error("💥 ERROR:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

app.post('/chat', async(req, res) =>{

  const {summary, chunks} = data;

  const isRelated = await checkRelevance(summary, question);
  if(!isRelated){
    return res.json({answer: "This question is not related to the video(s)."})
  }

  const relevantChunks = getRelevantChunks(chunks, question)
  const context = relevantChunks.join("\n\n")

  const response = await groq.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [
      {
        role: "system",
        content: `You answer questions about the video.
        Rules:
        -Use transcript context if available
        -You MAY use general knowledge
        -Stay within topic`
      },
      {
        role: "user",
        content: `Summary: ${summary} Context: ${context} Question: ${question}` 
      }
    ]
  })
  res.json({ answer: response.choices[0].message.content})
  
  try{
    const {videoId, question} = req.body;

    const data = videoStore[videoId]

    if(!data){
      return res.status(404).json({error: "Process video first"})
    }

    res.json({message: "Chat route working"})
  } catch(err){
    console.error(err)
    res.status(500).json({error: "Server error"})
  }
})

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});