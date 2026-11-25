// Rocky's voice for the UI is now the laptop's plain espeak-ng TTS (src/audio/tts.js), played through the shared voice bus.
export { speak, stop, isSpeaking, onProgress, duration, getDuration } from '../audio/tts.js';
