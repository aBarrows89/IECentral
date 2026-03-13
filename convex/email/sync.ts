/**
 * Email Sync Actions
 *
 * IMAP sync functionality for fetching emails from mail servers.
 * Uses imapflow for IMAP connections.
 */

"use node";

import { action, internalAction } from "../_generated/server";
import { internal, api } from "../_generated/api";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { ImapFlow } from "imapflow";
import { simpleParser, ParsedMail } from "mailparser";
import { decrypt } from "./encryptionUtils";

// ============ TYPES ============

interface ImapCredentials {
  host: string;
  port: number;
  user: string;
  pass: string;
  secure: boolean;
}

interface EmailAddress {
  name?: string;
  address: string;
}

interface SyncResult {
  success: boolean;
  error?: string;
  emailsSynced?: number;
}

// ============ HELPER FUNCTIONS ============

/**
 * Decrypt credentials from the account.
 * Note: In production, use the encryption module. For now, credentials are stored as-is.
 */
function getImapCredentials(account: {
  provider: string;
  emailAddress: string;
  accessToken?: string;
  imapHost?: string;
  imapPort?: number;
  imapUsername?: string;
  imapPassword?: string;
  imapTls?: boolean;
  oauthProvider?: string;
}): ImapCredentials {
  // For OAuth providers (Gmail, Outlook, Yahoo)
  if (account.oauthProvider && account.accessToken) {
    const configs: Record<string, { host: string; port: number }> = {
      google: { host: "imap.gmail.com", port: 993 },
      microsoft: { host: "outlook.office365.com", port: 993 },
      yahoo: { host: "imap.mail.yahoo.com", port: 993 },
    };

    const config = configs[account.oauthProvider] || configs.google;

    return {
      host: config.host,
      port: config.port,
      user: account.emailAddress,
      pass: account.accessToken, // OAuth access token
      secure: true,
    };
  }

  // For generic IMAP - decrypt the password
  let password = account.imapPassword || "";
  console.log("IMAP password format check - has colons:", password.includes(":"), "length:", password.length);

  if (password && password.includes(":")) {
    // Password is encrypted (format: iv:authTag:ciphertext)
    try {
      password = decrypt(password);
      console.log("Password decrypted successfully, length:", password.length);
    } catch (e) {
      console.error("Failed to decrypt IMAP password:", e);
      throw new Error("Failed to decrypt stored password - account may need to be re-added");
    }
  }

  const username = account.imapUsername || account.emailAddress;
  console.log("Using IMAP credentials - host:", account.imapHost, "user:", username, "pass length:", password.length);

  return {
    host: account.imapHost || "imap.gmail.com",
    port: account.imapPort || 993,
    user: username,
    pass: password,
    secure: account.imapTls !== false,
  };
}

/**
 * Map IMAP folder to folder type.
 */
function mapFolderType(folder: {
  path: string;
  specialUse?: string;
  flags?: Set<string>;
}): string {
  // Check special-use first
  if (folder.specialUse) {
    const map: Record<string, string> = {
      "\\Inbox": "inbox",
      "\\Sent": "sent",
      "\\Drafts": "drafts",
      "\\Trash": "trash",
      "\\Junk": "spam",
      "\\All": "archive",
      "\\Archive": "archive",
    };
    if (map[folder.specialUse]) return map[folder.specialUse];
  }

  // Check path name
  const pathLower = folder.path.toLowerCase();
  if (pathLower === "inbox") return "inbox";
  if (pathLower.includes("sent")) return "sent";
  if (pathLower.includes("draft")) return "drafts";
  if (pathLower.includes("trash") || pathLower.includes("deleted"))
    return "trash";
  if (pathLower.includes("junk") || pathLower.includes("spam")) return "spam";
  if (pathLower.includes("archive")) return "archive";

  return "custom";
}

/**
 * Parse email address from IMAP format.
 */
function parseAddress(addr: { name?: string; address?: string } | undefined): EmailAddress | undefined {
  if (!addr || !addr.address) return undefined;
  return {
    name: addr.name || undefined,
    address: addr.address,
  };
}

/**
 * Parse array of email addresses.
 */
function parseAddresses(addrs: Array<{ name?: string; address?: string }> | undefined): EmailAddress[] {
  if (!addrs) return [];
  return addrs
    .filter((a) => a.address)
    .map((a) => ({
      name: a.name || undefined,
      address: a.address!,
    }));
}

/**
 * Generate snippet from body.
 */
function generateSnippet(text: string | undefined, html: string | undefined): string {
  let content = text || "";

  // If only HTML, strip tags
  if (!content && html) {
    content = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Limit to 200 chars
  if (content.length > 200) {
    return content.substring(0, 197) + "...";
  }
  return content;
}

/**
 * Parse email body from MIME source using mailparser.
 */
async function parseEmailBody(source: Buffer): Promise<{ text?: string; html?: string }> {
  try {
    const parsed: ParsedMail = await simpleParser(source);
    return {
      text: parsed.text || undefined,
      html: typeof parsed.html === "string" ? parsed.html : undefined,
    };
  } catch (err) {
    console.error("Failed to parse email body:", err);
    return { text: undefined, html: undefined };
  }
}

// ============ SYNC ACTIONS ============

/**
 * Sync all active accounts.
 */
export const syncAllAccounts = internalAction({
  args: {},
  handler: async (ctx) => {
    // Get all active accounts
    const accounts = await ctx.runQuery(internal.email.syncMutations.listActiveAccounts, {});

    const results: Array<{ accountId: string; success: boolean; error?: string }> = [];

    for (const account of accounts) {
      try {
        const result = await ctx.runAction(internal.email.sync.performIncrementalSync, {
          accountId: account._id,
        });
        results.push({
          accountId: account._id,
          success: result.success,
          error: result.error,
        });
      } catch (error) {
        results.push({
          accountId: account._id,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return results;
  },
});

/**
 * Perform full sync for an account (last 30 days).
 */
export const performFullSync = internalAction({
  args: {
    accountId: v.id("emailAccounts"),
  },
  handler: async (ctx, args) => {
    // Get account with credentials
    const account = await ctx.runQuery(
      api.email.accounts.getWithCredentials,
      { accountId: args.accountId }
    );

    if (!account || !account.isActive) {
      console.log("Account not found or inactive:", args.accountId);
      return { success: false, error: "Account not found or inactive" };
    }

    // Update sync status
    await ctx.runMutation(internal.email.accounts.updateSyncState, {
      accountId: args.accountId,
      syncStatus: "syncing",
    });

    // Log sync start
    await ctx.runMutation(internal.email.syncMutations.logSync, {
      accountId: args.accountId,
      action: "full_sync",
      status: "started",
    });

    let client: ImapFlow | null = null;
    let totalEmails = 0;
    const startTime = Date.now();

    try {
      const credentials = getImapCredentials(account);

      // Connect to IMAP
      console.log("Creating IMAP client for:", credentials.host, "port:", credentials.port, "secure:", credentials.secure);

      client = new ImapFlow({
        host: credentials.host,
        port: credentials.port,
        secure: credentials.secure,
        auth: account.oauthProvider
          ? {
              user: credentials.user,
              accessToken: credentials.pass,
            }
          : {
              user: credentials.user,
              pass: credentials.pass,
            },
        logger: {
          debug: (info: unknown) => console.log("[IMAP DEBUG]", info),
          info: (info: unknown) => console.log("[IMAP INFO]", info),
          warn: (info: unknown) => console.warn("[IMAP WARN]", info),
          error: (info: unknown) => console.error("[IMAP ERROR]", info),
        },
        tls: {
          rejectUnauthorized: false, // Allow self-signed certs
        },
      });

      console.log("Connecting to IMAP:", credentials.host, "port:", credentials.port, "user:", credentials.user);
      try {
        await client.connect();
        console.log("IMAP connected successfully");
      } catch (connectError) {
        console.error("IMAP connection error details:", connectError);
        throw connectError;
      }

      // List and sync folders
      const folders = await client.list();

      for (const folder of folders) {
        // Skip non-selectable folders
        if (folder.flags?.has("\\Noselect")) continue;

        const folderType = mapFolderType(folder);

        // Create/update folder in database
        const folderId = await ctx.runMutation(api.email.folders.upsert, {
          accountId: args.accountId,
          name: folder.name,
          path: folder.path,
          type: folderType,
          flags: folder.flags ? Array.from(folder.flags) : undefined,
        });

        // Open folder and get status
        const mailbox = await client.mailboxOpen(folder.path);

        // Calculate date range (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Search for messages in date range
        let messageUids: number[] = [];
        try {
          const searchResult = await client.search(
            { since: thirtyDaysAgo },
            { uid: true }
          );
          messageUids = searchResult as number[];
        } catch {
          // Folder might be empty
          messageUids = [];
        }

        if (messageUids.length === 0) {
          // Update folder counts (unseen is not in TS types but available at runtime)
          const mailboxAny = mailbox as { exists?: number | string; unseen?: number | string };
          await ctx.runMutation(api.email.folders.updateCounts, {
            folderId: folderId as Id<"emailFolders">,
            totalCount: Number(mailboxAny.exists) || 0,
            unreadCount: Number(mailboxAny.unseen) || 0,
          });
          continue;
        }

        // Fetch messages in batches of 25
        const batchSize = 25;
        for (let i = 0; i < messageUids.length; i += batchSize) {
          const batchUids = messageUids.slice(i, i + batchSize);
          const uidRange = batchUids.join(",");

          try {
            const messages = client.fetch(uidRange, {
              uid: true,
              envelope: true,
              bodyStructure: true,
              flags: true,
              labels: true,
              source: { start: 0, maxLength: 50000 }, // First 50KB
            });

            for await (const msg of messages) {
              const envelope = msg.envelope;
              if (!envelope) continue;

              // Extract body text and HTML using mailparser
              let bodyText: string | undefined;
              let bodyHtml: string | undefined;

              if (msg.source) {
                const parsed = await parseEmailBody(msg.source);
                bodyText = parsed.text?.substring(0, 50000); // Limit to 50KB
                bodyHtml = parsed.html?.substring(0, 100000); // Limit to 100KB
              }

              // Check for attachments
              const hasAttachments =
                msg.bodyStructure?.childNodes?.some(
                  (node: { disposition?: string }) =>
                    node.disposition === "attachment"
                ) || false;

              // Determine flags
              const flags = msg.flags || new Set();
              const isRead = flags.has("\\Seen");
              const isStarred = flags.has("\\Flagged");
              const isDraft = flags.has("\\Draft");

              // Create email
              await ctx.runMutation(internal.email.emails.create, {
                accountId: args.accountId,
                folderId: folderId as Id<"emailFolders">,
                messageId: envelope.messageId || `${msg.uid}@${folder.path}`,
                uid: msg.uid,
                threadId: envelope.messageId, // Use message ID as thread for now
                subject: envelope.subject || "(No Subject)",
                from: parseAddress(envelope.from?.[0]) || {
                  address: "unknown@unknown.com",
                },
                to: parseAddresses(envelope.to),
                cc: parseAddresses(envelope.cc),
                bcc: parseAddresses(envelope.bcc),
                replyTo: parseAddress(envelope.replyTo?.[0]),
                inReplyTo: envelope.inReplyTo || undefined,
                references: undefined, // Would need to parse from headers
                bodyText,
                bodyHtml,
                snippet: generateSnippet(bodyText, bodyHtml),
                date: envelope.date?.getTime() || Date.now(),
                size: msg.size || undefined,
                isRead,
                isStarred,
                isImportant: false,
                isDraft,
                hasAttachments,
                labels: msg.labels ? Array.from(msg.labels) : undefined,
              });

              totalEmails++;
            }
          } catch (err) {
            console.error(`Error fetching batch in ${folder.path}:`, err);
          }
        }

        // Update folder counts
        const mailboxCounts = mailbox as { exists?: number | string; unseen?: number | string };
        await ctx.runMutation(api.email.folders.updateCounts, {
          folderId: folderId as Id<"emailFolders">,
          totalCount: Number(mailboxCounts.exists) || 0,
          unreadCount: Number(mailboxCounts.unseen) || 0,
        });

        // Update last sync UID
        if (messageUids.length > 0) {
          await ctx.runMutation(internal.email.folders.updateLastSyncUid, {
            folderId: folderId as Id<"emailFolders">,
            lastSyncUid: Math.max(...messageUids),
          });
        }
      }

      await client.logout();

      // Update sync state
      await ctx.runMutation(internal.email.accounts.updateSyncState, {
        accountId: args.accountId,
        lastSyncAt: Date.now(),
        syncStatus: "idle",
        syncError: undefined,
      });

      // Log success
      await ctx.runMutation(internal.email.syncMutations.logSync, {
        accountId: args.accountId,
        action: "full_sync",
        status: "completed",
        emailsProcessed: totalEmails,
        duration: Date.now() - startTime,
      });

      return { success: true, emailsSynced: totalEmails };
    } catch (error) {
      console.error("Full sync error:", error);

      // Get more detailed error message
      let errorMessage = "Unknown error";
      if (error instanceof Error) {
        errorMessage = error.message;
        // Check for common IMAP errors
        if (error.message.includes("AUTHENTICATIONFAILED") || error.message.includes("Invalid credentials")) {
          errorMessage = "Authentication failed - check your email/password";
        } else if (error.message.includes("ECONNREFUSED")) {
          errorMessage = "Connection refused - check server address and port";
        } else if (error.message.includes("ETIMEDOUT") || error.message.includes("timeout")) {
          errorMessage = "Connection timed out - server may be unreachable";
        } else if (error.message.includes("certificate") || error.message.includes("SSL")) {
          errorMessage = "SSL/TLS error - try toggling SSL setting";
        } else if (error.message.includes("Command failed")) {
          errorMessage = `IMAP error: ${error.message}`;
        }
      }

      // Update error state
      await ctx.runMutation(internal.email.accounts.markSyncError, {
        accountId: args.accountId,
        error: errorMessage,
      });

      // Log failure
      await ctx.runMutation(internal.email.syncMutations.logSync, {
        accountId: args.accountId,
        action: "full_sync",
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
        duration: Date.now() - startTime,
      });

      if (client) {
        try {
          await client.logout();
        } catch {
          // Ignore logout errors
        }
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Perform incremental sync for an account (new emails only).
 */
export const performIncrementalSync = internalAction({
  args: {
    accountId: v.id("emailAccounts"),
  },
  handler: async (ctx, args): Promise<SyncResult> => {
    const account = await ctx.runQuery(
      api.email.accounts.getWithCredentials,
      { accountId: args.accountId }
    );

    if (!account || !account.isActive) {
      return { success: false, error: "Account not found or inactive" };
    }

    // If never synced, do full sync
    if (!account.lastSyncAt) {
      return ctx.runAction(internal.email.sync.performFullSync, {
        accountId: args.accountId,
      });
    }

    await ctx.runMutation(internal.email.accounts.updateSyncState, {
      accountId: args.accountId,
      syncStatus: "syncing",
    });

    await ctx.runMutation(internal.email.syncMutations.logSync, {
      accountId: args.accountId,
      action: "incremental_sync",
      status: "started",
    });

    let client: ImapFlow | null = null;
    let totalEmails = 0;
    const startTime = Date.now();

    try {
      const credentials = getImapCredentials(account);

      console.log("Creating IMAP client for incremental sync:", credentials.host, "port:", credentials.port);

      client = new ImapFlow({
        host: credentials.host,
        port: credentials.port,
        secure: credentials.secure,
        auth: account.oauthProvider
          ? {
              user: credentials.user,
              accessToken: credentials.pass,
            }
          : {
              user: credentials.user,
              pass: credentials.pass,
            },
        logger: {
          debug: (info: unknown) => console.log("[IMAP DEBUG]", info),
          info: (info: unknown) => console.log("[IMAP INFO]", info),
          warn: (info: unknown) => console.warn("[IMAP WARN]", info),
          error: (info: unknown) => console.error("[IMAP ERROR]", info),
        },
        tls: {
          rejectUnauthorized: false,
        },
      });

      try {
        await client.connect();
        console.log("IMAP connected successfully (incremental)");
      } catch (connectError) {
        console.error("IMAP connection error:", connectError);
        throw connectError;
      }

      // Get inbox folder
      const inboxFolder = await ctx.runQuery(api.email.folders.getByType, {
        accountId: args.accountId,
        type: "inbox",
      });

      if (!inboxFolder) {
        await client.logout();
        return { success: false, error: "Inbox folder not found" };
      }

      const mailbox = await client.mailboxOpen("INBOX");

      // Check for new messages since last sync
      const lastSyncUid = inboxFolder.lastSyncUid || 0;

      console.log(`[SYNC] Checking for new emails. UIDNEXT: ${mailbox.uidNext}, lastSyncUid: ${lastSyncUid}`);

      // UIDNEXT is the UID that will be assigned to the next message
      // We have new messages if UIDNEXT > lastSyncUid + 1
      // (meaning there are UIDs from lastSyncUid+1 to UIDNEXT-1)
      // If UIDNEXT == lastSyncUid + 1, there are no new messages
      if (mailbox.uidNext && mailbox.uidNext > lastSyncUid + 1) {
        const uidRange = `${lastSyncUid + 1}:*`;
        console.log(`[SYNC] Fetching new emails with UID range: ${uidRange}`);

        try {
          const messages = client.fetch(uidRange, {
            uid: true,
            envelope: true,
            bodyStructure: true,
            flags: true,
            labels: true,
            source: { start: 0, maxLength: 50000 },
          });

          for await (const msg of messages) {
            const envelope = msg.envelope;
            if (!envelope) continue;

            // Extract body text and HTML using mailparser
            let bodyText: string | undefined;
            let bodyHtml: string | undefined;

            if (msg.source) {
              const parsed = await parseEmailBody(msg.source);
              bodyText = parsed.text?.substring(0, 50000);
              bodyHtml = parsed.html?.substring(0, 100000);
            }

            const hasAttachments =
              msg.bodyStructure?.childNodes?.some(
                (node: { disposition?: string }) =>
                  node.disposition === "attachment"
              ) || false;

            const flags = msg.flags || new Set();

            await ctx.runMutation(internal.email.emails.create, {
              accountId: args.accountId,
              folderId: inboxFolder._id,
              messageId: envelope.messageId || `${msg.uid}@inbox`,
              uid: msg.uid,
              threadId: envelope.messageId,
              subject: envelope.subject || "(No Subject)",
              from: parseAddress(envelope.from?.[0]) || {
                address: "unknown@unknown.com",
              },
              to: parseAddresses(envelope.to),
              cc: parseAddresses(envelope.cc),
              bcc: parseAddresses(envelope.bcc),
              replyTo: parseAddress(envelope.replyTo?.[0]),
              inReplyTo: envelope.inReplyTo || undefined,
              references: undefined,
              bodyText,
              bodyHtml,
              snippet: generateSnippet(bodyText, bodyHtml),
              date: envelope.date?.getTime() || Date.now(),
              size: msg.size || undefined,
              isRead: flags.has("\\Seen"),
              isStarred: flags.has("\\Flagged"),
              isImportant: false,
              isDraft: flags.has("\\Draft"),
              hasAttachments,
              labels: msg.labels ? Array.from(msg.labels) : undefined,
            });

            totalEmails++;
          }
        } catch (err) {
          console.error("Error fetching new messages:", err);
        }

        // Update last sync UID
        if (mailbox.uidNext) {
          await ctx.runMutation(internal.email.folders.updateLastSyncUid, {
            folderId: inboxFolder._id,
            lastSyncUid: mailbox.uidNext - 1,
          });
        }
      } else {
        console.log(`[SYNC] No new emails to fetch. UIDNEXT (${mailbox.uidNext}) == lastSyncUid + 1 (${lastSyncUid + 1})`);
      }

      // Update folder counts
      const mailboxCounts = mailbox as { exists?: number | string; unseen?: number | string };
      await ctx.runMutation(api.email.folders.updateCounts, {
        folderId: inboxFolder._id,
        totalCount: Number(mailboxCounts.exists) || 0,
        unreadCount: Number(mailboxCounts.unseen) || 0,
      });

      // Also sync Sent folder
      const sentFolder = await ctx.runQuery(api.email.folders.getByType, {
        accountId: args.accountId,
        type: "sent",
      });

      if (sentFolder) {
        try {
          const sentMailbox = await client.mailboxOpen(sentFolder.path);
          const sentLastSyncUid = sentFolder.lastSyncUid || 0;

          console.log(`[SYNC] Checking Sent folder. UIDNEXT: ${sentMailbox.uidNext}, lastSyncUid: ${sentLastSyncUid}`);

          if (sentMailbox.uidNext && sentMailbox.uidNext > sentLastSyncUid + 1) {
            const sentUidRange = `${sentLastSyncUid + 1}:*`;
            console.log(`[SYNC] Fetching new sent emails with UID range: ${sentUidRange}`);

            try {
              const sentMessages = client.fetch(sentUidRange, {
                uid: true,
                envelope: true,
                bodyStructure: true,
                flags: true,
                labels: true,
                source: { start: 0, maxLength: 50000 },
              });

              for await (const msg of sentMessages) {
                const envelope = msg.envelope;
                if (!envelope) continue;

                let bodyText: string | undefined;
                let bodyHtml: string | undefined;

                if (msg.source) {
                  const parsed = await parseEmailBody(msg.source);
                  bodyText = parsed.text?.substring(0, 50000);
                  bodyHtml = parsed.html?.substring(0, 100000);
                }

                const hasAttachments =
                  msg.bodyStructure?.childNodes?.some(
                    (node: { disposition?: string }) =>
                      node.disposition === "attachment"
                  ) || false;

                const flags = msg.flags || new Set();

                await ctx.runMutation(internal.email.emails.create, {
                  accountId: args.accountId,
                  folderId: sentFolder._id,
                  messageId: envelope.messageId || `${msg.uid}@sent`,
                  uid: msg.uid,
                  threadId: envelope.messageId,
                  subject: envelope.subject || "(No Subject)",
                  from: parseAddress(envelope.from?.[0]) || {
                    address: "unknown@unknown.com",
                  },
                  to: parseAddresses(envelope.to),
                  cc: parseAddresses(envelope.cc),
                  bcc: parseAddresses(envelope.bcc),
                  replyTo: parseAddress(envelope.replyTo?.[0]),
                  inReplyTo: envelope.inReplyTo || undefined,
                  references: undefined,
                  bodyText,
                  bodyHtml,
                  snippet: generateSnippet(bodyText, bodyHtml),
                  date: envelope.date?.getTime() || Date.now(),
                  size: msg.size || undefined,
                  isRead: flags.has("\\Seen"),
                  isStarred: flags.has("\\Flagged"),
                  isImportant: false,
                  isDraft: flags.has("\\Draft"),
                  hasAttachments,
                  labels: msg.labels ? Array.from(msg.labels) : undefined,
                });

                totalEmails++;
              }
            } catch (err) {
              console.error("Error fetching sent messages:", err);
            }

            if (sentMailbox.uidNext) {
              await ctx.runMutation(internal.email.folders.updateLastSyncUid, {
                folderId: sentFolder._id,
                lastSyncUid: sentMailbox.uidNext - 1,
              });
            }
          } else {
            console.log(`[SYNC] No new sent emails to fetch. UIDNEXT (${sentMailbox.uidNext}) == lastSyncUid + 1 (${sentLastSyncUid + 1})`);
          }

          // Update sent folder counts
          const sentCounts = sentMailbox as { exists?: number | string; unseen?: number | string };
          await ctx.runMutation(api.email.folders.updateCounts, {
            folderId: sentFolder._id,
            totalCount: Number(sentCounts.exists) || 0,
            unreadCount: Number(sentCounts.unseen) || 0,
          });
        } catch (err) {
          console.error("Error syncing Sent folder:", err);
        }
      }

      await client.logout();

      await ctx.runMutation(internal.email.accounts.updateSyncState, {
        accountId: args.accountId,
        lastSyncAt: Date.now(),
        syncStatus: "idle",
        syncError: undefined,
      });

      await ctx.runMutation(internal.email.syncMutations.logSync, {
        accountId: args.accountId,
        action: "incremental_sync",
        status: "completed",
        emailsProcessed: totalEmails,
        duration: Date.now() - startTime,
      });

      return { success: true, emailsSynced: totalEmails };
    } catch (error) {
      console.error("Incremental sync error:", error);

      await ctx.runMutation(internal.email.accounts.markSyncError, {
        accountId: args.accountId,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      await ctx.runMutation(internal.email.syncMutations.logSync, {
        accountId: args.accountId,
        action: "incremental_sync",
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
        duration: Date.now() - startTime,
      });

      if (client) {
        try {
          await client.logout();
        } catch {
          // Ignore
        }
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Trigger sync for an account (user-initiated).
 */
export const triggerSync = action({
  args: {
    accountId: v.id("emailAccounts"),
    fullSync: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<SyncResult> => {
    // Ensure OAuth token is valid before syncing
    const tokenCheck = await ctx.runAction(internal.email.tokenRefresh.ensureValidToken, {
      accountId: args.accountId,
    });

    if (!tokenCheck.valid) {
      return {
        success: false,
        error: `Token refresh failed: ${tokenCheck.error}`,
      };
    }

    if (args.fullSync) {
      return ctx.runAction(internal.email.sync.performFullSync, {
        accountId: args.accountId,
      });
    }
    return ctx.runAction(internal.email.sync.performIncrementalSync, {
      accountId: args.accountId,
    });
  },
});

