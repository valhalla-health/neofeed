// Lightweight inline SVG icons (24x24, 1.6 stroke)
const Icon = ({ name, size = 16, color = "currentColor", stroke = 1.6 }) => {
  const paths = {
    dashboard: "M3 13h7V3H3v10zm0 8h7v-6H3v6zm11 0h7V11h-7v10zm0-18v6h7V3h-7z",
    calc:      "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm2 4v3h10V7H7zm0 6h2v2H7v-2zm4 0h2v2h-2v-2zm4 0h2v6h-2v-6zm-8 4h2v2H7v-2zm4 0h2v2h-2v-2z",
    chart:     "M3 3v18h18M7 14l4-5 4 3 5-7",
    log:       "M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm3 4h8M8 12h8M8 16h5",
    bell:      "M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6V11a6 6 0 1 0-12 0v5l-2 2v1h16v-1l-2-2z",
    users:     "M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-8 1a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm0 2c-2.67 0-8 1.34-8 4v3h9v-2.5c0-1.2.6-2.3 1.5-3-1-1-2.2-1.5-2.5-1.5zm8 0c-.3 0-.8 0-1.4.1A4.5 4.5 0 0 1 17 18v2h7v-3c0-2.66-5.33-3-8-3z",
    settings:  "M19.4 13a7 7 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1L15 3h-4l-.3 3a7 7 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.7 1L11 21h4l.3-3a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6zM12 15.5A3.5 3.5 0 1 1 15.5 12 3.5 3.5 0 0 1 12 15.5z",
    search:    "M21 21l-5.2-5.2A8 8 0 1 0 14 17a8 8 0 0 0 1.8-1.2L21 21zM10 16a6 6 0 1 1 6-6 6 6 0 0 1-6 6z",
    plus:      "M12 5v14M5 12h14",
    swap:      "M7 4l-4 4 4 4V9h14V7H7V4zm10 16l4-4-4-4v3H3v2h14v3z",
    save:      "M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4zm-5 16a3 3 0 1 1 3-3 3 3 0 0 1-3 3zm3-10H5V5h10v4z",
    arrow:     "M5 12h14M13 6l6 6-6 6",
    check:     "M5 13l4 4L19 7",
    x:         "M6 6l12 12M18 6l-12 12",
    info:      "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 15h-2v-6h2zm0-8h-2V7h2z",
    drop:      "M12 2s-7 8-7 13a7 7 0 0 0 14 0c0-5-7-13-7-13z",
    milk:      "M8 2h8v3l-1 2v4l2 4v7a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2v-7l2-4V7L8 5V2z",
    weight:    "M6 8h12l2 12H4L6 8zm3 0a3 3 0 1 1 6 0",
    pdf:       "M8 2h7l5 5v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 9v8h2v-3h1a2 2 0 0 0 0-4H8zm5 0v8h2c1.5 0 3-1 3-4s-1.5-4-3-4h-2z",
    trash:     "M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13M10 11v6M14 11v6",
  };
  const d = paths[name];
  if (!d) return null;
  // some icons are stroked, some filled
  const filled = ["calc","bell","users","settings","search","drop","milk","weight","pdf"].includes(name);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : "none"} stroke={filled ? "none" : color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
};

window.Icon = Icon;
