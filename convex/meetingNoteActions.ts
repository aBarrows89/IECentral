"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import Anthropic from "@anthropic-ai/sdk";
import { Id } from "./_generated/dataModel";

export const transcribeAndGenerateNotes = action({
  args: {
    notesId: v.id("meetingNotes"),
    meetingId: v.id("meetings"),
  },
  handler: async (ctx, args) => {
    const { notesId, meetingId } = args;

    try {
      // 1. Get the meeting notes record to find the audio file
      const notes = await ctx.runQuery(api.meetingNotes.get, { notesId });
      if (!notes || !notes.audioFileId) {
        throw new Error("Meeting notes or audio file not found");
      }

      // Get meeting details for context
      const meeting = await ctx.runQuery(api.meetings.get, { meetingId });
      if (!meeting) {
        throw new Error("Meeting not found");
      }

      // 2. Fetch audio from Convex storage
      const audioUrl = await ctx.storage.getUrl(notes.audioFileId);
      if (!audioUrl) {
        throw new Error("Could not get audio file URL");
      }

      const audioResponse = await fetch(audioUrl);
      if (!audioResponse.ok) {
        throw new Error(`Failed to fetch audio: ${audioResponse.statusText}`);
      }

      const audioBuffer = await audioResponse.arrayBuffer();

      // 3. Transcribe with OpenAI Whisper API
      await ctx.runMutation(internal.meetingNotes.internalUpdateStatus, {
        notesId,
        status: "transcribing",
      });

      let transcript: string;

      if (!process.env.OPENAI_API_KEY) {
        console.error("OPENAI_API_KEY not configured - using placeholder transcript");
        transcript = "[Transcription unavailable - OPENAI_API_KEY not configured. Audio was recorded successfully.]";
      } else {
        const formData = new FormData();
        const audioBlob = new Blob([audioBuffer], { type: "audio/webm" });
        formData.append("file", audioBlob, "meeting-audio.webm");
        formData.append("model", "whisper-1");
        formData.append("response_format", "text");
        formData.append("language", "en");

        const whisperResponse = await fetch(
          "https://api.openai.com/v1/audio/transcriptions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: formData,
          }
        );

        if (!whisperResponse.ok) {
          const errorText = await whisperResponse.text();
          throw new Error(`Whisper API error: ${whisperResponse.status} - ${errorText}`);
        }

        transcript = await whisperResponse.text();
      }

      // 4. Store the transcript
      await ctx.runMutation(internal.meetingNotes.internalUpdateTranscript, {
        notesId,
        transcript,
      });

      // 5. Generate AI notes with Claude
      if (!process.env.ANTHROPIC_API_KEY) {
        console.error("ANTHROPIC_API_KEY not configured - skipping note generation");
        await ctx.runMutation(internal.meetingNotes.internalUpdateNotes, {
          notesId,
          summary: "AI note generation unavailable - ANTHROPIC_API_KEY not configured.",
          actionItems: [],
          decisions: [],
          followUps: [],
          keyTopics: [],
        });
      } else {
        const anthropic = new Anthropic({
          apiKey: process.env.ANTHROPIC_API_KEY,
        });

        const prompt = `You are an AI meeting assistant. Analyze the following meeting transcript and generate comprehensive meeting notes.

MEETING TITLE: ${meeting.title}
MEETING DATE: ${new Date(meeting.startedAt || meeting.createdAt).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
${notes.duration ? `DURATION: ${Math.floor(notes.duration / 60)} minutes` : ""}

TRANSCRIPT:
${transcript}

Generate meeting notes in the following JSON format:
{
  "summary": "A comprehensive 2-3 paragraph summary of the meeting, covering the main topics discussed, key points made, and overall outcome.",
  "actionItems": [
    {
      "text": "Description of the action item",
      "assignee": "Name of person responsible (if mentioned, otherwise null)",
      "dueDate": "Due date if mentioned (e.g., 'March 25, 2026'), otherwise null"
    }
  ],
  "decisions": ["Decision 1 that was made", "Decision 2 that was made"],
  "followUps": ["Follow-up item 1", "Follow-up item 2"],
  "keyTopics": ["Topic 1", "Topic 2", "Topic 3"]
}

IMPORTANT RULES:
1. Be thorough but concise in the summary
2. Extract ALL action items mentioned, even implicit ones
3. Include assignees and due dates only when explicitly mentioned
4. Capture all decisions that were agreed upon
5. List follow-up items that need attention after the meeting
6. Identify 3-8 key topics that were discussed
7. If the transcript is very short or unclear, do your best with available information
8. Return ONLY valid JSON, no other text`;

        try {
          const response = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 4096,
            messages: [
              {
                role: "user",
                content: prompt,
              },
            ],
          });

          const content = response.content[0];
          if (content.type !== "text") {
            throw new Error("Unexpected response type from Claude");
          }

          // Parse JSON response
          const jsonMatch = content.text.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            throw new Error("Could not parse notes from Claude response");
          }

          const generatedNotes = JSON.parse(jsonMatch[0]);

          // Store the generated notes
          await ctx.runMutation(internal.meetingNotes.internalUpdateNotes, {
            notesId,
            summary: generatedNotes.summary || "No summary generated.",
            actionItems: (generatedNotes.actionItems || []).map(
              (item: { text: string; assignee?: string | null; dueDate?: string | null }) => ({
                text: item.text,
                assignee: item.assignee || undefined,
                dueDate: item.dueDate || undefined,
                completed: false,
              })
            ),
            decisions: generatedNotes.decisions || [],
            followUps: generatedNotes.followUps || [],
            keyTopics: generatedNotes.keyTopics || [],
          });
        } catch (aiError) {
          console.error("Claude note generation failed:", aiError);
          await ctx.runMutation(internal.meetingNotes.internalUpdateNotes, {
            notesId,
            summary: "AI note generation failed. The transcript is available below.",
            actionItems: [],
            decisions: [],
            followUps: [],
            keyTopics: [],
          });
        }
      }

      // 6. Send notification to all meeting participants
      const participants = await ctx.runQuery(
        api.meetingParticipants.getByMeeting,
        { meetingId }
      );

      if (participants) {
        for (const participant of participants) {
          if (participant.userId) {
            try {
              await ctx.runMutation(api.notifications.create, {
                userId: participant.userId as Id<"users">,
                type: "meeting_notes",
                title: "Meeting Notes Ready",
                message: `AI-generated notes for "${meeting.title}" are now available.`,
                link: `/meetings/notes/${meetingId}`,
              });
            } catch (err) {
              console.error(
                "Failed to send notification to participant:",
                participant.userId,
                err
              );
            }
          }
        }
      }
    } catch (error) {
      console.error("transcribeAndGenerateNotes failed:", error);
      await ctx.runMutation(internal.meetingNotes.internalUpdateStatus, {
        notesId,
        status: "error",
        errorMessage:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  },
});
