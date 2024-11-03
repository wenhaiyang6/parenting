const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  id: { type: String, required: true },
  text: { type: String, required: true },
  answer: { type: String },
  timestamp: { type: String, required: true }
});

const conversationSchema = new mongoose.Schema({
  id: { type: String, required: true },
  userId: { type: String, required: true }, // For future auth implementation
  messages: [messageSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Conversation', conversationSchema); 