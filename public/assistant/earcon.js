// Earcons: small sounds with no words. A rising two-note chime when the
// assistant starts waiting on the model, a soft tick while it waits, and a
// short falling note when it stops. Made with the Web Audio API, so there is
// nothing to download. Quiet by design.
export function createEarcon({ win = window } = {}) {
  let ctx = null, timer = 0, waiting = false;
  const audio = () => {
    if (!ctx) { const AC = win.AudioContext || win.webkitAudioContext; if (!AC) return null; ctx = new AC(); }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  };
  // One soft note: a sine with a quick fade in and out.
  function note(freq, at, length = 0.09, gain = 0.06) {
    const c = audio(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(gain, at + 0.015); g.gain.linearRampToValueAtTime(0, at + length);
    o.connect(g).connect(c.destination);
    o.start(at); o.stop(at + length + 0.02);
  }
  function start() {
    if (waiting) return;
    waiting = true;
    const c = audio(); if (!c) return;
    note(523, c.currentTime); note(659, c.currentTime + 0.11);               // "thinking"
    timer = win.setInterval(() => { const c2 = audio(); if (c2) note(880, c2.currentTime, 0.05, 0.03); }, 1400); // still waiting
  }
  function stop({ done = true } = {}) {
    if (!waiting) return;
    waiting = false;
    win.clearInterval(timer);
    const c = audio(); if (c && done) note(659, c.currentTime, 0.07, 0.04);  // "here it is"
  }
  return { start, stop, get waiting() { return waiting; } };
}
