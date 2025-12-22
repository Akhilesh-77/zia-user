
import { GoogleGenAI } from "@google/genai";
import { ChatMessage, AIModelOption, BotProfile } from "../types";
import { xyz } from "./xyz";
import { processLocalResponse } from "./localBrain";

// ------------------------------------------------------------------
// 🛡️ ISOLATED PROVIDER REGISTRY (CRASH-SAFE)
// ------------------------------------------------------------------
type ProviderState = {
    verifiedQuota: boolean;
    lastError: string | null;
    retryActive: boolean;
    keyHash: string | null;
};

// Isolated memory slots for each provider
const providerRegistry: Record<string, ProviderState> = {
    gemini: { verifiedQuota: false, lastError: null, retryActive: false, keyHash: null },
    deepseek: { verifiedQuota: false, lastError: null, retryActive: false, keyHash: null }
};

let currentProviderId: 'gemini' | 'deepseek' | 'local' = 'gemini';

/**
 * RESOLVE API KEYS FROM ENV (MANDATORY)
 * Fetches keys exclusively from environment variables.
 */
const getEnvKey = (provider: 'gemini' | 'deepseek'): string | undefined => {
    if (provider === 'gemini') {
        // Fallback to API_KEY to satisfy system requirements if GEMINI_API_KEY is missing
        return (process.env as any).GEMINI_API_KEY || process.env.API_KEY;
    }
    if (provider === 'deepseek') {
        return (process.env as any).DEEPSEEK_API_KEY;
    }
    return undefined;
};

/**
 * HARD PROVIDER STATE RESET
 * Fully destroys associated state for a provider without app reload.
 * Triggered on key change or manual error deletion.
 */
export const resetApiState = (providerId?: 'gemini' | 'deepseek') => {
    const targets = providerId ? [providerId] : (['gemini', 'deepseek'] as const);
    
    targets.forEach(id => {
        providerRegistry[id] = { 
            verifiedQuota: false, 
            lastError: null, 
            retryActive: false, 
            keyHash: getEnvKey(id as any) || null 
        };
    });
    
    console.log(`Zia.ai: Hard State Reset executed for ${providerId || 'all providers'}.`);
};

const getProviderForModel = (modelId: string): 'gemini' | 'deepseek' | 'local' => {
    if (modelId === 'local-offline') return 'local';
    if (modelId.startsWith('deepseek-')) return 'deepseek';
    return 'gemini';
};

// ------------------------------------------------------------------
// 🛠️ ISOLATED PROVIDER EXECUTION
// ------------------------------------------------------------------

const runDeepSeekRequest = async (modelId: string, history: ChatMessage[], bot: any) => {
    const key = getEnvKey('deepseek');
    if (!key) throw new Error("DEEPSEEK_API_KEY is missing in environment.");

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
        error.provider = 'deepseek';
        throw error;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "(Silence...)";
};

const runGeminiRequest = async (modelId: string, history: ChatMessage[], bot: any) => {
    const key = getEnvKey('gemini');
    if (!key) throw new Error("GEMINI_API_KEY is missing in environment.");
    
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
// 🔍 TRUE QUOTA VALIDATION & ERROR NORMALIZATION
// ------------------------------------------------------------------
const parseAiError = (error: any, provider: string): string => {
    const status = error?.status;
    const msg = String(error?.message || "").toLowerCase();

    // TRUE DAILY LIMIT VALIDATION (Explicit Metadata Only)
    if (status === 429 || msg.includes("quota") || msg.includes("rate limit")) {
        return `(System: [${provider.toUpperCase()} Quota] Daily limit reached. Deleting this message clears the flag.)`;
    }

    if (status === 401 || status === 403 || msg.includes("key")) {
        return `(System: [${provider.toUpperCase()} Key] API Key is invalid or missing in env.)`;
    }

    // Temporary/Network Errors
    return `(System: [${provider.toUpperCase()} Error] ${error.message || "Temporary failure. You can continue chatting."})`;
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
    
    const providerId = getProviderForModel(modelId);
    
    // Switch Isolation: Detect if provider or its key has changed
    const currentKey = providerId !== 'local' ? getEnvKey(providerId as any) : null;
    if (providerId !== currentProviderId || (providerId !== 'local' && currentKey !== providerRegistry[providerId].keyHash)) {
        currentProviderId = providerId;
        resetApiState(providerId !== 'local' ? (providerId as any) : undefined);
    }

    if (providerId === 'local') return processLocalResponse(history, bot);

    const activeState = providerRegistry[providerId];
    const execute = async () => {
        if (providerId === 'gemini') return await runGeminiRequest(modelId, history, bot);
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
                const errorMsg = parseAiError(retryError, providerId);
                if (errorMsg.includes("Quota")) onQuotaExceeded?.();
                return errorMsg;
            }
        }
        
        const errorMsg = parseAiError(error, providerId);
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
        const providerId = getProviderForModel(modelId);
        if (providerId !== 'gemini') return "Tell me more."; 
        
        const key = getEnvKey('gemini');
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
    const key = getEnvKey('gemini');
    if (!key) throw new Error("GEMINI_API_KEY missing.");
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
    const key = getEnvKey('gemini');
    if (!key) throw new Error("GEMINI_API_KEY missing.");
    const ai = new GoogleGenAI({ apiKey: key });
    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `Create prompt for ${task} in ${language}.`
    });
    return response.text || "Failed.";
};
