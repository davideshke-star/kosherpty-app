export const APP_NAME    = "Kosher Shevet Ahim";
export const APP_SUB     = "Gestión de Rutas";
export const ADMIN_EMAIL = "davideshke@gmail.com";

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

export const CHECKLIST_ITEMS = [
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
];

export const STATUS = {
  pending:       { label:"Pendiente",  color:"#9CA3AF" },
  today:         { label:"Para hoy",   color:"#1D4ED8" },
  "in-progress": { label:"En curso",  color:"#D97706" },
  done:          { label:"Completado", color:"#059669" },
  closed:        { label:"Cerrado",    color:"#DC2626" },
  skipped:       { label:"Omitido",    color:"#9CA3AF" },
};

export const DAYS    = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
export const nowStr  = () => new Date().toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"});
export const dateStr = () => new Date().toLocaleDateString("es-MX",{day:"2-digit",month:"2-digit",year:"numeric"});
export const todayFull = () => new Date().toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"long"});
export const weekRange = () => {
  const d=new Date(), dy=d.getDay(), diff=d.getDate()-dy+(dy===0?-6:1);
  const mon=new Date(d); mon.setDate(diff);
  const fri=new Date(mon); fri.setDate(mon.getDate()+4);
  return `${mon.getDate()}/${mon.getMonth()+1} — ${fri.getDate()}/${fri.getMonth()+1}`;
};
export const todayName = () => DAYS[new Date().getDay()===0?6:new Date().getDay()-1];
export const todayISO  = () => new Date().toISOString().split("T")[0];
export const initials  = n => (n||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
export const minAgo    = t => {
  if(!t) return 0;
  const [h,m]=t.split(":").map(Number), now=new Date(), then=new Date();
  then.setHours(h,m,0,0);
  return Math.floor((now-then)/60000);
};
export const btn = (ex={}) => ({
  border:"none", cursor:"pointer", fontFamily:"'DM Sans',sans-serif",
  fontWeight:600, borderRadius:10, transition:"all .15s", ...ex
});
