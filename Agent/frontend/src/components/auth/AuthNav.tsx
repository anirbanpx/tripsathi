import { useNavigate } from "react-router-dom";
import { LogOut, BookOpen } from "lucide-react";
import type { AuthUser } from "../../types";
import { clearAuthState } from "../../lib/auth";
import type { UserContext } from "../../types";

interface Props {
  user: AuthUser;
  onSetContext: (patch: Partial<UserContext>) => void;
}

export default function AuthNav({ user, onSetContext }: Props) {
  const navigate = useNavigate();

  function handleSignOut() {
    clearAuthState();
    onSetContext({ mode: "demo", user_id: null, auth_user: null });
    navigate("/");
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {user.avatar_url ? (
        <img
          src={user.avatar_url}
          alt={user.name}
          style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }}
        />
      ) : (
        <div style={{
          width: 28, height: 28, borderRadius: "50%", background: "var(--accent)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontSize: 12, fontWeight: 700,
        }}>
          {user.name.charAt(0).toUpperCase()}
        </div>
      )}
      <button
        style={{
          display: "flex", alignItems: "center", gap: 5,
          background: "none", border: "none", cursor: "pointer",
          fontSize: 12, fontWeight: 600, color: "var(--fg-2)",
          fontFamily: "var(--font-body)", padding: "4px 6px",
        }}
        onClick={() => navigate("/profile")}
      >
        <BookOpen size={13} strokeWidth={2} />
        My trips
      </button>
      <button
        style={{
          display: "flex", alignItems: "center", gap: 4,
          background: "none", border: "none", cursor: "pointer",
          fontSize: 12, fontWeight: 600, color: "var(--fg-3)",
          fontFamily: "var(--font-body)", padding: "4px 6px",
        }}
        onClick={handleSignOut}
      >
        <LogOut size={13} strokeWidth={2} />
        Sign out
      </button>
    </div>
  );
}
