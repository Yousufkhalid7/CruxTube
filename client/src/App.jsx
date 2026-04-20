import { use, useState } from "react";
import axios from "axios";
import './App.css'

function App() {
    const [url, setUrl] = useState('')
    const [summary, setSummary] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    function extractVideoId(url) {
        const match = url.match(/(?:v=|youtu\.be\/)([^&\n?#]+)/)
        return match ? match[1] : null
    }

    async function handleSummarize() {
        setError('')
        setSummary('')

        const videoId = extractVideoId(url)

        if (!videoId) {
            setError('Please paste a valid YouTube URL')
            return
        }

        setLoading(true)

        try {
            const response = await axios.post('http://localhost:5000/summarize', { videoId })
            setSummary(response.data.summary)
        } catch (err) {
            setError('Something went wrong')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="container">
            <h1>CruxTube</h1>
            <p className="subtitle">No more clickbaits</p>

            <div className="input-row">
                <input type="text" placeholder="https://youtube.com/watch?v=..."
                    value={url} onChange={(e) => setUrl(e.target.value)}
                />
                <button onClick={handleSummarize} disabled = { loading }>
                    {loading? 'Zoop Zoop Zoop': 'Generate Summary'}
                </button>
            </div>
            
            { error && <p className="error">{error}</p> }

            { summary && (
                <div className="summary-box">
                    <h2>Summary</h2>
                    <p>{summary}</p>
                    </div>
            )}
        </div>
    )
}

export default App