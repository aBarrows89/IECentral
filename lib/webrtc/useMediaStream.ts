"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseMediaStreamOptions {
  /** Called when the video track changes (e.g., screen share started/stopped).
   *  Consumers can use this to replace tracks on active peer connections. */
  onTrackChange?: (newTrack: MediaStreamTrack, kind: "audio" | "video") => void;
}

interface UseMediaStreamReturn {
  localStream: MediaStream | null;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  toggleAudio: () => void;
  toggleVideo: () => void;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => Promise<void>;
  cleanup: () => void;
}

export function useMediaStream(
  options: UseMediaStreamOptions = {}
): UseMediaStreamReturn {
  const { onTrackChange } = options;

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  // Keep refs so callbacks always see latest values without re-creating them
  const localStreamRef = useRef<MediaStream | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const onTrackChangeRef = useRef(onTrackChange);
  onTrackChangeRef.current = onTrackChange;

  // ---------- Initialise camera + mic ----------
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });

        if (cancelled) {
          // Component unmounted while we were awaiting
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        localStreamRef.current = stream;
        cameraTrackRef.current =
          stream.getVideoTracks()[0] ?? null;

        setLocalStream(stream);
        setIsAudioEnabled(true);
        setIsVideoEnabled(true);
      } catch (err) {
        console.error("[useMediaStream] getUserMedia failed:", err);

        // Try audio-only as a fallback
        try {
          const audioOnly = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
          });

          if (cancelled) {
            audioOnly.getTracks().forEach((t) => t.stop());
            return;
          }

          localStreamRef.current = audioOnly;
          cameraTrackRef.current = null;

          setLocalStream(audioOnly);
          setIsAudioEnabled(true);
          setIsVideoEnabled(false);
        } catch (audioErr) {
          console.error(
            "[useMediaStream] Audio-only fallback also failed:",
            audioErr
          );
        }
      }
    }

    init();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Toggle audio ----------
  const toggleAudio = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;

    stream.getAudioTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });

    setIsAudioEnabled((prev) => !prev);
  }, []);

  // ---------- Toggle video ----------
  const toggleVideo = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;

    // Don't toggle the camera track while screen sharing —
    // the video track on the stream IS the screen track.
    if (screenTrackRef.current) return;

    stream.getVideoTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });

    setIsVideoEnabled((prev) => !prev);
  }, []);

  // ---------- Screen share ----------
  const startScreenShare = useCallback(async () => {
    const stream = localStreamRef.current;
    if (!stream) return;

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });

      const screenTrack = displayStream.getVideoTracks()[0];
      if (!screenTrack) return;

      screenTrackRef.current = screenTrack;

      // Swap the video track on the local stream
      const oldVideoTrack = stream.getVideoTracks()[0];
      if (oldVideoTrack) {
        stream.removeTrack(oldVideoTrack);
      }
      stream.addTrack(screenTrack);

      // Notify consumers so they can replace the track on peer connections
      onTrackChangeRef.current?.(screenTrack, "video");

      setIsScreenSharing(true);

      // Handle the user clicking "Stop sharing" in the browser chrome
      screenTrack.addEventListener("ended", () => {
        _restoreCameraTrack();
      });
    } catch (err) {
      // User cancelled the screen-share picker — not a real error
      console.warn("[useMediaStream] Screen share cancelled or failed:", err);
    }
  }, []);

  const _restoreCameraTrack = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const currentScreen = screenTrackRef.current;
    if (currentScreen) {
      stream.removeTrack(currentScreen);
      currentScreen.stop();
      screenTrackRef.current = null;
    }

    // Re-add the original camera track if we have one
    const cam = cameraTrackRef.current;
    if (cam && cam.readyState === "live") {
      stream.addTrack(cam);
      onTrackChangeRef.current?.(cam, "video");
    }

    setIsScreenSharing(false);
  }, []);

  const stopScreenShare = useCallback(async () => {
    _restoreCameraTrack();
  }, [_restoreCameraTrack]);

  // ---------- Cleanup ----------
  const cleanup = useCallback(() => {
    const stream = localStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }

    const screen = screenTrackRef.current;
    if (screen) {
      screen.stop();
    }

    localStreamRef.current = null;
    cameraTrackRef.current = null;
    screenTrackRef.current = null;

    setLocalStream(null);
    setIsAudioEnabled(false);
    setIsVideoEnabled(false);
    setIsScreenSharing(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenTrackRef.current?.stop();
    };
  }, []);

  return {
    localStream,
    isAudioEnabled,
    isVideoEnabled,
    isScreenSharing,
    toggleAudio,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    cleanup,
  };
}
