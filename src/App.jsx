import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Download, Link, Move, RefreshCw, ZoomIn, 
  Type, Layout, ArrowRight, Loader2, AlertCircle, RotateCcw 
} from 'lucide-react';

/**
 * ==============================================================================
 * 1. UTILITIES & CONFIGURATION
 * ==============================================================================
 */

const DECODE_TEXTAREA = document.createElement('textarea');
const decodeEntities = (html) => {
  if (!html) return "";
  DECODE_TEXTAREA.innerHTML = html;
  return DECODE_TEXTAREA.value;
};

// Robust Proxy Fetcher
const fetchProxy = async (targetUrl) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  const cacheBuster = `&t=${Date.now()}`;
  const proxies = [
    { url: `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}${cacheBuster}`, type: 'json' },
    { url: `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`, type: 'text' },
  ];

  try {
    const fetchPromises = proxies.map(p => 
      fetch(p.url, { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error(`Status ${res.status}`);
          if (p.type === 'json') {
            const data = await res.json();
            return data.contents; 
          }
          return res.text();
        })
    );
    
    const content = await Promise.any(fetchPromises);
    clearTimeout(timeoutId);
    return content;
  } catch (e) {
    clearTimeout(timeoutId);
    throw new Error("Direct connection failed.");
  }
};

// Microlink Fetcher
const fetchMicrolink = async (targetUrl) => {
    try {
        const response = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(targetUrl)}`);
        const json = await response.json();
        if (json.status !== 'success') throw new Error('Microlink failed');
        
        const { title, description, image } = json.data;
        const parts = title ? title.split('|') : [''];
        const cleanTitle = parts[0].trim();
        
        let cleanKicker = 'News';
        let sectionId = 'news';
        
        if (targetUrl.includes('theguardian.com')) {
          try {
            const urlObj = new URL(targetUrl);
            const pathParts = urlObj.pathname.split('/').filter(p => p);
            if (pathParts.length > 0 && isNaN(pathParts[0])) {
               sectionId = pathParts[0].toLowerCase();
               cleanKicker = pathParts[0].charAt(0).toUpperCase() + pathParts[0].slice(1);
            }
          } catch(e) {}
        }

        return {
            headline: cleanTitle,
            kicker: cleanKicker,
            sectionId: sectionId,
            subheadline: description,
            image: image?.url,
            source: 'Microlink'
        };
    } catch (e) {
        throw new Error("Metadata lookup failed.");
    }
};

/**
 * ==============================================================================
 * 2. THEME MAPPING
 * ==============================================================================
 */

const getTheme = (sectionId, kicker, headline) => {
  const sid = sectionId?.toLowerCase() || "";
  const kick = kicker?.toLowerCase() || "";
  const head = headline?.toLowerCase() || "";

  // 1. Opinion - Unique with 8 lines
  if (sid === 'commentisfree' || sid === 'opinion' || kick.includes('opinion')) {
    return {
      primary: '#C74600',
      background: '#FEF9F5',
      headlineText: '#121212',
      lineCount: 8
    };
  }

  // 2. Sport - 4 lines
  if (sid === 'sport' || sid === 'football') {
    return {
      primary: '#0077B6',
      background: '#FFFFFF',
      headlineText: '#121212',
      lineCount: 4
    };
  }

  // 3. Culture / Arts / Stage - 4 lines
  const cultureSections = [
    'culture', 'stage', 'artanddesign', 'art & design', 'art', 'books', 'music', 
    'tv-and-radio', 'tv & radio', 'film', 'games', 'classical'
  ];
  if (cultureSections.some(s => sid.includes(s) || kick === s)) {
    return {
      primary: '#866D50',
      background: '#FFFFFF',
      headlineText: '#574835',
      lineCount: 4
    };
  }

  // 4. Lifestyle - 4 lines
  const lifestyleSections = [
    'lifestyle', 'fashion', 'food', 'recipes', 'travel', 'health & fitness', 
    'health-and-fitness', 'women', 'men', 'love & sex', 'love-and-sex', 'beauty', 
    'home & garden', 'home-and-garden', 'money', 'cars', 'the filter', 'the-filter'
  ];
  if (lifestyleSections.some(s => sid.includes(s) || kick === s)) {
    return {
      primary: '#BB3B80',
      background: '#FFFFFF',
      headlineText: '#7D0068',
      lineCount: 4
    };
  }

  // 5. News Analysis - 4 lines
  if (kick.includes('analysis') || head.includes('analysis')) {
    return {
      primary: '#C70000',
      background: '#FFF4F2',
      headlineText: '#121212',
      lineCount: 4
    };
  }

  // Default: News - 4 lines
  return {
    primary: '#C70000',
    background: '#FFFFFF',
    headlineText: '#121212',
    lineCount: 4
  };
};

/**
 * ==============================================================================
 * 3. MAIN APPLICATION
 * ==============================================================================
 */

export default function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  
  // Canvas State
  const [kicker, setKicker] = useState('News');
  const [sectionId, setSectionId] = useState('news');
  const [headline, setHeadline] = useState('Headline goes here');
  const [subheadline, setSubheadline] = useState('Standfirst goes here');
  const [image, setImage] = useState('https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=1000&auto=format&fit=crop');
  const [bgColor, setBgColor] = useState('#1a1a1a'); 
  
  // Derived Theme
  const theme = getTheme(sectionId, kicker, headline);

  // Image Manipulation State
  const [imgPos, setImgPos] = useState({ x: 0, y: 0 });
  const [imgScale, setImgScale] = useState(1);
  const [autoScale, setAutoScale] = useState(0.4);
  
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const containerRef = useRef(null);
  const touchStartDist = useRef(null); 

  // Load html2canvas script
  useEffect(() => {
    if (!document.querySelector('script[src*="html2canvas"]')) {
      const script = document.createElement('script');
      script.src = 'https://html2canvas.hertzen.com/dist/html2canvas.min.js';
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  // Auto-Scale Logic
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        const padding = 40; 
        const availableWidth = clientWidth - padding;
        const availableHeight = clientHeight - padding;
        
        const scaleX = availableWidth / 1080;
        const scaleY = availableHeight / 1920;
        
        const newScale = Math.min(scaleX, scaleY);
        setAutoScale(Math.max(0.1, Math.min(newScale, 1.2))); 
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();
    setTimeout(handleResize, 100); 
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fix for Trackpad Zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const zoomFactor = -e.deltaY * 0.01;
        setImgScale(prev => Math.min(Math.max(0.1, prev + zoomFactor), 5));
      } else {
        e.preventDefault();
        setImgScale(prev => Math.min(Math.max(0.1, prev + (-e.deltaY * 0.002)), 5));
      }
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, []);

  // Extract Colors
  useEffect(() => {
    if (!image) return;
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = image;
    img.onload = () => {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 1;
            canvas.height = 1;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, 1, 1);
            const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
            
            // Slightly darker (0.5 factor) but still colorful background color for the poster workspace
            const factor = 0.5; 
            setBgColor(`rgb(${Math.floor(r * factor)}, ${Math.floor(g * factor)}, ${Math.floor(b * factor)})`);
        } catch (e) {
            setBgColor('#1a1a1a'); 
        }
    };
  }, [image]);

  const parseHTML = (html, sourceUrl) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    
    let detectedSectionId = 'news';
    
    const scripts = Array.from(doc.querySelectorAll('script'));
    for (const s of scripts) {
      const content = s.textContent || "";
      const sectionMatch = content.match(/"section":\s*"([^"]+)"/) || 
                           content.match(/"category":\s*"([^"]+)"/) ||
                           content.match(/sectionId:\s*'([^']+)'/);
      if (sectionMatch && sectionMatch[1]) {
        detectedSectionId = sectionMatch[1].toLowerCase();
        break;
      }
    }

    const sectionMeta = doc.querySelector('meta[property="article:section"]')?.getAttribute('content') || 
                        doc.querySelector('meta[name="section"]')?.getAttribute('content');
    
    const tagMeta = doc.querySelector('meta[property="article:tag"]')?.getAttribute('content') ||
                    doc.querySelector('meta[name="keywords"]')?.getAttribute('content');

    const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || doc.title || '';
    
    const isGeneric = (val) => {
      if (!val) return true;
      const lower = val.toLowerCase();
      return lower === 'news' || lower === 'global' || lower.includes('guardian') || lower === 'world news' || lower === 'latest';
    };

    let candidate = detectedSectionId === 'news' ? sectionMeta : detectedSectionId;
    
    if (isGeneric(candidate) && sourceUrl) {
      try {
        const urlObj = new URL(sourceUrl);
        const pathParts = urlObj.pathname.split('/').filter(p => p);
        if (pathParts.length > 0 && isNaN(pathParts[0])) {
           detectedSectionId = pathParts[0].toLowerCase();
           candidate = pathParts[0].charAt(0).toUpperCase() + pathParts[0].slice(1);
        }
      } catch (e) {}
    }

    if (isGeneric(candidate)) {
        if (tagMeta) {
            const firstTag = tagMeta.split(',')[0].trim();
            if (firstTag) candidate = firstTag;
        }
    }

    const bestKicker = (candidate || 'News').split(/[:.(\n]/)[0].trim();
    let bestHeadline = ogTitle.split('|')[0].trim();
    const desc = doc.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
    
    let bestImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content');
    if (bestImage && (bestImage.includes('facebook-logo') || bestImage.includes('twitter-logo'))) {
        bestImage = null;
    }

    return {
        headline: decodeEntities(bestHeadline),
        kicker: decodeEntities(bestKicker),
        sectionId: detectedSectionId,
        subheadline: decodeEntities(desc),
        image: bestImage,
        source: 'HTML'
    };
  };

  const fetchArticle = async (forcedUrl = null) => {
    const targetUrl = forcedUrl || url;
    if (!targetUrl) return;

    setLoading(true);
    setError('');
    setImgPos({ x: 0, y: 0 });
    setImgScale(1);

    try {
        try { new URL(targetUrl); } catch(e) { throw new Error("Invalid URL"); }

        const directPromise = fetchProxy(targetUrl)
            .then(html => parseHTML(html, targetUrl))
            .then(data => {
                if (!data.headline) throw new Error("Partial Data");
                return data;
            });

        const microPromise = fetchMicrolink(targetUrl);

        let result;
        try {
            result = await Promise.any([directPromise, microPromise]);
        } catch (aggregateError) {
            throw new Error("All fetching methods failed. Site may be blocking bots.");
        }

        if (!result) throw new Error("No data returned.");

        setHeadline(result.headline || "Headline");
        setKicker(result.kicker || "News");
        setSectionId(result.sectionId || 'news');
        setSubheadline(result.subheadline || "");
        if (result.image) setImage(result.image);

    } catch (err) {
      setError(err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePaste = (e) => {
    const pastedText = e.clipboardData.getData('text');
    if (pastedText && pastedText.startsWith('http')) {
      setUrl(pastedText);
      fetchArticle(pastedText);
    }
  };

  const handleDownload = async () => {
    if (!window.html2canvas || !canvasRef.current) return;
    try {
      setLoading(true);
      const canvas = await window.html2canvas(canvasRef.current, {
        scale: 2, 
        useCORS: true, 
        allowTaint: true,
        backgroundColor: bgColor 
      });
      const link = document.createElement('a');
      link.download = `promo-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png', 1.0);
      link.click();
    } catch (err) {
      setError("Export failed. Security settings prevented image download.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetImage = () => {
    setImgPos({ x: 0, y: 0 });
    setImgScale(1);
  };

  const handleMouseDown = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setImgPos(prev => ({ x: prev.x + (e.movementX * 2.5), y: prev.y + (e.movementY * 2.5) }));
  };
  const handleMouseUp = () => setIsDragging(false);
  
  const getTouchDistance = (touches) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  const handleTouchStart = (e) => {
    if (e.touches.length === 2) touchStartDist.current = getTouchDistance(e.touches);
    else if (e.touches.length === 1) { setIsDragging(true); touchStartDist.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }
  };
  const handleTouchMove = (e) => {
    if(e.cancelable) e.preventDefault();
    if (e.touches.length === 2 && typeof touchStartDist.current === 'number') {
      const dist = getTouchDistance(e.touches);
      setImgScale(Math.min(Math.max(0.1, imgScale + ((dist - touchStartDist.current) * 0.01)), 5));
      touchStartDist.current = dist;
    } else if (e.touches.length === 1 && isDragging && typeof touchStartDist.current === 'object') {
      const { clientX, clientY } = e.touches[0];
      setImgPos(prev => ({ x: prev.x + (clientX - touchStartDist.current.x) * 2.5, y: prev.y + (clientY - touchStartDist.current.y) * 2.5 }));
      touchStartDist.current = { x: clientX, y: clientY };
    }
  };
  const handleTouchEnd = () => {
    setIsDragging(false);
    touchStartDist.current = null;
  };

  return (
    <div className="h-screen w-screen bg-gray-900 text-white font-sans flex flex-col md:flex-row overflow-hidden">
      
      {/* Global CSS for Selection Contrast */}
      <style>{`
        input::selection, textarea::selection {
          background-color: #FFE500 !important;
          color: #052962 !important;
        }
      `}</style>

      {/* Sidebar Controls */}
      <div 
        onMouseDown={(e) => e.stopPropagation()} 
        className="w-full md:w-96 bg-gray-800 p-6 flex flex-col gap-6 overflow-y-auto border-r border-gray-700 z-50 shadow-xl flex-shrink-0"
      >
        <h1 className="text-2xl font-bold text-gray-100 flex items-center gap-2">
           <Layout className="w-6 h-6 text-[#FFE500]" /> 
           <span>Promo Generator</span>
        </h1>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wider text-gray-400 font-semibold flex items-center gap-2">
            <Link className="w-4 h-4" /> Article URL
          </label>
          <div className="flex gap-2 items-center">
            <input 
              type="text" 
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchArticle()}
              onPaste={handlePaste}
              placeholder="Paste link here..."
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#FFE500] text-white placeholder-gray-500 transition-colors"
            />
            <button 
              onClick={() => fetchArticle()}
              disabled={loading}
              className="bg-white hover:bg-[#FFE500] text-[#052962] h-10 w-10 rounded-full transition-all disabled:opacity-50 flex items-center justify-center border border-gray-600 hover:border-[#FFE500] flex-shrink-0 shadow-sm"
            >
              {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <RefreshCw className="w-5 h-5" />}
            </button>
          </div>
          <p className="text-[10px] text-gray-500 italic">App will auto-fetch when you paste a link.</p>
          {error && (
            <div className="flex items-start gap-2 text-red-400 text-xs mt-1 bg-red-900/20 p-2 rounded">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}
        </div>

        <hr className="border-gray-700" />

        <div className="space-y-4">
          <label className="text-xs uppercase tracking-wider text-gray-400 font-semibold flex items-center gap-2">
            <Type className="w-4 h-4" /> Text Content
          </label>
          
          <div className="space-y-1">
            <span className="text-xs text-gray-500 font-medium">Kicker</span>
            <input 
              type="text" 
              value={kicker}
              onChange={(e) => setKicker(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-gray-500"
            />
          </div>

          <div className="space-y-1">
            <span className="text-xs text-gray-500 font-medium">Headline</span>
            <textarea 
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              rows={3}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-gray-500"
            />
          </div>

          <div className="space-y-1">
            <span className="text-xs text-gray-500 font-medium">Subheadline</span>
            <textarea 
              value={subheadline}
              onChange={(e) => setSubheadline(e.target.value)}
              rows={4}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-gray-500"
            />
          </div>
        </div>

        <hr className="border-gray-700" />

        <div className="space-y-4">
          <label className="text-xs uppercase tracking-wider text-gray-400 font-semibold flex items-center gap-2">
            <Move className="w-4 h-4" /> Image Controls
          </label>
          <div className="grid grid-cols-2 gap-2">
             <div className="flex flex-col gap-1 items-center text-gray-400 text-[10px] bg-gray-700/50 p-2 rounded text-center">
                <ZoomIn className="w-4 h-4 mb-1" />
                <span>Scroll/Pinch to zoom</span>
              </div>
              <div className="flex flex-col gap-1 items-center text-gray-400 text-[10px] bg-gray-700/50 p-2 rounded text-center">
                 <Move className="w-4 h-4 mb-1" />
                 <span>Drag to reposition</span>
              </div>
          </div>
          <button 
            onClick={handleResetImage}
            className="w-full flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 text-white text-xs py-2 px-3 rounded transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Reset Image Position & Scale
          </button>
        </div>

        <div className="mt-auto pt-6">
          <button 
            onClick={handleDownload}
            disabled={loading}
            className="w-full bg-[#FFE500] hover:bg-[#ebd200] text-[#052962] font-bold py-3 px-4 rounded-full flex items-center justify-center gap-2 transition-all shadow-lg disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <Download className="w-5 h-5" />}
            Export
          </button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div 
        ref={containerRef}
        className="flex-1 bg-black relative flex items-center justify-center overflow-hidden p-8"
      >
        <div 
            style={{ 
                width: 1080, 
                height: 1920, 
                transform: `scale(${autoScale})`,
                transformOrigin: 'center center',
                boxShadow: '0 50px 100px -20px rgba(0,0,0,0.8)',
                transition: 'transform 0.1s ease-out'
            }} 
            className="flex-shrink-0 select-none"
        >
          <div 
            ref={canvasRef}
            style={{ width: 1080, height: 1920, backgroundColor: bgColor }}
            className="relative flex overflow-hidden transition-colors duration-500"
          >
             {image && (
                <div className="absolute inset-0 z-0">
                    <img 
                        src={image} 
                        className="w-full h-full object-cover opacity-30 scale-110" 
                        style={{ filter: 'blur(80px) brightness(1.1)' }}
                        alt="Background"
                        crossOrigin="anonymous"
                    />
                </div>
             )}

             <div style={{ position: 'absolute', top: 160, left: 32, right: 32, bottom: 32, display: 'flex', flexDirection: 'column', zIndex: 10 }}>
                {/* Main Content Card */}
                <div style={{ flex: 1, borderRadius: '16px', boxShadow: '0 30px 60px -12px rgba(0, 0, 0, 0.5)', display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: theme.background }}>
                    
                    {/* Header Area */}
                    <div style={{ padding: '48px', backgroundColor: theme.background }} className="flex-shrink-0 relative z-20 transition-colors duration-300">
                        <div style={{ fontSize: '40px', color: theme.primary, fontWeight: 700, lineHeight: 1.2, marginBottom: '16px', fontFamily: 'Georgia, serif' }}>
                            {kicker}
                        </div>
                        <div style={{ fontSize: '72px', color: theme.headlineText, fontWeight: 800, lineHeight: 1.05, fontFamily: 'Georgia, serif', letterSpacing: '-1px', whiteSpace: 'pre-wrap' }}>
                            {headline}
                        </div>
                        <div style={{ marginTop: '48px', fontSize: '36px', color: '#707070', lineHeight: 1.3, fontFamily: 'Georgia, serif', whiteSpace: 'pre-wrap' }}>
                            {subheadline}
                        </div>

                        <svg style={{ marginTop: '64px', height: `${(theme.lineCount * 10) - 6}px`, width: 'calc(100% + 96px)', marginLeft: '-48px', marginRight: '-48px', display: 'block' }}>
                            <g stroke="#999999" strokeWidth="1" strokeLinecap="square" opacity="0.6">
                                {Array.from({ length: theme.lineCount }).map((_, i) => (
                                  <line key={i} x1="0" y1={1 + (i * 10)} x2="100%" y2={1 + (i * 10)} />
                                ))}
                            </g>
                        </svg>

                        <div style={{ marginTop: '48px', width: '380px', height: '104px', backgroundColor: theme.background, border: `3px solid ${theme.primary}`, boxSizing: 'border-box', borderRadius: '200px' }}>
                        </div>
                    </div>

                    {/* Image Area: Window/Mask logic */}
                    <div 
                        className="relative flex-grow bg-gray-100 z-10"
                        style={{ overflow: 'visible' }}
                        onMouseDown={handleMouseDown}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                        onMouseMove={handleMouseMove}
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                    >
                        {/* Space behind the primary image: Blurred and Darkened version of image */}
                        {image && (
                            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                                <img 
                                    src={image} 
                                    alt="" 
                                    className="w-full h-full object-cover"
                                    style={{ filter: 'blur(40px) brightness(0.4)', transform: 'scale(1.1)' }}
                                    crossOrigin="anonymous"
                                />
                            </div>
                        )}

                        {!image && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                                <span className="text-gray-400 text-4xl">Image Placeholder</span>
                            </div>
                        )}
                        <img 
                            ref={imgRef}
                            src={image} 
                            alt="Article Visual" 
                            crossOrigin="anonymous" 
                            draggable={false} 
                            style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: `translate(-50%, -50%) translate(${imgPos.x}px, ${imgPos.y}px) scale(${imgScale})`,
                                transformOrigin: 'center center',
                                minWidth: '100%',
                                minHeight: '100%',
                                maxWidth: 'none',
                                width: 'auto',
                                height: 'auto',
                                cursor: isDragging ? 'grabbing' : 'grab',
                                transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                                touchAction: 'none',
                                display: 'block'
                            }} 
                        />
                    </div>
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}