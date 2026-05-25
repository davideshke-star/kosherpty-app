import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "./firebase";
import { APP_NAME, APP_SUB } from "./App";

export default function Login() {
  const login = async () => {
    try { await signInWithPopup(auth, googleProvider); }
    catch (e) { alert("Error: " + e.message); }
  };

  return (
    <div style={{ minHeight:"100vh", background:"#F7F8FA", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"Inter,sans-serif", padding:20 }}>
      <div style={{ width:"100%", maxWidth:400 }}>
        {/* Logo area */}
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ width:64, height:64, background:"#2563EB", borderRadius:18, display:"flex", alignItems:"center", justifyContent:"center", fontSize:32, margin:"0 auto 16px" }}>📍</div>
          <div style={{ fontSize:22, fontWeight:800, color:"#0F172A", letterSpacing:"-0.5px", lineHeight:1.3 }}>{APP_NAME}</div>
          <div style={{ fontSize:14, color:"#64748B", marginTop:4, fontWeight:500 }}>{APP_SUB}</div>
        </div>

        {/* Card */}
        <div style={{ background:"#fff", borderRadius:20, padding:32, border:"1px solid #E8ECF0", boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
          <div style={{ fontSize:16, fontWeight:600, color:"#0F172A", marginBottom:6 }}>Bienvenido</div>
          <div style={{ fontSize:13, color:"#64748B", marginBottom:24, lineHeight:1.6 }}>Inicia sesión para acceder al sistema de gestión de rutas.</div>
          <button onClick={login} style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:10, background:"#fff", border:"1.5px solid #E8ECF0", borderRadius:12, padding:"13px 20px", cursor:"pointer", fontSize:15, fontWeight:600, color:"#0F172A", boxShadow:"0 1px 2px rgba(0,0,0,.05)", transition:"box-shadow .2s" }}
            onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 12px rgba(0,0,0,.1)"}
            onMouseLeave={e=>e.currentTarget.style.boxShadow="0 1px 2px rgba(0,0,0,.05)"}>
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Entrar con Google
          </button>
          <p style={{ fontSize:12, color:"#94A3B8", textAlign:"center", marginTop:20, lineHeight:1.6 }}>Solo usuarios autorizados por el administrador pueden acceder al sistema.</p>
        </div>
      </div>
    </div>
  );
}
