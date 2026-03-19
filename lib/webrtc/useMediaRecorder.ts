"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseMediaRecorderOptions {
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  isRecording: boolean;
}

interface UseMediaRecorderReturn {
  audioBlob: Blob | null;
  isRecording: boolean;
  recordingDuration: number;
}

export function useMediaRecorder({
  localStream,
  remoteStreams,
  isRecording,
}: UseMediaRecorderOptions): UseMediaRecorderReturn {
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map());

  // Connect a stream's audio tracks to the destination
  const connectStream = useCallback(
    (id: string, stream: MediaStream, ctx: AudioContext, dest: MediaStreamAudioDestinationNode) => {
      // Skip if already connected
      if (sourcesRef.current.has(id)) return;

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) return;

      try {
        const source = ctx.createMediaStreamSource(stream);
        source.connect(dest);
        sourcesRef.current.set(id, source);
      } catch (err) {
        console.warn("[useMediaRecorder] Failed to connect stream:", id, err);
      }
    },
    []
  );

  // Start/stop recording based on isRecording flag
  useEffect(() => {
    if (isRecording && localStream) {
      // Reset state
      setAudioBlob(null);
      chunksRef.current = [];

      // Create AudioContext and mix all streams
      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();

      audioContextRef.current = audioContext;
      destinationRef.current = destination;
      sourcesRef.current = new Map();

      // Connect local stream
      connectStream("local", localStream, audioContext, destination);

      // Connect all current remote streams
      remoteStreams.forEach((stream, participantId) => {
        connectStream(participantId, stream, audioContext, destination);
      });

      // Create MediaRecorder on the mixed destination stream
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(destination.stream, {
        mimeType,
      });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        // Combine all chunks into a single blob
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
      };

      // Record in 10-second chunks to prevent data loss
      recorder.start(10000);
      mediaRecorderRef.current = recorder;

      // Track duration
      startTimeRef.current = Date.now();
      durationIntervalRef.current = setInterval(() => {
        setRecordingDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } else if (!isRecording && mediaRecorderRef.current) {
      // Stop recording
      const recorder = mediaRecorderRef.current;
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
      mediaRecorderRef.current = null;

      // Stop duration tracking
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      // Close AudioContext
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      destinationRef.current = null;
      sourcesRef.current = new Map();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, localStream]);

  // When remote streams change while recording, connect new ones
  useEffect(() => {
    if (!isRecording || !audioContextRef.current || !destinationRef.current) return;

    const ctx = audioContextRef.current;
    const dest = destinationRef.current;

    remoteStreams.forEach((stream, participantId) => {
      connectStream(participantId, stream, ctx, dest);
    });
  }, [isRecording, remoteStreams, connectStream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  return {
    audioBlob,
    isRecording,
    recordingDuration,
  };
}
