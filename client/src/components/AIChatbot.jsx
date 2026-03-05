import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, X, Send, Bot, User, Copy, TerminalSquare, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useTerminal } from '../contexts/TerminalContext';

/* ── Markdown-lite renderer (handles code blocks + inline formatting) ─── */

function MessageContent({ content, onCopyToTerminal }) {
  // Split on fenced code blocks: ```lang\ncode\n```
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2">
      {parts.map((part, i) => {
        const codeMatch = part.match(/^```(\w*)\n?([\s\S]*?)```$/);
        if (codeMatch) {
          const lang = codeMatch[1] || 'bash';
          const code = codeMatch[2].replace(/\n$/, '');
          return <CodeBlock key={i} lang={lang} code={code} onCopyToTerminal={onCopyToTerminal} />;
        }
        // Render inline text (handle bold, italic, inline code, lists)
        return <InlineText key={i} text={part} />;
      })}
    </div>
  );
}

function InlineText({ text }) {
  if (!text.trim()) return null;

  // Split into lines to handle list rendering
  const lines = text.split('\n');

  return (
    <div className="whitespace-pre-wrap">
      {lines.map((line, li) => {
        // Bullet list item
        const bulletMatch = line.match(/^(\s*)[*\-•]\s+(.*)/);
        if (bulletMatch) {
          const indent = Math.floor((bulletMatch[1].length || 0) / 2);
          return (
            <div key={li} className="flex gap-1.5" style={{ paddingLeft: `${indent * 12}px` }}>
              <span className="text-gb-fg4 select-none">•</span>
              <span>{renderInline(bulletMatch[2])}</span>
            </div>
          );
        }

        // Numbered list item
        const numMatch = line.match(/^(\s*)\d+[.)]\s+(.*)/);
        if (numMatch) {
          const indent = Math.floor((numMatch[1].length || 0) / 2);
          const num = line.match(/^(\s*)(\d+)/)[2];
          return (
            <div key={li} className="flex gap-1.5" style={{ paddingLeft: `${indent * 12}px` }}>
              <span className="text-gb-fg4 select-none">{num}.</span>
              <span>{renderInline(numMatch[2])}</span>
            </div>
          );
        }

        // Heading-like lines (### Heading)
        const headingMatch = line.match(/^(#{1,4})\s+(.*)/);
        if (headingMatch) {
          const level = headingMatch[1].length;
          const cls = level === 1 ? 'text-sm font-bold text-gb-fg1' :
                      level === 2 ? 'text-sm font-bold text-gb-fg2' :
                                    'text-xs font-bold text-gb-fg3';
          return <div key={li} className={`${cls} mt-1`}>{renderInline(headingMatch[2])}</div>;
        }

        // Normal line
        if (!line && li < lines.length - 1) return <br key={li} />;
        return <span key={li}>{renderInline(line)}{li < lines.length - 1 ? '\n' : ''}</span>;
      })}
    </div>
  );
}

/** Render inline formatting: bold, italic, inline code */
function renderInline(text) {
  if (!text) return null;
  // Pattern: inline code, bold, italic (order matters — most specific first)
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);

  return tokens.map((seg, i) => {
    // Inline code
    if (seg.startsWith('`') && seg.endsWith('`') && seg.length > 2) {
      return (
        <code key={i} className="bg-gb-bg2 text-gb-orange px-1 py-0.5 text-xs font-mono border border-gb-bg3">
          {seg.slice(1, -1)}
        </code>
      );
    }
    // Bold
    if (seg.startsWith('**') && seg.endsWith('**') && seg.length > 4) {
      return <strong key={i} className="font-bold text-gb-fg1">{seg.slice(2, -2)}</strong>;
    }
    // Italic
    if (seg.startsWith('*') && seg.endsWith('*') && seg.length > 2) {
      return <em key={i} className="italic text-gb-fg3">{seg.slice(1, -1)}</em>;
    }
    return <span key={i}>{seg}</span>;
  });
}

function CodeBlock({ lang, code, onCopyToTerminal }) {
  const [copied, setCopied] = useState(false);
  const [editableCode, setEditableCode] = useState(code);

  const handleCopy = () => {
    navigator.clipboard.writeText(editableCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isShellCode = ['bash', 'sh', 'shell', 'zsh', 'fish', 'console', ''].includes(lang);

  return (
    <div className="my-2 border-2 border-gb-bg3 bg-gb-bg0-hard overflow-hidden">
      {/* Code header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-gb-bg1 border-b-2 border-gb-bg3">
        <span className="text-[10px] font-bold text-gb-fg4 uppercase tracking-wide">{lang || 'code'}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase text-gb-fg4 hover:text-gb-fg1 transition-colors"
            title="Copy to clipboard"
          >
            {copied ? <Check size={10} /> : <Copy size={10} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          {isShellCode && (
            <button
              onClick={() => onCopyToTerminal(editableCode)}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase text-gb-green hover:text-gb-aqua transition-colors"
              title="Send to terminal"
            >
              <TerminalSquare size={10} />
              Terminal
            </button>
          )}
        </div>
      </div>
      {/* Editable code body */}
      <textarea
        value={editableCode}
        onChange={(e) => setEditableCode(e.target.value)}
        spellCheck={false}
        className="w-full p-3 bg-gb-bg0-hard text-xs font-mono text-gb-fg2 leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-gb-aqua/30 min-h-[2.5rem]"
        rows={editableCode.split('\n').length}
      />
    </div>
  );
}

/* ── Resize handle constants ──────────────────────────────────────── */

const MIN_W = 360;
const MIN_H = 350;
const MAX_W = 900;
const MAX_H = 900;

export default function AIChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hello! I am your TuxPanel AI assistant. How can I help you manage your server today?' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const navigate = useNavigate();

  // Terminal context for "copy to terminal"
  const { sessions, activeTabId, createSession, sendInput } = useTerminal();

  // ── Resizable dimensions (anchored bottom-right) ────────────────
  const [size, setSize] = useState({ w: 420, h: 520 });
  const resizing = useRef(null); // { edge, startX, startY, startW, startH }

  const onPointerDown = useCallback((edge) => (e) => {
    e.preventDefault();
    resizing.current = {
      edge,
      startX: e.clientX,
      startY: e.clientY,
      startW: size.w,
      startH: size.h,
    };
    document.body.style.cursor =
      edge === 'top-left' ? 'nwse-resize' :
      edge === 'top'      ? 'ns-resize'   :
      edge === 'left'     ? 'ew-resize'   : '';
    document.body.style.userSelect = 'none';
  }, [size]);

  useEffect(() => {
    function onMove(e) {
      const r = resizing.current;
      if (!r) return;
      const dx = r.startX - e.clientX; // dragging left = bigger
      const dy = r.startY - e.clientY; // dragging up   = bigger

      let newW = r.startW;
      let newH = r.startH;

      if (r.edge === 'left' || r.edge === 'top-left') {
        newW = Math.min(MAX_W, Math.max(MIN_W, r.startW + dx));
      }
      if (r.edge === 'top' || r.edge === 'top-left') {
        newH = Math.min(MAX_H, Math.max(MIN_H, r.startH + dy));
      }

      setSize({ w: newW, h: newH });
    }
    function onUp() {
      resizing.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // ── Copy code to terminal ───────────────────────────────────────
  const handleCopyToTerminal = useCallback((code) => {
    // If there's an active terminal session, send the code to it
    if (activeTabId && sessions.some(s => s.id === activeTabId && s.alive)) {
      sendInput(activeTabId, code + '\n');
      navigate('/terminal');
    } else if (sessions.some(s => s.alive)) {
      // Use the first alive session
      const alive = sessions.find(s => s.alive);
      sendInput(alive.id, code + '\n');
      navigate('/terminal');
    } else {
      // No terminal session exists — create one and send after connect
      const id = createSession('AI Command');
      // Small delay to let socket connect
      setTimeout(() => {
        sendInput(id, code + '\n');
      }, 500);
      navigate('/terminal');
    }
  }, [activeTabId, sessions, sendInput, createSession, navigate]);

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

      {/* Chat Window — anchored bottom-right, resizable from top / left / top-left */}
      <div
        className={`fixed bottom-6 right-6 bg-gb-bg0 border-2 border-gb-bg3 shadow-2xl flex flex-col origin-bottom-right z-50 overflow-hidden transition-transform transition-opacity duration-300 ${isOpen ? 'scale-100 opacity-100' : 'scale-0 opacity-0 pointer-events-none'}`}
        style={{ width: size.w, height: size.h, maxHeight: '90vh' }}
      >
        {/* ── Resize handles ──────────────────────────────────── */}
        {/* Top edge */}
        <div
          onPointerDown={onPointerDown('top')}
          className="absolute top-0 left-3 right-3 h-1.5 cursor-ns-resize z-10 hover:bg-gb-aqua/20"
        />
        {/* Left edge */}
        <div
          onPointerDown={onPointerDown('left')}
          className="absolute top-3 left-0 bottom-3 w-1.5 cursor-ew-resize z-10 hover:bg-gb-aqua/20"
        />
        {/* Top-left corner */}
        <div
          onPointerDown={onPointerDown('top-left')}
          className="absolute top-0 left-0 w-4 h-4 cursor-nwse-resize z-20"
        >
          <div className="absolute top-0.5 left-0.5 w-2 h-2 border-t-2 border-l-2 border-gb-fg4 opacity-40" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gb-bg1 border-b-2 border-gb-bg2 shrink-0">
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
                className={`max-w-[80%] p-3 text-sm border-2 border-gb-bg3 ${
                  msg.role === 'user' 
                    ? 'bg-gb-bg2 text-gb-fg1' 
                    : 'bg-gb-bg1 text-gb-fg1'
                }`}
              >
                <MessageContent content={msg.content} onCopyToTerminal={handleCopyToTerminal} />
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
        <form onSubmit={handleSubmit} className="p-3 bg-gb-bg1 border-t-2 border-gb-bg2 flex gap-2 shrink-0">
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
