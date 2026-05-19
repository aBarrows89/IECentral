"use client";

import { useState, useEffect, useCallback, Component, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { ConvexProvider, ConvexReactClient } from "convex/react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Error boundary so a runtime crash inside the safety-check flow shows
// a readable message on the operator's phone instead of the opaque
// Next.js "Application error: a client-side exception has occurred"
// page. Includes the stack so we can copy/paste it back into a fix.
class SafetyCheckErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // eslint-disable-next-line no-console
    console.error("[safety-check] runtime crash:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-800 border border-red-500/40 rounded-xl p-6 text-center">
            <div className="text-red-400 text-5xl mb-3">!</div>
            <h1 className="text-white text-xl font-bold mb-2">Something went wrong</h1>
            <p className="text-slate-400 text-sm mb-4">
              The safety check page hit a runtime error. Please show this to your manager:
            </p>
            <pre className="text-left text-xs text-red-300 bg-slate-900 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-words">
              {this.state.error.message}
              {this.state.error.stack ? "\n\n" + this.state.error.stack.slice(0, 800) : ""}
            </pre>
            <button
              onClick={() => this.setState({ error: null })}
              className="mt-4 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

type ChecklistItem = {
  id: string;
  question: string;
  description?: string;
  minimumSeconds: number;
  order: number;
  responseType?: string; // "yes_no" | "yes_no_na" | "condition_report"
  requiresDetailsOn?: string; // "yes" | "no" | "na" | "always" | "never"
  detailsPrompt?: string;
  expectedAnswer?: string; // "yes" | "no" - the expected passing answer (defaults to "yes")
};

type Response = {
  itemId: string;
  question: string;
  passed: boolean;
  response?: string; // "yes" | "no" | "na"
  notes?: string;
  damageReported?: boolean;
  damageDetails?: string;
  timeSpent: number;
  completedAt: number;
};

function SafetyCheckContent() {
  const params = useParams();
  const equipmentId = params.equipmentId as string;

  // Determine equipment type from ID prefix (Convex IDs have table prefix)
  const equipmentType = equipmentId.startsWith("j") ? "picker" : "picker"; // Default to picker for now

  // State
  const [selectedPersonnelId, setSelectedPersonnelId] = useState<string>("");
  const [step, setStep] = useState<"select" | "checklist" | "complete">("select");
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [responses, setResponses] = useState<Response[]>([]);
  const [currentNotes, setCurrentNotes] = useState("");
  const [currentDamageDetails, setCurrentDamageDetails] = useState("");
  const [showDamageField, setShowDamageField] = useState(false);
  const [itemStartTime, setItemStartTime] = useState<number>(Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completionResult, setCompletionResult] = useState<{
    allPassed: boolean;
    totalTimeSpent: number;
    issueCount: number;
  } | null>(null);

  // Queries
  const checklistData = useQuery(api.safetyChecklist.getEquipmentChecklist, {
    equipmentType,
    equipmentId,
  });
  const eligiblePersonnel = useQuery(api.safetyChecklist.getEligiblePersonnel, {});

  // Mutations
  const submitChecklist = useMutation(api.safetyChecklist.submitChecklist);

  // Current item
  const items = checklistData?.items || [];
  const currentItem = items[currentItemIndex];
  const minimumSeconds = currentItem?.minimumSeconds || 0;
  const canProceed = elapsedSeconds >= minimumSeconds;

  // Timer effect
  useEffect(() => {
    if (step !== "checklist" || !currentItem) return;

    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - itemStartTime) / 1000));
    }, 100);

    return () => clearInterval(interval);
  }, [step, currentItem, itemStartTime]);

  // Reset timer when moving to next item
  useEffect(() => {
    if (step === "checklist") {
      setItemStartTime(Date.now());
      setElapsedSeconds(0);
      setCurrentNotes("");
      setCurrentDamageDetails("");
      setShowDamageField(false);
    }
  }, [currentItemIndex, step]);

  const handleStartChecklist = () => {
    if (!selectedPersonnelId) return;
    setStep("checklist");
    setCurrentItemIndex(0);
    setResponses([]);
    setItemStartTime(Date.now());
    setElapsedSeconds(0);
  };

  // Check if details are required for the current response
  const checkRequiresDetails = useCallback((responseValue: string) => {
    if (!currentItem) return false;
    const item = currentItem as ChecklistItem;
    const requiresOn = item.requiresDetailsOn || "never";
    if (requiresOn === "never") return false;
    if (requiresOn === "always") return true;
    return requiresOn === responseValue;
  }, [currentItem]);

  const handleResponse = useCallback((responseValue: "yes" | "no" | "na") => {
    if (!currentItem || !canProceed) return;

    // Check if we need to show damage details field first
    const needsDetails = checkRequiresDetails(responseValue);
    if (needsDetails && !showDamageField) {
      setShowDamageField(true);
      return; // Don't proceed yet, wait for details
    }

    // Determine if passed based on response and expectedAnswer
    // For N/A responses, we consider it as "passed" (not a failure)
    const typedItem = currentItem as ChecklistItem;
    const expectedAnswer = typedItem.expectedAnswer || "yes"; // Default to "yes" if not specified
    const passed = responseValue === "na" || responseValue === expectedAnswer;
    const damageReported = (responseValue !== "na" && responseValue !== expectedAnswer) || (needsDetails && currentDamageDetails.trim() !== "");

    const response: Response = {
      itemId: currentItem.id,
      question: currentItem.question,
      passed,
      response: responseValue,
      notes: currentNotes || undefined,
      damageReported: damageReported || undefined,
      damageDetails: currentDamageDetails.trim() || undefined,
      timeSpent: Math.floor((Date.now() - itemStartTime) / 1000),
      completedAt: Date.now(),
    };

    const newResponses = [...responses, response];
    setResponses(newResponses);

    if (currentItemIndex < items.length - 1) {
      setCurrentItemIndex(currentItemIndex + 1);
    } else {
      // All items completed, submit
      handleSubmit(newResponses);
    }
  }, [currentItem, canProceed, currentNotes, currentDamageDetails, showDamageField, checkRequiresDetails, itemStartTime, responses, currentItemIndex, items.length]);

  const handleSubmit = async (finalResponses: Response[]) => {
    if (!selectedPersonnelId || !checklistData) return;

    setIsSubmitting(true);
    try {
      const result = await submitChecklist({
        equipmentType,
        equipmentId,
        personnelId: selectedPersonnelId as Id<"personnel">,
        templateId: checklistData.templateId || undefined,
        responses: finalResponses,
      });

      setCompletionResult({
        allPassed: result.allPassed,
        totalTimeSpent: result.totalTimeSpent,
        issueCount: result.issueCount,
      });
      setStep("complete");
    } catch (error) {
      console.error("Failed to submit checklist:", error);
      alert("Failed to submit checklist. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `${secs}s`;
  };

  // Loading state — undefined means the Convex query hasn't resolved yet.
  // null is a successful response that just couldn't find the equipment.
  if (checklistData === undefined) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto mb-4"></div>
          <p>Loading checklist...</p>
          <p className="text-xs text-slate-500 mt-2">ID: {equipmentId}</p>
          <p className="text-xs text-slate-500">DB: {process.env.NEXT_PUBLIC_CONVEX_URL}</p>
        </div>
      </div>
    );
  }

  // Equipment not found (invalid ID or deleted)
  if (!checklistData || !checklistData.equipment) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">!</div>
          <h1 className="text-white text-xl font-bold mb-2">Equipment Not Found</h1>
          <p className="text-slate-400">The QR code may be invalid or the equipment has been removed.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 p-4">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-cyan-500/20 flex items-center justify-center">
              <span className="text-cyan-400 text-xl font-bold">#{checklistData.equipment.number}</span>
            </div>
            <div>
              <h1 className="text-white font-bold text-lg">
                Picker #{checklistData.equipment.number}
              </h1>
              <p className="text-slate-400 text-sm">{checklistData.equipment.locationName}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4">
        {/* Step: Select User */}
        {step === "select" && (
          <div className="space-y-6">
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
              <h2 className="text-white font-semibold text-lg mb-2">Pre-Operation Safety Check</h2>
              <p className="text-slate-400 text-sm mb-6">
                This checklist must be completed before operating this equipment.
                Select your name to begin.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-2">
                    Select Your Name
                  </label>
                  <select
                    value={selectedPersonnelId}
                    onChange={(e) => setSelectedPersonnelId(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="">-- Select your name --</option>
                    {eligiblePersonnel?.map((person) => (
                      <option key={person._id} value={person._id}>
                        {person.name} - {person.department}
                      </option>
                    ))}
                  </select>
                  <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/40">
                    <p className="text-red-300 text-xs leading-relaxed">
                      <span className="font-bold uppercase tracking-wide">Notice:</span>{" "}
                      Selecting a name other than your own is a{" "}
                      <span className="font-semibold">terminable offense</span>. If your
                      name is not listed, see your manager before proceeding.
                    </p>
                  </div>
                </div>

                {eligiblePersonnel?.length === 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                    <p className="text-amber-400 text-sm">
                      No eligible personnel found. You must complete "Picker Training Video"
                      training before operating this equipment.
                    </p>
                  </div>
                )}

                <button
                  onClick={handleStartChecklist}
                  disabled={!selectedPersonnelId}
                  className="w-full py-4 bg-cyan-500 hover:bg-cyan-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
                >
                  Start Safety Check
                </button>
              </div>
            </div>

            <div className="text-center text-slate-500 text-sm">
              <p>{items.length} items to complete</p>
              <p>Estimated time: ~{Math.ceil(items.reduce((sum, i) => sum + i.minimumSeconds, 0) / 60)} minutes</p>
            </div>
          </div>
        )}

        {/* Step: Checklist */}
        {step === "checklist" && currentItem && (
          <div className="space-y-4">
            {/* Progress */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">
                Step {currentItemIndex + 1} of {items.length}
              </span>
              <span className="text-cyan-400 font-medium">
                {Math.round(((currentItemIndex) / items.length) * 100)}% complete
              </span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-500 transition-all duration-300"
                style={{ width: `${((currentItemIndex) / items.length) * 100}%` }}
              />
            </div>

            {/* Current Item Card */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
              {/* Timer Header */}
              <div className={`px-4 py-3 flex items-center justify-between ${
                canProceed ? "bg-green-500/20" : "bg-amber-500/20"
              }`}>
                <div className="flex items-center gap-2">
                  {canProceed ? (
                    <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-amber-400 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                    </svg>
                  )}
                  <span className={`font-medium ${canProceed ? "text-green-400" : "text-amber-400"}`}>
                    {canProceed ? "Ready to proceed" : `Wait ${minimumSeconds - elapsedSeconds}s`}
                  </span>
                </div>
                <span className="text-slate-300 font-mono">{formatTime(elapsedSeconds)}</span>
              </div>

              {/* Question */}
              <div className="p-6">
                <h3 className="text-white text-lg font-semibold mb-2">{currentItem.question}</h3>
                {currentItem.description && (
                  <p className="text-slate-400 text-sm mb-4">{currentItem.description}</p>
                )}

                {/* Notes */}
                <div className="mb-4">
                  <label className="block text-slate-400 text-xs mb-1">Notes (optional)</label>
                  <textarea
                    value={currentNotes}
                    onChange={(e) => setCurrentNotes(e.target.value)}
                    placeholder="Add any observations or issues..."
                    rows={2}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 resize-none text-sm"
                  />
                </div>

                {/* Damage Details Field (shown when required) */}
                {showDamageField && (
                  <div className="mb-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                    <label className="block text-amber-400 text-sm font-medium mb-2">
                      {(currentItem as ChecklistItem).detailsPrompt || "Please describe the issue or damage observed:"}
                    </label>
                    <textarea
                      value={currentDamageDetails}
                      onChange={(e) => setCurrentDamageDetails(e.target.value)}
                      placeholder="Provide detailed description..."
                      rows={3}
                      autoFocus
                      className="w-full px-3 py-2 bg-slate-700 border border-amber-500/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 resize-none text-sm"
                    />
                    <p className="text-amber-400/70 text-xs mt-2">
                      Details are required before submitting this response.
                    </p>
                  </div>
                )}

                {/* Response Buttons based on responseType */}
                {(() => {
                  const typedItem = currentItem as ChecklistItem;
                  const responseType = typedItem.responseType || "yes_no";
                  const showNA = responseType === "yes_no_na";

                  return (
                    <div className={`grid gap-3 ${showNA ? "grid-cols-3" : "grid-cols-2"}`}>
                      <button
                        onClick={() => handleResponse("no")}
                        disabled={!canProceed || isSubmitting || (showDamageField && !currentDamageDetails.trim())}
                        className={`py-4 rounded-xl font-semibold transition-all ${
                          canProceed && (!showDamageField || currentDamageDetails.trim())
                            ? "bg-red-500 hover:bg-red-600 text-white"
                            : "bg-slate-700 text-slate-500 cursor-not-allowed"
                        }`}
                      >
                        <span className="flex items-center justify-center gap-2">
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                          NO
                        </span>
                      </button>
                      {showNA && (
                        <button
                          onClick={() => handleResponse("na")}
                          disabled={!canProceed || isSubmitting || (showDamageField && !currentDamageDetails.trim())}
                          className={`py-4 rounded-xl font-semibold transition-all ${
                            canProceed && (!showDamageField || currentDamageDetails.trim())
                              ? "bg-slate-500 hover:bg-slate-600 text-white"
                              : "bg-slate-700 text-slate-500 cursor-not-allowed"
                          }`}
                        >
                          <span className="flex items-center justify-center gap-2">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                            </svg>
                            N/A
                          </span>
                        </button>
                      )}
                      <button
                        onClick={() => handleResponse("yes")}
                        disabled={!canProceed || isSubmitting || (showDamageField && !currentDamageDetails.trim())}
                        className={`py-4 rounded-xl font-semibold transition-all ${
                          canProceed && (!showDamageField || currentDamageDetails.trim())
                            ? "bg-green-500 hover:bg-green-600 text-white"
                            : "bg-slate-700 text-slate-500 cursor-not-allowed"
                        }`}
                      >
                        <span className="flex items-center justify-center gap-2">
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          YES
                        </span>
                      </button>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Progress indicator */}
            <div className="flex justify-center gap-1">
              {items.map((_, idx) => (
                <div
                  key={idx}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    idx < currentItemIndex
                      ? responses[idx]?.passed
                        ? "bg-green-500"
                        : "bg-red-500"
                      : idx === currentItemIndex
                      ? "bg-cyan-500"
                      : "bg-slate-600"
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Step: Complete */}
        {step === "complete" && completionResult && (
          <div className="space-y-6">
            <div className={`rounded-xl p-8 text-center ${
              completionResult.allPassed
                ? "bg-green-500/20 border border-green-500/30"
                : "bg-amber-500/20 border border-amber-500/30"
            }`}>
              {completionResult.allPassed ? (
                <>
                  <div className="w-20 h-20 rounded-full bg-green-500 mx-auto mb-4 flex items-center justify-center">
                    <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <h2 className="text-green-400 text-2xl font-bold mb-2">All Clear!</h2>
                  <p className="text-slate-300">
                    Safety check complete. You may now operate this equipment.
                  </p>
                </>
              ) : (
                <>
                  <div className="w-20 h-20 rounded-full bg-amber-500 mx-auto mb-4 flex items-center justify-center">
                    <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <h2 className="text-amber-400 text-2xl font-bold mb-2">Issues Found</h2>
                  <p className="text-slate-300">
                    {completionResult.issueCount} item{completionResult.issueCount !== 1 ? "s" : ""} failed inspection.
                    Report to your supervisor before operating.
                  </p>
                </>
              )}
            </div>

            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <p className="text-slate-400 text-sm">Total Time</p>
                  <p className="text-white text-xl font-bold">
                    {formatTime(completionResult.totalTimeSpent)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm">Items Checked</p>
                  <p className="text-white text-xl font-bold">{items.length}</p>
                </div>
              </div>
            </div>

            {/* Summary of responses */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
              <div className="p-4 border-b border-slate-700">
                <h3 className="text-white font-semibold">Checklist Summary</h3>
              </div>
              <div className="divide-y divide-slate-700">
                {responses.map((r, idx) => (
                  <div key={idx} className="p-3 flex items-start gap-3">
                    <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center ${
                      r.response === "na" ? "bg-slate-500" : r.passed ? "bg-green-500" : "bg-red-500"
                    }`}>
                      {r.response === "na" ? (
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                        </svg>
                      ) : r.passed ? (
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-slate-300 text-sm">{r.question}</p>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          r.response === "na" ? "bg-slate-600 text-slate-300" :
                          r.passed ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                        }`}>
                          {r.response === "na" ? "N/A" : r.passed ? "YES" : "NO"}
                        </span>
                      </div>
                      {r.damageDetails && (
                        <p className="text-amber-400 text-xs mt-1 bg-amber-500/10 px-2 py-1 rounded">
                          Damage: {r.damageDetails}
                        </p>
                      )}
                      {r.notes && (
                        <p className="text-slate-500 text-xs mt-1">Note: {r.notes}</p>
                      )}
                    </div>
                    <span className="text-slate-500 text-xs">{r.timeSpent}s</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => {
                setStep("select");
                setSelectedPersonnelId("");
                setResponses([]);
                setCompletionResult(null);
              }}
              className="w-full py-4 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-xl transition-colors"
            >
              Start New Check
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-slate-700 p-3">
        <div className="max-w-lg mx-auto text-center">
          <p className="text-slate-500 text-xs">
            IE Tire Safety Checklist System
          </p>
        </div>
      </footer>
    </div>
  );
}

// Wrap with ConvexProvider since this is a public page
export default function SafetyCheckPage() {
  return (
    <ConvexProvider client={convex}>
      <SafetyCheckErrorBoundary>
        <SafetyCheckContent />
      </SafetyCheckErrorBoundary>
    </ConvexProvider>
  );
}
// Tue Jan 20 09:25:19 EST 2026
