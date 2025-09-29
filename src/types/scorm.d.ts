// SCORM API types
interface ScormAPI {
  LMSInitialize: (parameter: string) => string;
  LMSFinish: (parameter: string) => string;
  LMSGetValue: (element: string) => string;
  LMSSetValue: (element: string, value: string) => string;
  LMSCommit: (parameter: string) => string;
  LMSGetLastError: () => string;
  LMSGetErrorString: (errorCode: string) => string;
  LMSGetDiagnostic: (errorCode: string) => string;
}

declare global {
  interface Window {
    API?: ScormAPI;
  }
}

export {};