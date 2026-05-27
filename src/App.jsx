import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { ADMIN_EMAIL, C, btn } from "./constants";
import { LogoIcon } from "./Logo";
import Login from "./Login";
import Admin from "./Admin";
import Supervisor from "./Supervisor";

export default function App() {
  const [user, setUser]     = useState(null);
  const [role, setRole]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async u => {
      if (!u) { setUser(null); setRole(null); setLoading(false); return; }
      setUser(u);

      // Primary admin by hardcoded email
      if (u.email === ADMIN_EMAIL) { setRole("admin"); setLoading(false); return; }

      const ref  = doc(db, "users", u.uid);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const data = snap.data();
        // If user was deleted and re-registered, they might have stale role
        // Always respect what's in Firestore
        setRole(data.role || "pending");
      } else {
        // New user OR user who was deleted from Firestore — always create as pending
        await setDoc(ref, {
          uid:       u.uid,
          email:     u.email,
          name:      u.displayName || u.email,
          role:      "pending",
          createdAt: new Date().toISOString(),
        });
        setRole("pending");
      }
      setLoading(false);
    });
  }, []);

  if (loading) return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ width:36, height:36, border:`3px solid ${C.border}`, borderTop:`3px solid ${C.primary}`, borderRadius:"50%", animation:"spin 1s linear infinite" }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!user)              return <Login />;
  if (role === "admin")   return <Admin user={user} />;
  if (role === "supervisor") return <Supervisor user={user} />;

  // Pending approval
  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:24, fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ background:"#fff", borderRadius:20, padding:40, maxWidth:360, width:"100%", boxShadow:"0 4px 24px rgba(0,0,0,.08)", textAlign:"center" }}>
        <div style={{ marginBottom:16, display:"flex", justifyContent:"center" }}><LogoIcon size={52}/></div>
        <div style={{ fontSize:18, fontWeight:700, color:C.text, marginBottom:8 }}>Cuenta pendiente</div>
        <div style={{ fontSize:14, color:C.muted, lineHeight:1.6, marginBottom:24 }}>
          Tu cuenta está esperando aprobación del administrador.<br/>
          <span style={{ fontSize:12, color:C.subtle }}>{user.email}</span>
        </div>
        <button onClick={() => auth.signOut()}
          style={{ ...btn({ background:C.primary, color:"#fff", padding:"11px 24px", fontSize:14, width:"100%" }) }}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
