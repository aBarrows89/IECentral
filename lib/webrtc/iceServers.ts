export const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    // Metered.ca free TURN relay (fallback for restrictive NATs)
    {
      urls: "turn:a.relay.metered.ca:80",
      username: "e8dd65a92f60eaaa0c4c93c4",
      credential: "uWdDqbONb19vGYLb",
    },
    {
      urls: "turn:a.relay.metered.ca:443",
      username: "e8dd65a92f60eaaa0c4c93c4",
      credential: "uWdDqbONb19vGYLb",
    },
    {
      urls: "turn:a.relay.metered.ca:443?transport=tcp",
      username: "e8dd65a92f60eaaa0c4c93c4",
      credential: "uWdDqbONb19vGYLb",
    },
  ],
  iceCandidatePoolSize: 10,
};
