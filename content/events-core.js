// The core content pack: original events for Astrophage-powered relativistic travel.
// Plain data only; text/when may be functions of (state, ctx), effects are always data so saves stay JSON.
export default {
  id: 'core',
  events: [
    // ---- flight: hazards and windfalls ---------------------------------------
    {
      id: 'micrometeor-swarm', trigger: 'flight', weight: 3,
      title: 'Pebble storm',
      text: 'A swarm of gravel crosses the lane at a fair fraction of c. Every pebble is a bullet.',
      choices: [
        { label: 'Hide behind the shield', hint: 'No time lost, some hull damage', effects: [{ hull: -0.07 }, { log: 'The shield rings like a bell.' }] },
        { label: 'Burn around the swarm', hint: 'Fuel for a clean hull', effects: [{ fuel: -900 }, { years: 0.01 }] },
      ],
    },
    {
      id: 'astrophage-cloud', trigger: 'flight', weight: 3,
      title: 'A dark cloud on the lane',
      text: 'A free-floating Astrophage cloud glows just off the trajectory. The tanks could take a drink.',
      choices: [
        { label: 'Skim the cloud', hint: 'Lots of fuel, a little hull', effects: [{ fuel: 9000 }, { hull: -0.05 }, { years: 0.02 }] },
        { label: 'Keep a clean course', hint: 'Spend fuel to stay clear', effects: [{ fuel: -400 }] },
      ],
    },
    {
      id: 'cosmic-ray-storm', trigger: 'flight', weight: 2,
      title: 'Cosmic-ray storm',
      text: 'The counters chatter. A wave of high-energy particles is sweeping the ship from behind.',
      choices: [
        { label: 'Dig into the water shield', hint: 'Fuel for the extra mass', effects: [{ fuel: -1200 }, { years: 0.01 }] },
        { label: 'Fly through and take readings', hint: 'Data at a cost', effects: [{ hull: -0.09 }, { research: 3 }, { years: 0.03 }] },
      ],
    },
    {
      id: 'rogue-planet', trigger: 'flight', weight: 2,
      title: 'A planet with no star',
      text: 'A cold rogue world drifts across the lane. Its gravity is a free push, if you dare use it.',
      choices: [
        { label: 'Slingshot', hint: 'Fuel saved, time spent', effects: [{ fuel: 5000 }, { years: 0.12 }] },
        { label: 'Keep your distance', hint: 'Study it from afar', effects: [{ research: 2 }, { years: 0.04 }] },
      ],
    },
    {
      id: 'derelict-probe', trigger: 'flight', weight: 2,
      title: 'Derelict probe',
      text: 'An old probe tumbles nearby. Its plating is scorched; its memory core might still be whole.',
      choices: [
        { label: 'Cut the core out', hint: 'Research, some hull risk', effects: [{ research: 4 }, { hull: -0.04 }, { years: 0.03 }] },
        { label: 'Strip the plating', hint: 'Raw material', effects: [{ material: 'minerals', n: 3 }, { years: 0.02 }] },
        { label: 'Let it drift', hint: 'No rash moves', effects: [{ log: 'The probe tumbles away into the dark.' }] },
      ],
    },
    {
      id: 'stellar-flare', trigger: 'flight', weight: 2,
      title: 'Flare on the horizon',
      text: 'The nearby star throws a sheet of plasma across the ship\'s path.',
      choices: [
        { label: 'Wait behind the shadow of a hull plate', hint: 'Slow but safe', effects: [{ years: 0.06 }, { fuel: -200 }] },
        { label: 'Punch through at speed', hint: 'Fast, rough on the hull', effects: [{ hull: -0.12 }, { years: 0.01 }] },
      ],
    },
    {
      id: 'magnetic-shoal', trigger: 'flight', weight: 2,
      title: 'Magnetic shoal',
      text: 'Tangled field lines snag the drive. The hull groans as the motors fight the current.',
      choices: [
        { label: 'Fight through', hint: 'Burn fuel, keep the schedule', effects: [{ fuel: -1500 }, { years: 0.01 }] },
        { label: 'Drift with the field', hint: 'Gentler, slower', effects: [{ years: 0.05 }, { hull: -0.03 }] },
      ],
    },
    {
      id: 'ice-shard-field', trigger: 'flight', weight: 2,
      title: 'Ice shards',
      text: 'A belt of dirty ice flashes in the starlight. Some of the shards are rich in volatiles.',
      choices: [
        { label: 'Collect a few', hint: 'Material, at a price', effects: [{ material: 'volatiles', n: 3 }, { hull: -0.04 }, { years: 0.02 }] },
        { label: 'Thread the gaps', hint: 'Careful flying', effects: [{ fuel: -700 }, { years: 0.01 }] },
      ],
    },
    {
      id: 'plasma-bubble', trigger: 'flight', weight: 2,
      title: 'Plasma bubble',
      text: 'An enormous bubble of charged gas surrounds the ship. It might be a fuel gift or a trap.',
      choices: [
        { label: 'Dip in', hint: 'Fifty-fifty', effects: [{ chance: 0.5, then: [{ fuel: 4000 }], else: [{ hull: -0.1 }] }] },
        { label: 'Go around', hint: 'Pay in fuel', effects: [{ fuel: -600 }, { years: 0.02 }] },
      ],
    },
    {
      id: 'neutrino-pulse', trigger: 'flight', weight: 1,
      title: 'Neutrino pulse',
      text: 'Every detector lights up at once with a pulse from no visible source.',
      choices: [
        { label: 'Record the whole event', hint: 'Research and time', effects: [{ research: 4 }, { years: 0.05 }] },
        { label: 'Stay on course', hint: 'Just note it', effects: [{ log: 'The pulse fades. The pulse always fades.' }] },
      ],
    },
    {
      id: 'hull-echo', trigger: 'flight', weight: 2,
      title: 'A knock in the hull',
      text: 'Something taps the outer shell in a regular pattern. The strain gauge says it is only thermal stress.',
      choices: [
        { label: 'Patch the panel', hint: 'Needs 1 mineral', requires: { materials: { minerals: 1 } }, effects: [{ material: 'minerals', n: -1 }, { hull: 0.15 }, { years: 0.01 }] },
        { label: 'Listen a while', hint: 'Learn the pattern', effects: [{ research: 1 }, { years: 0.03 }] },
      ],
    },
    {
      id: 'tachyon-drift', trigger: 'flight', weight: 1,
      title: 'Drift current',
      text: 'The lane bends. A fast, thin current could shave time off the trip, at a price in fuel.',
      choices: [
        { label: 'Ride the current', hint: 'Fuel for time', effects: [{ fuel: -2000 }, { years: -0.04 }] },
        { label: 'Hold the plotted line', hint: 'No surprises', effects: [{ research: 1 }, { years: 0.02 }] },
      ],
    },
    {
      id: 'dark-current', trigger: 'flight', weight: 1,
      title: 'A current full of spores',
      text: 'The clouds here are thick with Astrophage. Flying through them means free fuel and a risk of contamination.',
      choices: [
        { label: 'Plunge through', hint: 'Fuel now, infection risk', effects: [{ fuel: 6000 }, { infection: 0.02 }] },
        { label: 'Skirt the edge', hint: 'Cleaner, slower', effects: [{ fuel: -500 }, { years: 0.02 }] },
      ],
    },
    {
      id: 'gravity-lens', trigger: 'flight', weight: 1,
      title: 'Gravity lens',
      text: 'A dead star bends the light behind it into a ring. The distortion makes distant systems readable.',
      choices: [
        { label: 'Map the ring', hint: 'Pure science', effects: [{ research: 3 }, { years: 0.04 }] },
        { label: 'Borrow the focus for comms', hint: 'Leave a marker', effects: [{ research: 1 }, { flag: 'lens-relay' }] },
      ],
    },
    {
      id: 'phantom-signal', trigger: 'flight', weight: 1,
      title: 'A signal that shouldn\'t be there',
      text: 'A carrier wave repeats a prime-number sequence. The source is inside the ship.',
      choices: [
        { label: 'Trace the wiring', hint: 'Maybe nothing', effects: [{ chance: 0.4, then: [{ flag: 'phantom-echo' }, { research: 2 }], else: [{ log: 'It was the coffee maker.' }] }] },
        { label: 'Switch the band off', hint: 'Peace and quiet', effects: [{ log: 'The signal stops. Nobody speaks for a while.' }] },
      ],
    },
    {
      id: 'relay-wreck', trigger: 'flight', weight: 1,
      title: 'Broken relay',
      text: 'A relay satellite hangs broken in the lane. Its frame is good xenonite-grade stock.',
      choices: [
        { label: 'Cut it free', hint: 'Salvage', effects: [{ material: 'silicates', n: 3 }, { years: 0.03 }] },
        { label: 'Repair the transmitter', hint: 'A new listening post', effects: [{ flag: 'relay-repaired' }, { research: 2 }, { years: 0.04 }] },
      ],
    },
    {
      id: 'dust-veil', trigger: 'flight', weight: 2,
      title: 'Dust veil',
      text: 'Fine dust coats the forward shield. The star ahead is a dim coin through it.',
      choices: [
        { label: 'Push on', hint: 'The grit eats the shield', effects: [{ hull: -0.05 }, { years: 0.01 }] },
        { label: 'Wash the shield', hint: 'Uses fuel and water', effects: [{ fuel: -450 }, { research: 1 }] },
      ],
    },
    {
      id: 'ghost-engine', trigger: 'flight', weight: 1,
      title: 'A second engine signature',
      text: 'For six seconds the ship reads two drives: yours and something matching it exactly.',
      choices: [
        { label: 'Chase the echo', hint: 'Uncertain payoff', effects: [{ chance: 0.35, then: [{ research: 5 }], else: [{ hull: -0.06 }, { fuel: -800 }] }] },
        { label: 'Run the self-test', hint: 'Boring, useful', effects: [{ research: 1 }, { years: 0.02 }] },
      ],
    },

    // ---- Rocky: short sentences, questions, and amaze -------------------------
    {
      id: 'rocky-short-question', trigger: 'flight', weight: 1, once: true,
      title: 'Rocky asks a question',
      text: 'Rocky floats at the console. "We go very fast. You miss home? Question?"',
      choices: [
        { label: 'Show him Earth', hint: 'He watches the small blue dot', effects: [{ research: 2 }, { flag: 'rocky-home' }, { log: 'Rocky is quiet for a whole minute. "Far. Amaze."' }] },
        { label: 'Talk about the numbers instead', hint: 'His favorite subject', effects: [{ research: 1 }, { years: 0.02 }] },
      ],
    },
    {
      id: 'rocky-amaze-fuel', trigger: 'flight', weight: 1, once: true,
      title: 'Rocky checks the tanks',
      text: 'Rocky reads the fuel gauge twice. "Full. Good. Amaze."',
      choices: [
        { label: 'Let him celebrate', hint: 'He tapes a new gauge mark', effects: [{ hull: 0.05 }, { material: 'silicates', n: 1 }, { log: 'Rocky adds a tally to the bulkhead. "More later."' }] },
        { label: 'Ask him to save the materials', hint: 'Practical', effects: [{ material: 'minerals', n: 2 }, { research: 1 }] },
      ],
    },
    {
      id: 'rocky-night-watch', trigger: 'flight', weight: 1,
      title: 'Rocky takes the watch',
      text: 'Rocky wraps himself in a blanket and stares at the forward viewport. "I watch. You sleep. Question?"',
      choices: [
        { label: 'Sleep', hint: 'He keeps the instruments', effects: [{ years: 0.03 }, { research: 1 }, { log: 'Rocky hums softly through the whole watch.' }] },
        { label: 'Keep him company', hint: 'Trade stories', effects: [{ flag: 'rocky-trust' }, { research: 2 }] },
      ],
    },

    // ---- arrival surprises ----------------------------------------------------
    {
      id: 'arrival-shadow', trigger: 'arrive', weight: 3,
      title: 'Something in the shadow',
      text: (s, ctx) => `A dark shape crosses the disk of ${ctx.star || s.ship.starId} as the ship drops out of the jump.`,
      choices: [
        { label: 'Scan it', hint: 'Data before sleep', effects: [{ research: 2 }, { years: 0.01 }] },
        { label: 'Change orbit immediately', hint: 'Fuel for caution', effects: [{ fuel: -300 }, { hull: 0.02 }] },
      ],
    },
    {
      id: 'arrival-storm-front', trigger: 'arrive', weight: 2,
      title: 'Storm front',
      text: 'The system\'s second planet is throwing weather across the whole inner system.',
      choices: [
        { label: 'Drop in fast', hint: 'Rough landing', effects: [{ hull: -0.1 }, { years: 0.01 }] },
        { label: 'Take the long approach', hint: 'Time and fuel', effects: [{ fuel: -1000 }, { years: 0.04 }] },
      ],
    },
    {
      id: 'arrival-derelict-station', trigger: 'arrive', weight: 2,
      title: 'Empty station',
      text: 'A vacuum station orbits the fourth planet. The lights are off; the airlock is frozen shut.',
      choices: [
        { label: 'Force the airlock', hint: 'Scrap and strain', effects: [{ material: 'minerals', n: 4 }, { hull: -0.03 }, { years: 0.02 }] },
        { label: 'Read the logs from outside', hint: 'Clean science', effects: [{ research: 3 }, { years: 0.03 }] },
      ],
    },
    {
      id: 'arrival-old-transmission', trigger: 'arrive', weight: 1,
      title: 'An old transmission',
      text: 'A looping message plays on a narrow band. It has been repeating for a very long time.',
      choices: [
        { label: 'Translate it', hint: 'Slow work', effects: [{ research: 4 }, { years: 0.05 }, { flag: 'old-signal' }] },
        { label: 'Archive it for later', hint: 'Quick copy', effects: [{ research: 1 }, { log: 'The loop keeps repeating, patient as a lighthouse.' }] },
      ],
    },
    {
      id: 'arrival-frost-ring', trigger: 'arrive', weight: 1,
      title: 'A ring of frost',
      text: 'A ring of frozen debris circles close to the star. Every chunk carries a little water.',
      choices: [
        { label: 'Take a sample', hint: 'Volatiles', effects: [{ material: 'volatiles', n: 3 }, { years: 0.02 }] },
        { label: 'Measure the ring', hint: 'Research', effects: [{ research: 2 }, { fuel: -200 }] },
      ],
    },
    {
      id: 'arrival-gravity-tide', trigger: 'arrive', weight: 1,
      title: 'Tide from a giant',
      text: 'A gas giant pulls at the ship. The trajectory will need constant correction.',
      choices: [
        { label: 'Surf the tide inward', hint: 'Fuel saved, time lost', effects: [{ fuel: 1200 }, { years: 0.06 }] },
        { label: 'Cancel it with thrusters', hint: 'Expensive but quick', effects: [{ fuel: -1400 }, { research: 1 }] },
      ],
    },
    {
      id: 'rocky-new-star', trigger: 'arrive', weight: 1, once: true,
      title: 'Rocky sees a new sun',
      text: 'Rocky presses his face to the viewport. "New star. Different light. Amaze."',
      choices: [
        { label: 'Name a feature after him', hint: 'He pretends not to care', effects: [{ flag: 'rocky-feature' }, { log: 'Rocky names it anyway. "My rock. Question?"' }] },
        { label: 'Put him on survey duty', hint: 'He is a good engineer', effects: [{ research: 3 }, { years: 0.02 }] },
      ],
    },
    {
      id: 'arrival-quiet-ocean', trigger: 'arrive', weight: 1,
      title: 'A quiet ocean world',
      text: 'Clouds part over an ocean world. The seas look clean and very old.',
      choices: [
        { label: 'Send a probe down', hint: 'Samples', effects: [{ samples: 2 }, { years: 0.04 }] },
        { label: 'Map the weather first', hint: 'Research', effects: [{ research: 3 }, { years: 0.03 }] },
      ],
    },

    // ---- survey surprises -----------------------------------------------------
    {
      id: 'survey-buried-ocean', trigger: 'survey', weight: 2,
      title: 'Ocean under the crust',
      text: 'The radar returns show a liquid layer under a mile of rock.',
      choices: [
        { label: 'Drill', hint: 'Samples, long work', effects: [{ samples: 2 }, { years: 0.05 }, { hull: -0.02 }] },
        { label: 'Map it from orbit', hint: 'Research only', effects: [{ research: 3 }, { years: 0.02 }] },
      ],
    },
    {
      id: 'survey-viral-fossil', trigger: 'survey', weight: 2,
      title: 'Fossil in the ice',
      text: 'A core sample holds a virus that died before the star was young.',
      choices: [
        { label: 'Sequence it', hint: 'Big research gain', effects: [{ research: 5 }, { years: 0.04 }, { flag: 'viral-fossil' }] },
        { label: 'Sterilize the sample', hint: 'Safety first', effects: [{ samples: 1 }, { infection: -0.02 }] },
      ],
    },
    {
      id: 'survey-thermal-vent', trigger: 'survey', weight: 2,
      title: 'Thermal vent',
      text: 'A vent field bubbles minerals into cold water. It would make a fine little factory.',
      choices: [
        { label: 'Harvest the minerals', hint: 'Material', effects: [{ material: 'minerals', n: 4 }, { years: 0.03 }] },
        { label: 'Study the chemistry', hint: 'Research and samples', effects: [{ research: 2 }, { samples: 1 }, { years: 0.03 }] },
      ],
    },
    {
      id: 'survey-basalt-library', trigger: 'survey', weight: 1,
      title: 'Basalt library',
      text: 'Natural magnetism has written stripes into the crust like lines of text.',
      choices: [
        { label: 'Read the stripes', hint: 'Long study', effects: [{ research: 4 }, { years: 0.06 }] },
        { label: 'Just take a core', hint: 'Quick and dirty', effects: [{ samples: 1 }, { material: 'silicates', n: 2 }] },
      ],
    },
    {
      id: 'survey-mirror-algae', trigger: 'survey', weight: 1,
      title: 'Mirror algae',
      text: 'A mat of reflective organisms covers the shallow seabed, turning sunlight into a mirror.',
      choices: [
        { label: 'Culture a sample', hint: 'Maybe a bonus', effects: [{ samples: 2 }, { chance: 0.5, then: [{ research: 3 }], else: [{ hull: -0.02 }] }] },
        { label: 'Measure the reflectance', hint: 'Safe data', effects: [{ research: 2 }, { years: 0.02 }] },
      ],
    },
    {
      id: 'survey-ghost-crater', trigger: 'survey', weight: 1,
      title: 'Ghost crater',
      text: 'A crater has no impact rim. Something removed it neatly, from above.',
      choices: [
        { label: 'Survey the anomaly', hint: 'Set a flag', effects: [{ flag: 'ghost-crater' }, { research: 3 }, { years: 0.03 }] },
        { label: 'Keep scanning', hint: 'No detour', effects: [{ samples: 1 }] },
      ],
    },
    {
      id: 'survey-rocky-seam', trigger: 'survey', weight: 1, once: true,
      title: 'Rocky finds a seam',
      text: 'Rocky kicks a rock. "This one is good. Amaze." Under it is a seam of pure metal.',
      choices: [
        { label: 'Mine it with him', hint: 'He is very pleased', effects: [{ material: 'minerals', n: 5 }, { material: 'silicates', n: 2 }, { years: 0.03 }, { log: '"Many rocks. Good," Rocky says.' }] },
        { label: 'Mark it for later', hint: 'Save the time', effects: [{ flag: 'rocky-seam' }, { research: 1 }] },
      ],
    },
    {
      id: 'survey-radioactive-bloom', trigger: 'survey', weight: 1,
      title: 'Radioactive bloom',
      text: 'A patch of the surface glows at night. The Geiger counter considers this rude.',
      choices: [
        { label: 'Go close', hint: 'Knowledge with a risk', effects: [{ chance: 0.5, then: [{ research: 5 }], else: [{ hull: -0.08 }, { years: 0.02 }] }] },
        { label: 'Observe from the lander', hint: 'Safe research', effects: [{ research: 2 }, { samples: 1 }] },
      ],
    },
    {
      id: 'survey-subsurface-brine', trigger: 'survey', weight: 1,
      title: 'Brine below',
      text: 'Salty water moves under the dust. It is warm enough to be interesting.',
      choices: [
        { label: 'Tether a probe', hint: 'Samples', effects: [{ samples: 2 }, { years: 0.04 }, { hull: -0.02 }] },
        { label: 'Sample the dust above', hint: 'Cheap and quick', effects: [{ samples: 1 }, { research: 1 }] },
      ],
    },

    // ---- random cards, drawn by world time ------------------------------------
    {
      id: 'random-crew-dream', trigger: 'random', weight: 1,
      title: 'A dream of rain',
      text: 'You dream of rain on a roof that does not exist. The log records it as rest.',
      choices: [
        { label: 'Write it down', hint: 'It means something', effects: [{ research: 1 }, { log: 'Rain on a roof. The log records it without comment.' }] },
        { label: 'Get up and work', hint: 'Useful hours', effects: [{ years: 0.02 }, { research: 2 }] },
      ],
    },
    {
      id: 'random-stocktake', trigger: 'random', weight: 1,
      title: 'Stocktake',
      text: 'The inventory reports three crates nobody remembers loading.',
      choices: [
        { label: 'Open them', hint: 'Could be anything', effects: [{ chance: 0.6, then: [{ material: 'volatiles', n: 3 }], else: [{ material: 'minerals', n: 2 }] }] },
        { label: 'Log them and move on', hint: 'Order is order', effects: [{ research: 1 }] },
      ],
    },
    {
      id: 'random-fuel-leak', trigger: 'random', weight: 2,
      title: 'A slow leak',
      text: 'A fuel line is weeping into the void. The loss is small, but it is constant.',
      choices: [
        { label: 'Seal it now', hint: 'Costs materials and time', requires: { materials: { silicates: 1 } }, effects: [{ material: 'silicates', n: -1 }, { years: 0.01 }, { hull: 0.02 }] },
        { label: 'Accept the loss', hint: 'Keep moving', effects: [{ fuel: -1200 }] },
      ],
    },
    {
      id: 'random-rocky-joke', trigger: 'random', weight: 1, once: true,
      title: 'Rocky tells a joke',
      text: 'Rocky says six words in Eridian, then waits. "Is funny. Question?"',
      choices: [
        { label: 'Laugh', hint: 'He is delighted', effects: [{ flag: 'rocky-joke' }, { log: '"Amaze! You laugh! Good," Rocky says.' }, { research: 1 }] },
        { label: 'Ask for a translation', hint: 'He refuses, politely', effects: [{ research: 2 }, { years: 0.01 }] },
      ],
    },
    {
      id: 'random-infection-spike', trigger: 'random', weight: 1,
      title: 'The local star brightens',
      text: 'The photometer says the star is fading. Astrophage is spreading through this system.',
      choices: [
        { label: 'Seed a countermeasure', hint: 'Slow the spread', effects: [{ infection: -0.03 }, { years: 0.02 }, { research: 1 }] },
        { label: 'Take advantage of the bounty', hint: 'Fuel for the future', effects: [{ fuel: 5000 }, { infection: 0.02 }] },
      ],
    },
    {
      id: 'random-maintenance', trigger: 'random', weight: 1,
      title: 'Maintenance day',
      text: 'Everything is a little loose. A careful afternoon could put that right.',
      choices: [
        { label: 'Rebuild the seals', hint: 'Needs 2 minerals', requires: { materials: { minerals: 2 } }, effects: [{ material: 'minerals', n: -2 }, { hull: 0.12 }, { years: 0.01 }] },
        { label: 'Only tighten what is loose', hint: 'Free', effects: [{ hull: 0.03 }, { years: 0.01 }] },
      ],
    },
    {
      id: 'random-signal-drift', trigger: 'random', weight: 1,
      title: 'Signal drift',
      text: 'The comms array hears its own transmissions returning a fraction of a second late.',
      choices: [
        { label: 'Analyze the delay', hint: 'Research', effects: [{ research: 3 }, { years: 0.03 }] },
        { label: 'Reboot the array', hint: 'Quick fix', effects: [{ hull: 0.02 }, { log: 'The echo stops. It was never there.' }] },
      ],
    },

    // ---- the Cartographers: six linked cards, flags carto1..carto6 -------------
    {
      id: 'carto-1-signal', trigger: 'flight', weight: 8, once: true,
      title: 'The Cartographers I: a patient carrier',
      text: 'A carrier wave rides the Astrophage lane. It repeats a map of the lane itself, though no living voice sends it.',
      choices: [
        { label: 'Follow the carrier', hint: 'It is pointing at something', effects: [{ flag: 'carto1' }, { chain: 'carto-2-buoy' }, { years: 0.02 }] },
        { label: 'Record it and follow anyway', hint: 'Careful study', effects: [{ flag: 'carto1' }, { research: 2 }, { chain: 'carto-2-buoy' }, { fuel: -300 }] },
      ],
    },
    {
      id: 'carto-2-buoy', trigger: 'flight', weight: 1, once: true,
      requires: { flags: ['carto1'] },
      title: 'The Cartographers II: the buoy',
      text: 'A relay buoy hangs in the dark, cold and intact. Its maker left a socket where a power cell should be.',
      choices: [
        { label: 'Power it with the ship', hint: 'It wakes up', effects: [{ flag: 'carto2' }, { chain: 'carto-3-cache' }, { fuel: -600 }, { years: 0.02 }] },
        { label: 'Take its memory instead', hint: 'Rude, but informative', effects: [{ flag: 'carto2' }, { research: 3 }, { chain: 'carto-3-cache' }, { hull: -0.02 }] },
      ],
    },
    {
      id: 'carto-3-cache', trigger: 'survey', weight: 1, once: true,
      requires: { flags: ['carto2'] },
      title: 'The Cartographers III: the cache',
      text: 'The buoy\'s coordinates lead to a cache bolted to an asteroid. Inside are star charts written by a species that is gone.',
      choices: [
        { label: 'Read the charts', hint: 'Their lanes, all of them', effects: [{ flag: 'carto3' }, { research: 5 }, { chain: 'carto-4-chorus' }, { years: 0.04 }] },
        { label: 'Copy only the safe routes', hint: 'Minerals from the case', effects: [{ flag: 'carto3' }, { material: 'minerals', n: 3 }, { chain: 'carto-4-chorus' }] },
      ],
    },
    {
      id: 'carto-4-chorus', trigger: 'flight', weight: 1, once: true,
      requires: { flags: ['carto3'] },
      title: 'The Cartographers IV: the chorus',
      text: 'A dozen buoys answer at once. They are singing a catalogue of dead stars to nobody.',
      choices: [
        { label: 'Listen to the whole catalogue', hint: 'Time well spent', effects: [{ flag: 'carto4' }, { research: 6 }, { chain: 'carto-5-archive' }, { years: 0.06 }] },
        { label: 'Repair the weakest buoy', hint: 'Leave a light on', effects: [{ flag: 'carto4' }, { material: 'silicates', n: -2 }, { chain: 'carto-5-archive' }, { research: 2 }] },
      ],
    },
    {
      id: 'carto-5-archive', trigger: 'arrive', weight: 1, once: true,
      requires: { flags: ['carto4'] },
      title: 'The Cartographers V: the archive',
      text: 'The last buoy points to a small moon. A stone vault holds their final record: they watched the spread come, and they mapped it until there was nobody left to read.',
      choices: [
        { label: 'Translate the final record', hint: 'A long, quiet hour', effects: [{ flag: 'carto5' }, { research: 8 }, { chain: 'carto-6-silence' }, { years: 0.08 }] },
        { label: 'Seal the vault again', hint: 'Some things stay buried', effects: [{ flag: 'carto5' }, { hull: 0.05 }, { chain: 'carto-6-silence' }, { log: 'You leave the vault as you found it.' }] },
      ],
    },
    {
      id: 'carto-6-silence', trigger: 'survey', weight: 1, once: true,
      requires: { flags: ['carto5'] },
      title: 'The Cartographers VI: silence',
      text: 'The buoys have stopped singing. The lane is quiet, but now you know how to read it.',
      choices: [
        { label: 'Carry the charts onward', hint: 'A lasting gift', effects: [{ flag: 'carto6' }, { research: 10 }, { samples: 2 }, { log: 'You carry their map into the dark. Rocky says: "Good map. Amaze."' }] },
        { label: 'Broadcast their names', hint: 'A small memorial', effects: [{ flag: 'carto6' }, { research: 4 }, { years: 0.03 }, { log: 'The names go out along the lane, one by one.' }] },
      ],
    },
  ],
};
