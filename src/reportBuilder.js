import { STATUS } from "./constants";

export function buildWeeklyReportText(supervisors, routes, weekRangeLabel) {
  let t = `REPORTE SEMANAL — KOSHER SHEVET AHIM\nSemana: ${weekRangeLabel}\n\n`;
  supervisors.forEach(sup => {
    const stops = routes[sup.id] || [];
    const done  = stops.filter(s => s.status === "done").length;
    t += `SUPERVISOR: ${sup.name}\nCompletadas: ${done}/${stops.length}\n\n`;
    stops.forEach(stop => {
      t += `  ESTABLECIMIENTO: ${stop.place} (${stop.address})\n`;
      t += `  Estado: ${STATUS[stop.status]?.label || stop.status}\n`;
      (stop.visits || []).forEach((v, i) => {
        t += `  Visita ${i+1} [${v.date||"—"}]: Entrada ${v.checkIn||"—"}${v.checkInEdited?" ⚠️EDITADO":""} Salida ${v.checkOut||"—"}${v.checkOutEdited?" ⚠️EDITADO":""}\n`;
        if (v.status === "closed") t += `    🔒 ESTABLECIMIENTO CERRADO EN ESTA VISITA\n`;
        if (v.checklist) {
          const ok  = v.checklist.filter(c=>c.result==="ok").map(c=>c.label).join(", ");
          const bad = v.checklist.filter(c=>c.result==="issue").map(c=>`${c.label}${c.note?": "+c.note:""}`).join(", ");
          if (ok)  t += `    ✅ OK: ${ok}\n`;
          if (bad) t += `    ❌ Problemas: ${bad}\n`;
        }
        if (v.generalNotes) t += `    📝 Notas: ${v.generalNotes}\n`;
      });
      t += "\n";
    });
    t += "\n";
  });
  return t;
}
