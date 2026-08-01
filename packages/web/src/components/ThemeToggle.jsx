import React, { useState, useRef, useEffect } from 'react';
import { Waves, Moon, ChevronDown, Check } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export default function ThemeToggle() {
  const { theme, setTheme, themes } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const iconMap = {
    Waves: Waves,
    Moon: Moon
  };

  const currentThemeObj = themes.find(t => t.id === theme) || themes[0];
  const CurrentIcon = iconMap[currentThemeObj.icon] || Waves;

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-2 rounded-xl text-xs font-semibold theme-bg-surface theme-text-main theme-border border flex items-center gap-2 hover:opacity-90 transition-all shadow-sm"
        title="Change Color Theme"
      >
        <CurrentIcon size={15} className="theme-accent-text" />
        <span className="hidden sm:inline">{currentThemeObj.name}</span>
        <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 rounded-2xl theme-bg-surface theme-border border shadow-xl p-1.5 z-50 space-y-1">
          <div className="px-2.5 py-1 text-xs font-bold uppercase tracking-wider theme-text-muted border-b theme-border mb-1">
            Select App Theme
          </div>

          {themes.map((t) => {
            const Icon = iconMap[t.icon] || Waves;
            const isSelected = t.id === theme;

            return (
              <button
                key={t.id}
                onClick={() => {
                  setTheme(t.id);
                  setIsOpen(false);
                }}
                className={`w-full px-2.5 py-2 rounded-xl text-xs font-medium flex items-center justify-between transition-colors ${
                  isSelected
                    ? 'theme-accent-bg-soft theme-accent-text font-bold'
                    : 'theme-text-main hover:theme-bg-muted'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon size={14} className={isSelected ? 'theme-accent-text' : 'theme-text-muted'} />
                  <span>{t.name}</span>
                </div>
                {isSelected && <Check size={14} className="theme-accent-text" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
