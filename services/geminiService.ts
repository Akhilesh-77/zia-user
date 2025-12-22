
import { GoogleGenAI } from "@google/genai";
import { ChatMessage, AIModelOption, BotProfile } from "../types";
import { xyz } from "./xyz";
import { processLocalResponse } from "./localBrain";

// ------------------------------------------------------------------
// 🛡️ PROVIDER REGISTRY & ISOLATION (CRASH-SAFE)
// ------------------------------------------------------------------
type ProviderState = {
    verifiedQuota: boolean;
    lastError: string | null;
    retryActive: boolean;
};

let geminiState: ProviderState = { verifiedQuota: false, lastError: null, retryActive: false };
let deepseekState: ProviderState = { verifiedQuota: false, lastError: null, retryActive: false };

let lastUsedApiKey: string | null = null;
let currentProvider: 'gemini' | 'deepseek' | 'local' = 'gemini';

/**
 * HARD PROVIDER STATE RESET
 * Destroys all in-memory flags for the active provider.
 */
export const resetApiState = () => {
  geminiState = { verifiedQuota: false, lastError: null, retryActive: false };
  deepseekState = { verifiedQuota: false, lastError: null, retryActive: false };
  lastUsedApiKey = process.env.API_KEY || null;
  console.log(`Zia.ai: Provider Isolation Reset. Identity: ${currentProvider}`);
};

const getProviderForModel = (modelId: string): 'gemini' | 'deepseek' | 'local' => {
    if (modelId === 'local-offline') return 'local';
    if (modelId.startsWith('deepseek-')) return 'deepseek';
    return 'gemini';
};

// ------------------------------------------------------------------
// 🛠️ DEEPSEEK IMPLEMENTATION (ISOLATED)
// ------------------------------------------------------------------
const runDeepSeekRequest = async (modelId: string, history: ChatMessage[], bot: any) => {
    const key = process.env.API_KEY;
    if (!key) throw new Error("DeepSeek API Key missing.");

    const systemInstruction = xyz(
        history, 
        history[history.length - 1]?.text || "", 
        bot.personality, 
        bot.conversationMode || 'normal',
        bot.gender || 'female'
    );

    const messages = [
        { role: "system", content: systemInstruction },
        ...history.map(m => ({
            role: m.sender === 'user' ? 'user' : 'assistant',
            content: m.text || " "
        }))
    ];

    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${key}`
        },
        body: JSON.stringify({
            model: modelId,
            messages,
            temperature: 0.9,
            stream: false
        })
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: { message: "Unknown DeepSeek Error" } }));
        const status = response.status;
        const msg = errData?.error?.message || response.statusText;
        
        const error: any = new Error(msg);
        error.status = status;
        error.provider = 'deepseek';
        throw error;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "(Silence...)";
};

// ------------------------------------------------------------------
// 🛠️ GEMINI IMPLEMENTATION (ISOLATED)
// ------------------------------------------------------------------
const runGeminiRequest = async (modelId: string, history: ChatMessage[], bot: any) => {
    const key = process.env.API_KEY;
    if (!key) throw new Error("Gemini API Key missing.");
    
    const ai = new GoogleGenAI({ apiKey: key });
    const activeModel = modelId.startsWith('gemini-') ? modelId : 'gemini-3-flash-preview';
    
    const systemInstruction = xyz(
        history, 
        history[history.length - 1]?.text || "", 
        bot.personality, 
        bot.conversationMode || 'normal',
        bot.gender || 'female'
    );

    const contents = history.map(m => ({
        role: m.sender === 'user' ? 'user' : 'model',
        parts: [{ text: m.text || " " }]
    }));

    const response = await ai.models.generateContent({
        model: activeModel,
        contents,
        config: { systemInstruction, temperature: 0.9 }
    });

    return response.text || "(Silence...)";
};

// ------------------------------------------------------------------
// 🔍 ERROR INTERPRETATION
// ------------------------------------------------------------------
const parseAiError = (error: any, provider: string): string => {
    const status = error?.status;
    const msg = String(error?.message || "").toLowerCase();

    // TRUE DAILY LIMIT VALIDATION
    if (status === 429 || msg.includes("quota") || msg.includes("rate limit")) {
        return `(System: [${provider.toUpperCase()} Quota] Daily limit reached. Please switch keys or wait.)`;
    }

    if (status === 401 || status === 403) {
        return `(System: [${provider.toUpperCase()} Auth] Invalid API key. Update it in the Vault.)`;
    }

    // NON-BLOCKING TEMPORARY ERRORS
    if (status >= 500) {
        return `(System: [${provider.toUpperCase()} Server] Service is busy or down. Please try again.)`;
    }

    return `(System: [${provider.toUpperCase()} Error] ${error.message || "Request failed."})`;
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
    
    const provider = getProviderForModel(modelId);
    
    // Switch Isolation
    if (provider !== currentProvider || process.env.API_KEY !== lastUsedApiKey) {
        currentProvider = provider;
        resetApiState();
    }

    if (provider === 'local') return processLocalResponse(history, bot);

    const activeState = provider === 'gemini' ? geminiState : deepseekState;

    const execute = async () => {
        if (provider === 'gemini') return await runGeminiRequest(modelId, history, bot);
        return await runDeepSeekRequest(modelId, history, bot);
    };

    try {
        const result = await execute();
        onSuccess?.();
        activeState.lastError = null;
        return result;
    } catch (error: any) {
        // SINGLE-RETRY LOGIC
        if (!activeState.retryActive && (error.status === 429 || error.status >= 500)) {
            activeState.retryActive = true;
            try {
                const retryResult = await execute();
                onSuccess?.();
                activeState.retryActive = false;
                activeState.lastError = null;
                return retryResult;
            } catch (retryError: any) {
                activeState.retryActive = false;
                const errorMsg = parseAiError(retryError, provider);
                if (errorMsg.includes("Quota")) onQuotaExceeded?.();
                return errorMsg;
            }
        }
        
        const errorMsg = parseAiError(error, provider);
        if (errorMsg.includes("Quota")) onQuotaExceeded?.();
        return errorMsg;
    }
};

export const generateUserSuggestion = async (
    history: ChatMessage[],
    bot: Pick<BotProfile, 'name' | 'personality' | 'conversationMode' | 'gender'>,
    modelId: AIModelOption = 'gemini-3-flash-preview'
): Promise<string> => {
    try {
        const provider = getProviderForModel(modelId);
        if (provider !== 'gemini') return "Tell me more."; // Suggestions currently Gemini-only for stability
        
        const key = process.env.API_KEY;
        if (!key) return "Hey, what's up?";
        
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
    const key = process.env.API_KEY;
    if (!key) throw new Error("API Key missing.");
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
    const key = process.env.API_KEY;
    if (!key) throw new Error("API Key missing.");
    const ai = new GoogleGenAI({ apiKey: key });
    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `Create prompt for ${task} in ${language}.`
    });
    return response.text || "Failed.";
};
