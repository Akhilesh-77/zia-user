
import { GoogleGenAI } from "@google/genai";

/**
 * 🛡️ SERVER-SIDE AI PROXY GATEWAY
 * This file runs in the server runtime (Vercel).
 * It is the ONLY place where API keys are accessed.
 */

export const config = {
  runtime: 'nodejs',
};

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { provider, modelId, history, systemInstruction } = body;

    // 1. Server-Only Environment Access
    const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY;
    const GROQ_KEY = process.env.GROQ_API_KEY;

    // 2. Provider Routing & Execution
    if (provider === 'gemini') {
      if (!GEMINI_KEY) {
        return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not configured on server.', type: 'MISSING_KEY' }), { status: 401 });
      }

      const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
      const contents = history.map((m: any) => ({
        role: m.sender === 'user' ? 'user' : 'model',
        parts: [{ text: m.text || " " }]
      }));

      const response = await ai.models.generateContent({
        model: modelId.startsWith('gemini-') ? modelId : 'gemini-3-flash-preview',
        contents,
        config: { systemInstruction, temperature: 0.9 }
      });

      return new Response(JSON.stringify({ text: response.text || "(Silence...)" }), { status: 200 });
    }

    if (provider === 'groq') {
      if (!GROQ_KEY) {
        return new Response(JSON.stringify({ error: 'GROQ_API_KEY not configured on server.', type: 'MISSING_KEY' }), { status: 401 });
      }

      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${GROQ_KEY}`
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: "system", content: systemInstruction },
            ...history.map((m: any) => ({
              role: m.sender === 'user' ? 'user' : 'assistant',
              content: m.text || " "
            }))
          ],
          temperature: 0.9
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        return new Response(JSON.stringify({ 
            error: errData?.error?.message || response.statusText,
            status: response.status 
        }), { status: response.status });
      }

      const data = await response.json();
      return new Response(JSON.stringify({ text: data.choices?.[0]?.message?.content || "(Silence...)" }), { status: 200 });
    }

    return new Response(JSON.stringify({ error: 'Unsupported provider' }), { status: 400 });

  } catch (err: any) {
    // 5. Full Error Handling at Server Level
    console.error("Server Proxy Error:", err);
    return new Response(JSON.stringify({ 
      error: err.message || 'Internal Server Error during AI processing.',
      type: 'SERVER_CRASH'
    }), { status: 500 });
  }
}
