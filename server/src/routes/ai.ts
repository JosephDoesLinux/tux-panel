import { Router, Request, Response, NextFunction } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import { run } from '../utils/commandRunner';
import logger from '../utils/logger';

const router = Router();

// Initialize the Gemini client if the API key is present
const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

// ── Gather a concise system snapshot (cached for 5 minutes) ──────────
let cachedSysInfo: string | null = null;
let cacheExpiry = 0;

async function getSystemSnapshot(): Promise<string> {
  if (cachedSysInfo && Date.now() < cacheExpiry) return cachedSysInfo;

  const results = await Promise.allSettled([
    run('hostnamectl'),
    run('uname'),
    run('lscpu'),
    run('free'),
    run('df'),
    run('lsblk'),
    run('ipAddr'),
    run('failedUnits'),
  ]);

  const lines: string[] = ['=== SYSTEM INFORMATION ==='];

  const labels = ['Hostnamectl', 'Kernel', 'CPU', 'Memory', 'Disk Usage', 'Block Devices', 'Network', 'Failed Units'];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value.stdout.trim()) {
      lines.push(`\n--- ${labels[i]} ---\n${r.value.stdout.trim()}`);
    }
  });

  // Also read /etc/os-release if available
  try {
    const osRel = fs.readFileSync('/etc/os-release', 'utf8').trim();
    lines.push(`\n--- OS Release ---\n${osRel}`);
  } catch { /* not available */ }

  lines.push('\n=== END SYSTEM INFORMATION ===');
  cachedSysInfo = lines.join('\n');
  cacheExpiry = Date.now() + 5 * 60 * 1000;
  return cachedSysInfo;
}

const SYSTEM_INSTRUCTION = `You are TuxPanel AI, an expert Linux system administration assistant integrated into a web-based dashboard called TuxPanel.
Your job is to help the user manage their Linux server, troubleshoot issues, write bash scripts, explain systemd services, and manage Docker containers.

FORMATTING RULES — follow these strictly:
• Use fenced code blocks (\`\`\`bash … \`\`\`) ONLY for actual commands, scripts, config snippets, or terminal output the user would copy/paste.
• Never wrap explanatory text, headings, or emphasis inside code fences.
• Use inline \`backticks\` only for file paths, flags, package names, or short identifiers (e.g. \`/etc/fstab\`, \`--no-pager\`, \`systemctl\`).
• For emphasis use **bold** or *italic* in normal prose — never use them inside code blocks.
• Use Markdown bullet lists (- item) or numbered lists (1. item) for step-by-step instructions.
• Keep answers concise and well-structured. Prefer short paragraphs over walls of text.
• If the user asks for a command, give the exact command in a fenced code block.

You may receive system information about the user's server at the start of the conversation. Use it to tailor your answers (e.g. correct package manager, init system, kernel version, available memory).
Assume a modern Linux distribution unless the system info says otherwise.`;

// ── POST /api/ai/chat ────────────────────────────────────────────────
router.post('/chat', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { messages, prefs } = req.body;
    
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required.' });
    }

    const isCustomProxy = prefs?.useCustomProxy === true;
    if (!isCustomProxy && !genAI) {
      return res.status(503).json({ error: 'Google Gemini AI is not configured on this server. Please add GEMINI_API_KEY to your .env file or use a Custom API Proxy.' });
    }

    // Convert messages for context filtering
    const filtered = messages
      .filter((msg: any, index: number) => !(index === 0 && msg.role === 'assistant'));

    const isFirstExchange = filtered.length === 1 && filtered[0].role === 'user';
    if (isFirstExchange) {
      try {
        const snapshot = await getSystemSnapshot();
        filtered[0] = {
          ...filtered[0],
          content: `[The following is automatic system context — do not repeat it back, just use it to inform your answers.]\n${snapshot}\n\n[User message follows]\n${filtered[0].content}`,
        };
      } catch (e: any) {
        logger.warn(`Failed to gather system info for AI context: ${e.message}`);
      }
    }

    const finalSystemPrompt = prefs?.systemPrompt?.trim() || SYSTEM_INSTRUCTION;
    const temperature = parseFloat(prefs?.temperature ?? 0.7);
    const topP = parseFloat(prefs?.topP ?? 0.95);

    // ── Handle Custom Proxy (OpenAI Format) ──
    if (isCustomProxy) {
      const { proxyUrl, proxyModel, proxyApiKey } = prefs || {};
      if (!proxyUrl || !proxyModel) {
        return res.status(400).json({ error: 'Base URL and Model Name are required for custom proxy.' });
      }

      const proxyMessages = [
        { role: 'system', content: finalSystemPrompt },
        ...filtered.map((msg: any) => ({ role: msg.role, content: msg.content }))
      ];

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (proxyApiKey) {
        headers['Authorization'] = `Bearer ${proxyApiKey}`;
      }

      let endpoint = proxyUrl.trim();
      if (!endpoint.endsWith('/chat/completions')) {
        endpoint = endpoint.replace(/\/+$/, '') + '/chat/completions';
      }

      const proxyRes = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: proxyModel,
          messages: proxyMessages,
          temperature,
          top_p: topP
        })
      });

      if (!proxyRes.ok) {
        const errText = await proxyRes.text();
        throw new Error(`Proxy error: ${proxyRes.status} - ${errText}`);
      }
      
      const data = await proxyRes.json();
      const reply = data.choices?.[0]?.message?.content || 'No response from proxy.';
      return res.json({ reply });
    }

    // ── Handle Default Google Gemini ──
    const history = filtered.map((msg: any) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const latestMessage = history.pop();
    if (!latestMessage) {
      return res.status(400).json({ error: 'No message to send.' });
    }

    const modelChoice = prefs?.model || 'gemini-2.5-flash';
    const model = genAI!.getGenerativeModel({ 
      model: modelChoice,
      systemInstruction: finalSystemPrompt 
    });

    const chat = model.startChat({
      history: history,
      generationConfig: {
        temperature,
        topP
      }
    });

    const result = await chat.sendMessage(latestMessage.parts[0].text);
    const responseText = result.response.text();

    res.json({ reply: responseText });
  } catch (err: any) {
    logger.error(`AI Chat Error: ${err.message}`);
    
    // Add specific proxy fallback info if needed
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
       next(new Error('Failed to connect to proxy URL. Check if the URL is valid and the server is running.'));
       return;
    }
    next(err);
  }
});

export default router;
