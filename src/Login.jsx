import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "./firebase";
import { C } from "./constants";
import { LogoIcon } from "./Logo";

export default function Login() {
  const login = async () => {
    try { await signInWithPopup(auth, googleProvider); }
    catch (e) { alert("Error al iniciar sesión: " + e.message); }
  };

  return (
    <div style={{ minHeight:"100vh", background:"#F4F6F9", display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ width:"100%", maxWidth:360 }}>

        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ display:"flex", justifyContent:"center", marginBottom:14 }}>
            <LogoIcon size={60}/>
          </div>
          <div style={{ fontSize:11, fontWeight:700, color:"#1D4ED8", textTransform:"uppercase", letterSpacing:2, marginBottom:6 }}>
            Kosher Shevet Ahim
          </div>
          <div style={{ fontSize:24, fontWeight:800, color:"#0F172A", letterSpacing:"-.5px" }}>
            Gestión de Rutas
          </div>
          <div style={{ fontSize:13, color:"#6B7280", marginTop:6 }}>Sistema de supervisión</div>
        </div>

        <div style={{ background:"#fff", borderRadius:20, padding:28, boxShadow:"0 4px 24px rgba(0,0,0,.08)" }}>
          <div style={{ fontSize:15, fontWeight:700, color:"#0F172A", marginBottom:4 }}>Iniciar sesión</div>
          <div style={{ fontSize:13, color:"#6B7280", marginBottom:20, lineHeight:1.5 }}>
            Accede con tu cuenta corporativa.
          </div>
          <button onClick={login}
            style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:10, background:"#fff", border:"1.5px solid #E4E9F0", borderRadius:12, padding:"13px 20px", fontSize:14, fontWeight:600, color:"#0F172A", cursor:"pointer", boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}
            onMouseEnter={e => e.currentTarget.style.boxShadow="0 4px 12px rgba(0,0,0,.1)"}
            onMouseLeave={e => e.currentTarget.style.boxShadow="0 1px 3px rgba(0,0,0,.06)"}>
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Continuar con Google
          </button>
          <p style={{ fontSize:12, color:"#9CA3AF", textAlign:"center", marginTop:16, lineHeight:1.6 }}>
            Solo usuarios autorizados pueden acceder.
          </p>
        </div>
      </div>
    </div>
  );
}
