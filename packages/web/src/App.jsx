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
import WishlistDashboard from './components/WishlistDashboard';
import { initialProducts } from './data/mockProducts';

export default function App() {
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // The dashboard below is an interactive **demo** — it is how a visitor sees
  // what tracking looks like before installing anything, which is why it ships
  // with sample products and a "simulate a drop" button.
  //
  // It is not, and must not become, a view of the visitor's real watchlist.
  // Real prices live in extension storage on the device; the website has no
  // access to them and no account is linked to price data by design (see the
  // identity section in docs/API.md). Making this live needs the extension to
  // hand its local data to the page, which does not exist yet.
  const [demoProducts, setDemoProducts] = useState(initialProducts);

  const triggerToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  const handleAddProductFromUrl = (_url) => {
    triggerToast("Product link parsed! Added to Ocular price tracker");
  };

  // Google sign-in creates the account or finds it, so there is nothing for the
  // caller to choose here. Navbar used to pass 'login' or 'register'.
  const handleOpenAuth = () => setIsAuthOpen(true);

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

      <WishlistDashboard
        products={demoProducts}
        setProducts={setDemoProducts}
        onTriggerAlertToast={triggerToast}
      />

      <VideoTutorial onOpenDownload={() => setIsDownloadOpen(true)} />

      <Footer />

      <DownloadModal
        isOpen={isDownloadOpen}
        onClose={() => setIsDownloadOpen(false)}
      />

      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />

      <NotificationToast
        toastMessage={toastMessage}
        onClose={() => setToastMessage(null)}
      />
    </div>
  );
}
