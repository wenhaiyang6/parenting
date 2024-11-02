import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import './App.css';
import { getApiUrl } from './config/api';

function App() {
  const [question, setQuestion] = useState('');
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (question.trim()) {
      setLoading(true);
      
      // Create new message
      const newMessage = {
        id: Date.now(),
        text: question,
        answer: '',
        timestamp: new Date().toLocaleString()
      };

      let currentConversationId;

      // If no active conversation, create new one
      if (!activeConversationId) {
        const newConversation = {
          id: Date.now(),
          messages: [newMessage]
        };
        setConversations(prev => [...prev, newConversation]);
        setActiveConversationId(newConversation.id);
        currentConversationId = newConversation.id;
      } else {
        // Add to existing conversation
        setConversations(prev => 
          prev.map(conv => 
            conv.id === activeConversationId 
              ? { ...conv, messages: [...conv.messages, newMessage] }
              : conv
          )
        );
        currentConversationId = activeConversationId;
      }

      setQuestion('');

      try {
        // Get current conversation history
        const currentConversation = conversations.find(c => c.id === currentConversationId);
        const conversationHistory = currentConversation?.messages || [];

        const response = await fetch(getApiUrl('/api/ask/stream'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: (() => {
            const payload = { 
              question,
              conversationHistory: conversationHistory.map(m => ({
                question: m.text,
                answer: m.answer
              }))
            };
            console.log('Request payload:', payload);
            return JSON.stringify(payload);
          })(),
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let answer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              
              try {
                const parsed = JSON.parse(data);
                const currentAnswer = answer + parsed.content;
                answer = currentAnswer;
                
                // Update the answer in real-time
                setConversations(prev => 
                  prev.map(conv => 
                    conv.id === currentConversationId 
                      ? {
                          ...conv,
                          messages: conv.messages.map(msg =>
                            msg.id === newMessage.id
                              ? { ...msg, answer: currentAnswer }
                              : msg
                          )
                        }
                      : conv
                  )
                );
              } catch (e) {
                console.error('Error parsing JSON:', e);
              }
            }
          }
        }

      } catch (error) {
        console.error('Error:', error);
        setLoading(false);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Parenting Q&A</h1>
      </header>
      
      <div className="main-container">
        {/* Left Sidebar */}
        <aside className="sidebar">
          <button className="new-conversation-btn" onClick={() => setActiveConversationId(null)}>
            New Conversation
          </button>
          
          <div className="conversations-list">
            {conversations.slice().reverse().map(conv => (
              <div 
                key={conv.id} 
                className={`conversation-item ${conv.id === activeConversationId ? 'active' : ''}`}
                onClick={() => setActiveConversationId(conv.id)}
              >
                {/* Show first message as conversation title */}
                {conv.messages[0]?.text.substring(0, 30)}...
              </div>
            ))}
          </div>
        </aside>

        {/* Main Chat Area */}
        <main className="chat-area">
          <div className="messages-container">
            {activeConversationId && conversations
              .find(conv => conv.id === activeConversationId)
              ?.messages.map(msg => (
                <div key={msg.id} className="message-wrapper">
                  <div className="user-message">
                    <p>{msg.text}</p>
                    <small>{msg.timestamp}</small>
                  </div>
                  {msg.answer && (
                    <div className="assistant-message">
                      <div className="markdown-content">
                        <ReactMarkdown>{msg.answer}</ReactMarkdown>
                      </div>
                      <small>{msg.timestamp}</small>
                    </div>
                  )}
                </div>
              ))}
          </div>

          <form className="input-form" onSubmit={handleSubmit}>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="Ask your parenting question here..."
              rows="3"
            />
            <button type="submit" disabled={loading}>
              {loading ? 'Getting Answer...' : 'Ask Question'}
            </button>
          </form>
        </main>
      </div>
    </div>
  );
}

export default App; 