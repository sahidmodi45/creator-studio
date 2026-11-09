import Link from "next/link";
import { requireWorkspace } from "@/lib/auth";
import { CLIENT_CAN_SEE_WORK, CLIENT_STATUS_LABEL, FORMAT_LABEL } from "@/lib/constants";
import { clientContentList } from "@/lib/queries";

export default async function ClientScripts({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace } = await requireWorkspace(slug);
  const items = (await clientContentList(workspace.id)).filter((item) => CLIENT_CAN_SEE_WORK.includes(item.status) && (item.script || item.caption));

  return (
    <main className="client-main narrow stack-lg">
      <div className="stack-sm">
        <h1 className="display-sm">Scripts and captions</h1>
        <p className="muted">The words for each piece, once they are ready for you.</p>
      </div>
      {items.length === 0 ? (
        <div className="empty">
          <p className="section-title">Nothing here yet</p>
          <p className="small">We will share scripts and captions when a piece is ready for you to look at.</p>
        </div>
      ) : (
        <div className="stack">
          {items.map((item) => (
            <Link key={item.id} href={`/w/${slug}/review/${item.id}`} className="card hover-lift plain-link script-card" data-testid="script-card">
              <div className="row-between">
                <h2 className="section-title">{item.title}</h2>
                <span className={`badge${item.status === "client_review" ? " badge-solid" : ""}`}>{CLIENT_STATUS_LABEL[item.status]}</span>
              </div>
              <p className="muted tiny">{FORMAT_LABEL[item.format]}</p>
              {item.script && <p className="script-text">{item.script}</p>}
              {item.caption && (
                <>
                  <p className="kicker">Caption</p>
                  <p className="script-text">{item.caption}</p>
                </>
              )}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
