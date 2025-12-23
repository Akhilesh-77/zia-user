
import { ChatMessage, AIModelOption, BotProfile } from "../types";
import { xyz } from "./xyz";
import { processLocalResponse } from "./localBrain";

/**
 * 🛡️ CLIENT-SIDE SERVICE (FAST-PATH & CRASH-RESILIENT)
 */

export const resetApiState = () => {
    // No-op for now as proxy-driven state is purged per-request
    console.debug("Zia.ai: Gateway state refreshed.");
};

const callServerProxy = async (
    provider: 'gemini' | 'groq',
    modelId: string,
    history: ChatMessage[],
    bot: any
): Promise<string> => {
    // FAST-PATH: Minimal pre-processing
    const systemInstruction = xyz(history, history[history.length - 1]?.text || "", bot.personality, bot.conversationMode, bot.gender);

    const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, modelId, history, systemInstruction })
    });

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        const rawText = await response.text();
        return `(System: [Proxy Error] Invalid response format. ${rawText.slice(0, 50)}...)`;
    }

    const result = await response.json();
    if (!response.ok) {
        return `(System: [${provider.toUpperCase()}] ${result.error || "Request failed."})`;
    }

    return result.text;
};

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

    try {
        const result = await callServerProxy(providerId, modelId, history, bot);
        
        // SUCCESS PATH
        if (!result.startsWith("(System:")) {
            onSuccess?.();
            return result;
        }

        // ERROR PATH (NORMALIZED)
        if (result.includes("Quota") || result.includes("429")) {
            onQuotaExceeded?.();
        }
        return result;

    } catch (error: any) {
        // FATAL NETWORK/CLIENT ERROR
        return `(System: [Network] Failed to connect to proxy server. Check your connection.)`;
    }
};

export const generateUserSuggestion = async (
    history: ChatMessage[],
    bot: Pick<BotProfile, 'name' | 'personality' | 'conversationMode' | 'gender'>,
    modelId: AIModelOption = 'gemini-3-flash-preview'
): Promise<string> => {
    try {
        const result = await callServerProxy('gemini', 'gemini-3-flash-preview', 
            [{ sender: 'user', id: 'sys', timestamp: Date.now(), text: `Suggest one short chat message for the user based on history:\n${history.slice(-3).map(m => `${m.sender}: ${m.text}`).join('\n')}` }],
            { ...bot, personality: `Suggest 1 short msg.` }
        );
        return result.replace(/^"(.*)"$/, '$1').trim();
    } catch { return "Tell me more."; }
};

export const generateDynamicDescription = async (personality: string): Promise<string> => {
    if (!personality) return "A unique AI persona.";
    const firstSentence = personality.split(/[.!?]/)[0].trim();
    return firstSentence.length > 60 ? firstSentence.substring(0, 57) + "..." : firstSentence;
};

export const generateImage = async (prompt: string, sourceImage?: string | null): Promise<string> => {
    // Note: Image gen requires direct SDK or specialized proxy endpoint.
    // This stub remains to preserve interface but redirects to system error in proxy context.
    return `(System: Image generation requires direct Gemini API keys in the vault.)`;
};

export const generateCodePrompt = async (task: string, language: string): Promise<string> => {
    return await callServerProxy('gemini', 'gemini-3-pro-preview', 
        [{ sender: 'user', id: 'sys', timestamp: Date.now(), text: `Create prompt for ${task} in ${language}.` }],
        { personality: 'Technical Prompt Engineer' }
    );
};
