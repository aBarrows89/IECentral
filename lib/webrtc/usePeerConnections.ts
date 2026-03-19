"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
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

interface Participant {
  _id: Id<"meetingParticipants">;
  [key: string]: unknown;
}

interface PeerState {
  pc: RTCPeerConnection;
  remoteStream: MediaStream;
  makingOffer: boolean;
}

interface UsePeerConnectionsOptions {
  localStream: MediaStream | null;
  myParticipantId: Id<"meetingParticipants">;
  meetingId: Id<"meetings">;
  participants: Participant[];
}

/**
 * Manages a full-mesh of RTCPeerConnections — one per remote participant.
 *
 * Returns a `Map<string, MediaStream>` keyed by remote participant ID so the
 * UI can render each remote video.
 */
export function usePeerConnections({
  localStream,
  myParticipantId,
  meetingId,
  participants,
}: UsePeerConnectionsOptions): Map<string, MediaStream> {
  const sendSignal = useMutation(api.meetingSignaling.sendSignal);
  const consumeSignal = useMutation(api.meetingSignaling.consumeSignal);

  const incomingSignals = useQuery(api.meetingSignaling.getMySignals, {
    participantId: myParticipantId,
  });

  // Peer state lives in a ref so we don't re-render on every ICE candidate.
  // We bump `streamVersion` to trigger a React re-render when remote streams change.
  const peersRef = useRef<Map<string, PeerState>>(new Map());
  const [streamVersion, setStreamVersion] = useState(0);
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(
    new Map()
  );

  // ---------- Helpers ----------

  const send = useCallback(
    async (
      toParticipantId: Id<"meetingParticipants">,
      type: SignalType,
      payload: string
    ) => {
      try {
        await sendSignal({
          meetingId,
          fromParticipantId: myParticipantId,
          toParticipantId,
          type,
          payload,
        });
      } catch (err) {
        console.error("[usePeerConnections] sendSignal failed:", type, err);
      }
    },
    [sendSignal, meetingId, myParticipantId]
  );

  const consume = useCallback(
    async (signalId: Id<"meetingSignals">) => {
      try {
        await consumeSignal({ signalId });
      } catch {
        // Non-critical
      }
    },
    [consumeSignal]
  );

  // Determine which remote participants we should be connected to
  const remoteParticipantIds = useMemo(
    () =>
      participants
        .filter((p) => p._id !== myParticipantId)
        .map((p) => p._id),
    [participants, myParticipantId]
  );

  // ---------- Create / destroy peer connections ----------

  useEffect(() => {
    if (!localStream) return;

    const peers = peersRef.current;
    const currentIds = new Set(remoteParticipantIds.map(String));

    // Remove peers that are no longer in the participant list
    for (const [id, peer] of peers) {
      if (!currentIds.has(id)) {
        peer.pc.close();
        peers.delete(id);
        pendingCandidatesRef.current.delete(id);
        setStreamVersion((v) => v + 1);
      }
    }

    // Create peers for new participants
    for (const remoteId of remoteParticipantIds) {
      const key = String(remoteId);
      if (peers.has(key)) continue;

      const isInitiator = String(myParticipantId) < String(remoteId);
      const pc = new RTCPeerConnection(ICE_SERVERS);
      const remoteStream = new MediaStream();

      const peerState: PeerState = {
        pc,
        remoteStream,
        makingOffer: false,
      };
      peers.set(key, peerState);

      // Add local tracks
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });

      // Remote tracks
      pc.ontrack = (event) => {
        event.streams[0]?.getTracks().forEach((track) => {
          if (!remoteStream.getTracks().includes(track)) {
            remoteStream.addTrack(track);
          }
        });
        setStreamVersion((v) => v + 1);
      };

      // ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          send(
            remoteId,
            "ice-candidate",
            JSON.stringify(event.candidate.toJSON())
          );
        }
      };

      // Logging
      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "disconnected"
        ) {
          console.warn(
            `[usePeerConnections] Connection ${pc.connectionState} with ${remoteId}`
          );
        }
      };

      // Initiator creates offer
      if (isInitiator) {
        (async () => {
          try {
            peerState.makingOffer = true;
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await send(
              remoteId,
              "offer",
              JSON.stringify(pc.localDescription)
            );
          } catch (err) {
            console.error(
              "[usePeerConnections] Failed to create offer:",
              err
            );
          } finally {
            peerState.makingOffer = false;
          }
        })();
      }
    }

    // Cleanup all on unmount
    return () => {
      for (const [, peer] of peers) {
        peer.pc.close();
      }
      peers.clear();
      pendingCandidatesRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localStream, JSON.stringify(remoteParticipantIds)]);

  // ---------- Process incoming signals ----------

  useEffect(() => {
    if (!incomingSignals || incomingSignals.length === 0) return;

    const peers = peersRef.current;

    for (const signal of incomingSignals as Signal[]) {
      const fromKey = String(signal.fromParticipantId);
      const peer = peers.get(fromKey);

      if (!peer) {
        // We don't have a connection for this participant (yet); consume to
        // avoid reprocessing.
        consume(signal._id);
        continue;
      }

      const { pc } = peer;
      const isInitiator =
        String(myParticipantId) < String(signal.fromParticipantId);

      (async () => {
        try {
          switch (signal.type) {
            case "offer": {
              const offer: RTCSessionDescriptionInit = JSON.parse(
                signal.payload
              );
              const offerCollision =
                peer.makingOffer || pc.signalingState !== "stable";

              if (offerCollision && isInitiator) {
                // Impolite peer — discard
                break;
              }

              await pc.setRemoteDescription(
                new RTCSessionDescription(offer)
              );

              // Flush buffered ICE candidates
              const buffered =
                pendingCandidatesRef.current.get(fromKey) ?? [];
              for (const c of buffered) {
                await pc.addIceCandidate(new RTCIceCandidate(c));
              }
              pendingCandidatesRef.current.delete(fromKey);

              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              await send(
                signal.fromParticipantId,
                "answer",
                JSON.stringify(pc.localDescription)
              );
              break;
            }

            case "answer": {
              if (pc.signalingState !== "have-local-offer") break;
              const answer: RTCSessionDescriptionInit = JSON.parse(
                signal.payload
              );
              await pc.setRemoteDescription(
                new RTCSessionDescription(answer)
              );

              const buffered =
                pendingCandidatesRef.current.get(fromKey) ?? [];
              for (const c of buffered) {
                await pc.addIceCandidate(new RTCIceCandidate(c));
              }
              pendingCandidatesRef.current.delete(fromKey);
              break;
            }

            case "ice-candidate": {
              const candidate: RTCIceCandidateInit = JSON.parse(
                signal.payload
              );

              if (pc.remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
              } else {
                const buf =
                  pendingCandidatesRef.current.get(fromKey) ?? [];
                buf.push(candidate);
                pendingCandidatesRef.current.set(fromKey, buf);
              }
              break;
            }
          }
        } catch (err) {
          console.error(
            "[usePeerConnections] Error processing signal:",
            signal.type,
            err
          );
        } finally {
          await consume(signal._id);
        }
      })();
    }
  }, [incomingSignals, myParticipantId, send, consume]);

  // ---------- Build the return Map ----------

  const remoteStreams = useMemo(() => {
    // `streamVersion` is in the dependency array purely to trigger
    // recomputation when tracks arrive.
    void streamVersion;

    const map = new Map<string, MediaStream>();
    for (const [id, peer] of peersRef.current) {
      if (peer.remoteStream.getTracks().length > 0) {
        map.set(id, peer.remoteStream);
      }
    }
    return map;
  }, [streamVersion]);

  return remoteStreams;
}
