// SCORM Service Worker - Virtual File Server
let scormFiles = new Map();
let baseUrl = '';

self.addEventListener('message', (event) => {
  if (event.data.type === 'INIT_SCORM') {
    scormFiles = new Map(event.data.files);
    baseUrl = event.data.baseUrl;
    console.log('[SW] SCORM files loaded:', scormFiles.size, 'files');
  } else if (event.data.type === 'CLEAR_SCORM') {
    scormFiles.clear();
    console.log('[SW] SCORM files cleared');
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Only handle requests to our virtual SCORM path
  if (!url.pathname.startsWith('/scorm-content/')) {
    return;
  }

  event.respondWith(
    (async () => {
      try {
        // Extract the file path from the URL
        const filePath = decodeURIComponent(url.pathname.replace('/scorm-content/', ''));
        
        console.log('[SW] Request for:', filePath);
        
        // Try exact match first
        let fileData = scormFiles.get(filePath);
        
        // If not found, try variations
        if (!fileData) {
          // Try with different path variations
          const pathVariations = [
            filePath,
            filePath.replace(/^\/+/, ''), // Remove leading slashes
            baseUrl + filePath,
            baseUrl + filePath.replace(/^\/+/, '')
          ];
          
          for (const variation of pathVariations) {
            fileData = scormFiles.get(variation);
            if (fileData) {
              console.log('[SW] Found file with variation:', variation);
              break;
            }
          }
        }
        
        if (!fileData) {
          console.warn('[SW] File not found:', filePath);
          console.log('[SW] Available files:', Array.from(scormFiles.keys()));
          return new Response('File not found', { status: 404 });
        }
        
        // Determine content type
        const ext = filePath.split('.').pop()?.toLowerCase() || '';
        const contentTypes = {
          'html': 'text/html',
          'htm': 'text/html',
          'css': 'text/css',
          'js': 'application/javascript',
          'json': 'application/json',
          'png': 'image/png',
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'gif': 'image/gif',
          'svg': 'image/svg+xml',
          'webp': 'image/webp',
          'mp4': 'video/mp4',
          'webm': 'video/webm',
          'mp3': 'audio/mpeg',
          'wav': 'audio/wav',
          'woff': 'font/woff',
          'woff2': 'font/woff2',
          'ttf': 'font/ttf',
          'eot': 'application/vnd.ms-fontobject'
        };
        
        const contentType = contentTypes[ext] || 'application/octet-stream';
        
        return new Response(fileData, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache'
          }
        });
      } catch (error) {
        console.error('[SW] Error serving file:', error);
        return new Response('Error loading file', { status: 500 });
      }
    })()
  );
});

console.log('[SW] SCORM Service Worker loaded');
