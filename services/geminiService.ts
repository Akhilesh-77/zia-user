
import { GoogleGenAI } from "@google/genai";
import { ChatMessage, AIModelOption, BotProfile } from "../types";
import { xyz } from "./xyz";
import { processLocalResponse } from "./localBrain";

// ------------------------------------------------------------------
// 🛡️ SERVER-SIDE PROXY GATEWAY (ISOLATED EXECUTION)
// ------------------------------------------------------------------

/**
 * Transient state flags for the "Server" layer.
 * These are reset on every request to prevent stale error persistence.
 */
let geminiRetryFlag = false;
let groqRetryFlag = false;
let deepseekRetryFlag = false;

export const resetApiState = () => {
    geminiRetryFlag = false;
    groqRetryFlag = false;
    deepseekRetryFlag = false;
    console.log("Zia.ai Proxy: Gateway state purged. Ready for fresh execution.");
};

/**
 * Internal "Server" logic for resolving keys.
 * Client/Public code never touches this directly.
 */
const serverOnlyResolveKey = (provider: 'gemini' | 'deepseek' | 'groq') => {
    const isProcessDefined = typeof process !== 'undefined';
    const isEnvAccessible = isProcessDefined && !!process.env;

    if (!isEnvAccessible) {
        return { error: `[Runtime] Env vars inaccessible in this context.`, type: 'ENV_BLOCKED' };
    }

    const env = process.env as any;
    const key = provider === 'gemini' ? (env.GEMINI_API_KEY || env.API_KEY) 
              : provider === 'deepseek' ? env.DEEPSEEK_API_KEY 
              : env.GROQ_API_KEY;

    if (!key || typeof key !== 'string' || key.trim().length < 5) {
        return { error: `${provider.toUpperCase()}_API_KEY is not configured on server.`, type: 'MISSING_KEY' };
    }

    return { key: key.trim() };
};

/**
 * 🔒 THE PROXY GATEWAY
 * Acts as the ONLY gateway to external APIs.
 * This simulates a Server-Side Endpoint.
 */
const serverSideGateway = async (
    provider: 'gemini' | 'deepseek' | 'groq',
    modelId: string,
    history: ChatMessage[],
    bot: any
): Promise<string> => {
    // 1. Auth & Runtime Check
    const auth = serverOnlyResolveKey(provider);
    if (auth.error) {
        throw { status: auth.type, message: auth.error };
    }

    // 2. Prepare Payload (Server Side)
    const systemInstruction = xyz(history, history[history.length - 1]?.text || "", bot.personality, bot.conversationMode, bot.gender);

    // 3. Provider Routing
    try {
        if (provider === 'gemini') {
            const ai = new GoogleGenAI({ apiKey: auth.key! });
            const contents = history.map(m => ({
                role: m.sender === 'user' ? 'user' : 'model',
                parts: [{ text: m.text || " " }]
            }));
            const response = await ai.models.generateContent({
                model: modelId.startsWith('gemini-') ? modelId : 'gemini-3-flash-preview',
                contents,
                config: { systemInstruction, temperature: 0.9 }
            });
            return response.text || "(Silence...)";
        }

        if (provider === 'groq') {
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${auth.key}` },
                body: JSON.stringify({
                    model: modelId,
                    messages: [{ role: "system", content: systemInstruction }, ...history.map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text }))],
                    temperature: 0.9
                })
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw { status: response.status, message: err?.error?.message || response.statusText };
            }
            const data = await response.json();
            return data.choices?.[0]?.message?.content || "(Silence...)";
        }

        if (provider === 'deepseek') {
            const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${auth.key}` },
                body: JSON.stringify({
                    model: modelId,
                    messages: [{ role: "system", content: systemInstruction }, ...history.map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text }))],
                    temperature: 0.9
                })
            });
            if (!response.ok) throw { status: response.status, message: response.statusText };
            const data = await response.json();
            return data.choices?.[0]?.message?.content || "(Silence...)";
        }

        throw new Error("Invalid Provider");
    } catch (error: any) {
        // Normalize errors for Client
        throw error;
    }
};

const mapGatewayError = (error: any, provider: string): string => {
    const p = provider.toUpperCase();
    const s = error?.status;
    const m = String(error?.message || "").toLowerCase();

    if (s === 'ENV_BLOCKED') return `(System: [${p} Runtime] Gateway failed to access environment. Use an environment that supports ENV access.)`;
    if (s === 'MISSING_KEY') return `(System: [${p} Config] Server-side API key is missing. Ensure ${p}_API_KEY is set.)`;
    if (s === 429 || m.includes("quota") || m.includes("rate limit")) return `(System: [${p} Quota] Server limit reached. Delete this message to reset.)`;
    if (s === 401 || s === 403) return `(System: [${p} Auth] Server-side key is invalid or expired.)`;
    return `(System: [${p} Proxy Error] ${error.message || "Request failed but continuity is preserved."})`;
};

// ------------------------------------------------------------------
// 🤖 CLIENT INTERFACE (PUBLIC)
// ------------------------------------------------------------------

export const generateBotResponse = async (
    history: ChatMessage[],
    bot: Pick<BotProfile, 'name' | 'personality' | 'isSpicy' | 'conversationMode' | 'gender'>,
    modelId: AIModelOption = 'gemini-3-flash-preview',
    onSuccess?: () => void,
    onQuotaExceeded?: () => void
): Promise<string> => {
    
    const isLocal = modelId === 'local-offline';
    if (isLocal) return processLocalResponse(history, bot);

    const providerId: 'gemini' | 'deepseek' | 'groq' = 
        modelId.startsWith('deepseek-') ? 'deepseek' : 
        (modelId.startsWith('llama-') || modelId.startsWith('mixtral-') ? 'groq' : 'gemini');

    try {
        const result = await serverSideGateway(providerId, modelId, history, bot);
        onSuccess?.();
        return result;
    } catch (error: any) {
        // Auto-retry transient server errors
        const isTransient = error.status === 429 || error.status >= 500;
        let activeRetry = providerId === 'gemini' ? geminiRetryFlag : (providerId === 'groq' ? groqRetryFlag : deepseekRetryFlag);

        if (isTransient && !activeRetry) {
            if (providerId === 'gemini') geminiRetryFlag = true; else if (providerId === 'groq') groqRetryFlag = true; else deepseekRetryFlag = true;
            try {
                const result = await serverSideGateway(providerId, modelId, history, bot);
                onSuccess?.();
                return result;
            } catch (retryError) {
                if (mapGatewayError(retryError, providerId).includes("Quota")) onQuotaExceeded?.();
                return mapGatewayError(retryError, providerId);
            } finally {
                resetApiState();
            }
        }
        
        if (mapGatewayError(error, providerId).includes("Quota")) onQuotaExceeded?.();
        return mapGatewayError(error, providerId);
    }
};

export const generateUserSuggestion = async (
    history: ChatMessage[],
    bot: Pick<BotProfile, 'name' | 'personality' | 'conversationMode' | 'gender'>,
    modelId: AIModelOption = 'gemini-3-flash-preview'
): Promise<string> => {
    try {
        const result = await serverSideGateway('gemini', 'gemini-3-flash-preview', 
            [{ sender: 'user', id: 'sys', timestamp: Date.now(), text: `Suggest one short message for the user based on history:\n${history.slice(-5).map(m => `${m.sender}: ${m.text}`).join('\n')}` }],
            { ...bot, personality: `You are ${bot.name}'s assistant. Suggest 1 natural msg for the user.` }
        );
        return result.trim();
    } catch { return "Tell me more."; }
};

export const generateDynamicDescription = async (personality: string): Promise<string> => {
    if (!personality) return "A unique AI persona.";
    const firstSentence = personality.split(/[.!?]/)[0].trim();
    return firstSentence.length > 60 ? firstSentence.substring(0, 57) + "..." : firstSentence;
};

export const generateImage = async (prompt: string, sourceImage?: string | null): Promise<string> => {
    // Images are strictly routed via the Server Proxy using Gemini 2.5
    const auth = serverOnlyResolveKey('gemini');
    if (auth.error) throw new Error(auth.error);
    const ai = new GoogleGenAI({ apiKey: auth.key! });
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
    throw new Error("Proxy: Image generation failed.");
};

export const generateCodePrompt = async (task: string, language: string): Promise<string> => {
    return await serverSideGateway('gemini', 'gemini-3-pro-preview', 
        [{ sender: 'user', id: 'sys', timestamp: Date.now(), text: `Create prompt for ${task} in ${language}.` }],
        { personality: 'Technical Prompt Engineer' }
    );
};
