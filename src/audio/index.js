// Audio entry point. Music and sound effects are removed (silent no-op stubs); only Rocky's voice plays.
// (title button + HUD speaker + M to mute), the automatic UI click / hover sounds, and starts audio on the first user gesture.
import * as bus from './bus.js';
import { sfx } from './sfx.js';
import { music } from './music.js';
import './panel.js';

sfx.attachUI();
export { bus, sfx, music };
