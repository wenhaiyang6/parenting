import React, { useState } from 'react';
import './App.css';
import { getApiUrl } from './config/api';

function App() {
  const [question, setQuestion] = useState('');
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (question.trim()) {
      setLoading(true);
      
      // Create new question object
      const newQuestion = {
        id: Date.now(),
        text: question,
        answer: '',
        timestamp: new Date().toLocaleString()
      };
      
      // Add question to list
      setQuestions(prev => [...prev, newQuestion]);
      setQuestion('');

      try {
        const response = await fetch(getApiUrl('/api/ask/stream'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ question: question }),
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
                setQuestions(prev => 
                  prev.map(q => 
                    q.id === newQuestion.id 
                      ? { ...q, answer: currentAnswer } 
                      : q
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
      
      <main>
        <form onSubmit={handleSubmit}>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask your parenting question here..."
            rows="4"
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Getting Answer...' : 'Ask Question'}
          </button>
        </form>

        <div className="questions-list">
          {questions.map(q => (
            <div key={q.id} className="question-card">
              <h3>{q.text}</h3>
              {q.answer && (
                <div className="answer">
                  <h4>Answer:</h4>
                  <p>{q.answer}</p>
                </div>
              )}
              <p className="timestamp">{q.timestamp}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export default App; 