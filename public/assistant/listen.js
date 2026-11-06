// The microphone: continuous dictation through the browser's speech
// recognition, with interim results. The interim results are what make
// barge-in work: the first words of a sentence arrive while the assistant is
// still talking, so it can stop at once instead of after the person pauses.
// (The toolkit's speech.listen block is for fixed commands and waits for the
// final result; that is too late to interrupt.)
//
// The browser ends recognition after a silence; it is started again while
// the microphone is meant to be on. After repeated errors it stops and says why.

export function createListener({ win = window, lang, onInterim = () => {}, onFinal = () => {}, onStop = () => {} } = {}) {
  const Recognition = win.SpeechRecognition || win.webkitSpeechRecognition;
  const handle = { supported: !!Recognition, listening: false, start, stop, reset };
  if (!Recognition) return handle;
  let rec = null, errors = 0, restart = 0;

  function make() {
    const r = new Recognition();
    r.continuous = true;
    r.interimResults = true;
    r.lang = lang || win.document.documentElement.lang || win.navigator.language || 'en-US';
    r.onresult = (e) => {
      let interim = '', final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t + ' '; else interim += t + ' ';
      }
      errors = 0;
      if (interim.trim()) onInterim(interim.trim());
      if (final.trim()) onFinal(final.trim());
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { stop('This site may not use the microphone.'); return; }
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (++errors >= 3) stop('Voice stopped after repeated errors. Press Voice to try again.');
    };
    r.onend = () => {
      if (!handle.listening) return;
      restart = win.setTimeout(() => { if (handle.listening) { try { rec.start(); } catch { /* starting */ } } }, 250 + Math.min(errors, 5) * 500);
    };
    return r;
  }

  function start() {
    if (handle.listening) return;
    rec = rec || make();
    handle.listening = true;
    try { rec.start(); } catch { stop('Voice could not start.'); }
  }
  function stop(why) {
    const was = handle.listening;
    handle.listening = false;
    win.clearTimeout(restart);
    try { rec?.abort(); } catch { /* already stopped */ }
    if (was) onStop(why || null);
  }
  // Drop what the recognizer has so far (an echo of the assistant) and go on listening.
  function reset() {
    if (!handle.listening) return;
    try { rec.abort(); } catch { /* fine */ }
    // onend restarts it
  }
  return handle;
}
