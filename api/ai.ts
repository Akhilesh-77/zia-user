
import { GoogleGenAI } from "@google/genai";

/**
 * 🛡️ SERVER-SIDE AI PROXY GATEWAY (FAST-PATH)
 */

export const config = {
  runtime: 'nodejs',
};

const REQUEST_TIMEOUT = 20000; // 20 Seconds Hard Limit

async function fetchWithTimeout(url: string, options: any, timeout: number) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

export default async function handler(req: Request) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  try {
    const { provider, modelId, history, systemInstruction } = await req.json();

    // 1. FAST-PATH: Immediate key resolution
    const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY;
    const GROQ_KEY = process.env.GROQ_API_KEY;

    // 2. PROVIDER ROUTING (LAZY & ISOLATED)
    if (provider === 'gemini') {
      if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY_MISSING');
      
      const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
      const contents = history.map((m: any) => ({
        role: m.sender === 'user' ? 'user' : 'model',
        parts: [{ text: m.text || " " }]
      }));

      // Gemini SDK doesn't have a direct timeout, so we wrap the promise
      const response = await Promise.race([
        ai.models.generateContent({
          model: modelId.startsWith('gemini-') ? modelId : 'gemini-3-flash-preview',
          contents,
          config: { systemInstruction, temperature: 0.9 }
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), REQUEST_TIMEOUT))
      ]) as any;

      return new Response(JSON.stringify({ text: response.text || "(Silence...)" }), { 
        status: 200, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    if (provider === 'groq') {
      if (!GROQ_KEY) throw new Error('GROQ_API_KEY_MISSING');

      const response = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
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
      }, REQUEST_TIMEOUT);

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await response.text();
        return new Response(JSON.stringify({ error: `Provider error: ${text.slice(0, 100)}` }), { status: response.status });
      }

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || 'Groq API error');

      return new Response(JSON.stringify({ text: data.choices?.[0]?.message?.content || "(Silence...)" }), { 
        status: 200, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    return new Response(JSON.stringify({ error: 'Unsupported provider' }), { status: 400 });

  } catch (err: any) {
    let message = "An unexpected error occurred.";
    let status = 500;

    if (err.name === 'AbortError' || err.message === 'TIMEOUT') {
      message = "Request timed out (20s). Try again.";
      status = 408;
    } else if (err.message === 'GEMINI_API_KEY_MISSING' || err.message === 'GROQ_API_KEY_MISSING') {
      message = "API key missing on server.";
      status = 401;
    } else {
      message = err.message || "Provider communication failed.";
    }

    return new Response(JSON.stringify({ error: message }), { 
      status, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
}
