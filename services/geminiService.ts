// -----------------------------------------------------------
// ZIA – MULTI-MODEL AI ENGINE (Gemini + DeepSeek + OpenRouter)
// Version B (Spicy personality kept, explicit words removed)
// -----------------------------------------------------------

import { GoogleGenAI, Content, Part, Modality } from "@google/genai";
import { ChatMessage, AIModelOption, BotProfile } from "../types";
import { xyz } from "./xyz";

// -----------------------------------------------------------
// API KEYS (Hidden inside environment by Gemini request)
// -----------------------------------------------------------

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;

// -----------------------------------------------------------
// Helper: File → Generative Part
// -----------------------------------------------------------

const fileToGenerativePart = (base64Data: string, mimeType: string): Part => ({
  inlineData: {
    data: base64Data.split(",")[1],
    mimeType
  }
});

// -----------------------------------------------------------
// Retry Logic
// -----------------------------------------------------------

const RETRY_LIMIT = 3;
const RETRY_DELAYS = [1200, 2000, 3000];

async function retry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: any;

  for (let i = 0; i < RETRY_LIMIT; i++) {
    try {
      const res = await fn();
      if (typeof res === "string" && res.trim()) return res;
      if (typeof res !== "string" && res) return res;
      lastError = new Error("Empty response");
    } catch (e: any) {
      lastError = e;
    }
    await new Promise(r => setTimeout(r, RETRY_DELAYS[i]));
  }

  throw lastError;
}

// -----------------------------------------------------------
// OpenRouter MODEL MAP
// -----------------------------------------------------------

const OPENROUTER_MODELS: Record<string, string> = {
  "venice-dolphin-mistral-24b":
    "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
  "mistralai-devstral-2512": "mistralai/devstral-2512:free",
  "deepseek-chimera-r1":
    "tngtech/deepseek-r1t2-chimera:free"
};

// -----------------------------------------------------------
// OpenRouter Text Generation
// -----------------------------------------------------------

async function callOpenRouter(
  selectedAI: string,
  systemPrompt: string,
  history: ChatMessage[]
): Promise<string> {

  const model = OPENROUTER_MODELS[selectedAI];
  if (!model) throw new Error("(System: Invalid model ID)");

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.map(m => ({
      role: m.sender === "user" ? "user" : "assistant",
      content: m.text
    }))
  ];

  if (messages.length === 1) {
    messages.push({ role: "user", content: "Hello." });
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://zia.ai",
        "X-Title": "Zia.ai"
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.9,
        max_tokens: 4000,
        top_p: 0.95
      })
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403)
        throw new Error("(System: Invalid API Key)");
      if (response.status === 429)
        throw new Error("(System: Provider busy. Try again)");
      throw new Error("(System: Provider error)");
    }

    const data = await response.json();
    return data?.choices?.[0]?.message?.content?.trim() || "(System: empty response)";
  } catch (err: any) {
    throw new Error(err?.message || "(System: Provider issue)");
  }
}

// -----------------------------------------------------------
// DeepSeek DIRECT API
// -----------------------------------------------------------

async function callDeepSeek(
  systemPrompt: string,
  history: ChatMessage[]
): Promise<string> {

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.map(m => ({
      role: m.sender === "user" ? "user" : "assistant",
      content: m.text
    }))
  ];

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DEEPSEEK_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages,
        temperature: 0.9
      })
    });

    if (!response.ok) {
      if (response.status === 401)
        throw new Error("(System: Invalid DeepSeek Key)");
      if (response.status === 429)
        throw new Error("(System: DeepSeek busy)");
      throw new Error("(System: DeepSeek error)");
    }

    const data = await response.json();
    return data?.choices?.[0]?.message?.content?.trim() || "(System: empty response)";
  } catch (err: any) {
    throw new Error(err?.message || "(System: DeepSeek issue)");
  }
}

// -----------------------------------------------------------
// Gemini Text Generation
// -----------------------------------------------------------

async function callGeminiText(
  systemPrompt: string,
  history: ChatMessage[],
  model: string
): Promise<string> {
  const contents: Content[] = history.map(m => ({
    role: m.sender === "user" ? "user" : "model",
    parts: [{ text: m.text }]
  }));

  if (!contents.length) {
    contents.push({
      role: "user",
      parts: [{ text: "Hello." }]
    });
  }

  const fullInstruction = `
${systemPrompt}

[SPICE-MODE ENABLED]
Respond with emotional depth, natural tone, playful warmth, romantic tension when needed.
Maintain chatbot personality strictly.
Avoid any explicit content.
`;

  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction: fullInstruction,
      temperature: 1.0,
      maxOutputTokens: 8192
    }
  });

  return response.text.trim();
}

// -----------------------------------------------------------
// TEXT ROUTER
// -----------------------------------------------------------

async function generateText(
  systemPrompt: string,
  history: ChatMessage[],
  selectedAI: AIModelOption
): Promise<string> {
  try {
    // OpenRouter
    if (
      selectedAI === "venice-dolphin-mistral-24b" ||
      selectedAI === "mistralai-devstral-2512" ||
      selectedAI === "deepseek-chimera-r1"
    ) {
      return await callOpenRouter(selectedAI, systemPrompt, history);
    }

    // DeepSeek
    if (selectedAI === "deepseek-chat") {
      return await callDeepSeek(systemPrompt, history);
    }

    // Gemini
    return await retry(() => callGeminiText(systemPrompt, history, selectedAI));

  } catch (err: any) {
    return err.message || "(System error)";
  }
}

// -----------------------------------------------------------
// PUBLIC EXPORTS
// -----------------------------------------------------------

export const generateBotResponse = async (
  history: ChatMessage[],
  botProfile: Pick<BotProfile, "personality" | "isSpicy" | "conversationMode" | "gender">,
  selectedAI: AIModelOption
): Promise<string> => {
  try {
    const mode = botProfile.conversationMode || (botProfile.isSpicy ? "spicy" : "normal");
    const gender = botProfile.gender || "female";

    const enhanced = xyz(
      history,
      history[history.length - 1]?.text || "",
      botProfile.personality,
      mode,
      gender
    );

    return await generateText(enhanced, history, selectedAI);
  } catch {
    return "(System: temporarily busy)";
  }
};
