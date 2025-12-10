
// 🧠 ZIA LOCAL BRAIN - ENGINE
// A lightweight, offline, rule-based chat engine.

import { PATTERNS, TEMPLATES, VOCABULARY } from './brain/data';
import type { ChatMessage, BotProfile, ConversationMode, BotGender } from '../types';

interface BrainContext {
    userMood: 'neutral' | 'happy' | 'sad' | 'horny' | 'angry';
    lastTopic: string | null;
    intimacyLevel: number; // 0-100
}

// Simple in-memory context (resets on reload, which is fine for local)
let context: BrainContext = {
    userMood: 'neutral',
    lastTopic: null,
    intimacyLevel: 0
};

const getRandom = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

const injectPlaceholders = (text: string, botName: string) => {
    return text
        .replace(/{name}/g, botName)
        .replace(/{endearment}/g, getRandom(VOCABULARY.ENDEARMENTS));
};

const applyPersonalityFilter = (text: string, personality: string, gender: BotGender) => {
    let modified = text;

    // Simple style transfer heuristics based on keywords in personality
    const isShy = personality.toLowerCase().includes('shy') || personality.toLowerCase().includes('timid');
    const isBold = personality.toLowerCase().includes('bold') || personality.toLowerCase().includes('dominant');
    const isMale = gender === 'male';

    if (isShy) {
        modified = modified.toLowerCase();
        if (!modified.startsWith('*')) modified = '...' + modified;
    }

    if (isBold) {
        if (Math.random() > 0.7) modified += " Don't make me wait.";
    }

    if (isMale) {
        modified = modified.replace(/giggles/g, "chuckles").replace(/beautiful/g, "handsome");
    }

    return modified;
};

export const processLocalResponse = (
    history: ChatMessage[],
    botProfile: Pick<BotProfile, "name" | "personality" | "conversationMode" | "gender">
): string => {
    const lastUserMsg = history.filter(m => m.sender === 'user').pop()?.text || "";
    const mode = botProfile.conversationMode || 'normal';
    
    // 1. Analyze Input
    let intent = 'DEFAULT';
    if (PATTERNS.GREETING.test(lastUserMsg)) intent = 'GREETING';
    else if (PATTERNS.LOVE.test(lastUserMsg)) intent = 'LOVE';
    else if (PATTERNS.HORNY.test(lastUserMsg)) intent = 'HORNY';
    else if (PATTERNS.SAD.test(lastUserMsg)) intent = 'SAD_COMFORT';
    else if (PATTERNS.QUESTION_DOING.test(lastUserMsg)) intent = 'DOING';

    // 2. Select Template Base
    let responses = TEMPLATES.DEFAULT;

    if (intent === 'GREETING') responses = TEMPLATES.GREETING;
    if (intent === 'LOVE') responses = TEMPLATES.LOVE;
    if (intent === 'SAD_COMFORT') responses = TEMPLATES.SAD_COMFORT;
    if (intent === 'DOING') responses = TEMPLATES.DOING;
    
    // 3. Handle Intimacy & Modes
    if (intent === 'HORNY' || mode === 'spicy' || mode === 'extreme') {
        // Escalate based on mode
        if (mode === 'normal') {
            responses = ["I... I don't know what to say to that.", "*blushes* You're making me nervous.", "Let's talk about something else?"];
        } else if (mode === 'spicy') {
            responses = [...TEMPLATES.SPICY_LEVEL_1, ...TEMPLATES.SPICY_LEVEL_2];
        } else if (mode === 'extreme') {
            responses = [...TEMPLATES.SPICY_LEVEL_2, ...TEMPLATES.SPICY_LEVEL_3];
        }
    }

    // 4. Generate Raw Response
    let rawResponse = getRandom(responses);

    // 5. Inject Personality & Gender
    let finalResponse = injectPlaceholders(rawResponse, botProfile.name);
    finalResponse = applyPersonalityFilter(finalResponse, botProfile.personality, botProfile.gender || 'female');

    // 6. Append Action (sometimes)
    if (Math.random() > 0.6 && !finalResponse.includes('*')) {
        const actions = (mode === 'spicy' || mode === 'extreme') ? VOCABULARY.ACTIONS_SPICY : VOCABULARY.ACTIONS_SOFT;
        finalResponse = `${getRandom(actions)} ${finalResponse}`;
    }

    return finalResponse;
};
