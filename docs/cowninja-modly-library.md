# COWNinja asset library for Modly (220 pieces)

Modly turns one picture into one 3D model. For each line: generate the picture from the prompt with any image
generator, give the picture to Modly, export a GLB, and save it as `assets/cowninja/modly/<file>.glb`. The size column
is the real-world size Claude scales it to when bringing it in. Then tell Claude "bring in the Modly pieces".

**Add this to the end of every prompt:**

```
single object, centred, three-quarter view from slightly above, plain light grey background, soft even studio lighting, no shadows on the ground, no other objects, no text, photorealistic, sharp focus, whole object in frame
```

**Modly settings:** one picture per run; Hunyuan3D 2 Mini Turbo (TripoSG if it will not run); texture on; triangle
target about 50k if offered. Generate the ★ pieces first: they are the ones the map needs most.

Style for the whole set: a small, run-down rural abattoir at night. Stainless steel that is scratched and stained,
white tile with grime in the grout, galvanised steel, worn yellow safety paint, rust, wet concrete. Blood is dark red
when fresh and brown when dry.

## 1. Kill floor (40)

| File | Size | Prompt |
|---|---|---|
| ★ `knocking-box.glb` | 3 m long | a steel cattle stunning box with high solid sides, a vertical sliding guillotine door at one end and a tilting side panel, galvanised and blood-stained |
| ★ `bleed-rail-section.glb` | 3 m long | a section of overhead stainless steel carcass rail with two hanging trolley wheels and roller hooks, mounted on a steel bracket |
| ★ `rail-trolley-hook.glb` | 0.5 m tall | a single stainless steel carcass trolley with two grooved wheels on top and a heavy hook below |
| ★ `shackle-chain.glb` | 1.2 m long | a heavy steel leg shackle on a short chain, blood-stained |
| ★ `chain-hoist.glb` | 1 m tall | an electric chain hoist with a yellow motor housing, pendant control on a cable and a hook block |
| ★ `hide-puller.glb` | 3.5 m tall | an industrial cattle hide puller machine, tall steel frame with a horizontal roller drum and chains, stainless, wet and stained |
| ★ `splitting-saw.glb` | 1.2 m tall | a hanging carcass splitting band saw, stainless body with handles, suspended from a balancer cable |
| ★ `splitting-platform.glb` | 2 m tall | a raised stainless steel work platform with grated floor, guard rails and steps, used for splitting carcasses |
| `brisket-saw.glb` | 0.7 m long | a handheld pneumatic brisket saw with a circular blade and twin handles |
| `air-knife.glb` | 0.4 m long | a handheld pneumatic hide-removal air knife with twin oscillating circular blades |
| `knife-steriliser.glb` | 0.5 m tall | a wall-mounted stainless knife steriliser box with hot water and two knife handles sticking out |
| `hand-wash-basin.glb` | 0.6 m wide | a knee-operated stainless steel hand wash basin on a wall bracket |
| `apron-wash.glb` | 1 m wide | a stainless apron wash station with spray nozzle and drip tray |
| `boot-wash.glb` | 1.2 m long | a stainless boot washing trough with rotating brushes |
| `hose-reel.glb` | 0.8 m wide | a wall-mounted hose reel with a red rubber hose and spray gun |
| `pressure-washer.glb` | 1 m tall | a yellow and black wheeled industrial pressure washer with a coiled hose and steel lance |
| `floor-drain.glb` | 0.6 m wide | a square stainless steel floor drain grate set in tiled concrete, blood in the slots |
| `drain-channel.glb` | 2 m long | a section of floor drainage channel with a removable stainless grate, dark red residue |
| `squeegee.glb` | 1.5 m long | a long-handled floor squeegee with a black rubber blade |
| `bucket-steel.glb` | 0.35 m tall | a dented galvanised steel bucket half full of dark liquid |
| `bleeding-trough.glb` | 2.5 m long | a stainless steel blood collection trough on short legs with a drain spout |
| `blood-tank-small.glb` | 1.2 m tall | a small stainless blood collection tank on wheels with a lid and valve |
| `viscera-table.glb` | 2.4 m long | a stainless steel viscera inspection table with raised edges and a drain |
| `inspection-stand.glb` | 1.5 m tall | a meat inspector's stand with a stainless tray, a hook rail and a lamp |
| ★ `boning-table.glb` | 2 m long | a stainless steel butchery table with a back rail of hooks and knives and a white cutting board, stained |
| `meat-hook-single.glb` | 0.3 m tall | a single S-shaped stainless meat hook |
| `meat-hooks-rack.glb` | 1 m wide | a wall rack of a dozen stainless meat hooks of different sizes |
| `cleaver.glb` | 0.4 m long | a heavy butcher's cleaver with a wooden handle, the blade chipped |
| `butcher-knife-set.glb` | 0.4 m wide | a canvas knife roll with five butcher knives and a sharpening steel |
| `sharpening-steel.glb` | 0.4 m long | a butcher's honing steel with a black handle |
| `bone-saw-hand.glb` | 0.6 m long | a hand-held butcher's bone saw with a steel frame |
| `captive-bolt-stunner.glb` | 0.45 m long | an industrial captive-bolt cattle stunner, steel cylinder body, pistol grip, worn black paint |
| `stunner-cartridges.glb` | 0.15 m wide | a small open box of brass stunner cartridges |
| `safety-cabinet.glb` | 1.8 m tall | a yellow metal safety cabinet with a warning label |
| `strip-curtain.glb` | 2.4 m wide | a PVC strip curtain hanging from a steel rail, the strips cloudy and smeared |
| `swing-door-plastic.glb` | 2.2 m tall | a heavy translucent plastic double swing door with steel kick plates |
| `emergency-stop.glb` | 0.3 m tall | a yellow box with a red mushroom emergency stop button on a pole |
| `fluorescent-fitting.glb` | 1.5 m long | a sealed IP65 fluorescent tube light fitting with a cloudy diffuser |
| `caged-wall-lamp.glb` | 0.35 m tall | an industrial bulkhead wall lamp with a steel cage over the glass |
| `ceiling-fan-industrial.glb` | 1.5 m wide | an industrial ceiling extraction fan, grimy |

## 2. Chiller and cutting room (25)

| File | Size | Prompt |
|---|---|---|
| ★ `beef-half-carcass.glb` | 2.4 m long | a beef half carcass hanging from a hook, split down the spine, white fat cover and red muscle, realistic |
| ★ `beef-quarter.glb` | 1.2 m long | a beef forequarter on a hook, fat and muscle, realistic butchery |
| `pork-half.glb` | 1.4 m long | a pork half carcass hanging, pale skin and split spine |
| `lamb-carcass.glb` | 1 m long | a whole lamb carcass hanging on a gambrel |
| ★ `chiller-door.glb` | 2.5 m tall | a heavy insulated sliding cold room door, white panel with a stainless handle and gasket |
| `chiller-evaporator.glb` | 1.5 m wide | a ceiling-mounted cold room evaporator unit with fans, frost on the fins |
| `cold-room-thermometer.glb` | 0.2 m wide | a round dial thermometer on a white panel wall |
| `meat-trolley.glb` | 1.6 m tall | a stainless meat trolley with hooks on a top rail and four castors |
| `meat-tub.glb` | 0.6 m wide | a stackable white plastic meat tub with offcuts inside |
| `meat-tubs-stack.glb` | 1.2 m tall | a stack of blue plastic meat tubs |
| `vacuum-packer.glb` | 0.8 m wide | a stainless steel vacuum packing machine with a clear lid |
| `bandsaw-meat.glb` | 1.9 m tall | a stainless steel butcher's meat bandsaw on legs |
| `mincer.glb` | 0.6 m tall | an industrial stainless meat mincer with a feed tray |
| `scales-hanging.glb` | 0.5 m tall | a hanging dial scale with a hook |
| `scales-platform.glb` | 1 m wide | a floor platform scale with a digital readout on a post |
| `carton-boxed-beef.glb` | 0.6 m wide | a waxed cardboard carton of boxed beef with a printed label |
| `pallet-cartons.glb` | 1.2 m wide | a wooden pallet stacked with waxed meat cartons, shrink-wrapped |
| `pallet-jack.glb` | 1.6 m long | a manual pallet jack with a red handle |
| `ice-machine.glb` | 1.2 m tall | a stainless ice flake machine with a bin |
| `label-printer.glb` | 0.3 m wide | an industrial label printer on a stainless shelf |
| `cutting-board-stack.glb` | 0.5 m wide | a stack of white plastic cutting boards, scored |
| `apron-chainmail.glb` | 0.8 m tall | a chainmail butcher's apron hanging on a hook |
| `gloves-mesh.glb` | 0.3 m wide | a pair of stainless mesh cut-resistant gloves |
| `hairnet-box.glb` | 0.25 m wide | a cardboard dispenser box of white hairnets |
| `rubber-floor-mat.glb` | 1.5 m long | a black rubber anti-fatigue floor mat, wet |

## 3. Lairage, race and pens (25)

| File | Size | Prompt |
|---|---|---|
| ★ `cattle-race-panel.glb` | 2.5 m long | a section of galvanised steel cattle race with solid lower sheeting and rails above |
| ★ `cattle-gate.glb` | 3 m long | a galvanised steel five-bar livestock gate with a spring latch |
| `sliding-gate.glb` | 1.8 m tall | a vertical sliding cattle gate in a steel frame with a rope pulley |
| `crush-headlock.glb` | 2.2 m tall | a cattle crush with a headlock yoke, galvanised, worn |
| `loading-ramp.glb` | 4 m long | a portable galvanised livestock loading ramp with side rails and cleats |
| `water-trough-steel.glb` | 2 m long | a galvanised oval livestock water trough, dented |
| `water-trough-concrete.glb` | 2 m long | a cast concrete livestock water trough with a float valve |
| `feed-bunk.glb` | 3 m long | a long galvanised feed bunk on legs |
| `hay-bale-square.glb` | 1 m long | a rectangular straw bale tied with orange twine, loose strands |
| `hay-bale-round.glb` | 1.5 m wide | a round hay bale wrapped in netting, weathered |
| `straw-pile.glb` | 2 m wide | a loose heap of dirty straw bedding |
| `manure-pile.glb` | 2 m wide | a heap of cattle manure and straw |
| `feed-sacks.glb` | 1.2 m wide | a pallet of woven white feed sacks with faded green print |
| `mineral-lick-bucket.glb` | 0.3 m tall | a plastic mineral lick tub, half eaten |
| `cattle-prod.glb` | 0.8 m long | an electric cattle prod with a yellow handle |
| `sorting-paddle.glb` | 1.2 m long | an orange plastic livestock sorting paddle |
| `ear-tag-box.glb` | 0.2 m wide | a box of yellow cattle ear tags with an applicator |
| `livestock-weigh-scale.glb` | 2.5 m long | a cattle weigh crate on load bars with a digital indicator |
| `hose-trough-fill.glb` | 1 m long | a green garden hose coiled over a trough edge |
| `wheelbarrow.glb` | 1.4 m long | a dented steel wheelbarrow with a muddy tyre |
| `pitchfork.glb` | 1.6 m long | a four-tine steel pitchfork with a worn wooden handle |
| `shovel-muck.glb` | 1.3 m long | a wide aluminium muck shovel |
| `yard-brush.glb` | 1.5 m long | a stiff yard broom with a wooden head |
| `cattle-trailer.glb` | 8 m long | an aluminium gooseneck livestock trailer with slatted sides, muddy |
| `livestock-truck.glb` | 9 m long | an old rigid livestock truck with a two-deck slatted body |

## 4. Yard, vehicles and outbuildings (25)

| File | Size | Prompt |
|---|---|---|
| ★ `old-pickup.glb` | 5 m long | a battered old farm pickup truck, faded paint, rust, mud up the sides |
| `old-tractor.glb` | 3.5 m long | an old worn small farm tractor, faded red paint, rust, muddy rear tyres, open seat |
| `forklift.glb` | 3 m long | a yellow diesel forklift, worn, with its forks lowered |
| `skip-bin.glb` | 3.6 m long | a rusty steel waste skip, open top |
| `offal-skip.glb` | 3 m long | a steel offal skip with a hinged lid, stained dark red down the sides |
| `wheelie-bin.glb` | 1.1 m tall | a grey plastic wheelie bin, lid open, stained |
| `oil-drum-rusty.glb` | 0.9 m tall | a rusty 200 litre steel oil drum |
| `ibc-tank.glb` | 1.2 m tall | an IBC plastic tank in a steel cage, half full of murky liquid |
| `gas-bottles.glb` | 1.2 m tall | three tall gas bottles chained to a wall bracket |
| `pallet-stack.glb` | 1.2 m tall | a stack of wooden pallets, weathered |
| `gatehouse-barrier.glb` | 4 m long | a red and white car park barrier arm on a steel post |
| `security-booth.glb` | 2.5 m tall | a small prefab security booth with a window and a door |
| `cctv-pole.glb` | 5 m tall | a steel pole with two CCTV cameras and a floodlight |
| `floodlight-pole.glb` | 6 m tall | a tall steel pole with two rectangular LED floodlights |
| `street-lamp-rural.glb` | 6 m tall | an old rural street lamp on a concrete pole with a sodium lantern |
| `wooden-power-pole.glb` | 8 m tall | a wooden electricity pole with a crossarm, insulators and wires cut short |
| `transformer-box.glb` | 1.5 m tall | a green electrical transformer cabinet with warning signs |
| `water-tank-tower.glb` | 6 m tall | a steel water tank on a lattice tower |
| `silo-feed.glb` | 12 m tall | a galvanised feed silo with a conical bottom and ladder |
| `shipping-container.glb` | 6 m long | a rusty shipping container with doors closed |
| `portacabin.glb` | 6 m long | a prefab portable office cabin on blocks |
| `fuel-pump.glb` | 1.6 m tall | a farm diesel fuel tank with a hand pump and hose |
| `chainlink-gate.glb` | 4 m wide | a chain-link double gate in galvanised frame with a padlock and chain |
| `warning-sign-post.glb` | 2 m tall | a weathered sign on a post reading nothing, red border, rust spots |
| `tyre-stack.glb` | 1 m tall | a stack of four old truck tyres |

## 5. Offices, locker room and canteen (25)

| File | Size | Prompt |
|---|---|---|
| `office-desk-old.glb` | 1.5 m long | a worn metal office desk with papers, a phone and a mug |
| `office-chair-worn.glb` | 1 m tall | a ripped black office swivel chair |
| `filing-cabinet.glb` | 1.3 m tall | a dented grey four-drawer filing cabinet, one drawer open |
| `crt-monitor.glb` | 0.4 m wide | an old beige CRT computer monitor |
| `cctv-monitor-bank.glb` | 1 m wide | four small CCTV monitors on a shelf showing grainy images |
| `whiteboard-schedule.glb` | 1.5 m wide | a wall whiteboard with a handwritten kill schedule grid and magnets |
| `wall-clock-industrial.glb` | 0.35 m wide | a round industrial wall clock in a cage |
| `notice-board.glb` | 1 m wide | a cork notice board crowded with pinned notices |
| `first-aid-box.glb` | 0.4 m wide | a green wall-mounted first aid box |
| `fire-extinguisher.glb` | 0.6 m tall | a red fire extinguisher on a wall bracket |
| ★ `locker-bank.glb` | 1.9 m tall | a bank of four green steel lockers, dented, one door hanging open |
| `bench-locker-room.glb` | 1.5 m long | a slatted wooden changing bench on steel legs |
| `rubber-boots-pair.glb` | 0.4 m tall | a pair of tall white rubber work boots, mud and blood splashes |
| `bloody-apron-hanging.glb` | 1 m tall | a white rubber butcher's apron on a hook, smeared with blood |
| `overalls-hanging.glb` | 1.6 m tall | blue work overalls hanging on a hook, stained |
| `hard-hat.glb` | 0.3 m wide | a white hard hat, scuffed |
| `kettle-mugs.glb` | 0.4 m wide | an electric kettle with stained mugs on a tray |
| `microwave-old.glb` | 0.5 m wide | a grimy old microwave oven |
| `fridge-small.glb` | 0.9 m tall | a small white under-counter fridge with magnets |
| `canteen-table.glb` | 1.5 m long | a laminate canteen table with ashtray and cups |
| `plastic-chair.glb` | 0.8 m tall | a white plastic stacking chair, dirty |
| `vending-machine.glb` | 1.8 m tall | an old snack vending machine, glass cracked |
| `water-cooler.glb` | 1.2 m tall | an office water cooler with an empty bottle |
| `ashtray-cigarettes.glb` | 0.15 m wide | a glass ashtray overflowing with cigarette ends |
| `radio-old.glb` | 0.3 m wide | a paint-splashed old portable radio |

## 6. Plant room, boiler and workshop (20)

| File | Size | Prompt |
|---|---|---|
| `boiler-industrial.glb` | 2.5 m tall | an old industrial steam boiler with gauges, pipes and lagging |
| `pipe-manifold.glb` | 2 m wide | a wall of insulated pipes with valves and pressure gauges |
| `valve-wheel.glb` | 0.4 m wide | a large red cast-iron valve wheel on a pipe |
| `compressor-air.glb` | 1.2 m long | an industrial air compressor with a red tank |
| `refrigeration-unit.glb` | 2 m long | a refrigeration condensing unit with two fans, grimy |
| `electrical-panel.glb` | 2 m tall | a grey electrical distribution panel with one door open and wires |
| `generator-diesel.glb` | 1.5 m long | a yellow diesel generator on a skid |
| `workbench-cluttered.glb` | 2 m long | a wooden workbench cluttered with tools, a vice and rags |
| `tool-pegboard.glb` | 1.2 m wide | a pegboard of hand tools on a wall |
| `toolbox-red.glb` | 0.6 m wide | a red steel toolbox, lid open |
| `grinder-bench.glb` | 0.4 m wide | a bench grinder with two stone wheels |
| `welding-cart.glb` | 1.2 m tall | a welding machine on a cart with gas bottle |
| `oil-cans.glb` | 0.4 m wide | a group of dented oil cans and a funnel |
| `chains-on-hook.glb` | 1 m long | heavy steel chains hanging from a wall hook |
| `ladder-aluminium.glb` | 3 m long | an aluminium extension ladder leaning against a wall |
| `step-ladder.glb` | 1.8 m tall | a paint-splashed step ladder |
| `extension-reel.glb` | 0.4 m wide | an orange cable extension reel |
| `spare-parts-shelf.glb` | 2 m tall | a steel shelving unit with boxes of spare parts and belts |
| `drum-pump.glb` | 1 m tall | a hand drum pump fitted in a blue chemical drum |
| `chemical-drums.glb` | 1 m tall | three blue plastic chemical drums with hazard labels |

## 7. Waste, offal, hides and rendering (20)

| File | Size | Prompt |
|---|---|---|
| ★ `offal-bin.glb` | 1.1 m tall | a battered grey plastic wheeled bin, lid open, stained dark red around the rim |
| `offal-cart.glb` | 1.2 m tall | a stainless tipping offal cart on wheels |
| `hide-pile.glb` | 1.4 m wide | a heap of folded raw cattle hides, fur outside, pale underside |
| `hide-pallet.glb` | 1.2 m wide | a pallet stacked with salted cattle hides |
| `salt-sacks.glb` | 1 m wide | sacks of coarse salt for hide curing |
| `bone-bin.glb` | 1 m tall | a plastic bin of bones and offcuts |
| `rendering-hopper.glb` | 2.5 m tall | a steel rendering hopper with a screw conveyor, rusty |
| `tallow-drum.glb` | 0.9 m tall | a steel drum of solidified tallow |
| `waste-water-pit.glb` | 2 m wide | a concrete waste water pit with a steel grate cover |
| `sludge-tank.glb` | 2 m tall | a plastic sludge tank, stained |
| `disinfectant-dispenser.glb` | 0.4 m tall | a wall disinfectant dispenser with a pump |
| `chemical-tote.glb` | 1.2 m tall | a chemical tote of sanitiser |
| `bin-bags-pile.glb` | 1.5 m wide | a pile of black bin bags, some split |
| `cardboard-pile.glb` | 1.5 m wide | a pile of flattened wet cardboard |
| `drain-cover-yard.glb` | 0.8 m wide | a cast-iron yard drain cover in concrete |
| `rats-group.glb` | 0.5 m long | two brown rats crouched together |
| `flies-cluster.glb` | 0.3 m wide | a cluster of blowflies on a dark stain |
| `crows-pair.glb` | 0.6 m wide | two black crows on the ground |
| `stray-dog.glb` | 0.9 m long | a thin stray dog standing, mangy |
| `barn-cat.glb` | 0.5 m long | a scruffy barn cat crouching |

## 8. Gore and set dressing (25)

| File | Size | Prompt |
|---|---|---|
| `blood-pool-thick.glb` | 1.5 m wide | a thick pool of dark red blood on a tiled floor, glossy, irregular edges |
| `blood-trail.glb` | 2 m long | a smeared drag trail of blood on a concrete floor |
| `bloody-handprint-wall.glb` | 0.5 m wide | a smeared bloody handprint on white wall tiles |
| `bloody-boot-prints.glb` | 1.5 m long | a line of bloody boot prints on a pale floor |
| `entrails-pile.glb` | 0.8 m wide | a pile of animal entrails in a steel tray, realistic |
| `cow-head.glb` | 0.6 m long | a severed cow head on a stainless table, eyes closed |
| `cow-hooves.glb` | 0.4 m wide | four severed cow hooves in a plastic tub |
| `cow-tail.glb` | 1 m long | a severed cow tail on a hook |
| `rib-cage.glb` | 1 m long | a stripped beef rib cage on a hook |
| `bloody-rag.glb` | 0.4 m wide | a blood-soaked white rag crumpled |
| `bloody-gloves.glb` | 0.3 m wide | a pair of yellow rubber gloves covered in blood |
| `bloody-knife-table.glb` | 0.5 m long | a bloody butcher knife lying on a steel surface |
| `tub-of-blood.glb` | 0.6 m wide | an open plastic tub filled with dark blood |
| `bone-scraps.glb` | 0.5 m wide | a scatter of bone scraps and fat on the floor |
| `hanging-chains-bloody.glb` | 1.5 m long | three hanging chains with hooks, blood dripping |
| `stained-tile-panel.glb` | 1 m wide | a panel of white wall tiles splattered and streaked with old blood |
| `rusted-drain-blood.glb` | 0.6 m wide | a rusted floor drain clogged with blood and fat |
| `skull-cow-bleached.glb` | 0.5 m long | a bleached cow skull with horns |
| `bones-pile-yard.glb` | 1.2 m wide | a pile of old cattle bones in the dirt |
| `warning-sign-biohazard.glb` | 0.4 m wide | a biohazard warning sign on metal, faded |
| `meat-inspection-stamp.glb` | 0.1 m wide | a meat inspection ink stamp and ink pad |
| `clipboard-tally.glb` | 0.35 m tall | a clipboard with a tally sheet, bloody thumbprint |
| `hosepipe-tangle.glb` | 1.5 m wide | a tangled red hose in a puddle |
| `wet-floor-sign.glb` | 0.6 m tall | a yellow wet floor sign, scuffed |
| `mop-bucket.glb` | 1.2 m tall | a yellow mop bucket with wringer and pink water |

## 9. The farmers' gear (15)

| File | Size | Prompt |
|---|---|---|
| ★ `pitchfork-farmer.glb` | 1.6 m long | a farm pitchfork with three rusty tines and a worn wooden handle |
| `shotgun-farm.glb` | 1.1 m long | an old double-barrel shotgun with a scratched wooden stock |
| `flashlight-heavy.glb` | 0.35 m long | a heavy black aluminium flashlight |
| `lantern-farm.glb` | 0.35 m tall | a battered hurricane lantern |
| `walkie-talkie.glb` | 0.2 m tall | a black two-way radio with antenna |
| `axe-farm.glb` | 0.9 m long | a felling axe with a worn handle |
| `sledgehammer.glb` | 0.9 m long | a sledgehammer with a fibreglass handle |
| `crowbar.glb` | 0.9 m long | a rusty steel crowbar |
| `bolt-cutters.glb` | 0.8 m long | a pair of red-handled bolt cutters |
| `rope-coil.glb` | 0.5 m wide | a coil of frayed farm rope |
| `cattle-whip.glb` | 1 m long | a coiled leather stock whip |
| `thermos-flask.glb` | 0.35 m tall | a dented green thermos flask |
| `cap-trucker.glb` | 0.3 m wide | a dirty trucker cap |
| `wax-jacket.glb` | 0.8 m tall | a waxed farm jacket hanging on a hook |
| `wellies-muddy.glb` | 0.4 m tall | a pair of muddy green wellington boots |

220 pieces. When some are in `assets/cowninja/modly/`, Claude reduces each to a game-ready size, scales it to the size
column, sets its materials to match the site and places it where the list says.
