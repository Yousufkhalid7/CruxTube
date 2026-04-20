require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function getTranscript(videoId) {
  const { Innertube } = require('youtubei.js');
  const youtube = await Innertube.create();
  const info = await youtube.getInfo(videoId);
  const transcriptData = await info.getTranscript();
  return transcriptData.transcript.content.body.initial_segments
    .map(seg => seg.snippet.text)
    .join(' ');
}

app.post('/summarize', async (req, res) => {
  try {
    const { videoId } = req.body;
    const transcript = await getTranscript(videoId);

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `Summarize this YouTube video transcript clearly with key points:\n\n${transcript}`;
    const result = await model.generateContent(prompt);
    const summary = result.response.text();

    res.json({ summary });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
    //dotenv(get api keys from .env file), import express, cors, generative ai, youtubetranscript, start the app from express, make use of boht the cors and express
    // make use of generative ai
    // define a function for youtube transcript like and if-else, in case if transcript doesnt load or some error occur,
    //it will give an error message and in that fetch the transcript using the video id, give it to AI with a prompt
    // open the port where the server actually turns on locally on 5000 or if the environment exists then on it