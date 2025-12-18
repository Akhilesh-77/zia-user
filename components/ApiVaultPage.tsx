
import React, { useState } from 'react';
import type { ApiKeyEntry } from '../types';

interface ApiVaultPageProps {
    apiKeys: ApiKeyEntry[];
    onSaveKey: (key: ApiKeyEntry) => void;
    onDeleteKey: (id: string) => void;
}

const ApiVaultPage: React.FC<ApiVaultPageProps> = ({ apiKeys, onSaveKey, onDeleteKey }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingKey, setEditingKey] = useState<ApiKeyEntry | null>(null);
    const [name, setName] = useState('');
    const [key, setKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [copyId, setCopyId] = useState<string | null>(null);

    const handleOpenModal = (entry?: ApiKeyEntry) => {
        if (entry) {
            setEditingKey(entry);
            setName(entry.name);
            setKey(entry.key);
        } else {
            setEditingKey(null);
            setName('');
            setKey('');
        }
        setShowKey(false);
        setIsModalOpen(true);
    };

    const handleSave = () => {
        if (!name.trim() || !key.trim()) return;
        const entry: ApiKeyEntry = {
            id: editingKey?.id || `key-${Date.now()}`,
            name: name.trim(),
            key: key.trim(),
            isActive: editingKey?.isActive ?? true,
            isExhausted: editingKey?.isExhausted ?? false
        };
        onSaveKey(entry);
        setIsModalOpen(false);
    };

    const toggleStatus = (entry: ApiKeyEntry) => {
        onSaveKey({ ...entry, isActive: !entry.isActive });
    };

    const toggleExhausted = (entry: ApiKeyEntry) => {
        onSaveKey({ ...entry, isExhausted: !entry.isExhausted });
    };

    const handleCopy = (text: string, id: string) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopyId(id);
            setTimeout(() => setCopyId(null), 2000);
        });
    };

    const inputClass = "w-full bg-white/10 dark:bg-black/20 p-3 rounded-xl border border-white/20 dark:border-black/20 focus:outline-none focus:ring-2 focus:ring-accent transition-all duration-300";

    return (
        <div className="h-full w-full flex flex-col p-4 bg-light-bg text-light-text dark:bg-dark-bg dark:text-dark-text overflow-hidden">
            <header className="flex items-center justify-between mb-6 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <img src="https://i.postimg.cc/qRB2Gnw2/Gemini-Generated-Image-vfkohrvfkohrvfko-1.png" alt="Zia.ai Logo" className="h-8 w-8"/>
                    <h1 className="text-3xl font-bold">API Vault 🛡️</h1>
                </div>
                
                <div className="flex items-center gap-2">
                    {/* Google AI Studio Link Button */}
                    <a 
                        href="https://aistudio.google.com/api-keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-3 bg-white/5 dark:bg-black/10 text-gray-400 rounded-full hover:bg-accent/10 hover:text-accent transition-all"
                        aria-label="Google AI Studio API Keys"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                    </a>

                    {/* Vercel Env Vars Link Button */}
                    <a 
                        href="https://vercel.com/akhileshs-projects-f1431210/zia-pro-akhilesh277u/settings/environment-variables"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-3 bg-white/5 dark:bg-black/10 text-gray-400 rounded-full hover:bg-accent/10 hover:text-accent transition-all"
                        aria-label="Manage Environment Variables"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                    </a>

                    {/* Add Button */}
                    <button 
                        onClick={() => handleOpenModal()} 
                        className="p-3 bg-accent text-white rounded-full shadow-lg hover:scale-105 transition-transform"
                        aria-label="Add API Key"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    </button>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto pb-24 space-y-3 no-scrollbar">
                {apiKeys.length > 0 ? (
                    apiKeys.map(entry => (
                        <div 
                            key={entry.id} 
                            className={`p-4 rounded-2xl border transition-all duration-300 ${entry.isExhausted ? 'bg-red-900/10 border-red-500/30' : 'bg-white/5 dark:bg-black/20 border-white/5'}`}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3 truncate">
                                    <div className={`h-3 w-3 rounded-full flex-shrink-0 ${entry.isActive ? 'bg-green-500' : 'bg-gray-500'}`} />
                                    <h3 className="font-bold text-base truncate">{entry.name}</h3>
                                    {entry.isExhausted && <span className="text-[10px] uppercase font-bold text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full">Exhausted</span>}
                                </div>
                                <div className="flex gap-1">
                                    <button onClick={() => handleOpenModal(entry)} className="p-2 text-gray-400 hover:text-accent rounded-lg" title="Edit">
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z"/></svg>
                                    </button>
                                    <button onClick={() => handleCopy(entry.key, entry.id)} className={`p-2 rounded-lg transition-colors ${copyId === entry.id ? 'text-green-500' : 'text-gray-400 hover:text-white'}`} title="Copy Key">
                                        {copyId === entry.id ? (
                                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                        ) : (
                                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2"/></svg>
                                        )}
                                    </button>
                                    <button onClick={() => onDeleteKey(entry.id)} className="p-2 text-gray-400 hover:text-red-500 rounded-lg" title="Delete">
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                    </button>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="flex-1 bg-black/20 p-2 rounded-lg text-xs font-mono text-gray-500 flex items-center justify-between">
                                    <span>{entry.key.substring(0, 4)}••••••••••{entry.key.substring(entry.key.length - 4)}</span>
                                </div>
                                <div className="flex gap-3">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            checked={entry.isActive} 
                                            onChange={() => toggleStatus(entry)}
                                            className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-accent focus:ring-accent"
                                        />
                                        <span className="text-[10px] font-bold text-gray-500 uppercase">Active</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            checked={entry.isExhausted} 
                                            onChange={() => toggleExhausted(entry)}
                                            className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-red-500 focus:ring-red-500"
                                        />
                                        <span className="text-[10px] font-bold text-gray-500 uppercase">Exhausted</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-500 text-center px-6">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                        <p className="text-lg font-medium">Vault is Empty</p>
                        <p className="text-sm">Store your private API keys here for easy access. All data stays local in your browser.</p>
                    </div>
                )}
            </main>

            {isModalOpen && (
                <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 animate-fadeIn" onClick={() => setIsModalOpen(false)}>
                    <div className="bg-dark-bg w-full max-w-sm rounded-3xl p-6 border border-white/10 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A3.323 3.323 0 0010.605 2.02a3.323 3.323 0 00-4.589 4.589 3.323 3.323 0 00-4.016 5.618 3.323 3.323 0 004.016 5.618 3.323 3.323 0 004.589 4.589 3.323 3.323 0 005.618-4.016 3.323 3.323 0 004.016-5.618 3.323 3.323 0 00-4.016-5.618z" /></svg>
                            {editingKey ? 'Edit Key' : 'Add Key to Vault'}
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-1 ml-1 uppercase">API Name</label>
                                <input 
                                    type="text" 
                                    value={name} 
                                    onChange={e => setName(e.target.value)} 
                                    placeholder="e.g. Gemini Primary" 
                                    className={inputClass}
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-1 ml-1 uppercase">API Key</label>
                                <div className="relative">
                                    <input 
                                        type={showKey ? "text" : "password"} 
                                        value={key} 
                                        onChange={e => setKey(e.target.value)} 
                                        placeholder="Paste your key here..." 
                                        className={`${inputClass} pr-12`}
                                    />
                                    <button 
                                        onClick={() => setShowKey(!showKey)} 
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                                    >
                                        {showKey ? (
                                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.754-9.474-6.633A9.953 9.953 0 0112 5c4.478 0 8.268 2.754 9.474 6.633a9.959 9.959 0 01-1.1 3.125m-4.5 4.5L21 21m-6-6l-2-2m-9-9l18 18"/></svg>
                                        ) : (
                                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2 mt-8">
                            <button onClick={() => setIsModalOpen(false)} className="flex-1 py-3 bg-white/5 rounded-xl font-bold hover:bg-white/10 transition-colors">Cancel</button>
                            <button onClick={handleSave} className="flex-1 py-3 bg-accent rounded-xl font-bold text-white shadow-lg hover:shadow-accent/20 transition-all">Save Key</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ApiVaultPage;
