import React, { useState } from 'react';
import { Menu } from 'lucide-react';
import { Sidebar } from '@/components/layout/Sidebar';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-[#F7F3ED] text-[#51494A]">
      {/* Desktop persistent left sidebar */}
      <div className="hidden lg:sticky lg:top-0 lg:block lg:h-screen lg:shrink-0">
        <Sidebar />
      </div>

      {/* Mobile slide-over drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true">
          <div
            className="fixed inset-0 bg-[#30282A]/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-10 h-full">
            <Sidebar
              showCloseButton
              onClose={() => setMobileOpen(false)}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Compact mobile top bar */}
        <div className="sticky top-0 z-30 flex items-center justify-between border-b border-[#E5DCD3] bg-[#F7F3ED]/95 px-4 py-2.5 backdrop-blur-xs lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation menu"
            className="inline-flex items-center gap-2 rounded-lg border border-[#E5DCD3] bg-[#FFFCF8] px-3 py-1.5 text-sm font-medium text-[#30282A]"
          >
            <Menu className="h-4 w-4" />
            <span>Menu</span>
          </button>
          <span className="font-serif-display text-lg text-[#30282A]">MiniCert</span>
          <div className="w-16" aria-hidden="true" />
        </div>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-8 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
