
import { GoogleGenAI } from "@google/genai";

/**
 * 🛡️ SERVER-SIDE AI PROXY GATEWAY
 * This file runs in the server runtime (Vercel).
 * It is the ONLY place where API keys are accessed.
 */

export const config = {
  runtime: 'nodejs',
};

/**
 * Helper to fetch with timeout and single retry logic
 */
async function safeFetch(url: string, options: any, timeoutMs: number = 25000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (err: any) {
    clearTimeout(id);
    throw err;
  }
}

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

      const fetchOptions = {
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
      };

      let response;
      let attempts = 0;
      const maxAttempts = 2; // Initial + 1 Retry

      while (attempts < maxAttempts) {
        attempts++;
        try {
          response = await safeFetch("https://api.groq.com/openai/v1/chat/completions", fetchOptions, 25000);
          
          // Check if it's a transient server error (5xx) to decide on retry
          if (response.status >= 500 && attempts < maxAttempts) {
            continue; 
          }
          break;
        } catch (err: any) {
          if (attempts >= maxAttempts) {
            const isTimeout = err.name === 'AbortError';
            return new Response(JSON.stringify({ 
                error: isTimeout ? 'Request timed out (25s). Groq is taking too long.' : 'Network error connecting to Groq.',
                status: isTimeout ? 408 : 503 
            }), { status: isTimeout ? 408 : 503 });
          }
          // Small delay before retry
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      if (!response) {
         return new Response(JSON.stringify({ error: 'Failed to get response from Groq.' }), { status: 500 });
      }

      const contentType = response.headers.get('content-type') || '';
      
      if (!contentType.includes('application/json')) {
        const textError = await response.text();
        return new Response(JSON.stringify({ 
            error: `Groq returned non-JSON response: ${textError.substring(0, 100)}...`,
            status: response.status 
        }), { status: response.status });
      }

      const data = await response.json().catch(() => null);
      if (!data) {
          return new Response(JSON.stringify({ error: 'Failed to parse Groq JSON response.' }), { status: 500 });
      }

      if (!response.ok) {
        return new Response(JSON.stringify({ 
            error: data?.error?.message || response.statusText,
            status: response.status 
        }), { status: response.status });
      }

      return new Response(JSON.stringify({ text: data.choices?.[0]?.message?.content || "(Silence...)" }), { status: 200 });
    }

    return new Response(JSON.stringify({ error: 'Unsupported provider' }), { status: 400 });

  } catch (err: any) {
    // 5. Full Error Handling at Server Level - NEVER CRASH
    console.error("Server Proxy Critical Failure:", err);
    return new Response(JSON.stringify({ 
      error: err.message || 'Internal Server Error during AI processing.',
      type: 'SERVER_CRASH'
    }), { status: 500 });
  }
}
