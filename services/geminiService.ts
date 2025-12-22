
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
    console.error("Zia.ai System Error:", error);

    if (msg.includes("429") || msg.includes("quota") || msg.includes("limit reached")) {
        return "(System: Daily limit reached. Try again later or switch AI model.)";
    }
    if (msg.includes("network") || msg.includes("fetch")) {
        return "(System: Connection issue detected. Check your network.)";
    }
    if (msg.includes("invalid_argument") && msg.includes("user role")) {
        return "(System: Conversation sequence error. Please send a message manually to reset.)";
    }
    if (msg.includes("contents are required")) {
        return "(System: The conversation is empty. Please send a message to start.)";
    }
    return "(System: Something went wrong. Please resend your message.)";
};

// ------------------------------------------------------------------
// 🤖 CORE AI LOGIC (REMAINING ALLOWED API USAGE)
// ------------------------------------------------------------------

/**
 * Generates a suggestion for the user to say next.
 */
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
Keep it in the user's POV. Use plain text. No quotes. No asterisks unless they are describing a brief action. 
Make it fit the current mode: ${bot.conversationMode || 'normal'}. 
ONLY return the suggested message text.`;

        const response = await ai.models.generateContent({
            model: activeModel,
            contents: [{ role: 'user', parts: [{ text: `Based on this conversation:\n${contextText}\n\nSuggest a next message for me.` }] }],
            config: {
                systemInstruction,
                temperature: 0.8,
            }
        });

        return response.text?.trim() || "What should we talk about next?";
    } catch (error) {
        console.error("Suggestion error:", error);
        return "Hey, tell me more about that.";
    }
};

/**
 * Generates the chatbot's response using the selected model.
 * This is the ONLY function allowed to consume API quota.
 */
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
        
        const activeModel = modelId.startsWith('gemini-') ? modelId : 'gemini-3-flash-preview';

        // Prepare contents for Gemini API
        const contents = history.map(m => ({
            role: m.sender === 'user' ? 'user' : 'model',
            parts: [{ text: m.text || " " }]
        }));

        // CRITICAL FIX 1: Gemini API requires contents to be non-empty.
        // If history is empty (e.g., clicking Continue on a fresh bot), provide a starting nudge.
        if (contents.length === 0) {
            contents.push({ role: 'user', parts: [{ text: "Hello!" }] });
        } 
        // CRITICAL FIX 2: Gemini API requires multi-turn requests to end with a 'user' role.
        // When clicking "Continue", the last message in history is often from the 'model'.
        // We append a subtle "Go on" prompt from the user role to trigger the continuation.
        else if (contents[contents.length - 1].role === 'model') {
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

        // Use the .text property directly
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
 */
export const generateDynamicDescription = async (personality: string): Promise<string> => {
    if (!personality) return "A unique AI persona.";
    
    const firstSentence = personality.split(/[.!?]/)[0].trim();
    return firstSentence.length > 60 ? firstSentence.substring(0, 57) + "..." : firstSentence;
};

// ------------------------------------------------------------------
// 🛑 IMAGE & CODE TOOLS
// ------------------------------------------------------------------

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

export const generateScenario = async (): Promise<string> => {
    return "Scenario generation is disabled. Please write your own opening message!";
};

export const generateCodePrompt = async (task: string, language: string): Promise<string> => {
    const ai = getGeminiClient();
    const prompt = `Generate a highly detailed and optimized prompt that can be used to write production-ready code for the following task: "${task}". Target language/framework: "${language}".`;
    
    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt
    });

    return response.text || "Failed to generate a detailed code prompt.";
};
