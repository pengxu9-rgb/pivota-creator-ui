'use client';

import { useEffect, useRef, useState } from 'react';

interface Tab {
  id: string;
  label: string;
}

export function StickyTabNav({
  tabs,
  activeTab,
  onTabChange,
  onVisibilityChange,
  topOffset = 0,
}: {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  onVisibilityChange?: (visible: boolean) => void;
  topOffset?: number;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const lastVisibleRef = useRef(false);

  useEffect(() => {
    const updateVisibility = () => {
      if (typeof window === 'undefined') return;
      const nextVisible = window.scrollY >= window.innerHeight;
      if (nextVisible === lastVisibleRef.current) return;
      lastVisibleRef.current = nextVisible;
      setIsVisible(nextVisible);
      onVisibilityChange?.(nextVisible);
    };

    updateVisibility();
    window.addEventListener('scroll', updateVisibility, { passive: true });
    window.addEventListener('resize', updateVisibility);
    return () => {
      window.removeEventListener('scroll', updateVisibility);
      window.removeEventListener('resize', updateVisibility);
    };
  }, [onVisibilityChange]);

  const topStyle = {
    top: `calc(env(safe-area-inset-top, 0px) + ${topOffset}px)`,
  };

  return isVisible ? (
    <nav className="fixed left-0 right-0 z-40 bg-card/95 backdrop-blur-sm border-b border-border shadow-sm" style={topStyle}>
      <div className="max-w-md mx-auto flex">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`relative flex-1 py-2.5 text-xs font-medium transition-colors ${
              activeTab === tab.id ? 'text-primary' : 'text-muted-foreground'
            }`}
            aria-current={activeTab === tab.id ? 'page' : undefined}
          >
            {tab.label}
            {activeTab === tab.id ? (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-10 bg-primary rounded-full" />
            ) : null}
          </button>
        ))}
      </div>
    </nav>
  ) : null;
}

