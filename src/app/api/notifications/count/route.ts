import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { unreadCount } from "@/lib/queries";

export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ count: 0 }, { status: 401 });
  const workspaceId = request.nextUrl.searchParams.get("workspaceId") ?? undefined;
  // Counts only this person's own notifications, so the workspace id can only narrow the result.
  return NextResponse.json({ count: await unreadCount(user.id, workspaceId) });
}
