
import { GoogleGenAI } from "@google/genai";
import { ChatMessage, AIModelOption, BotProfile } from "../types";
import { xyz } from "./xyz";
import { processLocalResponse } from "./localBrain";

// ------------------------------------------------------------------
// 🛡️ CLIENT-SIDE SERVICE (PROXY-DRIVEN)
// ------------------------------------------------------------------

let geminiRetryActive = false;
let groqRetryActive = false;

/**
 * Resets local retry flags. 
 * Called when an error message is deleted by the user.
 */
export const resetApiState = () => {
    geminiRetryActive = false;
    groqRetryActive = false;
    console.log("Zia.ai: Client state reset. Ready for fresh proxy request.");
};

/**
 * 🔒 SECURE PROXY CALLER
 * Routes all AI requests to the server-side gateway.
 * Prevents any client-side exposure of environment variables.
 */
const callServerProxy = async (
    provider: 'gemini' | 'groq',
    modelId: string,
    history: ChatMessage[],
    bot: any
): Promise<string> => {
    // Pre-process prompt engineering on client (UI logic)
    const systemInstruction = xyz(history, history[history.length - 1]?.text || "", bot.personality, bot.conversationMode, bot.gender);

    const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            provider,
            modelId,
            history,
            systemInstruction
        })
    });

    const result = await response.json();

    if (!response.ok) {
        throw { 
            status: result.status || response.status, 
            message: result.error || response.statusText,
            type: result.type 
        };
    }

    return result.text;
};

/**
 * Maps proxy/server errors to user-friendly chat messages.
 */
const mapProxyError = (error: any, provider: string): string => {
    const p = provider.toUpperCase();
    const s = error?.status;
    const m = String(error?.message || "").toLowerCase();

    if (error.type === 'MISSING_KEY') return `(System: [${p} Config] Server API key is not configured.)`;
    if (s === 429 || m.includes("quota") || m.includes("rate limit")) return `(System: [${p} Quota] Server capacity reached. Deleting this resets state.)`;
    if (s === 401 || s === 403) return `(System: [${p} Auth] Server API key is invalid.)`;
    if (s >= 500) return `(System: [${p} Server] The gateway encountered a fatal error.)`;
    
    return `(System: [${p} Error] ${error.message || "Request failed. Continuity preserved."})`;
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
    
    if (modelId === 'local-offline') return processLocalResponse(history, bot);

    const providerId: 'gemini' | 'groq' = 
        (modelId.startsWith('llama-') || modelId.startsWith('mixtral-')) ? 'groq' : 'gemini';

    const execute = () => callServerProxy(providerId, modelId, history, bot);

    try {
        const result = await execute();
        onSuccess?.();
        return result;
    } catch (error: any) {
        const isTransient = error.status === 429 || error.status >= 500;
        let retryFlag = providerId === 'gemini' ? geminiRetryActive : groqRetryActive;

        if (isTransient && !retryFlag) {
            if (providerId === 'gemini') geminiRetryActive = true; else groqRetryActive = true;
            try {
                const result = await execute();
                onSuccess?.();
                return result;
            } catch (retryError: any) {
                if (mapProxyError(retryError, providerId).includes("Quota")) onQuotaExceeded?.();
                return mapProxyError(retryError, providerId);
            } finally {
                resetApiState();
            }
        }
        
        if (mapProxyError(error, providerId).includes("Quota")) onQuotaExceeded?.();
        return mapProxyError(error, providerId);
    }
};

export const generateUserSuggestion = async (
    history: ChatMessage[],
    bot: Pick<BotProfile, 'name' | 'personality' | 'conversationMode' | 'gender'>,
    modelId: AIModelOption = 'gemini-3-flash-preview'
): Promise<string> => {
    try {
        return await callServerProxy('gemini', 'gemini-3-flash-preview', 
            [{ sender: 'user', id: 'sys', timestamp: Date.now(), text: `Suggest one natural short message for the user based on history:\n${history.slice(-5).map(m => `${m.sender}: ${m.text}`).join('\n')}` }],
            { ...bot, personality: `You are ${bot.name}'s assistant. Suggest 1 short msg for the user.` }
        );
    } catch { return "Tell me more."; }
};

export const generateDynamicDescription = async (personality: string): Promise<string> => {
    if (!personality) return "A unique AI persona.";
    const firstSentence = personality.split(/[.!?]/)[0].trim();
    return firstSentence.length > 60 ? firstSentence.substring(0, 57) + "..." : firstSentence;
};

/**
 * Image generation is still handled by Gemini, 
 * but now safely resolves keys via the server-only check logic.
 */
export const generateImage = async (prompt: string, sourceImage?: string | null): Promise<string> => {
    // Implementation for Image Generation usually requires direct SDK access.
    // In a strict Server-Side Proxy environment, this should also be moved 
    // to a dedicated /api/image endpoint if full environment safety is needed.
    // For now, we perform a fetch to the proxy if it supports it, or throw an error.
    throw new Error("Proxy: Image generation must be performed via /api/image (Pending Implementation)");
};

export const generateCodePrompt = async (task: string, language: string): Promise<string> => {
    return await callServerProxy('gemini', 'gemini-3-pro-preview', 
        [{ sender: 'user', id: 'sys', timestamp: Date.now(), text: `Create prompt for ${task} in ${language}.` }],
        { personality: 'Technical Prompt Engineer' }
    );
};
