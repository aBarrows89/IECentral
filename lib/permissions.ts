/**
 * IE Central RBAC Permission System
 *
 * Tier Levels:
 * T0 - Employee (member)
 * T1 - Shift Lead / Retail Associate (department_manager, shift_lead, retail_associate)
 * T2 - Warehouse/Store/Office/Retail Manager (warehouse_manager, office_manager, retail_manager, retail_store_manager)
 * T3 - Director (warehouse_director)
 * T4 - Admin (admin)
 * T5 - Super Admin (super_admin)
 */

import { Id } from "@/convex/_generated/dataModel";

// User type for permission checks
export interface PermissionUser {
  _id: Id<"users">;
  role: string;
  managedLocationIds?: Id<"locations">[];
  managedDepartments?: string[];
  requiresDailyLog?: boolean;
  isFinalTimeApprover?: boolean;
  isPayrollProcessor?: boolean;
  reportsTo?: Id<"users">;
}

// Tier levels
export type Tier = 0 | 1 | 2 | 3 | 4 | 5;

// Map roles to tiers
export function getTier(role: string): Tier {
  switch (role) {
    case "super_admin":
      return 5;
    case "admin":
      return 4;
    case "warehouse_director":
      return 3;
    case "warehouse_manager":
    case "office_manager":
    case "retail_manager":
    case "retail_store_manager":
      return 2;
    case "department_manager":
    case "shift_lead":
    case "retail_associate":
      return 1;
    case "member":
    case "employee":
    default:
      return 0;
  }
}

// Get tier name for display
export function getTierName(tier: Tier): string {
  switch (tier) {
    case 5: return "Super Admin";
    case 4: return "Admin";
    case 3: return "Director";
    case 2: return "Manager";
    case 1: return "Shift Lead";
    case 0: return "Employee";
  }
}

// Check if user meets minimum tier requirement
export function hasMinTier(user: PermissionUser, minTier: Tier): boolean {
  return getTier(user.role) >= minTier;
}

// Check if user is location-scoped (T2 managers)
export function isLocationScoped(user: PermissionUser): boolean {
  return getTier(user.role) === 2;
}

// Check if user has access to a specific location
export function hasLocationAccess(user: PermissionUser, locationId: Id<"locations">): boolean {
  const tier = getTier(user.role);

  // T3+ sees all locations
  if (tier >= 3) return true;

  // T2 sees only their assigned locations
  if (tier === 2) {
    return user.managedLocationIds?.includes(locationId) ?? false;
  }

  // T0-T1 don't have location-based access controls for most features
  return true;
}

// ============ FEATURE PERMISSIONS ============

// Sidebar menu permissions - which menu items are visible
export interface MenuPermissions {
  // Administrative
  userManagement: boolean;
  auditLog: boolean;
  timeChangeAuditLog: boolean;
  systemSettings: boolean;
  deletedRecords: boolean;

  // ATS / Hiring
  applications: boolean;
  jobListings: boolean;
  bulkUpload: boolean;
  indeedSettings: boolean;

  // Personnel
  personnel: boolean;
  onboardingDocs: boolean;

  // Time & Attendance
  timeClock: boolean;
  callOffs: boolean;
  timeApproval: boolean;
  payrollExport: boolean;
  overtime: boolean;

  // Equipment
  equipment: boolean;
  safetyCheckQR: boolean;

  // Daily Logs
  dailyLog: boolean;

  // Calendar & Messages
  calendar: boolean;
  messages: boolean;
  announcements: boolean;

  // Doc Hub
  docHub: boolean;

  // Scheduling
  shiftPlanning: boolean;
  scheduleTemplates: boolean;
  saturdayOvertime: boolean;

  // ARP
  arp: boolean;

  // Projects
  projects: boolean;
  suggestions: boolean;

  // Finance
  mileage: boolean;
  expenseReports: boolean;
  payrollApproval: boolean;
  quickbooks: boolean;

  // Warehouse Tools
  binLabels: boolean;

  // Reports
  reports: boolean;
  surveys: boolean;

  // Organization
  orgChart: boolean;
  locations: boolean;
  engagement: boolean;

  // Portals
  departmentPortal: boolean;
  employeePortal: boolean;

  // IT & Support
  techWizard: boolean;
  websiteMessages: boolean;

  // Time Management
  timeCorrections: boolean;
}

export function getMenuPermissions(user: PermissionUser): MenuPermissions {
  const tier = getTier(user.role);
  const isRetailAssociate = user.role === "retail_associate";

  return {
    // Administrative - T4+
    userManagement: tier >= 4,
    auditLog: tier >= 4,
    timeChangeAuditLog: tier >= 5, // T5 only
    systemSettings: tier >= 4,
    deletedRecords: tier >= 4,

    // ATS / Hiring
    applications: tier >= 2, // T2+ (location-scoped for T2)
    jobListings: tier >= 4, // T4+
    bulkUpload: tier >= 4, // T4+
    indeedSettings: tier >= 4, // T4+

    // Personnel
    personnel: tier >= 2, // T2+ (location-scoped for T2)
    onboardingDocs: tier >= 4, // T4+

    // Time & Attendance
    timeClock: true, // All tiers
    callOffs: tier >= 2, // T2+ (T1 receives notifications only)
    timeApproval: tier === 2 || tier >= 5, // T2 (location) or T5
    payrollExport: user.isPayrollProcessor === true, // Flag-based
    overtime: tier >= 2, // T2+

    // Equipment
    equipment: tier >= 2, // T2+ (view only for T2-T3, full for T4+)
    safetyCheckQR: tier >= 4, // T4+

    // Daily Logs - special logic
    dailyLog: user.requiresDailyLog === true || tier >= 4,

    // Calendar & Messages - All tiers
    calendar: true,
    messages: true,
    announcements: true, // View for all, create T5 only

    // Doc Hub - T2+ or retail_associate
    docHub: tier >= 2 || isRetailAssociate,

    // Scheduling
    shiftPlanning: tier >= 2, // T2+
    scheduleTemplates: tier >= 4, // T4+
    saturdayOvertime: tier >= 2, // T2+

    // ARP - T2+
    arp: tier >= 2,

    // Projects - T2+
    projects: tier >= 2,
    suggestions: tier >= 2,

    // Finance
    mileage: tier >= 1, // T1+ (office managers, retail associates, etc.)
    expenseReports: tier >= 1, // T1+ (office managers, retail associates, etc.)
    payrollApproval: tier >= 4, // T4+
    quickbooks: tier >= 4, // T4+

    // Warehouse Tools - T2+
    binLabels: tier >= 2,

    // Reports - T4+
    reports: tier >= 4,
    surveys: tier >= 4, // Create surveys (take surveys is all tiers)

    // Organization - T4+
    orgChart: tier >= 4,
    locations: tier >= 4,
    engagement: tier >= 4,

    // Portals
    departmentPortal: tier >= 1, // T1+
    employeePortal: true, // All tiers

    // IT & Support
    techWizard: tier >= 5, // T5 only
    websiteMessages: tier >= 4, // T4+

    // Time Management - T2+
    timeCorrections: tier >= 2,
  };
}

// ============ FEATURE-SPECIFIC PERMISSIONS ============

// ATS / Hiring permissions
export interface ATSPermissions {
  viewApplications: boolean;
  changeStatus: boolean;
  scheduleInterviews: boolean;
  markHired: boolean;
  viewAIAnalysis: boolean;
  bulkUpload: boolean;
  manageJobListings: boolean;
  locationScoped: boolean;
}

export function getATSPermissions(user: PermissionUser): ATSPermissions {
  const tier = getTier(user.role);
  return {
    viewApplications: tier >= 2,
    changeStatus: tier >= 3, // Director+
    scheduleInterviews: tier >= 3, // Director+
    markHired: tier >= 2, // T2+
    viewAIAnalysis: tier >= 2, // T2+
    bulkUpload: tier >= 4, // T4+
    manageJobListings: tier >= 4, // T4+
    locationScoped: tier === 2, // Only T2 is scoped
  };
}

// Personnel permissions
export interface PersonnelPermissions {
  viewAll: boolean;
  create: boolean;
  edit: boolean;
  viewCallLogs: boolean;
  createCallLogs: boolean;
  viewAttendance: boolean;
  manageAttendance: boolean;
  viewWriteUps: boolean;
  createWriteUps: boolean;
  viewReviews: boolean;
  createReviews: boolean;
  viewMerits: boolean;
  awardMerits: boolean;
  locationScoped: boolean;
}

export function getPersonnelPermissions(user: PermissionUser): PersonnelPermissions {
  const tier = getTier(user.role);
  return {
    viewAll: tier >= 2,
    create: tier >= 3, // Director+
    edit: tier >= 3, // Director+
    viewCallLogs: tier >= 2,
    createCallLogs: tier >= 2,
    viewAttendance: tier >= 2,
    manageAttendance: tier >= 2,
    viewWriteUps: tier >= 2,
    createWriteUps: tier >= 2,
    viewReviews: tier >= 2,
    createReviews: tier >= 2,
    viewMerits: tier >= 2,
    awardMerits: tier >= 2,
    locationScoped: tier === 2,
  };
}

// Equipment permissions
export interface EquipmentPermissions {
  viewAllLocations: boolean;
  viewOwnLocation: boolean;
  create: boolean;
  edit: boolean;
  assign: boolean;
  viewAgreements: boolean;
  createAgreements: boolean;
  manageQRCodes: boolean;
  submitSafetyChecks: boolean;
}

export function getEquipmentPermissions(user: PermissionUser): EquipmentPermissions {
  const tier = getTier(user.role);
  const isWarehouseManager = user.role === "warehouse_manager";

  return {
    viewAllLocations: tier >= 3, // Director+
    viewOwnLocation: tier >= 2, // T2+ (view only for T2-T3)
    create: tier >= 4 || isWarehouseManager, // T4+ or warehouse_manager
    edit: tier >= 4 || isWarehouseManager, // T4+ or warehouse_manager
    assign: tier >= 4 || isWarehouseManager, // T4+ or warehouse_manager
    viewAgreements: tier >= 4, // T4+
    createAgreements: tier >= 4, // T4+
    manageQRCodes: tier >= 4, // T4+
    submitSafetyChecks: true, // All tiers
  };
}

// Time & Attendance permissions
export interface TimePermissions {
  punchInOut: boolean;
  viewOwnHours: boolean;
  approveTime: boolean;
  adjustTime: boolean;
  finalApproval: boolean;
  exportPayroll: boolean;
  viewOvertimeTracking: boolean;
  manageCallOffs: boolean;
  approvePTO: boolean;
  managePTOPolicy: boolean;
  viewTimeChangeAuditLog: boolean;
  locationScoped: boolean;
}

export function getTimePermissions(user: PermissionUser): TimePermissions {
  const tier = getTier(user.role);
  return {
    punchInOut: true, // All tiers
    viewOwnHours: true, // All tiers
    approveTime: tier === 2 || tier >= 5, // T2 (location) or T5
    adjustTime: tier === 2 || tier >= 5, // T2 (location) or T5
    finalApproval: user.isFinalTimeApprover === true, // Flag-based
    exportPayroll: user.isPayrollProcessor === true, // Flag-based
    viewOvertimeTracking: tier >= 2, // T2+
    manageCallOffs: tier >= 2, // T2+
    approvePTO: tier >= 2, // T2+
    managePTOPolicy: tier >= 4, // T4+
    viewTimeChangeAuditLog: tier >= 5, // T5 only
    locationScoped: tier === 2, // Only T2 is scoped
  };
}

// Daily Log permissions
export interface DailyLogPermissions {
  submitLog: boolean;
  viewOwnLogs: boolean;
  viewReporteeLogs: boolean;
  viewAllLogs: boolean; // Admin view
  generateReports: boolean;
  exportCSV: boolean;
}

export function getDailyLogPermissions(user: PermissionUser, hasReportees: boolean = false): DailyLogPermissions {
  const tier = getTier(user.role);
  const requiresLog = user.requiresDailyLog === true;

  return {
    submitLog: requiresLog,
    viewOwnLogs: requiresLog,
    viewReporteeLogs: hasReportees && tier >= 1, // T1+ with reportees
    viewAllLogs: tier >= 4 && !requiresLog, // T4+ only if they don't require their own log
    generateReports: tier >= 2, // T2+
    exportCSV: tier >= 4, // T4+
  };
}

// Calendar permissions
export interface CalendarPermissions {
  view: boolean;
  createEvents: boolean;
  editOwnEvents: boolean;
  editAnyEvent: boolean;
}

export function getCalendarPermissions(user: PermissionUser): CalendarPermissions {
  const tier = getTier(user.role);
  return {
    view: true, // All tiers
    createEvents: true, // All tiers
    editOwnEvents: true, // All tiers (creator only)
    editAnyEvent: tier >= 4, // T4+
  };
}

// Messages permissions
export interface MessagesPermissions {
  sendReceive: boolean;
  groupMessages: boolean;
  viewAnnouncements: boolean;
  createCompanyAnnouncements: boolean;
  createOvertimeAnnouncements: boolean;
}

export function getMessagesPermissions(user: PermissionUser): MessagesPermissions {
  const tier = getTier(user.role);
  return {
    sendReceive: true, // All tiers
    groupMessages: true, // All tiers
    viewAnnouncements: true, // All tiers
    createCompanyAnnouncements: tier >= 5, // T5 only
    createOvertimeAnnouncements: tier >= 2, // T2+
  };
}

// Dashboard widget permissions
export interface DashboardWidgetPermissions {
  dayAtAGlance: boolean;
  activeProjects: boolean;
  recentApplications: boolean;
  websiteMessages: boolean;
  hiringAnalytics: boolean;
  activityFeed: boolean;
  tenureCheckins: boolean;
}

export function getDashboardWidgetPermissions(user: PermissionUser): DashboardWidgetPermissions {
  const tier = getTier(user.role);
  return {
    dayAtAGlance: true, // All tiers
    activeProjects: tier >= 2, // T2+
    recentApplications: tier >= 2, // T2+
    websiteMessages: tier >= 4, // T4+
    hiringAnalytics: tier >= 2, // T2+
    activityFeed: tier >= 2, // T2+
    tenureCheckins: tier >= 2, // T2+
  };
}

// ============ UTILITY FUNCTIONS ============

// Check if user can access a route
export function canAccessRoute(user: PermissionUser, route: string): boolean {
  const permissions = getMenuPermissions(user);

  // Map routes to permissions
  const routeMap: Record<string, keyof MenuPermissions> = {
    "/users": "userManagement",
    "/audit-log": "auditLog",
    "/settings": "systemSettings",
    "/deleted-records": "deletedRecords",
    "/applications": "applications",
    "/jobs": "jobListings",
    "/applications/bulk-upload": "bulkUpload",
    "/personnel": "personnel",
    "/settings/onboarding": "onboardingDocs",
    "/time-clock": "timeClock",
    "/call-offs": "callOffs",
    "/payroll": "payrollApproval",
    "/overtime": "overtime",
    "/equipment": "equipment",
    "/daily-log": "dailyLog",
    "/calendar": "calendar",
    "/messages": "messages",
    "/announcements": "announcements",
    "/documents": "docHub",
    "/shifts": "shiftPlanning",
    "/schedule-templates": "scheduleTemplates",
    "/arp": "arp",
    "/projects": "projects",
    "/suggestions": "suggestions",
    "/mileage": "mileage",
    "/expense-report": "expenseReports",
    "/settings/quickbooks": "quickbooks",
    "/bin-labels": "binLabels",
    "/reports": "reports",
    "/org-chart": "orgChart",
    "/locations": "locations",
    "/engagement": "engagement",
    "/department-portal": "departmentPortal",
    "/portal": "employeePortal",
    "/tech-wizard": "techWizard",
    "/website-messages": "websiteMessages",
    "/time-off": "timeCorrections",
  };

  // Check exact match first
  if (routeMap[route]) {
    return permissions[routeMap[route]];
  }

  // Check prefix matches for dynamic routes
  for (const [routePrefix, permission] of Object.entries(routeMap)) {
    if (route.startsWith(routePrefix)) {
      return permissions[permission];
    }
  }

  // Default allow for unmapped routes (login, change-password, etc.)
  return true;
}

// Get user's accessible locations
export function getAccessibleLocations(
  user: PermissionUser,
  allLocations: { _id: Id<"locations">; name: string }[]
): { _id: Id<"locations">; name: string }[] {
  const tier = getTier(user.role);

  // T3+ sees all locations
  if (tier >= 3) return allLocations;

  // T2 sees only their assigned locations
  if (tier === 2 && user.managedLocationIds) {
    return allLocations.filter(loc => user.managedLocationIds!.includes(loc._id));
  }

  // T0-T1 typically don't need location filtering
  return allLocations;
}
