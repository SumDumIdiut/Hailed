// Music and sound effects were removed from the game (user request, 2026-11-20). Only Rocky's laptop TTS (tts.js) makes sound.
// `silent()` keeps the old music/sfx API working for every caller: any method call is a no-op that returns a harmless handle.
export function silent() {
  const handle = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => 0 : handle), apply: () => handle });
  return new Proxy({}, { get: (_, k) => (k === 'then' ? undefined : handle) });
}
