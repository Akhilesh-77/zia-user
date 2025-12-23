
import React, { useState, useEffect, useMemo } from 'react';
import type { AIModelOption, VoicePreference, GeminiUsage } from '../types';
import type { Page } from '../App';


interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  onClearData: () => void;
  selectedAI: AIModelOption;
  onSelectAI: (model: AIModelOption) => void;
  voicePreference: VoicePreference | null;
  onSetVoicePreference: (voice: VoicePreference | null) => void;
  hasConsented: boolean;
  onConsentChange: (agreed: boolean) => void;
  onNavigate: (page: Page) => void;
  geminiUsage: GeminiUsage;
  botReplyDelay: number;
  onSetBotReplyDelay: (delay: number) => void;
}

// Model Display Config
const aiModelOptions: { id: AIModelOption, name: string, quotaLimit?: number, provider: string }[] = [
    { id: 'local-offline', name: '⚡ Local / Offline (Privacy Mode)', provider: 'Local' },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Fastest)', quotaLimit: 20, provider: 'Google' },
    { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro (Smartest)', quotaLimit: 5, provider: 'Google' },
    { id: 'deepseek-chat', name: 'DeepSeek Chat (V3)', provider: 'DeepSeek' },
    { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (R1)', provider: 'DeepSeek' },
    { id: 'llama-3.3-70b-versatile', name: 'LLaMA 3.3 70B (Versatile)', provider: 'Groq' },
    { id: 'llama-3.1-8b-instant', name: 'LLaMA 3.1 8B (Instant)', provider: 'Groq' },
    { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', provider: 'Groq' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', quotaLimit: 15, provider: 'Google' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', quotaLimit: 2, provider: 'Google' },
    { id: 'gemini-flash-latest', name: 'Gemini Flash (Legacy)', quotaLimit: 15, provider: 'Google' },
    { id: 'gemini-flash-lite-latest', name: 'Gemini Flash Lite', quotaLimit: 15, provider: 'Google' },
];

const GeminiUsageItem: React.FC<{ modelName: string; count: number; limit: number; isExceeded: boolean }> = ({ modelName, count, limit, isExceeded }) => {
    const status = isExceeded ? 'Limit Reached' : (count > limit * 0.8 ? 'Near Limit' : 'Available');
    const colorClass = isExceeded ? 'text-red-500' : (count > limit * 0.8 ? 'text-yellow-500' : 'text-green-500');

    return (
        <div className="flex flex-col gap-1 p-3 bg-white/5 rounded-lg border border-white/5">
            <div className="flex justify-between items-center">
                <span className="text-sm font-bold truncate pr-2">{modelName}</span>
                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-black/30 ${colorClass}`}>{status}</span>
            </div>
            <div className="flex justify-between items-end">
                <div className="flex-1 mr-4 h-1.5 bg-black/30 rounded-full overflow-hidden">
                    <div 
                        className={`h-full transition-all duration-500 ${isExceeded ? 'bg-red-500' : 'bg-accent'}`} 
                        style={{ width: `${Math.min(100, (count / limit) * 100)}%` }} 
                    />
                </div>
                <span className="text-[10px] text-gray-400 font-mono whitespace-nowrap">~{count}/{limit} msgs</span>
            </div>
        </div>
    );
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen, onClose, theme, toggleTheme, onClearData, selectedAI, onSelectAI, voicePreference, onSetVoicePreference, hasConsented, onConsentChange, onNavigate, geminiUsage, botReplyDelay, onSetBotReplyDelay }) => {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isDisclaimerExpanded, setIsDisclaimerExpanded] = useState(false);
  const [isUsageExpanded, setIsUsageExpanded] = useState(false);

  useEffect(() => {
    const loadVoices = () => {
        const availableVoices = window.speechSynthesis.getVoices();
        if(availableVoices.length > 0) {
            setVoices(availableVoices);
        }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    
    return () => {
        window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const todayUsage = useMemo(() => geminiUsage[todayStr] || {}, [geminiUsage, todayStr]);

  const handleNavigateStats = () => {
    onNavigate('stats');
  }

  const handleNavigateVersion = () => {
    onNavigate('version');
  }

  // Added explicit return type Record<string, typeof aiModelOptions> to ensure TypeScript correctly identifies 'options' as an array in the render phase
  const groupedOptions = useMemo<Record<string, typeof aiModelOptions>>(() => {
      const groups: Record<string, typeof aiModelOptions> = {};
      aiModelOptions.forEach(opt => {
          if (!groups[opt.provider]) groups[opt.provider] = [];
          groups[opt.provider].push(opt);
      });
      return groups;
  }, []);

  return (
    <>
      <div 
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <div 
        className={`fixed top-0 left-0 h-full w-80 max-w-[80vw] bg-light-bg dark:bg-dark-bg shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="p-6 flex flex-col h-full overflow-y-auto no-scrollbar">
            <h2 className="text-2xl font-bold mb-8">Settings</h2>
            
            <div className="space-y-4">
                {/* GEMINI USAGE DASHBOARD (Read-Only) */}
                <div className="bg-white/5 dark:bg-black/10 rounded-xl overflow-hidden border border-accent/20">
                    <button 
                        onClick={() => setIsUsageExpanded(!isUsageExpanded)} 
                        className="w-full flex justify-between items-center p-4 bg-accent/10 hover:bg-accent/20 transition-colors"
                    >
                        <span className="font-bold text-sm">Google Quota (Free)</span>
                        <svg className={`h-4 w-4 transition-transform duration-300 ${isUsageExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    {isUsageExpanded && (
                        <div className="p-4 space-y-3 animate-fadeIn">
                            <p className="text-[10px] text-gray-500 mb-2 italic">Estimates reset daily. Note: DeepSeek & Groq quotas are managed on their respective platforms.</p>
                            {aiModelOptions.filter(opt => opt.quotaLimit).map(model => {
                                const stats = todayUsage[model.id] || { count: 0, limitReached: false };
                                return (
                                    <GeminiUsageItem 
                                        key={model.id}
                                        modelName={model.name.replace('Gemini ', '')}
                                        count={stats.count}
                                        limit={model.quotaLimit!}
                                        isExceeded={stats.limitReached}
                                    />
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="bg-white/5 dark:bg-black/10 p-4 rounded-xl">
                    <div className="flex justify-between items-center mb-2">
                        <span className="font-medium">Bot Reply Delay</span>
                        <span className="text-accent font-bold">{botReplyDelay}s</span>
                    </div>
                    <input 
                        type="range"
                        min="0"
                        max="60"
                        step="1"
                        value={botReplyDelay}
                        onChange={(e) => onSetBotReplyDelay(parseInt(e.target.value, 10))}
                        className="w-full h-1.5 bg-black/30 rounded-lg appearance-none cursor-pointer accent-accent"
                    />
                </div>

                <div className="flex justify-between items-center bg-white/5 dark:bg-black/10 p-4 rounded-xl">
                    <span className="font-medium">Theme</span>
                    <button onClick={toggleTheme} className="flex items-center gap-2">
                        <span>{theme === 'dark' ? 'Dark' : 'Light'}</span>
                    </button>
                </div>
                
                 <div className="bg-white/5 dark:bg-black/10 p-4 rounded-xl">
                    <p className="font-medium mb-2">Voice Preference</p>
                    {voices.length > 0 ? (
                        <select
                            value={voicePreference || ''}
                            onChange={(e) => onSetVoicePreference(e.target.value || null)}
                            className="w-full bg-black/20 p-2 rounded-lg border border-white/20 focus:outline-none focus:ring-2 focus:ring-accent"
                        >
                            <option value="">Browser Default</option>
                            {voices.map(voice => (
                                <option key={voice.name} value={voice.name}>{voice.name}</option>
                            ))}
                        </select>
                    ) : (
                        <p className="text-xs text-gray-400">Loading voices...</p>
                    )}
                </div>

                <div className="bg-white/5 dark:bg-black/10 p-4 rounded-xl">
                    <p className="font-medium mb-2">AI Provider & Model</p>
                    <div className="space-y-4">
                        {Object.entries(groupedOptions).map(([provider, options]) => (
                            <div key={provider} className="space-y-1">
                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">{provider}</p>
                                {options.map(option => (
                                    <label key={option.id} className="flex items-center cursor-pointer p-1 hover:bg-white/5 rounded-lg transition-colors">
                                        <input 
                                            type="radio" 
                                            name="ai-model" 
                                            value={option.id}
                                            checked={selectedAI === option.id}
                                            onChange={() => onSelectAI(option.id as AIModelOption)}
                                            className="h-4 w-4 text-accent bg-gray-700 border-gray-600 focus:ring-accent"
                                        />
                                        <span className={`ml-3 text-sm ${selectedAI === option.id ? 'text-accent font-bold' : 'text-gray-300'}`}>
                                            {option.name}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white/5 dark:bg-black/10 p-4 rounded-xl space-y-3">
                    <p className="font-medium">App Tools</p>
                    <button onClick={handleNavigateStats} className="w-full bg-accent/80 text-white font-bold py-2 px-4 rounded-lg transition-colors">Usage Stats</button>
                    <button onClick={handleNavigateVersion} className="w-full bg-gray-600/80 text-white font-bold py-2 px-4 rounded-lg transition-colors">Version Info</button>
                    <button onClick={onClearData} className="w-full bg-red-600/80 text-white font-bold py-2 px-4 rounded-lg transition-colors">Clear All Data</button>
                </div>

                <div className="bg-white/5 dark:bg-black/10 p-4 rounded-xl">
                    <label className="flex items-start cursor-pointer">
                        <input 
                            type="checkbox" 
                            checked={hasConsented}
                            onChange={(e) => onConsentChange(e.target.checked)}
                            className="h-5 w-5 mt-0.5 text-accent bg-gray-700 border-gray-600 focus:ring-accent rounded flex-shrink-0"
                        />
                        <span className="ml-3 text-sm">I agree to the disclaimer.</span>
                    </label>
                </div>
            </div>

            <div className="mt-auto text-center text-xs text-gray-500 flex flex-col items-center gap-2 pt-4">
                <img src="https://i.postimg.cc/qRB2Gnw2/Gemini-Generated-Image-vfkohrvfkohrvfko-1.png" alt="Zia.ai Logo" className="h-8 w-8"/>
                <p>© 2025 Zia.ai — Multi-Provider AI Integration</p>
            </div>
        </div>
      </div>
    </>
  );
};

export default SettingsPanel;
