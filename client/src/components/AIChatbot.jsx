import { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Bot, User } from 'lucide-react';
import api from '../lib/api';

export default function AIChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hello! I am your TuxPanel AI assistant. How can I help you manage your server today?' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Add user message
    const userMsg = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsTyping(true);

    try {
      // Send the entire conversation history to the backend
      const res = await api.post('/api/ai/chat', { messages: newMessages });
      setMessages(prev => [...prev, { role: 'assistant', content: res.data.reply }]);
    } catch (err) {
      console.error('AI Chat Error:', err);
      setMessages(prev => [
        ...prev, 
        { 
          role: 'assistant', 
          content: err.response?.data?.error || 'Error: Could not reach AI backend.' 
        }
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 p-4 bg-gb-aqua text-gb-bg0 shadow-lg hover:bg-gb-blue transition-all duration-300 z-50 flex items-center justify-center border-2 border-gb-bg3 ${isOpen ? 'scale-0 opacity-0' : 'scale-100 opacity-100'}`}
        aria-label="Open AI Assistant"
      >
        <MessageSquare size={24} />
      </button>

      {/* Chat Window */}
      <div 
        className={`fixed bottom-6 right-6 w-96 h-[500px] max-h-[80vh] bg-gb-bg0 border-2 border-gb-bg3 shadow-2xl flex flex-col transition-all duration-300 origin-bottom-right z-50 overflow-hidden ${isOpen ? 'scale-100 opacity-100' : 'scale-0 opacity-0 pointer-events-none'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gb-bg1 border-b-2 border-gb-bg2">
          <div className="flex items-center gap-2 text-gb-aqua font-bold">
            <Bot size={20} />
            <span>TuxPanel AI</span>
          </div>
          <button 
            onClick={() => setIsOpen(false)}
            className="text-gb-fg4 hover:text-gb-red transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gb-bg0-hard">
          {messages.map((msg, idx) => (
            <div 
              key={idx} 
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div className={`w-8 h-8 flex items-center justify-center shrink-0 border-2 border-gb-bg3 ${msg.role === 'user' ? 'bg-gb-purple text-gb-bg0' : 'bg-gb-aqua text-gb-bg0'}`}>
                {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div 
                className={`max-w-[75%] p-3 text-sm border-2 border-gb-bg3 ${
                  msg.role === 'user' 
                    ? 'bg-gb-bg2 text-gb-fg1' 
                    : 'bg-gb-bg1 text-gb-fg1'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          
          {isTyping && (
            <div className="flex gap-3">
              <div className="w-8 h-8 bg-gb-aqua text-gb-bg0 flex items-center justify-center shrink-0 border-2 border-gb-bg3">
                <Bot size={16} />
              </div>
              <div className="bg-gb-bg1 border-2 border-gb-bg3 p-3 flex gap-1 items-center">
                <div className="w-2 h-2 bg-gb-fg4 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-gb-fg4 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-gb-fg4 animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <form onSubmit={handleSubmit} className="p-3 bg-gb-bg1 border-t-2 border-gb-bg2 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask me anything..."
            className="flex-1 bg-gb-bg0 border-2 border-gb-bg3 px-3 py-2 text-sm text-gb-fg1 focus:outline-none focus:border-gb-aqua transition-colors"
          />
          <button 
            type="submit"
            disabled={!input.trim() || isTyping}
            className="bg-gb-aqua text-gb-bg0 p-2 border-2 border-gb-bg3 hover:bg-gb-blue disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </>
  );
}
