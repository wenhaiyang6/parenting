const express = require('express');
const router = express.Router();
const OpenAI = require('openai');
const Conversation = require('../models/Conversation');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Get all conversations for a user
router.get('/conversations', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    const conversations = await Conversation.find({ userId })
      .sort({ updatedAt: -1 });
    res.json(conversations);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// Get single conversation
router.get('/conversations/:id', async (req, res) => {
  try {
    const conversation = await Conversation.findOne({ id: req.params.id });
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json(conversation);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

// Update existing stream route to save conversations
router.post('/stream', async (req, res) => {
  try {
    const { question, conversationId, conversationHistory } = req.body;
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Set up streaming headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let conversation;
    if (conversationId) {
      conversation = await Conversation.findOne({ id: conversationId });
    }

    const newMessage = {
      id: Date.now().toString(),
      text: question,
      answer: '',
      timestamp: new Date().toLocaleString()
    };

    if (!conversation) {
      conversation = new Conversation({
        id: Date.now().toString(),
        userId,
        messages: [newMessage]
      });
    } else {
      conversation.messages.push(newMessage);
    }

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

    let fullAnswer = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullAnswer += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();

    // Update the message with the complete answer
    conversation.messages[conversation.messages.length - 1].answer = fullAnswer;

    // Save the conversation after streaming is complete
    await conversation.save();
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to get answer' });
  }
});

module.exports = router;
