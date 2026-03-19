"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "@/app/theme-context";

interface VideoTileProps {
  stream: MediaStream | null;
  displayName: string;
  isMuted: boolean;
  isCameraOff: boolean;
  isLocal: boolean;
  isScreenSharing: boolean;
  isSpeaking?: boolean;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// Deterministic color from name
function getAvatarColor(name: string): string {
  const colors = [
    "bg-cyan-600",
    "bg-blue-600",
    "bg-purple-600",
    "bg-pink-600",
    "bg-emerald-600",
    "bg-amber-600",
    "bg-rose-600",
    "bg-teal-600",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export default function VideoTile({
  stream,
  displayName,
  isMuted,
  isCameraOff,
  isLocal,
  isScreenSharing,
  isSpeaking = false,
}: VideoTileProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (stream) {
      video.srcObject = stream;
    } else {
      video.srcObject = null;
    }

    return () => {
      if (video) {
        video.srcObject = null;
      }
    };
  }, [stream]);

  const initials = getInitials(displayName);
  const avatarColor = getAvatarColor(displayName);

  return (
    <div
      className={`relative overflow-hidden rounded-xl w-full h-full ${
        isDark ? "bg-slate-900" : "bg-gray-100"
      } ${
        isSpeaking
          ? "ring-2 ring-cyan-400 ring-offset-2 ring-offset-transparent"
          : ""
      }`}
    >
      {/* Video element — always rendered but hidden when camera is off */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`w-full h-full object-cover ${
          isCameraOff && !isScreenSharing ? "hidden" : ""
        } ${isLocal && !isScreenSharing ? "-scale-x-100" : ""}`}
      />

      {/* Camera off placeholder */}
      {isCameraOff && !isScreenSharing && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className={`${avatarColor} rounded-full flex items-center justify-center text-white font-semibold
              w-16 h-16 text-xl sm:w-20 sm:h-20 sm:text-2xl md:w-24 md:h-24 md:text-3xl`}
          >
            {initials}
          </div>
        </div>
      )}

      {/* Name overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-white text-sm font-medium truncate">
            {displayName}
            {isLocal && " (You)"}
          </span>
          {isMuted && (
            <svg
              className="w-4 h-4 text-red-400 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
              />
            </svg>
          )}
          {isScreenSharing && (
            <span className="text-xs text-cyan-400 flex-shrink-0">
              Screen
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
