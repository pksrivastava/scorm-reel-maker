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
  AlertTriangle
} from "lucide-react";

interface ContentViewerProps {
  scormPackage: any;
  currentSco: number;
  onProgressUpdate: (progress: number) => void;
}

const ContentViewer = forwardRef<HTMLIFrameElement, ContentViewerProps>(
  ({ scormPackage, currentSco, onProgressUpdate }, ref) => {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [contentUrl, setContentUrl] = useState<string | null>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    useImperativeHandle(ref, () => iframeRef.current!);

    useEffect(() => {
      loadScormContent();
    }, [scormPackage, currentSco]);

    const loadScormContent = async () => {
      if (!scormPackage?.scos?.[currentSco]) return;

      setIsLoading(true);
      setError(null);

      try {
        const sco = scormPackage.scos[currentSco];
        const resource = scormPackage.resources[sco.identifierref];
        
        if (!resource?.href) {
          throw new Error('Content file not found for this SCO');
        }

        // Get the content file from zip
        const file = scormPackage.zipContent.file(resource.href);
        if (!file) {
          throw new Error(`File not found: ${resource.href}`);
        }

        const content = await file.async('text');
        
        // Create a blob URL for the content
        const blob = new Blob([content], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        
        setContentUrl(url);
        setIsLoading(false);

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load content');
        setIsLoading(false);
      }
    };

    const handleFullscreen = () => {
      setIsFullscreen(!isFullscreen);
    };

    const handleRefresh = () => {
      loadScormContent();
    };

    const handleIframeLoad = () => {
      setIsLoading(false);
      
      // Initialize SCORM API simulation
      if (iframeRef.current?.contentWindow) {
        try {
          // Add SCORM API to iframe
          const scormAPI = {
            LMSInitialize: () => "true",
            LMSFinish: () => {
              onProgressUpdate(100);
              return "true";
            },
            LMSGetValue: (element: string) => {
              switch (element) {
                case "cmi.core.lesson_status":
                  return "incomplete";
                case "cmi.core.student_id":
                  return "student_001";
                case "cmi.core.student_name":
                  return "Demo Student";
                default:
                  return "";
              }
            },
            LMSSetValue: (element: string, value: string) => {
              if (element === "cmi.core.lesson_status" && value === "completed") {
                onProgressUpdate(100);
              }
              return "true";
            },
            LMSCommit: () => "true",
            LMSGetLastError: () => "0",
            LMSGetErrorString: () => "",
            LMSGetDiagnostic: () => ""
          };

          (iframeRef.current.contentWindow as any).API = scormAPI;
        } catch (err) {
          console.warn('Failed to inject SCORM API:', err);
        }
      }
    };

    const currentScoData = scormPackage?.scos?.[currentSco];

    return (
      <Card className={`bg-card shadow-player ${isFullscreen ? 'fixed inset-4 z-50' : ''}`}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-xs">
              SCO {currentSco + 1}
            </Badge>
            <h3 className="font-medium text-card-foreground">
              {currentScoData?.title || 'Loading...'}
            </h3>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleRefresh}>
              <RotateCcw className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm">
              <ExternalLink className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleFullscreen}>
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
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
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          )}
        </div>
      </Card>
    );
  }
);

ContentViewer.displayName = 'ContentViewer';

export default ContentViewer;