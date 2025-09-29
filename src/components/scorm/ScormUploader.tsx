import { useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, FileText, AlertCircle } from "lucide-react";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

interface ScormUploaderProps {
  onPackageLoad: (packageData: any) => void;
}

const ScormUploader = ({ onPackageLoad }: ScormUploaderProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const parseManifest = (manifestXml: string): Promise<any> => {
    return new Promise((resolve, reject) => {
      try {
        const parser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: '',
          trimValues: true,
          allowBooleanAttributes: true,
          removeNSPrefix: true,
        });

        const result = parser.parse(manifestXml);
        const manifest = result.manifest || result;
        const organizations = manifest.organizations?.organization;
        const resources = manifest.resources?.resource || [];

        const packageData: any = {
          title: organizations?.title || 'SCORM Package',
          identifier: manifest.identifier,
          version: manifest.version || '1.2',
          scos: [],
          resources: {},
        };

        // Parse SCOs from organization items
        if (organizations?.item) {
          const items = Array.isArray(organizations.item) ? organizations.item : [organizations.item];
          packageData.scos = items.map((item: any, index: number) => ({
            id: item.identifier || `item_${index}`,
            title: item.title || `Item ${index + 1}`,
            identifierref: item.identifierref,
            index,
          }));
        }

        // Parse resources
        const resourceArray = Array.isArray(resources) ? resources : [resources];
        resourceArray.forEach((resource: any) => {
          if (!resource) return;
          const identifier = resource.identifier;
          if (identifier) {
            packageData.resources[identifier] = {
              href: resource.href,
              type: resource.type,
              scormType: resource.scormtype || resource.scormType,
            };
          }
        });

        resolve(packageData);
      } catch (err) {
        reject(new Error(`Failed to parse manifest: ${err instanceof Error ? err.message : 'Unknown error'}`));
      }
    });
  };

  const handleFileUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setError('Please upload a ZIP file containing SCORM content');
      return;
    }

    setIsLoading(true);
    setError(null);
    setUploadProgress(0);

    try {
      const zip = new JSZip();
      const zipContent = await zip.loadAsync(file);
      
      setUploadProgress(25);

      // Find and parse manifest
      const manifestFile = zipContent.file('imsmanifest.xml');
      if (!manifestFile) {
        throw new Error('imsmanifest.xml not found. This may not be a valid SCORM package.');
      }

      setUploadProgress(50);

      const manifestXml = await manifestFile.async('text');
      const packageData = await parseManifest(manifestXml);

      setUploadProgress(75);

      // Store zip content for later use
      packageData.zipContent = zipContent;
      
      setUploadProgress(100);
      
      setTimeout(() => {
        onPackageLoad(packageData);
        setIsLoading(false);
        setUploadProgress(0);
      }, 500);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process SCORM package');
      setIsLoading(false);
      setUploadProgress(0);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  return (
    <Card className="p-8 bg-card shadow-player">
      <div className="text-center space-y-6">
        <div className="mx-auto w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center shadow-glow">
          <Upload className="w-8 h-8 text-white" />
        </div>

        <div>
          <h2 className="text-2xl font-semibold mb-2 text-card-foreground">
            Upload SCORM Package
          </h2>
          <p className="text-muted-foreground">
            Drag and drop your SCORM ZIP file here or click to browse
          </p>
        </div>

        <div
          className={`
            relative border-2 border-dashed rounded-lg p-12 transition-colors
            ${isDragging ? 'border-primary bg-primary/5' : 'border-border'}
            ${isLoading ? 'pointer-events-none' : 'cursor-pointer hover:border-primary/50'}
          `}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            type="file"
            accept=".zip"
            onChange={handleFileSelect}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={isLoading}
          />

          <div className="space-y-4">
            <FileText className={`mx-auto w-12 h-12 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
            
            {isLoading ? (
              <div className="space-y-3">
                <p className="text-sm font-medium">Processing SCORM package...</p>
                <Progress value={uploadProgress} className="w-full max-w-xs mx-auto" />
              </div>
            ) : (
              <div>
                <p className="font-medium">
                  {isDragging ? 'Drop your file here' : 'Choose SCORM package'}
                </p>
                <p className="text-sm text-muted-foreground">
                  Supports SCORM 1.2 and 2004 packages (ZIP format)
                </p>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-destructive bg-destructive/10 p-3 rounded-lg">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        <div className="flex justify-center">
          <Button 
            variant="outline" 
            onClick={() => (document.querySelector('input[type="file"]') as HTMLInputElement)?.click()}
            disabled={isLoading}
          >
            <Upload className="w-4 h-4 mr-2" />
            Browse Files
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default ScormUploader;