/**
 * The sample climate debate, written as its participants' actions. This file is the single
 * source of truth for the seeded texts: the runner hashes each text into the on-chain
 * contentURI and pins the same bytes to IPFS, so content can never drift.
 *
 * Budgets: every persona holds 100 vote tokens and each argument here stakes the
 * minimum 10-token deposit - alice authors 6, bob 10, carol 2, and dan 6 arguments. In the rating phase,
 * erika and frank join as pure raters, and the authors spend leftover budget. Finally the debate reaches
 * Tallying by the clock and erika tallies it, so the seeded sample ends Finished with a visible outcome.
 */

import type { DebateScript } from '../devstack/debate';

export const climateDebate: DebateScript = {
  timeUnitSeconds: 3600,
  creator: 'alice',
  thesis: 'Fight climate change?',
  steps: [
    // Level 1: direct responses to the thesis.
    { kind: 'add', user: 'alice', key: 'habitability', parent: 'thesis', side: 'pro', approval: 85, text: 'Threatens habitability' },
    { kind: 'add', user: 'alice', key: 'act-now', parent: 'thesis', side: 'pro', approval: 70, text: 'Cheaper to act now' },
    { kind: 'add', user: 'alice', key: 'jobs', parent: 'thesis', side: 'pro', approval: 60, text: 'Transition creates jobs' },
    { kind: 'add', user: 'alice', key: 'poor-countries', parent: 'thesis', side: 'con', approval: 65, text: 'Slows poor countries' },
    { kind: 'add', user: 'alice', key: 'free-rider', parent: 'thesis', side: 'con', approval: 55, text: 'Free-rider problem' },
    { kind: 'add', user: 'alice', key: 'innovation', parent: 'thesis', side: 'con', approval: 50, text: 'Innovation will fix it' },

    // Child arguments require finalized parents; finalization unlocks one time unit after creation.
    { kind: 'wait', timeUnits: 1 },

    // Level 2: replies to the six top-level arguments.
    { kind: 'add', user: 'bob', key: 'displacement', parent: 'habitability', side: 'pro', approval: 85, text: 'Heatwaves, droughts, and rising seas already displace millions of people every year.' },
    { kind: 'add', user: 'bob', key: 'feedback-loops', parent: 'habitability', side: 'pro', approval: 70, text: 'Feedback loops such as permafrost thaw risk locking in irreversible warming.' },
    { kind: 'add', user: 'bob', key: 'adapted-before', parent: 'habitability', side: 'con', approval: 60, text: 'Human societies have adapted to major environmental shifts throughout history.' },
    { kind: 'add', user: 'bob', key: 'damage-costs', parent: 'act-now', side: 'pro', approval: 75, text: 'Damage estimates for unchecked warming dwarf the costs of mitigation.' },
    { kind: 'add', user: 'bob', key: 'uncertain-projections', parent: 'act-now', side: 'con', approval: 55, text: 'Cost projections spanning a century are too uncertain to justify specific spending today.' },
    { kind: 'add', user: 'bob', key: 'cheap-renewables', parent: 'jobs', side: 'pro', approval: 80, text: 'Renewables are now the cheapest source of new electricity in most of the world.' },
    { kind: 'add', user: 'bob', key: 'job-losses', parent: 'jobs', side: 'con', approval: 60, text: 'Fossil-fuel regions face concentrated job losses that transition programs rarely replace.' },
    { kind: 'add', user: 'bob', key: 'fossil-industrialization', parent: 'poor-countries', side: 'pro', approval: 65, text: 'Cheap fossil energy underpinned every industrialization to date.' },
    { kind: 'add', user: 'bob', key: 'leapfrog', parent: 'poor-countries', side: 'con', approval: 70, text: 'Distributed renewables can leapfrog fossil grids, as mobile networks leapfrogged landlines.' },
    { kind: 'add', user: 'bob', key: 'enforcement', parent: 'free-rider', side: 'con', approval: 70, text: 'Coordination problems argue for building enforcement mechanisms, not for doing nothing.' },
    { kind: 'add', user: 'carol', key: 'solar-cost-fall', parent: 'innovation', side: 'pro', approval: 75, text: 'Solar power costs fell by roughly ninety percent within a decade.' },
    { kind: 'add', user: 'carol', key: 'subsidies-drove-it', parent: 'innovation', side: 'con', approval: 65, text: 'That cost fall was itself the product of decades of public subsidies and policy support.' },

    { kind: 'wait', timeUnits: 1 },

    // Level 3: replies to selected second-level arguments.
    { kind: 'add', user: 'dan', key: 'submersion', parent: 'displacement', side: 'pro', approval: 75, text: 'Small island nations already face permanent submersion of inhabited land.' },
    { kind: 'add', user: 'dan', key: 'mixed-causes', parent: 'displacement', side: 'con', approval: 55, text: 'Attribution of migration to climate alone is contested; most moves have mixed causes.' },
    { kind: 'add', user: 'dan', key: 'pace-of-warming', parent: 'adapted-before', side: 'con', approval: 70, text: 'The projected pace of warming outstrips anything societies have adapted to before.' },
    { kind: 'add', user: 'dan', key: 'uncertainty-cuts-both-ways', parent: 'uncertain-projections', side: 'con', approval: 70, text: 'Uncertainty cuts both ways: damages could just as well be far worse than projected.' },
    { kind: 'add', user: 'dan', key: 'off-grid-solar', parent: 'leapfrog', side: 'pro', approval: 65, text: 'Off-grid solar already powers tens of millions of homes across Africa and Asia.' },
    { kind: 'add', user: 'dan', key: 'storage-lags', parent: 'solar-cost-fall', side: 'con', approval: 60, text: "Cheap panels alone don't decarbonize grids; storage and transmission still lag." },

    // Rating: editing ends after seven time units (two have passed), and the debate enters Rating by the
    // clock alone - no poke. Participants then price the arguments; trading the thin constant-product markets
    // produces uneven percentages, and con stakes push overrated arguments below 50%.
    { kind: 'wait', timeUnits: 5 },
    { kind: 'stake', user: 'erika', argument: 'habitability', side: 'pro', amount: 5 },
    { kind: 'stake', user: 'erika', argument: 'jobs', side: 'pro', amount: 2 },
    { kind: 'stake', user: 'erika', argument: 'uncertain-projections', side: 'con', amount: 2 },
    { kind: 'stake', user: 'erika', argument: 'innovation', side: 'con', amount: 3 },
    { kind: 'stake', user: 'frank', argument: 'innovation', side: 'con', amount: 2 },
    { kind: 'stake', user: 'frank', argument: 'adapted-before', side: 'con', amount: 4 },
    { kind: 'stake', user: 'frank', argument: 'displacement', side: 'pro', amount: 7 },
    { kind: 'stake', user: 'frank', argument: 'free-rider', side: 'con', amount: 1 },
    { kind: 'stake', user: 'frank', argument: 'fossil-industrialization', side: 'pro', amount: 3 },
    { kind: 'stake', user: 'alice', argument: 'act-now', side: 'pro', amount: 4 },
    { kind: 'stake', user: 'carol', argument: 'solar-cost-fall', side: 'pro', amount: 3 },
    { kind: 'stake', user: 'carol', argument: 'subsidies-drove-it', side: 'pro', amount: 2 },
    { kind: 'stake', user: 'dan', argument: 'job-losses', side: 'con', amount: 6 },
    { kind: 'stake', user: 'dan', argument: 'mixed-causes', side: 'con', amount: 7 },

    // Rating ends ten time units after creation; the clock enters Tallying on its own and erika tallies the
    // tree so the seeded sample finishes with a computed outcome (the thesis confirmed or objected).
    { kind: 'wait', timeUnits: 4 },
    { kind: 'tally', user: 'erika' },
  ],
};
