require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getSubtitles } = require('youtube-captions-scraper');

const app = express();
app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function getTranscript(videoId) {
    try{
        const captions = await getSubtitles({ videoID: videoId, lang: 'en' });
        return captions.map(c => c.text).join(' ');
    }catch{
        const captions = await getSubtitles({videoID: videoId, lang: 'a.en' });
        return captions.map(c => c.text).join(' ');
    }
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