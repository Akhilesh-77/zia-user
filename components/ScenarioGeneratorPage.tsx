
import React, { useState, useEffect } from 'react';

interface LocalBlock {
    id: string;
    name: string;
    content: string;
}

const STORAGE_KEY_BLOCKS = 'zia_custom_copy_blocks_v1';

const PromptsPage: React.FC = () => {
    const [localBlocks, setLocalBlocks] = useState<LocalBlock[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
    const [blockName, setBlockName] = useState('');
    const [blockContent, setBlockContent] = useState('');
    const [blockCopyId, setBlockCopyId] = useState<string | null>(null);

    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY_BLOCKS);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) setLocalBlocks(parsed);
            }
        } catch (e) { console.error("Load blocks failed", e); }
    }, []);

    const saveBlocks = (blocks: LocalBlock[]) => {
        try { localStorage.setItem(STORAGE_KEY_BLOCKS, JSON.stringify(blocks)); }
        catch (e) { console.error("Save blocks failed", e); }
    };

    const handleSaveLocalBlock = () => {
        if (!blockName.trim() || !blockContent.trim()) return;
        let updated: LocalBlock[];
        if (editingBlockId) {
            updated = localBlocks.map(b => b.id === editingBlockId ? { ...b, name: blockName, content: blockContent } : b);
        } else {
            const nb: LocalBlock = { id: `blk-${Date.now()}`, name: blockName, content: blockContent };
            updated = [...localBlocks, nb];
        }
        setLocalBlocks(updated); saveBlocks(updated); setIsModalOpen(false);
        setBlockName(''); setBlockContent(''); setEditingBlockId(null);
    };

    const handleDelete = (id: string) => {
        if (window.confirm("Delete this block?")) {
            const updated = localBlocks.filter(b => b.id !== id);
            setLocalBlocks(updated); saveBlocks(updated);
        }
    };

    const handleCopy = (text: string, id: string) => {
        navigator.clipboard.writeText(text).then(() => {
            setBlockCopyId(id);
            setTimeout(() => setBlockCopyId(null), 1500);
        });
    };

    return (
        <div className="h-full w-full flex flex-col p-4 bg-light-bg text-light-text dark:bg-dark-bg dark:text-dark-text overflow-hidden">
            <header className="flex items-center mb-6 gap-2 flex-shrink-0">
                <img src="https://i.postimg.cc/qRB2Gnw2/Gemini-Generated-Image-vfkohrvfkohrvfko-1.png" alt="Zia.ai Logo" className="h-8 w-8"/>
                <h1 className="text-3xl font-bold">Prompts 📝</h1>
            </header>
            
            <div className="mb-4 flex-shrink-0">
                <h2 className="text-xl font-bold">Custom Copy Blocks</h2>
                <p className="text-sm text-gray-500">Reusable text blocks you can edit & copy anytime.</p>
            </div>

            <main className="flex-1 overflow-y-auto pb-24 space-y-3 no-scrollbar">
                <button 
                    onClick={() => { setEditingBlockId(null); setBlockName(''); setBlockContent(''); setIsModalOpen(true); }} 
                    className="w-full py-4 bg-accent/10 border border-dashed border-accent/40 rounded-2xl text-accent font-bold hover:bg-accent/20 transition-all flex items-center justify-center gap-2"
                >
                    + Add Block
                </button>

                {localBlocks.length > 0 ? (
                    localBlocks.map(block => (
                        <div key={block.id} className="bg-white/5 dark:bg-black/20 p-4 rounded-2xl border border-white/5 hover:border-white/10 transition-all">
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="font-bold text-base truncate">{block.name}</h3>
                                <div className="flex gap-1">
                                    <button onClick={() => { setEditingBlockId(block.id); setBlockName(block.name); setBlockContent(block.content); setIsModalOpen(true); }} className="p-2 text-gray-400 hover:text-accent rounded-lg"><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z"/></svg></button>
                                    <button onClick={() => handleCopy(block.content, block.id)} className={`p-2 rounded-lg ${blockCopyId === block.id ? 'text-green-500' : 'text-gray-400 hover:text-white'}`}><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2"/></svg></button>
                                    <button onClick={() => handleDelete(block.id)} className="p-2 text-gray-400 hover:text-red-500 rounded-lg"><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
                                </div>
                            </div>
                            <div className="bg-black/20 p-3 rounded-xl text-sm text-gray-400 font-mono whitespace-pre-wrap max-h-24 overflow-hidden relative">
                                {block.content}
                            </div>
                            {blockCopyId === block.id && <p className="text-[10px] text-green-500 mt-1 font-bold">Copied to clipboard!</p>}
                        </div>
                    ))
                ) : (
                    <div className="text-center py-10 text-gray-500 italic text-sm">No custom blocks yet.</div>
                )}
            </main>

            {isModalOpen && (
                <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 animate-fadeIn" onClick={() => setIsModalOpen(false)}>
                    <div className="bg-dark-bg w-full max-w-sm rounded-3xl p-6 border border-white/10" onClick={e => e.stopPropagation()}>
                        <h3 className="text-xl font-bold mb-4">{editingBlockId ? 'Edit Block' : 'Add New Block'}</h3>
                        <div className="space-y-4">
                            <input type="text" value={blockName} onChange={e => setBlockName(e.target.value)} placeholder="Block Name" className="w-full bg-white/5 rounded-xl p-3 border border-white/10 focus:ring-1 focus:ring-accent outline-none" />
                            <textarea value={blockContent} onChange={e => setBlockContent(e.target.value)} placeholder="Content..." rows={6} className="w-full bg-white/5 rounded-xl p-3 border border-white/10 focus:ring-1 focus:ring-accent outline-none resize-none" />
                        </div>
                        <div className="flex gap-2 mt-6">
                            <button onClick={() => setIsModalOpen(false)} className="flex-1 py-3 bg-white/5 rounded-xl font-bold">Cancel</button>
                            <button onClick={handleSaveLocalBlock} className="flex-1 py-3 bg-accent rounded-xl font-bold text-white">Save</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PromptsPage;
