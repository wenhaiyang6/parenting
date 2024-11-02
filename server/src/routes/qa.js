const express = require('express');
const router = express.Router();
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

router.post('/stream', async (req, res) => {
  try {
    const { question, conversationHistory } = req.body;
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Build conversation messages array
    const messages = [
      { 
        role: "system", 
        content: `You are a helpful parenting expert. Provide clear, concise advice based on established parenting practices. 
                 When responding, take into account the context of any previous questions and answers in the conversation.`
      }
    ];

    // Add conversation history
    if (conversationHistory && conversationHistory.length > 0) {
      conversationHistory.forEach(msg => {
        messages.push({ role: "user", content: msg.question });
        if (msg.answer) {
          messages.push({ role: "assistant", content: msg.answer });
        }
      });
    }

    // Add current question
    messages.push({ role: "user", content: question });
    console.log('Messages before sending:', messages);

    const stream = await openai.chat.completions.create({
      messages,
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

module.exports = router;
