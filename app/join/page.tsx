"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function JoinMeetingPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setError("Please enter a meeting code.");
      return;
    }
    if (trimmed.length < 4) {
      setError("Meeting codes are at least 4 characters.");
      return;
    }
    router.push(`/join/${trimmed}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        {/* Logo */}
        <div className="mb-8">
          <Image
            src="/logo.gif"
            alt="Import Export Tire Company"
            width={180}
            height={50}
            className="h-12 w-auto mx-auto"
            priority
          />
          <p className="text-slate-400 text-sm mt-3">IE Central Meetings</p>
        </div>

        {/* Join Card */}
        <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-8 backdrop-blur">
          <h1 className="text-2xl font-bold text-white mb-2">Join a Meeting</h1>
          <p className="text-slate-400 text-sm mb-6">
            Enter the meeting code shared by your host.
          </p>

          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <input
                type="text"
                value={code}
                onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(""); }}
                placeholder="Enter meeting code"
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white text-center text-2xl font-mono tracking-widest placeholder:text-slate-500 placeholder:text-base placeholder:tracking-normal placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                maxLength={10}
                autoFocus
              />
              {error && (
                <p className="text-red-400 text-sm mt-2">{error}</p>
              )}
            </div>
            <button
              type="submit"
              className="w-full py-3 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-xl transition-colors text-lg"
            >
              Join Meeting
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-slate-600 text-xs mt-8">
          No account needed. You&apos;ll enter your name on the next screen.
        </p>
      </div>
    </div>
  );
}
