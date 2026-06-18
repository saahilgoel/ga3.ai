import {
  WorkspaceRow,
  getPropertiesByIds,
  listWorkspaces,
  getWorkspaceById,
  findSingleWorkspaceForProperty,
  findUnionWorkspaceForPropertySet,
  createWorkspace,
  type PropertyRow,
  touchWorkspaceLastUsed,
} from "./db";

export type ConnectedSource = {
  type: "ga4" | "google_ads" | "meta_ads" | "moengage";
  source_id: string;
  display_name: string;
  account_email: string;
};

export function workspaceMoEngage(ws: WorkspaceRow): ConnectedSource[] {
  return parseConnectedSources(ws).filter((s) => s.type === "moengage");
}

export function parseConnectedSources(ws: WorkspaceRow): ConnectedSource[] {
  if (!ws.connected_sources) return [];
  try {
    const arr = JSON.parse(ws.connected_sources) as ConnectedSource[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function workspaceAdsCustomers(ws: WorkspaceRow): ConnectedSource[] {
  return parseConnectedSources(ws).filter((s) => s.type === "google_ads");
}
import { readActivePropertyIds, readUserIds, type SessionData } from "./session";
import { getFreshAccessToken } from "./google";

export type WorkspaceProperties = {
  workspace: WorkspaceRow;
  properties: PropertyRow[];
};

export function parseWorkspacePropertyIds(ws: WorkspaceRow): number[] {
  try {
    const arr = JSON.parse(ws.ga4_property_ids) as number[];
    if (!Array.isArray(arr)) return [];
    return arr.filter((n) => Number.isFinite(n));
  } catch {
    return [];
  }
}

export function workspaceProperties(ws: WorkspaceRow): PropertyRow[] {
  const ids = parseWorkspacePropertyIds(ws);
  return getPropertiesByIds(ids);
}

/**
 * Ensure that every property a user owns has a single-property workspace.
 * Idempotent: safe to call repeatedly.
 */
export function ensureSingleWorkspaces(args: {
  user_id: number;
  properties: PropertyRow[];
}): void {
  for (const p of args.properties) {
    const existing = findSingleWorkspaceForProperty({
      user_id: args.user_id,
      property_id: p.id,
    });
    if (!existing) {
      createWorkspace({
        user_id: args.user_id,
        name: p.display_name,
        kind: "single",
        property_ids: [p.id],
      });
    }
  }
}

/**
 * Resolve the active workspace from the session. If `active_workspace_id`
 * is set, return that. Otherwise (legacy session), look up the workspace
 * matching `active_property_ids`, creating one if needed.
 */
export function resolveActiveWorkspace(s: SessionData): WorkspaceRow | undefined {
  if (s.active_workspace_id) {
    const ws = getWorkspaceById(s.active_workspace_id);
    if (ws && !ws.archived) return ws;
  }
  const userIds = readUserIds(s);
  if (userIds.length === 0) return undefined;

  // Legacy fallback: derive from active_property_ids
  const propIds = readActivePropertyIds(s);
  if (propIds.length > 0) {
    const primaryUserId = userIds[0];
    const legacy =
      propIds.length === 1
        ? findSingleWorkspaceForProperty({
            user_id: primaryUserId,
            property_id: propIds[0],
          })
        : findUnionWorkspaceForPropertySet({
            user_id: primaryUserId,
            property_ids: propIds,
          });
    if (legacy) return legacy;
  }

  // Last resort: most-recently-used non-archived workspace.
  const list = listWorkspaces({ user_ids: userIds });
  return list[0];
}

export function getActiveWorkspaceProperties(s: SessionData): PropertyRow[] {
  const ws = resolveActiveWorkspace(s);
  if (!ws) return [];
  return workspaceProperties(ws);
}

export type WorkspaceWithTokens = {
  workspace: WorkspaceRow;
  properties: Array<{ property: PropertyRow; accessToken: string }>;
};

export async function resolveWorkspaceWithTokens(
  ws: WorkspaceRow
): Promise<WorkspaceWithTokens> {
  const props = workspaceProperties(ws);
  const tokenByUser = new Map<number, Promise<string>>();
  const properties: Array<{ property: PropertyRow; accessToken: string }> = [];
  for (const p of props) {
    let tokenPromise = tokenByUser.get(p.user_id);
    if (!tokenPromise) {
      tokenPromise = getFreshAccessToken(p.user_id);
      tokenByUser.set(p.user_id, tokenPromise);
    }
    properties.push({ property: p, accessToken: await tokenPromise });
  }
  return { workspace: ws, properties };
}

export function listActiveWorkspaces(userIds: number[]): WorkspaceRow[] {
  return listWorkspaces({ user_ids: userIds });
}

export function listAllWorkspaces(userIds: number[]): WorkspaceRow[] {
  return listWorkspaces({ user_ids: userIds, include_archived: true });
}

export function bumpWorkspaceUsage(id: number): void {
  touchWorkspaceLastUsed(id);
}
