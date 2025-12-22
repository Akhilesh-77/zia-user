
import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { BotProfile } from '../types';

interface PhotoGalleryPageProps {
    bot: BotProfile;
    onBack: () => void;
}

const GalleryItem: React.FC<{ src: string }> = ({ src }) => {
    const [scale, setScale] = useState(1);
    const [translate, setTranslate] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);

    const gesture = useRef({
        startX: 0,
        startY: 0,
        startDist: 0,
        startScale: 1,
        initialTranslateX: 0,
        initialTranslateY: 0,
        pointers: new Map<number, { x: number, y: number }>(),
    });

    const getDistance = (p1: { x: number, y: number }, p2: { x: number, y: number }) => {
        return Math.hypot(p1.x - p2.x, p1.y - p2.y);
    };

    const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
        try {
            const points: { id: number, x: number, y: number }[] = [];
            if ('touches' in e) {
                for (let i = 0; i < e.touches.length; i++) {
                    points.push({ id: e.touches[i].identifier, x: e.touches[i].clientX, y: e.touches[i].clientY });
                }
            } else {
                points.push({ id: 999, x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY });
            }

            points.forEach(p => gesture.current.pointers.set(p.id, p));
            setIsDragging(true);

            if (gesture.current.pointers.size === 2) {
                const pArr: { x: number, y: number }[] = Array.from(gesture.current.pointers.values());
                gesture.current.startDist = getDistance(pArr[0], pArr[1]);
                gesture.current.startScale = scale;
            } else if (gesture.current.pointers.size === 1) {
                const p = points[0];
                gesture.current.startX = p.x;
                gesture.current.startY = p.y;
                gesture.current.initialTranslateX = translate.x;
                gesture.current.initialTranslateY = translate.y;
            }
        } catch (err) { console.error(err); }
    };

    const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
        try {
            const points: { id: number, x: number, y: number }[] = [];
            if ('touches' in e) {
                for (let i = 0; i < e.touches.length; i++) {
                    points.push({ id: e.touches[i].identifier, x: e.touches[i].clientX, y: e.touches[i].clientY });
                }
            } else {
                if (!isDragging) return;
                points.push({ id: 999, x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY });
            }

            points.forEach(p => gesture.current.pointers.set(p.id, p));
            const pArr: { x: number, y: number }[] = Array.from(gesture.current.pointers.values());

            if (pArr.length === 2) {
                const dist = getDistance(pArr[0], pArr[1]);
                if (gesture.current.startDist > 0) {
                    const newScale = Math.max(1, Math.min(gesture.current.startScale * (dist / gesture.current.startDist), 5));
                    setScale(newScale);
                }
            } else if (pArr.length === 1 && scale > 1) {
                const dx = pArr[0].x - gesture.current.startX;
                const dy = pArr[0].y - gesture.current.startY;
                setTranslate({
                    x: gesture.current.initialTranslateX + dx,
                    y: gesture.current.initialTranslateY + dy
                });
            }
        } catch (err) { console.error(err); }
    };

    const handleTouchEnd = (e: React.TouchEvent | React.MouseEvent) => {
        setIsDragging(false);
        gesture.current.pointers.clear();
        if (scale < 1) {
            setScale(1);
            setTranslate({ x: 0, y: 0 });
        }
    };

    return (
        <div 
            className="flex-shrink-0 w-full h-full flex items-center justify-center overflow-hidden snap-center"
            style={{ touchAction: scale > 1 ? 'none' : 'pan-x' }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleTouchStart}
            onMouseMove={handleTouchMove}
            onMouseUp={handleTouchEnd}
            onMouseLeave={handleTouchEnd}
        >
             <img 
                src={src} 
                alt="Gallery"
                className="w-full h-full object-contain select-none pointer-events-none will-change-transform"
                draggable={false}
                style={{
                    transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
                    transition: isDragging ? 'none' : 'transform 0.2s ease-out'
                }}
            />
        </div>
    )
}

const VideoGalleryItem: React.FC<{ src: string }> = ({ src }) => {
    return (
        <div className="flex-shrink-0 w-full h-full flex items-center justify-center overflow-hidden snap-center">
            <video 
                src={src} 
                controls 
                className="w-full h-full max-h-full object-contain"
                playsInline
            />
        </div>
    );
};

const PhotoGalleryPage: React.FC<PhotoGalleryPageProps> = ({ bot, onBack }) => {
    const images = React.useMemo(() => {
        const source = (bot.originalGalleryImages && bot.originalGalleryImages.length > 0)
            ? bot.originalGalleryImages
            : (bot.galleryImages || []);
        return source.filter(src => typeof src === 'string' && src.length > 10);
    }, [bot]);

    const videos = React.useMemo(() => {
        const source = (bot.originalGalleryVideos && bot.originalGalleryVideos.length > 0)
            ? bot.originalGalleryVideos
            : (bot.galleryVideos || []);
        return source.filter(src => typeof src === 'string' && src.length > 10);
    }, [bot]);

    const [activeTab, setActiveTab] = useState<'photos' | 'videos'>(() => {
        return (sessionStorage.getItem('gallery_tab') as any) || 'photos';
    });
    const [isMounted, setIsMounted] = useState(false);
    const [isExiting, setIsExiting] = useState(false);

    useEffect(() => {
        requestAnimationFrame(() => setIsMounted(true));
    }, []);

    const handleClose = useCallback(() => {
        setIsExiting(true);
        setTimeout(onBack, 300);
    }, [onBack]);

    const tabCount = activeTab === 'photos' ? images.length : videos.length;

    return (
        <div className={`fixed inset-0 z-[60] bg-black flex flex-col items-center justify-center transition-opacity duration-300 ${isMounted && !isExiting ? 'opacity-100' : 'opacity-0'}`}>
            
            {/* TOP NAVIGATION */}
            <header className="absolute top-0 inset-x-0 z-[70] p-6 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent">
                <button 
                    onClick={handleClose}
                    className="p-3 rounded-full bg-white/10 text-white backdrop-blur-md hover:bg-white/20 transition-all shadow-lg active:scale-95"
                    aria-label="Close"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                </button>

                <div className="flex bg-white/10 backdrop-blur-md rounded-full p-1 border border-white/5">
                    <button 
                        onClick={() => setActiveTab('photos')}
                        className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${activeTab === 'photos' ? 'bg-accent text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                    >
                        Photos ({images.length})
                    </button>
                    <button 
                        onClick={() => setActiveTab('videos')}
                        className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${activeTab === 'videos' ? 'bg-accent text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                    >
                        Videos ({videos.length})
                    </button>
                </div>

                <div className="w-12 h-12" /> {/* Spacer */}
            </header>

            {/* GALLERY CONTENT */}
            <main className="w-full h-full flex flex-col overflow-hidden pt-20">
                {tabCount > 0 ? (
                    <div className="w-full h-full flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory no-scrollbar touch-pan-x">
                        {activeTab === 'photos' ? (
                            images.map((src, index) => <GalleryItem key={`photo-${index}`} src={src} />)
                        ) : (
                            videos.map((src, index) => <VideoGalleryItem key={`video-${index}`} src={src} />)
                        )}
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-4 animate-fadeIn">
                        <div className="p-8 rounded-full bg-white/5 backdrop-blur-sm border border-white/10 mb-2">
                            {activeTab === 'photos' ? (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                            )}
                        </div>
                        <div>
                            <h3 className="text-2xl font-bold text-white uppercase tracking-tight">No {activeTab} yet</h3>
                            <p className="text-gray-400 mt-2 max-w-xs mx-auto text-sm">Create a Human with high quality media to see them here in full detail.</p>
                        </div>
                    </div>
                )}
            </main>

            {/* PAGE INDICATOR (If media exists) */}
            {tabCount > 1 && (
                <div className="absolute bottom-8 z-[70] flex gap-2 pointer-events-none opacity-50">
                    <span className="text-white text-xs font-mono">Swipe to browse</span>
                </div>
            )}
        </div>
    );
};

export default PhotoGalleryPage;
