import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bell, BellOff, Trash2, TrendingDown, Zap, 
  Plus, Search, Sparkles, Tag, Flame, AlertTriangle
} from 'lucide-react';
import confetti from 'canvas-confetti';

export default function WishlistDashboard({ products, setProducts, onTriggerAlertToast }) {
  const [filterStore, setFilterStore] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  const [newTitle, setNewTitle] = useState('');
  const [newStore, setNewStore] = useState('Amazon');
  const [newPrice, setNewPrice] = useState('');
  const [newImg, setNewImg] = useState('');

  const filteredProducts = products.filter((p) => {
    const matchesSearch = p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          p.store.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (filterStore === 'ALL') return matchesSearch;
    if (filterStore === 'LOWEST') return matchesSearch && p.isAllTimeLow;
    if (filterStore === 'NOTIFY') return matchesSearch && p.isNotifyActive;
    return matchesSearch && p.store.toLowerCase() === filterStore.toLowerCase();
  });

  const handleToggleNotify = (id) => {
    setProducts(products.map(p => {
      if (p.id === id) {
        const nextState = !p.isNotifyActive;
        onTriggerAlertToast(
          nextState 
            ? `Price drop alerts ENABLED for "${p.title.slice(0, 25)}..."` 
            : `Alerts paused for "${p.title.slice(0, 25)}..."`
        );
        return { ...p, isNotifyActive: nextState };
      }
      return p;
    }));
  };

  const handleDeleteProduct = (id) => {
    const item = products.find(p => p.id === id);
    setProducts(products.filter(p => p.id !== id));
    if (item) {
      onTriggerAlertToast(`Removed "${item.title.slice(0, 25)}..." from wishlist`);
    }
  };

  const handleSimulateDrop = (id) => {
    setProducts(products.map(p => {
      if (p.id === id) {
        const newDropPrice = Math.round(p.currentPrice * 0.85);
        const updatedHistory = [
          ...p.priceHistory,
          { date: 'Now', price: newDropPrice }
        ];

        onTriggerAlertToast(`🎉 PRICE DROP! "${p.title.slice(0, 22)}..." dropped to ₹${newDropPrice.toLocaleString('en-IN')}!`);

        try {
          confetti({ particleCount: 40, spread: 50, origin: { y: 0.7 } });
        } catch (e) {}

        return {
          ...p,
          currentPrice: newDropPrice,
          lowestPrice: Math.min(p.lowestPrice, newDropPrice),
          isAllTimeLow: true,
          priceHistory: updatedHistory,
          savingsPercent: Math.round(((p.initialPrice - newDropPrice) / p.initialPrice) * 100)
        };
      }
      return p;
    }));
  };

  const handleAddCustomProduct = (e) => {
    e.preventDefault();
    if (!newTitle.trim() || !newPrice) return;

    const priceNum = Number(newPrice);
    const initialPriceNum = Math.round(priceNum * 1.25);

    const newProd = {
      id: `prod-${Date.now()}`,
      title: newTitle,
      store: newStore,
      image: newImg || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80',
      url: '#',
      currentPrice: priceNum,
      initialPrice: initialPriceNum,
      lowestPrice: priceNum,
      isAllTimeLow: true,
      isNotifyActive: true,
      category: 'Tracked Item',
      savingsPercent: 20,
      priceHistory: [
        { date: '1 Mon Ago', price: initialPriceNum },
        { date: 'Today', price: priceNum }
      ]
    };

    setProducts([newProd, ...products]);
    setShowAddModal(false);
    setNewTitle('');
    setNewPrice('');
    setNewImg('');
    onTriggerAlertToast(`Added "${newTitle.slice(0, 25)}..." to Live Dashboard!`);
  };

  const totalTracked = products.length;
  const totalSavings = products.reduce((acc, p) => acc + (p.initialPrice - p.currentPrice), 0);
  const lowestHits = products.filter(p => p.isAllTimeLow).length;

  return (
    <section id="live-dashboard" className="py-16 theme-bg-main transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-emerald-500/10 text-emerald-700 text-xs font-bold mb-2">
              <Sparkles size={14} /> Interactive Live Wishlist
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold theme-text-main tracking-tight">
              Tracked Products Dashboard
            </h2>
            <p className="text-xs sm:text-sm theme-text-muted mt-0.5">
              Simulate price drops, manage alerts, and inspect historic price sparklines.
            </p>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm self-start sm:self-auto"
          >
            <Plus size={16} /> Add Custom Product
          </button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6">
          <div className="theme-bg-surface p-4 rounded-xl theme-border border shadow-sm flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold text-sm shrink-0">
              <Tag size={18} />
            </div>
            <div>
              <span className="text-[11px] theme-text-muted font-medium block">Total Tracked</span>
              <span className="text-base font-extrabold theme-text-main">{totalTracked} Products</span>
            </div>
          </div>

          <div className="theme-bg-surface p-4 rounded-xl theme-border border shadow-sm flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold text-sm shrink-0">
              <TrendingDown size={18} />
            </div>
            <div>
              <span className="text-[11px] theme-text-muted font-medium block">Total Saved</span>
              <span className="text-base font-extrabold text-emerald-600 ">₹{totalSavings.toLocaleString('en-IN')}</span>
            </div>
          </div>

          <div className="theme-bg-surface p-4 rounded-xl theme-border border shadow-sm flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold text-sm shrink-0">
              <Flame size={18} />
            </div>
            <div>
              <span className="text-[11px] theme-text-muted font-medium block">All-Time Low Hits</span>
              <span className="text-base font-extrabold theme-text-main">{lowestHits} Items</span>
            </div>
          </div>

          <div className="theme-bg-surface p-4 rounded-xl theme-border border shadow-sm flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold text-sm shrink-0">
              <Bell size={18} />
            </div>
            <div>
              <span className="text-[11px] theme-text-muted font-medium block">Active Alerts</span>
              <span className="text-base font-extrabold theme-text-main">
                {products.filter(p => p.isNotifyActive).length} Active
              </span>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 p-2 rounded-xl theme-bg-surface theme-border border">
          <div className="flex items-center gap-1 overflow-x-auto p-0.5 scrollbar-none">
            {[
              { id: 'ALL', label: 'All Items' },
              { id: 'Amazon', label: 'Amazon' },
              { id: 'Flipkart', label: 'Flipkart' },
              { id: 'Myntra', label: 'Myntra' },
              { id: 'LOWEST', label: '🔥 All-Time Low' },
              { id: 'NOTIFY', label: '🔔 Active Alerts' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterStore(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-colors ${
                  filterStore === tab.id
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'theme-text-muted hover:theme-text-main hover:theme-bg-muted'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 theme-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search wishlist..."
              className="w-full pl-8 pr-3 py-1.5 theme-bg-muted theme-text-main placeholder:theme-text-subtle text-xs rounded-lg theme-border border focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <AnimatePresence mode="popLayout">
            {filteredProducts.map((product) => {
              const history = product.priceHistory || [];
              const minP = Math.min(...history.map(h => h.price));
              const maxP = Math.max(...history.map(h => h.price));
              const range = maxP - minP || 1;
              
              const points = history.map((h, index) => {
                const x = (index / (history.length - 1 || 1)) * 260;
                const y = 45 - ((h.price - minP) / range) * 35;
                return { x, y };
              });

              const svgPath = points.reduce((acc, pt, idx) => {
                return idx === 0 ? `M ${pt.x},${pt.y}` : `${acc} L ${pt.x},${pt.y}`;
              }, '');

              return (
                <motion.div
                  key={product.id}
                  layout
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="theme-bg-card rounded-2xl theme-border border shadow-card overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    <div className="relative h-44 w-full theme-bg-muted overflow-hidden">
                      <img
                        src={product.image}
                        alt={product.title}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-900/80 text-white backdrop-blur-sm">
                          {product.store}
                        </span>
                      </div>

                      {product.isAllTimeLow && (
                        <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-extrabold flex items-center gap-1 shadow-sm">
                          <Flame size={12} /> ALL-TIME LOW
                        </div>
                      )}
                    </div>

                    <div className="p-4 space-y-3">
                      <h3 className="text-xs font-bold theme-text-main line-clamp-2 leading-snug">
                        {product.title}
                      </h3>

                      <div className="flex items-baseline justify-between pt-1 border-t theme-border">
                        <div>
                          <span className="text-[10px] theme-text-muted block">Current Price</span>
                          <span className="text-lg font-extrabold text-emerald-600 ">
                            ₹{product.currentPrice.toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] theme-text-muted block">Bookmark Price</span>
                          <span className="text-xs font-medium theme-text-subtle line-through">
                            ₹{product.initialPrice.toLocaleString('en-IN')}
                          </span>
                        </div>
                      </div>

                      <div className="theme-bg-muted p-2.5 rounded-xl theme-border border">
                        <div className="flex justify-between text-[10px] theme-text-muted font-mono mb-1">
                          <span>Price History</span>
                          <span className="text-emerald-600 font-bold">Low: ₹{product.lowestPrice.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="h-12 w-full">
                          <svg className="w-full h-full" viewBox="0 0 260 50">
                            <path
                              d={svgPath}
                              fill="none"
                              stroke="#059669"
                              strokeWidth="2"
                              strokeLinecap="round"
                            />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 theme-bg-muted border-t theme-border flex items-center justify-between gap-2 text-xs">
                    <button
                      onClick={() => handleToggleNotify(product.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors ${
                        product.isNotifyActive
                          ? 'bg-emerald-500/15 text-emerald-700 font-bold'
                          : 'theme-bg-surface theme-text-muted theme-border border'
                      }`}
                    >
                      {product.isNotifyActive ? <Bell size={13} className="text-emerald-600" /> : <BellOff size={13} />}
                      <span>{product.isNotifyActive ? 'Alerts ON' : 'Paused'}</span>
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleSimulateDrop(product.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 text-amber-700 font-bold text-[11px] flex items-center gap-1 hover:bg-amber-500/25 transition-colors"
                      >
                        <Zap size={13} /> Drop Price
                      </button>

                      <button
                        onClick={() => handleDeleteProduct(product.id)}
                        className="p-1.5 rounded-lg theme-bg-surface theme-text-muted hover:text-rose-500 theme-border border transition-colors"
                        title="Delete product"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {filteredProducts.length === 0 && (
          <div className="text-center py-12 theme-bg-surface rounded-2xl theme-border border p-6 max-w-sm mx-auto">
            <AlertTriangle size={32} className="text-amber-500 mx-auto mb-2" />
            <h3 className="text-sm font-bold theme-text-main">No products found</h3>
            <button
              onClick={() => { setFilterStore('ALL'); setSearchQuery(''); }}
              className="mt-3 px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-xs"
            >
              Reset Filters
            </button>
          </div>
        )}

      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md theme-bg-surface rounded-2xl theme-border border p-5 space-y-4 shadow-xl">
            <h3 className="text-base font-bold theme-text-main flex items-center gap-2">
              <Plus size={18} className="text-emerald-600" /> Add Custom Product
            </h3>
            
            <form onSubmit={handleAddCustomProduct} className="space-y-3 text-xs">
              <div>
                <label className="theme-text-main font-semibold block mb-1">Product Title</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Sony PS5 Console (Slim)"
                  className="w-full p-2.5 theme-bg-muted theme-border border rounded-xl theme-text-main focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="theme-text-main font-semibold block mb-1">Store</label>
                  <select
                    value={newStore}
                    onChange={(e) => setNewStore(e.target.value)}
                    className="w-full p-2.5 theme-bg-muted theme-border border rounded-xl theme-text-main focus:outline-none focus:border-emerald-600"
                  >
                    <option value="Amazon">Amazon</option>
                    <option value="Flipkart">Flipkart</option>
                    <option value="Myntra">Myntra</option>
                    <option value="Ajio">Ajio</option>
                    <option value="Croma">Croma</option>
                  </select>
                </div>

                <div>
                  <label className="theme-text-main font-semibold block mb-1">Current Price (₹)</label>
                  <input
                    type="number"
                    required
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    placeholder="44990"
                    className="w-full p-2.5 theme-bg-muted theme-border border rounded-xl theme-text-main focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="theme-text-main font-semibold block mb-1">Image URL (Optional)</label>
                <input
                  type="url"
                  value={newImg}
                  onChange={(e) => setNewImg(e.target.value)}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full p-2.5 theme-bg-muted theme-border border rounded-xl theme-text-main focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-2 rounded-xl theme-text-muted hover:theme-text-main text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs"
                >
                  Add Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
