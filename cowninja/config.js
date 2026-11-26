// Everything about COWNinja worth tuning in playtests, in one place. Also at window.cowNinja.TUNE while the game
// runs: change a value in the console and it takes effect at once.
export const TUNE = {
  herd: {
    penSize: { hall: 8, pen: 5 },      // cows per enclosure (site.json's counts are used when present)
    followSpeedOver: 1.1,              // herd top speed as a multiple of the leader's, plus `followSpeedPlus`
    followSpeedPlus: 2, followMin: 3, followMax: 10.5,
    huddle: 1.15,                      // huddle radius = 1.4 + sqrt(cows) * huddle (metres)
    separation: 1.9,                   // cows keep this far apart
    moveSpeed: 7.5,                    // speed when sent to a spot
    chargeSpeed: 11.5, chargeAccel: 5.5,
    runup: 17,                         // how far back from a gate the herd forms up
    gatherRadius: 6.5, gatherFraction: .7, gatherTimeout: 8,
    impactWindow: .6,                  // cows arriving within this many seconds strike together
    bounceStun: 1.1,                   // seconds a cow reels after a charge that fails
    commandGateRadius: 3.5,              // a command this close to a closed gate means "charge it"
    minBlow: 3,                        // slower or more glancing than this is not a blow on a gate
    knockSpeed: 5,                     // a cow faster than this flattens a farmer in its way
  },
  // Gate strength: the sum over the cows that hit together of (speed at impact × how squarely they hit).
  // A pen gate takes about four cows at a run; the main gate about a dozen at full charge.
  gates: { hall: 30, pen: 30, main: 115 },
  rider: { throwDamage: 14 },          // a hit this hard or harder throws you off the cow
  camera: { rideBack: 6.2, rideUp: 3.3, herdBack: 9, herdUp: 8, herdFull: 14 },   // the wide view is fully out at `herdFull` cows
  finish: { linger: 5 },               // seconds after you reach safety before the count is final
};
