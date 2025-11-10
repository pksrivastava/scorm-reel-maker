import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  Play, 
  Pause, 
  Square, 
  Upload, 
  Download, 
  Settings,
  Monitor,
  FileText,
  Clock,
  CheckCircle
} from "lucide-react";
import ScormUploader from "@/components/scorm/ScormUploader";
import ContentViewer from "@/components/scorm/ContentViewer";
import RecordingControls from "@/components/scorm/RecordingControls";
import ProgressTracker from "@/components/scorm/ProgressTracker";

const ScormPlayer = () => {
  const [scormPackage, setScormPackage] = useState<any>(null);
  const [currentSco, setCurrentSco] = useState<number>(0);
  const [isRecording, setIsRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [completionStatus, setCompletionStatus] = useState<'incomplete' | 'completed' | 'passed' | 'failed'>('incomplete');
  const [autoRecordTriggered, setAutoRecordTriggered] = useState(false);
  
  const contentRef = useRef<HTMLIFrameElement>(null);
  const recordingControlsRef = useRef<{ startRecording: () => void; stopRecording: () => void; convertToMp4: () => void; saveMp4: () => void } | null>(null);

  const handlePackageLoad = (packageData: any) => {
    setScormPackage(packageData);
    setCurrentSco(0);
    setProgress(0);
    setCompletionStatus('incomplete');
    setAutoRecordTriggered(false);
  };

  const handleRecordingToggle = () => {
    setIsRecording(!isRecording);
  };

  const handleProgressUpdate = (newProgress: number) => {
    setProgress(newProgress);
    if (newProgress >= 100) {
      setCompletionStatus('completed');
    }
  };

  // Recording auto-start is triggered by ContentViewer when iframe loads to avoid permission prompts
  useEffect(() => {
    if (scormPackage && !autoRecordTriggered) {
      setAutoRecordTriggered(true);
    }
  }, [scormPackage, autoRecordTriggered]);

  // Auto-advance to next SCO when current one signals completion
  useEffect(() => {
    if (!scormPackage?.scos?.length) return;
    if (progress < 100) return;

    const isLast = currentSco >= scormPackage.scos.length - 1;
    if (!isLast) {
      // Move to next SCO and reset progress
      setCurrentSco((i) => Math.min(i + 1, scormPackage.scos.length - 1));
      setProgress(0);
    } else {
      // Finished all SCOs
      setCompletionStatus('completed');
      if (isRecording) {
        // Best-effort stop recording if active
        recordingControlsRef.current?.stopRecording?.();
      }
    }
  }, [progress, currentSco, isRecording, scormPackage]);

  return (
    <div className="min-h-screen bg-gradient-bg">
      <div className="container mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                SCORM Player Studio
              </h1>
              <p className="text-muted-foreground text-lg">
                Play, record, and convert SCORM content to MP4
              </p>
            </div>
            <div className="flex gap-3">
              {scormPackage && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    setScormPackage(null);
                    setCurrentSco(0);
                    setProgress(0);
                    setCompletionStatus('incomplete');
                  }}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  New Package
                </Button>
              )}
              <Button variant="outline" size="sm">
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>
              <Button variant="gradient" size="sm" onClick={() => recordingControlsRef.current?.saveMp4?.()}>
                <Download className="w-4 h-4 mr-2" />
                Export MP4
              </Button>
            </div>
          </div>

          {/* Status Bar */}
          {scormPackage && (
            <div className="flex items-center gap-4 p-4 bg-card rounded-lg shadow-card">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                <span className="font-medium">{scormPackage.title || 'SCORM Package'}</span>
              </div>
              <Badge variant={completionStatus === 'completed' ? 'default' : 'secondary'}>
                <CheckCircle className="w-3 h-3 mr-1" />
                {completionStatus}
              </Badge>
              {isRecording && (
                <Badge variant="destructive" className="animate-pulse">
                  <Monitor className="w-3 h-3 mr-1" />
                  Recording
                </Badge>
              )}
              <div className="flex items-center gap-2 ml-auto">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {Math.floor(progress)}% Complete
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="grid lg:grid-cols-4 gap-6">
          {/* Main Content Area */}
          <div className="lg:col-span-3">
            {!scormPackage ? (
              <ScormUploader onPackageLoad={handlePackageLoad} />
            ) : (
              <div className="space-y-4">
                <ContentViewer 
                  ref={contentRef}
                  scormPackage={scormPackage}
                  currentSco={currentSco}
                  onProgressUpdate={handleProgressUpdate}
                  onBack={() => setScormPackage(null)}
                  isRecording={isRecording}
                  onRequestStartRecording={() => recordingControlsRef.current?.startRecording()}
                />
                <RecordingControls 
                  ref={recordingControlsRef}
                  isRecording={isRecording}
                  onToggleRecording={handleRecordingToggle}
                  contentRef={contentRef}
                />
              </div>
            )}
          </div>

          {/* Side Panel */}
          <div className="space-y-4">
            {scormPackage && (
              <>
                <ProgressTracker 
                  scormPackage={scormPackage}
                  currentSco={currentSco}
                  onScoSelect={setCurrentSco}
                  progress={progress}
                />
                
                {/* Package Info */}
                <Card className="p-4 bg-card shadow-card">
                  <h3 className="font-semibold mb-3 text-card-foreground">Package Information</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Version:</span>
                      <span>{scormPackage.version || '1.2'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Items:</span>
                      <span>{scormPackage.scos?.length || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status:</span>
                      <Badge variant="outline" className="h-5">
                        {completionStatus}
                      </Badge>
                    </div>
                  </div>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScormPlayer;