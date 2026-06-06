import { useEffect, useState } from "react";

export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== "undefined" ? navigator.onLine : true));
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setDismissed(false);
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOnline || dismissed) return null;

  return (
    <div
      style={{
        background: "#fef3c7",
        color: "#78350f",
        borderBottom: "1px solid #f59e0b",
        padding: "0.75rem 1rem",
        fontSize: "0.875rem",
        textAlign: "center",
        position: "relative",
      }}
    >
      Przeglądasz zapisane dane — brak połączenia.
      <button
        onClick={() => {
          setDismissed(true);
        }}
        style={{
          position: "absolute",
          right: "1rem",
          top: "50%",
          transform: "translateY(-50%)",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: "1rem",
          color: "#78350f",
          lineHeight: 1,
        }}
        aria-label="Zamknij"
      >
        ×
      </button>
    </div>
  );
}
