import React, { useEffect, useState } from 'react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import StoresBar from './components/StoresBar';
import HowItWorks from './components/HowItWorks';
import VideoTutorial from './components/VideoTutorial';
import DownloadModal from './components/DownloadModal';
import Footer from './components/Footer';
import NotificationToast from './components/NotificationToast';
import ScrollPriceGraph from './components/ScrollPriceGraph';
import VideoBackground from './components/VideoBackground';
import ClickBurst from './components/ClickBurst';
import PairDevice, { pairDeviceIdFromLocation } from './components/PairDevice';

export default function App() {
  // `/?pair=<device-uuid>` — the extension sends people here to turn on email
  // alerts. Read once at mount: the extension opens a fresh tab, so this never
  // changes underneath us, and the pairing page clears the parameter itself
  // once it has been used.
  const [pairDeviceId] = useState(pairDeviceIdFromLocation);
  if (pairDeviceId) return <PairDevice deviceId={pairDeviceId} />;

  return <LandingPage />;
}

function LandingPage() {
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(
    /** @type {string | null} */ (null)
  );

  const handleAddProductFromUrl = () => {
    setToastMessage('Product link parsed! Added to Ocular price tracker');
    setTimeout(() => setToastMessage(null), 4500);
  };

  // `user-drag: none` covers images and links, but dragging an already-selected
  // run of text still starts a native drag-and-drop, and the OS takes the cursor
  // for the duration. Nothing on the page is meant to be draggable, so cancel it.
  useEffect(() => {
    const cancelDrag = (event) => event.preventDefault();
    document.addEventListener('dragstart', cancelDrag);
    return () => document.removeEventListener('dragstart', cancelDrag);
  }, []);

  return (
    <div className="min-h-screen theme-bg-main theme-text-main relative">
      {/* Looping particle-wave video, behind everything. Renders nothing until
          public/background.mp4 exists. */}
      <VideoBackground poster="/background-poster.png" />

      {/* Tech grid overlay. Fixed and masked, so it sits above the video plate
          but below every section — depth without competing with the copy. */}
      <div className="tech-grid pointer-events-none fixed inset-0 z-0" aria-hidden="true" />

      {/* Scroll-following Guidance Curve Beam */}
      <ScrollPriceGraph />

      <Navbar onOpenDownload={() => setIsDownloadOpen(true)} />

      <Hero onAddProductFromUrl={handleAddProductFromUrl} />

      <StoresBar />

      <HowItWorks onOpenDownload={() => setIsDownloadOpen(true)} />

      <VideoTutorial onOpenDownload={() => setIsDownloadOpen(true)} />

      <Footer />

      <DownloadModal
        isOpen={isDownloadOpen}
        onClose={() => setIsDownloadOpen(false)}
      />

      <NotificationToast
        toastMessage={toastMessage}
        onClose={() => setToastMessage(null)}
      />

      {/* Sits above everything so the pulse is never clipped by a section */}
      <ClickBurst />
    </div>
  );
}
