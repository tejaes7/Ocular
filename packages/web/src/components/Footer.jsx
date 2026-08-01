import React, { useState } from 'react';
import Logo from './Logo';
import { Shield, FileText, HelpCircle, Mail, CheckCircle2, X, Code2 } from 'lucide-react';

export default function Footer() {
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [activeModal, setActiveModal] = useState(null);

  const handleSubscribe = (e) => {
    e.preventDefault();
    if (!newsletterEmail.trim()) return;
    setIsSubscribed(true);
    setTimeout(() => {
      setNewsletterEmail('');
      setIsSubscribed(false);
    }, 4000);
  };

  return (
    <footer className="relative z-20 bg-gradient-to-b from-sky-600 via-sky-600 to-sky-700 dark:from-sky-950 dark:via-sky-950 dark:to-slate-950 text-white border-t border-sky-400/30 dark:border-sky-800/60 text-xs transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 relative z-20">
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 pb-10 border-b border-white/20 dark:border-sky-800/60">
          
          {/* Col 1: Brand Info */}
          <div className="lg:col-span-2 space-y-4">
            {/* Clean Logo directly on footer background with white text */}
            <div className="inline-block">
              <Logo size="md" textColor="text-white" />
            </div>
            <p className="text-xs text-white/90 leading-relaxed max-w-sm">
              Ocular is your automated e-commerce price tracking assistant. Get notified when your bookmarked items hit their all-time lowest price.
            </p>
            
            {/* Social Icons */}
            <div className="flex items-center gap-3 pt-1">
              <a
                href="https://github.com"
                target="_blank"
                rel="noreferrer"
                className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 dark:border-sky-800/60 text-white flex items-center justify-center transition-colors"
                aria-label="GitHub"
              >
                <Code2 size={18} />
              </a>
            </div>
          </div>

          {/* Col 2: Legal & Docs */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Resources</h4>
            <ul className="space-y-2 text-white/90">
              <li>
                <button onClick={() => setActiveModal('docs')} className="hover:text-white underline-offset-2 hover:underline transition-colors cursor-pointer">
                  Documentation & API
                </button>
              </li>
              <li>
                <button onClick={() => setActiveModal('privacy')} className="hover:text-white underline-offset-2 hover:underline transition-colors cursor-pointer">
                  Privacy Policy
                </button>
              </li>
              <li>
                <button onClick={() => setActiveModal('terms')} className="hover:text-white underline-offset-2 hover:underline transition-colors cursor-pointer">
                  Terms of Service
                </button>
              </li>
            </ul>
          </div>

          {/* Col 3: Newsletter */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Updates Newsletter</h4>
            <p className="text-xs text-white/90">
              Subscribe for feature updates and price alert digests.
            </p>

            <form onSubmit={handleSubscribe} className="space-y-2">
              <div className="relative">
                <input
                  type="email"
                  required
                  value={newsletterEmail}
                  onChange={(e) => setNewsletterEmail(e.target.value)}
                  placeholder="Enter your email..."
                  className="w-full pl-3 pr-9 py-2.5 bg-white/95 backdrop-blur-md border border-white/30 rounded-xl text-slate-900 placeholder:text-slate-400 text-xs font-medium focus:outline-none"
                />
                <button
                  type="submit"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-sky-800 dark:bg-sky-600 text-white hover:bg-sky-900 transition-colors cursor-pointer"
                >
                  <Mail size={14} />
                </button>
              </div>

              {isSubscribed && (
                <p className="text-[11px] text-white font-semibold flex items-center gap-1">
                  <CheckCircle2 size={13} /> Subscribed to Ocular updates!
                </p>
              )}
            </form>
          </div>

        </div>

        {/* Bottom Copyright Row */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-white/90">
          <p>© {new Date().getFullYear()} Ocular Inc. All rights reserved.</p>
          <div className="flex items-center gap-1 text-white/90">
            <span>Built for smart online shopping.</span>
          </div>
        </div>

      </div>

      {/* Resource Modals */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-lg theme-bg-card rounded-2xl theme-border border p-6 space-y-4 shadow-2xl">
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-4 right-4 theme-text-muted hover:theme-text-main p-1 rounded-lg theme-bg-surface theme-border border"
            >
              <X size={18} />
            </button>

            {activeModal === 'privacy' && (
              <>
                <h3 className="text-lg font-bold theme-text-main flex items-center gap-2">
                  <Shield size={20} className="theme-accent-text" /> Privacy Policy
                </h3>
                <div className="text-xs theme-text-muted space-y-2 max-h-60 overflow-y-auto pr-2">
                  <p>At Ocular, your privacy is our priority. We do not sell, rent, or trade your personal data.</p>
                  <p><strong>Data Collection:</strong> We only track product URLs and price history you bookmark. We do not store personal browsing history or payment details.</p>
                </div>
              </>
            )}

            {activeModal === 'terms' && (
              <>
                <h3 className="text-lg font-bold theme-text-main flex items-center gap-2">
                  <FileText size={20} className="theme-accent-text" /> Terms of Service
                </h3>
                <div className="text-xs theme-text-muted space-y-2 max-h-60 overflow-y-auto pr-2">
                  <p>Welcome to Ocular. By using our website and extension, you agree to these terms.</p>
                  <p><strong>Usage:</strong> Ocular is provided as a free tool to track e-commerce prices across supported online stores.</p>
                </div>
              </>
            )}

            {activeModal === 'docs' && (
              <>
                <h3 className="text-lg font-bold theme-text-main flex items-center gap-2">
                  <HelpCircle size={20} className="theme-accent-text" /> Documentation & API Setup
                </h3>
                <div className="text-xs theme-text-muted space-y-2 max-h-60 overflow-y-auto pr-2">
                  <p>Ocular provides a clean web extension API for developers to connect custom notification endpoints.</p>
                  <p><strong>Setup Steps:</strong> Install extension ➔ Open Settings ➔ Add Webhook Endpoint ➔ Receive live price drop alerts.</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </footer>
  );
}
