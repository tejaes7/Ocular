import React, { useState } from 'react';
import { 
  TrendingDown, RefreshCw, BellRing, Mail, Check, 
  Smartphone, Laptop, Sparkles, ShieldCheck, Zap, Brain
} from 'lucide-react';

export default function BentoFeatures({ onTriggerAlertToast }) {
  const [selectedChannel, setSelectedChannel] = useState('Web Push');
  const [isTestSent, setIsTestSent] = useState(false);

  const handleSendTestAlert = () => {
    setIsTestSent(true);
    onTriggerAlertToast(`📱 [${selectedChannel} ALERT]: "Tracked Headphones dropped by 25% to all-time low of ₹14,990!"`);
    setTimeout(() => setIsTestSent(false), 3000);
  };

  return (
    <section id="features" className="py-20 theme-bg-main relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto space-y-3 mb-14">
          <span className="px-3.5 py-1.5 rounded-full theme-accent-bg-soft theme-accent-text text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 border theme-border">
            <Sparkles size={14} /> Smart Features
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold theme-text-main tracking-tight">
            Built to Make Sure You <span className="theme-accent-text">Never Overpay</span>
          </h2>
          <p className="text-sm sm:text-base theme-text-muted">
            Powered by high-frequency price tracking engines and trend analysis algorithms.
          </p>
        </div>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          
          {/* Card 1: Historic Lowest Price Guarantee (Span 7) */}
          <div className="md:col-span-7 rounded-3xl glass-card border theme-border p-6 sm:p-8 flex flex-col justify-between group relative overflow-hidden">
            <div className="space-y-3 mb-6 relative z-10">
              <span className="px-3 py-1 rounded-full theme-accent-bg-soft theme-accent-text border theme-border text-xs font-bold inline-block">
                Lowest Price Guarantee
              </span>
              <h3 className="text-2xl font-extrabold theme-text-main">
                Historic All-Time Lowest Price Detection
              </h3>
              <p className="text-xs theme-text-muted leading-relaxed max-w-xl">
                Ocular automatically scans the price timeline of any product to verify if today's deal is a genuine bargain.
              </p>
            </div>

            {/* Interactive Graph Visual */}
            <div className="theme-bg-muted p-4 rounded-2xl theme-border border relative z-10">
              <div className="flex items-center justify-between text-xs theme-text-main mb-3">
                <span className="font-bold flex items-center gap-1.5 theme-accent-text">
                  <TrendingDown size={16} /> Historic Lowest Verified
                </span>
                <span className="theme-text-subtle font-mono">Original: ₹19,990 ➔ Now: ₹14,990</span>
              </div>

              <div className="h-28 w-full relative">
                <svg className="w-full h-full overflow-visible" viewBox="0 0 350 90">
                  <path
                    d="M 0,20 C 60,10 120,40 180,30 C 240,20 280,75 350,85"
                    fill="none"
                    stroke="var(--primary-accent)"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                  <circle cx="350" cy="85" r="6" fill="var(--primary-accent)" className="animate-ping" />
                  <circle cx="350" cy="85" r="4" fill="#ffffff" />
                </svg>
              </div>
            </div>
          </div>

          {/* Card 2: Instant Alerts (Span 5) */}
          <div className="md:col-span-5 rounded-3xl glass-card border theme-border p-6 sm:p-8 flex flex-col justify-between group">
            <div className="space-y-3 mb-4">
              <span className="px-3 py-1 rounded-full theme-accent-bg-soft theme-accent-text border theme-border text-xs font-bold inline-block">
                Instant Alerts
              </span>
              <h3 className="text-xl font-bold theme-text-main">
                Instant Push & Email Notifications
              </h3>
              <p className="text-xs theme-text-muted">
                Choose how you want to be notified the millisecond prices drop.
              </p>
            </div>

            {/* Interactive Alert Simulator Box */}
            <div className="theme-bg-muted p-4 rounded-2xl theme-border border space-y-3">
              <div className="flex items-center justify-between text-xs theme-text-main">
                <span className="font-semibold">Select Channel:</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {[
                  { name: 'Web Push', icon: BellRing, color: 'theme-accent-text' },
                  { name: 'Email', icon: Mail, color: 'theme-accent-text' }
                ].map((ch) => {
                  const Icon = ch.icon;
                  return (
                    <button
                      key={ch.name}
                      onClick={() => setSelectedChannel(ch.name)}
                      className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                        selectedChannel === ch.name
                          ? 'theme-bg-surface theme-border theme-text-main font-bold shadow-sm'
                          : 'theme-bg-surface theme-border text-xs theme-text-muted hover:theme-text-main'
                      }`}
                    >
                      <Icon size={14} className={ch.color} />
                      <span>{ch.name}</span>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={handleSendTestAlert}
                disabled={isTestSent}
                className="w-full py-2.5 rounded-xl theme-accent-bg theme-accent-bg-hover text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-md"
              >
                {isTestSent ? (
                  <>
                    <Check size={14} className="text-white" /> Test Alert Sent!
                  </>
                ) : (
                  <>
                    <Zap size={14} /> Test {selectedChannel} Alert
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Card 3: Cross-Platform Sync (Span 4) */}
          <div className="md:col-span-4 rounded-3xl glass-card border theme-border p-6 flex flex-col justify-between">
            <div className="space-y-2 mb-4">
              <div className="w-10 h-10 rounded-xl theme-accent-bg-soft border theme-border flex items-center justify-center theme-accent-text mb-2">
                <RefreshCw size={20} />
              </div>
              <h4 className="text-lg font-bold theme-text-main">Cross-Platform Sync</h4>
              <p className="text-xs theme-text-muted">
                Tracked items stay synced in real-time between your Chrome Extension and Web Dashboard.
              </p>
            </div>

            <div className="flex items-center justify-around theme-bg-muted p-3 rounded-2xl theme-border border text-xs theme-text-main">
              <div className="flex items-center gap-1.5">
                <Laptop size={16} className="theme-accent-text" />
                <span>Extension</span>
              </div>
              <span className="theme-accent-text font-bold">⇄</span>
              <div className="flex items-center gap-1.5">
                <Smartphone size={16} className="theme-accent-text" />
                <span>Web App</span>
              </div>
            </div>
          </div>

          {/* Card 4: AI Price Prediction (Span 4) */}
          <div className="md:col-span-4 rounded-3xl glass-card border theme-border p-6 flex flex-col justify-between">
            <div className="space-y-2 mb-4">
              <div className="w-10 h-10 rounded-xl theme-accent-bg-soft border theme-border flex items-center justify-center theme-accent-text mb-2">
                <Brain size={20} />
              </div>
              <h4 className="text-lg font-bold theme-text-main">AI Price Prediction</h4>
              <p className="text-xs theme-text-muted">
                Predicts upcoming sale price drops so you know whether to buy now or wait.
              </p>
            </div>

            <div className="theme-bg-muted p-3 rounded-2xl theme-border border flex items-center justify-between text-xs">
              <span className="theme-text-subtle">Recommendation:</span>
              <span className="px-2.5 py-1 rounded-full theme-accent-bg text-white font-bold">
                BUY NOW
              </span>
            </div>
          </div>

          {/* Card 5: 1-Click Tracking (Span 4) */}
          <div className="md:col-span-4 rounded-3xl glass-card border theme-border p-6 flex flex-col justify-between">
            <div className="space-y-2 mb-4">
              <div className="w-10 h-10 rounded-xl theme-accent-bg-soft border theme-border flex items-center justify-center theme-accent-text mb-2">
                <ShieldCheck size={20} />
              </div>
              <h4 className="text-lg font-bold theme-text-main">1-Click Tracking</h4>
              <p className="text-xs theme-text-muted">
                A sleek "Track Price" button appears directly on supported e-commerce store pages.
              </p>
            </div>

            <div className="theme-bg-muted p-3 rounded-2xl theme-border border text-xs theme-accent-text font-semibold text-center">
              ✓ Direct In-Page Tracking Widget
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
