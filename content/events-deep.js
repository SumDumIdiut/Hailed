// Deep-flight content pack: 50 original events for relativistic flight, arrival and shipboard life.
// Plain data only; text may be a function of (state, ctx), effects are always data so saves stay JSON.
export default {
  id: 'events-deep',
  events: [
    // ---- flight: 30 cards -----------------------------------------------------
    {
      id: 'deep-blue-shift-erosion', trigger: 'flight', weight: 1.4,
      title: 'Blue-shift on the bow',
      text: 'The star ahead is a hard blue nail. Its light hits the forward shield like grit at a fraction of c.',
      choices: [
        { label: 'Turn the bow away', hint: 'Fuel and a day for a clean shield', effects: [{ fuel: -1000 }, { years: 0.01 }] },
        { label: 'Take the beam and measure it', hint: 'Data for a scarred shield', effects: [{ hull: -0.08 }, { research: 2 }, { years: 0.02 }] },
        { label: 'Measure the erosion live', hint: 'Needs 2 research', requires: { research: 2 }, effects: [{ research: 3 }, { hull: -0.04 }, { years: 0.03 }] },
      ],
    },
    {
      id: 'deep-time-dilation-surprise', trigger: 'flight', weight: 1.0,
      title: 'Two clocks, one ship',
      text: 'The ship clock and the mission clock disagree by weeks. Relativity is theft, and it always collects.',
      choices: [
        { label: 'Trust the ship clock and burn a correction', hint: 'Time saved for fuel', effects: [{ fuel: -700 }, { years: -0.02 }] },
        { label: 'Trust the mission clock and re-sync', hint: 'Careful, slower', effects: [{ research: 2 }, { years: 0.04 }] },
        { label: 'Let Rocky rebuild the comparator', hint: 'Needs 1 mineral', requires: { materials: { minerals: 1 } }, effects: [{ material: 'minerals', n: -1 }, { research: 2 }, { years: 0.02 }, { log: '"Clock good. Amaze," Rocky says.' }] },
      ],
    },
    {
      id: 'deep-hull-erosion-sweep', trigger: 'flight', weight: 1.2,
      title: 'The slow sanding',
      text: 'The shield is not holed, only dimmed. A thousand hours of dust have ground it milky.',
      choices: [
        { label: 'Grind a fresh layer from feedstock', hint: 'Needs 2 silicates', requires: { materials: { silicates: 2 } }, effects: [{ material: 'silicates', n: -2 }, { hull: 0.12 }, { years: 0.02 }] },
        { label: 'Ignore the pits', hint: 'Keep the schedule, lose the shield', effects: [{ hull: -0.06 }, { years: -0.01 }] },
        { label: 'Map the pit field', hint: 'Know the damage', effects: [{ research: 2 }, { years: 0.03 }, { hull: -0.02 }] },
      ],
    },
    {
      id: 'deep-ism-density-spike', trigger: 'flight', weight: 1.0,
      title: 'The medium thickens',
      text: 'The interstellar medium here is a hundred times the expected density. The bow wave is audible through the hull.',
      choices: [
        { label: 'Throttle down', hint: 'Time for a gentler ride', effects: [{ years: 0.05 }, { fuel: 200 }] },
        { label: 'Plow through at cruise', hint: 'Fast and rough', effects: [{ hull: -0.07 }, { years: -0.02 }] },
        { label: 'Run the mass spectrometer', hint: 'Fuel for data', effects: [{ research: 2 }, { fuel: -300 }, { years: 0.02 }] },
      ],
    },
    {
      id: 'deep-swarm-in-the-lane', trigger: 'flight', weight: 1.6,
      title: 'A swarm in the lane',
      text: 'A cloud of Astrophage tumbles along the lane like snow in a wind. Each cell is a tiny reactor waiting to be eaten.',
      choices: [
        { label: 'Skim the swarm', hint: 'Fuel now, infection later', effects: [{ fuel: 7000 }, { infection: 0.03 }, { hull: -0.03 }, { years: 0.02 }] },
        { label: 'Go under it', hint: 'Fuel and time for a clean hull', effects: [{ fuel: -1100 }, { years: 0.03 }] },
        { label: 'Send a sample drone', hint: 'Needs 3 research', requires: { research: 3 }, effects: [{ research: 3 }, { samples: 1 }, { fuel: -400 }, { years: 0.04 }] },
      ],
    },
    {
      id: 'deep-spore-tide', trigger: 'flight', weight: 1.1,
      title: 'Spore tide',
      text: 'Spores are climbing the hull, looking for warmth. The filters can eat them, or the ship can keep them.',
      choices: [
        { label: 'Open the scoops', hint: 'Big fuel, dirty star', effects: [{ fuel: 5000 }, { infection: 0.04 }, { hull: -0.02 }] },
        { label: 'Seal the intakes and wait', hint: 'Clean and slow', effects: [{ fuel: -600 }, { years: 0.05 }] },
        { label: 'Culture what stuck', hint: 'A sample with a price', effects: [{ samples: 1 }, { research: 2 }, { hull: -0.04 }, { years: 0.03 }] },
      ],
    },
    {
      id: 'deep-human-probe', trigger: 'flight', weight: 1.0,
      title: 'A dead human probe',
      text: 'An old probe tumbles end over end. Its transmitter is silent; its maker probably is too.',
      choices: [
        { label: 'Cut out the flight recorder', hint: 'Research, some hull risk', effects: [{ research: 4 }, { hull: -0.02 }, { years: 0.03 }] },
        { label: 'Strip the radiator panels', hint: 'Silicates for the shop', effects: [{ material: 'silicates', n: 3 }, { years: 0.04 }] },
        { label: 'Photograph and pass', hint: 'A quiet record', effects: [{ research: 1 }, { years: 0.01 }, { flag: 'deep-human-probe-logged' }] },
      ],
    },
    {
      id: 'deep-alien-probe', trigger: 'flight', weight: 0.9,
      title: 'A probe that is not ours',
      text: 'Its bus has no seams, no fasteners, and no readable power source. Everything about it is quietly wrong.',
      choices: [
        { label: 'Match its architecture', hint: 'Needs 4 research', requires: { research: 4 }, effects: [{ research: 5 }, { hull: -0.02 }, { years: 0.05 }] },
        { label: 'Take the plating', hint: 'Metal, and a little knowledge', effects: [{ material: 'minerals', n: 3 }, { research: 1 }, { years: 0.03 }] },
        { label: 'Leave it undisturbed', hint: 'Caution costs time', effects: [{ research: 1 }, { years: 0.02 }] },
      ],
    },
    {
      id: 'deep-rogue-world', trigger: 'flight', weight: 1.3,
      title: 'A world with no sun',
      text: 'A rogue planet crosses the lane. Its gravity is a free push if you are willing to spend the hours.',
      choices: [
        { label: 'Slingshot close', hint: 'Fuel saved, time and skin lost', effects: [{ fuel: 4500 }, { years: 0.1 }, { hull: -0.02 }] },
        { label: 'Study from a safe offset', hint: 'Data for fuel', effects: [{ research: 3 }, { fuel: -300 }, { years: 0.04 }] },
        { label: 'Scoop the exosphere', hint: 'A thin drink, a small risk', effects: [{ fuel: 2000 }, { infection: 0.01 }, { hull: -0.03 }, { years: 0.03 }] },
      ],
    },
    {
      id: 'deep-rogue-moon', trigger: 'flight', weight: 0.8,
      title: 'Moon without a parent',
      text: 'A frozen moon rides beside the rogue world. Its plume is mostly water, and the ship is always thirsty.',
      choices: [
        { label: 'Land and drill', hint: 'Samples and volatiles, rough on the hull', effects: [{ samples: 2 }, { material: 'volatiles', n: 3 }, { years: 0.06 }, { hull: -0.03 }] },
        { label: 'Sample the plume', hint: 'Cheaper and cleaner', effects: [{ samples: 1 }, { research: 2 }, { years: 0.03 }] },
        { label: 'Fly past', hint: 'A glance and a little fuel', effects: [{ research: 1 }, { fuel: -200 }, { years: 0.01 }] },
      ],
    },
    {
      id: 'deep-nebula-pocket', trigger: 'flight', weight: 1.2,
      title: 'A pocket of nebula',
      text: 'A bright pocket of charged gas sits across the lane. It glitters like fuel and behaves like weather.',
      choices: [
        { label: 'Dip through the bright edge', hint: 'Half chance at a drink', effects: [{ fuel: -200 }, { chance: 0.5, then: [{ fuel: 3700 }], else: [{ hull: -0.12 }] }, { years: 0.02 }] },
        { label: 'Skirt the dark side', hint: 'Fuel and hours for safety', effects: [{ fuel: -800 }, { years: 0.03 }] },
        { label: 'Run the plasma experiment', hint: 'Needs 2 research', requires: { research: 2 }, effects: [{ research: 4 }, { hull: -0.05 }, { years: 0.05 }] },
      ],
    },
    {
      id: 'deep-dark-nebula', trigger: 'flight', weight: 0.9,
      title: 'A dark pocket',
      text: 'Dust ahead eats starlight. The optical nav camera sees nothing; the mass sensors see too much.',
      choices: [
        { label: 'Fly by instrument only', hint: 'Fuel for careful hours', effects: [{ research: 2 }, { fuel: -500 }, { years: 0.04 }] },
        { label: 'Burn through on visual', hint: 'Fast, expensive, dirty', effects: [{ fuel: -1300 }, { years: 0.01 }, { hull: -0.03 }] },
        { label: 'Stop and wait for clearance', hint: 'A week goes by', effects: [{ years: 0.07 }, { research: 1 }] },
      ],
    },
    {
      id: 'deep-hydrogen-wall', trigger: 'flight', weight: 1.1,
      title: 'Hydrogen wall',
      text: 'A wall of cold hydrogen marks the edge of the local bubble. There is fuel in it, and dust with the fuel.',
      choices: [
        { label: 'Scoop hydrogen', hint: 'Fuel, with grit and spores', effects: [{ fuel: 6000 }, { hull: -0.05 }, { infection: 0.01 }, { years: 0.03 }] },
        { label: 'Keep the bow closed', hint: 'Pay to stay clean', effects: [{ fuel: -700 }, { years: 0.02 }] },
        { label: 'Measure the wall', hint: 'Data for a small burn', effects: [{ research: 3 }, { fuel: -300 }, { years: 0.03 }] },
      ],
    },
    {
      id: 'deep-shock-front', trigger: 'flight', weight: 1.0,
      title: 'Shock front',
      text: 'A shock front curls across the lane. The plasma on its far side is thin, hot, and entirely indifferent to you.',
      choices: [
        { label: 'Punch through', hint: 'Quick and hard on the hull', effects: [{ hull: -0.1 }, { years: 0.01 }, { research: 1 }] },
        { label: 'Detour around the front', hint: 'Fuel and time', effects: [{ fuel: -1500 }, { years: 0.06 }] },
        { label: 'Ride the compression wave', hint: 'Free push, slow and rough', effects: [{ fuel: 1200 }, { hull: -0.04 }, { years: 0.05 }] },
      ],
    },
    {
      id: 'deep-shock-rocky', trigger: 'flight', weight: 0.8,
      title: 'Rocky sees the pitting',
      text: 'Rocky presses a hand to the hull. "Bad bad bad. Small holes. Many." He waits for your answer.',
      choices: [
        { label: 'Let him brace the shield', hint: 'Needs 2 minerals', requires: { materials: { minerals: 2 } }, effects: [{ material: 'minerals', n: -2 }, { hull: 0.1 }, { years: 0.02 }, { log: '"Bad bad bad," he says. Then: "Fixed. Amaze."' }] },
        { label: 'Tell him to stand down', hint: 'Keep the schedule', effects: [{ years: -0.01 }, { hull: -0.07 }] },
        { label: 'Inspect the pits together', hint: 'Slow, useful work', effects: [{ research: 2 }, { years: 0.04 }, { hull: -0.02 }] },
      ],
    },
    {
      id: 'deep-relativistic-dust', trigger: 'flight', weight: 1.3,
      title: 'Dust at speed',
      text: 'At this velocity a grain of dust is a bullet. The counter cannot tell you which one is coming next.',
      choices: [
        { label: 'Turn the broad face to the dust', hint: 'Fuel for a safer angle', effects: [{ fuel: -900 }, { years: 0.02 }, { research: 1 }] },
        { label: 'Accept the pitting', hint: 'Time saved, hull spent', effects: [{ hull: -0.09 }, { years: -0.02 }] },
        { label: 'Deploy the sacrificial foil', hint: 'Needs 1 silicate', requires: { materials: { silicates: 1 } }, effects: [{ material: 'silicates', n: -1 }, { hull: -0.01 }, { years: 0.01 }] },
      ],
    },
    {
      id: 'deep-blue-ghost', trigger: 'flight', weight: 0.7,
      title: 'A blue ghost ahead',
      text: 'A second image of the ship sits a few light-seconds ahead. It matches your drive signature exactly.',
      choices: [
        { label: 'Chase the ghost', hint: 'Uncertain payoff', effects: [{ fuel: -300 }, { chance: 0.4, then: [{ research: 4 }], else: [{ fuel: -900 }, { years: 0.03 }] }] },
        { label: 'Log it and hold course', hint: 'No heroics', effects: [{ research: 1 }, { years: 0.02 }, { flag: 'deep-blue-ghost' }] },
      ],
    },
    {
      id: 'deep-attitude-drift', trigger: 'flight', weight: 1.0,
      title: 'The reaction wheels stick',
      text: 'The ship wants to roll. The attitude computer keeps correcting, and the wheels are nearly saturated.',
      choices: [
        { label: 'Let Rocky rebalance them', hint: 'Needs 1 mineral', requires: { materials: { minerals: 1 } }, effects: [{ material: 'minerals', n: -1 }, { hull: 0.04 }, { years: 0.02 }, { log: '"Spin good. Amaze," Rocky says.' }] },
        { label: 'Fire thrusters instead', hint: 'Fuel for a quick fix', effects: [{ fuel: -800 }, { years: 0.01 }] },
        { label: 'Coast and drift', hint: 'Data from a quiet hour', effects: [{ research: 1 }, { years: 0.05 }, { hull: -0.03 }] },
      ],
    },
    {
      id: 'deep-coolant-leak', trigger: 'flight', weight: 1.1,
      title: 'A weeping coolant loop',
      text: 'A loop feeding the drive is losing fluid into space. The temperature is rising by the hour.',
      choices: [
        { label: 'Patch the loop', hint: 'Needs 1 volatile', requires: { materials: { volatiles: 1 } }, effects: [{ material: 'volatiles', n: -1 }, { hull: 0.06 }, { years: 0.02 }] },
        { label: 'Run the drive hot', hint: 'Speed now, damage later', effects: [{ hull: -0.08 }, { years: -0.01 }, { research: 1 }] },
        { label: 'Shut down and cool', hint: 'A slow, safe hour', effects: [{ years: 0.06 }, { fuel: 100 }] },
      ],
    },
    {
      id: 'deep-power-bus-fault', trigger: 'flight', weight: 0.9,
      title: 'A bad bus',
      text: 'One power bus is dropping loads at random. The ship still flies, but nothing on it is trustworthy.',
      choices: [
        { label: 'Reboot from cold', hint: 'Clean, slow, informative', effects: [{ research: 2 }, { years: 0.05 }, { fuel: -200 }] },
        { label: 'Bypass the bad bus', hint: 'Fast and ugly', effects: [{ fuel: -600 }, { hull: -0.05 }, { years: 0.01 }] },
        { label: 'Have Rocky rewire it', hint: 'Needs 3 research and 1 silicate', requires: { research: 3, materials: { silicates: 1 } }, effects: [{ material: 'silicates', n: -1 }, { hull: 0.03 }, { years: 0.03 }, { research: 1 }] },
      ],
    },
    {
      id: 'deep-antenna-frost', trigger: 'flight', weight: 0.8,
      title: 'Frost on the dish',
      text: 'A skin of ice has grown on the comms dish. The array still hears, but only faintly.',
      choices: [
        { label: 'Clear the dish', hint: 'Hours and a small burn', effects: [{ years: 0.03 }, { research: 1 }, { fuel: -150 }] },
        { label: 'Transmit through the frost', hint: 'Push the signal, strain the gear', effects: [{ research: 2 }, { hull: -0.02 }, { flag: 'deep-weak-relay' }, { years: 0.02 }] },
      ],
    },
    {
      id: 'deep-rocky-brace', trigger: 'flight', weight: 1.0, once: true,
      title: 'Rocky draws a brace',
      text: 'Rocky sketches a brace on the bulkhead with a grease pencil. "Make this. Then hull strong. Question?"',
      choices: [
        { label: 'Let him fit the brace', hint: 'Needs 3 minerals', requires: { materials: { minerals: 3 } }, effects: [{ material: 'minerals', n: -3 }, { hull: 0.15 }, { years: 0.03 }, { log: '"Strong now. Amaze," Rocky says.' }, { flag: 'deep-brace-built' }] },
        { label: 'Save the minerals', hint: 'Knowledge instead of metal', effects: [{ research: 2 }, { years: 0.02 }, { hull: -0.02 }] },
        { label: 'Have him sketch it instead', hint: 'A plan for later', effects: [{ research: 3 }, { years: 0.04 }, { flag: 'deep-brace-plan' }] },
      ],
    },
    {
      id: 'deep-rocky-dilation-question', trigger: 'flight', weight: 0.9, once: true,
      title: 'Rocky asks about time',
      text: 'Rocky taps the clock display. "Home is older than us. How? Question?" He has been saving the question for weeks.',
      choices: [
        { label: 'Explain it with numbers', hint: 'His favorite answer', effects: [{ research: 3 }, { years: 0.02 }, { log: '"Numbers good. Amaze," Rocky says.' }] },
        { label: 'Give him the short answer', hint: 'Back to the consoles', effects: [{ research: 1 }, { years: -0.01 }, { log: '"Question?" he asks again.' }, { flag: 'deep-time-question' }] },
      ],
    },
    {
      id: 'deep-rocky-amaze-shield', trigger: 'flight', weight: 0.7, once: true,
      title: 'Rocky inspects the shield',
      text: 'Rocky runs a hand over the inner plating and nods. "Still good. Amaze." He looks far too pleased with both of you.',
      choices: [
        { label: 'Let him celebrate', hint: 'A minute of pride', effects: [{ research: 1 }, { years: 0.02 }, { log: '"Shield good. Amaze," Rocky says.' }, { flag: 'deep-rocky-proud' }] },
        { label: 'Put him to work', hint: 'No time for ceremonies', effects: [{ research: 2 }, { fuel: -200 }, { years: 0.01 }] },
      ],
    },
    {
      id: 'deep-rocky-bad-pitting', trigger: 'flight', weight: 0.8,
      title: 'Rocky counts the pits',
      text: '"Bad bad bad," Rocky says, counting marks on the forward plate. "Twenty. No, thirty." He waits.',
      choices: [
        { label: 'Hear him out', hint: 'His ear is better than the sensor', effects: [{ research: 2 }, { years: 0.04 }, { hull: 0.03 }] },
        { label: 'Seal the panel yourself', hint: 'Needs 1 silicate', requires: { materials: { silicates: 1 } }, effects: [{ material: 'silicates', n: -1 }, { hull: 0.08 }, { years: 0.02 }] },
        { label: 'Keep flying', hint: 'Ignore the marks', effects: [{ years: -0.01 }, { hull: -0.06 }] },
      ],
    },
    {
      id: 'deep-pulsar-fix', trigger: 'flight', weight: 1.0,
      title: 'Pulsar timing',
      text: 'A millisecond pulsar ticks through the noise. Its pulses can put the ship back on a known line.',
      choices: [
        { label: 'Lock navigation to the pulsar', hint: 'Research, a small burn', effects: [{ research: 4 }, { fuel: -200 }, { years: 0.05 }] },
        { label: 'Burn a manual correction', hint: 'Fast, no data', effects: [{ fuel: -900 }, { years: 0.01 }] },
        { label: 'Ignore the beacon', hint: 'Save the hours', effects: [{ years: -0.01 }, { hull: -0.02 }] },
      ],
    },
    {
      id: 'deep-magnetar-wisp', trigger: 'flight', weight: 0.7,
      title: 'A magnetar wisp',
      text: 'A thread of plasma from a magnetar brushes the lane. The avionics are complaining in a low, steady tone.',
      choices: [
        { label: 'Power down and coast', hint: 'Slow, almost safe', effects: [{ years: 0.06 }, { fuel: 100 }, { research: 1 }] },
        { label: 'Measure the wisp', hint: 'Half chance at real data', effects: [{ fuel: -200 }, { chance: 0.5, then: [{ research: 5 }], else: [{ hull: -0.1 }] }, { years: 0.03 }] },
        { label: 'Shield the avionics', hint: 'Needs 1 silicate', requires: { materials: { silicates: 1 } }, effects: [{ material: 'silicates', n: -1 }, { fuel: -400 }, { years: 0.02 }] },
      ],
    },
    {
      id: 'deep-tidal-gradient', trigger: 'flight', weight: 0.9,
      title: 'Tide across the hull',
      text: 'A compact mass ahead pulls harder on the bow than the stern. The ship is being gently stretched.',
      choices: [
        { label: 'Rotate the ship slowly', hint: 'Fuel and hours to spread the load', effects: [{ fuel: -500 }, { years: 0.03 }, { research: 1 }] },
        { label: 'Hold attitude and take the strain', hint: 'Data from a stressed hull', effects: [{ hull: -0.06 }, { research: 2 }, { years: 0.02 }] },
        { label: 'Back away from the mass', hint: 'Expensive caution', effects: [{ fuel: -1000 }, { years: 0.04 }] },
      ],
    },
    {
      id: 'deep-silent-lane', trigger: 'flight', weight: 1.1,
      title: 'A silent stretch',
      text: 'This segment of lane has no Astrophage at all. The tanks will have to carry you through it.',
      choices: [
        { label: 'Ration the tanks', hint: 'Save fuel, lose weeks', effects: [{ fuel: 800 }, { years: 0.07 }, { research: 1 }] },
        { label: 'Burn at full throttle', hint: 'Time bought with fuel', effects: [{ fuel: -2200 }, { years: -0.03 }] },
        { label: 'Search for stray spores', hint: 'A clean little survey', effects: [{ research: 2 }, { infection: -0.01 }, { years: 0.04 }] },
      ],
    },
    {
      id: 'deep-threshold-milestone', trigger: 'flight', weight: 0.8, once: true,
      title: 'Past the last chart',
      text: 'The navigation display shows no surveyed stars ahead. Everything from here is a first measurement.',
      choices: [
        { label: 'Mark the boundary', hint: 'Leave a waypoint', effects: [{ flag: 'deep-boundary' }, { research: 2 }, { years: 0.02 }] },
        { label: 'Push on without ceremony', hint: 'Fuel for a quick crossing', effects: [{ years: -0.01 }, { fuel: -400 }] },
        { label: 'Send a log home', hint: 'Someone may read it', effects: [{ research: 1 }, { years: 0.03 }, { log: 'The log goes out along the lane: past the last chart, still flying.' }] },
      ],
    },

    // ---- random: 15 cards drawn by world time ---------------------------------
    {
      id: 'deep-random-clock-drift', trigger: 'random', weight: 1.0,
      title: 'Clock drift',
      text: 'The ship clock has slipped again. It is only seconds, but seconds are the whole currency out here.',
      choices: [
        { label: 'Recalibrate the clocks', hint: 'A little fuel, a careful hour', effects: [{ research: 2 }, { years: 0.03 }, { fuel: -100 }] },
        { label: 'Let them drift', hint: 'Keep moving, risk the numbers', effects: [{ years: -0.01 }, { hull: -0.02 }] },
      ],
    },
    {
      id: 'deep-random-rocky-inventory', trigger: 'random', weight: 0.9,
      title: 'Rocky counts the stores',
      text: 'Rocky has laid every bolt and canister on the deck. "All accounted. Amaze." He expects praise.',
      choices: [
        { label: 'Count with him', hint: 'He is very pleased', effects: [{ research: 2 }, { years: 0.02 }, { log: '"All accounted. Amaze," Rocky says again.' }] },
        { label: 'Tell him to skip it', hint: 'Back to the work', effects: [{ years: -0.01 }, { hull: -0.02 }] },
      ],
    },
    {
      id: 'deep-random-vent-alarm', trigger: 'random', weight: 1.1,
      title: 'Something smells wrong',
      text: '"Bad bad bad," Rocky says from the vent trunk. The air tastes of hot insulation and old electrical fire.',
      choices: [
        { label: 'Inspect the line', hint: 'Find it before it bites', effects: [{ research: 2 }, { years: 0.03 }, { hull: 0.02 }] },
        { label: 'Vent the compartment', hint: 'Fuel for clean air', effects: [{ fuel: -300 }, { years: 0.01 }, { research: 1 }] },
        { label: 'Ignore it', hint: 'Cheap and foolish', effects: [{ hull: -0.05 }, { years: -0.01 }] },
      ],
    },
    {
      id: 'deep-random-crew-log', trigger: 'random', weight: 0.8,
      title: 'A log from the old crew',
      text: 'A maintenance log turns up in the archive. Whoever wrote it thought the ship would never fly this far.',
      choices: [
        { label: 'Translate it fully', hint: 'A long, quiet hour', effects: [{ research: 4 }, { years: 0.05 }] },
        { label: 'Copy the header only', hint: 'Quick and partial', effects: [{ research: 1 }, { years: 0.01 }, { flag: 'deep-crew-log' }] },
      ],
    },
    {
      id: 'deep-random-reclaim-fault', trigger: 'random', weight: 1.0,
      title: 'The water reclaim is slipping',
      text: 'The reclaim system is returning less water than it takes in. The difference is in the walls somewhere.',
      choices: [
        { label: 'Rebuild the filter', hint: 'Needs 1 silicate', requires: { materials: { silicates: 1 } }, effects: [{ material: 'silicates', n: -1 }, { research: 1 }, { years: 0.02 }] },
        { label: 'Ration water instead', hint: 'Time saved, comfort lost', effects: [{ years: 0.05 }, { research: 1 }] },
        { label: 'Run it dry', hint: 'Keep the clock, hurt the hull', effects: [{ hull: -0.04 }, { years: -0.01 }] },
      ],
    },
    {
      id: 'deep-random-starlight-spectrum', trigger: 'random', weight: 0.8,
      title: 'An unread spectrum',
      text: 'The forward telescope has been collecting a spectrum nobody has looked at. The lines do not match any catalog.',
      choices: [
        { label: 'Take a full spectrum', hint: 'Fuel and hours for data', effects: [{ research: 3 }, { fuel: -100 }, { years: 0.04 }] },
        { label: 'Skip it', hint: 'Move on', effects: [{ years: -0.01 }, { flag: 'deep-spectrum-skipped' }] },
      ],
    },
    {
      id: 'deep-random-spore-bloom', trigger: 'random', weight: 1.2,
      title: 'A bloom in the intake',
      text: 'Astrophage has found the intake and is multiplying there. It is either a gift or an infection with a good press agent.',
      choices: [
        { label: 'Harvest the bloom', hint: 'Fuel at a cost', effects: [{ fuel: 4500 }, { infection: 0.03 }, { years: 0.03 }] },
        { label: 'Burn it off', hint: 'Clean, expensive, educational', effects: [{ fuel: -800 }, { years: 0.02 }, { research: 1 }] },
        { label: 'Take a sample first', hint: 'Knowledge with a small risk', effects: [{ samples: 1 }, { research: 2 }, { infection: 0.01 }, { years: 0.04 }] },
      ],
    },
    {
      id: 'deep-random-sealed-crate', trigger: 'random', weight: 1.0,
      title: 'A crate nobody loaded',
      text: 'A sealed crate is wedged behind a bulkhead. The manifest has no entry for it.',
      choices: [
        { label: 'Crack it open', hint: 'Maybe scrap, maybe damage', effects: [{ chance: 0.6, then: [{ material: 'minerals', n: 4 }], else: [{ hull: -0.05 }] }, { years: 0.02 }] },
        { label: 'Log and stow it', hint: 'Order is order', effects: [{ research: 1 }, { years: 0.01 }] },
      ],
    },
    {
      id: 'deep-random-gyro-drift', trigger: 'random', weight: 1.0,
      title: 'The gyros wobble',
      text: 'The ship holds its heading badly. It is not dangerous yet, which is exactly when to fix it.',
      choices: [
        { label: 'Rocky re-trims the gyros', hint: 'Needs 1 mineral', requires: { materials: { minerals: 1 } }, effects: [{ material: 'minerals', n: -1 }, { hull: 0.05 }, { years: 0.02 }, { log: '"Steady. Amaze," Rocky says.' }] },
        { label: 'Use thrusters', hint: 'Fuel for a quick trim', effects: [{ fuel: -700 }, { years: 0.01 }] },
        { label: 'Let it wobble', hint: 'Save the hours, spend the hull', effects: [{ research: 1 }, { hull: -0.03 }, { years: -0.01 }] },
      ],
    },
    {
      id: 'deep-random-pit-inspection', trigger: 'random', weight: 0.9,
      title: 'A new pit in the plate',
      text: 'A fresh chip in the inner plate catches the light. It was not there yesterday.',
      choices: [
        { label: 'Patch it', hint: 'Needs 1 mineral', requires: { materials: { minerals: 1 } }, effects: [{ material: 'minerals', n: -1 }, { hull: 0.07 }, { years: 0.02 }] },
        { label: 'Measure the pit', hint: 'Data, no repair', effects: [{ research: 2 }, { years: 0.03 }, { hull: -0.02 }] },
        { label: 'Paint over it', hint: 'Fast and dishonest', effects: [{ hull: -0.03 }, { years: 0.01 }] },
      ],
    },
    {
      id: 'deep-random-relay-ghost', trigger: 'random', weight: 0.7,
      title: 'A ghost on the relay',
      text: 'The comms array hears an old beacon repeating a route that no ship has flown in a century.',
      choices: [
        { label: 'Answer the ghost', hint: 'Research and a recorded flag', effects: [{ research: 3 }, { years: 0.04 }, { flag: 'deep-ghost-answer' }] },
        { label: 'Mute the channel', hint: 'A small burn and some silence', effects: [{ fuel: -100 }, { years: 0.01 }, { log: 'The channel goes quiet. It does not stay quiet for long.' }] },
      ],
    },
    {
      id: 'deep-random-thermal-creep', trigger: 'random', weight: 1.0,
      title: 'Thermal creep',
      text: 'The hull is warmer than the model predicts. The insulation is doing its best, which is not enough.',
      choices: [
        { label: 'Vent the heat', hint: 'Fuel and a little data', effects: [{ fuel: -250 }, { years: 0.01 }, { research: 1 }] },
        { label: 'Study the creep', hint: 'Knowledge for a scarred plate', effects: [{ research: 3 }, { hull: -0.04 }, { years: 0.04 }] },
        { label: 'Ignore it', hint: 'Speed at a price', effects: [{ hull: -0.06 }, { years: -0.01 }] },
      ],
    },
    {
      id: 'deep-random-rocky-speed-question', trigger: 'random', weight: 0.8,
      title: 'Rocky checks the speed',
      text: 'Rocky stares at the velocity readout. "Very fast. How fast is too fast? Question?"',
      choices: [
        { label: 'Show him the readouts', hint: 'He is delighted', effects: [{ research: 2 }, { years: 0.02 }, { log: '"Fast. Amaze," Rocky says.' }] },
        { label: 'Tell him to slow the ship', hint: 'Fuel saved, weeks lost', effects: [{ fuel: 400 }, { years: 0.05 }, { research: 1 }] },
      ],
    },
    {
      id: 'deep-random-time-debt', trigger: 'random', weight: 0.9,
      title: 'Time debt',
      text: 'The ship logs and the world logs no longer agree. The difference is small, but it compounds.',
      choices: [
        { label: 'Reconcile the logs', hint: 'Careful work', effects: [{ research: 3 }, { years: 0.04 }] },
        { label: 'Let the debt stand', hint: 'Keep the hours, keep the error', effects: [{ years: -0.01 }, { hull: -0.02 }] },
      ],
    },
    {
      id: 'deep-random-filter-scum', trigger: 'random', weight: 1.1,
      title: 'Scum in the filter',
      text: 'The fuel filter has grown a layer of something dark. It could be contamination or just space being space.',
      choices: [
        { label: 'Clean the filter', hint: 'Needs 1 volatile', requires: { materials: { volatiles: 1 } }, effects: [{ material: 'volatiles', n: -1 }, { research: 1 }, { years: 0.02 }] },
        { label: 'Run the dirty loop', hint: 'Faster, harder on the drive', effects: [{ hull: -0.05 }, { years: -0.01 }] },
        { label: 'Fit a spare element', hint: 'Needs 1 silicate', requires: { materials: { silicates: 1 } }, effects: [{ material: 'silicates', n: -1 }, { hull: 0.05 }, { fuel: -200 }, { years: 0.01 }] },
      ],
    },

    // ---- arrival: 5 cards -----------------------------------------------------
    {
      id: 'deep-arrive-shadow-belt', trigger: 'arrive', weight: 1.4,
      title: 'Something in the shadow',
      text: (s, ctx) => `A belt of cold debris cuts across the approach to ${ctx?.star || s.ship?.starId || 'the star'}. It is dark until the ship is very close.`,
      choices: [
        { label: 'Scan the belt first', hint: 'Fuel and hours for a clear path', effects: [{ research: 3 }, { fuel: -200 }, { years: 0.04 }] },
        { label: 'Drop in through the gaps', hint: 'Fast and a little rough', effects: [{ hull: -0.05 }, { years: 0.01 }, { research: 1 }] },
        { label: 'Brake high above it', hint: 'Expensive caution', effects: [{ fuel: -1200 }, { years: 0.02 }] },
      ],
    },
    {
      id: 'deep-arrive-blue-dawn', trigger: 'arrive', weight: 1.0,
      title: 'Blue dawn',
      text: 'The destination star is a blue-white point coming closer. At this speed even its gentle light arrives sharp.',
      choices: [
        { label: 'Raise the shield', hint: 'Fuel for a clean bow', effects: [{ fuel: -500 }, { years: 0.01 }] },
        { label: 'Measure the blue shift', hint: 'Data with a small cost', effects: [{ research: 4 }, { hull: -0.03 }, { years: 0.03 }] },
        { label: 'Go dark and coast in', hint: 'Slow, quiet, useful', effects: [{ research: 1 }, { years: 0.05 }, { hull: -0.01 }] },
      ],
    },
    {
      id: 'deep-arrive-probe-orbit', trigger: 'arrive', weight: 0.9,
      title: 'A probe in orbit',
      text: 'Something small is already in orbit here, silent and patient. It was built by nobody you recognize.',
      choices: [
        { label: 'Dock with the probe', hint: 'Big research, some risk', effects: [{ research: 5 }, { hull: -0.02 }, { years: 0.05 }] },
        { label: 'Strip its antenna', hint: 'Material for the shop', effects: [{ material: 'silicates', n: 2 }, { research: 1 }, { years: 0.03 }] },
        { label: 'Observe from orbit', hint: 'Clean data for fuel', effects: [{ research: 2 }, { fuel: -300 }, { years: 0.02 }] },
      ],
    },
    {
      id: 'deep-arrive-rocky-first-light', trigger: 'arrive', weight: 0.8, once: true,
      title: 'Rocky sees a new sun',
      text: 'Rocky presses both hands to the viewport. "New star. Different light. Amaze." He has gone entirely still.',
      choices: [
        { label: 'Let him name a feature', hint: 'He will remember it', effects: [{ flag: 'deep-first-light' }, { research: 2 }, { years: 0.03 }, { log: '"Mine. Amaze," Rocky says.' }] },
        { label: 'Put him on the scope', hint: 'Work instead of wonder', effects: [{ research: 3 }, { fuel: -200 }, { years: 0.02 }] },
      ],
    },
    {
      id: 'deep-arrive-lane-mouth', trigger: 'arrive', weight: 1.2,
      title: 'The lane mouth',
      text: 'Astrophage pours into this system along a visible lane. The intake is already humming at the thought of it.',
      choices: [
        { label: 'Sample the lane mouth', hint: 'Samples and data, infection risk', effects: [{ samples: 2 }, { research: 2 }, { infection: 0.03 }, { years: 0.04 }] },
        { label: 'Seal the intakes and pass', hint: 'Fuel for a clean arrival', effects: [{ fuel: -900 }, { years: 0.02 }] },
        { label: 'Map the mouth from outside', hint: 'Good data, long hours', effects: [{ research: 4 }, { fuel: -300 }, { years: 0.06 }] },
      ],
    },
  ],
};
