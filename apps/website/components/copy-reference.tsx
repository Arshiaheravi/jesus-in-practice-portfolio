"use client";

import { useState } from "react";

export default function CopyReference({ reference, url }: { reference: string; url: string }) {
  const [status, setStatus] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${reference}\n${url}`);
      setStatus("Reference copied.");
    } catch {
      setStatus("Copy is unavailable. Select the passage link and copy it using your browser.");
    }
  }
  return (
    <div className="detail-tools">
      <button type="button" className="button button-secondary button-small" onClick={copy}>
        Copy reference
      </button>
      <p className="status-text" role="status">
        {status}
      </p>
    </div>
  );
}
