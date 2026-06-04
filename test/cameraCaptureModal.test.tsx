import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CameraCaptureModal } from '../src/components/CameraCaptureModal';

describe('CameraCaptureModal', () => {
  it('renders a live camera capture dialog with accessible controls', () => {
    const html = renderToStaticMarkup(
      <CameraCaptureModal
        onCapture={() => undefined}
        onClose={() => undefined}
      />,
    );

    expect(html).toContain('data-camera-capture-modal="true"');
    expect(html).toContain('aria-labelledby="camera-capture-title"');
    expect(html).toContain('data-camera-capture-video="true"');
    expect(html).toContain('aria-label="Capture board photo"');
    expect(html).toContain('data-camera-capture-shutter="true"');
    expect(html).toContain('Cancel');
    expect(html).toContain('Capture');
  });

  it('captures a JPEG frame and stops the camera stream', () => {
    const source = readFileSync('src/components/CameraCaptureModal.tsx', 'utf8');

    expect(source).toContain('useEscapeToClose(handleClose)');
    expect(source).toContain('getUserMedia({ video: { facingMode: { ideal:');
    expect(source).toContain('stopCameraStream(streamRef.current)');
    expect(source).toContain("canvas.toBlob(");
    expect(source).toContain("new File([blob], makeCameraPhotoFileName(), { type: 'image/jpeg' })");
    expect(source).toContain("track.stop()");
  });
});
