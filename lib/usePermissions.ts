"use client";

import { useAuth } from "@/app/auth-context";
import {
  PermissionUser,
  Tier,
  getTier,
  getTierName,
  hasMinTier,
  isLocationScoped,
  hasLocationAccess,
  getMenuPermissions,
  getATSPermissions,
  getPersonnelPermissions,
  getEquipmentPermissions,
  getTimePermissions,
  getDailyLogPermissions,
  getCalendarPermissions,
  getMessagesPermissions,
  getDashboardWidgetPermissions,
  canAccessRoute,
  getAccessibleLocations,
  getResolvedPermissions,
  MenuPermissions,
  ATSPermissions,
  PersonnelPermissions,
  EquipmentPermissions,
  TimePermissions,
  DailyLogPermissions,
  CalendarPermissions,
  MessagesPermissions,
  DashboardWidgetPermissions,
} from "./permissions";
import { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export interface UsePermissionsResult {
  // Loading state
  isLoading: boolean;

  // Basic tier info
  tier: Tier;
  tierName: string;

  // Tier checks
  hasMinTier: (minTier: Tier) => boolean;
  isLocationScoped: boolean;
  hasLocationAccess: (locationId: Id<"locations">) => boolean;

  // Permission sets
  menu: MenuPermissions;
  ats: ATSPermissions;
  personnel: PersonnelPermissions;
  equipment: EquipmentPermissions;
  time: TimePermissions;
  dailyLog: DailyLogPermissions;
  calendar: CalendarPermissions;
  messages: MessagesPermissions;
  dashboardWidgets: DashboardWidgetPermissions;

  // Utilities
  canAccessRoute: (route: string) => boolean;
  getAccessibleLocations: (locations: { _id: Id<"locations">; name: string }[]) => { _id: Id<"locations">; name: string }[];

  // Flags
  isFinalTimeApprover: boolean;
  isPayrollProcessor: boolean;
  requiresDailyLog: boolean;
}

export function usePermissions(): UsePermissionsResult {
  const { user, isLoading: loading } = useAuth();

  // Check if user has reportees (for daily log permissions)
  const reportees = useQuery(
    api.auth.getReporteesRequiringDailyLog,
    user?._id ? { managerId: user._id } : "skip"
  );

  // Default empty permissions for loading/unauthenticated state
  const emptyPermissions: UsePermissionsResult = {
    isLoading: true,
    tier: 0,
    tierName: "Employee",
    hasMinTier: () => false,
    isLocationScoped: false,
    hasLocationAccess: () => false,
    menu: {
      userManagement: false,
      auditLog: false,
      timeChangeAuditLog: false,
      systemSettings: false,
      deletedRecords: false,
      applications: false,
      jobListings: false,
      bulkUpload: false,
      indeedSettings: false,
      personnel: false,
      onboardingDocs: false,
      timeClock: false,
      callOffs: false,
      timeApproval: false,
      payrollExport: false,
      overtime: false,
      equipment: false,
      safetyCheckQR: false,
      dailyLog: false,
      calendar: false,
      messages: false,
      announcements: false,
      docHub: false,
      shiftPlanning: false,
      scheduleTemplates: false,
      saturdayOvertime: false,
      arp: false,
      projects: false,
      suggestions: false,
      mileage: false,
      expenseReports: false,
      payrollApproval: false,
      quickbooks: false,
      binLabels: false,
      reports: false,
      surveys: false,
      orgChart: false,
      locations: false,
      engagement: false,
      departmentPortal: false,
      employeePortal: false,
      techWizard: false,
      websiteMessages: false,
      timeCorrections: false,
    },
    ats: {
      viewApplications: false,
      changeStatus: false,
      scheduleInterviews: false,
      markHired: false,
      viewAIAnalysis: false,
      bulkUpload: false,
      manageJobListings: false,
      locationScoped: false,
    },
    personnel: {
      viewAll: false,
      create: false,
      edit: false,
      viewCallLogs: false,
      createCallLogs: false,
      viewAttendance: false,
      manageAttendance: false,
      viewWriteUps: false,
      createWriteUps: false,
      viewReviews: false,
      createReviews: false,
      viewMerits: false,
      awardMerits: false,
      locationScoped: false,
    },
    equipment: {
      viewAllLocations: false,
      viewOwnLocation: false,
      create: false,
      edit: false,
      assign: false,
      viewAgreements: false,
      createAgreements: false,
      manageQRCodes: false,
      submitSafetyChecks: false,
    },
    time: {
      punchInOut: false,
      viewOwnHours: false,
      approveTime: false,
      adjustTime: false,
      finalApproval: false,
      exportPayroll: false,
      viewOvertimeTracking: false,
      manageCallOffs: false,
      approvePTO: false,
      managePTOPolicy: false,
      viewTimeChangeAuditLog: false,
      locationScoped: false,
    },
    dailyLog: {
      submitLog: false,
      viewOwnLogs: false,
      viewReporteeLogs: false,
      viewAllLogs: false,
      generateReports: false,
      exportCSV: false,
    },
    calendar: {
      view: false,
      createEvents: false,
      editOwnEvents: false,
      editAnyEvent: false,
    },
    messages: {
      sendReceive: false,
      groupMessages: false,
      viewAnnouncements: false,
      createCompanyAnnouncements: false,
      createOvertimeAnnouncements: false,
    },
    dashboardWidgets: {
      dayAtAGlance: false,
      activeProjects: false,
      recentApplications: false,
      websiteMessages: false,
      hiringAnalytics: false,
      activityFeed: false,
      tenureCheckins: false,
    },
    canAccessRoute: () => false,
    getAccessibleLocations: () => [],
    isFinalTimeApprover: false,
    isPayrollProcessor: false,
    requiresDailyLog: false,
  };

  // If auth is still loading, return loading state
  if (loading) {
    return emptyPermissions;
  }

  // If no user (not logged in), return empty permissions but NOT loading
  // This allows the redirect to login page to happen
  if (!user) {
    return { ...emptyPermissions, isLoading: false };
  }

  const permissionUser: PermissionUser = {
    _id: user._id,
    role: user.role,
    managedLocationIds: user.managedLocationIds as Id<"locations">[] | undefined,
    managedDepartments: user.managedDepartments,
    requiresDailyLog: user.requiresDailyLog,
    isFinalTimeApprover: user.isFinalTimeApprover,
    isPayrollProcessor: user.isPayrollProcessor,
    reportsTo: user.reportsTo as Id<"users"> | undefined,
    permissionOverrides: user.permissionOverrides,
  };

  const tier = getTier(user.role);
  const hasReportees = (reportees?.length ?? 0) > 0;

  // Get resolved permissions (role defaults + overrides merged)
  const resolved = getResolvedPermissions(permissionUser);

  // Build menu permissions from resolved map
  const menuFromResolved: MenuPermissions = {
    userManagement: resolved["menu.userManagement"] ?? false,
    auditLog: resolved["menu.auditLog"] ?? false,
    timeChangeAuditLog: resolved["menu.timeChangeAuditLog"] ?? false,
    systemSettings: resolved["menu.systemSettings"] ?? false,
    deletedRecords: resolved["menu.deletedRecords"] ?? false,
    applications: resolved["menu.applications"] ?? false,
    jobListings: resolved["menu.jobListings"] ?? false,
    bulkUpload: resolved["menu.bulkUpload"] ?? false,
    indeedSettings: resolved["menu.indeedSettings"] ?? false,
    personnel: resolved["menu.personnel"] ?? false,
    onboardingDocs: resolved["menu.onboardingDocs"] ?? false,
    timeClock: resolved["menu.timeClock"] ?? false,
    callOffs: resolved["menu.callOffs"] ?? false,
    timeApproval: resolved["menu.timeApproval"] ?? false,
    payrollExport: resolved["menu.payrollExport"] ?? false,
    overtime: resolved["menu.overtime"] ?? false,
    equipment: resolved["menu.equipment"] ?? false,
    safetyCheckQR: resolved["menu.safetyCheckQR"] ?? false,
    dailyLog: resolved["menu.dailyLog"] ?? false,
    calendar: resolved["menu.calendar"] ?? false,
    messages: resolved["menu.messages"] ?? false,
    announcements: resolved["menu.announcements"] ?? false,
    docHub: resolved["menu.docHub"] ?? false,
    shiftPlanning: resolved["menu.shiftPlanning"] ?? false,
    scheduleTemplates: resolved["menu.scheduleTemplates"] ?? false,
    saturdayOvertime: resolved["menu.saturdayOvertime"] ?? false,
    arp: resolved["menu.arp"] ?? false,
    projects: resolved["menu.projects"] ?? false,
    suggestions: resolved["menu.suggestions"] ?? false,
    mileage: resolved["menu.mileage"] ?? false,
    expenseReports: resolved["menu.expenseReports"] ?? false,
    payrollApproval: resolved["menu.payrollApproval"] ?? false,
    quickbooks: resolved["menu.quickbooks"] ?? false,
    binLabels: resolved["menu.binLabels"] ?? false,
    reports: resolved["menu.reports"] ?? false,
    surveys: resolved["menu.surveys"] ?? false,
    orgChart: resolved["menu.orgChart"] ?? false,
    locations: resolved["menu.locations"] ?? false,
    engagement: resolved["menu.engagement"] ?? false,
    departmentPortal: resolved["menu.departmentPortal"] ?? false,
    employeePortal: resolved["menu.employeePortal"] ?? false,
    techWizard: resolved["menu.techWizard"] ?? false,
    websiteMessages: resolved["menu.websiteMessages"] ?? false,
    timeCorrections: resolved["menu.timeCorrections"] ?? false,
  };

  return {
    isLoading: false,
    tier,
    tierName: getTierName(tier),
    hasMinTier: (minTier: Tier) => hasMinTier(permissionUser, minTier),
    isLocationScoped: isLocationScoped(permissionUser),
    hasLocationAccess: (locationId: Id<"locations">) => hasLocationAccess(permissionUser, locationId),
    menu: menuFromResolved,
    ats: getATSPermissions(permissionUser),
    personnel: getPersonnelPermissions(permissionUser),
    equipment: getEquipmentPermissions(permissionUser),
    time: getTimePermissions(permissionUser),
    dailyLog: getDailyLogPermissions(permissionUser, hasReportees),
    calendar: getCalendarPermissions(permissionUser),
    messages: getMessagesPermissions(permissionUser),
    dashboardWidgets: getDashboardWidgetPermissions(permissionUser),
    canAccessRoute: (route: string) => canAccessRoute(permissionUser, route),
    getAccessibleLocations: (locations) => getAccessibleLocations(permissionUser, locations),
    isFinalTimeApprover: user.isFinalTimeApprover === true,
    isPayrollProcessor: user.isPayrollProcessor === true,
    requiresDailyLog: user.requiresDailyLog === true,
  };
}

// Convenience hook for checking a single permission
export function useHasPermission(check: (permissions: UsePermissionsResult) => boolean): boolean {
  const permissions = usePermissions();
  if (permissions.isLoading) return false;
  return check(permissions);
}

// Convenience hook for tier check
export function useMinTier(minTier: Tier): boolean {
  const permissions = usePermissions();
  if (permissions.isLoading) return false;
  return permissions.tier >= minTier;
}
