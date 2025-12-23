
import { GoogleGenAI } from "@google/genai";
import { ChatMessage, AIModelOption, BotProfile } from "../types";
import { xyz } from "./xyz";
import { processLocalResponse } from "./localBrain";

// ------------------------------------------------------------------
// 🛡️ TRANSIENT PROVIDER STATE (CRASH-SAFE & ISOLATED)
// ------------------------------------------------------------------
let geminiRetryActive = false;
let deepseekRetryActive = false;
let groqRetryActive = false;

/**
 * HARD PROVIDER STATE RESET
 * Fully destroys all transient flags and error trackers.
 * Guaranteed to be called on error deletion or provider switch.
 */
export const resetApiState = () => {
  geminiRetryActive = false;
  deepseekRetryActive = false;
  groqRetryActive = false;
  console.log("Zia.ai: Hard Provider State Reset executed. All transient flags purged.");
};

/**
 * LAZY ENV KEY RESOLUTION (MANDATORY)
 * Resolves keys dynamically at request time. 
 * Includes critical runtime diagnostics to distinguish between 
 * missing keys and inaccessible environments.
 */
const resolveKey = (provider: 'gemini' | 'deepseek' | 'groq'): { key: string | null; error?: string; errorType?: string } => {
    try {
        // Diagnostic: Check if process.env is even accessible in the current runtime
        const isProcessDefined = typeof process !== 'undefined';
        const isEnvAccessible = isProcessDefined && !!process.env;

        if (!isEnvAccessible) {
            return { 
                key: null, 
                error: `[Runtime Failure] Environment variables are inaccessible in this execution context.`,
                errorType: 'RUNTIME_ERROR'
            };
        }

        const env = process.env as any;
        const key =
            provider === 'gemini'
                ? env.GEMINI_API_KEY || env.API_KEY
                : provider === 'deepseek'
                ? env.DEEPSEEK_API_KEY
                : env.GROQ_API_KEY;

        if (!key || typeof key !== 'string' || key.trim().length < 5) {
            return { 
                key: null, 
                error: `${provider.toUpperCase()}_API_KEY not found in environment.`,
                errorType: 'MISSING_KEY'
            };
        }

        return { key: key.trim() };
    } catch (e) {
        return { 
            key: null, 
            error: `[Critical] Fatal error during environment key resolution.`,
            errorType: 'RESOLUTION_CRASH'
        };
    }
};

// ------------------------------------------------------------------
// 🛠️ ISOLATED PROVIDER EXECUTIONS
// ------------------------------------------------------------------

const runGroqRequest = async (modelId: string, history: ChatMessage[], bot: any) => {
    const resolution = resolveKey('groq');
    if (!resolution.key) {
        throw { status: resolution.errorType, message: resolution.error };
    }

    const systemInstruction = xyz(history, history[history.length - 1]?.text || "", bot.personality, bot.conversationMode, bot.gender);

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${resolution.key}`
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
        error.errorType = errData?.error?.type || 'API_ERROR';
        error.provider = 'groq';
        throw error;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "(Silence...)";
};

const runDeepSeekRequest = async (modelId: string, history: ChatMessage[], bot: any) => {
    const resolution = resolveKey('deepseek');
    if (!resolution.key) {
        throw { status: resolution.errorType, message: resolution.error };
    }

    const systemInstruction = xyz(history, history[history.length - 1]?.text || "", bot.personality, bot.conversationMode, bot.gender);

    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${resolution.key}`
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
    const resolution = resolveKey('gemini');
    if (!resolution.key) {
        throw { status: resolution.errorType, message: resolution.error };
    }
    
    const ai = new GoogleGenAI({ apiKey: resolution.key });
    const activeModel = modelId.startsWith('gemini-') ? modelId : 'gemini-3-flash-preview';
    const systemInstruction = xyz(history, history[history.length - 1]?.text || "", bot.personality, bot.conversationMode, bot.gender);

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
// 🔍 EXHAUSTIVE ERROR CLASSIFICATION
// ------------------------------------------------------------------
const mapErrorToMessage = (error: any, provider: string): string => {
    const status = error?.status;
    const msg = String(error?.message || "").toLowerCase();
    const type = error?.errorType || '';
    const pName = provider.toUpperCase();

    // 1. Diagnostics & Runtime Failures
    if (status === 'RUNTIME_ERROR') {
        return `(System: [${pName} Environment] Runtime Failure - Environment variables are inaccessible in this context.)`;
    }
    if (status === 'MISSING_KEY') {
        return `(System: [${pName} Config] ${pName}_API_KEY not found in environment.)`;
    }
    if (status === 'RESOLUTION_CRASH') {
        return `(System: [${pName} Fatal] Encountered a crash while resolving the provider identity.)`;
    }

    // 2. Authentication Failures
    if (status === 401 || status === 403 || type === 'authentication_error') {
        return `(System: [${pName} Auth] The API key in your environment is invalid or has been revoked.)`;
    }

    // 3. Quota & Rate Limits
    if (status === 429 || type === 'rate_limit_reached' || msg.includes("quota") || msg.includes("rate limit")) {
        return `(System: [${pName} Quota] Capacity reached. Deleting this message clears the provider state.)`;
    }

    // 4. Server & Model Failures
    if (status >= 500) {
        return `(System: [${pName} Server] The AI service is currently overloaded or experiencing downtime.)`;
    }
    if (msg.includes("not found") || msg.includes("invalid model")) {
        return `(System: [${pName} Model] The selected model is not available for this key.)`;
    }

    // 5. Network & Unknown
    if (msg.includes("fetch") || msg.includes("network")) {
        return `(System: [${pName} Network] Connection failed. Check your internet or proxy settings.)`;
    }

    return `(System: [${pName} Error] ${error.message || "An unexpected error occurred. Continuity is preserved."})`;
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
    
    let providerId: 'gemini' | 'deepseek' | 'groq' | 'local' = 'gemini';
    if (modelId === 'local-offline') providerId = 'local';
    else if (modelId.startsWith('deepseek-')) providerId = 'deepseek';
    else if (modelId.startsWith('llama-') || modelId.startsWith('mixtral-')) providerId = 'groq';

    if (providerId === 'local') return processLocalResponse(history, bot);

    const execute = async () => {
        if (providerId === 'gemini') return await runGeminiRequest(modelId, history, bot);
        if (providerId === 'deepseek') return await runDeepSeekRequest(modelId, history, bot);
        return await runGroqRequest(modelId, history, bot);
    };

    try {
        const result = await execute();
        onSuccess?.();
        return result;
    } catch (error: any) {
        // Transient failures logic (429, 5xx)
        const isTransient = error.status === 429 || error.status >= 500;
        let retryFlag = false;
        if (providerId === 'gemini') retryFlag = geminiRetryActive;
        else if (providerId === 'deepseek') retryFlag = deepseekRetryActive;
        else if (providerId === 'groq') retryFlag = groqRetryActive;

        if (isTransient && !retryFlag) {
            if (providerId === 'gemini') geminiRetryActive = true;
            else if (providerId === 'deepseek') deepseekRetryActive = true;
            else groqRetryActive = true;

            try {
                const retryResult = await execute();
                onSuccess?.();
                return retryResult;
            } catch (retryError: any) {
                if (String(retryError?.message).toLowerCase().includes("quota")) onQuotaExceeded?.();
                return mapErrorToMessage(retryError, providerId);
            } finally {
                if (providerId === 'gemini') geminiRetryActive = false;
                else if (providerId === 'deepseek') deepseekRetryActive = false;
                else groqRetryActive = false;
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
        const resolution = resolveKey('gemini');
        if (!resolution.key) return "Tell me more.";
        const ai = new GoogleGenAI({ apiKey: resolution.key });
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
    } catch { return "Hey, tell me more."; }
};

export const generateDynamicDescription = async (personality: string): Promise<string> => {
    if (!personality) return "A unique AI persona.";
    const firstSentence = personality.split(/[.!?]/)[0].trim();
    return firstSentence.length > 60 ? firstSentence.substring(0, 57) + "..." : firstSentence;
};

export const generateImage = async (prompt: string, sourceImage?: string | null): Promise<string> => {
    const resolution = resolveKey('gemini');
    if (!resolution.key) throw new Error("GEMINI_API_KEY missing.");
    const ai = new GoogleGenAI({ apiKey: resolution.key });
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
    const resolution = resolveKey('gemini');
    if (!resolution.key) throw new Error("GEMINI_API_KEY missing.");
    const ai = new GoogleGenAI({ apiKey: resolution.key });
    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `Create prompt for ${task} in ${language}.`
    });
    return response.text || "Failed.";
};
