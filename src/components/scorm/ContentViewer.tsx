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
  Maximize
} from "lucide-react";

interface ContentViewerProps {
  scormPackage: any;
  currentSco: number;
  onProgressUpdate: (progress: number) => void;
  onBack?: () => void;
  isRecording?: boolean;
}

const ContentViewer = forwardRef<HTMLIFrameElement, ContentViewerProps>(
  ({ scormPackage, currentSco, onProgressUpdate, onBack, isRecording = false }, ref) => {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [contentUrl, setContentUrl] = useState<string | null>(null);
const iframeRef = useRef<HTMLIFrameElement>(null);
const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);
const containerRef = useRef<HTMLDivElement>(null);
const autoClickIntervalRef = useRef<NodeJS.Timeout>();
const [swReady, setSwReady] = useState(false);
const [isFullscreenMode, setIsFullscreenMode] = useState(false);

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

    // Auto-click functionality for recording
    const autoClickElements = () => {
      if (!iframeRef.current || !isRecording) return;

      try {
        const iframeDoc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
        if (!iframeDoc) return;

        // Find clickable elements (buttons, links, next buttons, etc.)
        const clickableSelectors = [
          'button:not([disabled])',
          'a[href]:not([disabled])',
          '[role="button"]:not([disabled])',
          '.next-button',
          '.continue-button',
          '[class*="next"]:not([disabled])',
          '[class*="continue"]:not([disabled])',
          '[id*="next"]:not([disabled])',
          '[id*="continue"]:not([disabled])',
          'input[type="submit"]:not([disabled])',
        ];

        const elements = iframeDoc.querySelectorAll(clickableSelectors.join(','));
        
        if (elements.length > 0) {
          // Find the most likely "next" or "continue" button
          const nextButton = Array.from(elements).find((el: Element) => {
            const text = el.textContent?.toLowerCase() || '';
            const className = el.className?.toLowerCase() || '';
            const id = el.id?.toLowerCase() || '';
            return text.includes('next') || text.includes('continue') || 
                   className.includes('next') || className.includes('continue') ||
                   id.includes('next') || id.includes('continue');
          }) || elements[0];

          // Simulate click
          const clickEvent = new MouseEvent('click', {
            view: iframeDoc.defaultView,
            bubbles: true,
            cancelable: true
          });
          (nextButton as HTMLElement).dispatchEvent(clickEvent);
          console.log('Auto-clicked element:', nextButton);
        }
      } catch (error) {
        console.warn('Auto-click error:', error);
      }
    };

    // Set up auto-click interval when recording
    useEffect(() => {
      if (isRecording) {
        // Start auto-clicking every 5 seconds
        autoClickIntervalRef.current = setInterval(() => {
          autoClickElements();
        }, 5000);
      } else {
        // Clear interval when not recording
        if (autoClickIntervalRef.current) {
          clearInterval(autoClickIntervalRef.current);
        }
      }

      return () => {
        if (autoClickIntervalRef.current) {
          clearInterval(autoClickIntervalRef.current);
        }
      };
    }, [isRecording]);

    // Listen for fullscreen changes
    useEffect(() => {
      const handleFullscreenChange = () => {
        setIsFullscreenMode(!!document.fullscreenElement);
      };

      document.addEventListener('fullscreenchange', handleFullscreenChange);
      return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const handleRefresh = () => {
      loadScormContent();
    };

    const handleIframeLoad = () => {
      setIsLoading(false);
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