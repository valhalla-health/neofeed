// never-sunday.cjs — required first by a harness that mounts the Calculator or the
// app on the real clock. Not a harness itself (CI runs test/verify-*.cjs only).
//
// On a Sunday in Bangkok the TPN order is held for the weekly length and head
// circumference (data.js sundayGrowthHolds, Pp 2026-11-22), and Submit asks for a
// reason first. A harness that types an order for "today" and answers the
// critical-value prompt would then answer the growth prompt instead and fail, on
// Sundays only (verify-calc-clicks.cjs, 2026-11-22). So on a real Sunday this
// process runs on the Monday, at the same time of day, as review-0917-boot.cjs
// does for the app. Forward, not back: a run started late on Sunday cannot cross
// midnight into another Sunday. A harness that wants Sunday moves there on purpose
// (verify-growth-gate-1122.cjs).
const RealDate = Date;
const bkkDay = new RealDate(RealDate.now() + 7 * 3600e3).getUTCDay();
if (bkkDay === 0 && !RealDate.__neverSunday) {
  const shift = 24 * 3600e3;
  class MondayDate extends RealDate {
    constructor(...args) { if (args.length === 0) super(RealDate.now() + shift); else super(...args); }
    static now() { return RealDate.now() + shift; }
  }
  MondayDate.__neverSunday = true;
  global.Date = MondayDate;
}
module.exports = { shifted: bkkDay === 0 };
