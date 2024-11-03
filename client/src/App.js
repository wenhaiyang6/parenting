import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import './App.css';
import { getApiUrl } from './config/api';
import { generateUserId } from './utils/deviceId';

function App() {
  const [question, setQuestion] = useState('');
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [expandedSources, setExpandedSources] = useState({});

  const markdownComponents = {
    a: ({node, ...props}) => (
      <a target="_blank" rel="noopener noreferrer" {...props} />
    )
  };

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

  useEffect(() => {
    // Scroll to bottom whenever conversations change
    const messagesContainer = document.querySelector('.messages-container');
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }, [conversations]);

  const processMarkdownWithCitations = (text, sources) => {
    if (!text || !sources) return text;
    
    // Replace citation numbers with links
    let processedText = text;
    sources.forEach((source, index) => {
      const citation = `[${index + 1}]`;
      const link = `[${citation}](${source.link})`;
      processedText = processedText.replace(citation, link);
    });
    
    return processedText;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (question.trim()) {
      
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
        let sources = [];

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
                sources = parsed.sources || sources;

                // Update the answer in real-time
                setConversations(prev => {
                  // Create a local copy of sources to avoid closure issues
                  const currentSources = [...sources];
                  return prev.map(conv => 
                    conv.id === currentConversationId 
                      ? {
                          ...conv,
                          messages: conv.messages.map(msg =>
                            msg.id === newMessage.id
                              ? { 
                                  ...msg, 
                                  answer: currentAnswer,
                                  sources: currentSources // Use the local copy
                                }
                              : msg
                          )
                        }
                      : conv
                  );
                });
              } catch (e) {
                console.error('Error parsing JSON:', e);
              }
            }
          }
        }

      } catch (error) {
        console.error('Error:', error);
      }
    }
  };

  const handleDeleteConversation = async (convId, e) => {
    e.stopPropagation(); // Prevent conversation selection when clicking delete
    
    // Prompt for confirmation
    if (!window.confirm('Are you sure you want to delete this conversation?')) {
      return;
    }
    
    try {
      const userId = await generateUserId();
      const response = await fetch(getApiUrl(`/api/ask/conversations/${convId}`), {
        method: 'DELETE',
        headers: {
          'X-User-ID': userId
        }
      });

      if (response.ok) {
        setConversations(prev => prev.filter(conv => conv.id !== convId));
        if (activeConversationId === convId) {
          setActiveConversationId(null);
        }
      } else {
        alert('Failed to delete conversation. Please try again.');
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
      alert('An error occurred while deleting the conversation.');
    }
  };

  // Add a ref for the textarea
  const textareaRef = useRef(null);

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
              textareaRef.current?.focus();
            }}
          >
            +
          </button>
          
          <div className="conversations-list">
            {conversations.slice().reverse().map(conv => (
              <div 
                key={conv.id} 
                className={`conversation-item ${conv.id === activeConversationId ? 'active' : ''}`}
              >
                <div 
                  className="conversation-content"
                  onClick={() => {
                    setActiveConversationId(conv.id);
                    setQuestion('');
                  }}
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
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="sources-section">
                          <div 
                            className="sources-header"
                            onClick={() => setExpandedSources(prev => ({
                              ...prev,
                              [msg.id]: !prev[msg.id]
                            }))}
                          >
                            <button 
                              className={`sources-toggle ${expandedSources[msg.id] ? 'expanded' : ''}`}
                            >
                              ▶
                            </button>
                            <h4>Sources ({msg.sources.length})</h4>
                          </div>
                          {expandedSources[msg.id] && (
                            <ul>
                              {msg.sources.map((source, index) => (
                                <li key={index}>
                                  <a href={source.link} target="_blank" rel="noopener noreferrer">
                                    {source.title}
                                    {source.date && ` (${source.date})`}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                      <div className="markdown-content">
                        <ReactMarkdown components={markdownComponents}>
                          {processMarkdownWithCitations(msg.answer, msg.sources)}
                        </ReactMarkdown>
                      </div>
                      <small>{msg.timestamp}</small>
                    </div>
                  )}
                </div>
              ))}
          </div>

          <form className="input-form" onSubmit={handleSubmit}>
            <textarea
              ref={textareaRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="Ask your parenting question here... (Press Enter to submit, Shift+Enter for new line)"
              rows="3"
            />
          </form>
        </main>
      </div>
    </div>
  );
}

export default App; 