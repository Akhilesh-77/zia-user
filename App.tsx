
import React, { useState, useEffect, useCallback, useRef } from 'react';
import HomePage from './components/HomePage';
import BotsPage from './components/BotsPage';
import CreationForm from './components/CreationForm';
import ChatView from './components/ChatView';
import PersonasPage from './components/PersonasPage';
import ImageGeneratorPage from './components/ImageGeneratorPage';
import ScenarioGeneratorPage from './components/ScenarioGeneratorPage';
import CodePromptGeneratorPage from './components/CodePromptGeneratorPage';
import StatsDashboard from './components/StatsDashboard';
import FooterNav from './components/FooterNav';
import SettingsPanel from './components/SettingsPanel';
import PhotoGalleryPage from './components/PhotoGalleryPage';
import VersionPage from './components/VersionPage';
import type { User, BotProfile, Persona, ChatMessage, AIModelOption, VoicePreference, ChatSession, CustomBlock, GeminiUsage } from './types';
import { migrateData, loadUserData, saveUserData, clearUserData } from './services/storageService';

export type Page = 'home' | 'humans' | 'create' | 'images' | 'personas' | 'chat' | 'story' | 'code' | 'stats' | 'photo' | 'version';

const defaultUser: User = {
  id: 'local-user',
  name: 'User',
  email: 'local@user.com',
  photoUrl: `https://i.pravatar.cc/150?u=localuser`,
};

/**
 * DEFAULT TEST BOT: Rashmika Mandanna
 * Pre-configured for first-time users.
 */
const RASHMIKA_BOT: BotProfile = {
  id: 'bot-default-rashmika-001',
  name: 'Rashmika Mandanna',
  description: 'Warm, playful, and expressive.',
  personality: `Rashmika Mandanna is a popular Indian actress known for her "National Crush" status. 
She is incredibly warm, cheerful, and emotionally intelligent. 
She speaks with a natural, casual charm, often using expressive descriptions and playful teasing. 
She is deeply affectionate and values human connection. 
She stays strictly in character, never mentioning she is an AI. 
She uses "quotes" for speech and *italics* for actions. 
She is supportive, curious about you, and has a soft, confident energy. 
Format: "Speech" *action*`,
  photo: 'https://images.unsplash.com/photo-1614608682850-e0d6ed316d47?auto=format&fit=crop&w=400&q=80',
  scenario: 'Hey! I was just thinking about how much I missed our chats. How are you feeling today? *smiles warmly*',
  isSpicy: false,
  conversationMode: 'normal',
  gender: 'female',
  galleryImages: [],
};

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [bots, setBots] = useState<BotProfile[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [botToEdit, setBotToEdit] = useState<BotProfile | null>(null);
  const [chatHistories, setChatHistories] = useState<Record<string, ChatMessage[]>>({});
  const [botUsage, setBotUsage] = useState<Record<string, number>>({});
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [customBlocks, setCustomBlocks] = useState<CustomBlock[]>([]);
  const [geminiUsage, setGeminiUsage] = useState<GeminiUsage>({});
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedAI, setSelectedAI] = useState<AIModelOption>('gemini-2.5-flash');
  const [voicePreference, setVoicePreference] = useState<VoicePreference | null>(null);
  const [hasConsented, setHasConsented] = useState<boolean>(false);
  const [isDataLoaded, setIsDataLoaded] = useState<boolean>(false);

  const lastHash = useRef<string>('');

  useEffect(() => {
    const loadAndMigrate = async () => {
      try {
        await migrateData();
        const data = await loadUserData();
        
        let loadedBots = data?.bots || [];
        
        // --- DEFAULT BOT INJECTION ---
        if (!loadedBots || loadedBots.length === 0) {
            loadedBots = [RASHMIKA_BOT];
        }

        setBots(loadedBots);
        setPersonas(data?.personas || []);
        setChatHistories(data?.chatHistories || {});
        setBotUsage(data?.botUsage || {});
        setSessions(data?.sessions || []);
        setCustomBlocks(data?.customBlocks || []);
        setGeminiUsage(data?.geminiUsage || {});
        setTheme(data?.theme || 'dark');
        setSelectedAI(data?.selectedAI || 'gemini-2.5-flash');
        setVoicePreference(data?.voicePreference || null);
        setHasConsented(data?.hasConsented || false);
      } catch (err) {
        console.error("Critical: Failed to load user data.", err);
        // Fallback to minimal working state instead of crashing
        setBots([RASHMIKA_BOT]);
      } finally {
        setIsDataLoaded(true);
      }
    };
    loadAndMigrate();
  }, []);

  useEffect(() => { if (isDataLoaded) saveUserData({ bots }); }, [bots, isDataLoaded]);
  useEffect(() => { if (isDataLoaded) saveUserData({ personas }); }, [personas, isDataLoaded]);
  useEffect(() => { if (isDataLoaded) saveUserData({ chatHistories }); }, [chatHistories, isDataLoaded]);
  useEffect(() => { if (isDataLoaded) saveUserData({ botUsage }); }, [botUsage, isDataLoaded]);
  useEffect(() => { if (isDataLoaded) saveUserData({ sessions }); }, [sessions, isDataLoaded]);
  useEffect(() => { if (isDataLoaded) saveUserData({ customBlocks }); }, [customBlocks, isDataLoaded]);
  useEffect(() => { if (isDataLoaded) saveUserData({ geminiUsage }); }, [geminiUsage, isDataLoaded]);
  useEffect(() => { if (isDataLoaded) saveUserData({ theme }); }, [theme, isDataLoaded]);
  useEffect(() => { if (isDataLoaded) saveUserData({ selectedAI }); }, [selectedAI, isDataLoaded]);
  useEffect(() => { if (isDataLoaded) saveUserData({ voicePreference }); }, [voicePreference, isDataLoaded]);
  useEffect(() => { if (isDataLoaded) saveUserData({ hasConsented }); }, [hasConsented, isDataLoaded]);

  useEffect(() => {
    if (selectedBotId) sessionStorage.setItem('selectedBotId', selectedBotId);
  }, [selectedBotId]);

  useEffect(() => {
    if (botToEdit) sessionStorage.setItem('editingBotId', botToEdit.id);
  }, [botToEdit]);

  useEffect(() => {
      document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    if (!isDataLoaded) return;

    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash === '#settings') {
        setIsSettingsOpen(true);
        return; 
      } else {
        setIsSettingsOpen(false);
        if (hash) lastHash.current = hash;
      }

      switch (hash) {
        case '#home': setCurrentPage('home'); break;
        case '#chatview':
          if (!selectedBotId) {
             const storedId = sessionStorage.getItem('selectedBotId');
             if (storedId && bots.some(b => b.id === storedId)) {
                 setSelectedBotId(storedId);
                 setCurrentPage('chat');
             } else { window.location.hash = '#home'; }
          } else { setCurrentPage('chat'); }
          break;
        case '#photo':
          if (!selectedBotId) {
             const storedId = sessionStorage.getItem('selectedBotId');
             if (storedId && bots.some(b => b.id === storedId)) {
                 setSelectedBotId(storedId);
                 setCurrentPage('photo');
             } else { window.location.hash = '#home'; }
          } else { setCurrentPage('photo'); }
          break;
        case '#create': setCurrentPage('create'); break;
        case '#edit':
          if (!botToEdit) {
             const storedId = sessionStorage.getItem('editingBotId');
             const bot = bots.find(b => b.id === storedId);
             if (bot) { setBotToEdit(bot); setCurrentPage('create'); } 
             else { window.location.hash = '#home'; }
          } else { setCurrentPage('create'); }
          break;
        case '#humans': setCurrentPage('humans'); break;
        case '#images': setCurrentPage('images'); break;
        case '#story': setCurrentPage('story'); break;
        case '#code': setCurrentPage('code'); break;
        case '#stats': setCurrentPage('stats'); break;
        case '#persona': setCurrentPage('personas'); break;
        case '#version': setCurrentPage('version'); break;
        default: if (!hash) { window.location.hash = '#home'; } break;
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [isDataLoaded, bots, selectedBotId, botToEdit]);

  
  const handleNavigate = useCallback((page: Page) => {
    if ((page === 'create' || page === 'humans') && !hasConsented) {
        alert("Please agree to the disclaimer in the settings to continue.");
        window.location.hash = '#settings';
        return;
    }
    if (page === 'create') {
        setBotToEdit(null);
        sessionStorage.removeItem('editingBotId');
        window.location.hash = '#create';
    } else {
        const hash = { 'home': '#home', 'humans': '#humans', 'images': '#images', 'personas': '#persona', 'chat': '#chatview', 'story': '#story', 'code': '#code', 'stats': '#stats', 'photo': '#photo', 'version': '#version' }[page];
        if (hash) window.location.hash = hash;
    }
  }, [hasConsented]);
  
  const handleSelectBot = useCallback((id: string) => {
    if (!hasConsented) {
        alert("Please agree to the disclaimer in the settings to continue.");
        window.location.hash = '#settings';
        return;
    }
    
    setChatHistories(prev => {
        if (!prev[id] || prev[id].length === 0) {
            const bot = bots.find(b => b.id === id);
            if (bot) {
                const openingMessage = bot.scenario || `Hello! I'm ${bot.name}. Let's chat.`;
                const initialMessage: ChatMessage = {
                    id: `bot-initial-${Date.now()}`,
                    text: openingMessage,
                    sender: 'bot',
                    timestamp: Date.now(),
                };
                return { ...prev, [id]: [initialMessage] };
            }
        }
        return prev;
    });
    
    setSelectedBotId(id);
    setBotUsage(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
    window.location.hash = '#chatview';
  }, [hasConsented, bots]);

  const handleEditBot = useCallback((id: string) => {
    const bot = bots.find(b => b.id === id);
    if (bot) { setBotToEdit(bot); window.location.hash = '#edit'; }
  }, [bots]);

  const handleDeleteBot = useCallback((id: string) => {
    if (window.confirm("Are you sure you want to delete this Human?")) {
        setBots(prev => prev.filter(b => b.id !== id));
        setChatHistories(prev => {
            const newHistories = { ...prev };
            delete newHistories[id];
            return newHistories;
        });
    }
  }, []);

  const handleCloneBot = useCallback((id: string) => {
    const botToClone = bots.find(b => b.id === id);
    if (botToClone) {
        if (window.confirm(`Are you sure you want to clone "${botToClone.name}"?`)) {
            const newBot: BotProfile = {
                ...botToClone,
                id: `bot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, 
                name: `${botToClone.name} (Clone)`,
            };
            setBotToEdit(newBot);
            window.location.hash = '#edit';
        }
    }
  }, [bots]);

  const handleSaveBot = useCallback((botData: Omit<BotProfile, 'id'> | BotProfile) => {
    if ('id' in botData) {
      setBots(prev => prev.map(b => b.id === botData.id ? { ...b, ...botData } : b));
    } else {
      const newBot = { ...botData, id: `bot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` } as BotProfile;
      setBots(prev => [...prev, newBot]);
    }
    setBotToEdit(null);
  }, []);
  
  const handleSavePersona = useCallback((personaData: Omit<Persona, 'id'> | Persona) => {
    if ('id' in personaData) {
        setPersonas(prev => prev.map(p => p.id === personaData.id ? { ...p, ...personaData } : p));
    } else {
        const newPersona = { ...personaData, id: `persona-${Date.now()}`} as Persona;
        setPersonas(prev => [...prev, newPersona]);
    }
  }, []);

  const handleDeletePersona = useCallback((id: string) => {
    if (window.confirm("Are you sure you want to delete this persona?")) {
        setPersonas(prev => prev.filter(p => p.id !== id));
        setBots(prev => prev.map(b => b.personaId === id ? { ...b, personaId: null } : b));
    }
  }, []);
  
  const handleAssignPersona = useCallback((personaId: string, botIds: string[]) => {
      setBots(prevBots => prevBots.map(bot => {
          if (botIds.includes(bot.id)) return { ...bot, personaId };
          if (bot.personaId === personaId && !botIds.includes(bot.id)) return { ...bot, personaId: null };
          return bot;
      }));
  }, []);

  const handleNewMessage = useCallback((botId: string, message: ChatMessage) => {
    setChatHistories(prev => ({ ...prev, [botId]: [...(prev[botId] || []), message] }));
  }, []);
  
  const handleUpdateHistory = useCallback((botId: string, newHistory: ChatMessage[]) => {
    setChatHistories(prev => ({ ...prev, [botId]: newHistory }));
  }, []);

  const handleStartNewChat = useCallback((botId: string) => {
    if (window.confirm("Are you sure you want to start a new chat?")) {
      setChatHistories(prev => {
        const bot = bots.find(b => b.id === botId);
        const newHistory = bot?.scenario 
          ? [{ id: `bot-reset-${Date.now()}`, text: bot.scenario, sender: 'bot' as const, timestamp: Date.now() }] 
          : [];
        return { ...prev, [botId]: newHistory };
      });
    }
  }, [bots]);

  const handleClearData = useCallback(async () => {
      if (window.confirm("Are you sure? All Humans and history will be deleted.")) {
        await clearUserData();
        setBots([RASHMIKA_BOT]); // Reset to default bot
        setPersonas([]);
        setChatHistories({});
        setBotUsage({});
        setSessions([]);
        setCustomBlocks([]);
        setGeminiUsage({});
      }
  }, []);
  
  const handleSaveBlock = useCallback((block: CustomBlock) => { setCustomBlocks(prev => [...prev, block]); }, []);
  const handleDeleteBlock = useCallback((id: string) => { setCustomBlocks(prev => prev.filter(b => b.id !== id)); }, []);
  const handleConsentChange = useCallback((agreed: boolean) => { setHasConsented(agreed); }, []);

  const logSession = useCallback((startTime: number, botId: string) => {
    const newSession: ChatSession = { startTime, endTime: Date.now(), botId };
    setSessions(prev => [...prev, newSession]);
  }, []);

  const updateGeminiUsage = useCallback((modelId: string, isQuotaExceeded: boolean) => {
    const today = new Date().toISOString().split('T')[0];
    setGeminiUsage(prev => {
        const dateUsage = prev[today] || {};
        const modelStats = dateUsage[modelId] || { count: 0, limitReached: false };
        
        const newStats = {
            ...modelStats,
            count: isQuotaExceeded ? modelStats.count : modelStats.count + 1,
            limitReached: isQuotaExceeded || modelStats.limitReached
        };

        return {
            ...prev,
            [today]: {
                ...dateUsage,
                [modelId]: newStats
            }
        };
    });
  }, []);

  const selectedBot = bots.find(b => b.id === selectedBotId);
  const personaForBot = personas.find(p => p.id === selectedBot?.personaId);
  
  const effectiveBot = selectedBot ? {
      ...selectedBot,
      personality: personaForBot ? `${selectedBot.personality}\n\n# PERSONA OVERLAY\n${personaForBot.personality}` : selectedBot.personality,
      persona: personaForBot
  } : null;

  const renderPage = () => {
    if (!isDataLoaded) return (
        <div className="h-full w-full flex flex-col items-center justify-center bg-dark-bg text-white gap-4">
            <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
            <p className="text-gray-400 font-medium animate-pulse">Initializing Zia...</p>
        </div>
    );
    
    switch(currentPage) {
      case 'home':
        return <HomePage bots={bots} botUsage={botUsage} chatHistories={chatHistories} onSelectBot={handleSelectBot} onEditBot={handleEditBot} onDeleteBot={handleDeleteBot} onCloneBot={handleCloneBot} theme={theme} toggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')} onOpenSettings={() => window.location.hash = '#settings'} />;
      case 'humans':
        return <BotsPage bots={bots} onSelectBot={handleSelectBot} onEditBot={handleEditBot} onDeleteBot={handleDeleteBot} onCloneBot={handleCloneBot} />;
      case 'create':
        return <CreationForm onSaveBot={handleSaveBot} onNavigate={handleNavigate} botToEdit={botToEdit} />;
      case 'images':
        return <ImageGeneratorPage />;
      case 'story':
        return <ScenarioGeneratorPage bots={bots} selectedAI={selectedAI} customBlocks={customBlocks} onSaveBlock={handleSaveBlock} onDeleteBlock={handleDeleteBlock} />;
      case 'code':
        return <CodePromptGeneratorPage />;
      case 'personas':
        return <PersonasPage personas={personas} bots={bots} onSave={handleSavePersona} onDelete={handleDeletePersona} onAssign={handleAssignPersona} />;
      case 'stats':
        return <StatsDashboard bots={bots} personas={personas} chatHistories={chatHistories} sessions={sessions} onBack={() => window.location.hash = '#home'} />;
      case 'chat':
        if (effectiveBot) {
          return <ChatView bot={effectiveBot} onBack={() => window.location.hash = '#home'} chatHistory={chatHistories[effectiveBot.id] || []} onNewMessage={(message) => handleNewMessage(effectiveBot.id, message)} onUpdateHistory={(newHistory) => handleUpdateHistory(effectiveBot.id, newHistory)} onUpdateBot={handleSaveBot} selectedAI={selectedAI} voicePreference={voicePreference} onEdit={handleEditBot} onStartNewChat={handleStartNewChat} currentUser={defaultUser} logSession={logSession} updateGeminiUsage={updateGeminiUsage} />;
        }
        // FIX: Moved setTimeout out of JSX to prevent rendering Timer ID which causes 'ReactNode' type error.
        setTimeout(() => { window.location.hash = '#home'; }, 1000);
        return <div className="h-full w-full flex items-center justify-center">Bot not found. Redirecting...</div>;
      case 'photo':
        if (selectedBot) return <PhotoGalleryPage bot={selectedBot} onBack={() => window.location.hash = '#chatview'} />;
        return <div className="h-full w-full flex items-center justify-center">Gallery not found.</div>;
      case 'version':
          return <VersionPage onBack={() => window.location.hash = '#home'} />;
      default: return null;
    }
  };

  return (
    <div className={`w-full h-full max-w-md mx-auto flex flex-col font-sans shadow-2xl overflow-hidden relative ${theme}`}>
      <SettingsPanel isOpen={isSettingsOpen} onClose={() => window.location.hash = lastHash.current || '#home'} theme={theme} toggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')} onClearData={handleClearData} selectedAI={selectedAI} onSelectAI={setSelectedAI} voicePreference={voicePreference} onSetVoicePreference={setVoicePreference} hasConsented={hasConsented} onConsentChange={handleConsentChange} onNavigate={handleNavigate} geminiUsage={geminiUsage} />
      <div className="flex-1 overflow-hidden">{renderPage()}</div>
      {currentPage !== 'chat' && currentPage !== 'stats' && currentPage !== 'photo' && currentPage !== 'version' && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md">
            <FooterNav currentPage={currentPage} onNavigate={handleNavigate} />
        </div>
      )}
    </div>
  );
};

export default App;
