require('dotenv').config();

const express = require('express');
const cors = require('cors');
const xml2js = require('xml2js');
const axios = require('axios')

const app = express();
app.use(cors());
app.use(express.json());


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

    const transcript = await getTranscript(videoId);

    if(!transcript){
      return res.status(404).json({error: "Transcript not available"});
    }

    console.log("TRANSCRIPT LENGTH: ",transcript.length)
    console.log("SAMPLE: ", transcript.slice(0,100));

    res.json({ transcript });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server Error" });
  }
});

function getVideoId(url) {
  const regex = /(?:youtube\.com\/(?:.*v=|.*\/)|youtu\.be\/)([^#&?]*).*/;
  const match = url.match(regex);

  return (match && match[1].length === 11) ? match[1] : null;
}

async function getTranscript(videoId) {
  const urls = [
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&kind=asr`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en`,
    `https://www.youtube.com/api/timedtext?v=${videoId}`
  ];

  for (let url of urls) {
    try {
      console.log("Trying:", url);

      const response = await axios.get(url);

      if (!response.data) continue;

      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(response.data);

      if (!result.transcript || !result.transcript.text) continue;

      return result.transcript.text.map(item => item._).join(' ');

    } catch (err) {
      // try next option
    }
  }

  return null;
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});