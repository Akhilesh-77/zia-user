
import { GoogleGenAI } from "@google/genai";
import { ChatMessage, AIModelOption, BotProfile } from "../types";
import { xyz } from "./xyz";
import { processLocalResponse } from "./localBrain";

// ------------------------------------------------------------------
// 🔑 AUTHENTICATION SETUP (STRICT: process.env.API_KEY ONLY)
// ------------------------------------------------------------------
const getGeminiClient = () => {
  const key = process.env.API_KEY;
  if (!key) throw new Error("API_KEY environment variable is missing.");
  return new GoogleGenAI({ apiKey: key });
};

// ------------------------------------------------------------------
// 🛠️ ERROR HANDLING & RECOVERY
// ------------------------------------------------------------------
const mapErrorToMessage = (error: any): string => {
    const msg = String(error?.message || error?.error?.message || error || "").toLowerCase();
    const status = error?.status || error?.error?.status;
    
    console.error("Zia.ai System Error Context:", { msg, status });

    if (msg.includes("429") || msg.includes("quota") || msg.includes("limit reached") || status === 429) {
        return "(System: [Quota] Daily limit reached. Try switching AI models in Settings or use an API Key from the Vault.)";
    }
    if (msg.includes("network") || msg.includes("fetch") || msg.includes("failed to fetch")) {
        return "(System: [Network] Connection issue detected. Please check your internet and try again.)";
    }
    if (msg.includes("deadline") || msg.includes("timeout")) {
        return "(System: [Timeout] The AI took too long to respond. Try a shorter message or switch to Flash Lite.)";
    }
    if (msg.includes("invalid_argument") && msg.includes("user role")) {
        return "(System: [Logic] Conversation sequence error. I've lost the thread—please delete this bubble and try again.)";
    }
    
    return `(System: [Error] ${msg || "An unexpected error occurred. Please try again."})`;
};

const isTransientError = (error: any): boolean => {
    const msg = String(error?.message || "").toLowerCase();
    const status = error?.status || error?.error?.status;
    // 500, 503, 504 are usually transient. 429 is quota (not transient in immediate sense but worth one retry).
    return status >= 500 || msg.includes("timeout") || msg.includes("deadline");
};

// ------------------------------------------------------------------
// 🤖 CORE AI LOGIC
// ------------------------------------------------------------------

export const generateUserSuggestion = async (
    history: ChatMessage[],
    bot: Pick<BotProfile, 'name' | 'personality' | 'conversationMode' | 'gender'>,
    modelId: AIModelOption = 'gemini-3-flash-preview'
): Promise<string> => {
    try {
        const ai = getGeminiClient();
        const activeModel = modelId.startsWith('gemini-') ? modelId : 'gemini-3-flash-preview';
        const contextText = history.slice(-5).map(m => `${m.sender}: ${m.text}`).join('\n');
        
        const systemInstruction = `You are a creative writing assistant. 
Based on the conversation history with ${bot.name} (Personality: ${bot.personality}), 
write ONE short, natural-sounding message the USER could say next. 
Keep it in the user's POV. Use plain text. No quotes. No asterisks unless describing an action. 
Make it fit: ${bot.conversationMode || 'normal'}. 
ONLY return the suggested message text.`;

        const response = await ai.models.generateContent({
            model: activeModel,
            contents: [{ role: 'user', parts: [{ text: `Based on this conversation:\n${contextText}\n\nSuggest a next message for me.` }] }],
            config: { systemInstruction, temperature: 0.8 }
        });

        return response.text?.trim() || "What should we talk about next?";
    } catch (error) {
        console.error("Suggestion error:", error);
        return "Hey, tell me more about that.";
    }
};

export const generateBotResponse = async (
    history: ChatMessage[],
    bot: Pick<BotProfile, 'name' | 'personality' | 'isSpicy' | 'conversationMode' | 'gender'>,
    modelId: AIModelOption = 'gemini-3-flash-preview',
    onSuccess?: () => void,
    onQuotaExceeded?: () => void
): Promise<string> => {
    
    if (modelId === 'local-offline') {
        return processLocalResponse(history, bot);
    }

    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
        try {
            const lastUserMessage = history.filter(m => m.sender === 'user').pop()?.text || "";
            const systemInstruction = xyz(
                history, 
                lastUserMessage, 
                bot.personality, 
                bot.conversationMode || (bot.isSpicy ? 'spicy' : 'normal'),
                bot.gender || 'female'
            );

            const ai = getGeminiClient();
            const activeModel = modelId.startsWith('gemini-') ? modelId : 'gemini-3-flash-preview';

            const contents = history.map(m => ({
                role: m.sender === 'user' ? 'user' : 'model',
                parts: [{ text: m.text || " " }]
            }));

            if (contents.length === 0) {
                contents.push({ role: 'user', parts: [{ text: "Hello!" }] });
            } else if (contents[contents.length - 1].role === 'model') {
                contents.push({ role: 'user', parts: [{ text: "..." }] });
            }

            const response = await ai.models.generateContent({
                model: activeModel,
                contents,
                config: {
                    systemInstruction,
                    temperature: 0.9,
                    topP: 0.95,
                    topK: 40,
                }
            });

            onSuccess?.();
            return response.text || "(Silence...)";

        } catch (error: any) {
            attempts++;
            const errorMsg = String(error?.message || "").toLowerCase();
            const status = error?.status || error?.error?.status;

            // Handle Quota
            if (errorMsg.includes("429") || errorMsg.includes("quota") || status === 429) {
                onQuotaExceeded?.();
                return mapErrorToMessage(error);
            }

            // Retry for transient errors
            if (attempts < maxAttempts && isTransientError(error)) {
                console.warn(`Transient error on attempt ${attempts}, retrying...`);
                await new Promise(r => setTimeout(r, 1000 * attempts));
                continue;
            }

            return mapErrorToMessage(error);
        }
    }
    return "(System: [Error] Max retries reached. The AI service is currently unstable.)";
};

export const generateDynamicDescription = async (personality: string): Promise<string> => {
    if (!personality) return "A unique AI persona.";
    const firstSentence = personality.split(/[.!?]/)[0].trim();
    return firstSentence.length > 60 ? firstSentence.substring(0, 57) + "..." : firstSentence;
};

export const generateImage = async (prompt: string, sourceImage?: string | null): Promise<string> => {
    const ai = getGeminiClient();
    const parts: any[] = [{ text: prompt }];

    if (sourceImage) {
        const [mimeInfo, base64Data] = sourceImage.split(',');
        const mimeType = mimeInfo.match(/:(.*?);/)?.[1] || 'image/png';
        parts.unshift({ inlineData: { mimeType, data: base64Data } });
    }

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts }
    });

    if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) return part.inlineData.data;
        }
    }
    throw new Error("No image was generated.");
};

export const generateScenario = async (): Promise<string> => {
    return "Scenario generation is disabled.";
};

export const generateCodePrompt = async (task: string, language: string): Promise<string> => {
    const ai = getGeminiClient();
    const prompt = `Generate a highly detailed prompt for: "${task}". Target: "${language}".`;
    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt
    });
    return response.text || "Failed to generate prompt.";
};
