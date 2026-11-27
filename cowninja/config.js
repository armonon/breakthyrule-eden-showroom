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
    assessAim: .88,                    // how much of its speed a cow is expected to land, for the forecast shown before a charge
    minBlow: 3,                        // slower or more glancing than this is not a blow on a gate
    knockSpeed: 5,                     // a cow faster than this flattens a farmer in its way
  },
  // Gate strength: the sum over the cows that hit together of (speed at impact × how squarely they hit).
  // A pen gate takes about four cows at a run; the main gate about a dozen at full charge.
  gates: { hall: 30, pen: 30, main: 115 },
  rider: { throwDamage: 14, recoverGrace: 1.4, boltDistance: 13, boltSeconds: 2.4 },   // a hit this hard throws you; then a moment's grace, and the cow bolts
  // Who works here. Roles are dealt to the site's patrols in this order (and round again): workers flee and report,
  // guards come at you with a fork, gunners are guards with a pistol.
  staff: {
    roles: ['guard', 'worker', 'gunner', 'guard', 'worker', 'guard', 'gunner', 'guard', 'worker', 'guard', 'gunner'],
    reportPoints: [[-10.5, -53.5], [-20, 6], [30, -6]],   // gatehouse, office door, yard phone: a worker runs to the nearest
    fleeSpeed: 4.8, bodySight: 10, gateSight: 18, stoneRadius: 13,
    distracted: .45,                     // sight range of someone busy at his post, as a fraction of normal
    // Fixed posts with a routine: x, z, facing (yaw 0 looks toward -z), and what they are doing.
    posts: [
      { role: 'guard', x: -3.2, z: -27, yaw: Math.PI / 2, act: 'talk' }, { role: 'guard', x: -1.8, z: -27, yaw: -Math.PI / 2, act: 'talk' },
      { role: 'worker', x: -37.5, z: 27, yaw: Math.PI / 2, act: 'smoke' },
      { role: 'gunner', x: -12.2, z: -55.4, yaw: Math.PI, act: 'watch' },
      { role: 'guard', x: 99, z: 34, yaw: -Math.PI / 2, act: 'lean' },
    ],       // how far away a body on the ground is noticed
    pistol: { min: 3, range: 24, standoff: 11, aim: .9, cooldown: 1.6, accuracy: .85, dodge: .075, damageFoot: 12, damageRide: 9 },
    heavy: { min: 7, range: 34, standoff: 18, aim: 1.1, cooldown: 4.5, lead: .9 },
  },
  // Awareness is what they know; aggression is how hard they answer, and only your own (and your herd's) harm raises
  // it. Police come some seconds after an alarm whatever you did; the harsher stages need aggression, never time.
  response: {
    policeDelay: 22,                     // seconds from the alarm to the first police car
    weights: { assault: 9, trample: 13, herdTrample: 9, vehicle: 14, policeVehicle: 18, gate: 3, takedown: 0 },
    aggressive: 30, heavy: 62,           // aggression needed for aggressive pursuit and for heavy units
    waves: { police: 3, aggressive: 3, heavy: 2 },   // officers per arrival
    roadblock: [[-4.4, -78, .5], [4.6, -86, -.6], [0, -96, 1.57]],   // where cars stop: x, z, yaw
    arriveFrom: -178, arriveSeconds: 7,
  },
  // Explosives: a ring on the ground and a rising beep for `fuse` seconds, then the blast. Cover between you and it
  // saves you. Mounted: the first blast that reaches you shakes you, the second (while still shaken) throws you.
  blast: { fuse: 1.9, radius: 6.5, lethal: 2.6, scatter: 15, scatterSeconds: 4, damageFoot: 34, damageRide: 8, recover: 9, threatRange: 45 },          // a hit this hard or harder throws you off the cow
  camera: { follow: true, followDelay: .6, rideBack: 6.2, rideUp: 3.3, herdBack: 9, herdUp: 8, herdFull: 14 },   // the wide view is fully out at `herdFull` cows
  // Cardboard boxes to wear: where they lie (x, y, z, yaw); still, you are invisible; moving, guards see the box at
  // this fraction of their usual range and grow suspicious more slowly.
  boxes: { spots: [[97.5, 0, 27.2, 0], [50.5, 0, 26.2, .3], [66.5, 0, -36.5, 1], [-31, 1.3, 15, 0], [-18, 0, 5.5, .5], [70, 0, 64.5, 0], [-16.6, 0, -57.5, 0], [12, 0, -8, 0], [88, 0, 45, 0], [3.5, 0, 40, 1.2]],
    still: .35, sightMoving: .35, alertMoving: .55 },
  finish: { linger: 5, par: 900 },     // par: seconds for the quick-run rating; linger: seconds after you reach safety before the count is final
};
