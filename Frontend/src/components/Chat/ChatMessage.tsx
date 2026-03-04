import { Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export interface ChatImage {
  filename: string;
  /** Inline base64 data URI (streaming). */
  data?: string;
  /** URL for loading image (history from API). */
  url?: string;
}

interface ChatMessageProps {
  type: 'user' | 'assistant' | 'system';
  content: string;
  images?: ChatImage[];
  isStreaming?: boolean;
}

interface ChatImageThumbProps {
  image: ChatImage;
  onClick: () => void;
}

const ChatImageThumb = ({ image, onClick }: ChatImageThumbProps) => {
  const [src, setSrc] = useState<string | undefined>(image.data ?? image.url);
  const [retryCount, setRetryCount] = useState(0);

  const handleError = () => {
    // Only retry for URL-based images (history), not inline base64
    if (!image.data && image.url && retryCount < 2) {
      try {
        const urlObj = new URL(image.url);
        urlObj.searchParams.set('r', Date.now().toString());
        setSrc(urlObj.toString());
        setRetryCount((prev) => prev + 1);
      } catch {
        // If URL parsing fails, don't loop retries
      }
    }
  };

  if (!src) {
    return null;
  }

  return (
    <div
      className="cursor-pointer group relative overflow-hidden rounded-lg border border-border hover:border-primary transition-colors"
      onClick={onClick}
    >
      <img
        src={src}
        alt={image.filename}
        className="w-full h-32 object-contain bg-black group-hover:scale-105 transition-transform"
        onError={handleError}
      />
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
    </div>
  );
};

export const ChatMessage = ({ type, content, images, isStreaming }: ChatMessageProps) => {
  const [selectedImage, setSelectedImage] = useState<ChatImage | null>(null);

  if (type === 'system') {
    return null; // We don't render system messages anymore, they're part of steps
  }

  return (
    <>
      <div
        className={cn(
          'flex',
          type === 'user' && 'justify-end'
        )}
      >
        <div
          className={cn(
            'rounded-lg',
            type === 'user' && 'bg-primary text-primary-foreground px-4 py-2 max-w-[80%]',
            type === 'assistant' && 'w-full'
          )}
        >
          {type === 'assistant' ? (
            <div className="space-y-4">
              {/* Main response text */}
              <div className="prose prose-sm max-w-none text-foreground">
                {content ? (
                  <div className="whitespace-pre-wrap">{content}</div>
                ) : isStreaming ? (
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                ) : null}
              </div>

              {/* Inline images */}
              {images && images.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-sm text-muted-foreground mb-3">
                    Related images ({images.length})
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {images.map((img, idx) => (
                      <ChatImageThumb
                        key={idx}
                        image={img}
                        onClick={() => setSelectedImage(img)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            content
          )}
        </div>
      </div>

      {/* Image Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <Button
              variant="ghost"
              size="icon"
              className="absolute -top-12 right-0 text-white hover:bg-white/20"
              onClick={() => setSelectedImage(null)}
            >
              <X className="w-6 h-6" />
            </Button>
            <img
              src={selectedImage.data ?? selectedImage.url}
              alt={selectedImage.filename}
              className="max-w-full max-h-[90vh] rounded-lg"
            />
            <p className="text-white text-center mt-2">{selectedImage.filename}</p>
          </div>
        </div>
      )}
    </>
  );
};
