import React from 'react';
import { FaCamera, FaTimes } from 'react-icons/fa';
import { useEscapeToClose } from '../hooks/useEscapeToClose';

interface CameraCaptureModalProps {
  onCapture: (file: File) => void;
  onClose: () => void;
}

const CAMERA_ACCESS_ERROR = 'Could not access the camera.';
const CAMERA_UNAVAILABLE_ERROR = 'Live camera capture is unavailable in this browser.';
const CAMERA_NOT_READY_ERROR = 'Camera preview is not ready yet.';
const CAMERA_FRAME_ERROR = 'Could not capture a camera frame.';

const stopCameraStream = (stream: MediaStream | null) => {
  stream?.getTracks().forEach((track) => track.stop());
};

const makeCameraPhotoFileName = () => `board-photo-${Date.now()}.jpg`;

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({ onCapture, onClose }) => {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);
  const [capturing, setCapturing] = React.useState(false);

  const stopCamera = React.useCallback(() => {
    stopCameraStream(streamRef.current);
    streamRef.current = null;
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const mediaDevices = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;

    if (!mediaDevices?.getUserMedia) {
      setError(CAMERA_UNAVAILABLE_ERROR);
      return () => undefined;
    }

    void mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stopCameraStream(stream);
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch(() => {
        if (!cancelled) setError(CAMERA_ACCESS_ERROR);
      });

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [stopCamera]);

  const handleClose = React.useCallback(() => {
    stopCamera();
    onClose();
  }, [onClose, stopCamera]);
  useEscapeToClose(handleClose);

  const handleCapture = React.useCallback(() => {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) {
      setError(CAMERA_NOT_READY_ERROR);
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setError(CAMERA_FRAME_ERROR);
      return;
    }

    setCapturing(true);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        setCapturing(false);
        if (!blob) {
          setError(CAMERA_FRAME_ERROR);
          return;
        }
        stopCamera();
        onCapture(new File([blob], makeCameraPhotoFileName(), { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.92,
    );
  }, [onCapture, stopCamera]);

  const canCapture = ready && !capturing && !error;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-3 mobile-safe-inset mobile-safe-area-bottom"
      role="dialog"
      aria-modal="true"
      aria-labelledby="camera-capture-title"
      data-camera-capture-modal="true"
    >
      <div className="ui-panel flex h-full max-h-[720px] w-full max-w-2xl flex-col overflow-hidden rounded-lg border shadow-xl">
        <div className="ui-bar flex items-center justify-between border-b border-[var(--ui-border)] px-3 py-2">
          <h3 id="camera-capture-title" className="flex items-center gap-2 text-base font-semibold text-[var(--ui-text)]">
            <FaCamera aria-hidden="true" />
            Camera
          </h3>
          <button
            type="button"
            className="ui-control grid place-items-center rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
            onClick={handleClose}
            aria-label="Close camera"
          >
            <FaTimes aria-hidden="true" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 place-items-center bg-black">
          {error ? (
            <div
              className="m-4 rounded-lg border border-[var(--ui-danger)] bg-[var(--ui-danger-soft)] px-4 py-3 text-sm font-medium text-[var(--ui-danger)]"
              role="alert"
              data-camera-capture-error="true"
            >
              {error}
            </div>
          ) : (
            <video
              ref={videoRef}
              className="h-full max-h-full w-full object-contain"
              autoPlay
              playsInline
              muted
              onLoadedMetadata={() => setReady(true)}
              onCanPlay={() => setReady(true)}
              data-camera-capture-video="true"
            />
          )}
        </div>

        <div className="ui-bar flex items-center justify-between gap-3 border-t border-[var(--ui-border)] px-3 py-3">
          <button
            type="button"
            className="min-h-11 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-2 text-sm font-semibold text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
            onClick={handleClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="min-h-11 rounded-lg border border-[var(--ui-accent)] bg-[var(--ui-accent)] px-4 py-2 text-sm font-semibold text-[var(--ui-accent-contrast)] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleCapture}
            disabled={!canCapture}
            aria-label="Capture board photo"
            data-camera-capture-shutter="true"
          >
            {capturing ? 'Capturing...' : 'Capture'}
          </button>
        </div>
      </div>
    </div>
  );
};
