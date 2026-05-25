import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import Login from "./Login";
import Admin from "./Admin";
import Supervisor from "./Supervisor";

export const ADMIN_EMAIL = "davideshke@gmail.com";
export const APP_NAME = "Kosher Shevet Ahim";
export const APP_SUB  = "Gestión de Rutas";

const C = {
  bg: "#F7F8FA", surface: "#FFFFFF", border: "#E8ECF0",
  primary: "#2563EB", text: "#0F172A", muted: "#64748B"
};

export default function App() {
  const [user, setUser]     = useState(null);
  const [role, setRole]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async u => {
      if (!u) { setUser(null); setRole(null); setLoading(false); return; }
      setUser(u);
      if (u.email === ADMIN_EMAIL) { setRole("admin"); setLoading(false); return; }
      const ref = doc(db, "users", u.uid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        setRole(snap.data().role || "pending");
      } else {
        await setDoc(ref, { uid: u.uid, email: u.email, name: u.displayName || u.email, photo: u.photoURL || "", role: "pending", createdAt: new Date().toISOString() });
        setRole("pending");
      }
      setLoading(false);
    });
  }, []);

  if (loading) return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:"Inter,sans-serif" }}>
      <div style={{ width:40, height:40, border:`3px solid ${C.border}`, borderTop:`3px solid ${C.primary}`, borderRadius:"50%", animation:"spin 1s linear infinite" }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!user) return <Login />;
  if (role === "admin") return <Admin user={user} />;
  if (role === "supervisor") return <Supervisor user={user} />;

  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"Inter,sans-serif", padding:24 }}>
      <div style={{ background:C.surface, borderRadius:16, padding:40, maxWidth:380, width:"100%", border:`1px solid ${C.border}`, textAlign:"center", boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
        <div style={{ fontSize:40, marginBottom:16 }}>⏳</div>
        <div style={{ fontSize:20, fontWeight:700, color:C.text, marginBottom:8 }}>Cuenta pendiente</div>
        <div style={{ fontSize:14, color:C.muted, marginBottom:24, lineHeight:1.6 }}>Tu cuenta está esperando aprobación del administrador.</div>
        <button onClick={() => auth.signOut()} style={{ background:C.primary, color:"#fff", border:"none", borderRadius:10, padding:"11px 24px", fontWeight:600, cursor:"pointer", fontSize:14 }}>Cerrar sesión</button>
      </div>
    </div>
  );
}
