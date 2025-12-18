
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
    const msg = String(error?.message || error || "").toLowerCase();
    console.error("Zia.ai System Error:", error);

    if (msg.includes("429") || msg.includes("quota") || msg.includes("limit reached")) {
        return "(System: Daily limit reached. Try again later or switch AI model.)";
    }
    if (msg.includes("network") || msg.includes("fetch")) {
        return "(System: Connection issue detected. Check your network.)";
    }
    return "(System: Something went wrong. Please resend your message.)";
};

// ------------------------------------------------------------------
// 🤖 CORE AI LOGIC (REMAINING ALLOWED API USAGE)
// ------------------------------------------------------------------

/**
 * Generates the chatbot's response using the selected model.
 * This is the ONLY function allowed to consume API quota.
 */
// FIX: Updated default modelId to 'gemini-3-flash-preview' and improved model selection logic.
export const generateBotResponse = async (
    history: ChatMessage[],
    bot: Pick<BotProfile, 'name' | 'personality' | 'isSpicy' | 'conversationMode' | 'gender'>,
    modelId: AIModelOption = 'gemini-3-flash-preview',
    onSuccess?: () => void,
    onQuotaExceeded?: () => void
): Promise<string> => {
    
    // --- LOCAL BRAIN FALLBACK ---
    if (modelId === 'local-offline') {
        return processLocalResponse(history, bot);
    }

    try {
        const lastUserMessage = history.filter(m => m.sender === 'user').pop()?.text || "";
        
        // Prepare instruction via xyz.ts helper (preserves previous behaviors)
        const systemInstruction = xyz(
            history, 
            lastUserMessage, 
            bot.personality, 
            bot.conversationMode || (bot.isSpicy ? 'spicy' : 'normal'),
            bot.gender || 'female'
        );

        const ai = getGeminiClient();
        
        // FIX: Dynamically select model based on modelId or fallback to gemini-3-flash-preview.
        const activeModel = modelId.startsWith('gemini-') ? modelId : 'gemini-3-flash-preview';

        const response = await ai.models.generateContent({
            model: activeModel,
            contents: history.map(m => ({
                role: m.sender === 'user' ? 'user' : 'model',
                parts: [{ text: m.text }]
            })),
            config: {
                systemInstruction,
                temperature: 0.9,
                topP: 0.95,
                topK: 40,
            }
        });

        // FIX: Access response.text directly (property, not a method).
        const text = response.text || "(The human is lost in thought...)";
        onSuccess?.();
        return text;

    } catch (error: any) {
        const errorMsg = String(error?.message || "").toLowerCase();
        if (errorMsg.includes("429") || errorMsg.includes("quota")) {
            onQuotaExceeded?.();
        }
        return mapErrorToMessage(error);
    }
};

/**
 * FIXED: Local description generator to replace API-eating version.
 * Now returns a clean excerpt from personality to save quota.
 */
export const generateDynamicDescription = async (personality: string): Promise<string> => {
    // Extract a short, catchy sentence from the start of the personality prompt
    if (!personality) return "A unique AI persona.";
    
    const firstSentence = personality.split(/[.!?]/)[0].trim();
    return firstSentence.length > 60 ? firstSentence.substring(0, 57) + "..." : firstSentence;
};

// ------------------------------------------------------------------
// 🛑 IMAGE & CODE TOOLS (RE-ENABLED FOLLOWING SDK GUIDELINES)
// ------------------------------------------------------------------

// FIX: Implemented generateImage using gemini-2.5-flash-image and correct part handling.
export const generateImage = async (prompt: string, sourceImage?: string | null): Promise<string> => {
    const ai = getGeminiClient();
    const parts: any[] = [{ text: prompt }];

    if (sourceImage) {
        const [mimeInfo, base64Data] = sourceImage.split(',');
        const mimeType = mimeInfo.match(/:(.*?);/)?.[1] || 'image/png';
        parts.unshift({
            inlineData: {
                mimeType,
                data: base64Data
            }
        });
    }

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts }
    });

    if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                return part.inlineData.data;
            }
        }
    }
    throw new Error("No image was generated by the model.");
};

// FIX: Stubbed generateScenario to prevent errors in components while keeping it minimal.
export const generateScenario = async (): Promise<string> => {
    return "Scenario generation is disabled. Please write your own opening message!";
};

// FIX: Implemented generateCodePrompt using gemini-3-pro-preview for complex reasoning.
export const generateCodePrompt = async (task: string, language: string): Promise<string> => {
    const ai = getGeminiClient();
    const prompt = `Generate a highly detailed and optimized prompt that can be used to write production-ready code for the following task: "${task}". Target language/framework: "${language}".`;
    
    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt
    });

    return response.text || "Failed to generate a detailed code prompt.";
};