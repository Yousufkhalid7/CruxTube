require('dotenv').config();

const express = require('express')
const cors = require('cors')
const { GoogleGenerativeAI } = require('@google/generative-ai')
const { YoutubeTranscript } = require('youtube-transcript')

const app = express();

app.use(cors());

app.use(express.json());

const GenAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/summarize', async(req, res) => {
    try{
        const { videoId } = req.body;

        const transcriptData = await YoutubeTranscript.fetchTranscript(videoId);
        const transcript = transcriptData.map(chunk=>chunk.text).join(' ');
        const model = GenAI.getGenerativeModel({ model: 'gemini-pro' });
        const prompt = 'You are a helpful assistant. Summarize this Youtube video transcript. Pull out the key points, main topics covered, and important facts mentioned.'

        Transcript:
        '${transcript}';

        const result = await model.generateContent(prompt);
        const summary =result.response.text();

        res.json({summary, transcript: transcript.slice(0,500)});
    }catch(error){
        console.error('Error:', error.message);
        res.status(500).json({ error: error.message});
    }
    });

    const PORT =process.env.PORT || 5000;
    app.listen(PORT, () => {
        console.log('Server running on https://localhost:${PORT}');

    });
    //dotenv(get api keys from .env file), import express, cors, generative ai, youtubetranscript, start the app from express, make use of boht the cors and express
    // make use of generative ai
    // define a function for youtube transcript like and if-else, in case if transcript doesnt load or some error occur,
    //it will give an error message and in that fetch the transcript using the video id, give it to AI with a prompt
    // open the port where the server actually turns on locally on 5000 or if the environment exists then on it