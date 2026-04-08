"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { SelfieSegmentation, Results } from "@mediapipe/selfie_segmentation";

/**
 * Virtual background hook — segments person from background
 * and composites them onto a custom background (black + IE logo).
 */
export function useVirtualBackground() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const segmenterRef = useRef<SelfieSegmentation | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const logoRef = useRef<HTMLImageElement | null>(null);
  const animFrameRef = useRef<number>(0);
  const inputVideoRef = useRef<HTMLVideoElement | null>(null);
  const outputStreamRef = useRef<MediaStream | null>(null);

  // Initialize segmenter
  const initSegmenter = useCallback(async () => {
    if (segmenterRef.current) return;
    setLoading(true);

    const segmenter = new SelfieSegmentation({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
    });
    segmenter.setOptions({ modelSelection: 1, selfieMode: true });

    segmenter.onResults((results: Results) => {
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (!canvas || !ctx) return;

      const { width, height } = canvas;

      // Draw the segmentation mask
      ctx.save();
      ctx.clearRect(0, 0, width, height);

      // Draw background (black + logo)
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, width, height);
      if (logoRef.current) {
        const logoH = height * 0.08;
        const logoW = (logoRef.current.width / logoRef.current.height) * logoH;
        ctx.drawImage(logoRef.current, 12, 12, logoW, logoH);
      }

      // Draw person using segmentation mask
      ctx.globalCompositeOperation = "destination-out";
      ctx.drawImage(results.segmentationMask, 0, 0, width, height);
      ctx.globalCompositeOperation = "destination-over";
      ctx.drawImage(results.image, 0, 0, width, height);

      ctx.restore();
    });

    await segmenter.initialize();
    segmenterRef.current = segmenter;
    setLoading(false);
  }, []);

  // Load logo
  useEffect(() => {
    const logo = new Image();
    logo.crossOrigin = "anonymous";
    logo.src = "/logo.gif";
    logo.onload = () => { logoRef.current = logo; };
  }, []);

  // Process frames
  const processFrame = useCallback(async () => {
    const video = inputVideoRef.current;
    const segmenter = segmenterRef.current;
    if (!video || !segmenter || video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    await segmenter.send({ image: video });
    animFrameRef.current = requestAnimationFrame(processFrame);
  }, []);

  /**
   * Apply virtual background to a MediaStream.
   * Returns a new MediaStream with the processed video track.
   */
  const applyBackground = useCallback(async (inputStream: MediaStream): Promise<MediaStream> => {
    await initSegmenter();

    // Create hidden video element for input
    const video = document.createElement("video");
    video.srcObject = inputStream;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    await video.play();
    inputVideoRef.current = video;

    // Create canvas for output
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    canvasRef.current = canvas;
    ctxRef.current = canvas.getContext("2d");

    // Start processing loop
    animFrameRef.current = requestAnimationFrame(processFrame);

    // Create output stream from canvas
    const canvasStream = canvas.captureStream(30);

    // Add audio tracks from original stream
    inputStream.getAudioTracks().forEach((track) => {
      canvasStream.addTrack(track);
    });

    outputStreamRef.current = canvasStream;
    setEnabled(true);
    return canvasStream;
  }, [initSegmenter, processFrame]);

  /**
   * Remove virtual background — returns the original stream tracks.
   */
  const removeBackground = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    if (inputVideoRef.current) {
      inputVideoRef.current.srcObject = null;
      inputVideoRef.current = null;
    }
    outputStreamRef.current = null;
    setEnabled(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      removeBackground();
      segmenterRef.current?.close();
    };
  }, [removeBackground]);

  return {
    enabled,
    loading,
    applyBackground,
    removeBackground,
  };
}
