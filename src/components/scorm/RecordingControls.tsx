import { useState, useRef, forwardRef, useImperativeHandle } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { 
  Play, 
  Pause, 
  Square, 
  Monitor,
  Download,
  Settings,
  Timer,
  Circle,
  Scissors
} from "lucide-react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { useToast } from "@/hooks/use-toast";
import html2canvas from "html2canvas";

interface RecordingControlsProps {
  isRecording: boolean;
  onToggleRecording: () => void;
  contentRef: React.RefObject<HTMLIFrameElement>;
}

const RecordingControls = forwardRef<{ startRecording: () => void; stopRecording: () => void; convertToMp4: () => void; saveMp4: () => void }, RecordingControlsProps>(
  ({ isRecording, onToggleRecording, contentRef }, ref) => {
  const [recordingTime, setRecordingTime] = useState(0);
  const [hasRecording, setHasRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState(0);
  const [showTrimControls, setShowTrimControls] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout>();
  const recordedChunks = useRef<Blob[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number>();
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const captureVideoRef = useRef<HTMLVideoElement | null>(null);
  const snapshotTimerRef = useRef<number | null>(null);
  const [mp4PreviewUrl, setMp4PreviewUrl] = useState<string | null>(null);
  const { toast } = useToast();

  const startRecording = async () => {
    try {
      if (!contentRef.current) {
        console.error('Content iframe not available');
        return;
      }

      // Reset previous previews
      try {
        if (videoPreviewUrl) {
          URL.revokeObjectURL(videoPreviewUrl);
          setVideoPreviewUrl(null);
        }
        if (mp4PreviewUrl) {
          URL.revokeObjectURL(mp4PreviewUrl);
          setMp4PreviewUrl(null);
        }
      } catch {}

      // Create an offscreen canvas that mirrors ONLY the SCORM iframe area (no permission prompts)
      const iframe = contentRef.current;
      const rect = iframe.getBoundingClientRect();
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(320, Math.floor(rect.width || 1920));
      canvas.height = Math.max(240, Math.floor(rect.height || 1080));
      canvasRef.current = canvas;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Failed to get canvas context');

      const targetDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!targetDoc) throw new Error('Cannot access SCORM document for capture. It might be cross-origin.');

      // Create MediaRecorder from the canvas stream (video only)
      const fps = 10;
      const stream = canvas.captureStream(fps);

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' } as MediaRecorderOptions);
      } catch {
        try {
          recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' } as MediaRecorderOptions);
        } catch {
          recorder = new MediaRecorder(stream);
        }
      }

      recordedChunks.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunks.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        setHasRecording(true);
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        if (snapshotTimerRef.current) {
          clearTimeout(snapshotTimerRef.current);
          snapshotTimerRef.current = null;
        }

        // Create preview URL for trimming
        const webmBlob = new Blob(recordedChunks.current, { type: 'video/webm' });
        const url = URL.createObjectURL(webmBlob);
        setVideoPreviewUrl(url);
        setTrimEnd(recordingTime);
        setShowTrimControls(true);
      };

      recorder.start(1000);
      setMediaRecorder(recorder);

      // Snapshot loop using html2canvas against the iframe's DOM (same-origin)
      const captureViewport = async () => {
        if (!canvasRef.current || !mediaRecorder || mediaRecorder.state !== 'recording') return;
        try {
          const nowRect = iframe.getBoundingClientRect();
          const w = Math.max(1, Math.floor(nowRect.width));
          const h = Math.max(1, Math.floor(nowRect.height));
          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
          }

          const view = targetDoc.defaultView;
          const snapCanvas = await html2canvas(targetDoc.documentElement, {
            backgroundColor: '#ffffff',
            useCORS: true,
            logging: false,
            // Crop to the iframe's current viewport
            x: (view?.scrollX || 0),
            y: (view?.scrollY || 0),
            width: w,
            height: h,
            windowWidth: w,
            windowHeight: h,
            scale: 1,
          } as any);

          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(snapCanvas, 0, 0, canvas.width, canvas.height);
        } catch (e) {
          // Best effort capture; ignore transient errors
        } finally {
          snapshotTimerRef.current = window.setTimeout(captureViewport, Math.floor(1000 / fps));
        }
      };
      captureViewport();

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

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    canvasRef.current = null;
    onToggleRecording();
  };

  const loadFFmpeg = async () => {
    if (ffmpegRef.current) return ffmpegRef.current;
    
    const ffmpeg = new FFmpeg();
    ffmpegRef.current = ffmpeg;
    
    try {
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      
      ffmpeg.on('progress', ({ progress }) => {
        setConversionProgress(Math.round(progress * 100));
      });
      ffmpeg.on('log', ({ message }) => {
        console.log('[ffmpeg]', message);
      });
      
      return ffmpeg;
    } catch (error) {
      console.error('Failed to load FFmpeg:', error);
      toast({
        title: "Conversion Error",
        description: "Failed to load video converter. Downloading as WebM instead.",
        variant: "destructive",
      });
      return null;
    }
  };

  const downloadRecording = async () => {
    if (recordedChunks.current.length === 0) return;
    
    try {
      setIsConverting(true);
      setConversionProgress(0);
      setShowTrimControls(false);
      
      const webmBlob = new Blob(recordedChunks.current, { type: 'video/webm' });
      
      toast({
        title: "Converting to MP4",
        description: "Please wait while we convert and trim your recording...",
      });
      
      const ffmpeg = await loadFFmpeg();
      
      if (!ffmpeg) {
        // Fallback to WebM if FFmpeg fails
        const url = URL.createObjectURL(webmBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `scorm-recording-${new Date().toISOString().split('T')[0]}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setIsConverting(false);
        return;
      }
      
      // Write input file to FFmpeg file system
      await ffmpeg.writeFile('input.webm', await fetchFile(webmBlob));
      
      // Build FFmpeg command with trimming
      const ffmpegArgs = ['-i', 'input.webm'];
      
      // Add trim parameters if trim values are set
      if (trimStart > 0 || trimEnd < recordingTime) {
        ffmpegArgs.push('-ss', trimStart.toString());
        if (trimEnd > trimStart) {
          ffmpegArgs.push('-to', trimEnd.toString());
        }
      }
      
      // Add encoding parameters (with broad compatibility)
      ffmpegArgs.push(
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        'output.mp4'
      );
      
      // Convert to MP4 with trimming
      try {
        await ffmpeg.exec(ffmpegArgs);
      } catch (e) {
        console.warn('FFmpeg failed with audio, retrying without audio...', e);
        const fallbackArgs = ffmpegArgs.filter((a, i) => !(ffmpegArgs[i-1] === '-c:a' || ffmpegArgs[i-1] === '-b:a'))
          .flatMap(a => a);
        // Remove audio settings and disable audio
        const base = ['-i','input.webm'];
        if (trimStart > 0 || trimEnd < recordingTime) {
          base.push('-ss', trimStart.toString());
          if (trimEnd > trimStart) base.push('-to', trimEnd.toString());
        }
        await ffmpeg.exec([...base, '-c:v','libx264','-preset','veryfast','-crf','23','-pix_fmt','yuv420p','-an','-movflags','+faststart','output.mp4']);
      }
      
      // Read the output file
      const data = await ffmpeg.readFile('output.mp4');
      const mp4Blob = new Blob([data], { type: 'video/mp4' });
      
      // Prepare MP4 preview instead of immediate download
      const url = URL.createObjectURL(mp4Blob);
      setMp4PreviewUrl(url);
      
      toast({
        title: 'Preview Ready',
        description: 'Review the MP4 preview below and click Save MP4 to download.',
      });
      
      // Cleanup FFmpeg files
      await ffmpeg.deleteFile('input.webm');
      await ffmpeg.deleteFile('output.mp4');
      
      // Cleanup preview URL
      if (videoPreviewUrl) {
        URL.revokeObjectURL(videoPreviewUrl);
        setVideoPreviewUrl(null);
      }
      
      toast({
        title: "Success",
        description: "Recording converted to MP4. Preview is ready.",
      });
      
    } catch (error) {
      console.error('Error converting recording:', error);
      toast({
        title: "Conversion Failed",
        description: "Failed to convert to MP4. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsConverting(false);
      setConversionProgress(0);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Expose controls to parent
  useImperativeHandle(ref, () => ({
    startRecording,
    stopRecording,
    convertToMp4: () => downloadRecording(),
    saveMp4: () => {
      if (mp4PreviewUrl) {
        const a = document.createElement('a');
        a.href = mp4PreviewUrl;
        a.download = `scorm-recording-${new Date().toISOString().split('T')[0]}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        downloadRecording();
      }
    }
  }));

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
              onClick={() => {
                if (mp4PreviewUrl) {
                  const a = document.createElement('a');
                  a.href = mp4PreviewUrl;
                  a.download = `scorm-recording-${new Date().toISOString().split('T')[0]}.mp4`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                } else {
                  downloadRecording();
                }
              }}
              variant="outline"
              disabled={isConverting}
            >
              <Download className="w-4 h-4 mr-2" />
              {isConverting ? 'Converting...' : (mp4PreviewUrl ? 'Save MP4' : 'Convert to MP4')}
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

      {/* Conversion Progress */}
      {isConverting && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Converting to MP4...</span>
            <span>{conversionProgress}%</span>
          </div>
          <Progress value={conversionProgress} className="h-2" />
        </div>
      )}

      {/* Video Trimming Controls */}
      {showTrimControls && videoPreviewUrl && (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Scissors className="w-4 h-4 text-primary" />
              <span className="font-medium text-sm">Trim Video</span>
            </div>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => {
                setShowTrimControls(false);
                setTrimStart(0);
                setTrimEnd(recordingTime);
              }}
            >
              Skip
            </Button>
          </div>

          {/* Video Preview */}
          <div className="bg-black rounded-lg overflow-hidden">
            <video
              ref={videoRef}
              src={videoPreviewUrl}
              controls
              className="w-full max-h-48"
              onLoadedMetadata={(e) => {
                const duration = (e.target as HTMLVideoElement).duration;
                if (duration && !trimEnd) {
                  setTrimEnd(duration);
                }
              }}
            />
          </div>

          {/* Trim Range Sliders */}
          <div className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Start Time</span>
                <span className="font-mono">{formatTime(trimStart)}</span>
              </div>
              <Slider
                value={[trimStart]}
                onValueChange={([value]) => setTrimStart(Math.min(value, trimEnd - 1))}
                max={recordingTime}
                step={0.1}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">End Time</span>
                <span className="font-mono">{formatTime(trimEnd)}</span>
              </div>
              <Slider
                value={[trimEnd]}
                onValueChange={([value]) => setTrimEnd(Math.max(value, trimStart + 1))}
                max={recordingTime}
                step={0.1}
                className="w-full"
              />
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border">
              <span>Trimmed Duration:</span>
              <span className="font-mono">{formatTime(trimEnd - trimStart)}</span>
            </div>
          </div>

          {/* Preview Trim Button */}
          <Button
            onClick={() => {
              if (videoRef.current) {
                videoRef.current.currentTime = trimStart;
                videoRef.current.play();
              }
            }}
            variant="outline"
            size="sm"
            className="w-full"
          >
            <Play className="w-4 h-4 mr-2" />
            Preview from Start Time
          </Button>
        </div>
      )}

      {mp4PreviewUrl && (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm">MP4 Preview</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (mp4PreviewUrl) {
                  const a = document.createElement('a');
                  a.href = mp4PreviewUrl;
                  a.download = `scorm-recording-${new Date().toISOString().split('T')[0]}.mp4`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                }
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              Save MP4
            </Button>
          </div>
          <div className="bg-black rounded-lg overflow-hidden">
            <video src={mp4PreviewUrl} controls className="w-full max-h-48" />
          </div>
        </div>
      )}
    </Card>
  );
});

RecordingControls.displayName = 'RecordingControls';

export default RecordingControls;