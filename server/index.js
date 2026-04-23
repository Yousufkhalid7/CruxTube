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
  console.log("➡️ Trying subtitles:", videoId);

  let transcript = await getTranscriptWithYtDlp(videoUrl, videoId);

  if (transcript) {
    console.log("✅ Subtitles used:", videoId);
    return transcript;
  }

  console.log("⚠️ Falling back to Whisper:", videoId);

  try {
    const audioPath = await downloadAudio(videoId);
    console.log("🎧 Audio downloaded");

    const text = await transcribeWithWhisper(audioPath);
    console.log("🧠 Whisper success");

    fs.unlinkSync(audioPath);

    return text;

  } catch (err) {
    console.error("❌ Whisper failed:", err.message);
    return null;
  }
}

async function summarizeText(text) {
  const response = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [
      {
        role: "user",
        content: `Summarize this YouTube transcript:\n\n${text}`
      }
    ]
  });

  return response.choices[0].message.content;
}

app.get('/transcript', async (req, res) => {
  try {
    console.log("🔥 REQUEST RECEIVED");

    const url = req.query.url;
    console.log("URL:", url);

    if (!url) {
      return res.status(400).json({ error: "URL required" });
    }

    // 🔥 PLAYLIST
    if (isPlaylist(url)) {
      let videoIds = await getPlaylistVideos(url);
      videoIds = videoIds.slice(0, 5);

      const results = await Promise.all(
        videoIds.map(async (id) => {
          const videoUrl = `https://www.youtube.com/watch?v=${id}`;

          const transcript = await getTranscript(videoUrl, id);

          if (!transcript) {
            return { videoId: id, transcript: null, summary: "Not available" };
          }

          const summary = await summarizeText(transcript.slice(0, 8000));

          return { videoId: id, transcript, summary };
        })
      );

      return res.json({ playlist: true, results });
    }

    // SINGLE VIDEO
    const videoId = getVideoId(url);

    if (!videoId) {
      return res.status(400).json({ error: "Invalid URL" });
    }

    const transcript = await getTranscript(url, videoId);

    if (!transcript) {
      return res.status(404).json({ error: "Transcript not available" });
    }

    const summary = await summarizeText(transcript.slice(0, 8000));

    res.json({
      playlist: false,
      transcript,
      summary
    });

  } catch (err) {
    console.error("💥 ERROR:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
