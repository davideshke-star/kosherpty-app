import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "./firebase";

export default function LoginPage() {
  const login = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      alert("Error al iniciar sesión: " + e.message);
    }
  };

  return (
    <div style={s.bg}>
      <div style={s.card}>
        <div style={{ fontSize: 52, marginBottom: 8 }}>📍</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: "#f8fafc", letterSpacing: -0.5 }}>
          Rutas KOSHERPTY
        </div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 32, marginTop: 4 }}>
          Sistema de supervisión de rutas
        </div>
        <button onClick={login} style={s.googleBtn}>
          <svg width="20" height="20" viewBox="0 0 48 48" style={{ marginRight: 10 }}>
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Entrar con Google
        </button>
        <div style={{ fontSize: 11, color: "#475569", marginTop: 20, textAlign: "center" }}>
          Solo usuarios autorizados por el administrador pueden acceder.
        </div>
      </div>
    </div>
  );
}

const s = {
  bg: { minHeight: "100vh", background: "#0f172a", display: "flex", alignItems: "center",
    justifyContent: "center", fontFamily: "'DM Sans','Segoe UI',sans-serif" },
  card: { background: "#1e293b", borderRadius: 20, padding: "40px 32px", maxWidth: 360,
    width: "90%", border: "1px solid #334155", display: "flex", flexDirection: "column",
    alignItems: "center", boxShadow: "0 25px 50px #00000066" },
  googleBtn: { display: "flex", alignItems: "center", background: "#fff", color: "#1e293b",
    border: "none", borderRadius: 12, padding: "12px 24px", fontSize: 15, fontWeight: 700,
    cursor: "pointer", width: "100%", justifyContent: "center", boxShadow: "0 2px 8px #00000033" },
};
