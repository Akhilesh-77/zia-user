
import { GoogleGenAI, Content, Part, Modality } from "@google/genai";
import { ChatMessage, AIModelOption, BotProfile } from "../types";
import { xyz } from "./xyz";
import { processLocalResponse } from "./localBrain";

// ------------------------------------------------------------------
// 🔑 AUTHENTICATION SETUP (ENV VARIABLES)
// ------------------------------------------------------------------

const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;

// Gemini API Instance - Safe Initialization
const getGeminiClient = () => {
  const key = process.env.API_KEY || process.env.GEMINI_API_KEY || "missing-key";
  return new GoogleGenAI({ apiKey: key });
};

// ------------------------------------------------------------------
// 🛠️ ERROR HANDLING & RECOVERY
// ------------------------------------------------------------------

/**
 * Maps technical API/Network errors to user-friendly system messages.
 * Prevents app crashes by returning a safe string.
 */
const mapErrorToMessage = (error: any): string => {
    const msg = String(error?.message || error || "").toLowerCase();
    console.error("Zia.ai System Error:", error);

    // Auth & Keys
    if (msg.includes("api key missing") || msg.includes("invalid_key") || msg.includes("401") || msg.includes("missing-key") || msg.includes("unauthorized")) {
        return "(System: Service configuration issue. Please check API settings.)";
    }
    // Limits
    if (msg.includes("429") || msg.includes("quota") || msg.includes("rate limit") || msg.includes("limit reached") || msg.includes("exhausted")) {
        return "(System: Daily limit reached. Try again later or switch AI model.)";
    }
    // Server Issues
    if (msg.includes("500") || msg.includes("503") || msg.includes("504") || msg.includes("overloaded") || msg.includes("busy") || msg.includes("deadline")) {
        return "(System: System is busy right now. Please try again in a few seconds.)";
    }
    // Connectivity
    if (msg.includes("network") || msg.includes("fetch") || msg.includes("failed to fetch") || msg.includes("offline") || msg.includes("connection")) {
        return "(System: Connection issue detected. Check your network and try again.)";
    }
    // Content/Parsing
    if (msg.includes("empty response") || msg.includes("undefined") || msg.includes("null") || msg.includes("unexpected token") || msg.includes("parse")) {
        return "(System: Something went wrong with the response. Please resend your message.)";
    }
    // Safety Filters
    if (msg.includes("safety") || msg.includes("blocked") || msg.includes("candidate")) {
        return "(System: Message blocked by safety filters. Try rephrasing.)";
    }
    
    return "(System: Something went wrong. Please resend your message.)";
};

const fileToGenerativePart = (base64Data: string, mimeType: string): Part => {
  try {
      if (!base64Data) return { inlineData: { data: "", mimeType: "image/jpeg" } };
      return {
        inlineData: {
          data: base64Data.includes(',') ? base64Data.split(',')[1] : base64Data,
          mimeType
        },
      };
  } catch (e) {
      return { inlineData: { data: "", mimeType: "image/jpeg" } };
  }
};

const RETRY_DELAYS = [1000, 2000];

async function retry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: any;
  for (let i = 0; i < RETRY_DELAYS.length; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const msg = String(error?.message || "").toLowerCase();
      // Don't retry on auth or user-missing errors
      if (msg.includes("missing") || msg.includes("401") || msg.includes("invalid") || msg.includes("unauthorized")) throw error;
      if (i < RETRY_DELAYS.length - 1) {
          await new Promise(res => setTimeout(res, RETRY_DELAYS[i]));
      }
    }
  }
  throw lastError;
}

// ------------------------------------------------------------------
// 🟣 DEEPSEEK LOGIC (Direct)
// ------------------------------------------------------------------

const callDeepSeek = async (
  systemPrompt: string,
  history: ChatMessage[]
): Promise<string> => {
  if (!DEEPSEEK_KEY) throw new Error("api key missing");

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-10).map(msg => ({ 
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.text || ""
    }))
  ];

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${DEEPSEEK_KEY}`
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages,
      temperature: 1.0,
      max_tokens: 2048
    })
  });

  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
};

// ------------------------------------------------------------------
// 🌐 OPENROUTER LOGIC
// ------------------------------------------------------------------

const OPENROUTER_MODELS: Record<string, string> = {
    'venice-dolphin-mistral-24b': 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free',
    'mistralai-devstral-2512': 'mistralai/devstral-2512:free',
    'deepseek-r1-free': 'tngtech/deepseek-r1t2-chimera:free'
};

const callOpenRouter = async (
  modelId: string,
  systemPrompt: string,
  history: ChatMessage[]
): Promise<string> => {
  if (!OPENROUTER_KEY) throw new Error("api key missing");
  const model = OPENROUTER_MODELS[modelId];
  if (!model) throw new Error("model not found");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://zia.ai",
      "X-Title": "Zia.ai"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...history.slice(-10).map(msg => ({ role: msg.sender === 'user' ? 'user' : 'assistant', content: msg.text || "" }))
      ],
      temperature: 0.9
    })
  });

  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
};

// ------------------------------------------------------------------
// ✨ GEMINI CORE LOGIC
// ------------------------------------------------------------------

const callGeminiText = async (
  systemPrompt: string,
  history: ChatMessage[],
  model: string
): Promise<string> => {
  const ai = getGeminiClient();
  
  const contents: Content[] = history.slice(-15).map(msg => ({
    role: msg.sender === "user" ? "user" : "model",
    parts: [{ text: msg.text || "" }]
  }));

  if (contents.length === 0) contents.push({ role: "user", parts: [{ text: "Hello." }] });

  const response = await ai.models.generateContent({
    model: model,
    contents,
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.9,
      maxOutputTokens: 2048
    },
  });

  if (!response || !response.text) throw new Error("empty response");
  return response.text.trim();
};

// ------------------------------------------------------------------
// 🔀 MAIN GENERATION ROUTER
// ------------------------------------------------------------------

const generateText = async (
  systemPrompt: string,
  history: ChatMessage[],
  selectedAI: AIModelOption
): Promise<string> => {
  try {
    // 1. ROUTE TO LOCAL OFFLINE
    if (selectedAI === 'local-offline') {
        return processLocalResponse(history, { name: "Zia", personality: systemPrompt, conversationMode: 'normal', gender: 'female' });
    }

    // 2. ROUTE TO DEEPSEEK
    if (selectedAI === 'deepseek-chat') {
      return await retry(() => callDeepSeek(systemPrompt, history));
    }

    // 3. ROUTE TO OPENROUTER
    if (selectedAI in OPENROUTER_MODELS) {
      return await retry(() => callOpenRouter(selectedAI, systemPrompt, history));
    }

    // 4. ROUTE TO GEMINI (With Failover)
    try {
      return await retry(() => callGeminiText(systemPrompt, history, selectedAI));
    } catch (gemErr) {
      // If Gemini fails, try DeepSeek as last resort if key exists
      if (DEEPSEEK_KEY && selectedAI.includes('gemini')) {
          console.warn("Gemini failed, falling back to DeepSeek...");
          return await callDeepSeek(systemPrompt, history);
      }
      throw gemErr;
    }
  } catch (err) {
    return mapErrorToMessage(err);
  }
};

export const generateBotResponse = async (
  history: ChatMessage[],
  botProfile: Pick<BotProfile, "name" | "personality" | "isSpicy" | "conversationMode" | "gender">,
  selectedAI: AIModelOption
): Promise<string> => {
  if (!botProfile) return "(System: Bot profile missing.)";
  
  try {
    if (selectedAI === 'local-offline') {
        await new Promise(res => setTimeout(res, 400 + Math.random() * 400));
        return processLocalResponse(history, botProfile);
    }

    const mode = botProfile.conversationMode || (botProfile.isSpicy ? 'spicy' : 'normal');
    const gender = botProfile.gender || 'female';

    const enhancedPrompt = xyz(
      history,
      history[history.length - 1]?.text || "",
      botProfile.personality || "A helpful human-like Mate.",
      mode,
      gender
    );

    return await generateText(enhancedPrompt, history, selectedAI);
  } catch (error) {
    return mapErrorToMessage(error);
  }
};

export const generateUserResponseSuggestion = async () => "";

export async function generateDynamicDescription(personality: string): Promise<string> { 
    try {
        if (!personality) return "A unique personality.";
        // Avoid excessive API calls for description; return a friendly placeholder or simple snippet
        return "Thinking about you...";
    } catch (e) {
        return "A unique personality.";
    }
}

export async function generateScenarioIdea(personalities: string[] = []): Promise<string> { 
    try {
        const prompt = `Generate a short, one-sentence creative scenario for a roleplay based on these character traits: ${personalities.join(", ")}`;
        return await generateText(prompt, [], 'gemini-2.5-flash');
    } catch (e) {
        return "A sudden encounter leads to unexpected chaos."; 
    }
}

export async function generateImage(prompt: string, sourceImage: string | null): Promise<string> {
  try {
    const ai = getGeminiClient();
    const parts: Part[] = [{ text: prompt }];
    if (sourceImage) parts.unshift(fileToGenerativePart(sourceImage, "image/jpeg"));
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: { parts },
      config: { responseModalities: [Modality.IMAGE] }
    });
    
    if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) return part.inlineData.data;
        }
    }
    throw new Error("empty response");
  } catch (err) {
    throw new Error(mapErrorToMessage(err));
  }
}

export async function generateStory(characters: any, otherNames: string[], scenario: string, selectedAI: AIModelOption) {
  try {
      const charNames = characters.map((c:any)=>c.name).join(", ") + (otherNames.length ? ", " + otherNames.join(", ") : "");
      const prompt = `Write a creative short story scenario.\nContext: ${scenario}\nCharacters involved: ${charNames}\nStay in character and focus on dialogue and descriptive actions.`;
      return await generateText(prompt, [], selectedAI);
  } catch (e) {
      return mapErrorToMessage(e);
  }
}

export async function generateCodePrompt(task: string, language: string) {
    try {
        return await generateText(`Generate a detailed engineering prompt for ${task} in ${language}. Describe the requirements, architecture, and constraints clearly.`, [], 'gemini-2.5-flash');
    } catch (e) {
        return mapErrorToMessage(e);
    }
}
