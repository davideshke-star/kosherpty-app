export const APP_NAME    = "Kosher Shevet Ahim";
export const APP_SUB     = "Gestión de Rutas";
export const ADMIN_EMAIL = "davideshke@gmail.com";
// Public production URL — QR codes always point here so a printed QR opens the
// live app no matter where it was generated or who scans it.
export const APP_URL     = "https://kosherpty-app.vercel.app";

export const COLORS = ["#1D4ED8","#059669","#D97706","#DC2626","#7C3AED","#0891B2","#DB2777","#65A30D"];

export const C = {
  bg:           "#F4F6F9",
  surface:      "#FFFFFF",
  border:       "#E4E9F0",
  primary:      "#1D4ED8",
  primaryLight: "#EFF6FF",
  success:      "#059669",
  successLight: "#ECFDF5",
  warning:      "#D97706",
  warningLight: "#FFFBEB",
  danger:       "#DC2626",
  dangerLight:  "#FEF2F2",
  purple:       "#7C3AED",
  text:         "#0F172A",
  muted:        "#6B7280",
  subtle:       "#9CA3AF",
  shadow:       "0 1px 3px rgba(0,0,0,.06)",
  shadowMd:     "0 4px 12px rgba(0,0,0,.08)",
};

// Default checklist — seeded into Firestore (settings/checklist) on first run.
// After that, the live source of truth is Firestore, editable by the admin.
export const DEFAULT_CHECKLIST_ITEMS = [
  { id:"tolaim",         label:"Tolaim",                               icon:"🔍" },
  { id:"jala",           label:"Hafrashat Jalá",                       icon:"🍞" },
  { id:"hornoBishul",    label:"Bishul Horno",                         icon:"🔥" },
  { id:"estufaBishul",   label:"Bishul Estufa",                        icon:"🍳" },
  { id:"sefaradiBishul", label:"Bishul Sefaradí",                      icon:"🫕" },
  { id:"freidora",       label:"Bishul Freidora o Plancha",            icon:"🥘" },
  { id:"pescados",       label:"Pescados",                             icon:"🐟" },
  { id:"separacion",     label:"Separación Leche/Carne/Parve/Pescado", icon:"⚖️" },
  { id:"mashgiaj",       label:"Mashgiaj",                             icon:"👁"  },
  { id:"ingredientes",   label:"Ingredientes",                         icon:"📦" },
  { id:"camaras",        label:"Cámaras funcionales",                  icon:"📷" },
  { id:"candados",       label:"Candados funcionales",                 icon:"🔐" },
];

// Status definitions. "closed" is transient — the moment a visit is marked
// closed, the parent stop reverts to "pending" so it can be reattempted and
// is never counted as completed.
export const STATUS = {
  pending:       { label:"Pendiente",  color:"#9CA3AF" },
  today:         { label:"Para hoy",   color:"#1D4ED8" },
  "in-progress": { label:"En curso",  color:"#D97706" },
  done:          { label:"Completado", color:"#059669" },
  closed:        { label:"Cerrado",    color:"#DC2626" },
};

// Week now runs Sunday → Saturday. JS getDay() already returns 0 for Sunday
// through 6 for Saturday, which lines up perfectly with this array.
export const DAYS = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];

export const nowStr    = () => new Date().toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit",hour12:true});
export const dateStr   = () => new Date().toLocaleDateString("es-MX",{day:"2-digit",month:"2-digit",year:"numeric"});
export const todayFull = () => new Date().toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"long"});

export const todayName = () => DAYS[new Date().getDay()];
export const todayISO  = () => {
  const d = new Date();
  // Use LOCAL date (not UTC) so Panama (UTC-5) never rolls to next day at night
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

// Sunday-Saturday range containing "today"
export const weekRange = () => {
  const d = new Date();
  const day = d.getDay(); // 0=Sun..6=Sat
  const sun = new Date(d); sun.setDate(d.getDate() - day);
  const sat = new Date(sun); sat.setDate(sun.getDate() + 6);
  return `${sun.getDate()}/${sun.getMonth()+1} — ${sat.getDate()}/${sat.getMonth()+1}`;
};

// The most recent Saturday 23:59:59 timestamp (ms) at or before "now".
// Used to decide whether a weekly reset is due.
export const lastSaturdayCutoff = () => {
  const d = new Date();
  const day = d.getDay(); // 0=Sun..6=Sat
  const daysSinceSat = (day + 1) % 7; // Sat->0, Sun->1, Mon->2 ... Fri->6
  const cutoff = new Date(d);
  cutoff.setDate(d.getDate() - daysSinceSat);
  cutoff.setHours(23,59,59,999);
  if (cutoff.getTime() > d.getTime()) cutoff.setDate(cutoff.getDate() - 7);
  return cutoff.getTime();
};

export const initials = n => (n||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
export const minAgo = t => {
  if(!t) return 0;
  // Robust to "HH:MM" (24h) and "H:MM a.m./p.m." (12h) — the app now stores 12h.
  const match = String(t).match(/(\d{1,2}):(\d{2})/);
  if(!match) return 0;
  let h = parseInt(match[1],10);
  const m = parseInt(match[2],10);
  const lower = String(t).toLowerCase();
  if(lower.includes("p") && h < 12) h += 12;      // p.m.
  if(lower.includes("a") && h === 12) h = 0;       // 12 a.m. → 0
  const now=new Date(), then=new Date();
  then.setHours(h,m,0,0);
  return Math.floor((now-then)/60000);
};

export const btn = (ex={}) => ({
  border:"none", cursor:"pointer", fontFamily:"'DM Sans',sans-serif",
  fontWeight:600, borderRadius:10, transition:"all .15s", ...ex
});
