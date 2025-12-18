
import React from 'react';
import type { Page } from '../App';

interface FooterNavProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

const NavButton: React.FC<{
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
}> = ({ label, icon, isActive, onClick }) => (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center w-full transition-colors duration-200 ${isActive ? 'text-accent' : 'text-gray-400 hover:text-accent'}`}
      aria-label={label}
    >
      {icon}
      <span className="text-[10px] font-medium mt-1 whitespace-nowrap">{label}</span>
    </button>
);

const FooterNav: React.FC<FooterNavProps> = ({ currentPage, onNavigate }) => {
  return (
    <footer className="w-full max-w-md mx-auto h-20 bg-light-bg dark:bg-dark-bg border-t border-white/10 dark:border-black/20 backdrop-blur-sm bg-opacity-80 dark:bg-opacity-80 shadow-t-lg">
      <nav className="flex items-center justify-around h-full px-1">
        <NavButton
          label="Home"
          icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>}
          isActive={currentPage === 'home'}
          onClick={() => onNavigate('home')}
        />
        <NavButton
          label="Humans"
          icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
          isActive={currentPage === 'humans'}
          onClick={() => onNavigate('humans')}
        />
        <NavButton
          label="Create"
          icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          isActive={currentPage === 'create'}
          onClick={() => onNavigate('create')}
        />
        <NavButton
          label="Vault"
          icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>}
          isActive={currentPage === 'vault'}
          onClick={() => onNavigate('vault')}
        />
        <NavButton
          label="Prompts"
          icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2" /></svg>}
          isActive={currentPage === 'story'}
          onClick={() => onNavigate('story')}
        />
        <NavButton
          label="Personas"
          icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
          isActive={currentPage === 'personas'}
          onClick={() => onNavigate('personas')}
        />
      </nav>
    </footer>
  );
};

export default FooterNav;
