const mongoose = require('mongoose');

const sourceSchema = new mongoose.Schema({
  title: String,
  link: String,
  date: String
});

const messageSchema = new mongoose.Schema({
  id: String,
  text: String,
  answer: String,
  timestamp: String,
  sources: [sourceSchema]
});

const conversationSchema = new mongoose.Schema({
  id: String,
  userId: String,
  messages: [messageSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

conversationSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Conversation', conversationSchema); 