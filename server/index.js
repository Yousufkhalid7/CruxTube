require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());


// =============================
// 🔹 ROUTE
// =============================
app.get('/transcript', async (req, res) => {
  try {
    const url = req.query.url;

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    const videoId = getVideoId(url);
    console.log("VIDEO ID:", videoId);

    if (!videoId) {
      return res.status(400).json({ error: "Invalid YouTube URL" });
    }

    const transcript = await getTranscriptWithYtDlp(url, videoId);

    if (!transcript) {
      return res.status(404).json({ error: "Transcript not available" });
    }

    console.log("TRANSCRIPT LENGTH:", transcript.length);
    console.log("SAMPLE:", transcript.slice(0, 100));

    res.json({ transcript });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server Error" });
  }
});


// =============================
// 🔹 VIDEO ID EXTRACTOR
// =============================
function getVideoId(url) {
  const regex = /(?:youtube\.com\/(?:.*v=|.*\/)|youtu\.be\/)([^#&?]*).*/;
  const match = url.match(regex);
  return (match && match[1].length === 11) ? match[1] : null;
}


// =============================
// 🔹 YT-DLP TRANSCRIPT
// =============================
function getTranscriptWithYtDlp(url, videoId) {
  return new Promise((resolve, reject) => {
    const outputTemplate = `sub_${videoId}.%(ext)s`;

    const command = `yt-dlp --write-auto-subs --skip-download --sub-format vtt -o "${outputTemplate}" ${url}`;

    console.log("Running yt-dlp...");

    exec(command, (err, stdout, stderr) => {
      if (err) {
        console.error("yt-dlp error:", err.message);
        return resolve(null);
      }

      // find generated .vtt file
      const files = fs.readdirSync(__dirname);
      const vttFile = files.find(f => f.startsWith(`sub_${videoId}`) && f.endsWith('.vtt'));

      if (!vttFile) {
        console.log("No subtitle file found");
        return resolve(null);
      }

      const filePath = path.join(__dirname, vttFile);

      const transcript = parseVTT(filePath);

      // cleanup file
      fs.unlinkSync(filePath);

      resolve(transcript);
    });
  });
}


// =============================
// 🔹 VTT PARSER
// =============================
function parseVTT(filePath) {
  const data = fs.readFileSync(filePath, 'utf-8');

  return data
    .split('\n')
    .filter(line =>
      line &&
      !line.includes('WEBVTT') &&
      !line.includes('-->') &&
      isNaN(line.trim()) // remove timestamps indexes
    )
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}


// =============================
// 🔹 START SERVER
// =============================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});