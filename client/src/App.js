import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import './App.css';
import { getApiUrl } from './config/api';
import { generateUserId } from './utils/deviceId';

function App() {
  const [question, setQuestion] = useState('');
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState(null);

  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const userId = await generateUserId();
        const response = await fetch(getApiUrl('/api/ask/conversations'), {
          headers: {
            'X-User-ID': userId
          }
        });
        const data = await response.json();
        setConversations(data);
        
        // Move this check inside a separate setActiveConversation call
        setActiveConversationId(prevId => {
          if (data.length > 0 && !prevId) {
            return data[0].id;
          }
          return prevId;
        });
      } catch (error) {
        console.error('Error fetching conversations:', error);
      }
    };

    fetchConversations();
  }, []); // Now we can safely use empty dependency array

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
      let updatedConversations;

      // If no active conversation, create new one
      if (!activeConversationId) {
        const newConversation = {
          id: Date.now(),
          messages: [newMessage]
        };
        updatedConversations = [...conversations, newConversation];
        setConversations(updatedConversations);
        setActiveConversationId(newConversation.id);
        currentConversationId = newConversation.id;
      } else {
        // Add to existing conversation
        updatedConversations = conversations.map(conv => 
          conv.id === activeConversationId 
            ? { ...conv, messages: [...conv.messages, newMessage] }
            : conv
        );
        setConversations(updatedConversations);
        currentConversationId = activeConversationId;
      }

      setQuestion('');

      try {
        // Get current conversation history from updated conversations
        const currentConversation = updatedConversations.find(c => c.id === currentConversationId);
        const conversationHistory = currentConversation?.messages || [];

        const userId = await generateUserId();
        const headers = {
          'Content-Type': 'application/json',
          'X-User-ID': userId
        };

        const response = await fetch(getApiUrl('/api/ask/stream'), {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({ 
            question,
            conversationId: currentConversationId,
            conversationHistory: conversationHistory.map(m => ({
              question: m.text,
              answer: m.answer
            }))
          })
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

  const handleDeleteConversation = async (convId, e) => {
    e.stopPropagation(); // Prevent conversation selection when clicking delete
    
    try {
      const userId = await generateUserId();
      const response = await fetch(getApiUrl(`/api/ask/conversations/${convId}`), {
        method: 'DELETE',
        headers: {
          'X-User-ID': userId
        }
      });

      if (response.ok) {
        // Remove conversation from state
        setConversations(prev => prev.filter(conv => conv.id !== convId));
        
        // If the deleted conversation was active, clear the active conversation
        if (activeConversationId === convId) {
          setActiveConversationId(null);
        }
      } else {
        console.error('Failed to delete conversation');
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
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
          <button 
            className="new-conversation-btn" 
            onClick={() => {
              setActiveConversationId(null);
              setQuestion('');
            }}
          >
            New Conversation
          </button>
          
          <div className="conversations-list">
            {conversations.slice().reverse().map(conv => (
              <div 
                key={conv.id} 
                className={`conversation-item ${conv.id === activeConversationId ? 'active' : ''}`}
              >
                <div 
                  className="conversation-content"
                  onClick={() => setActiveConversationId(conv.id)}
                >
                  {conv.messages[0]?.text.substring(0, 30)}...
                </div>
                <button
                  className="delete-conversation-btn"
                  onClick={(e) => handleDeleteConversation(conv.id, e)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </aside>

        {/* Main Chat Area */}
        <main className="chat-area">
          <div className="messages-container">
            {conversations
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