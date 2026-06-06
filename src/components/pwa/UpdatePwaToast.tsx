import { useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@/components/ui/button";

export default function UpdatePwaToast() {
  const [showToast, setShowToast] = useState(false);

  const { updateServiceWorker } = useRegisterSW({
    onNeedRefresh() {
      setShowToast(true);
    },
  });

  if (!showToast) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "1rem",
        right: "1rem",
        zIndex: 50,
        background: "#ffffff",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        borderRadius: "0.5rem",
        padding: "1rem",
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        maxWidth: "320px",
      }}
    >
      <span style={{ fontSize: "0.875rem", flex: 1 }}>Nowa wersja dostępna</span>
      <Button
        size="sm"
        onClick={() => {
          void updateServiceWorker(true);
        }}
      >
        Odśwież
      </Button>
      <button
        onClick={() => {
          setShowToast(false);
        }}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: "1rem",
          color: "#6b7280",
          lineHeight: 1,
          padding: 0,
        }}
        aria-label="Zamknij"
      >
        ×
      </button>
    </div>
  );
}
