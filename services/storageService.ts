
import { BotProfile, Persona, ChatMessage, AIModelOption, VoicePreference, ChatSession, CustomBlock, GeminiUsage, ApiKeyEntry } from '../types';

// This service uses localForage to persist data via IndexedDB.
declare const localforage: any;

interface UserData {
    bots: BotProfile[];
    personas: Persona[];
    chatHistories: Record<string, ChatMessage[]>;
    botUsage: Record<string, number>;
    theme: 'light' | 'dark';
    selectedAI: AIModelOption;
    voicePreference: VoicePreference | null;
    hasConsented: boolean;
    savedImages: string[];
    sessions: ChatSession[];
    customBlocks: CustomBlock[];
    geminiUsage: GeminiUsage;
    botReplyDelay: number;
    apiKeys: ApiKeyEntry[];
}

const OLD_STORAGE_KEY = 'zia_userData';
const SHADOW_BACKUP_KEY = 'zia_shadow_persistence_v1';

// Define new keys for individual data pieces
const KEYS: { [K in keyof UserData]: string } = {
    bots: 'zia_bots',
    personas: 'zia_personas',
    chatHistories: 'zia_chatHistories',
    botUsage: 'zia_botUsage',
    theme: 'zia_theme',
    selectedAI: 'zia_selectedAI',
    voicePreference: 'zia_voicePreference',
    hasConsented: 'zia_hasConsented',
    savedImages: 'zia_savedImages',
    sessions: 'zia_sessions',
    customBlocks: 'zia_customBlocks',
    geminiUsage: 'zia_geminiUsage',
    botReplyDelay: 'zia_botReplyDelay',
    apiKeys: 'zia_apiKeys',
};

// Internal helper to sync to a secondary storage layer (Resilience)
const syncShadowBackup = (data: Partial<UserData>) => {
    try {
        const existingShadow = localStorage.getItem(SHADOW_BACKUP_KEY);
        const shadowObj = existingShadow ? JSON.parse(existingShadow) : {};
        const updatedShadow = { ...shadowObj, ...data };
        // We limit history in shadow backup to prevent storage limits, 
        // but prioritize bot configs and recent messages.
        localStorage.setItem(SHADOW_BACKUP_KEY, JSON.stringify(updatedShadow));
    } catch (e) {
        console.warn("Shadow backup failed (likely storage limit)", e);
    }
};

// Migrates data from the old single-key format to the new multi-key format.
export const migrateData = async (): Promise<void> => {
    try {
        const oldData = await localforage.getItem(OLD_STORAGE_KEY);
        if (oldData) {
            const data = oldData as UserData;
            const promises = Object.entries(data).map(([key, value]) => {
                const newKey = KEYS[key as keyof UserData];
                if (newKey) return localforage.setItem(newKey, value);
                return Promise.resolve();
            });
            await Promise.all(promises);
            await localforage.removeItem(OLD_STORAGE_KEY);
            syncShadowBackup(data);
        }
    } catch (error) {
        console.error("Migration failed:", error);
    }
};

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingData: Partial<UserData> = {};

export const saveUserData = async (data: Partial<UserData>): Promise<void> => {
    pendingData = { ...pendingData, ...data };
    if (saveTimeout) clearTimeout(saveTimeout);

    saveTimeout = setTimeout(async () => {
        const dataToSave = { ...pendingData };
        pendingData = {};
        saveTimeout = null;

        try {
            const promises = Object.entries(dataToSave).map(([key, value]) => {
                const typedKey = key as keyof UserData;
                if (KEYS[typedKey]) return localforage.setItem(KEYS[typedKey], value);
                return Promise.resolve();
            });
            await Promise.all(promises);
            // Redundancy layer
            syncShadowBackup(dataToSave);
        } catch (error) {
            console.error(`Failed to save data`, error);
        }
    }, 500);
};

export const loadUserData = async (): Promise<Partial<UserData>> => {
    try {
        const keyNames = Object.keys(KEYS) as (keyof UserData)[];
        const promises = keyNames.map(keyName => localforage.getItem(KEYS[keyName]));
        const values = await Promise.all(promises);

        const data: Partial<UserData> = {};
        let hasData = false;
        keyNames.forEach((key, index) => {
            if (values[index] !== null && values[index] !== undefined) {
                (data as any)[key] = values[index];
                hasData = true;
            }
        });

        // SHADOW RECOVERY: If primary DB is empty but shadow has data, restore it
        if (!hasData || !data.bots || data.bots.length === 0) {
            const shadow = localStorage.getItem(SHADOW_BACKUP_KEY);
            if (shadow) {
                const shadowData = JSON.parse(shadow);
                console.log("Database empty. Recovering from Shadow Persistence...");
                return shadowData;
            }
        }

        return data;
    } catch (error) {
        console.error(`Failed to load data`, error);
        return {};
    }
};

export const clearUserData = async (): Promise<void> => {
    try {
        await Promise.all(Object.values(KEYS).map(key => localforage.removeItem(key)));
        localStorage.removeItem(SHADOW_BACKUP_KEY);
    } catch (error) {
        console.error(`Failed to clear data`, error);
    }
};
