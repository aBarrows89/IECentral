"use client";

import { useTheme } from "@/app/theme-context";
import VideoTile from "./VideoTile";
import { Id } from "@/convex/_generated/dataModel";

interface Participant {
  _id: Id<"meetingParticipants">;
  userId?: Id<"users"> | null;
  guestName?: string | null;
  displayName?: string;
  isMuted?: boolean;
  isCameraOff?: boolean;
  isScreenSharing?: boolean;
}

interface VideoGridProps {
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  participants: Participant[];
  myParticipantId: string;
}

export default function VideoGrid({
  localStream,
  remoteStreams,
  participants,
  myParticipantId,
}: VideoGridProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const myParticipant = participants.find(
    (p) => String(p._id) === myParticipantId
  );
  const remoteParticipants = participants.filter(
    (p) => String(p._id) !== myParticipantId
  );

  // Find who is screen sharing
  const screenSharer = participants.find((p) => p.isScreenSharing);
  const isLocalScreenSharing =
    screenSharer && String(screenSharer._id) === myParticipantId;

  const totalParticipants = participants.length;

  // Grid class based on participant count
  function getGridClass(): string {
    if (screenSharer) {
      // Participants row below the screen share
      return "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2";
    }

    if (totalParticipants <= 1) return "grid grid-cols-1 place-items-center";
    if (totalParticipants === 2) return "grid grid-cols-2 gap-3";
    if (totalParticipants <= 4) return "grid grid-cols-2 grid-rows-2 gap-3";
    return "grid grid-cols-3 grid-rows-2 gap-3";
  }

  function getName(p: Participant): string {
    return p.displayName || p.guestName || "Participant";
  }

  // Screen share layout
  if (screenSharer) {
    const screenShareStream = isLocalScreenSharing
      ? localStream
      : remoteStreams.get(String(screenSharer._id)) || null;

    return (
      <div className="flex flex-col h-full gap-2">
        {/* Main screen share area */}
        <div className="flex-1 min-h-0">
          <VideoTile
            stream={screenShareStream}
            displayName={`${getName(screenSharer)}'s Screen`}
            isMuted={false}
            isCameraOff={false}
            isLocal={isLocalScreenSharing ?? false}
            isScreenSharing={true}
          />
        </div>

        {/* Participant filmstrip */}
        <div className={getGridClass()}>
          {/* Local tile */}
          {myParticipant && (
            <div className="h-28 sm:h-32">
              <VideoTile
                stream={localStream}
                displayName={getName(myParticipant)}
                isMuted={myParticipant.isMuted ?? false}
                isCameraOff={myParticipant.isCameraOff ?? false}
                isLocal={true}
                isScreenSharing={false}
              />
            </div>
          )}

          {/* Remote tiles */}
          {remoteParticipants.map((p) => (
            <div key={String(p._id)} className="h-28 sm:h-32">
              <VideoTile
                stream={remoteStreams.get(String(p._id)) || null}
                displayName={getName(p)}
                isMuted={p.isMuted ?? false}
                isCameraOff={p.isCameraOff ?? false}
                isLocal={false}
                isScreenSharing={false}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Normal grid layout
  return (
    <div className={`h-full ${getGridClass()}`}>
      {/* Local tile */}
      {myParticipant && (
        <div
          className={
            totalParticipants <= 1
              ? "w-full max-w-2xl aspect-video"
              : "w-full h-full"
          }
        >
          <VideoTile
            stream={localStream}
            displayName={getName(myParticipant)}
            isMuted={myParticipant.isMuted ?? false}
            isCameraOff={myParticipant.isCameraOff ?? false}
            isLocal={true}
            isScreenSharing={false}
          />
        </div>
      )}

      {/* Remote tiles */}
      {remoteParticipants.map((p) => (
        <div key={String(p._id)} className="w-full h-full">
          <VideoTile
            stream={remoteStreams.get(String(p._id)) || null}
            displayName={getName(p)}
            isMuted={p.isMuted ?? false}
            isCameraOff={p.isCameraOff ?? false}
            isLocal={false}
            isScreenSharing={false}
          />
        </div>
      ))}
    </div>
  );
}
