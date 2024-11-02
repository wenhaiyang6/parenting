require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const corsOptions = require('./config/cors');

const app = express();
const port = process.env.PORT || 3001;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.use(cors(corsOptions));
app.use(express.json());

app.post('/api/ask/stream', async (req, res) => {
  try {
    const { question } = req.body;
    
    // Set headers for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = await openai.chat.completions.create({
      messages: [
        { 
          role: "system", 
          content: "You are a helpful parenting expert. Provide clear, concise advice based on established parenting practices."
        },
        {
          role: "user",
          content: question
        }
      ],
      model: "gpt-3.5-turbo",
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to get answer' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 