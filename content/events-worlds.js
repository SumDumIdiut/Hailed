// The worlds content pack: arrival and survey events for the typed worlds of the Hail Mary.
// Plain data only; text and when read the actual star or planet off ctx so the card can name them.
// Effects are plain data so saves stay JSON.

const BINARIES = ['alphacen', 'cyg61'];

function starAt(s, ctx) {
  const id = ctx?.starId || s?.ship?.starId;
  if (!id) return null;
  const st = (s?.stars || []).find((x) => x.id === id);
  return st || null;
}
function planetAt(s, ctx) {
  const pid = ctx?.planetId || null;
  const st = pid
    ? (s?.stars || []).find((x) => x.id === String(pid).split('-')[0])
    : (s?.stars || []).find((x) => x.id === (s?.ship?.starId || '')) || null;
  const p = st?.planets?.find((x) => x.id === pid) || null;
  return p || null;
}
const hasType = (s, ctx, type) => { const p = planetAt(s, ctx); return !!p && p.type === type; };
const starInf = (s, ctx) => starAt(s, ctx)?.infection ?? 0;
const isM = (s, ctx) => { const st = starAt(s, ctx); return !!st && String(st.spectral || '').charAt(0) === 'M'; };
const isSpectral = (s, ctx, letter) => { const st = starAt(s, ctx); return !!st && String(st.spectral || '').charAt(0) === letter; };
const binaryHere = (s, ctx) => BINARIES.includes(String(ctx?.starId || s?.ship?.starId));

export default {
  id: 'events-worlds',
  events: [
    // ---- arrival: stars that are not what they seemed ------------------------------

    {
      id: 'worlds-arrive-mdwarf-flare',
      trigger: 'arrive', weight: 2, once: true,
      title: 'Flare on an M dwarf',
      text: (s, ctx) => `The ${ctx?.starId || s?.ship?.starId} flares and does not blink: a white sheet of plasma climbs over the disc and holds there.`,
      choices: [
        { label: 'Take the night side', hint: 'Burn fuel, keep the drive cool', effects: [{ fuel: -650 }, { years: 0.03 }] },
        { label: 'Ride the flare', hint: 'Hull loss, no detour', effects: [{ hull: -0.13 }, { years: -0.01 }] },
      ],
      when: (s, ctx) => isM(s, ctx),
    },
    {
      id: 'worlds-arrive-binary-companion',
      trigger: 'arrive', weight: 1,
      title: 'The companion',
      text: (s, ctx) => `A second sun answers the first. The ${ctx?.starId || s?.ship?.starId} you came to has a partner, and the pair argues about the dark.`,
      choices: [
        { label: 'Plot on the pair', hint: 'Tighter lane, more fuel', effects: [{ fuel: -900 }, { research: 2 }, { years: 0.02 }] },
        { label: 'Break the pair', hint: 'Hard burn', effects: [{ fuel: -1500 }, { hull: 0.03 }, { years: -0.01 }] },
      ],
      when: binaryHere,
    },
    {
      id: 'worlds-arrive-dark-star',
      trigger: 'arrive', weight: 2, once: true,
      title: 'The dark star',
      text: (s, ctx) => `You arrive at ${ctx?.starId || s?.ship?.starId} and the charts go pale.`,
      choices: [
        { label: 'Orbit anyway', hint: 'The dark might be a lie', effects: [{ fuel: -550 }, { research: 2 }, { years: 0.03 }] },
        { label: 'Burn home', hint: 'No goodbyes in the dark', effects: [{ fuel: -700 }, { years: 0.05 }] },
      ],
      when: (s, ctx) => starAt(s, ctx)?.dark === true,
    },
    {
      id: 'worlds-arrive-saved-thanks',
      trigger: 'arrive', weight: 1, once: true,
      title: 'A saved star',
      text: (s, ctx) => `The ${ctx?.starId || s?.ship?.starId} you saved still turns its old light toward you, out of habit or mercy.`,
      choices: [
        { label: 'Send the strain home', hint: 'Research', effects: [{ research: 3 }, { flag: 'worlds-thanks' }, { years: 0.02 }] },
        { label: 'Wave the drive', hint: 'Fuel for the farewell burn', effects: [{ fuel: -800 }, { log: 'You wave at the star you saved. It does not wave back.' }] },
      ],
      when: (s, ctx) => starAt(s, ctx)?.saved === true,
    },
    {
      id: 'worlds-arrive-lava-world',
      trigger: 'arrive', weight: 1,
      title: 'Lava world arrival',
      text: (s, ctx) => `The jump brings you over slow fire. The ${ctx?.starId || s?.ship?.starId} opens on glass crust and rivers of lava underneath.`,
      choices: [
        { label: 'Hold a high orbit', hint: 'Patience', effects: [{ fuel: -450 }, { years: 0.03 }] },
        { label: 'Skim the upper mantle', hint: 'Samples, hull risk', effects: [{ samples: 1 }, { hull: -0.06 }, { years: 0.02 }] },
      ],
      when: (s, ctx) => hasType(s, ctx, 'lava'),
    },
    {
      id: 'worlds-arrive-ice-ring',
      trigger: 'arrive', weight: 1,
      title: 'A ring of frost',
      text: (s, ctx) => `A ring of frozen dust closes the ${ctx?.starId || s?.ship?.starId} system: ice, rock, and the long dark between.`,
      choices: [
        { label: 'Cross the ring', hint: 'Fuel for the slingshot', effects: [{ fuel: -800 }, { years: -0.02 }] },
        { label: 'Orbit the ring', hint: 'Survey from a safe distance', effects: [{ research: 2 }, { fuel: -350 }, { years: 0.04 }] },
      ],
      when: (s, ctx) => { const p = planetAt(s, ctx); return !!p && !!p.rings; },
    },
    {
      id: 'worlds-arrive-gas-giant',
      trigger: 'arrive', weight: 1,
      title: 'Gas giant arrival',
      text: (s, ctx) => `The ${ctx?.starId || s?.ship?.starId} system opens on a giant: hydrogen oceans miles deep, ammonia rain on the way down.`,
      choices: [
        { label: 'Sail the upper cloud deck', hint: 'Fuel, little hull', effects: [{ fuel: 900 }, { hull: -0.03 }, { years: 0.02 }] },
        { label: 'Hold the parking orbit', hint: 'Patience', effects: [{ fuel: -300 }, { years: 0.02 }] },
      ],
      when: (s, ctx) => hasType(s, ctx, 'gas'),
    },
    {
      id: 'worlds-arrive-rocky-shore',
      trigger: 'arrive', weight: 1,
      title: 'Rocky shores',
      text: (s, ctx) => `The shore of ${ctx?.starId || s?.ship?.starId} is rock and cold iron. Rocky has a question.`,
      choices: [
        { label: 'Settle in', hint: 'He likes the quiet', effects: [{ research: 1 }, { years: 0.02 }, { log: 'Rocky: "Good ground. Amaze. Question?"' }] },
        { label: 'Keep moving', hint: 'Fuel for the burn', effects: [{ fuel: -1000 }, { years: 0.01 }] },
      ],
      when: (s, ctx) => hasType(s, ctx, 'rocky'),
    },
    {
      id: 'worlds-arrive-desert-dust',
      trigger: 'arrive', weight: 1,
      title: 'Bad dust',
      text: (s, ctx) => `The world of ${ctx?.starId || s?.ship?.starId} is all dust and waiting. Rocky does not like the quiet. "Bad bad bad."`,
      choices: [
        { label: 'Check the seals', hint: 'He mans the airlock', requires: { materials: { silicates: 1 } }, effects: [{ material: 'silicates', n: -1 }, { years: 0.01 }, { hull: 0.02 }] },
        { label: 'Leave it', hint: 'Best not to wake him', effects: [{ fuel: -500 }, { years: 0.03 }] },
      ],
      when: (s, ctx) => hasType(s, ctx, 'desert'),
    },
    {
      id: 'worlds-arrive-petrova-line',
      trigger: 'arrive', weight: 1,
      title: 'The Petrova line',
      text: (s, ctx) => `The Petrova line at ${ctx?.starId || s?.ship?.starId} is singing wrong: a hum where a carrier should be, and the tanks feel it.`,
      choices: [
        { label: 'Tap the line', hint: 'Listen', effects: [{ research: 2 }, { years: 0.02 }, { log: 'The line answers in the old tongue.' }] },
        { label: 'Sever the line', hint: 'Burn the fuel line', requires: { fuelKg: 1200 }, effects: [{ fuel: -1200 }, { flag: 'petrova-line-cut' }] },
      ],
      when: (s, ctx) => starInf(s, ctx) > 0.05,
    },
    {
      id: 'worlds-arrive-infection-bloom',
      trigger: 'arrive', weight: 1,
      title: 'The bloom arrives early',
      text: (s, ctx) => `The bloom reached ${ctx?.starId || s?.ship?.starId} before the charts did. The star is dimming behind it.`,
      choices: [
        { label: 'Burn the tanks', hint: 'Fuel now, infection later', effects: [{ fuel: 6000 }, { infection: 0.02 }] },
        { label: 'Hold steady', hint: 'Patience', effects: [{ years: 0.04 }, { research: 1 }] },
      ],
      when: (s, ctx) => starInf(s, ctx) > 0.2,
    },
    {
      id: 'worlds-arrive-ocean-still',
      trigger: 'arrive', weight: 1,
      title: 'A quiet ocean',
      text: (s, ctx) => `The ${ctx?.starId || s?.ship?.starId} system opens on an ocean that has not seen a star in a billion years.`,
      choices: [
        { label: 'Dive the deep', hint: 'Samples', effects: [{ samples: 2 }, { hull: -0.05 }, { years: 0.03 }] },
        { label: 'Orbit high', hint: 'Patience', effects: [{ fuel: -300 }, { research: 1 }, { years: 0.02 }] },
      ],
      when: (s, ctx) => hasType(s, ctx, 'ocean'),
    },
    {
      id: 'worlds-arrive-ash-cloud',
      trigger: 'arrive', weight: 1,
      title: 'The shroud',
      text: (s, ctx) => `The ${ctx?.starId || s?.ship?.starId} arrives wrapped in ash from its own burning: a shroud the size of a system.`,
      choices: [
        { label: 'Burn through', hint: 'Hull', effects: [{ hull: -0.1 }, { years: -0.01 }] },
        { label: 'Wait under the shroud', hint: 'Fuel', effects: [{ fuel: -900 }, { years: 0.05 }] },
      ],
      when: (s, ctx) => starInf(s, ctx) > 0.3,
    },
    {
      id: 'worlds-arrive-light-echo',
      trigger: 'arrive', weight: 1,
      title: 'A light that repeats',
      text: (s, ctx) => `Something at ${ctx?.starId || s?.ship?.starId} blinks in a rhythm a star should not blink in.`,
      choices: [
        { label: 'Log the pattern', hint: 'Research', effects: [{ research: 2 }, { log: 'The star is talking. The star is lying.' }] },
        { label: 'Mask the drive', hint: 'Fuel', effects: [{ fuel: -400 }, { years: 0.02 }] },
      ],
      when: (s, ctx) => starInf(s, ctx) > 0.25,
    },
    {
      id: 'worlds-arrive-wind',
      trigger: 'arrive', weight: 1,
      title: 'The stellar wind',
      text: (s, ctx) => `The wind at ${ctx?.starId || s?.ship?.starId} is a fist: stellar wind at ten times the norm.`,
      choices: [
        { label: 'Angle the sail', hint: 'Fuel', effects: [{ fuel: -700 }, { years: 0.03 }] },
        { label: 'Ride it', hint: 'Time saved', effects: [{ years: -0.01 }, { fuel: -300 }] },
      ],
      when: (s, ctx) => isSpectral(s, ctx, 'A') || isSpectral(s, ctx, 'B'),
    },
    {
      id: 'worlds-arrive-quiet-star',
      trigger: 'arrive', weight: 1,
      title: 'The tired star',
      text: (s, ctx) => `The ${ctx?.starId || s?.ship?.starId} burns low and even, the way old stars burn when they are tired.`,
      choices: [
        { label: 'Take the readings', hint: 'Research', effects: [{ research: 2 }, { years: 0.03 }] },
        { label: 'Move on', hint: 'Fuel', effects: [{ fuel: -600 }, { years: 0.02 }] },
      ],
      when: (s, ctx) => isSpectral(s, ctx, 'K'),
    },
    {
      id: 'worlds-arrive-pale-star',
      trigger: 'arrive', weight: 1,
      title: 'The chapel in the dark',
      text: (s, ctx) => `The ${ctx?.starId || s?.ship?.starId} is barely a star and barely burning. The arrival corridor feels like a chapel.`,
      choices: [
        { label: 'Hold orbit', hint: 'Patience', effects: [{ fuel: -350 }, { years: 0.03 }] },
        { label: 'Break the orbit', hint: 'Hard burn', effects: [{ fuel: -900 }, { hull: 0.03 }] },
      ],
      when: (s, ctx) => (starAt(s, ctx)?.lum ?? 1) < 0.01,
    },
    {
      id: 'worlds-arrive-blue-star',
      trigger: 'arrive', weight: 1,
      title: 'Blue-white fury',
      text: (s, ctx) => `The ${ctx?.starId || s?.ship?.starId} is blue-white and furious: the arrival light is a blade.`,
      choices: [
        { label: 'Shade the drive', hint: 'Hull', effects: [{ hull: 0.04 }, { years: 0.01 }] },
        { label: 'Fly into it', hint: 'Fuel for the burn', effects: [{ fuel: -800 }, { years: -0.01 }] },
      ],
      when: (s, ctx) => isSpectral(s, ctx, 'B'),
    },
    {
      id: 'worlds-arrive-frozen-world',
      trigger: 'arrive', weight: 1,
      title: 'Ice world arrival',
      text: (s, ctx) => `The ${ctx?.starId || s?.ship?.starId} system opens on ice, and the moon on the inner ring is old beyond counting.`,
      choices: [
        { label: 'Sample the ice', hint: 'Volatiles', effects: [{ material: 'volatiles', n: 3 }, { years: 0.02 }] },
        { label: 'Orbit warm', hint: 'Fuel', effects: [{ fuel: -450 }, { years: 0.02 }] },
      ],
      when: (s, ctx) => hasType(s, ctx, 'ice'),
    },
    {
      id: 'worlds-arrive-cold-rock',
      trigger: 'arrive', weight: 1,
      title: 'Cold rock',
      text: (s, ctx) => `The ${ctx?.starId || s?.ship?.starId} system opens on rock that has been cold since before the star was born.`,
      choices: [
        { label: 'Drill the crust', hint: 'Samples, hull', effects: [{ samples: 1 }, { hull: -0.04 }, { years: 0.02 }] },
        { label: 'Leave it cold', hint: 'Fuel', effects: [{ fuel: -500 }, { years: 0.02 }] },
      ],
      when: (s, ctx) => hasType(s, ctx, 'rocky'),
    },

    // ---- survey: worlds the ship is actually flying over ----------------------------

    {
      id: 'worlds-survey-lava-microbial',
      trigger: 'survey', weight: 2, once: true,
      title: 'Thermophile magma',
      text: (s, ctx) => `The magma of ${planetAt(s, ctx)?.name || ctx?.planetId} is alive and it is not Astrophage: heat-born microbes burning in the lava.`,
      choices: [
        { label: 'Culture the thermophiles', hint: 'Samples, big research', effects: [{ samples: 2 }, { research: 3 }, { years: 0.03 }] },
        { label: 'Walk away', hint: 'Patience', effects: [{ years: 0.05 }, { research: 1 }] },
      ],
      when: (s, ctx) => hasType(s, ctx, 'lava'),
    },
    {
      id: 'worlds-survey-ocean-microbial',
      trigger: 'survey', weight: 2, once: true,
      title: 'The dark ocean',
      text: (s, ctx) => `The ocean of ${planetAt(s, ctx)?.name || ctx?.planetId} runs dark and full of things that photosynthesize without a sun. They are not Astrophage.`,
      choices: [
        { label: 'Sample the deep', hint: 'Samples', effects: [{ samples: 2 }, { research: 2 }, { years: 0.03 }] },
        { label: 'Chart the dark', hint: 'Research', effects: [{ research: 3 }, { years: 0.04 }] },
      ],
      when: (s, ctx) => hasType(s, ctx, 'ocean'),
    },
    {
      id: 'worlds-survey-ice-microbial',
      trigger: 'survey', weight: 1,
      title: 'Ice microbes',
      text: (s, ctx) => `The ice of ${planetAt(s, ctx)?.name || ctx?.planetId} holds microbes that woke when the world was young. They are not Astrophage.`,
      choices: [
        { label: 'Thaw a core', hint: 'Samples, research', effects: [{ samples: 2 }, { research: 2 }, { years: 0.03 }, { hull: -0.02 }] },
        { label: 'Drill clean', hint: 'Minerals', effects: [{ material: 'minerals', n: 2 }, { years: 0.02 }] },
      ],
      when: (s, ctx) => hasType(s, ctx, 'ice'),
    },
    {
      id: 'worlds-survey-desert-microbial',
      trigger: 'survey', weight: 1,
      title: 'Desert microbes',
      text: (s, ctx) => `The desert of ${planetAt(s, ctx)?.name || ctx?.planetId} is not empty. Endolithic microbes ride the dark between grains.`,
      choices: [
        { label: 'Sample the grains', hint: 'Volatiles, samples', effects: [{ material: 'volatiles', n: 2 }, { samples: 1 }, { years: 0.02 }] },
        { label: 'Walk the dunes', hint: 'Research', effects: [{ research: 2 }, { years: 0.02 }] },
      ],
      when: (s, ctx) => hasType(s, ctx, 'desert'),
    },
    {
      id: 'worlds-survey-gas-microbial',
      trigger: 'survey', weight: 1,
      title: 'Gas microbes',
      text: (s, ctx) => `The atmosphere of ${planetAt(s, ctx)?.name || ctx?.planetId} breathes. Gas-phase microbes drift where no ocean ever was.`,
      choices: [
        { label: 'Scoop a cloud', hint: 'Fuel, samples', effects: [{ material: 'gas', n: 2 }, { samples: 1 }, { years: 0.03 }] },
        { label: 'Watch the winds', hint: 'Research', effects: [{ research: 2 }, { years: 0.03 }] },
      ],
      when: (s, ctx) => hasType(s, ctx, 'gas'),
    },
    {
      id: 'worlds-survey-rocky-microbial',
      trigger: 'survey', weight: 2,
      title: 'Subsurface sea',
      text: (s, ctx) => `Beneath the rock of ${planetAt(s, ctx)?.name || ctx?.planetId} the planet keeps its own small sea. The microbes there are not Astrophage.`,
      choices: [
        { label: 'Drill through', hint: 'Samples, hull', effects: [{ samples: 2 }, { hull: -0.03 }, { years: 0.03 }] },
        { label: 'Map the seam', hint: 'Research', effects: [{ research: 3 }, { years: 0.02 }] },
      ],
      when: (s, ctx) => hasType(s, ctx, 'rocky'),
    },
    {
      id: 'worlds-survey-microbial-fossil',
      trigger: 'survey', weight: 1, once: true,
      title: 'The first microbe',
      text: (s, ctx) => `The core of ${planetAt(s, ctx)?.name || ctx?.planetId} holds a fossil of the first microbe, older than the star that feeds it.`,
      choices: [
        { label: 'Sequence it', hint: 'Big research', requires: { research: 5 }, effects: [{ research: 5 }, { years: 0.04 }, { flag: 'worlds-microbial-fossil' }] },
        { label: 'Discard it', hint: 'Clean slate', effects: [{ samples: 1 }] },
      ],
      when: (s, ctx) => hasType(s, ctx, 'ice'),
    },
    {
      id: 'worlds-survey-ancient-sea',
      trigger: 'survey', weight: 2,
      title: 'The old sea',
      text: (s, ctx) => `The rock of ${planetAt(s, ctx)?.name || ctx?.planetId} is a skin over an ocean that is not water. Something swims in the dark, and it is not Astrophage.`,
      choices: [
        { label: 'Drop a probe', hint: 'Samples', effects: [{ samples: 2 }, { years: 0.03 }, { hull: -0.02 }] },
        { label: 'Sample the rock', hint: 'Minerals', effects: [{ material: 'minerals', n: 3 }, { years: 0.02 }] },
      ],
      when: (s, ctx) => hasType(s, ctx, 'rocky'),
    },
    {
      id: 'worlds-survey-ring-system',
      trigger: 'survey', weight: 2,
      title: 'Rings',
      text: (s, ctx) => `The rings of ${planetAt(s, ctx)?.name || ctx?.planetId} are ice and iron, and they answer when you sing.`,
      choices: [
        { label: 'Take a sample', hint: 'Volatiles', effects: [{ material: 'volatiles', n: 3 }, { years: 0.02 }] },
        { label: 'Chart the gaps', hint: 'Research', effects: [{ research: 3 }, { fuel: -250 }, { years: 0.03 }] },
      ],
      when: (s, ctx) => { const p = planetAt(s, ctx); return !!p && !!p.rings; },
    },
    {
      id: 'worlds-survey-ringed-moon',
      trigger: 'survey', weight: 1,
      title: 'The moon in the ring',
      text: (s, ctx) => `The moon hanging in the ring of ${planetAt(s, ctx)?.name || ctx?.planetId} is old and cold and probably not alive.`,
      choices: [
        { label: 'Crash the lander', hint: 'Samples, hull', effects: [{ samples: 2 }, { hull: -0.05 }, { years: 0.03 }] },
        { label: 'Circle it', hint: 'Research', effects: [{ research: 2 }, { years: 0.03 }] },
      ],
      when: (s, ctx) => { const p = planetAt(s, ctx); return !!p && !!p.rings; },
    },
    {
      id: 'worlds-survey-gas-atmo',
      trigger: 'survey', weight: 1,
      title: 'The churning air',
      text: (s, ctx) => `The atmosphere of ${planetAt(s, ctx)?.name || ctx?.planetId} churns: layers of ammonia, hydrogen, and something that refracts light wrong.`,
      choices: [
        { label: 'Skim the layer', hint: 'Fuel, samples', effects: [{ material: 'gas', n: 2 }, { samples: 1 }, { years: 0.02 }] },
        { label: 'Go deeper', hint: 'Research, hull', effects: [{ research: 3 }, { hull: -0.03 }, { years: 0.04 }] },
      ],
      when: (s, ctx) => hasType(s, ctx, 'gas'),
    },
    {
      id: 'worlds-survey-desert-strata',
      trigger: 'survey', weight: 1,
      title: 'Strata',
      text: (s, ctx) => `The strata of ${planetAt(s, ctx)?.name || ctx?.planetId} are pages: dust turned to stone, one page per thousand years.`,
      choices: [
        { label: 'Read the deep page', hint: 'Research', effects: [{ research: 4 }, { years: 0.05 }] },
        { label: 'Take a core', hint: 'Minerals', effects: [{ material: 'minerals', n: 2 }, { years: 0.02 }] },
      ],
      when: (s, ctx) => hasType(s, ctx, 'desert'),
    },
    {
      id: 'worlds-survey-lava-tube',
      trigger: 'survey', weight: 1,
      title: 'Lava tube',
      text: (s, ctx) => `The lava tube of ${planetAt(s, ctx)?.name || ctx?.planetId} is a road that ran downhill before the world cooled.`,
      choices: [
        { label: 'Drop in', hint: 'Samples, hull', effects: [{ samples: 2 }, { hull: -0.04 }, { years: 0.03 }] },
        { label: 'Seal the mouth', hint: 'Fuel', effects: [{ fuel: -300 }, { years: 0.01 }] },
      ],
      when: (s, ctx) => hasType(s, ctx, 'lava'),
    },
    {
      id: 'worlds-survey-ice-crack',
      trigger: 'survey', weight: 1,
      title: 'The exhale',
      text: (s, ctx) => `A crack in the ice of ${planetAt(s, ctx)?.name || ctx?.planetId} exhales: a jet of volatiles older than the star.`,
      choices: [
        { label: 'Catch the plume', hint: 'Samples, hull', effects: [{ material: 'volatiles', n: 3 }, { hull: -0.03 }, { years: 0.02 }] },
        { label: 'Walk the crack', hint: 'Research', effects: [{ research: 2 }, { years: 0.03 }] },
      ],
      when: (s, ctx) => hasType(s, ctx, 'ice'),
    },
    {
      id: 'worlds-survey-dune-field',
      trigger: 'survey', weight: 1,
      title: 'Dune slip',
      text: (s, ctx) => `The dunes of ${planetAt(s, ctx)?.name || ctx?.planetId} are shifting at a pace that should bury a mountain in a year.`,
      choices: [
        { label: 'Sample the slip', hint: 'Volatiles, samples', effects: [{ material: 'volatiles', n: 2 }, { samples: 1 }, { years: 0.01 }] },
        { label: 'Mark the wind', hint: 'Research', effects: [{ research: 2 }, { years: 0.02 }] },
      ],
      when: (s, ctx) => hasType(s, ctx, 'desert'),
    },
    {
      id: 'worlds-survey-storm-eye',
      trigger: 'survey', weight: 1,
      title: 'The calm eye',
      text: (s, ctx) => `The storm eye of ${planetAt(s, ctx)?.name || ctx?.planetId} is calm in the way a blade is calm.`,
      choices: [
        { label: 'Drop through', hint: 'Research, samples', effects: [{ research: 3 }, { samples: 2 }, { years: 0.04 }, { hull: -0.02 }] },
        { label: 'Orbit the calm', hint: 'Fuel', effects: [{ fuel: -400 }, { years: 0.02 }] },
      ],
      when: (s, ctx) => hasType(s, ctx, 'gas'),
    },
    {
      id: 'worlds-survey-rocky-cavern',
      trigger: 'survey', weight: 1,
      title: 'The cavern',
      text: (s, ctx) => `The cavern of ${planetAt(s, ctx)?.name || ctx?.planetId} is a wound in the rock that filled with water and then forgot the water.`,
      choices: [
        { label: 'Tether a probe', hint: 'Samples, hull', effects: [{ samples: 2 }, { hull: -0.03 }, { years: 0.03 }] },
        { label: 'Take the walls', hint: 'Minerals', effects: [{ material: 'minerals', n: 3 }, { years: 0.02 }] },
      ],
      when: (s, ctx) => hasType(s, ctx, 'rocky'),
    },
    {
      id: 'worlds-survey-ocean-vent',
      trigger: 'survey', weight: 1,
      title: 'Cold vent',
      text: (s, ctx) => `The vent of ${planetAt(s, ctx)?.name || ctx?.planetId} burns cold and rich: minerals raining into the dark.`,
      choices: [
        { label: 'Harvest the rain', hint: 'Minerals', effects: [{ material: 'minerals', n: 4 }, { years: 0.03 }] },
        { label: 'Study the burn', hint: 'Research, samples', effects: [{ research: 2 }, { samples: 1 }, { years: 0.03 }] },
      ],
      when: (s, ctx) => hasType(s, ctx, 'ocean'),
    },
    {
      id: 'worlds-survey-cryovolcano',
      trigger: 'survey', weight: 1,
      title: 'Cryovolcano',
      text: (s, ctx) => `The cryovolcano of ${planetAt(s, ctx)?.name || ctx?.planetId} erupts not fire but water and ammonia, a slow fountain.`,
      choices: [
        { label: 'Catch the fountain', hint: 'Volatiles, samples', effects: [{ material: 'volatiles', n: 3 }, { samples: 1 }, { years: 0.02 }] },
        { label: 'Watch from orbit', hint: 'Research', effects: [{ research: 2 }, { years: 0.03 }] },
      ],
      when: (s, ctx) => hasType(s, ctx, 'ice'),
    },
    {
      id: 'worlds-survey-carto-ruins',
      trigger: 'survey', weight: 1, once: true,
      title: 'The Cartographers II: the ruins',
      text: (s, ctx) => `The ruins of the Cartographers on ${planetAt(s, ctx)?.name || ctx?.planetId} hold the same patient handwriting the buoys carried, on stone that was not stone.`,
      choices: [
        { label: 'Read the stone', hint: 'Research, long', effects: [{ research: 6 }, { years: 0.06 }, { flag: 'worlds-carto-stone' }] },
        { label: 'Take the marker', hint: 'Minerals', effects: [{ material: 'minerals', n: 3 }, { years: 0.03 }] },
      ],
      when: (s, ctx) => hasType(s, ctx, 'rocky'),
    },
    {
      id: 'worlds-survey-ice-core',
      trigger: 'survey', weight: 1,
      title: 'The deep record',
      text: (s, ctx) => `The ice core of ${planetAt(s, ctx)?.name || ctx?.planetId} is a record: trapped gas from a world that no longer has an atmosphere.`,
      choices: [
        { label: 'Read the gas', hint: 'Research, samples', effects: [{ research: 3 }, { samples: 2 }, { years: 0.03 }] },
        { label: 'Drill past', hint: 'Minerals', effects: [{ material: 'minerals', n: 3 }, { years: 0.02 }] },
      ],
      when: (s, ctx) => hasType(s, ctx, 'ice'),
    },
    {
      id: 'worlds-survey-gas-cloud',
      trigger: 'survey', weight: 1,
      title: 'Cloud bands',
      text: (s, ctx) => `The cloud deck of ${planetAt(s, ctx)?.name || ctx?.planetId} carries hydrocarbons and dust, drifting in bands.`,
      choices: [
        { label: 'Scoop a band', hint: 'Fuel, samples', effects: [{ material: 'gas', n: 2 }, { samples: 1 }, { years: 0.02 }] },
        { label: 'Lift a sample', hint: 'Research', effects: [{ research: 2 }, { samples: 1 }, { years: 0.02 }] },
      ],
      when: (s, ctx) => hasType(s, ctx, 'gas'),
    },
    {
      id: 'worlds-survey-desert-glass',
      trigger: 'survey', weight: 1,
      title: 'Glass dunes',
      text: (s, ctx) => `The glass dunes of ${planetAt(s, ctx)?.name || ctx?.planetId} are fused sand from a wind that no longer exists.`,
      choices: [
        { label: 'Sample the glass', hint: 'Volatiles, samples', effects: [{ material: 'volatiles', n: 2 }, { samples: 1 }, { years: 0.01 }] },
        { label: 'Read the melt', hint: 'Research', effects: [{ research: 3 }, { years: 0.03 }] },
      ],
      when: (s, ctx) => hasType(s, ctx, 'desert'),
    },
    {
      id: 'worlds-survey-rocky-ridge',
      trigger: 'survey', weight: 1,
      title: 'The metal ridge',
      text: (s, ctx) => `The ridge of ${planetAt(s, ctx)?.name || ctx?.planetId} is pure metal, and the rock around it is tired of holding still.`,
      choices: [
        { label: 'Mine the ridge', hint: 'Minerals', effects: [{ material: 'minerals', n: 5 }, { years: 0.03 }] },
        { label: 'Leave the seam', hint: 'Fuel', effects: [{ fuel: -400 }, { years: 0.02 }] },
      ],
      when: (s, ctx) => hasType(s, ctx, 'rocky'),
    },
    {
      id: 'worlds-survey-corona',
      trigger: 'survey', weight: 1,
      when: isM,
      title: 'The hidden furnace',
      text: (s, ctx) => `The corona of ${ctx?.starId || s?.ship?.starId} is a furnace the star keeps hidden from itself.`,
      choices: [
        { label: 'Ride the flare', hint: 'Research, hull', effects: [{ research: 3 }, { hull: -0.05 }, { years: 0.03 }] },
        { label: 'Back off', hint: 'Fuel', effects: [{ fuel: -600 }, { years: 0.02 }] },
      ],
    },

    // ---- random cards: the long haul ----------------------------------------------

    {
      id: 'worlds-random-petrova-hum',
      trigger: 'random', weight: 1,
      title: 'The old song',
      text: 'The Petrova line hums a note that is not in the carrier. The tanks sing back.',
      choices: [
        { label: 'Tap the line', hint: 'Research', effects: [{ research: 2 }, { years: 0.02 }, { log: 'The line found an old song.' }] },
        { label: 'Sever the line', hint: 'Fuel', effects: [{ fuel: -1200 }, { flag: 'petrova-line-cut' }] },
      ],
    },
    {
      id: 'worlds-random-star-quiet',
      trigger: 'random', weight: 1,
      title: 'The dimming',
      text: 'The star has gone quiet in a way that has no flare behind it.',
      choices: [
        { label: 'Listen longer', hint: 'Research', effects: [{ research: 2 }, { years: 0.03 }] },
        { label: 'Keep sailing', hint: 'Fuel', effects: [{ fuel: -350 }, { years: 0.01 }] },
      ],
    },
    {
      id: 'worlds-random-rocky-alarm',
      trigger: 'random', weight: 1, once: true,
      title: 'Rocky loses the horizon',
      text: 'Rocky reads the horizon wrong. "Bad bad bad." He pulls the blanket over his head.',
      choices: [
        { label: 'Check the hull', hint: 'Hull', effects: [{ hull: 0.05 }, { years: 0.01 }] },
        { label: 'Check the fuel', hint: 'Fuel', effects: [{ fuel: 400 }, { research: 1 }] },
      ],
    },
    {
      id: 'worlds-random-bloom',
      trigger: 'random', weight: 1,
      title: 'The glow',
      text: 'Something organic lights up the dark of the world below, and it is not Astrophage.',
      choices: [
        { label: 'Sample the glow', hint: 'Samples, research', effects: [{ samples: 2 }, { research: 2 }, { years: 0.02 }] },
        { label: 'Let it breathe', hint: 'Patience', effects: [{ years: 0.03 }, { research: 1 }] },
      ],
    },
    {
      id: 'worlds-random-course',
      trigger: 'random', weight: 1,
      title: 'The route that is not',
      text: 'The nav computer keeps a course that does not exist, and the stars agree with it anyway.',
      choices: [
        { label: 'Burn to the plotted point', hint: 'Fuel, hull', effects: [{ fuel: -700 }, { years: -0.01 }] },
        { label: 'Trust the plot', hint: 'Research', effects: [{ research: 2 }, { years: 0.02 }] },
      ],
    },
  ],
};
