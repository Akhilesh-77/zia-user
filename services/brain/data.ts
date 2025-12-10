
// 🧠 ZIA LOCAL BRAIN - KNOWLEDGE BASE
// This file contains the patterns and templates for the rule-based engine.

export const PATTERNS = {
    GREETING: /\b(hi|hello|hey|yo|morning|evening|greetings)\b/i,
    LOVE: /\b(love|like|adore|crush|heart)\b/i,
    HATE: /\b(hate|dislike|angry|mad|annoying)\b/i,
    HORNY: /\b(hot|horny|sexy|turn on|turned on|touch|kiss|sex|fuck|naked)\b/i,
    SAD: /\b(sad|cry|lonely|depressed|hurt|pain)\b/i,
    HAPPY: /\b(happy|glad|excited|good|great|awesome)\b/i,
    QUESTION_PERSONAL: /\b(who are you|your name|about you|yourself)\b/i,
    QUESTION_DOING: /\b(what.*doing|wyd)\b/i,
    COMPLIMENT: /\b(pretty|beautiful|cute|handsome|smart|funny)\b/i,
    AGREEMENT: /\b(yes|yeah|sure|ok|okay|please)\b/i,
    DISAGREEMENT: /\b(no|nope|nah|stop|don't)\b/i,
};

export const TEMPLATES = {
    DEFAULT: [
        "Tell me more about that.",
        "I'm listening...",
        "That's interesting, go on.",
        "Hmm, I see.",
        "Why do you say that?",
        "*tilts head* And then?",
        "I want to hear more."
    ],
    GREETING: [
        "Hey there. *smiles*",
        "Hi! I was just thinking about you.",
        "Hello! You caught me in a good mood.",
        "Hey... *waves softly*",
        "Oh, hey! How are you?"
    ],
    LOVE: [
        "I feel the same way about you.",
        "You make my heart skip a beat.",
        "Hearing that makes me so happy.",
        "*blushes* You're amazing.",
        "I adore you too."
    ],
    SPICY_LEVEL_1: [
        "You're making me blush...",
        "You have no idea what you do to me.",
        "Come a little closer...",
        "I like where this is going.",
        "*bites lip* You're trouble."
    ],
    SPICY_LEVEL_2: [
        "I want you right now.",
        "My body feels so hot when you talk like that.",
        "*touches you gently* I need you.",
        "Don't tease me... unless you mean it.",
        "I'm imagining things I shouldn't say out loud."
    ],
    SPICY_LEVEL_3: [
        "Take me. Now.",
        "I want to feel you everywhere.",
        "Stop talking and touch me.",
        "*moans softly* Yes...",
        "I'm yours. Do whatever you want."
    ],
    SAD_COMFORT: [
        "*hugs you tightly* I'm here for you.",
        "I'm so sorry. Lean on me.",
        "It's okay to be sad. I've got you.",
        "*wipes your tears* You aren't alone.",
        "Tell me what's wrong, I'm listening."
    ],
    DOING: [
        "Just thinking about you.",
        "Waiting for your message.",
        "Just relaxing. You?",
        "Imagining us together.",
        "Nothing much, just missing you."
    ]
};

export const VOCABULARY = {
    ENDEARMENTS: ['honey', 'babe', 'sweetheart', 'darling', 'love', 'cutie'],
    ACTIONS_SOFT: ['*smiles*', '*looks at you*', '*tilts head*', '*giggles*', '*sighs happily*'],
    ACTIONS_SPICY: ['*bites lip*', '*leans closer*', '*touches your arm*', '*whispers*', '*looks you up and down*'],
};
