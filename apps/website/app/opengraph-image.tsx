import { ImageResponse } from "next/og";

export const alt = "Jesus in Practice. Live the teachings of Jesus, one day at a time.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        background: "#FAF7F0",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "75px",
        color: "#292522",
        borderBottom: "12px solid #6B303D",
      }}
    >
      <div
        style={{
          fontSize: 24,
          marginBottom: 40,
          fontWeight: 500,
          color: "#6B303D",
          letterSpacing: 2,
        }}
      >
        JESUS IN PRACTICE
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          fontSize: 70,
          lineHeight: 1.14,
          fontWeight: 400,
        }}
      >
        <span>Live the teachings of Jesus.</span>
        <span style={{ color: "#6B303D", fontStyle: "italic" }}>One day at a time.</span>
      </div>
      <div style={{ fontSize: 26, marginTop: 35, color: "#6A6057" }}>
        A scripture reference. A simple explanation. A thoughtful action.
      </div>
    </div>,
    size,
  );
}
