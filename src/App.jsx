import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import LoginPage from "./LoginPage";
import AdminApp from "./AdminApp";
import SupervisorApp from "./SupervisorApp";

// ─── ADMIN EMAIL — cámbialo al tuyo ───────────────────────────────────────────
export const ADMIN_EMAIL = "davideshke@gmail.com";

export default function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null); // "admin" | "supervisor" | "pending"
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { setUser(null); setRole(null); setLoading(false); return; }
      setUser(u);

      // Admin check por email
      if (u.email === ADMIN_EMAIL) {
        setRole("admin");
        setLoading(false);
        return;
      }

      // Buscar rol en Firestore
      const ref = doc(db, "users", u.uid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        setRole(snap.data().role || "pending");
      } else {
        // Primer login: guardar usuario como pendiente
        await setDoc(ref, {
          uid: u.uid,
          email: u.email,
          name: u.displayName || u.email,
          photo: u.photoURL || "",
          role: "pending",
          createdAt: new Date().toISOString(),
        });
        setRole("pending");
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (loading) return <Loader />;
  if (!user) return <LoginPage />;
  if (role === "admin") return <AdminApp user={user} />;
  if (role === "supervisor") return <SupervisorApp user={user} />;

  // Pendiente de aprobación
  return (
    <div style={styles.center}>
      <div style={styles.card}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#f8fafc", marginBottom: 8 }}>
          Cuenta pendiente
        </div>
        <div style={{ fontSize: 14, color: "#94a3b8", textAlign: "center", marginBottom: 20 }}>
          Tu cuenta ({user.email}) está esperando ser aprobada por el administrador.
        </div>
        <button onClick={() => auth.signOut()}
          style={{ ...styles.btn, background: "#334155", color: "#94a3b8" }}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

function Loader() {
  return (
    <div style={styles.center}>
      <div style={{ fontSize: 40 }}>📍</div>
      <div style={{ color: "#64748b", marginTop: 12, fontSize: 14 }}>Cargando...</div>
    </div>
  );
}

const styles = {
  center: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    minHeight: "100vh", background: "#0f172a", fontFamily: "'DM Sans','Segoe UI',sans-serif" },
  card: { background: "#1e293b", borderRadius: 16, padding: 32, maxWidth: 360, width: "90%",
    border: "1px solid #334155", display: "flex", flexDirection: "column", alignItems: "center" },
  btn: { padding: "10px 24px", borderRadius: 10, border: "none", cursor: "pointer",
    fontSize: 14, fontWeight: 700 },
};
