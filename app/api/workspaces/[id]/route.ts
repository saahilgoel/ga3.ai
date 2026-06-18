import { NextRequest, NextResponse } from "next/server";
import { getSession, readUserIds } from "@/lib/session";
import {
  attachPropertyToWorkspace,
  deleteWorkspace,
  detachPropertyFromWorkspace,
  getPropertiesByIds,
  getPropertyById,
  getWorkspaceById,
  setWorkspacePrimary,
  updateWorkspace,
} from "@/lib/db";
import { bumpWorkspaceUsage } from "@/lib/workspace";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const { id: idStr } = await context.params;
  const id = parseInt(idStr, 10);
  if (!id) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  const ws = getWorkspaceById(id);
  if (!ws) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!userIds.includes(ws.user_id)) {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }

  const body = (await req.json()) as {
    name?: string;
    property_ids?: number[];
    archived?: boolean;
    activate?: boolean;
    attach_property_id?: number;
    detach_property_id?: number;
    primary_property_id?: number;
  };

  if (body.property_ids) {
    if (body.property_ids.length === 0) {
      return NextResponse.json(
        { error: "A workspace must contain at least one property." },
        { status: 400 }
      );
    }
    const props = getPropertiesByIds(body.property_ids);
    if (props.length !== body.property_ids.length) {
      return NextResponse.json({ error: "property_not_found" }, { status: 404 });
    }
    for (const p of props) {
      if (!userIds.includes(p.user_id)) {
        return NextResponse.json({ error: "not_authorized" }, { status: 403 });
      }
    }
  }

  let updated = updateWorkspace({
    id,
    user_ids: userIds,
    name: body.name,
    property_ids: body.property_ids,
    kind: body.property_ids
      ? body.property_ids.length === 1
        ? "single"
        : "union"
      : undefined,
    archived: body.archived,
  });

  if (body.attach_property_id) {
    const p = getPropertyById(body.attach_property_id);
    if (!p || !userIds.includes(p.user_id)) {
      return NextResponse.json({ error: "property_not_authorized" }, { status: 403 });
    }
    updated = attachPropertyToWorkspace({
      workspace_id: id,
      property_id: body.attach_property_id,
      user_ids: userIds,
    });
  }
  if (body.detach_property_id) {
    updated = detachPropertyFromWorkspace({
      workspace_id: id,
      property_id: body.detach_property_id,
      user_ids: userIds,
    });
  }
  if (body.primary_property_id) {
    const p = getPropertyById(body.primary_property_id);
    if (!p || !userIds.includes(p.user_id)) {
      return NextResponse.json({ error: "property_not_authorized" }, { status: 403 });
    }
    updated = setWorkspacePrimary({
      workspace_id: id,
      primary_property_id: body.primary_property_id,
      user_ids: userIds,
    });
  }

  if (body.activate) {
    session.active_workspace_id = id;
    await session.save();
    bumpWorkspaceUsage(id);
  } else if (body.archived && session.active_workspace_id === id) {
    // Auto-fallback if archiving the active workspace
    session.active_workspace_id = undefined;
    await session.save();
  }

  return NextResponse.json({ workspace: updated });
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const { id: idStr } = await context.params;
  const id = parseInt(idStr, 10);
  if (!id) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  deleteWorkspace({ id, user_ids: userIds });
  if (session.active_workspace_id === id) {
    session.active_workspace_id = undefined;
    await session.save();
  }
  return NextResponse.json({ ok: true });
}
