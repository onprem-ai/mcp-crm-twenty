export interface ResourceDef {
  singular: string;
  plural: string;
  typeName: string;
  querySingular: string;
  queryPlural: string;
  createMutation: string;
  updateMutation: string;
  deleteMutation: string;
  defaultFields: string;
}

export const RESOURCES: Record<string, ResourceDef> = {
  people: {
    singular: "person",
    plural: "people",
    typeName: "Person",
    querySingular: "person",
    queryPlural: "people",
    createMutation: "createPerson",
    updateMutation: "updatePerson",
    deleteMutation: "deletePerson",
    defaultFields: `id name { firstName lastName } emails { primaryEmail } phones { primaryPhoneNumber } jobTitle city avatarUrl companyId createdAt updatedAt`,
  },
  companies: {
    singular: "company",
    plural: "companies",
    typeName: "Company",
    querySingular: "company",
    queryPlural: "companies",
    createMutation: "createCompany",
    updateMutation: "updateCompany",
    deleteMutation: "deleteCompany",
    defaultFields: `id name domainName { primaryLinkUrl } address { addressCity addressCountry } employees linkedinLink { primaryLinkUrl } annualRecurringRevenue { amountMicros currencyCode } idealCustomerProfile accountOwnerId createdAt updatedAt`,
  },
  opportunities: {
    singular: "opportunity",
    plural: "opportunities",
    typeName: "Opportunity",
    querySingular: "opportunity",
    queryPlural: "opportunities",
    createMutation: "createOpportunity",
    updateMutation: "updateOpportunity",
    deleteMutation: "deleteOpportunity",
    defaultFields: `id name amount { amountMicros currencyCode } closeDate stage companyId pointOfContactId ownerId position createdAt updatedAt`,
  },
  tasks: {
    singular: "task",
    plural: "tasks",
    typeName: "Task",
    querySingular: "task",
    queryPlural: "tasks",
    createMutation: "createTask",
    updateMutation: "updateTask",
    deleteMutation: "deleteTask",
    defaultFields: `id title status dueAt assigneeId position createdAt updatedAt`,
  },
  notes: {
    singular: "note",
    plural: "notes",
    typeName: "Note",
    querySingular: "note",
    queryPlural: "notes",
    createMutation: "createNote",
    updateMutation: "updateNote",
    deleteMutation: "deleteNote",
    defaultFields: `id title bodyV2 position createdAt updatedAt`,
  },
  attachments: {
    singular: "attachment",
    plural: "attachments",
    typeName: "Attachment",
    querySingular: "attachment",
    queryPlural: "attachments",
    createMutation: "createAttachment",
    updateMutation: "updateAttachment",
    deleteMutation: "deleteAttachment",
    defaultFields: `id name fullPath fileCategory targetPersonId targetCompanyId targetOpportunityId targetTaskId targetNoteId createdAt updatedAt`,
  },
  favorites: {
    singular: "favorite",
    plural: "favorites",
    typeName: "Favorite",
    querySingular: "favorite",
    queryPlural: "favorites",
    createMutation: "createFavorite",
    updateMutation: "updateFavorite",
    deleteMutation: "deleteFavorite",
    defaultFields: `id companyId personId opportunityId taskId noteId position createdAt`,
  },
  timelineActivities: {
    singular: "timelineActivity",
    plural: "timelineActivities",
    typeName: "TimelineActivity",
    querySingular: "timelineActivity",
    queryPlural: "timelineActivities",
    createMutation: "createTimelineActivity",
    updateMutation: "updateTimelineActivity",
    deleteMutation: "deleteTimelineActivity",
    defaultFields: `id happensAt name properties linkedRecordCachedName linkedRecordId targetCompanyId targetPersonId targetOpportunityId targetTaskId targetNoteId createdAt`,
  },
  workspaceMembers: {
    singular: "workspaceMember",
    plural: "workspaceMembers",
    typeName: "WorkspaceMember",
    querySingular: "workspaceMember",
    queryPlural: "workspaceMembers",
    createMutation: "createWorkspaceMember",
    updateMutation: "updateWorkspaceMember",
    deleteMutation: "deleteWorkspaceMember",
    defaultFields: `id name { firstName lastName } userEmail avatarUrl locale timeZone createdAt updatedAt`,
  },
};

export const RESOURCE_NAMES = Object.keys(RESOURCES) as readonly string[];

export function getResource(name: string): ResourceDef {
  const resource = RESOURCES[name];
  if (!resource) {
    throw new Error(`Unknown resource: ${name}. Valid resources: ${RESOURCE_NAMES.join(", ")}`);
  }
  return resource;
}
