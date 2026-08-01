import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Download, Bookmark, Bell, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function HowItWorks({ onOpenDownload }) {
  const [activeStep, setActiveStep] = useState(0);

  const steps = [
    {
      number: '01',
      title: 'Install Extension or Paste Product Link',
      description: 'Download the Chrome Extension or paste any supported store link directly into Ocular.',
      icon: Download,
      badge: 'Zero Setup',
      details: [
        'Works on Chrome, Brave, and Edge',
        'Automatic product link detection',
        'Lightweight & fast'
      ]
    },
    {
      number: '02',
      title: 'Build Your Custom Alert Watchlist',
      description: 'Set custom price target thresholds or let Ocular automatically watch for all-time lowest price drops.',
      icon: Bookmark,
      badge: 'Smart Watchlist',
      details: [
        'Track across multiple stores simultaneously',
        'Custom price target triggers',
        'Automatic stock & price drop tracking'
      ]
    },
    {
      number: '03',
      title: 'Receive Instant Alert Notifications',
      description: 'Get notified via browser Web Push notifications or Email the instant your tracked item drops in price.',
      icon: Bell,
      badge: 'Instant Alerts',
      details: [
        'Browser background push notifications',
        'Email notification options',
        'One-click direct deal checkout link'
      ]
    }
  ];

  return (
    <motion.section
      id="how-it-works"
      initial={{ opacity: 0, y: 50, scale: 0.98 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: false, amount: 0.2 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="py-20 bg-transparent border-t theme-border relative z-20 transform-gpu"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-20">
        
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
          className="text-center max-w-3xl mx-auto space-y-3 mb-14"
        >
          <h2 className="text-3xl sm:text-5xl font-semibold theme-text-main tracking-tight">
            How <span className="theme-accent-text">Ocular</span> Works
          </h2>
          <p className="text-sm sm:text-base theme-text-muted font-light">
            Start tracking prices in less than 30 seconds.
          </p>
        </motion.div>

        {/* 3 Step Card Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            const isActive = activeStep === idx;

            return (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 35 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: false }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.1 * idx }}
                onClick={() => setActiveStep(idx)}
                className={`relative rounded-3xl p-6 glass-card backdrop-blur-sm border transition-all duration-300 flex flex-col justify-between transform hover:scale-[1.03] hover:-translate-y-1 hover:shadow-2xl ${
                  isActive
                    ? 'theme-border border shadow-xl'
                    : 'theme-border hover:opacity-95'
                }`}
              >
                {/* Step Number Badge */}
                <div className="flex items-center justify-between mb-5">
                  <div className="w-12 h-12 rounded-2xl theme-accent-bg p-0.5 shadow-md flex items-center justify-center text-white">
                    <Icon size={22} />
                  </div>
                  <span className="text-3xl font-medium theme-text-subtle font-mono">
                    {step.number}
                  </span>
                </div>

                {/* Content */}
                <div className="space-y-2 mb-5">
                  <span className="text-[11px] font-medium px-2.5 py-1 rounded-full theme-accent-bg-soft theme-accent-text border theme-border">
                    {step.badge}
                  </span>
                  <h3 className="text-lg font-semibold theme-text-main leading-snug">
                    {step.title}
                  </h3>
                  <p className="text-xs theme-text-muted font-light leading-relaxed">
                    {step.description}
                  </p>
                </div>

                {/* Checklist Features */}
                <ul className="space-y-2 pt-4 border-t theme-border">
                  {step.details.map((detail, dIdx) => (
                    <li key={dIdx} className="text-xs theme-text-muted font-light flex items-center gap-2">
                      <CheckCircle2 size={15} className="theme-accent-text shrink-0" />
                      <span>{detail}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            );
          })}
        </div>

        {/* CTA Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
          className="mt-12 text-center"
        >
          <button
            onClick={onOpenDownload}
            className="px-8 py-3.5 rounded-2xl theme-accent-bg theme-accent-bg-hover text-white font-semibold text-sm inline-flex items-center gap-3 shadow-lg cursor-pointer transform hover:-translate-y-1 hover:shadow-2xl transition-all duration-200"
          >
            <span>Get Started with Ocular</span>
            <ArrowRight size={18} />
          </button>
        </motion.div>

      </div>
    </motion.section>
  );
}
