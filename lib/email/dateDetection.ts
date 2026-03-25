/**
 * Date Detection Utility
 *
 * Detects dates, times, and event-like patterns in email content.
 */

export interface DetectedDate {
  text: string; // Original matched text
  date: Date; // Parsed date
  hasTime: boolean; // Whether a specific time was detected
  confidence: "high" | "medium" | "low";
  type: "explicit" | "relative" | "day_of_week";
}

export interface DetectedEvent {
  title?: string;
  dates: DetectedDate[];
  location?: string;
  description?: string;
}

// Common date patterns
const DATE_PATTERNS = {
  // MM/DD/YYYY or MM-DD-YYYY
  usDate: /\b(0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12]\d|3[01])[\/\-](20\d{2}|\d{2})\b/g,
  // YYYY-MM-DD (ISO format)
  isoDate: /\b(20\d{2})-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])\b/g,
  // Month DD, YYYY or Month DD YYYY
  longDate: /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?,?\s*(20\d{2})?\b/gi,
  // DD Month YYYY
  euroDate: /\b(0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December),?\s*(20\d{2})?\b/gi,
  // Short month: Jan 15, 2024
  shortMonthDate: /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?,?\s*(20\d{2})?\b/gi,
  // Relative dates
  relative: /\b(tomorrow|today|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month)|this\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend))\b/gi,
  // Day of week with optional "on"
  dayOfWeek: /\b(?:on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
};

// Time patterns
const TIME_PATTERNS = {
  // 12-hour format: 2:30 PM, 2:30pm, 2 PM
  time12: /\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm|a\.m\.|p\.m\.)\b/gi,
  // 24-hour format: 14:30, 09:00
  time24: /\b([01]?\d|2[0-3]):([0-5]\d)\b/g,
  // Time ranges: 2-4 PM, 2:00 - 4:00 PM
  timeRange: /\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*[-–to]+\s*(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm|a\.m\.|p\.m\.)\b/gi,
};

// Event keywords that suggest this email contains event info
const EVENT_KEYWORDS = [
  "meeting", "call", "appointment", "interview", "conference",
  "schedule", "scheduled", "booking", "reservation", "event",
  "webinar", "seminar", "training", "session", "presentation",
  "deadline", "due date", "reminder", "follow-up", "sync",
  "invite", "invitation", "rsvp", "attend", "join us",
];

// Location keywords
const LOCATION_PATTERNS = [
  /(?:at|in|@)\s+([^,.\n]+(?:room|building|office|conference|center|hall|floor|suite|address)?[^,.\n]*)/gi,
  /(?:location|venue|address|place):\s*([^\n]+)/gi,
  /(?:zoom|teams|meet|webex|google meet)(?:\s+link)?:\s*(https?:\/\/[^\s]+)/gi,
];

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6,
  aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const DAYS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

/**
 * Parse a month name to its index (0-11)
 */
function parseMonth(month: string): number {
  return MONTHS[month.toLowerCase()] ?? 0;
}

/**
 * Get the next occurrence of a day of week from a reference date
 */
function getNextDayOfWeek(day: string, referenceDate: Date, fromSameDay: boolean = false): Date {
  const targetDay = DAYS[day.toLowerCase()];
  if (targetDay === undefined) return new Date(referenceDate);

  const ref = new Date(referenceDate);
  ref.setHours(9, 0, 0, 0);

  const currentDay = ref.getDay();
  let daysUntil = targetDay - currentDay;

  if (daysUntil <= 0 && !fromSameDay) {
    daysUntil += 7;
  }

  const result = new Date(ref);
  result.setDate(result.getDate() + daysUntil);
  return result;
}

/**
 * Parse relative date expressions relative to the email's send date
 */
function parseRelativeDate(text: string, referenceDate: Date): Date | null {
  const lower = text.toLowerCase().trim();
  const ref = new Date(referenceDate);
  ref.setHours(9, 0, 0, 0);

  if (lower === "today") {
    return ref;
  }

  if (lower === "tomorrow") {
    const tomorrow = new Date(ref);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  if (lower.startsWith("next ")) {
    const target = lower.replace("next ", "");
    if (target === "week") {
      const nextWeek = new Date(ref);
      nextWeek.setDate(nextWeek.getDate() + 7);
      return nextWeek;
    }
    if (target === "month") {
      const nextMonth = new Date(ref);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      return nextMonth;
    }
    if (DAYS[target] !== undefined) {
      const result = getNextDayOfWeek(target, ref);
      const daysAhead = (result.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24);
      if (daysAhead < 7) {
        result.setDate(result.getDate() + 7);
      }
      return result;
    }
  }

  if (lower.startsWith("this ")) {
    const target = lower.replace("this ", "");
    if (target === "weekend") {
      return getNextDayOfWeek("saturday", ref, true);
    }
    if (DAYS[target] !== undefined) {
      return getNextDayOfWeek(target, ref, true);
    }
  }

  return null;
}

/**
 * Extract time from text and apply to a date
 */
function applyTimeToDate(date: Date, timeText: string): { date: Date; hasTime: boolean } {
  const result = new Date(date);

  // Try 12-hour format
  const match12 = timeText.match(/\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm|a\.m\.|p\.m\.)/i);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = match12[2] ? parseInt(match12[2], 10) : 0;
    const isPM = match12[3].toLowerCase().startsWith("p");

    if (isPM && hours !== 12) hours += 12;
    if (!isPM && hours === 12) hours = 0;

    result.setHours(hours, minutes, 0, 0);
    return { date: result, hasTime: true };
  }

  // Try 24-hour format
  const match24 = timeText.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (match24) {
    const hours = parseInt(match24[1], 10);
    const minutes = parseInt(match24[2], 10);
    result.setHours(hours, minutes, 0, 0);
    return { date: result, hasTime: true };
  }

  return { date: result, hasTime: false };
}

/**
 * Detect all dates in email content
 * @param content - Email HTML or text content
 * @param emailDate - The date the email was sent (for resolving relative dates like "tomorrow")
 */
export function detectDates(content: string, emailDate?: Date | number): DetectedDate[] {
  const detected: DetectedDate[] = [];
  // Strip quoted email threads — everything after "From:" / "On ... wrote:" / "------"
  const strippedContent = content
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "")
    .replace(/^[-_]{3,}[\s\S]*/m, "")
    .replace(/^From:[\s\S]*/mi, "")
    .replace(/^On .+ wrote:[\s\S]*/mi, "")
    .replace(/^Sent:[\s\S]*/mi, "");
  const plainText = stripHtml(strippedContent);
  const refDate = emailDate ? new Date(emailDate) : new Date();

  // US Date format (MM/DD/YYYY)
  let match;
  const usDateRegex = new RegExp(DATE_PATTERNS.usDate.source, "g");
  while ((match = usDateRegex.exec(plainText)) !== null) {
    const [fullMatch, month, day, year] = match;
    const fullYear = year.length === 2 ? 2000 + parseInt(year, 10) : parseInt(year, 10);
    const date = new Date(fullYear, parseInt(month, 10) - 1, parseInt(day, 10), 9, 0, 0);

    // Look for nearby time
    const contextStart = Math.max(0, match.index - 20);
    const contextEnd = Math.min(plainText.length, match.index + fullMatch.length + 30);
    const context = plainText.slice(contextStart, contextEnd);
    const { date: dateWithTime, hasTime } = applyTimeToDate(date, context);

    detected.push({
      text: fullMatch,
      date: dateWithTime,
      hasTime,
      confidence: "high",
      type: "explicit",
    });
  }

  // ISO Date format (YYYY-MM-DD)
  const isoDateRegex = new RegExp(DATE_PATTERNS.isoDate.source, "g");
  while ((match = isoDateRegex.exec(plainText)) !== null) {
    const [fullMatch, year, month, day] = match;
    const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10), 9, 0, 0);

    const contextStart = Math.max(0, match.index - 20);
    const contextEnd = Math.min(plainText.length, match.index + fullMatch.length + 30);
    const context = plainText.slice(contextStart, contextEnd);
    const { date: dateWithTime, hasTime } = applyTimeToDate(date, context);

    detected.push({
      text: fullMatch,
      date: dateWithTime,
      hasTime,
      confidence: "high",
      type: "explicit",
    });
  }

  // Long date format (January 15, 2024)
  const longDateRegex = new RegExp(DATE_PATTERNS.longDate.source, "gi");
  while ((match = longDateRegex.exec(plainText)) !== null) {
    const [fullMatch, monthName, day, year] = match;
    const monthIndex = parseMonth(monthName);
    const fullYear = year ? parseInt(year, 10) : new Date().getFullYear();
    const date = new Date(fullYear, monthIndex, parseInt(day, 10), 9, 0, 0);

    const contextStart = Math.max(0, match.index - 20);
    const contextEnd = Math.min(plainText.length, match.index + fullMatch.length + 30);
    const context = plainText.slice(contextStart, contextEnd);
    const { date: dateWithTime, hasTime } = applyTimeToDate(date, context);

    detected.push({
      text: fullMatch,
      date: dateWithTime,
      hasTime,
      confidence: "high",
      type: "explicit",
    });
  }

  // Short month format (Jan 15, 2024)
  const shortMonthRegex = new RegExp(DATE_PATTERNS.shortMonthDate.source, "gi");
  while ((match = shortMonthRegex.exec(plainText)) !== null) {
    const [fullMatch, monthName, day, year] = match;
    const monthIndex = parseMonth(monthName);
    const fullYear = year ? parseInt(year, 10) : new Date().getFullYear();
    const date = new Date(fullYear, monthIndex, parseInt(day, 10), 9, 0, 0);

    const contextStart = Math.max(0, match.index - 20);
    const contextEnd = Math.min(plainText.length, match.index + fullMatch.length + 30);
    const context = plainText.slice(contextStart, contextEnd);
    const { date: dateWithTime, hasTime } = applyTimeToDate(date, context);

    detected.push({
      text: fullMatch,
      date: dateWithTime,
      hasTime,
      confidence: "high",
      type: "explicit",
    });
  }

  // Relative dates (tomorrow, next Monday, etc.)
  const relativeRegex = new RegExp(DATE_PATTERNS.relative.source, "gi");
  while ((match = relativeRegex.exec(plainText)) !== null) {
    const [fullMatch] = match;
    const parsedDate = parseRelativeDate(fullMatch, refDate);
    if (parsedDate) {
      const contextStart = Math.max(0, match.index - 20);
      const contextEnd = Math.min(plainText.length, match.index + fullMatch.length + 30);
      const context = plainText.slice(contextStart, contextEnd);
      const { date: dateWithTime, hasTime } = applyTimeToDate(parsedDate, context);

      detected.push({
        text: fullMatch,
        date: dateWithTime,
        hasTime,
        confidence: "medium",
        type: "relative",
      });
    }
  }

  // Day of week (Monday, Tuesday, etc.) - lower confidence
  const dayOfWeekRegex = new RegExp(DATE_PATTERNS.dayOfWeek.source, "gi");
  while ((match = dayOfWeekRegex.exec(plainText)) !== null) {
    const [fullMatch, day] = match;
    // Skip if already matched by relative patterns
    const alreadyMatched = detected.some(d =>
      d.text.toLowerCase().includes(day.toLowerCase())
    );
    if (alreadyMatched) continue;

    // Skip generic day mentions that aren't event-like (check surrounding context)
    const surroundStart = Math.max(0, match.index - 40);
    const surroundEnd = Math.min(plainText.length, match.index + fullMatch.length + 40);
    const surrounding = plainText.slice(surroundStart, surroundEnd).toLowerCase();
    const hasEventContext = EVENT_KEYWORDS.some(kw => surrounding.includes(kw)) ||
      /\bat\b|\bby\b|\bon\b|\buntil\b|\bbefore\b|\bafter\b/.test(surrounding);
    if (!hasEventContext) continue; // Skip standalone day mentions

    const parsedDate = getNextDayOfWeek(day, refDate);
    const contextStart = Math.max(0, match.index - 20);
    const contextEnd = Math.min(plainText.length, match.index + fullMatch.length + 30);
    const context = plainText.slice(contextStart, contextEnd);
    const { date: dateWithTime, hasTime } = applyTimeToDate(parsedDate, context);

    detected.push({
      text: fullMatch,
      date: dateWithTime,
      hasTime,
      confidence: "low",
      type: "day_of_week",
    });
  }

  // Sort by confidence and date
  detected.sort((a, b) => {
    const confidenceOrder = { high: 0, medium: 1, low: 2 };
    if (confidenceOrder[a.confidence] !== confidenceOrder[b.confidence]) {
      return confidenceOrder[a.confidence] - confidenceOrder[b.confidence];
    }
    return a.date.getTime() - b.date.getTime();
  });

  // Remove duplicates (same date within 1 day)
  const unique: DetectedDate[] = [];
  for (const d of detected) {
    const isDuplicate = unique.some(u =>
      Math.abs(u.date.getTime() - d.date.getTime()) < 24 * 60 * 60 * 1000
    );
    if (!isDuplicate) {
      unique.push(d);
    }
  }

  return unique;
}

/**
 * Check if email content likely contains event information
 */
export function hasEventKeywords(content: string): boolean {
  const lower = stripHtml(content).toLowerCase();
  return EVENT_KEYWORDS.some(keyword => lower.includes(keyword));
}

/**
 * Extract potential event information from email
 */
export function extractEventInfo(subject: string, content: string, emailDate?: Date | number): DetectedEvent {
  const plainText = stripHtml(content);
  const dates = detectDates(content, emailDate);

  // Try to extract location
  let location: string | undefined;
  for (const pattern of LOCATION_PATTERNS) {
    const match = plainText.match(new RegExp(pattern.source, "i"));
    if (match && match[1]) {
      location = match[1].trim();
      break;
    }
  }

  // Use subject as potential title, or extract from content
  let title = subject;
  if (!title || title.toLowerCase().startsWith("re:") || title.toLowerCase().startsWith("fwd:")) {
    // Try to find event-like phrases in content
    const eventPhraseMatch = plainText.match(
      /(?:meeting|call|appointment|interview|event|session)\s+(?:about|for|regarding|with)?\s*[:\-]?\s*([^\n.!?]{5,50})/i
    );
    if (eventPhraseMatch) {
      title = eventPhraseMatch[1].trim();
    }
  }

  return {
    title: title ? title.replace(/^(re:|fwd:)\s*/i, "").trim() : undefined,
    dates,
    location,
    description: plainText.slice(0, 500),
  };
}

/**
 * Strip HTML tags from content
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}
