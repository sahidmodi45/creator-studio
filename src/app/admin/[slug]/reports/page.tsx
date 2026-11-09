import { and, asc, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { FollowerForm, MetricsForm } from "@/components/admin-forms";
import { BarChart, LineChart } from "@/components/charts";
import { db } from "@/db";
import { contentItems, followerSnapshots } from "@/db/schema";
import { requireTeam } from "@/lib/auth";
import { formatCount, formatDayShort, todayString } from "@/lib/format";
import { latestMetrics } from "@/lib/queries";

export default async function ReportsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace } = await requireTeam(slug);
  const today = todayString();

  const [items, snapshots] = await Promise.all([
    db
      .select({ id: contentItems.id, title: contentItems.title, pillar: contentItems.pillar, status: contentItems.status, scheduledDate: contentItems.scheduledDate })
      .from(contentItems)
      .where(and(eq(contentItems.workspaceId, workspace.id), isNull(contentItems.deletedAt))),
    db.select().from(followerSnapshots).where(eq(followerSnapshots.workspaceId, workspace.id)).orderBy(asc(followerSnapshots.capturedOn)),
  ]);

  const rows = await latestMetrics(workspace.id);

  const total = (key: "saves" | "shares" | "reach" | "nonFollowerReach" | "follows") => rows.reduce((sum, { metric }) => sum + metric[key], 0);
  const reach = total("reach");
  const nonFollowerShare = reach ? Math.round((total("nonFollowerReach") / reach) * 100) : null;

  const pillarNames = [...new Set([...workspace.pillars, ...rows.map(({ item }) => item.pillar ?? "No pillar")])];
  const byPillar = (key: "saves" | "shares") =>
    pillarNames
      .map((label) => ({ label, value: rows.filter(({ item }) => (item.pillar ?? "No pillar") === label).reduce((sum, { metric }) => sum + metric[key], 0) }))
      .filter((row) => workspace.pillars.includes(row.label) || row.value > 0);

  const reportable = items.filter((item) => ["published", "scheduled", "approved"].includes(item.status));
  const latestFollowers = snapshots[snapshots.length - 1]?.followers ?? workspace.followers;
  const firstFollowers = snapshots[0]?.followers;
  const followerChange = latestFollowers != null && firstFollowers != null && snapshots.length > 1 ? latestFollowers - firstFollowers : null;

  return (
    <div className="stack-xl">
      <div className="stack-sm">
        <p className="kicker">Performance</p>
        <h1 className="display-sm">How it is <em>landing</em></h1>
        <p className="muted small">Numbers are typed in from Instagram Insights. Each post shows its latest entry.</p>
      </div>

      <div className="stat-row" data-testid="report-stats">
        <div className="stat">
          <div className="value">{formatCount(latestFollowers)}</div>
          <div className="label">Followers{followerChange != null ? ` · ${followerChange >= 0 ? "+" : ""}${formatCount(followerChange)} since ${formatDayShort(snapshots[0].capturedOn)}` : ""}</div>
        </div>
        <div className="stat"><div className="value" data-testid="total-saves">{formatCount(total("saves"))}</div><div className="label">Saves</div></div>
        <div className="stat"><div className="value">{formatCount(total("shares"))}</div><div className="label">Shares</div></div>
        <div className="stat"><div className="value">{nonFollowerShare == null ? "–" : `${nonFollowerShare}%`}</div><div className="label">Reach from non-followers</div></div>
        <div className="stat"><div className="value">{formatCount(total("follows"))}</div><div className="label">Follows from posts</div></div>
      </div>

      <div className="grid-2" style={{ alignItems: "start" }}>
        <div className="chart-card">
          <p className="chart-title">Followers</p>
          <p className="chart-sub">Axis starts near the current range, not at zero.</p>
          {snapshots.length ? (
            <LineChart label="Followers" points={snapshots.map((row) => ({ date: row.capturedOn, value: row.followers }))} />
          ) : (
            <p className="muted small">Add a follower count below to start the line.</p>
          )}
        </div>
        <div className="stack">
          <div className="chart-card">
            <p className="chart-title">Saves by pillar</p>
            <p className="chart-sub">The best sign a recipe or guide is useful.</p>
            {rows.length ? <BarChart unit="saves" rows={byPillar("saves")} /> : <p className="muted small">No numbers yet.</p>}
          </div>
          <div className="chart-card">
            <p className="chart-title">Shares by pillar</p>
            <p className="chart-sub">Sends are what grow an account.</p>
            {rows.length ? <BarChart unit="shares" rows={byPillar("shares")} /> : <p className="muted small">No numbers yet.</p>}
          </div>
        </div>
      </div>

      <section className="stack-sm">
        <h2 className="section-title">Post by post</h2>
        {rows.length === 0 ? (
          <p className="muted small">Add numbers for a post below and it will show up here.</p>
        ) : (
          <div className="table-wrap">
            <table className="table" data-testid="report-table">
              <thead>
                <tr>
                  <th>Post</th><th>Pillar</th><th>As of</th>
                  <th className="num">Views</th><th className="num">Reach</th><th className="num">Non-follower</th>
                  <th className="num">Likes</th><th className="num">Comments</th><th className="num">Shares</th><th className="num">Saves</th><th className="num">Follows</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ metric, item }) => (
                  <tr key={metric.id}>
                    <td><Link className="plain-link strong" href={`/admin/${slug}/content/${item.id}`}>{item.title}</Link></td>
                    <td>{item.pillar ?? "–"}</td>
                    <td className="nowrap">{formatDayShort(metric.capturedOn)}</td>
                    <td className="num">{formatCount(metric.views)}</td>
                    <td className="num">{formatCount(metric.reach)}</td>
                    <td className="num">{formatCount(metric.nonFollowerReach)}</td>
                    <td className="num">{formatCount(metric.likes)}</td>
                    <td className="num">{formatCount(metric.comments)}</td>
                    <td className="num">{formatCount(metric.shares)}</td>
                    <td className="num">{formatCount(metric.saves)}</td>
                    <td className="num">{formatCount(metric.follows)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="stack" style={{ maxWidth: 820 }}>
        <h2 className="section-title">Add numbers</h2>
        {reportable.length ? (
          <MetricsForm slug={slug} today={today} items={reportable} />
        ) : (
          <p className="muted small">Once a piece is approved or published, you can add its numbers here.</p>
        )}
        <h2 className="section-title">Add a follower count</h2>
        <FollowerForm slug={slug} today={today} />
      </section>
    </div>
  );
}
