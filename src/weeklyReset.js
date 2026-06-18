import { doc, getDoc, setDoc, collection, getDocs, addDoc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { lastSaturdayCutoff } from "./constants";
import { buildWeeklyReportText } from "./reportBuilder";

const META_REF = doc(db, "meta", "weekState");

function completedWeekLabel(cutoffMs) {
  const end = new Date(cutoffMs); end.setHours(0,0,0,0);   // Saturday, midnight
  const start = new Date(end); start.setDate(end.getDate()-6); // Sunday 6 days earlier
  return `${start.getDate()}/${start.getMonth()+1} — ${end.getDate()}/${end.getMonth()+1}`;
}

/**
 * Runs once whenever any user (admin or supervisor) opens the app.
 * If the most recent Saturday 23:59 cutoff has passed since the last
 * recorded reset, it:
 *   1. Builds a text report of the week that just ended
 *   2. Saves it to the "reports" collection (downloadable later by admin)
 *   3. Resets every stop back to "pending" with an empty visit history
 *   4. Records the new lastReset timestamp
 *
 * Safe to call from multiple clients — it re-checks lastReset right
 * before doing the heavy work to minimize (not fully eliminate) the
 * chance of a double-run if two people open the app at the same instant.
 */
export async function checkAndRunWeeklyReset() {
  try {
    const cutoff = lastSaturdayCutoff();
    const metaSnap = await getDoc(META_REF);
    const lastReset = metaSnap.exists() ? metaSnap.data().lastReset : 0;

    if (lastReset >= cutoff) return; // already up to date, nothing to do

    // Claim the reset immediately so concurrent callers back off
    await setDoc(META_REF, { lastReset: cutoff, runningSince: Date.now() }, { merge:true });

    // Re-check after claiming, in case another client just finished it
    const recheck = await getDoc(META_REF);
    if (recheck.exists() && recheck.data().lastReset > cutoff) return;

    // Gather all supervisors + their stops
    const supSnap = await getDocs(collection(db, "supervisors"));
    const supervisors = supSnap.docs.map(d => ({ id:d.id, ...d.data() }));

    const routes = {};
    for (const sup of supervisors) {
      const stopsSnap = await getDocs(collection(db, "supervisors", sup.id, "stops"));
      routes[sup.id] = stopsSnap.docs.map(d => ({ id:d.id, ...d.data() }));
    }

    const weekLabel = completedWeekLabel(cutoff);
    const reportText = buildWeeklyReportText(supervisors, routes, weekLabel);

    await addDoc(collection(db, "reports"), {
      weekRange:   weekLabel,
      generatedAt: Date.now(),
      text:        reportText,
    });

    // Reset every stop for every supervisor
    const batch = writeBatch(db);
    let opsInBatch = 0;
    for (const sup of supervisors) {
      for (const stop of (routes[sup.id] || [])) {
        batch.update(doc(db,"supervisors",sup.id,"stops",stop.id), {
          status: "pending",
          visits: [],
          alertSent: false,
        });
        opsInBatch++;
        // Firestore batches cap at 500 ops — flush early if a huge fleet ever needs it
        if (opsInBatch >= 450) { await batch.commit(); opsInBatch = 0; }
      }
    }
    if (opsInBatch > 0) await batch.commit();

    await setDoc(META_REF, { lastReset: cutoff, runningSince: null, lastReportAt: Date.now() }, { merge:true });
  } catch (e) {
    // Never let this block app load — just log for now.
    console.error("Weekly reset check failed:", e);
  }
}
