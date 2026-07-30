import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ height: "100%", width: "100%", display: "flex", color: "#EAEDF2", background: "#0F1114", padding: 64, fontFamily: "sans-serif", position: "relative" }}>
      <div style={{ position: "absolute", right: -110, top: -190, width: 620, height: 620, borderRadius: 620, border: "38px solid #00E5FF", opacity: .2 }} />
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", color: "#00E5FF", fontSize: 28, fontWeight: 700, letterSpacing: 4 }}>V3L0CITY</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 82, fontWeight: 800, letterSpacing: -5 }}>Drive data,</div>
          <div style={{ fontSize: 82, fontWeight: 800, letterSpacing: -5, color: "#00E5FF" }}>in focus.</div>
          <div style={{ marginTop: 26, color: "#A4AAB2", fontSize: 29 }}>A focused, privacy-minded driving dashboard.</div>
        </div>
      </div>
    </div>,
    size,
  );
}
