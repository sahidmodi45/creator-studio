import { Clapperboard } from "lucide-react";
import Link from "next/link";
import { fileUrl } from "@/components/media";
import { requireWorkspace } from "@/lib/auth";
import { CLIENT_CAN_SEE_WORK, CLIENT_STATUS_LABEL, FORMAT_LABEL } from "@/lib/constants";
import { clientContentList, coverFor } from "@/lib/queries";

export default async function ReviewListPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace } = await requireWorkspace(slug);
  const items = (await clientContentList(workspace.id)).filter((item) => CLIENT_CAN_SEE_WORK.includes(item.status));
  const covers = await coverFor(items.map((item) => item.id), "client");
  const waiting = items.filter((item) => item.status === "client_review");
  const rest = items.filter((item) => item.status !== "client_review");

  const row = (item: (typeof items)[number]) => {
    const cover = covers.get(item.id);
    return (
      <Link key={item.id} href={`/w/${slug}/review/${item.id}`} className="list-row" data-testid="review-row">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="list-thumb" src={fileUrl(cover, { thumb: true })} alt="" />
        ) : (
          <div className="list-thumb"><Clapperboard size={20} /></div>
        )}
        <div className="grow">
          <p className="list-title">{item.title}</p>
          <p className="muted small">{FORMAT_LABEL[item.format]}</p>
        </div>
        <span className={`badge${item.status === "client_review" ? " badge-solid" : ""}`}>{CLIENT_STATUS_LABEL[item.status]}</span>
      </Link>
    );
  };

  return (
    <main className="client-main narrow stack-xl">
      <div className="stack-sm">
        <p className="kicker">Review</p>
        <h1 className="display-sm">
          {waiting.length ? <>Your eyes, <em>please</em></> : <>All caught <em>up</em></>}
        </h1>
        {!waiting.length && <p className="muted">We will let you know when the next piece is ready to watch.</p>}
      </div>
      {waiting.length > 0 && <section>{waiting.map(row)}</section>}
      {rest.length > 0 && (
        <section className="stack-sm">
          <h2 className="section-title">Earlier</h2>
          <div>{rest.map(row)}</div>
        </section>
      )}
    </main>
  );
}
