import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingDown, Zap, Bell, Check, Flame, RefreshCw, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function PriceDropCurve({ onTriggerToast }) {
  const [historyData, setHistoryData] = useState([
    { label: 'May 01', price: 124900, isLow: false },
    { label: 'May 15', price: 119900, isLow: false },
    { label: 'Jun 01', price: 118500, isLow: false },
    { label: 'Jun 20', price: 112000, isLow: false },
    { label: 'Jul 10', price: 109900, isLow: false },
    { label: 'Today', price: 104900, isLow: true },
  ]);

  const [activeHoverIndex, setActiveHoverIndex] = useState(5);
  const [isSimulating, setIsSimulating] = useState(false);

  const initialPrice = 124900;
  const currentPrice = historyData[historyData.length - 1].price;
  const savings = initialPrice - currentPrice;
  const savingsPercent = Math.round((savings / initialPrice) * 100);

  // SVG Curve Coordinate Calculations
  const width = 600;
  const height = 180;
  const minPrice = 90000;
  const maxPrice = 130000;
  const range = maxPrice - minPrice;

  const points = historyData.map((d, index) => {
    const x = (index / (historyData.length - 1)) * (width - 60) + 30;
    const y = height - 25 - ((d.price - minPrice) / range) * (height - 50);
    return { x, y, label: d.label, price: d.price, isLow: d.isLow };
  });

  // Generate Smooth Bezier SVG Path string
  const pathD = points.reduce((acc, pt, idx) => {
    if (idx === 0) return `M ${pt.x},${pt.y}`;
    const prev = points[idx - 1];
    const cp1x = prev.x + (pt.x - prev.x) / 2;
    const cp1y = prev.y;
    const cp2x = prev.x + (pt.x - prev.x) / 2;
    const cp2y = pt.y;
    return `${acc} C ${cp1x},${cp1y} ${cp2x},${cp2y} ${pt.x},${pt.y}`;
  }, '');

  // Fill path under curve
  const fillD = `${pathD} L ${points[points.length - 1].x},${height - 10} L ${points[0].x},${height - 10} Z`;

  // Trigger Live Simulated Price Drop
  const handleSimulateDrop = () => {
    setIsSimulating(true);
    const dropPrice = Math.round(currentPrice * 0.88); // Drop further

    setTimeout(() => {
      const updated = [
        ...historyData.map(h => ({ ...h, isLow: false })),
        { label: 'Just Now', price: dropPrice, isLow: true }
      ];
      setHistoryData(updated);
      setActiveHoverIndex(updated.length - 1);
      setIsSimulating(false);

      if (onTriggerToast) {
        onTriggerToast(`🎉 LIVE PRICE DROP! Item dropped by -12% to ₹${dropPrice.toLocaleString('en-IN')}!`);
      }

      try {
        confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
      } catch (e) {}
    }, 400);
  };

  const activePoint = points[activeHoverIndex] || points[points.length - 1];

  return (
    <section className="py-16 theme-bg-main transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto space-y-3 mb-10">
          <span className="px-3 py-1 rounded-md bg-emerald-500/10 text-emerald-700 text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5">
            <Sparkles size={14} /> Historic Price Engine
          </span>
          <h2 className="text-2xl sm:text-4xl font-extrabold theme-text-main tracking-tight">
            High-to-Low Price Drop Curve
          </h2>
          <p className="text-xs sm:text-sm theme-text-muted">
            Visualize how PriceDrop tracks historic price drops and detects genuine all-time lowest deals.
          </p>
        </div>

        {/* Price Drop Curve Showcase Container */}
        <div className="max-w-4xl mx-auto theme-bg-surface rounded-2xl p-6 sm:p-8 theme-border border shadow-card">
          
          {/* Card Top Info Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 mb-6 border-b theme-border">
            <div className="flex items-center gap-4">
              <img
                src="https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=300&q=80"
                alt="MacBook M3"
                className="w-14 h-14 rounded-xl object-cover theme-border border shrink-0"
              />
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 font-bold text-[10px] uppercase">
                    Amazon India
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 font-bold text-[10px] flex items-center gap-1">
                    <Flame size={11} /> All-Time Low
                  </span>
                </div>
                <h3 className="text-sm font-bold theme-text-main mt-1">
                  Apple MacBook Air M3 (16GB RAM, 512GB SSD)
                </h3>
              </div>
            </div>

            {/* Metrics */}
            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-[10px] theme-text-muted block font-medium">All-Time Lowest Price</span>
                <span className="text-xl font-extrabold text-emerald-600 ">
                  ₹{currentPrice.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-700 text-xs font-bold border border-emerald-500/20">
                -{savingsPercent}% OFF (Saved ₹{savings.toLocaleString('en-IN')})
              </div>
            </div>
          </div>

          {/* Interactive SVG Curve Graph */}
          <div className="relative theme-bg-muted p-4 sm:p-6 rounded-xl theme-border border">
            
            {/* Graph Header */}
            <div className="flex items-center justify-between text-xs theme-text-main font-bold mb-4">
              <span className="flex items-center gap-1.5 text-emerald-600 ">
                <TrendingDown size={16} /> Live Price Drop Curve (High ➔ Low)
              </span>
              <span className="theme-text-muted font-mono text-[11px]">
                Hover over data points to inspect historic prices
              </span>
            </div>

            {/* SVG Canvas Container */}
            <div className="relative w-full h-48 sm:h-56">
              <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${width} ${height}`}>
                <defs>
                  <linearGradient id="priceCurveFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#059669" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#059669" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Grid Lines */}
                <line x1="20" y1="30" x2={width - 20} y2="30" stroke="currentColor" className="theme-text-subtle opacity-20" strokeDasharray="4 4" />
                <line x1="20" y1="90" x2={width - 20} y2="90" stroke="currentColor" className="theme-text-subtle opacity-20" strokeDasharray="4 4" />
                <line x1="20" y1="150" x2={width - 20} y2="150" stroke="currentColor" className="theme-text-subtle opacity-20" strokeDasharray="4 4" />

                {/* Area Fill Under Curve */}
                <path d={fillD} fill="url(#priceCurveFill)" />

                {/* Main Dropping Bezier Line Curve */}
                <path
                  d={pathD}
                  fill="none"
                  stroke="#059669"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />

                {/* Data Points / Nodes */}
                {points.map((pt, i) => (
                  <g key={i} className="cursor-pointer" onMouseEnter={() => setActiveHoverIndex(i)}>
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={i === activeHoverIndex ? 7 : 5}
                      fill={pt.isLow ? '#059669' : i === activeHoverIndex ? '#059669' : '#94a3b8'}
                      className="transition-all duration-200"
                    />
                    {pt.isLow && (
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r="10"
                        fill="none"
                        stroke="#059669"
                        strokeWidth="2"
                        className="animate-ping opacity-75"
                      />
                    )}
                  </g>
                ))}
              </svg>

              {/* Dynamic Floating Tooltip */}
              {activePoint && (
                <div
                  className="absolute -top-3 pointer-events-none transition-all duration-200 transform -translate-x-1/2 -translate-y-full"
                  style={{ left: `${(activePoint.x / width) * 100}%` }}
                >
                  <div className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold shadow-lg flex items-center gap-1.5 border border-slate-700">
                    <span>{activePoint.label}:</span>
                    <span className="text-emerald-400">₹{activePoint.price.toLocaleString('en-IN')}</span>
                    {activePoint.isLow && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500 text-slate-950 font-black">LOW</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* X-Axis Timeline Labels */}
            <div className="flex justify-between items-center text-[11px] theme-text-muted font-mono mt-2 pt-2 border-t theme-border">
              {historyData.map((d, idx) => (
                <span
                  key={idx}
                  className={`cursor-pointer ${idx === activeHoverIndex ? 'text-emerald-600 font-bold' : ''}`}
                  onClick={() => setActiveHoverIndex(idx)}
                >
                  {d.label}
                </span>
              ))}
            </div>

          </div>

          {/* Interactive Simulation Controls */}
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t theme-border">
            <div className="flex items-center gap-2 text-xs theme-text-muted font-medium">
              <Bell size={15} className="text-emerald-600 " />
              <span>Real-Time Watcher Active: Automatic Email & Browser Price Drop Alerts</span>
            </div>

            <button
              onClick={handleSimulateDrop}
              disabled={isSimulating}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors"
            >
              {isSimulating ? (
                <>
                  <RefreshCw size={15} className="animate-spin" /> Simulating Drop...
                </>
              ) : (
                <>
                  <Zap size={15} /> Simulate Live Price Drop
                </>
              )}
            </button>
          </div>

        </div>

      </div>
    </section>
  );
}
