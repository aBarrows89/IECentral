"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { ICE_SERVERS } from "./iceServers";

type SignalType = "offer" | "answer" | "ice-candidate";

interface Signal {
  _id: Id<"meetingSignals">;
  type: SignalType;
  payload: string;
  fromParticipantId: Id<"meetingParticipants">;
  toParticipantId: Id<"meetingParticipants">;
}

interface UseWebRTCOptions {
  localStream: MediaStream | null;
  participantId: Id<"meetingParticipants">;
  remoteParticipantId: Id<"meetingParticipants">;
  meetingId: Id<"meetings">;
  /** If true this peer creates the offer; the other side answers. */
  isInitiator: boolean;
}

interface UseWebRTCReturn {
  remoteStream: MediaStream | null;
  connectionState: RTCPeerConnectionState | "new";
}

export function useWebRTC({
  localStream,
  participantId,
  remoteParticipantId,
  meetingId,
  isInitiator,
}: UseWebRTCOptions): UseWebRTCReturn {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [connectionState, setConnectionState] =
    useState<RTCPeerConnectionState | "new">("new");

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const remoteStreamRef = useRef<MediaStream>(new MediaStream());
  const makingOfferRef = useRef(false);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  const sendSignal = useMutation(api.meetingSignaling.sendSignal);
  const consumeSignal = useMutation(api.meetingSignaling.consumeSignal);

  // Signals addressed to *us* from the remote participant
  const incomingSignals = useQuery(api.meetingSignaling.getMySignals, {
    participantId,
  });

  // ---------- Helpers ----------

  const send = useCallback(
    async (type: SignalType, payload: string) => {
      try {
        await sendSignal({
          meetingId,
          fromParticipantId: participantId,
          toParticipantId: remoteParticipantId,
          type,
          payload,
        });
      } catch (err) {
        console.error("[useWebRTC] Failed to send signal:", type, err);
      }
    },
    [sendSignal, meetingId, participantId, remoteParticipantId]
  );

  const consume = useCallback(
    async (signalId: Id<"meetingSignals">) => {
      try {
        await consumeSignal({ signalId });
      } catch {
        // Non-critical — worst case we re-process a signal
      }
    },
    [consumeSignal]
  );

  // ---------- Create / tear down RTCPeerConnection ----------

  useEffect(() => {
    if (!localStream) return;

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    // Add local tracks
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    // Remote tracks
    pc.ontrack = (event) => {
      const remote = remoteStreamRef.current;
      event.streams[0]?.getTracks().forEach((track) => {
        if (!remote.getTracks().includes(track)) {
          remote.addTrack(track);
        }
      });
      // Force a new reference so React picks up the change
      setRemoteStream(new MediaStream(remote.getTracks()));
    };

    // ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        send("ice-candidate", JSON.stringify(event.candidate.toJSON()));
      }
    };

    // Connection state
    pc.onconnectionstatechange = () => {
      setConnectionState(pc.connectionState);

      if (
        pc.connectionState === "failed" ||
        pc.connectionState === "disconnected"
      ) {
        console.warn(
          `[useWebRTC] Connection ${pc.connectionState} with ${remoteParticipantId}`
        );
      }
    };

    // Initiator creates the offer
    if (isInitiator) {
      (async () => {
        try {
          makingOfferRef.current = true;
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await send("offer", JSON.stringify(pc.localDescription));
        } catch (err) {
          console.error("[useWebRTC] Failed to create offer:", err);
        } finally {
          makingOfferRef.current = false;
        }
      })();
    }

    return () => {
      pc.close();
      pcRef.current = null;
      setConnectionState("new");
      setRemoteStream(null);
      remoteStreamRef.current = new MediaStream();
      pendingCandidatesRef.current = [];
    };
    // We intentionally depend only on localStream identity + the remote peer.
    // `send` is stable across renders because its deps don't change for the
    // same peer pair.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localStream, remoteParticipantId, isInitiator]);

  // ---------- Process incoming signals ----------

  useEffect(() => {
    if (!incomingSignals || incomingSignals.length === 0) return;

    const pc = pcRef.current;
    if (!pc) return;

    // Filter signals from the remote participant we care about
    const relevant = (incomingSignals as Signal[]).filter(
      (s) => s.fromParticipantId === remoteParticipantId
    );

    for (const signal of relevant) {
      (async () => {
        try {
          switch (signal.type) {
            case "offer": {
              const offer: RTCSessionDescriptionInit = JSON.parse(
                signal.payload
              );
              // Avoid glare: if we were also making an offer, the "polite"
              // peer (non-initiator) rolls back.
              const offerCollision =
                makingOfferRef.current ||
                pc.signalingState !== "stable";

              if (offerCollision && isInitiator) {
                // We are the impolite peer — ignore their offer
                break;
              }

              await pc.setRemoteDescription(
                new RTCSessionDescription(offer)
              );

              // Flush any ICE candidates that arrived before the offer
              for (const c of pendingCandidatesRef.current) {
                await pc.addIceCandidate(new RTCIceCandidate(c));
              }
              pendingCandidatesRef.current = [];

              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              await send("answer", JSON.stringify(pc.localDescription));
              break;
            }

            case "answer": {
              if (pc.signalingState !== "have-local-offer") {
                // Stale answer — ignore
                break;
              }
              const answer: RTCSessionDescriptionInit = JSON.parse(
                signal.payload
              );
              await pc.setRemoteDescription(
                new RTCSessionDescription(answer)
              );

              // Flush buffered ICE candidates
              for (const c of pendingCandidatesRef.current) {
                await pc.addIceCandidate(new RTCIceCandidate(c));
              }
              pendingCandidatesRef.current = [];
              break;
            }

            case "ice-candidate": {
              const candidate: RTCIceCandidateInit = JSON.parse(
                signal.payload
              );

              if (pc.remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
              } else {
                // Buffer until remote description is set
                pendingCandidatesRef.current.push(candidate);
              }
              break;
            }
          }
        } catch (err) {
          console.error(
            "[useWebRTC] Error processing signal:",
            signal.type,
            err
          );
        } finally {
          // Always consume so we don't re-process
          await consume(signal._id);
        }
      })();
    }
  }, [incomingSignals, remoteParticipantId, isInitiator, send, consume]);

  return { remoteStream, connectionState };
}
