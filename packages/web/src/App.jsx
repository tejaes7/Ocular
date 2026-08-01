import React, { useState } from 'react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import StoresBar from './components/StoresBar';
import HowItWorks from './components/HowItWorks';
import VideoTutorial from './components/VideoTutorial';
import DownloadModal from './components/DownloadModal';
import AuthModal from './components/AuthModal';
import Footer from './components/Footer';
import NotificationToast from './components/NotificationToast';
import ScrollPriceGraph from './components/ScrollPriceGraph';
import VideoBackground from './components/VideoBackground';

export default function App() {
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [toastMessage, setToastMessage] = useState(null);

  const triggerToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  const handleAddProductFromUrl = (_url) => {
    triggerToast("Product link parsed! Added to Ocular price tracker");
  };

  const handleOpenAuth = (mode = 'login') => {
    setAuthMode(mode);
    setIsAuthOpen(true);
  };

  return (
    <div className="min-h-screen theme-bg-main theme-text-main relative">
      {/* Looping particle-wave video, behind everything. Renders nothing until
          public/background.mp4 exists. */}
      <VideoBackground />

      {/* Scroll-following Guidance Curve Beam */}
      <ScrollPriceGraph />

      <Navbar onOpenAuth={handleOpenAuth} />

      <Hero 
        onAddProductFromUrl={handleAddProductFromUrl}
        onOpenDownload={() => setIsDownloadOpen(true)}
      />

      <StoresBar />

      <HowItWorks onOpenDownload={() => setIsDownloadOpen(true)} />

      <VideoTutorial onOpenDownload={() => setIsDownloadOpen(true)} />

      <Footer />

      <DownloadModal
        isOpen={isDownloadOpen}
        onClose={() => setIsDownloadOpen(false)}
      />

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        initialMode={authMode}
      />

      <NotificationToast
        toastMessage={toastMessage}
        onClose={() => setToastMessage(null)}
      />
    </div>
  );
}
