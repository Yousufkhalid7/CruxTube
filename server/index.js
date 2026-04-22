require('dotenv').config();

const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());


// =============================
// 🔹 ROUTE (TEST ONLY)
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

    // 🚫 No transcript logic here
    res.json({
      message: "Video ID extracted successfully",
      videoId: videoId
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server Error" });
  }
});


// =============================
// 🔹 EXTRACT VIDEO ID
// =============================
function getVideoId(url) {
  const regex = /(?:youtube\.com\/(?:.*v=|.*\/)|youtu\.be\/)([^#&?]*).*/;
  const match = url.match(regex);

  return (match && match[1].length === 11) ? match[1] : null;
}


// =============================
// 🔹 START SERVER
// =============================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});