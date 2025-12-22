import React, { useState, useRef, useEffect } from 'react';
import type { BotProfile } from '../types';
import { generateDynamicDescription } from '../services/geminiService';

interface BotCardProps {
    bot: BotProfile;
    onChat: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
    onClone?: () => void;
}

const SwipeToChatButton: React.FC<{ botName: string; onSwiped: () => void; }> = ({ botName, onSwiped }) => {
    const trackRef = useRef<HTMLDivElement>(null);
    const thumbRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [startX, setStartX] = useState(0);
    const [thumbX, setThumbX] = useState(0);

    const handleDragStart = (clientX: number) => {
        setIsDragging(true);
        setStartX(clientX);
        if (thumbRef.current) {
            thumbRef.current.style.transition = 'none';
        }
    };

    const handleDragMove = (clientX: number) => {
        if (!isDragging || !trackRef.current) return;
        const trackWidth = trackRef.current.offsetWidth;
        const thumbWidth = thumbRef.current?.offsetWidth || 64;
        const maxTranslate = trackWidth - thumbWidth;
        let newX = clientX - startX;
        newX = Math.max(0, Math.min(newX, maxTranslate));
        setThumbX(newX);
    };

    const handleDragEnd = () => {
        if (!isDragging || !trackRef.current) return;
        setIsDragging(false);
        const trackWidth = trackRef.current.offsetWidth;
        const thumbWidth = thumbRef.current?.offsetWidth || 64;
        const swipeThreshold = trackWidth * 0.7;

        if (thumbX + thumbWidth > swipeThreshold) {
            onSwiped();
        }

        if (thumbRef.current) {
            thumbRef.current.style.transition = 'transform 0.3s ease';
        }
        setThumbX(0);
    };
    
    // Cross-browser Pointer Events (Fix for Edge/AI Studio)
    const onPointerDown = (e: React.PointerEvent) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        handleDragStart(e.clientX);
    };
    const onPointerMove = (e: React.PointerEvent) => { if(isDragging) handleDragMove(e.clientX) };
    const onPointerUp = (e: React.PointerEvent) => {
        if(isDragging) {
            (e.target as HTMLElement).releasePointerCapture(e.pointerId);
            handleDragEnd();
        }
    };

    return (
        <div 
            ref={trackRef}
            className="w-full h-20 bg-black/30 rounded-full flex items-center p-2 relative shadow-lg backdrop-blur-sm mt-4 touch-none"
            style={{ touchAction: 'none' }}
            onClick={(e) => e.stopPropagation()}
        >
            <div 
                ref={thumbRef}
                className="h-16 w-16 bg-accent rounded-full flex items-center justify-center cursor-pointer select-none touch-none"
                style={{ transform: `translateX(${thumbX}px)`, touchAction: 'none' }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
            </div>
            <span className="absolute left-1/2 -translate-x-1/2 text-white/80 select-none pointer-events-none whitespace-nowrap text-lg">Chat with {botName} →</span>
        </div>
    );
};

const BotPreviewModal: React.FC<{ bot: BotProfile, onSwiped: () => void, onClose: () => void }> = ({ bot, onSwiped, onClose }) => {
    const [isClosing, setIsClosing] = useState(false);
    const handleClose = () => {
        setIsClosing(true);
        setTimeout(onClose, 300);
    };

    return (
        <div 
            className={`fixed inset-0 bg-black/80 flex flex-col items-center justify-center z-50 p-4 transition-opacity duration-300 ${isClosing ? 'opacity-0' : 'opacity-100'}`} 
            onClick={handleClose}
        >
            <div 
                className={`w-full max-w-md relative transition-transform duration-300 ${isClosing ? 'scale-95' : 'scale-100'}`}
                onClick={e => e.stopPropagation()}
            >
                <img src={bot.photo} alt={bot.name} className="w-full h-auto max-h-[70vh] object-contain rounded-2xl shadow-2xl" />
                <SwipeToChatButton botName={bot.name} onSwiped={onSwiped} />
            </div>
             <button onClick={handleClose} className="absolute top-5 right-5 bg-black/50 text-white rounded-full h-10 w-10 flex items-center justify-center font-bold text-2xl shadow-lg backdrop-blur-sm">&times;</button>
        </div>
    );
}

const BotCard: React.FC<BotCardProps> = ({ bot, onChat, onEdit, onDelete, onClone }) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [dynamicDesc, setDynamicDesc] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const fetchDescription = async () => {
        if (!bot.personality.trim()) {
            setDynamicDesc(bot.description);
            return;
        }
        const desc = await generateDynamicDescription(bot.personality);
        setDynamicDesc(desc);
    };

    useEffect(() => {
        fetchDescription();
        const interval = setInterval(fetchDescription, 15000);
        return () => clearInterval(interval);
    }, [bot.id, bot.personality]);


    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleCloneClick = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (onClone) onClone();
        setMenuOpen(false);
    };

    const handleDeleteClick = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        // FORCE EXECUTION: Call the functional logic immediately on down-stroke
        // to ensure it is registered before the component can unmount or the container blocks it.
        if (onDelete) onDelete();
        setMenuOpen(false);
    };

    const handleEditClick = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (onEdit) onEdit();
        setMenuOpen(false);
    };

    return (
        <div className="bg-white/5 dark:bg-black/10 rounded-2xl p-4 flex flex-col transition-all duration-300 hover:scale-105 hover:shadow-accent/20 shadow-lg relative">
            {modalVisible && <BotPreviewModal bot={bot} onSwiped={onChat} onClose={() => setModalVisible(false)} />}
            <div className="flex-grow">
                <div className="relative">
                    <img src={bot.photo} alt={bot.name} className="w-full h-40 object-cover rounded-lg mb-4 cursor-pointer" onClick={() => setModalVisible(true)} loading="lazy" />
                </div>
                <h3 className="font-bold text-lg">{bot.name}</h3>
                <p className="text-sm text-gray-400 dark:text-gray-300 flex-1 italic line-clamp-2">
                    "{dynamicDesc || bot.description}"
                </p>
            </div>

            {(onEdit || onDelete || onClone) && (
                <div ref={menuRef} className="absolute top-5 right-5 z-10">
                    <button 
                        onPointerDown={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }} 
                        className="p-1 rounded-full bg-black/30 hover:bg-black/50 text-white transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" /></svg>
                    </button>
                    {menuOpen && (
                        <div className="absolute right-0 mt-2 w-32 bg-gray-800 rounded-lg shadow-xl animate-fadeIn z-20 overflow-hidden border border-white/5">
                            {onEdit && <button onPointerDown={handleEditClick} className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-accent transition-colors">Edit</button>}
                            {onClone && <button onPointerDown={handleCloneClick} className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-accent transition-colors border-t border-white/5">Clone</button>}
                            {onDelete && <button onPointerDown={handleDeleteClick} className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500 hover:text-white transition-colors border-t border-white/5">Delete</button>}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default React.memo(BotCard);