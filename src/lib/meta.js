export const AGENCY_WORKSPACE = "agency";

export const UNROUTED_TAG = "Besorolatlan";

export function isUnrouted(contact) {
  return (contact?.tags || []).some((tag) => String(tag).toLowerCase() === UNROUTED_TAG.toLowerCase());
}

export function workspaceLabel(workspaceId, accounts = []) {
  if (!workspaceId || workspaceId === AGENCY_WORKSPACE) return "Saját cég (agency)";
  return accounts.find((a) => a.id === workspaceId)?.name || "Törölt workspace";
}

// A CRM-ben az ügynökségi (saját) workspace account_id-ja üres string.
export function workspaceAccountId(workspaceId) {
  if (!workspaceId || workspaceId === AGENCY_WORKSPACE) return "";
  return workspaceId;
}

export function workspaceOptions(accounts = []) {
  return [
    { value: AGENCY_WORKSPACE, label: "Saját cég (agency)" },
    ...accounts.map((a) => ({ value: a.id, label: a.name })),
  ];
}