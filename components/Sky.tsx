const STARS: Array<[number, number, number, "white" | "pink" | "cyan"]> = [
  [8, 16, 0.2, "white"],
  [14, 28, 1.1, "pink"],
  [18, 12, 0.6, "cyan"],
  [24, 36, 1.8, "white"],
  [31, 18, 0.4, "white"],
  [36, 44, 2.2, "pink"],
  [42, 22, 1.4, "cyan"],
  [48, 14, 0.8, "white"],
  [53, 32, 2.6, "white"],
  [58, 20, 1.2, "pink"],
  [64, 40, 0.3, "cyan"],
  [69, 16, 1.9, "white"],
  [74, 28, 0.7, "white"],
  [79, 12, 2.4, "pink"],
  [84, 36, 1.5, "white"],
  [88, 22, 0.5, "cyan"],
  [92, 30, 2.1, "white"],
  [12, 58, 1.6, "white"],
  [27, 64, 0.9, "pink"],
  [46, 70, 2.8, "white"],
  [63, 60, 1.3, "cyan"],
  [81, 68, 0.2, "white"],
  [22, 78, 2.3, "white"],
  [70, 76, 1.7, "pink"],
];

export function Sky() {
  return (
    <div className="sky" aria-hidden="true">
      <div className="cloud cloud-a blob" />
      <div className="cloud cloud-b blob" />
      <div className="cloud cloud-c blob" />
      <div className="ribs" />
      <svg className="constellation" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <path d="M140 460 C 300 180, 520 150, 690 280 S 1020 460, 1280 250" />
        <path d="M220 560 C 460 680, 720 160, 1120 500" />
        <path d="M620 270 C 820 90, 980 180, 1240 140" />
        <circle className="node" cx="140" cy="460" r="4" />
        <circle className="node node-pink" cx="360" cy="250" r="6" />
        <circle className="node" cx="690" cy="280" r="4" />
        <circle className="node node-pink" cx="980" cy="360" r="5" />
        <circle className="node" cx="1280" cy="250" r="4" />
        <circle className="node node-pink" cx="220" cy="560" r="5" />
        <circle className="node" cx="720" cy="340" r="3.5" />
        <circle className="node node-pink" cx="1120" cy="500" r="6" />
        <circle className="node" cx="820" cy="160" r="3.5" />
        <circle className="node node-pink" cx="1240" cy="140" r="5" />
      </svg>
      {STARS.map(([left, top, delay, tone]) => (
        <span
          key={`${left}-${top}`}
          className={`star star-${tone}`}
          style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${delay}s` }}
        />
      ))}
      <span className="traveler traveler-a" />
      <span className="traveler traveler-b" />
      <span className="traveler traveler-c" />
    </div>
  );
}
