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
        // setActiveConversationId(prevId => {
        //   if (data.length > 0 && !prevId) {
        //     return data[0].id;
        //   }
        //   return prevId;
        // });
      } catch (error) {
        console.error('Error fetching conversations:', error);
      }
    };

    fetchConversations();
  }, []); // Now we can safely use empty dependency array

  useEffect(() => {
    const messagesContainer = document.querySelector('.messages-container');
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }, [conversations, activeConversationId]); // Trigger on either change

  const processMarkdownWithCitations = (text, sources) => {
    if (!text || !sources) return text;
    
    // Track citation order and create a map of used citations
    const citationOrder = [];
    const usedCitations = new Set();
    
    // First pass: find all citations in order
    const citationRegex = /\[(\d+)\]/g;
    let match;
    while ((match = citationRegex.exec(text)) !== null) {
      const citationIndex = parseInt(match[1]) - 1;
      if (citationIndex >= 0 && citationIndex < sources.length) {
        usedCitations.add(citationIndex);
        if (!citationOrder.includes(citationIndex)) {
          citationOrder.push(citationIndex);
        }
      }
    }

    // Reorder sources: cited ones first (in order of appearance), then uncited ones
    const reorderedSources = [
      ...citationOrder.map(index => ({ ...sources[index], isCited: true })),
      ...sources
        .map((source, index) => ({ ...source, isCited: false, originalIndex: index }))
        .filter((_, index) => !usedCitations.has(index))
    ];

    // Replace old citation numbers with new ones
    let processedText = text;
    const citationMap = new Map();
    citationOrder.forEach((oldIndex, newIndex) => {
      citationMap.set(oldIndex, newIndex);
    });

    // Replace citations in text with new numbers
    processedText = processedText.replace(/\[(\d+)\]/g, (match, oldNum) => {
      const oldIndex = parseInt(oldNum) - 1;
      const newIndex = citationMap.get(oldIndex);
      return `[${newIndex + 1}]`;
    });

    // Update links
    reorderedSources.forEach((source, index) => {
      const citation = `${index + 1}`;
      const link = `[${citation}](${source.link})`;
      processedText = processedText.replace(new RegExp(`\\[${citation}\\]`, 'g'), link);
    });

    return { processedText, reorderedSources };
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

  const getFaviconUrl = (sourceUrl) => {
    try {
      const url = new URL(sourceUrl);
      return `https://www.google.com/s2/favicons?domain=${url.hostname}`;
    } catch (e) {
      return null;
    }
  };

  return (
    <div className="App">
      <aside className="sidebar">
        <h1>BabyWise</h1>
        <button 
          className="new-conversation-btn" 
          onClick={() => {
            setActiveConversationId(null);
            setQuestion('');
            setTimeout(() => {
              textareaRef.current?.focus();
            }, 0);
          }}
        >
          +
        </button>
        
        <div className="conversations-list">
          {conversations.map(conv => (
            <div 
              key={conv.id} 
              className={`conversation-item ${conv.id === activeConversationId ? 'active' : ''}`}
            >
              <div 
                className="conversation-content"
                onClick={() => {
                  setActiveConversationId(conv.id);
                  setQuestion('');
                  setTimeout(() => {
                    textareaRef.current?.focus();
                  }, 0);
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
      
      <main className="chat-area">
        {activeConversationId ? (
          // Regular chat interface
          <>
            <div className="messages-container">
              {conversations
                .find(conv => conv.id === activeConversationId)
                ?.messages.map(msg => (
                  <div key={msg.id} className="message-wrapper">
                    <div className="user-message">
                      <p>{msg.text}</p>
                    </div>
                    {msg.answer && (
                      <div className="assistant-message">
                        {msg.sources && msg.sources.length > 0 && (
                          <div className="sources-section">
                            {/* Get processed sources */}
                            {(() => {
                              const processed = processMarkdownWithCitations(msg.answer, msg.sources);
                              const reorderedSources = processed?.reorderedSources || msg.sources;
                              
                              return (
                                <>
                                  {/* Cited Sources - Always visible */}
                                  {reorderedSources.filter(s => s.isCited).length > 0 && (
                                    <>
                                      <h5>Sources</h5>
                                      <ol>
                                        {reorderedSources
                                          .filter(source => source.isCited)
                                          .map((source, index) => (
                                            <li key={index}>
                                              <img 
                                                src={getFaviconUrl(source.link)} 
                                                alt=""
                                                className="source-favicon"
                                                onError={(e) => {
                                                  e.target.style.display = 'none';
                                                }}
                                              />
                                              <a href={source.link} target="_blank" rel="noopener noreferrer">
                                                {source.title}
                                                {source.date && ` (${source.date})`}
                                              </a>
                                            </li>
                                          ))}
                                      </ol>
                                    </>
                                  )}
                                  
                                  {/* Other Sources - Collapsible */}
                                  {reorderedSources.filter(s => !s.isCited).length > 0 && (
                                    <>
                                      <div 
                                        className="other-sources-header"
                                        onClick={() => setExpandedSources(prev => ({
                                          ...prev,
                                          [msg.id]: !prev[msg.id]
                                        }))}
                                      >
                                        
                                        <h5>View {reorderedSources.filter(s => !s.isCited).length} more</h5>
                                        <button 
                                          className={`sources-toggle ${expandedSources[msg.id] ? 'expanded' : ''}`}
                                        >
                                          ▶
                                        </button>
                                      </div>
                                      {expandedSources[msg.id] && (
                                        <ol>
                                          {reorderedSources
                                            .filter(source => !source.isCited)
                                            .map((source, index) => (
                                              <li key={index}>
                                                <img 
                                                  src={getFaviconUrl(source.link)} 
                                                  alt=""
                                                  className="source-favicon"
                                                  onError={(e) => {
                                                    e.target.style.display = 'none';
                                                  }}
                                                />
                                                <a href={source.link} target="_blank" rel="noopener noreferrer">
                                                  {source.title}
                                                  {source.date && ` (${source.date})`}
                                                </a>
                                              </li>
                                            ))}
                                        </ol>
                                      )}
                                    </>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        )}
                        <div className="markdown-content">
                          <ReactMarkdown components={markdownComponents}>
                            {processMarkdownWithCitations(msg.answer, msg.sources)?.processedText || msg.answer}
                          </ReactMarkdown>
                        </div>
                        <small>{msg.timestamp}</small>
                      </div>
                    )}
                  </div>
                ))}
            </div>

            <form className={`input-form ${activeConversationId ? 'in-chat' : ''}`} onSubmit={handleSubmit}>
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
                placeholder="Message BabyWise... (Press Enter to submit, Shift+Enter for new line)"
                rows="3"
              />
            </form>
          </>
        ) : (
          // Google-like centered layout
          <div className="empty-chat-container">
            <h2>What's on your mind?</h2>
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
                placeholder="Message BabyWise..."
                rows="3"
              />
            </form>
            <div className="empty-chat-hint">
              Press Enter to submit, Shift+Enter for new line
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App; 