// The assistant's voice. Google's speech model when the page can reach one
// (a pleasant voice, through the server or a browser-kept key), otherwise the
// toolkit's speech block with the best voice this browser has. Either way one
// reply at a time, the profile's speaking rate, and stop() at any moment.
//
// A reply is spoken in pieces: the first sentence is requested on its own so
// it starts sooner, and the rest follows. Audio for each piece is cached, so
// a repeated "Okay." costs nothing.

const CACHE_MAX = 60;

// Sentences, grouped: the first on its own, then up to ~320 characters each.
export function pieces(text) {
  // A sentence ends at . ! or ? followed by a space or the end, so $8.49 stays whole.
  const sentences = String(text).match(/[\s\S]+?[.!?]+["')\]]*(?=\s|$)|[\s\S]+$/g)?.map((x) => x.trim()).filter(Boolean) || [];
  if (!sentences.length) return [];
  const out = [sentences[0]];
  let cur = '';
  for (const s of sentences.slice(1)) {
    if (cur && cur.length + s.length > 320) { out.push(cur); cur = ''; }
    cur += (cur ? ' ' : '') + s;
  }
  if (cur) out.push(cur);
  return out;
}

// Raw 16-bit PCM (what older speech models return) wrapped as a WAV file.
function wav(pcm, rate = 24000) {
  const h = new ArrayBuffer(44), v = new DataView(h);
  const str = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + pcm.byteLength, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, pcm.byteLength, true);
  return new Blob([h, pcm], { type: 'audio/wav' });
}
function toBlob({ mimeType, data }) {
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  if (/wav|mpeg|mp3|ogg|webm/.test(mimeType)) return new Blob([bytes], { type: mimeType.split(';')[0] });
  const rate = Number(/rate=(\d+)/.exec(mimeType)?.[1]) || 24000;
  return wav(bytes.buffer, rate);
}

// The best of the browser's own voices for the fallback: a natural one if
// there is any, else a well-known good one, else any English voice.
export function bestBrowserVoice(win = window) {
  const voices = win.speechSynthesis?.getVoices?.() || [];
  const en = voices.filter((v) => /^en/i.test(v.lang));
  const pick = (re) => en.find((v) => re.test(v.name));
  const v = pick(/natural|neural|premium|enhanced/i) || pick(/Google US English|Samantha|Karen|Daniel|Moira/i) || en.find((v) => /US/i.test(v.lang)) || en[0];
  return v ? v.name : null;
}

/**
 * @param {object} o
 * @param {object} o.session  the toolkit blocks session (s.speech.say for the fallback)
 * @param {(text: string) => Promise<{mimeType: string, data: string}|null>} o.synth  the speech model; null means "none here"
 * @param {() => number} o.rate  the speaking rate, from the profile
 * @param {(on: boolean) => void} [o.onWait]  called while audio is being fetched for the first piece
 * @param {(on: boolean) => void} [o.onSpeaking]  called when speech starts and ends
 */
export function createSpeaker({ session: s, synth, rate = () => 1, onWait = () => {}, onSpeaking = () => {}, win = window }) {
  const cache = new Map(); // text → blob URL
  let current = null;      // the reply being spoken

  async function audioFor(text) {
    if (cache.has(text)) return cache.get(text);
    const got = await synth(text);
    if (!got) return null;
    const url = URL.createObjectURL(toBlob(got));
    cache.set(text, url);
    if (cache.size > CACHE_MAX) { const [k, v] = cache.entries().next().value; URL.revokeObjectURL(v); cache.delete(k); }
    return url;
  }

  function say(text) {
    stop();
    const parts = pieces(text);
    let state = 'fetching', audio = null, fallback = null;
    let resolveDone;
    const done = new Promise((r) => { resolveDone = r; });
    const handle = {
      get speaking() { return state !== 'done'; },
      text,
      done,
      stop() {
        if (state === 'done') return;
        state = 'done';
        if (audio) { audio.pause(); audio.src = ''; }
        fallback?.stop();
        onWait(false); onSpeaking(false);
        resolveDone(true);
      },
    };
    current = handle;
    if (!parts.length) { handle.stop(); return handle; }

    const useFallback = () => {
      if (state === 'done') return;
      onWait(false);
      fallback = s.speech.say(text, { voice: bestBrowserVoice(win), speechRate: rate() });
      if (!fallback.supported) { handle.stop(); return; }
      state = 'playing'; onSpeaking(true);
      fallback.done.then(() => { if (state !== 'done') { state = 'done'; onSpeaking(false); resolveDone(true); } });
    };

    (async () => {
      onWait(true);
      // Fetch every piece, in order, while playing the ones that are ready.
      const urls = parts.map((p) => audioFor(p).catch(() => null));
      const first = await urls[0];
      if (state === 'done') return;
      if (!first) { useFallback(); return; }
      onWait(false);
      state = 'playing'; onSpeaking(true);
      for (let i = 0; i < parts.length; i++) {
        const url = await urls[i];
        if (state === 'done') return;
        if (!url) break; // a later piece failed: stop quietly rather than switch voices mid-reply
        await new Promise((resolve) => {
          audio = new win.Audio(url);
          audio.playbackRate = Math.max(0.5, Math.min(2, rate() || 1));
          audio.onended = resolve; audio.onerror = resolve;
          audio.play().catch(resolve);
        });
      }
      if (state !== 'done') { state = 'done'; onSpeaking(false); resolveDone(true); }
    })();
    return handle;
  }

  function stop() { current?.stop(); current = null; }
  return { say, stop, get speaking() { return !!current?.speaking; }, get current() { return current; } };
}
