require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
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
    const command = `yt-dlp --flat-playlist --print "%(id)s" ${url}`;

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

async function summarizeText(text) {
  const response = await groq.chat.completions.create({
    model: "llama3-70b-8192",
    messages: [
      {
        role: "user",
        content: `Summarize this YouTube transcript clearly:\n\n${text}`
      }
    ]
  });

  return response.choices[0].message.content;
}

app.get('/transcript', async (req, res) => {
  try {
    const url = req.query.url;

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    if (isPlaylist(url)) {
      console.log("Playlist detected");

      let videoIds = await getPlaylistVideos(url);

      videoIds = videoIds.slice(0, 5);

      const results = await Promise.all(
        videoIds.map(async (id) => {
          const videoUrl = `https://www.youtube.com/watch?v=${id}`;

          const transcript = await getTranscriptWithYtDlp(videoUrl, id);

          if (!transcript) {
            return {
              videoId: id,
              transcript: null,
              summary: "Transcript not available"
            };
          }

          const summary = await summarizeText(transcript.slice(0, 8000));

          return {
            videoId: id,
            transcript,
            summary
          };
        })
      );

      const combinedText = results
        .map(r => r.transcript)
        .filter(Boolean)
        .join(" ");

      const playlistSummary = combinedText
        ? await summarizeText(combinedText.slice(0, 12000))
        : "No transcripts available";

      return res.json({
        playlist: true,
        playlistSummary,
        results
      });
    }

    const videoId = getVideoId(url);

    if (!videoId) {
      return res.status(400).json({ error: "Invalid URL" });
    }

    const transcript = await getTranscriptWithYtDlp(url, videoId);

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
    console.error(err);
    res.status(500).json({ error: "Server Error" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});