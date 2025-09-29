import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Play, 
  Pause, 
  Square, 
  Monitor,
  Download,
  Settings,
  Timer,
  Circle
} from "lucide-react";

interface RecordingControlsProps {
  isRecording: boolean;
  onToggleRecording: () => void;
  contentRef: React.RefObject<HTMLIFrameElement>;
}

const RecordingControls = ({ isRecording, onToggleRecording, contentRef }: RecordingControlsProps) => {
  const [recordingTime, setRecordingTime] = useState(0);
  const [hasRecording, setHasRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout>();
  const recordedChunks = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      // Request screen capture
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 }
        } as MediaTrackConstraints,
        audio: true
      });

      const recorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9'
      });

      recordedChunks.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunks.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunks.current, { type: 'video/webm' });
        setHasRecording(true);
        
        // Stop all tracks to end screen sharing
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start(1000); // Collect data every second
      setMediaRecorder(recorder);

      // Start timer
      setRecordingTime(0);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      onToggleRecording();

    } catch (error) {
      console.error('Error starting recording:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      setMediaRecorder(null);
    }

    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
    }

    onToggleRecording();
  };

  const downloadRecording = () => {
    if (recordedChunks.current.length > 0) {
      const blob = new Blob(recordedChunks.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scorm-recording-${new Date().toISOString().split('T')[0]}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Card className="p-4 bg-player-controls shadow-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Recording Status */}
          <div className="flex items-center gap-2">
            {isRecording ? (
              <Circle className="w-3 h-3 fill-recording-active text-recording-active animate-pulse" />
            ) : (
              <Circle className="w-3 h-3 text-muted-foreground" />
            )}
            <Badge variant={isRecording ? "destructive" : "secondary"} className="text-xs">
              {isRecording ? "Recording" : "Ready"}
            </Badge>
          </div>

          {/* Timer */}
          {(isRecording || recordingTime > 0) && (
            <div className="flex items-center gap-2 text-sm">
              <Timer className="w-4 h-4 text-muted-foreground" />
              <span className="font-mono">{formatTime(recordingTime)}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Recording Controls */}
          {!isRecording ? (
            <Button 
              onClick={startRecording}
              variant="gradient"
            >
              <Monitor className="w-4 h-4 mr-2" />
              Start Recording
            </Button>
          ) : (
            <Button 
              onClick={stopRecording}
              variant="recording"
            >
              <Square className="w-4 h-4 mr-2" />
              Stop Recording
            </Button>
          )}

          {/* Download Button */}
          {hasRecording && (
            <Button 
              onClick={downloadRecording}
              variant="outline"
            >
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          )}

          {/* Settings */}
          <Button variant="ghost" size="sm">
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Recording Progress Indicator */}
      {isRecording && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Recording in progress...</span>
            <span>Click "Stop Recording" when finished</span>
          </div>
          <div className="w-full bg-progress-bg rounded-full h-1">
            <div 
              className="bg-recording-active h-1 rounded-full animate-pulse"
              style={{ width: '100%' }}
            />
          </div>
        </div>
      )}
    </Card>
  );
};

export default RecordingControls;