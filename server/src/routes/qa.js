const express = require('express');
const router = express.Router();
const OpenAI = require('openai');
const Conversation = require('../models/Conversation');
const { google } = require('googleapis');
const customsearch = v1 = google.customsearch('v1');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Add these environment variables to your .env file
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID;

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
        id: conversationId || Date.now().toString(),
        userId,
        messages: [newMessage]
      });
    } else {
      conversation.messages.push(newMessage);
    }

    // Generate search keywords based on conversation history and current question
    const searchContext = [question];
    if (conversationHistory && conversationHistory.length > 0) {
      const lastMessages = conversationHistory.slice(-2); // Consider last 2 messages for context
      searchContext.push(...lastMessages.map(msg => msg.question));
    }

    // First search with AI-generated keywords
    const keywordResponse = await openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "Extract 2-3 key search terms from the given text. Respond with only the search terms, separated by spaces."
        },
        {
          role: "user",
          content: searchContext.join(" ")
        }
      ],
      model: "gpt-3.5-turbo",
    });

    const searchKeywords = keywordResponse.choices[0].message.content;
    console.log('Search keywords:', searchKeywords);

    // Perform both searches in parallel
    const [keywordResults, directResults] = await Promise.all([
      customsearch.cse.list({
        auth: GOOGLE_API_KEY,
        cx: GOOGLE_CSE_ID,
        q: searchKeywords,
        num: 3
      }),
      customsearch.cse.list({
        auth: GOOGLE_API_KEY,
        cx: GOOGLE_CSE_ID,
        q: question,
        num: 3
      })
    ]);

    // Merge and deduplicate results based on URLs
    const allItems = [...(keywordResults.data.items || []), ...(directResults.data.items || [])];
    const uniqueItems = Array.from(
      allItems.reduce((map, item) => {
        if (!map.has(item.link)) {
          map.set(item.link, item);
        }
        return map;
      }, new Map()).values()
    );

    // Extract information from merged results
    const searchInfo = uniqueItems
      .slice(0, 6) // Limit to top 6 results
      .map(item => ({
        snippet: item.snippet,
        title: item.title,
        link: item.link,
        date: item.pagemap?.metatags?.[0]?.['article:published_time'] || 
              item.pagemap?.metatags?.[0]?.['date'] ||
              item.pagemap?.metatags?.[0]?.['og:updated_time'] ||
              null,
        passage: item.pagemap?.metatags?.[0]?.['og:description'] || item.snippet
      }));

    // Format dates and combine passages for context
    const searchSnippets = searchInfo
      .map((item, index) => {
        const dateStr = item.date 
          ? `Published: ${new Date(item.date).toLocaleDateString()}`
          : 'Date not available';
        
        return `Source ${index + 1}: ${item.link}\nTitle: ${item.title}\n${dateStr}\nPassage: ${item.passage}`;
      })
      .join('\n\n');

    console.log('Search context:', searchSnippets);

    const messages = [
      { 
        role: "system", 
        content: `You are a helpful parenting expert. Provide clear, concise advice based on established parenting practices 
                 and the following reference information:\n\n${searchSnippets}\n\n
                 When responding, cite your sources using [1], [2], etc. corresponding to the order of the sources provided.
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
        res.write(`data: ${JSON.stringify({ 
          content,
          sources: searchInfo.map(item => ({
            title: item.title,
            link: item.link,
            date: item.date ? new Date(item.date).toLocaleDateString() : null
          }))
        })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
    console.log('Full answer:', fullAnswer);

    // Update the message with the complete answer and sources
    conversation.messages[conversation.messages.length - 1].answer = fullAnswer;
    conversation.messages[conversation.messages.length - 1].sources = searchInfo.map(item => ({
      title: item.title,
      link: item.link,
      date: item.date ? new Date(item.date).toLocaleDateString() : null
    }));

    // Save the conversation after streaming is complete
    await conversation.save();
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to get answer' });
  }
});

// Add this new route
router.delete('/conversations/:id', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const conversation = await Conversation.findOne({ 
      id: req.params.id,
      userId: userId 
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    await Conversation.deleteOne({ id: req.params.id });
    res.json({ message: 'Conversation deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

module.exports = router;
