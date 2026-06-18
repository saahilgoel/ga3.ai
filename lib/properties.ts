import { getPropertiesByIds, getPropertiesForUsers, PropertyRow } from "./db";
import { readActivePropertyIds, readUserIds, SessionData } from "./session";
import { getFreshAccessToken } from "./google";

export function getActivePropertiesForSession(s: SessionData): PropertyRow[] {
  const userIds = readUserIds(s);
  const ids = readActivePropertyIds(s);
  if (userIds.length === 0 || ids.length === 0) return [];
  const props = getPropertiesByIds(ids);
  // Only return properties that belong to the authenticated users in this session.
  return props.filter((p) => userIds.includes(p.user_id));
}

export function getAllPropertiesForSession(s: SessionData): PropertyRow[] {
  return getPropertiesForUsers(readUserIds(s));
}

export type PropertyWithToken = {
  property: PropertyRow;
  accessToken: string;
};

export async function resolvePropertyTokens(props: PropertyRow[]): Promise<PropertyWithToken[]> {
  // Cache one access token per user_id so we don't refresh repeatedly.
  const tokenByUser = new Map<number, Promise<string>>();
  const out: PropertyWithToken[] = [];
  for (const p of props) {
    let tokenPromise = tokenByUser.get(p.user_id);
    if (!tokenPromise) {
      tokenPromise = getFreshAccessToken(p.user_id);
      tokenByUser.set(p.user_id, tokenPromise);
    }
    out.push({ property: p, accessToken: await tokenPromise });
  }
  return out;
}
