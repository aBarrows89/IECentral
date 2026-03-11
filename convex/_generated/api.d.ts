/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activity from "../activity.js";
import type * as aiInterview from "../aiInterview.js";
import type * as aiMatching from "../aiMatching.js";
import type * as aiTasks from "../aiTasks.js";
import type * as announcements from "../announcements.js";
import type * as applications from "../applications.js";
import type * as arp from "../arp.js";
import type * as attendance from "../attendance.js";
import type * as auditLogs from "../auditLogs.js";
import type * as auth from "../auth.js";
import type * as broadcastMessages from "../broadcastMessages.js";
import type * as bulkUpload from "../bulkUpload.js";
import type * as callOffs from "../callOffs.js";
import type * as contactMessages from "../contactMessages.js";
import type * as credentials from "../credentials.js";
import type * as crons from "../crons.js";
import type * as dailyLogs from "../dailyLogs.js";
import type * as dashboardSettings from "../dashboardSettings.js";
import type * as dealerInquiries from "../dealerInquiries.js";
import type * as dealerRebates from "../dealerRebates.js";
import type * as deletedRecords from "../deletedRecords.js";
import type * as documentFolders from "../documentFolders.js";
import type * as documents from "../documents.js";
import type * as emails from "../emails.js";
import type * as employeeChat from "../employeeChat.js";
import type * as employeePortal from "../employeePortal.js";
import type * as equipment from "../equipment.js";
import type * as events from "../events.js";
import type * as exitInterviews from "../exitInterviews.js";
import type * as expenseReports from "../expenseReports.js";
import type * as holidays from "../holidays.js";
import type * as indeedActions from "../indeedActions.js";
import type * as indeedIntegration from "../indeedIntegration.js";
import type * as jobs from "../jobs.js";
import type * as locations from "../locations.js";
import type * as merits from "../merits.js";
import type * as messages from "../messages.js";
import type * as mileage from "../mileage.js";
import type * as notifications from "../notifications.js";
import type * as offerLetters from "../offerLetters.js";
import type * as onboardingDocuments from "../onboardingDocuments.js";
import type * as orgChart from "../orgChart.js";
import type * as overtime from "../overtime.js";
import type * as payrollCompanies from "../payrollCompanies.js";
import type * as personnel from "../personnel.js";
import type * as projectSuggestions from "../projectSuggestions.js";
import type * as projects from "../projects.js";
import type * as pushNotifications from "../pushNotifications.js";
import type * as quickbooks from "../quickbooks.js";
import type * as reports from "../reports.js";
import type * as safetyChecklist from "../safetyChecklist.js";
import type * as search from "../search.js";
import type * as shiftTemplates from "../shiftTemplates.js";
import type * as shifts from "../shifts.js";
import type * as surveys from "../surveys.js";
import type * as systemBanners from "../systemBanners.js";
import type * as tasks from "../tasks.js";
import type * as techWizardChats from "../techWizardChats.js";
import type * as timeClock from "../timeClock.js";
import type * as timeOffRequests from "../timeOffRequests.js";
import type * as timesheetApprovals from "../timesheetApprovals.js";
import type * as writeUps from "../writeUps.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activity: typeof activity;
  aiInterview: typeof aiInterview;
  aiMatching: typeof aiMatching;
  aiTasks: typeof aiTasks;
  announcements: typeof announcements;
  applications: typeof applications;
  arp: typeof arp;
  attendance: typeof attendance;
  auditLogs: typeof auditLogs;
  auth: typeof auth;
  broadcastMessages: typeof broadcastMessages;
  bulkUpload: typeof bulkUpload;
  callOffs: typeof callOffs;
  contactMessages: typeof contactMessages;
  credentials: typeof credentials;
  crons: typeof crons;
  dailyLogs: typeof dailyLogs;
  dashboardSettings: typeof dashboardSettings;
  dealerInquiries: typeof dealerInquiries;
  dealerRebates: typeof dealerRebates;
  deletedRecords: typeof deletedRecords;
  documentFolders: typeof documentFolders;
  documents: typeof documents;
  emails: typeof emails;
  employeeChat: typeof employeeChat;
  employeePortal: typeof employeePortal;
  equipment: typeof equipment;
  events: typeof events;
  exitInterviews: typeof exitInterviews;
  expenseReports: typeof expenseReports;
  holidays: typeof holidays;
  indeedActions: typeof indeedActions;
  indeedIntegration: typeof indeedIntegration;
  jobs: typeof jobs;
  locations: typeof locations;
  merits: typeof merits;
  messages: typeof messages;
  mileage: typeof mileage;
  notifications: typeof notifications;
  offerLetters: typeof offerLetters;
  onboardingDocuments: typeof onboardingDocuments;
  orgChart: typeof orgChart;
  overtime: typeof overtime;
  payrollCompanies: typeof payrollCompanies;
  personnel: typeof personnel;
  projectSuggestions: typeof projectSuggestions;
  projects: typeof projects;
  pushNotifications: typeof pushNotifications;
  quickbooks: typeof quickbooks;
  reports: typeof reports;
  safetyChecklist: typeof safetyChecklist;
  search: typeof search;
  shiftTemplates: typeof shiftTemplates;
  shifts: typeof shifts;
  surveys: typeof surveys;
  systemBanners: typeof systemBanners;
  tasks: typeof tasks;
  techWizardChats: typeof techWizardChats;
  timeClock: typeof timeClock;
  timeOffRequests: typeof timeOffRequests;
  timesheetApprovals: typeof timesheetApprovals;
  writeUps: typeof writeUps;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
