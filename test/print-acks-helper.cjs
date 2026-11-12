// print-acks-helper.cjs — since 2026-11-12 the printed sheet (#print-form) renders only once every
// red alert on screen is ticked (calculator.jsx printReady). A harness that reads the sheet to check
// its figures ticks them first, as the doctor or nurse would; one that checks the gate itself
// (verify-print-one-page-1102.cjs §1t) reads #print-form directly instead.
const { act } = require('react');
function tickRedAlerts(root) {
  const doc = root.ownerDocument || root;
  const win = doc.defaultView;
  const boxes = [...root.querySelectorAll('.print-ack input[type=checkbox]')].filter(b => !b.checked);
  if (!boxes.length) return;
  act(() => { boxes.forEach(b => b.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))); });
}
// The sheet as the ward would print it: the red alerts ticked, then #print-form.
function printFormTicked(root) {
  tickRedAlerts(root);
  return root.querySelector('#print-form');
}
module.exports = { tickRedAlerts, printFormTicked };
