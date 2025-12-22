
import { GoogleGenAI } from "@google/genai";
import { ChatMessage, AIModelOption, BotProfile } from "../types";
import { xyz } from "./xyz";
import { processLocalResponse } from "./localBrain";

// ------------------------------------------------------------------
// 🛡️ API STATE REGISTRY (HARD RESET CAPABLE)
// ------------------------------------------------------------------
// In-memory cache for tracking "true" quota exhaustion verified by the API
let verifiedQuotaExhaustion: Record<string, boolean> = {};
let lastUsedApiKey: string | null = null;

/**
 * HARD API STATE RESET (MANDATORY)
 * Fully destroys in-memory state when identity changes.
 */
export const resetApiState = () => {
  verifiedQuotaExhaustion = {};
  lastUsedApiKey = process.env.API_KEY || null;
  console.log("Zia.ai: Hard API State Reset executed. All quota and error flags purged.");
};

/**
 * API ENDPOINT ISOLATION (MANDATORY)
 * Creates a fresh, isolated client instance.
 */
const getIsolatedGeminiClient = () => {
  const currentKey = process.env.API_KEY;
  
  // Detect Identity Change
  if (currentKey !== lastUsedApiKey) {
    resetApiState();
  }
  
  if (!currentKey) throw new Error("API_KEY missing.");
  return new GoogleGenAI({ apiKey: currentKey });
};

// ------------------------------------------------------------------
// 🛠️ TRUE DAILY-LIMIT VALIDATION (ANTI-FALSE-POSITIVE)
// ------------------------------------------------------------------
const isExplicitQuotaExhaustion = (error: any): boolean => {
    const msg = String(error?.message || "").toLowerCase();
    const status = error?.status || error?.error?.status;
    
    // ONLY confirm if the API explicitly says so via status 429 or clear quota metadata
    return (
        status === 429 || 
        msg.includes("quota exceeded") || 
        msg.includes("rate limit reached") ||
        (error?.response?.status === 429)
    );
};

const mapErrorToMessage = (error: any): string => {
    const msg = String(error?.message || error?.error?.message || error || "").toLowerCase();
    const isQuota = isExplicitQuotaExhaustion(error);
    
    if (isQuota) {
        return "(System: [Quota] Daily limit reached. Please check your API usage in Google AI Studio or use a different key from the Vault.)";
    }

    // Classify all other errors as temporary/network
    if (msg.includes("network") || msg.includes("fetch") || msg.includes("failed to fetch")) {
        return "(System: [Network] Connection error. Please check your internet connection.)";
    }
    
    if (msg.includes("timeout") || msg.includes("deadline")) {
        return "(System: [Timeout] The request took too long. This is temporary—please try again.)";
    }

    return `(System: [Temporary Error] ${msg || "An unexpected issue occurred. You can continue typing."})`;
};

// ------------------------------------------------------------------
// 🤖 CORE AI LOGIC
// ------------------------------------------------------------------

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

    const runRequest = async () => {
        const ai = getIsolatedGeminiClient();
        const activeModel = modelId.startsWith('gemini-') ? modelId : 'gemini-3-flash-preview';
        const lastUserMessage = history.filter(m => m.sender === 'user').pop()?.text || "";
        
        const systemInstruction = xyz(
            history, 
            lastUserMessage, 
            bot.personality, 
            bot.conversationMode || (bot.isSpicy ? 'spicy' : 'normal'),
            bot.gender || 'female'
        );

        const contents = history.map(m => ({
            role: m.sender === 'user' ? 'user' : 'model',
            parts: [{ text: m.text || " " }]
        }));

        if (contents.length === 0) {
            contents.push({ role: 'user', parts: [{ text: "Hello!" }] });
        }

        const response = await ai.models.generateContent({
            model: activeModel,
            contents,
            config: {
                systemInstruction,
                temperature: 0.9,
            }
        });

        return response.text || "(Silence...)";
    };

    try {
        // First Attempt
        const result = await runRequest();
        onSuccess?.();
        return result;
    } catch (error: any) {
        // SINGLE-RETRY VERIFICATION LOGIC (MANDATORY)
        if (isExplicitQuotaExhaustion(error)) {
            console.warn("Zia.ai: Quota hit detected. Triggering Single-Retry Verification...");
            try {
                // Retry once with a clean request
                const retryResult = await runRequest();
                console.log("Zia.ai: Retry successful. Quota error suppressed.");
                onSuccess?.();
                return retryResult;
            } catch (retryError: any) {
                // If retry fails with confirmed quota metadata -> then show limit error
                if (isExplicitQuotaExhaustion(retryError)) {
                    verifiedQuotaExhaustion[modelId] = true;
                    onQuotaExceeded?.();
                    return mapErrorToMessage(retryError);
                }
                return mapErrorToMessage(retryError);
            }
        }
        
        // Handle non-quota errors normally
        return mapErrorToMessage(error);
    }
};

export const generateUserSuggestion = async (
    history: ChatMessage[],
    bot: Pick<BotProfile, 'name' | 'personality' | 'conversationMode' | 'gender'>,
    modelId: AIModelOption = 'gemini-3-flash-preview'
): Promise<string> => {
    try {
        const ai = getIsolatedGeminiClient();
        const activeModel = modelId.startsWith('gemini-') ? modelId : 'gemini-3-flash-preview';
        const contextText = history.slice(-5).map(m => `${m.sender}: ${m.text}`).join('\n');
        
        const response = await ai.models.generateContent({
            model: activeModel,
            contents: [{ role: 'user', parts: [{ text: `Suggest one short message for the user based on history:\n${contextText}` }] }],
            config: { 
                systemInstruction: `You are ${bot.name}'s writing assistant. Suggest 1 natural msg for the user.`,
                temperature: 0.8 
            }
        });

        return response.text?.trim() || "What's next?";
    } catch (error) {
        return "Hey, tell me more.";
    }
};

export const generateDynamicDescription = async (personality: string): Promise<string> => {
    if (!personality) return "A unique AI persona.";
    const firstSentence = personality.split(/[.!?]/)[0].trim();
    return firstSentence.length > 60 ? firstSentence.substring(0, 57) + "..." : firstSentence;
};

export const generateImage = async (prompt: string, sourceImage?: string | null): Promise<string> => {
    const ai = getIsolatedGeminiClient();
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
    const imgPart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
    if (imgPart) return imgPart.inlineData.data;
    throw new Error("Generation failed.");
};

export const generateCodePrompt = async (task: string, language: string): Promise<string> => {
    const ai = getIsolatedGeminiClient();
    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `Create prompt for ${task} in ${language}.`
    });
    return response.text || "Failed.";
};
