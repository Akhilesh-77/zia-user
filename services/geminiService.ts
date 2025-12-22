
import { GoogleGenAI } from "@google/genai";
import { ChatMessage, AIModelOption, BotProfile } from "../types";
import { xyz } from "./xyz";
import { processLocalResponse } from "./localBrain";

// ------------------------------------------------------------------
// 🛡️ TRANSIENT PROVIDER STATE (CRASH-SAFE)
// ------------------------------------------------------------------
// These flags are reset frequently to prevent stale error inheritance
let geminiRetryActive = false;
let deepseekRetryActive = false;

/**
 * HARD PROVIDER STATE RESET
 * Fully destroys all transient flags and error trackers.
 * Guaranteed to be called on error deletion or provider switch.
 */
export const resetApiState = () => {
  geminiRetryActive = false;
  deepseekRetryActive = false;
  console.log("Zia.ai: Hard Provider State Reset executed. All transient flags purged.");
};

/**
 * LAZY ENV KEY RESOLUTION (MANDATORY)
 * Resolves keys dynamically at request time. Never cached in memory.
 */
const resolveKey = (provider: 'gemini' | 'deepseek'): string | null => {
    try {
        const env =
            typeof process !== 'undefined' && process.env
                ? (process.env as any)
                : null;

        if (!env) return null;

        const key =
            provider === 'gemini'
                ? env.GEMINI_API_KEY || env.API_KEY
                : env.DEEPSEEK_API_KEY;

        if (typeof key !== 'string' || key.trim().length < 10) {
            return null; // soft fail, no poisoning
        }

        return key.trim();
    } catch {
        return null;
    }
};


// ------------------------------------------------------------------
// 🛠️ LAZY PROVIDER EXECUTION
// ------------------------------------------------------------------

const runDeepSeekRequest = async (modelId: string, history: ChatMessage[], bot: any) => {
   const key = resolveKey('deepseek');
if (!key) {
    throw { status: 'MISSING_KEY', message: 'DeepSeek API key not available at runtime.' };
}
 // Resolved at request time

    const systemInstruction = xyz(
        history, 
        history[history.length - 1]?.text || "", 
        bot.personality, 
        bot.conversationMode || 'normal',
        bot.gender || 'female'
    );

    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${key}`
        },
        body: JSON.stringify({
            model: modelId,
            messages: [
                { role: "system", content: systemInstruction },
                ...history.map(m => ({
                    role: m.sender === 'user' ? 'user' : 'assistant',
                    content: m.text || " "
                }))
            ],
            temperature: 0.9,
            stream: false
        })
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const error: any = new Error(errData?.error?.message || response.statusText);
        error.status = response.status;
        throw error;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "(Silence...)";
};

const runGeminiRequest = async (modelId: string, history: ChatMessage[], bot: any) => {
    const key = resolveKey('gemini');
if (!key) {
    throw { status: 'MISSING_KEY', message: 'Gemini API key not available at runtime.' };
}
 // Resolved at request time
    
    // Defer initialization to request time
    const ai = new GoogleGenAI({ apiKey: key });
    const activeModel = modelId.startsWith('gemini-') ? modelId : 'gemini-3-flash-preview';
    
    const contents = history.map(m => ({
        role: m.sender === 'user' ? 'user' : 'model',
        parts: [{ text: m.text || " " }]
    }));

    const response = await ai.models.generateContent({
        model: activeModel,
        contents,
        config: { 
            systemInstruction: xyz(history, history[history.length - 1]?.text || "", bot.personality, bot.conversationMode, bot.gender),
            temperature: 0.9 
        }
    });

    return response.text || "(Silence...)";
};

// ------------------------------------------------------------------
// 🔍 ERROR NORMALIZATION
// ------------------------------------------------------------------
const mapErrorToMessage = (error: any, provider: string): string => {
    const status = error?.status;
    const msg = String(error?.message || "").toLowerCase();

    if (status === 'MISSING_KEY') {
        return `(System: [${provider.toUpperCase()} Config] API Key missing in environment variables. Add it to continue.)`;
    }

    if (status === 429 || msg.includes("quota") || msg.includes("rate limit")) {
        return `(System: [${provider.toUpperCase()} Quota] Daily limit reached. Deleting this message resets the state.)`;
    }

    if (status === 401 || status === 403) {
        return `(System: [${provider.toUpperCase()} Auth] Invalid API key detected in environment.)`;
    }

    return `(System: [${provider.toUpperCase()} Error] ${error.message || "Request failed. You can still continue the conversation."})`;
};

// ------------------------------------------------------------------
// 🤖 CORE AI ROUTER
// ------------------------------------------------------------------
export const generateBotResponse = async (
    history: ChatMessage[],
    bot: Pick<BotProfile, 'name' | 'personality' | 'isSpicy' | 'conversationMode' | 'gender'>,
    modelId: AIModelOption = 'gemini-3-flash-preview',
    onSuccess?: () => void,
    onQuotaExceeded?: () => void
): Promise<string> => {
    
    const providerId = modelId === 'local-offline' ? 'local' : (modelId.startsWith('deepseek-') ? 'deepseek' : 'gemini');

    if (providerId === 'local') return processLocalResponse(history, bot);

    const execute = async () => {
        if (providerId === 'gemini') return await runGeminiRequest(modelId, history, bot);
        return await runDeepSeekRequest(modelId, history, bot);
    };

    try {
        const result = await execute();
        onSuccess?.();
        return result;
    } catch (error: any) {
        // SINGLE-RETRY LOGIC (ONLY for transient failures)
        const isTransient = error.status === 429 || error.status >= 500;
        const retryFlag = providerId === 'gemini' ? geminiRetryActive : deepseekRetryActive;

        if (isTransient && !retryFlag) {
            if (providerId === 'gemini') geminiRetryActive = true; else deepseekRetryActive = true;
            try {
                const retryResult = await execute();
                onSuccess?.();
                return retryResult;
            } catch (retryError: any) {
                if (String(retryError?.message).toLowerCase().includes("quota")) onQuotaExceeded?.();
                return mapErrorToMessage(retryError, providerId);
            } finally {
                // Reset retry flag after the attempt so future messages aren't blocked
                if (providerId === 'gemini') geminiRetryActive = false; else deepseekRetryActive = false;
            }
        }
        
        if (String(error?.message).toLowerCase().includes("quota")) onQuotaExceeded?.();
        return mapErrorToMessage(error, providerId);
    }
};

export const generateUserSuggestion = async (
    history: ChatMessage[],
    bot: Pick<BotProfile, 'name' | 'personality' | 'conversationMode' | 'gender'>,
    modelId: AIModelOption = 'gemini-3-flash-preview'
): Promise<string> => {
    try {
        const providerId = modelId.startsWith('deepseek-') ? 'deepseek' : 'gemini';
        if (providerId !== 'gemini') return "Tell me more."; 
        
        const key = resolveKey('gemini');
        const ai = new GoogleGenAI({ apiKey: key });
        const contextText = history.slice(-5).map(m => `${m.sender}: ${m.text}`).join('\n');
        
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [{ role: 'user', parts: [{ text: `Suggest one short message for the user based on history:\n${contextText}` }] }],
            config: { 
                systemInstruction: `You are ${bot.name}'s assistant. Suggest 1 natural msg for the user.`,
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
    const key = resolveKey('gemini');
    const ai = new GoogleGenAI({ apiKey: key });
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
    const key = resolveKey('gemini');
    const ai = new GoogleGenAI({ apiKey: key });
    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `Create prompt for ${task} in ${language}.`
    });
    return response.text || "Failed.";
};
