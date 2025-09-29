import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  PlayCircle, 
  CheckCircle, 
  Clock,
  FileText,
  ChevronRight
} from "lucide-react";

interface ProgressTrackerProps {
  scormPackage: any;
  currentSco: number;
  onScoSelect: (index: number) => void;
  progress: number;
}

const ProgressTracker = ({ scormPackage, currentSco, onScoSelect, progress }: ProgressTrackerProps) => {
  const scos = scormPackage?.scos || [];

  return (
    <Card className="p-4 bg-card shadow-card">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-card-foreground">Course Progress</h3>
          <Badge variant="outline" className="text-xs">
            {Math.floor(progress)}%
          </Badge>
        </div>

        {/* Overall Progress */}
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{scos.length} items</span>
            <span>{Math.floor(progress)}% complete</span>
          </div>
        </div>

        {/* SCO List */}
        <div className="space-y-1">
          <h4 className="text-sm font-medium text-card-foreground mb-2">Content Items</h4>
          
          {scos.map((sco: any, index: number) => {
            const isActive = index === currentSco;
            const isCompleted = progress >= ((index + 1) / scos.length) * 100;
            
            return (
              <Button
                key={sco.id || index}
                variant={isActive ? "secondary" : "ghost"}
                className={`
                  w-full justify-start p-3 h-auto text-left
                  ${isActive ? 'bg-secondary ring-1 ring-primary' : ''}
                `}
                onClick={() => onScoSelect(index)}
              >
                <div className="flex items-center gap-3 w-full">
                  <div className="flex-shrink-0">
                    {isCompleted ? (
                      <CheckCircle className="w-5 h-5 text-success" />
                    ) : isActive ? (
                      <PlayCircle className="w-5 h-5 text-primary" />
                    ) : (
                      <Clock className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <FileText className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        Item {index + 1}
                      </span>
                    </div>
                    <p className="text-sm font-medium truncate">
                      {sco.title || `SCO ${index + 1}`}
                    </p>
                  </div>
                  
                  {isActive && (
                    <ChevronRight className="w-4 h-4 text-primary flex-shrink-0" />
                  )}
                </div>
              </Button>
            );
          })}
        </div>

        {/* Statistics */}
        <div className="pt-3 border-t border-border">
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="space-y-1">
              <div className="text-lg font-semibold text-success">
                {scos.filter((_, index) => progress >= ((index + 1) / scos.length) * 100).length}
              </div>
              <div className="text-xs text-muted-foreground">Completed</div>
            </div>
            <div className="space-y-1">
              <div className="text-lg font-semibold text-primary">
                {scos.length - scos.filter((_, index) => progress >= ((index + 1) / scos.length) * 100).length}
              </div>
              <div className="text-xs text-muted-foreground">Remaining</div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default ProgressTracker;