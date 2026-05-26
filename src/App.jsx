import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { ADMIN_EMAIL, APP_NAME, APP_SUB, C, btn } from "./constants";
import Login from "./Login";
import Admin from "./Admin";
import Supervisor from "./Supervisor";

export default function App() {
  const [user, setUser]       = useState(null);
  const [role, setRole]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async u => {
      if (!u) { setUser(null); setRole(null); setLoading(false); return; }
      setUser(u);
      if (u.email === ADMIN_EMAIL) { setRole("admin"); setLoading(false); return; }
      const ref  = doc(db, "users", u.uid);
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
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
      <div style={{ width:36, height:36, border:`3px solid ${C.border}`, borderTop:`3px solid ${C.primary}`, borderRadius:"50%", animation:"spin 1s linear infinite" }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!user) return <Login />;
  if (role === "admin") return <Admin user={user} />;
  if (role === "supervisor") return <Supervisor user={user} />;

  // Pending
  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ background:C.surface, borderRadius:20, padding:40, maxWidth:360, width:"100%", boxShadow:C.shadowMd, textAlign:"center" }}>
        <div style={{ fontSize:44, marginBottom:16 }}>⏳</div>
        <div style={{ fontSize:13, fontWeight:700, color:C.primary, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>{APP_NAME}</div>
        <div style={{ fontSize:18, fontWeight:700, color:C.text, marginBottom:8 }}>Cuenta pendiente</div>
        <div style={{ fontSize:14, color:C.muted, lineHeight:1.6, marginBottom:24 }}>Tu cuenta está esperando aprobación del administrador.</div>
        <button onClick={() => auth.signOut()} style={{ ...btn({ background:C.primary, color:"#fff", padding:"11px 24px", fontSize:14, width:"100%" }) }}>Cerrar sesión</button>
      </div>
    </div>
  );
}
