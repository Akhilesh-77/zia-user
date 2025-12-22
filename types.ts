
export type AIProvider = 'gemini' | 'deepseek' | 'groq' | 'local';

export type AIModelOption = 
  | 'gemini-3-flash-preview'
  | 'gemini-3-pro-preview'
  | 'gemini-2.5-flash' 
  | 'gemini-2.5-pro' 
  | 'gemini-flash-latest' 
  | 'gemini-flash-lite-latest' 
  | 'deepseek-chat'
  | 'deepseek-reasoner'
  | 'llama-3.3-70b-versatile'
  | 'llama-3.1-8b-instant'
  | 'mixtral-8x7b-32768'
  | 'local-offline';

export type VoicePreference = string;

export type ConversationMode = 'normal' | 'spicy' | 'extreme';
export type BotGender = 'female' | 'male' | 'fluid';

export interface User {
  id: string;
  name: string;
  email: string;
  photoUrl: string;
}

export interface SavedPrompt {
  id: string;
  title: string;
  content: string;
}

export interface BotProfile {
  id:string;
  name: string;
  description: string;
  personality: string;
  photo: string; // base64 data URL
  originalPhoto?: string | null; 
  gif?: string | null; 
  scenario: string;
  chatBackground?: string | null; 
  originalChatBackground?: string | null; 
  chatBackgroundBrightness?: number; 
  personaId?: string | null;
  isSpicy?: boolean; 
  conversationMode?: ConversationMode; 
  gender?: BotGender; 
  galleryImages?: string[]; 
  originalGalleryImages?: string[]; 
  galleryVideos?: string[]; 
  originalGalleryVideos?: string[]; 
  restoredHistory?: ChatMessage[]; 
}

export interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: number;
}

export interface Persona {
  id: string;
  name: string;
  description?: string;
  personality: string;
  photo?: string | null; 
}

export interface ChatSession {
  startTime: number;
  endTime: number;
  botId: string;
}

export interface CustomBlock {
    id: string;
    name: string;
    description: string;
}

export interface ModelUsage {
    count: number;
    limitReached: boolean;
    lastError?: string;
}

export interface GeminiUsage {
    [date: string]: {
        [modelId: string]: ModelUsage;
    }
}

export interface ApiKeyEntry {
  id: string;
  name: string;
  key: string;
  isActive: boolean;
  isExhausted: boolean;
}
