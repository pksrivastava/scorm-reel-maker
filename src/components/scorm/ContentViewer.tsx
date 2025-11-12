import { useState, useEffect, forwardRef, useImperativeHandle, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Maximize2, 
  Minimize2, 
  RotateCcw, 
  ExternalLink,
  Loader2,
  AlertTriangle,
  Maximize,
  Monitor
} from "lucide-react";

interface ContentViewerProps {
  scormPackage: any;
  currentSco: number;
  onProgressUpdate: (progress: number) => void;
  onBack?: () => void;
  isRecording?: boolean;
  onRequestStartRecording?: () => void;
}

const ContentViewer = forwardRef<HTMLIFrameElement, ContentViewerProps>(
  ({ scormPackage, currentSco, onProgressUpdate, onBack, isRecording = false, onRequestStartRecording }, ref) => {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [contentUrl, setContentUrl] = useState<string | null>(null);
const iframeRef = useRef<HTMLIFrameElement>(null);
const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);
const containerRef = useRef<HTMLDivElement>(null);
const autoClickIntervalRef = useRef<NodeJS.Timeout>();
const mutationObserverRef = useRef<MutationObserver | null>(null);
const lastActionRef = useRef<{ sig: string; ts: number } | null>(null);
const [swReady, setSwReady] = useState(false);
const [isFullscreenMode, setIsFullscreenMode] = useState(false);
const [showStartPrompt, setShowStartPrompt] = useState(false);
useImperativeHandle(ref, () => iframeRef.current!);

    useEffect(() => {
      registerServiceWorker();
      return () => {
        // Cleanup service worker on unmount
        if (swRegistrationRef.current) {
          swRegistrationRef.current.active?.postMessage({ type: 'CLEAR_SCORM' });
        }
      };
    }, []);

useEffect(() => {
  if (swReady) {
    loadScormContent();
  }
}, [swReady, scormPackage, currentSco]);

// Expose SCORM API (1.2 and 2004) on parent window so SCO can find it via parent/opener
useEffect(() => {
  const onComplete = () => onProgressUpdate(100);

  const api12 = {
    LMSInitialize: () => "true",
    LMSFinish: () => { onComplete(); return "true"; },
    LMSGetValue: (_el: string) => "",
    LMSSetValue: (el: string, val: string) => {
      if (el === "cmi.core.lesson_status" && (val === "completed" || val === "passed")) onComplete();
      return "true";
    },
    LMSCommit: () => "true",
    LMSGetLastError: () => "0",
    LMSGetErrorString: () => "",
    LMSGetDiagnostic: () => ""
  } as const;

  const api2004 = {
    Initialize: () => "true",
    Terminate: () => { onComplete(); return "true"; },
    GetValue: (_el: string) => "",
    SetValue: (el: string, val: string) => {
      if (el === "cmi.completion_status" && val === "completed") onComplete();
      if (el === "cmi.success_status" && (val === "passed" || val === "failed")) onComplete();
      return "true";
    },
    Commit: () => "true",
    GetLastError: () => "0",
    GetErrorString: () => "",
    GetDiagnostic: () => ""
  } as const;

  (window as any).API = api12;
  (window as any).API_1484_11 = api2004;

  return () => {
    try {
      delete (window as any).API;
      delete (window as any).API_1484_11;
    } catch {}
  };
}, [onProgressUpdate]);

    const registerServiceWorker = async () => {
      try {
        if ('serviceWorker' in navigator) {
const registration = await navigator.serviceWorker.register('/scorm-sw.js');
// Wait for the service worker to be ready (activated and controlling the page)
const readyRegistration = await navigator.serviceWorker.ready;
swRegistrationRef.current = readyRegistration;
setSwReady(true);
console.log('Service Worker registered and ready');
        }
      } catch (error) {
        console.error('Service Worker registration failed:', error);
        setError('Failed to initialize SCORM player');
      }
    };

    const loadScormContent = async () => {
      if (!scormPackage?.scos?.[currentSco]) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const sco = scormPackage.scos[currentSco];
        const resource = scormPackage.resources[sco.identifierref];
        
        if (!resource?.href) {
          throw new Error('Content file not found for this SCO');
        }

        const zipContent = scormPackage.zipContent;
        if (!zipContent) {
          throw new Error('ZIP content not available');
        }
        
        let resourcePath = resource.href;
        const resourceDir = resourcePath && resourcePath.includes('/') 
          ? resourcePath.substring(0, resourcePath.lastIndexOf('/') + 1)
          : '';

        // Collect all files and convert to blobs
        const fileMap = new Map<string, ArrayBuffer>();
        const allFiles = Object.keys(zipContent.files).filter(
          (fileName: string) => !zipContent.files[fileName].dir
        );

        for (const fileName of allFiles) {
          const file = zipContent.file(fileName);
          if (!file) continue;
          const blob = await file.async('blob');
          const arrayBuffer = await blob.arrayBuffer();
          fileMap.set(fileName, arrayBuffer);
        }

        // Heuristic: some packages point to shared/launchpage.html; pick a real entry if so
        const hasFile = (p: string) => !!p && fileMap.has(p);
        const isLaunchPage = /launchpage\.html?$/i.test(resourcePath || '');
        if (!resourcePath || !hasFile(resourcePath) || isLaunchPage) {
          const candidates = [
            resourceDir + 'index.html',
            resourceDir + 'index.htm'
          ];
          let chosen = candidates.find(hasFile);
          if (!chosen) {
            // pick first html in the resource directory (excluding launchpage)
            const htmlInDir = allFiles.filter(f => f.startsWith(resourceDir) && /\.html?$/i.test(f) && !/launchpage\.html?$/i.test(f));
            if (htmlInDir.length) chosen = htmlInDir[0];
          }
          if (chosen) {
            console.log('Adjusted SCO entry from', resourcePath, 'to', chosen);
            resourcePath = chosen;
          }
        }

        // Send files to service worker
        if (swRegistrationRef.current?.active) {
          swRegistrationRef.current.active.postMessage({
            type: 'INIT_SCORM',
            files: Array.from(fileMap.entries()),
            baseUrl: resourceDir
          });
        }

        // Wait a bit for SW to process
        await new Promise(resolve => setTimeout(resolve, 100));

        // Set the content URL to use the service worker
        const swUrl = `/scorm-content/${resourcePath}`;
        console.log('Loading SCORM content from:', swUrl);
        setContentUrl(swUrl);
        setIsLoading(false);

      } catch (err) {
        console.error('Error loading SCORM content:', err);
        setError(err instanceof Error ? err.message : 'Failed to load content');
        setIsLoading(false);
      }
    };

    const handleFullscreen = () => {
      setIsFullscreen(!isFullscreen);
    };

    const enterFullscreen = async () => {
      if (!containerRef.current) return;
      
      try {
        if (containerRef.current.requestFullscreen) {
          await containerRef.current.requestFullscreen();
        }
        setIsFullscreenMode(true);
      } catch (error) {
        console.error('Error entering fullscreen:', error);
      }
    };

    const exitFullscreen = async () => {
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        }
        setIsFullscreenMode(false);
      } catch (error) {
        console.error('Error exiting fullscreen:', error);
      }
    };

    // Enhanced auto-navigation utilities
    const navigationKeywords = [
      'next','continue','forward','proceed','start','begin','play','resume','go','advance','ok','submit',
      'launch','open','enter','start course','begin course','play course','continue course','next slide','next page',
      // Symbols
      'arrow-right','→','►','›','»',
      // Multilingual common terms
      'suivant','suivante','weiter','siguiente','próximo','proximo','avançar','avancar','继续','次へ','開始','播放'
    ];

    // Try to proactively start any media elements (videos/audios) that may gate progression
    const ensureMediaPlayback = (docs: Document[]) => {
      for (const d of docs) {
        try {
          const media = Array.from(d.querySelectorAll<HTMLMediaElement>('video, audio'));
          for (const el of media) {
            try {
              el.muted = false;
              el.volume = 1.0;
              const playPromise = el.play();
              if (playPromise && typeof (playPromise as any).catch === 'function') {
                (playPromise as Promise<void>).catch(() => {});
              }
            } catch {}
          }
        } catch {}
      }
    };

    const collectDocuments = (doc: Document): Document[] => {
      const docs: Document[] = [doc];
      const iframes = Array.from(doc.querySelectorAll('iframe')) as HTMLIFrameElement[];
      for (const f of iframes) {
        try {
          const child = f.contentDocument || f.contentWindow?.document;
          if (child) docs.push(...collectDocuments(child));
        } catch (_) {
          // cross-origin iframe, ignore
        }
      }
      return docs;
    };

    const isElementVisible = (el: Element, doc: Document): boolean => {
      const htmlEl = el as HTMLElement;
      const rect = htmlEl.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      const style = doc.defaultView?.getComputedStyle(htmlEl);
      if (!style) return false;
      const hidden = style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') < 0.1;
      if (hidden) return false;
      return true;
    };

    const collectCandidates = (doc: Document): HTMLElement[] => {
      const clickableSelectors = [
        'button:not([disabled])',
        'a[href]:not([disabled])',
        'input[type="button"]:not([disabled])',
        'input[type="submit"]:not([disabled])',
        '[role="button"]:not([disabled])',
        // Framework-specific
        '.slide-button', '.navigation-button', '[data-acc-text*="next"]', '[data-acc-text*="continue"]',
        '.playbar', '.cpPlaybarButton', '.navigate-next', '.ispring-next',
        // Generic patterns
        '[class*="next"]', '[class*="continue"]', '[class*="forward"]', '[class*="proceed"]', '[class*="navigation"]', '[class*="arrow"]',
        '[id*="next"]', '[id*="continue"]', '[id*="forward"]',
        '[aria-label*="next"]', '[aria-label*="continue"]', '[title*="next"]', '[title*="continue"]',
        // Divs/spans acting as buttons
        'div[onclick]', 'span[onclick]', 'div[role="button"]', 'span[role="button"]'
      ];
      const nodes = Array.from(doc.querySelectorAll(clickableSelectors.join(','))) as HTMLElement[];
      return nodes.filter(n => isElementVisible(n, doc));
    };

    const scoreElement = (el: HTMLElement, doc: Document): number => {
      let score = 0;
      const text = (el.textContent || '').toLowerCase().trim();
      const classAttr = (typeof (el as any).className === 'string' 
        ? (el as any).className 
        : (el.getAttribute('class') || '')).toLowerCase();
      const id = (el.id || '').toLowerCase();
      const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
      const title = (el.getAttribute('title') || '').toLowerCase();
      const dataText = (el.getAttribute('data-acc-text') || '').toLowerCase();
      const combined = `${text} ${classAttr} ${id} ${ariaLabel} ${title} ${dataText}`;
      navigationKeywords.forEach(k => { if (combined.includes(k)) score += 12; });
      if (text === 'next' || text === 'continue' || text === 'start' || text === 'begin') score += 18;
      if (el.tagName === 'BUTTON' || el.tagName === 'A') score += 6;
      if (classAttr.includes('nav')) score += 5;
      if (classAttr.includes('btn')) score += 3;
      const rect = el.getBoundingClientRect();
      const vw = doc.defaultView?.innerWidth || 0;
      if (rect.right > vw * 0.7) score += 4;
      if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true' || classAttr.includes('disabled')) score -= 20;
      return score;
    };

    const findSequentialMenuTarget = (doc: Document): HTMLElement | null => {
      // 1) Try active/current -> next sibling
      const activeSel = [
        '.toc .active', '.toc .current', '.menu .active', '.menu .current',
        '[aria-current="true"]', '[aria-selected="true"]', '.outline-item.active', '.outline-item.current'
      ].join(',');
      const active = doc.querySelector(activeSel) as HTMLElement | null;
      if (active && active.parentElement) {
        const nextLi = active.parentElement.nextElementSibling as HTMLElement | null;
        const anchor = nextLi?.querySelector('a,button,[role="button"]') as HTMLElement | null;
        if (anchor && isElementVisible(anchor, doc)) return anchor;
      }

      // 2) Try first not-completed/locked item in typical menus
      const items = Array.from(doc.querySelectorAll('.toc li, .menu li, .outline li, nav li')) as HTMLElement[];
      for (const item of items) {
        const cls = (item.className || '').toLowerCase();
        if (/(completed|done|visited|passed|locked|disabled)/.test(cls)) continue;
        const anchor = item.querySelector('a,button,[role="button"]') as HTMLElement | null;
        if (anchor && isElementVisible(anchor, doc)) return anchor;
      }

      // 3) Fallback to first clickable item in nav areas
      const firstMenuItem = doc.querySelector('.toc a, .menu a, .outline a, nav a, [role="treeitem"] a') as HTMLElement | null;
      return firstMenuItem && isElementVisible(firstMenuItem, doc) ? firstMenuItem : null;
    };

    const simulateKeySequence = (doc: Document) => {
      const keys = ['ArrowRight', 'Enter', ' '];
      keys.forEach(key => {
        const down = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
        const up = new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true });
        doc.dispatchEvent(down);
        doc.dispatchEvent(up);
      });
    };

    const autoClickElements = () => {
      if (!iframeRef.current || !isRecording) return;
      try {
        const rootDoc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
        if (!rootDoc) return;

        const docs = collectDocuments(rootDoc);

        // Proactively try to start media that might be pausing progression
        ensureMediaPlayback(docs);
        // Gather and score candidates across all documents
        let best: { el: HTMLElement; doc: Document; score: number } | null = null;
        for (const d of docs) {
          const candidates = collectCandidates(d);
          for (const el of candidates) {
            const s = scoreElement(el, d);
            if (s > 0 && (!best || s > best.score)) best = { el, doc: d, score: s };
          }
        }

        const now = Date.now();
        const clickWithGuard = (el: HTMLElement, doc: Document, reason: string) => {
          const sig = `${doc.URL}|${el.id}|${(el.className||'').toString()}|${(el.textContent||'').trim().slice(0,30)}`;
          if (lastActionRef.current && lastActionRef.current.sig === sig && now - lastActionRef.current.ts < 3000) {
            return; // avoid rapid re-clicking same element
          }
          simulateClick(el, doc);
          lastActionRef.current = { sig, ts: now };
          console.log('Auto-click:', reason, el);
        };

        if (best) {
          clickWithGuard(best.el, best.doc, `best-candidate score=${best.score}`);
          return;
        }

        // Try menu progression
        for (const d of docs) {
          const menuTarget = findSequentialMenuTarget(d);
          if (menuTarget) {
            clickWithGuard(menuTarget, d, 'menu-sequence');
            return;
          }
        }

        // Fallback: keyboard navigation on root doc
        simulateKeySequence(rootDoc);
        console.log('Auto-nav fallback: keyboard sequence');
      } catch (error) {
        console.warn('Auto-click error:', error);
      }
    };

    // Helper function to simulate various types of clicks
    const simulateClick = (element: HTMLElement, doc: Document) => {
      try {
        const mouseDown = new MouseEvent('mousedown', { view: doc.defaultView, bubbles: true, cancelable: true });
        const mouseUp = new MouseEvent('mouseup', { view: doc.defaultView, bubbles: true, cancelable: true });
        const click = new MouseEvent('click', { view: doc.defaultView, bubbles: true, cancelable: true });
        element.dispatchEvent(mouseDown);
        element.dispatchEvent(mouseUp);
        element.dispatchEvent(click);
        if (typeof element.click === 'function') element.click();
        try {
          const pointerDown = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
          const pointerUp = new PointerEvent('pointerup', { bubbles: true, cancelable: true });
          element.dispatchEvent(pointerDown);
          element.dispatchEvent(pointerUp);
        } catch {}
      } catch (error) {
        console.warn('Click simulation error:', error);
      }
    };

    // Set up auto-click interval when recording
    useEffect(() => {
      if (isRecording) {
        // Start auto-clicking more frequently to handle content that advances quickly
        autoClickIntervalRef.current = setInterval(() => {
          autoClickElements();
        }, 3000);
        
        // Also try an immediate click after 1 second for initial content
        const initialTimeout = setTimeout(() => {
          autoClickElements();
        }, 1000);
        
        return () => {
          if (autoClickIntervalRef.current) {
            clearInterval(autoClickIntervalRef.current);
          }
          clearTimeout(initialTimeout);
        };
      } else {
        // Clear interval when not recording
        if (autoClickIntervalRef.current) {
          clearInterval(autoClickIntervalRef.current);
        }
      }
    }, [isRecording]);

    // Listen for fullscreen changes
    useEffect(() => {
      const handleFullscreenChange = () => {
        setIsFullscreenMode(!!document.fullscreenElement);
      };

      document.addEventListener('fullscreenchange', handleFullscreenChange);
      return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    useEffect(() => {
      if (isRecording) setShowStartPrompt(false);
    }, [isRecording]);
    const handleRefresh = () => {
      loadScormContent();
    };

    const handleIframeLoad = () => {
      setIsLoading(false);

      // Set up MutationObserver inside the SCORM iframe to react to UI changes
      if (mutationObserverRef.current) {
        try { mutationObserverRef.current.disconnect(); } catch {}
        mutationObserverRef.current = null;
      }
      const doc = iframeRef.current?.contentDocument || iframeRef.current?.contentWindow?.document;
      if (doc?.body) {
        const docs = collectDocuments(doc);
        // Observe root and nested iframes for UI changes
        docs.forEach((d, idx) => {
          try {
            const obs = new MutationObserver(() => {
              requestAnimationFrame(() => autoClickElements());
            });
            obs.observe(d.body, {
              childList: true,
              subtree: true,
              attributes: true,
              attributeFilter: ['class','style','disabled','aria-disabled','aria-hidden']
            });
            if (idx === 0) mutationObserverRef.current = obs;
          } catch {}
        });
        // Kickstart an attempt shortly after load
        setTimeout(() => autoClickElements(), 800);
        setShowStartPrompt(false);
        if (!isRecording) onRequestStartRecording?.();
      }
    };

    const currentScoData = scormPackage?.scos?.[currentSco];

    return (
      <div ref={containerRef} className={isFullscreenMode ? 'bg-black' : ''}>
      <Card className={`bg-card shadow-player ${isFullscreen ? 'fixed inset-4 z-50' : ''}`}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            {onBack && (
              <Button variant="ghost" size="sm" onClick={onBack}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Back
              </Button>
            )}
            <Badge variant="outline" className="text-xs">
              SCO {currentSco + 1}
            </Badge>
            <h3 className="font-medium text-card-foreground">
              {currentScoData?.title || 'Loading...'}
            </h3>
          </div>
          
          <div className="flex items-center gap-2">
            {isRecording && (
              <Badge variant="destructive" className="animate-pulse">
                Auto-Navigate
              </Badge>
            )}
            <Button variant="ghost" size="sm" onClick={handleRefresh}>
              <RotateCcw className="w-4 h-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => contentUrl && window.open(contentUrl, '_blank')}
              disabled={!contentUrl}
            >
              <ExternalLink className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleFullscreen}>
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={isFullscreenMode ? exitFullscreen : enterFullscreen}
              title={isFullscreenMode ? "Exit Fullscreen" : "Enter Fullscreen"}
            >
              <Maximize className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Content Area */}
        <div className="relative bg-player-content" style={{ height: isFullscreen ? 'calc(100vh - 12rem)' : '600px' }}>
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-player-content">
              <div className="text-center space-y-4">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                <p className="text-sm text-muted-foreground">Loading SCORM content...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-player-content">
              <div className="text-center space-y-4 p-8">
                <AlertTriangle className="w-12 h-12 mx-auto text-warning" />
                <div>
                  <h4 className="font-medium text-foreground mb-2">Failed to Load Content</h4>
                  <p className="text-sm text-muted-foreground">{error}</p>
                </div>
                <Button variant="outline" onClick={handleRefresh}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Try Again
                </Button>
              </div>
            </div>
          )}

          {/* Recording Permission Prompt Overlay */}
          {showStartPrompt && !isRecording && contentUrl && !isLoading && !error && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
              <div className="text-center space-y-4 p-6 rounded-lg bg-card shadow-card">
                <h4 className="font-semibold text-card-foreground">Start Auto Recording</h4>
                <p className="text-sm text-muted-foreground">To capture only the SCORM player area, click the button below and allow screen recording in your browser.</p>
                <Button
                  variant="gradient"
                  onClick={() => {
                    onRequestStartRecording?.();
                    setShowStartPrompt(false);
                  }}
                >
                  <Monitor className="w-4 h-4 mr-2" />
                  Start Auto Recording
                </Button>
              </div>
            </div>
          )}

          {contentUrl && (
            <iframe
              ref={iframeRef}
              src={contentUrl}
              className="w-full h-full border-0"
              onLoad={handleIframeLoad}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
              allow="autoplay; fullscreen; picture-in-picture"
            />
          )}
        </div>
      </Card>
      </div>
    );
  }
);

ContentViewer.displayName = 'ContentViewer';

export default ContentViewer;