/**
 * Small drawings of what each section holds, so a new teammate or the client understands it at a glance.
 * They are shapes and labels only: no made-up colours, fonts, words or numbers that could be mistaken for her real brand.
 */

export type SectionId =
  | "home"
  | "requests"
  | "tasks"
  | "pipeline"
  | "scripts"
  | "calendar"
  | "feed"
  | "current"
  | "files"
  | "videos"
  | "photos"
  | "voice"
  | "references"
  | "brand"
  | "results"
  | "assistant"
  | "team"
  | "review";

const Bar = ({ w, strong = false }: { w: number; strong?: boolean }) => <span className={`ex-bar${strong ? " strong" : ""}`} style={{ width: `${w}%` }} />;

function Drawing({ id }: { id: SectionId }) {
  switch (id) {
    case "home":
      return (
        <div className="ex-tiles">
          <span className="ex-tile beet" /><span className="ex-tile" /><span className="ex-tile" /><span className="ex-tile blush" />
        </div>
      );
    case "requests":
      return (
        <div className="ex-stack">
          <div className="ex-bubble"><b>Idea</b><Bar w={80} /><Bar w={55} /></div>
          <div className="ex-bubble"><b>Reel link</b><Bar w={65} /></div>
        </div>
      );
    case "tasks":
      return (
        <div className="ex-stack">
          {[true, false, false].map((done, i) => (
            <div key={i} className="ex-row"><span className={`ex-check${done ? " done" : ""}`} /><Bar w={[70, 85, 55][i]} /></div>
          ))}
        </div>
      );
    case "pipeline":
      return (
        <div className="ex-cols">
          {["Idea", "Making", "Her review", "Live"].map((label, i) => (
            <div key={label} className="ex-col"><b>{label}</b>{Array.from({ length: [2, 2, 1, 1][i] }, (_, n) => <span key={n} className="ex-card" />)}</div>
          ))}
        </div>
      );
    case "scripts":
      return (
        <div className="ex-doc">
          <b>Hook</b><Bar w={85} strong />
          <b>Script</b><Bar w={95} /><Bar w={90} /><Bar w={60} />
          <b>Caption</b><Bar w={75} />
        </div>
      );
    case "calendar":
      return (
        <div className="ex-week">
          {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => (
            <div key={i} className="ex-day"><b>{day}</b>{[0, 2, 4].includes(i) && <span className="ex-chip">{i === 2 ? "Carousel" : "Reel"}</span>}</div>
          ))}
        </div>
      );
    case "feed":
    case "current":
      return <div className="ex-grid">{Array.from({ length: 9 }, (_, i) => <span key={i} className={i < 3 && id === "feed" ? "next" : ""} />)}</div>;
    case "files":
      return (
        <div className="ex-files">
          {["Video", "Photo", "Voice", "Reference"].map((label) => <div key={label}><span className="ex-thumb" /><b>{label}</b></div>)}
        </div>
      );
    case "videos":
    case "photos":
    case "references":
      return <div className="ex-files">{Array.from({ length: 4 }, (_, i) => <div key={i}><span className={`ex-thumb${id === "videos" ? " play" : ""}`} /></div>)}</div>;
    case "voice":
      return (
        <div className="ex-stack">
          {[0, 1].map((i) => (
            <div key={i} className="ex-row"><span className="ex-play" /><span className="ex-wave">{Array.from({ length: 18 }, (_, n) => <i key={n} style={{ height: `${30 + ((n * 37 + i * 11) % 70)}%` }} />)}</span></div>
          ))}
        </div>
      );
    case "brand":
      return (
        <div className="ex-stack">
          <div className="ex-row"><b className="ex-key">Colours</b>{[0, 1, 2, 3].map((i) => <span key={i} className="ex-dot" />)}</div>
          <div className="ex-row"><b className="ex-key">Fonts</b><span className="ex-font">Heading</span><span className="ex-font small">Body</span></div>
          <div className="ex-row"><b className="ex-key">Voice</b><Bar w={60} /></div>
        </div>
      );
    case "results":
      return (
        <div className="ex-stack">
          <div className="ex-chart">{[40, 65, 50, 85, 70].map((h, i) => <span key={i} style={{ height: `${h}%` }} />)}</div>
          <b>Saves · shares · reach per post</b>
        </div>
      );
    case "assistant":
      return (
        <div className="ex-stack">
          <div className="ex-bubble right"><Bar w={70} /></div>
          <div className="ex-bubble"><Bar w={90} /><Bar w={65} /></div>
        </div>
      );
    case "team":
      return (
        <div className="ex-stack">
          {["Team", "Team", "Client"].map((role, i) => (
            <div key={i} className="ex-row"><span className="ex-avatar" /><Bar w={45} /><b className="ex-role">{role}</b></div>
          ))}
        </div>
      );
    case "review":
      return (
        <div className="ex-review">
          <span className="ex-thumb play tall" />
          <div className="ex-stack"><Bar w={80} /><Bar w={55} /><span className="ex-btn ok">Approve</span><span className="ex-btn">Ask for changes</span></div>
        </div>
      );
  }
}

/** The drawing with its "Example" tag. */
export function SectionExample({ id, compact = false }: { id: SectionId; compact?: boolean }) {
  return (
    <div className={`ex${compact ? " compact" : ""}`} aria-hidden>
      <span className="ex-tag">Example</span>
      <Drawing id={id} />
    </div>
  );
}
