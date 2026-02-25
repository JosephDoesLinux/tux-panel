import { Router, Request, Response, NextFunction } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import logger from '../utils/logger';

const router = Router();

// Initialize the Gemini client if the API key is present
const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

const SYSTEM_INSTRUCTION = `You are TuxPanel AI, an expert Linux system administration assistant integrated into a web-based dashboard called TuxPanel.
Your job is to help the user manage their Linux server, troubleshoot issues, write bash scripts, explain systemd services, and manage Docker containers.
Keep your answers concise, accurate, and formatted in Markdown. If the user asks for a command, provide the exact command.
Assume the user is running a modern Linux distribution (like Fedora or Ubuntu).`;

// ── POST /api/ai/chat ────────────────────────────────────────────────
router.post('/chat', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!genAI) {
      return res.status(503).json({ error: 'AI is not configured on this server. Please add GEMINI_API_KEY to your .env file.' });
    }

    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required.' });
    }

    // Convert messages to Gemini format
    // Gemini requires the first message in history to be from the 'user'
    // If the first message is from the assistant (e.g. our greeting), we skip it
    const history = messages
      .filter((msg: any, index: number) => !(index === 0 && msg.role === 'assistant'))
      .map((msg: any) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));

    // Extract the latest message to send
    const latestMessage = history.pop();

    if (!latestMessage) {
      return res.status(400).json({ error: 'No message to send.' });
    }

    // Use the recommended model for general text tasks
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
      systemInstruction: SYSTEM_INSTRUCTION 
    });

    const chat = model.startChat({
      history: history,
    });

    const result = await chat.sendMessage(latestMessage.parts[0].text);
    const responseText = result.response.text();

    res.json({ reply: responseText });
  } catch (err: any) {
    logger.error(`AI Chat Error: ${err.message}`);
    next(err);
  }
});

export default router;
