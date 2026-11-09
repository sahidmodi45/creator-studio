import { requireWorkspace } from "@/lib/auth";
import { CLIENT_CAN_SEE_WORK } from "@/lib/constants";
import { formatCount, formatDayShort } from "@/lib/format";
import { latestMetrics } from "@/lib/queries";

export default async function ClientResults({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace } = await requireWorkspace(slug);
  const rows = (await latestMetrics(workspace.id)).filter(({ item }) => CLIENT_CAN_SEE_WORK.includes(item.status));
  const total = (key: "views" | "saves" | "shares" | "follows") => rows.reduce((sum, { metric }) => sum + metric[key], 0);

  return (
    <main className="client-main stack-lg">
      <div className="stack-sm">
        <h1 className="display-sm">How it is <em>landing</em></h1>
        <p className="muted">Numbers from Instagram, updated by your team.</p>
      </div>
      {rows.length === 0 ? (
        <div className="empty">
          <p className="section-title">No numbers yet</p>
          <p className="small">Once your posts are live, this is where you will see how they are doing.</p>
        </div>
      ) : (
        <>
          <div className="stat-row" data-testid="client-results">
            <div className="stat"><div className="value">{formatCount(total("views"))}</div><div className="label">Views</div></div>
            <div className="stat"><div className="value">{formatCount(total("saves"))}</div><div className="label">Saves</div></div>
            <div className="stat"><div className="value">{formatCount(total("shares"))}</div><div className="label">Shares</div></div>
            <div className="stat"><div className="value">{formatCount(total("follows"))}</div><div className="label">New followers</div></div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Post</th><th>As of</th><th className="num">Views</th><th className="num">Saves</th><th className="num">Shares</th></tr>
              </thead>
              <tbody>
                {rows.map(({ metric, item }) => (
                  <tr key={metric.id}>
                    <td className="strong">{item.title}</td>
                    <td className="nowrap">{formatDayShort(metric.capturedOn)}</td>
                    <td className="num">{formatCount(metric.views)}</td>
                    <td className="num">{formatCount(metric.saves)}</td>
                    <td className="num">{formatCount(metric.shares)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
