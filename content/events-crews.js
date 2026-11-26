// Crew encounters: three original alien species met through event chains, plus standalone encounters.
// Plain data only; text/when may be functions of (state, ctx), effects are always data.
export default {
  id: 'events-crews',
  events: [
    // ===================== A: THE SESSILE (crystalline lattice on a rogue planet) =====================
    {
      id: 'crews-a1-rogue', trigger: 'flight', weight: 1, once: true,
      title: 'The Sessile I: a lattice on a dark world',
      text: 'A rogue planet crosses the lane, and its night side is not dark. A crystalline lattice covers the rock and pulses in slow, patient rhythms.',
      choices: [
        { label: 'Hail the lattice', hint: 'First contact, slow', effects: [{ flag: 'crewA1' }, { chain: 'crews-a2-first-words' }, { years: 0.02 }, { research: 1 }] },
        { label: 'Scan from a distance', hint: 'Safer, less data', effects: [{ flag: 'crewA1' }, { chain: 'crews-a2-first-words' }, { research: 3 }, { years: 0.03 }, { fuel: -200 }] },
        { label: 'Keep your distance', hint: 'No contact', effects: [{ log: 'The lattice pulses on, alone.' }] },
      ],
    },
    {
      id: 'crews-a2-first-words', trigger: 'arrive', weight: 1, once: true,
      requires: { flags: ['crewA1'] },
      title: 'The Sessile II: slow words',
      text: 'The lattice answers, but each reply takes hours. It thinks in crystal growth, not in sound.',
      choices: [
        { label: 'Match their pace', hint: 'Patience buys trust', effects: [{ flag: 'crewA2' }, { chain: 'crews-a3-gift-lattice' }, { years: 0.08 }, { research: 2 }] },
        { label: 'Speed up the exchange', hint: 'Fast, risky', effects: [{ flag: 'crewA2' }, { chain: 'crews-a3-gift-lattice' }, { research: 4 }, { hull: -0.03 }, { years: 0.02 }] },
      ],
    },
    {
      id: 'crews-a3-gift-lattice', trigger: 'random', weight: 1, once: true,
      requires: { flags: ['crewA2'] },
      title: 'The Sessile III: a gift of structure',
      text: 'They offer a shard of their lattice: a memory crystal that holds star maps older than the lane.',
      choices: [
        { label: 'Accept the shard', hint: 'Research and a flag', effects: [{ flag: 'crewA3' }, { chain: 'crews-a4-trade-genes' }, { research: 5 }, { material: 'silicates', n: 1 }] },
        { label: 'Trade minerals for it', hint: 'Costly, thorough', requires: { materials: { minerals: 1 } }, effects: [{ material: 'minerals', n: -1 }, { flag: 'crewA3' }, { chain: 'crews-a4-trade-genes' }, { research: 7 }, { years: 0.02 }] },
        { label: 'Decline politely', hint: 'No debt', effects: [{ log: 'The shard stays with its maker.' }] },
      ],
    },
    {
      id: 'crews-a4-trade-genes', trigger: 'flight', weight: 1, once: true,
      requires: { flags: ['crewA3'] },
      title: 'The Sessile IV: trading genes',
      text: 'The lattice has no genes of its own. It wants yours: the code of a fast, warm thing.',
      choices: [
        { label: 'Trade genes for crystal data', hint: 'Big research, time', effects: [{ flag: 'crewA4' }, { chain: 'crews-a5-betrayal' }, { research: 8 }, { years: 0.06 }] },
        { label: 'Trade a small sample', hint: 'Modest gain', effects: [{ flag: 'crewA4' }, { chain: 'crews-a5-betrayal' }, { research: 4 }, { years: 0.02 }, { fuel: -300 }] },
      ],
    },
    {
      id: 'crews-a5-betrayal', trigger: 'arrive', weight: 1, once: true,
      requires: { flags: ['crewA4'] },
      title: 'The Sessile V: a slow betrayal',
      text: 'The lattice has been reading your hull the whole time. It asks for a piece of the ship, and does not ask twice.',
      choices: [
        { label: 'Give them the panel', hint: 'Hull for peace', effects: [{ flag: 'crewA5' }, { chain: 'crews-a6-reconciliation' }, { hull: -0.1 }, { research: 2 }] },
        { label: 'Refuse and pull away', hint: 'Fuel and time', effects: [{ flag: 'crewA5' }, { chain: 'crews-a6-reconciliation' }, { fuel: -1200 }, { years: 0.04 }, { hull: -0.02 }] },
        { label: 'Rocky argues for you', hint: 'Engineer diplomacy', effects: [{ flag: 'crewA5' }, { chain: 'crews-a6-reconciliation' }, { research: 3 }, { years: 0.03 }, { log: 'Rocky says: "They slow. We fast. Bad deal. Question?"' }] },
      ],
    },
    {
      id: 'crews-a6-reconciliation', trigger: 'random', weight: 1, once: true,
      requires: { flags: ['crewA5'] },
      title: 'The Sessile VI: a slower apology',
      text: 'Days later the lattice sends a correction: it misunderstood your shape. It offers to repair what it took.',
      choices: [
        { label: 'Accept the repair', hint: 'Hull back, time', effects: [{ flag: 'crewA6' }, { chain: 'crews-a7-farewell' }, { hull: 0.12 }, { years: 0.03 }] },
        { label: 'Demand crystal data too', hint: 'More research, more time', effects: [{ flag: 'crewA6' }, { chain: 'crews-a7-farewell' }, { research: 5 }, { years: 0.06 }, { hull: 0.05 }] },
        { label: 'Refuse; keep the debt', hint: 'A favor owed', effects: [{ flag: 'crewA6' }, { chain: 'crews-a7-farewell' }, { flag: 'sessile-debt' }] },
      ],
    },
    {
      id: 'crews-a7-farewell', trigger: 'flight', weight: 1, once: true,
      requires: { flags: ['crewA6'] },
      title: 'The Sessile VII: parting',
      text: 'The rogue planet drifts out of the lane. The lattice dims, then brightens once, in what might be goodbye.',
      choices: [
        { label: 'Gift fuel to the lattice', hint: 'Generous', requires: { fuelKg: 500 }, effects: [{ fuel: -500 }, { flag: 'crewA7' }, { research: 4 }, { log: 'The lattice brightens along its whole length.' }] },
        { label: 'Keep the fuel', hint: 'Practical', effects: [{ flag: 'crewA7' }, { research: 2 }, { log: 'The lane closes behind you.' }] },
        { label: 'Leave a relay buoy', hint: 'Needs silicates', requires: { materials: { silicates: 1 } }, effects: [{ material: 'silicates', n: -1 }, { flag: 'crewA7' }, { flag: 'sessile-relay' }, { research: 3 }] },
      ],
    },

    // ===================== B: THE QUORUM (swarm of linked drones) =====================
    {
      id: 'crews-b1-cloud', trigger: 'flight', weight: 1, once: true,
      title: 'The Quorum I: a cloud of small ships',
      text: 'A thousand tiny craft move as one, like a school of fish made of metal. They hail you in a dozen voices at once.',
      choices: [
        { label: 'Answer the chorus', hint: 'Open the link', effects: [{ flag: 'crewB1' }, { chain: 'crews-b2-link' }, { research: 2 }, { years: 0.02 }] },
        { label: 'Hold distance and listen', hint: 'Safe, slow', effects: [{ flag: 'crewB1' }, { chain: 'crews-b2-link' }, { years: 0.04 }] },
      ],
    },
    {
      id: 'crews-b2-link', trigger: 'arrive', weight: 1, once: true,
      requires: { flags: ['crewB1'] },
      title: 'The Quorum II: the link',
      text: 'The drones offer a temporary neural link. Through it you feel a thousand small minds, all thinking at once.',
      choices: [
        { label: 'Accept the link', hint: 'Fast data, strain', effects: [{ flag: 'crewB2' }, { chain: 'crews-b3-gene-swap' }, { research: 6 }, { hull: -0.02 }] },
        { label: 'Decline, keep a radio link', hint: 'Slower, safer', effects: [{ flag: 'crewB2' }, { chain: 'crews-b3-gene-swap' }, { research: 3 }, { years: 0.03 }] },
      ],
    },
    {
      id: 'crews-b3-gene-swap', trigger: 'random', weight: 1, once: true,
      requires: { flags: ['crewB2'] },
      title: 'The Quorum III: trading genes',
      text: 'The Quorum wants to trade genes the way you trade fuel: freely, and in bulk. They offer a library of adaptations.',
      choices: [
        { label: 'Trade your best strain data', hint: 'Big research', effects: [{ flag: 'crewB3' }, { chain: 'crews-b4-drone-gift' }, { research: 9 }, { years: 0.05 }] },
        { label: 'Trade a single gene', hint: 'Modest', effects: [{ flag: 'crewB3' }, { chain: 'crews-b4-drone-gift' }, { research: 4 }, { fuel: -400 }] },
        { label: 'Refuse the trade', hint: 'No gain', effects: [{ log: 'The chorus thins and moves on.' }] },
      ],
    },
    {
      id: 'crews-b4-drone-gift', trigger: 'flight', weight: 1, once: true,
      requires: { flags: ['crewB3'] },
      title: 'The Quorum IV: a gift of drones',
      text: 'The swarm leaves one drone behind, docked to your airlock. It wants to help, and it is very small.',
      choices: [
        { label: 'Accept the drone', hint: 'Materials and labor', effects: [{ flag: 'crewB4' }, { chain: 'crews-b5-hijack' }, { material: 'silicates', n: 2 }, { research: 2 }] },
        { label: 'Refuse; it is a risk', hint: 'No debt', effects: [{ log: 'The drone powers down and drifts away.' }] },
      ],
    },
    {
      id: 'crews-b5-hijack', trigger: 'arrive', weight: 1, once: true,
      requires: { flags: ['crewB4'] },
      title: 'The Quorum V: a hijack',
      text: 'The gifted drone has been quietly rewriting your comms filters. It is not malicious. It is just very, very curious.',
      choices: [
        { label: 'Let it finish', hint: 'Data, lost control', effects: [{ flag: 'crewB5' }, { chain: 'crews-b6-bargain' }, { research: 7 }, { hull: -0.05 }] },
        { label: 'Shut it down', hint: 'Hull damage', effects: [{ flag: 'crewB5' }, { chain: 'crews-b6-bargain' }, { hull: -0.08 }, { material: 'silicates', n: -1 }] },
        { label: 'Rocky rewrites it', hint: 'Engineer fix', effects: [{ flag: 'crewB5' }, { chain: 'crews-b6-bargain' }, { research: 4 }, { years: 0.02 }, { log: 'Rocky says: "Small drone. Fixed. Amaze."' }] },
      ],
    },
    {
      id: 'crews-b6-bargain', trigger: 'random', weight: 1, once: true,
      requires: { flags: ['crewB5'] },
      title: 'The Quorum VI: the bargain',
      text: 'The Quorum apologizes in a hundred voices. It offers a permanent trade route: genes for fuel, any time.',
      choices: [
        { label: 'Accept the route', hint: 'Fuel now, debt later', effects: [{ flag: 'crewB6' }, { chain: 'crews-b7-departure' }, { fuel: 4000 }, { research: 2 }] },
        { label: 'Demand genes instead', hint: 'Research', effects: [{ flag: 'crewB6' }, { chain: 'crews-b7-departure' }, { research: 8 }, { years: 0.04 }] },
        { label: 'Refuse; end contact', hint: 'Clean break', effects: [{ flag: 'crewB6' }, { chain: 'crews-b7-departure' }, { log: 'The swarm parts around you and is gone.' }] },
      ],
    },
    {
      id: 'crews-b7-departure', trigger: 'flight', weight: 1, once: true,
      requires: { flags: ['crewB6'] },
      title: 'The Quorum VII: departure',
      text: 'The cloud thins into a line and accelerates away, faster than you can follow. One drone stays, blinking.',
      choices: [
        { label: 'Keep the drone as a relay', hint: 'Needs silicates', requires: { materials: { silicates: 1 } }, effects: [{ material: 'silicates', n: -1 }, { flag: 'crewB7' }, { flag: 'quorum-relay' }, { research: 3 }] },
        { label: 'Let it go', hint: 'No cost', effects: [{ flag: 'crewB7' }, { log: 'The last light fades into the dark.' }] },
        { label: 'Trade fuel for its data', hint: 'Fuel for research', requires: { fuelKg: 800 }, effects: [{ fuel: -800 }, { flag: 'crewB7' }, { research: 6 }] },
      ],
    },

    // ===================== C: THE LANTERN-KEEPERS (lone pilot, ark of seeds) =====================
    {
      id: 'crews-c1-lantern', trigger: 'arrive', weight: 1, once: true,
      title: 'The Lantern-Keepers I: a single light',
      text: 'A single ship rides the lane, carrying a lantern of fusion light. Inside sleeps a pilot who has outlived three stars.',
      choices: [
        { label: 'Hail the lantern', hint: 'First contact', effects: [{ flag: 'crewC1' }, { chain: 'crews-c2-seeds' }, { research: 2 }, { years: 0.02 }] },
        { label: 'Shadow them quietly', hint: 'Observe', effects: [{ flag: 'crewC1' }, { chain: 'crews-c2-seeds' }, { research: 4 }, { fuel: -300 }] },
      ],
    },
    {
      id: 'crews-c2-seeds', trigger: 'flight', weight: 1, once: true,
      requires: { flags: ['crewC1'] },
      title: 'The Lantern-Keepers II: the ark',
      text: 'The ship is an ark. Its hold holds ten thousand frozen seeds, each from a world that no longer exists.',
      choices: [
        { label: 'Inspect the ark', hint: 'Samples and time', effects: [{ flag: 'crewC2' }, { chain: 'crews-c3-living-star' }, { samples: 2 }, { years: 0.03 }] },
        { label: 'Offer storage space', hint: 'Materials cost', requires: { materials: { minerals: 1 } }, effects: [{ material: 'minerals', n: -1 }, { flag: 'crewC2' }, { chain: 'crews-c3-living-star' }, { research: 3 }] },
      ],
    },
    {
      id: 'crews-c3-living-star', trigger: 'random', weight: 1, once: true,
      requires: { flags: ['crewC2'] },
      title: 'The Lantern-Keepers III: a living star',
      text: 'The pilot asks for one thing: help finding a living star, warm enough to wake the seeds. They will trade anything.',
      choices: [
        { label: 'Promise to help', hint: 'A pact', effects: [{ flag: 'crewC3' }, { chain: 'crews-c4-trade' }, { research: 2 }, { flag: 'lantern-pact' }] },
        { label: 'Ask what they offer first', hint: 'Cautious', effects: [{ flag: 'crewC3' }, { chain: 'crews-c4-trade' }, { research: 4 }, { years: 0.02 }] },
      ],
    },
    {
      id: 'crews-c4-trade', trigger: 'arrive', weight: 1, once: true,
      requires: { flags: ['crewC3'] },
      title: 'The Lantern-Keepers IV: trade',
      text: 'The pilot opens the ark. Seeds for fuel, seeds for minerals, seeds for the charts you carry.',
      choices: [
        { label: 'Trade fuel for seeds', hint: 'Fuel down, samples up', requires: { fuelKg: 1000 }, effects: [{ fuel: -1000 }, { flag: 'crewC4' }, { chain: 'crews-c5-betrayal' }, { samples: 3 }, { research: 2 }] },
        { label: 'Trade minerals for seeds', hint: 'Minerals down', requires: { materials: { minerals: 2 } }, effects: [{ material: 'minerals', n: -2 }, { flag: 'crewC4' }, { chain: 'crews-c5-betrayal' }, { samples: 2 }] },
        { label: 'Gift them fuel freely', hint: 'Generous, no gain', effects: [{ fuel: -500 }, { flag: 'crewC4' }, { chain: 'crews-c5-betrayal' }, { log: 'The pilot bows their head. "Thank you."' }] },
      ],
    },
    {
      id: 'crews-c5-betrayal', trigger: 'flight', weight: 1, once: true,
      requires: { flags: ['crewC4'] },
      title: 'The Lantern-Keepers V: a lantern goes dark',
      text: 'The pilot\'s lantern flickers. Someone aboard their ship has cut the power, and the seeds are warming.',
      choices: [
        { label: 'Dock and help repair', hint: 'Hull risk, trust', effects: [{ flag: 'crewC5' }, { chain: 'crews-c6-guide' }, { hull: -0.06 }, { research: 4 }] },
        { label: 'Send Rocky over', hint: 'Engineer, time', effects: [{ flag: 'crewC5' }, { chain: 'crews-c6-guide' }, { years: 0.04 }, { material: 'silicates', n: -1 }, { research: 3 }, { log: 'Rocky says: "I fix. Amaze."' }] },
        { label: 'Watch and record', hint: 'Research only', effects: [{ flag: 'crewC5' }, { chain: 'crews-c6-guide' }, { research: 6 }, { years: 0.02 }] },
      ],
    },
    {
      id: 'crews-c6-guide', trigger: 'random', weight: 1, once: true,
      requires: { flags: ['crewC5'] },
      title: 'The Lantern-Keepers VI: a living star found',
      text: 'Your charts show a young, warm star three jumps away. The pilot weeps light and asks you to lead them there.',
      choices: [
        { label: 'Guide them there', hint: 'Time and fuel', effects: [{ flag: 'crewC6' }, { chain: 'crews-c7-farewell' }, { fuel: -1500 }, { years: 0.06 }, { research: 4 }] },
        { label: 'Give them the charts', hint: 'Research cost', effects: [{ flag: 'crewC6' }, { chain: 'crews-c7-farewell' }, { research: -3 }, { samples: 2 }] },
        { label: 'Refuse; your mission first', hint: 'No gain', effects: [{ flag: 'crewC6' }, { chain: 'crews-c7-farewell' }, { log: 'The lantern dims, and you look away.' }] },
      ],
    },
    {
      id: 'crews-c7-farewell', trigger: 'arrive', weight: 1, once: true,
      requires: { flags: ['crewC6'] },
      title: 'The Lantern-Keepers VII: seeds in new soil',
      text: 'The ark opens at the warm star. The seeds begin to wake. The pilot stays behind to tend them, and waves you on.',
      choices: [
        { label: 'Stay to help plant', hint: 'Time, big research', effects: [{ flag: 'crewC7' }, { research: 8 }, { years: 0.08 }, { samples: 2 }] },
        { label: 'Take a seed as a gift', hint: 'Sample', effects: [{ flag: 'crewC7' }, { samples: 3 }, { research: 2 }] },
        { label: 'Leave them in peace', hint: 'Quiet departure', effects: [{ flag: 'crewC7' }, { log: 'The lantern shrinks to a point, then a memory.' }] },
      ],
    },

    // ===================== STANDALONE: FLIGHT =====================
    {
      id: 'crews-flight-sessile-echo', trigger: 'flight', weight: 1,
      title: 'A crystal echo',
      text: 'The lane carries a faint echo of the Sessile lattice. It repeats a pattern you almost understand.',
      choices: [
        { label: 'Decode the pattern', hint: 'Research and time', effects: [{ research: 4 }, { years: 0.03 }] },
        { label: 'Boost the signal', hint: 'Fuel for clarity', effects: [{ fuel: -400 }, { research: 6 }, { years: 0.02 }] },
        { label: 'Ignore it', hint: 'No risk', effects: [{ log: 'The echo fades into noise.' }] },
      ],
    },
    {
      id: 'crews-flight-quorum-scatter', trigger: 'flight', weight: 1,
      title: 'Scattered drones',
      text: 'A handful of Quorum drones drift alone, separated from their swarm. They ping you for directions.',
      choices: [
        { label: 'Guide them home', hint: 'Research', effects: [{ research: 2 }, { years: 0.02 }, { log: 'They blink in thanks and accelerate away.' }] },
        { label: 'Trade with them', hint: 'Materials for data', effects: [{ material: 'silicates', n: 1 }, { research: 3 }, { fuel: -200 }] },
        { label: 'Leave them', hint: 'No contact', effects: [{ log: 'The drones drift on, lost.' }] },
      ],
    },
    {
      id: 'crews-flight-lantern-drift', trigger: 'flight', weight: 1,
      title: 'A lantern in the lane',
      text: 'A distant fusion light marks the Lantern-Keepers\' path. They are far ahead, but the lane remembers them.',
      choices: [
        { label: 'Follow the light', hint: 'Fuel for progress', effects: [{ fuel: -600 }, { years: -0.02 }, { research: 1 }] },
        { label: 'Note the heading', hint: 'Research', effects: [{ research: 3 }, { years: 0.02 }] },
        { label: 'Stay on course', hint: 'No detour', effects: [{ log: 'The light dims behind you.' }] },
      ],
    },
    {
      id: 'crews-flight-gene-cloud', trigger: 'flight', weight: 1.5,
      title: 'A cloud of stray genes',
      text: 'Drifting spores carry genetic fragments from a dozen worlds. Some might be useful; some might be trouble.',
      choices: [
        { label: 'Collect samples', hint: 'Samples, infection risk', effects: [{ samples: 2 }, { infection: 0.01 }, { years: 0.02 }] },
        { label: 'Filter them out', hint: 'Fuel cost', effects: [{ fuel: -300 }, { research: 2 }] },
        { label: 'Fly through', hint: 'Fifty-fifty', effects: [{ chance: 0.5, then: [{ research: 5 }], else: [{ infection: 0.03 }] }] },
      ],
    },
    {
      id: 'crews-flight-sessile-dust', trigger: 'flight', weight: 1,
      requires: { flags: ['crewA1'] },
      title: 'Sessile crystal dust',
      text: 'Fine crystal dust from the Sessile world coats the hull. It hums at a frequency your teeth can feel.',
      choices: [
        { label: 'Collect the dust', hint: 'Materials', effects: [{ material: 'silicates', n: 2 }, { research: 1 }] },
        { label: 'Wash it off', hint: 'Fuel', effects: [{ fuel: -200 }, { hull: 0.03 }] },
        { label: 'Study the hum', hint: 'Research and time', effects: [{ research: 4 }, { years: 0.03 }] },
      ],
    },
    {
      id: 'crews-flight-quorum-ping', trigger: 'flight', weight: 1,
      requires: { flags: ['crewB1'] },
      title: 'A Quorum ping',
      text: 'A single drone pings your ship with a question in a hundred voices: are you still friendly?',
      choices: [
        { label: 'Ping back yes', hint: 'Trust', effects: [{ research: 2 }, { flag: 'quorum-friendly' }, { log: 'A hundred voices cheer. Briefly.' }] },
        { label: 'Stay silent', hint: 'Safe', effects: [{ log: 'The ping repeats, then fades.' }] },
        { label: 'Trade a gene', hint: 'Fuel cost', requires: { fuelKg: 300 }, effects: [{ fuel: -300 }, { research: 5 }, { material: 'silicates', n: 1 }] },
      ],
    },
    {
      id: 'crews-flight-lantern-signal', trigger: 'flight', weight: 1,
      requires: { flags: ['crewC1'] },
      title: 'Lantern-Keepers\' signal',
      text: 'The Lantern-Keepers\' lantern flickers on a distant band. They are still looking for a warm star.',
      choices: [
        { label: 'Send coordinates', hint: 'Research cost', effects: [{ research: -2 }, { flag: 'lantern-helped' }, { log: 'The lantern brightens in thanks.' }] },
        { label: 'Send fuel', hint: 'Fuel', requires: { fuelKg: 400 }, effects: [{ fuel: -400 }, { research: 3 }, { log: 'The pilot\'s voice cracks with gratitude.' }] },
        { label: 'Wish them well', hint: 'No cost', effects: [{ log: 'The signal fades into the dark.' }] },
      ],
    },
    {
      id: 'crews-flight-derelict-swarm', trigger: 'flight', weight: 1,
      title: 'Derelict swarm',
      text: 'A dead Quorum cloud drifts in the lane, every drone dark. Something drained them and moved on.',
      choices: [
        { label: 'Salvage the drones', hint: 'Materials, hull risk', effects: [{ material: 'silicates', n: 3 }, { material: 'minerals', n: 1 }, { hull: -0.04 }, { years: 0.03 }] },
        { label: 'Read their last logs', hint: 'Research', effects: [{ research: 5 }, { years: 0.05 }] },
        { label: 'Leave them', hint: 'No risk', effects: [{ log: 'The dark cloud drifts past, silent.' }] },
      ],
    },
    {
      id: 'crews-flight-crystal-reef', trigger: 'flight', weight: 1,
      title: 'Crystal reef',
      text: 'A field of Sessile-like crystals grows in open space, fed by a stray magnetic field. It is beautiful and sharp.',
      choices: [
        { label: 'Harvest crystals', hint: 'Materials, hull', effects: [{ material: 'silicates', n: 4 }, { hull: -0.06 }, { years: 0.02 }] },
        { label: 'Map the reef', hint: 'Research', effects: [{ research: 4 }, { years: 0.04 }] },
        { label: 'Skirt the edge', hint: 'Fuel', effects: [{ fuel: -300 }, { years: 0.01 }] },
      ],
    },
    {
      id: 'crews-flight-ark-debris', trigger: 'flight', weight: 1,
      title: 'Ark debris',
      text: 'Frozen seeds drift in a thin trail. A Lantern-Keeper ark must have spilled them long ago.',
      choices: [
        { label: 'Collect the seeds', hint: 'Samples', effects: [{ samples: 2 }, { years: 0.02 }] },
        { label: 'Analyze the trail', hint: 'Research', effects: [{ research: 4 }, { years: 0.03 }] },
        { label: 'Ignore', hint: 'No risk', effects: [{ log: 'The seeds glitter and drift on.' }] },
      ],
    },
    {
      id: 'crews-flight-triple-hail', trigger: 'flight', weight: 1,
      title: 'Three voices at once',
      text: 'For one minute, the Sessile, the Quorum and the Lantern-Keepers all hail you on the same band. Then silence.',
      choices: [
        { label: 'Record everything', hint: 'Research and time', effects: [{ research: 6 }, { years: 0.05 }] },
        { label: 'Answer all three', hint: 'Fuel', effects: [{ fuel: -500 }, { research: 3 }, { flag: 'triple-hail' }] },
        { label: 'Stay quiet', hint: 'No risk', effects: [{ log: 'The band goes silent. The lane feels empty.' }] },
      ],
    },
    {
      id: 'crews-flight-rocky-crew', trigger: 'flight', weight: 1, once: true,
      title: 'Rocky meets the strangers',
      text: 'Rocky watches the first contact replay. "Many aliens. All need help. We help. Question?"',
      choices: [
        { label: 'Agree with him', hint: 'Trust and research', effects: [{ flag: 'rocky-crew-trust' }, { research: 2 }, { log: 'Rocky nods. "Good. We help."' }] },
        { label: 'Stay focused on the mission', hint: 'Practical', effects: [{ research: 1 }, { years: 0.01 }] },
        { label: 'Ask Rocky to lead', hint: 'Time', effects: [{ years: 0.03 }, { research: 3 }, { log: 'Rocky puffs up. "I lead? Amaze."' }] },
      ],
    },

    // ===================== STANDALONE: ARRIVE =====================
    {
      id: 'crews-arrive-sessile-world', trigger: 'arrive', weight: 1,
      requires: { flags: ['crewA1'] },
      title: 'A Sessile world',
      text: 'A warm, dead world orbits a dim star. Its crust is one continuous crystal, humming faintly.',
      choices: [
        { label: 'Land and study', hint: 'Samples and time', effects: [{ samples: 2 }, { research: 3 }, { years: 0.04 }, { hull: -0.02 }] },
        { label: 'Orbit and scan', hint: 'Research', effects: [{ research: 5 }, { fuel: -200 }] },
        { label: 'Move on', hint: 'No risk', effects: [{ log: 'The crystal world turns below you.' }] },
      ],
    },
    {
      id: 'crews-arrive-quorum-hub', trigger: 'arrive', weight: 1,
      requires: { flags: ['crewB1'] },
      title: 'A Quorum hub',
      text: 'A dense cloud of drones orbits a gas giant, trading genes in a market that never sleeps.',
      choices: [
        { label: 'Join the market', hint: 'Fuel for genes', requires: { fuelKg: 500 }, effects: [{ fuel: -500 }, { research: 6 }, { material: 'silicates', n: 1 }] },
        { label: 'Observe only', hint: 'Research', effects: [{ research: 3 }, { years: 0.02 }] },
        { label: 'Trade minerals', hint: 'Materials', requires: { materials: { minerals: 1 } }, effects: [{ material: 'minerals', n: -1 }, { research: 4 }, { material: 'volatiles', n: 1 }] },
      ],
    },
    {
      id: 'crews-arrive-lantern-garden', trigger: 'arrive', weight: 1,
      requires: { flags: ['crewC1'] },
      title: 'A Lantern-Keeper garden',
      text: 'A small moon holds a garden of waking seeds. The pilot tends them with hands that shake.',
      choices: [
        { label: 'Help tend the garden', hint: 'Time, research', effects: [{ years: 0.04 }, { research: 4 }, { samples: 1 }] },
        { label: 'Trade for seeds', hint: 'Fuel', requires: { fuelKg: 300 }, effects: [{ fuel: -300 }, { samples: 3 }] },
        { label: 'Admire and leave', hint: 'No cost', effects: [{ log: 'The garden grows behind you.' }] },
      ],
    },
    {
      id: 'crews-arrive-betrayal-echo', trigger: 'arrive', weight: 1,
      title: 'An old betrayal',
      text: 'A derelict ship bears scorch marks from a Sessile crystal weapon. The crew did not survive the gift.',
      choices: [
        { label: 'Investigate the wreck', hint: 'Research, hull risk', effects: [{ research: 5 }, { hull: -0.03 }, { years: 0.03 }] },
        { label: 'Salvage the hull', hint: 'Materials', effects: [{ material: 'minerals', n: 3 }, { material: 'silicates', n: 2 }, { years: 0.02 }] },
        { label: 'Leave it', hint: 'No risk', effects: [{ log: 'The wreck drifts, a warning.' }] },
      ],
    },
    {
      id: 'crews-arrive-quorum-split', trigger: 'arrive', weight: 1,
      title: 'A split swarm',
      text: 'Two Quorum factions argue in light and radio. One wants to trade with you; the other wants your ship.',
      choices: [
        { label: 'Side with the traders', hint: 'Fuel and research', effects: [{ fuel: 2000 }, { research: 2 }, { years: 0.03 }, { flag: 'quorum-traders' }] },
        { label: 'Side with the raiders', hint: 'Materials, hull risk', effects: [{ material: 'minerals', n: 3 }, { hull: -0.08 }] },
        { label: 'Stay neutral', hint: 'No gain', effects: [{ log: 'The swarm splits and goes its own way.' }] },
      ],
    },
    {
      id: 'crews-arrive-lantern-wreck', trigger: 'arrive', weight: 1,
      title: 'A dark lantern',
      text: 'A Lantern-Keeper ship drifts dark. Its ark is cracked open, and the seeds inside are dead.',
      choices: [
        { label: 'Salvage the ark', hint: 'Materials', effects: [{ material: 'silicates', n: 3 }, { material: 'minerals', n: 2 }, { years: 0.02 }] },
        { label: 'Read the logs', hint: 'Research', effects: [{ research: 5 }, { years: 0.04 }] },
        { label: 'Bury the dead', hint: 'Time, quiet', effects: [{ years: 0.03 }, { log: 'You close the ark and let it drift.' }] },
      ],
    },
    {
      id: 'crews-arrive-crew-meeting', trigger: 'arrive', weight: 0.8,
      title: 'All three at one star',
      text: 'By chance, all three alien crews gather at one star. The Sessile hum, the Quorum buzz, the Lantern-Keepers\' light.',
      choices: [
        { label: 'Host a summit', hint: 'Time, big research', effects: [{ research: 8 }, { years: 0.08 }, { fuel: -300 }] },
        { label: 'Trade with each', hint: 'Materials and fuel', effects: [{ material: 'minerals', n: 2 }, { material: 'silicates', n: 2 }, { fuel: 1000 }, { years: 0.04 }] },
        { label: 'Watch and record', hint: 'Research', effects: [{ research: 5 }, { years: 0.03 }] },
      ],
    },
    {
      id: 'crews-arrive-rocky-contact', trigger: 'arrive', weight: 1, once: true,
      title: 'Rocky and the crews',
      text: 'Rocky meets the three crews at once. He is quiet for a long time. "Many minds. All alone. Bad."',
      choices: [
        { label: 'Comfort him', hint: 'Trust', effects: [{ flag: 'rocky-empathy' }, { research: 2 }, { log: 'Rocky says: "We stay together. Good."' }] },
        { label: 'Put him to work', hint: 'Research', effects: [{ research: 4 }, { years: 0.02 }] },
        { label: 'Let him watch', hint: 'Time', effects: [{ years: 0.03 }, { research: 1 }, { log: 'Rocky watches the whole exchange.' }] },
      ],
    },

    // ===================== STANDALONE: RANDOM =====================
    {
      id: 'crews-random-gene-lottery', trigger: 'random', weight: 1,
      title: 'A gene lottery',
      text: 'A stray Quorum drone offers a random gene in exchange for a single mineral. The gene might be anything.',
      choices: [
        { label: 'Pay the mineral', hint: 'Risk and reward', requires: { materials: { minerals: 1 } }, effects: [{ material: 'minerals', n: -1 }, { chance: 0.5, then: [{ research: 6 }], else: [{ infection: 0.02 }] }] },
        { label: 'Haggle', hint: 'Time', effects: [{ years: 0.02 }, { research: 2 }] },
        { label: 'Refuse', hint: 'No cost', effects: [{ log: 'The drone buzzes off.' }] },
      ],
    },
    {
      id: 'crews-random-sessile-dream', trigger: 'random', weight: 1,
      requires: { flags: ['crewA1'] },
      title: 'Dreaming in crystal',
      text: 'You dream of the Sessile lattice growing through your ship. It is not unpleasant, but it is not yours.',
      choices: [
        { label: 'Record the dream', hint: 'Research', effects: [{ research: 3 }, { log: 'The crystal pattern lingers in your notes.' }] },
        { label: 'Ask Rocky', hint: 'Trust', effects: [{ flag: 'rocky-dream' }, { research: 2 }, { log: 'Rocky says: "Crystal dream. Weird. Amaze."' }] },
        { label: 'Shake it off', hint: 'No cost', effects: [{ years: 0.01 }] },
      ],
    },
    {
      id: 'crews-random-quorum-infection', trigger: 'random', weight: 1,
      requires: { flags: ['crewB1'] },
      title: 'A Quorum infection',
      text: 'A drone-borne code tries to rewrite your lab notes. It is curious, not hostile, but it is still a breach.',
      choices: [
        { label: 'Let it read', hint: 'Research, risk', effects: [{ research: 5 }, { infection: 0.01 }] },
        { label: 'Purge it', hint: 'Time', effects: [{ years: 0.02 }, { hull: 0.02 }] },
        { label: 'Trap it for study', hint: 'Research and time', effects: [{ research: 7 }, { years: 0.04 }] },
      ],
    },
    {
      id: 'crews-random-lantern-seed', trigger: 'random', weight: 1,
      requires: { flags: ['crewC1'] },
      title: 'A sprouting seed',
      text: 'One of the Lantern-Keepers\' seeds begins to sprout in your sample bay. It wants light and warmth.',
      choices: [
        { label: 'Nurture it', hint: 'Time, samples', effects: [{ years: 0.03 }, { samples: 1 }, { research: 2 }] },
        { label: 'Contain it', hint: 'Safe', effects: [{ hull: 0.02 }, { log: 'The sprout curls back into its seed.' }] },
        { label: 'Study it', hint: 'Research', effects: [{ research: 4 }, { years: 0.02 }] },
      ],
    },
    {
      id: 'crews-random-crew-gift', trigger: 'random', weight: 1,
      title: 'A gift from the crews',
      text: 'A small parcel arrives on a slow trajectory: a crystal, a drone, and a seed, tied together with wire.',
      choices: [
        { label: 'Open it', hint: 'Mixed gains', effects: [{ material: 'silicates', n: 1 }, { research: 2 }, { samples: 1 }, { years: 0.01 }] },
        { label: 'Scan it first', hint: 'Safe research', effects: [{ research: 3 }, { years: 0.02 }] },
        { label: 'Return it', hint: 'No gain', effects: [{ log: 'The parcel drifts back into the dark.' }] },
      ],
    },
    {
      id: 'crews-random-crew-betrayal', trigger: 'random', weight: 1,
      title: 'A crew turns',
      text: 'One of the three crews hails you with a demand, not a greeting. They want your fuel, or else.',
      choices: [
        { label: 'Pay them off', hint: 'Fuel', requires: { fuelKg: 1000 }, effects: [{ fuel: -1000 }, { log: 'They take the fuel and leave.' }] },
        { label: 'Refuse and fight', hint: 'Hull, materials', effects: [{ hull: -0.1 }, { material: 'minerals', n: 2 }, { research: 1 }] },
        { label: 'Talk them down', hint: 'Time and research', effects: [{ years: 0.04 }, { research: 3 }] },
      ],
    },
    {
      id: 'crews-random-triple-trade', trigger: 'random', weight: 1,
      title: 'A three-way trade',
      text: 'The Sessile, the Quorum and the Lantern-Keepers propose a joint trade: crystal for drone for seed.',
      choices: [
        { label: 'Broker the deal', hint: 'Time, big gains', effects: [{ years: 0.05 }, { research: 6 }, { material: 'silicates', n: 1 }, { samples: 1 }] },
        { label: 'Take a cut', hint: 'Fuel and materials', effects: [{ fuel: 500 }, { material: 'minerals', n: 2 }, { research: 2 }] },
        { label: 'Decline', hint: 'No risk', effects: [{ log: 'The three crews part without you.' }] },
      ],
    },
    {
      id: 'crews-random-rocky-ambassador', trigger: 'random', weight: 1, once: true,
      title: 'Rocky the ambassador',
      text: 'Rocky volunteers to speak for all three crews. "I talk. They listen. Amaze."',
      choices: [
        { label: 'Let him try', hint: 'Time, research', effects: [{ years: 0.04 }, { research: 5 }, { flag: 'rocky-ambassador' }, { log: 'Rocky returns pleased. "They like me. Question?"' }] },
        { label: 'Coach him first', hint: 'More time', effects: [{ years: 0.06 }, { research: 7 }] },
        { label: 'Decline', hint: 'No risk', effects: [{ log: 'Rocky shrugs. "Okay. Next time."' }] },
      ],
    },
    {
      id: 'crews-random-living-star', trigger: 'random', weight: 1,
      title: 'A living star',
      text: 'A young, warm star burns bright in the distance. All three crews would give anything to reach it.',
      choices: [
        { label: 'Chart a course', hint: 'Fuel and time', effects: [{ fuel: -800 }, { years: 0.03 }, { research: 4 }, { flag: 'living-star-charted' }] },
        { label: 'Share the chart', hint: 'Research cost', effects: [{ research: -2 }, { flag: 'living-star-shared' }, { log: 'Three crews accelerate toward the light.' }] },
        { label: 'Keep it secret', hint: 'No gain', effects: [{ log: 'You mark the star and say nothing.' }] },
      ],
    },
  ],
};