// Tutorial text: one chapter per part of the trip. demo = a live autopilot picture drawn by the real game code.
// Written for kids: short sentences, real NASA facts at the end of every chapter.
const TUTORIAL = [
  {
    id: 'basics', title: 'The basics', demo: null,
    intro: 'You are a junior astronaut. The trip has four missions: fix the rocket on the pad, fly to the Moon, walk on the Moon, and fly home. Everything you save in one mission is carried into the next one, so be kind to your fuel.',
    blocks: [
      ['Flight control', 'The radio box at the bottom left is Flight Control. They tell you what is happening and what to do next. Read it: it explains every new thing the first time it happens.'],
      ['The HUD', 'The small dark panels on the picture show numbers: altitude, speed, fuel. Green means good. Orange means careful. Red means danger. Nothing in this game can hurt a real person: mistakes only cost stars.'],
      ['Stars', 'Every mission gives 1 to 3 stars. You always get at least one. Your stars are saved on this computer and shown on the mission menu. The whole trip is worth 12 stars.'],
      ['Fuel', 'Fuel is the one thing that carries over everywhere. Waiting for better weather, packing heavy cargo and wobbly flying all use fuel. You need some left for the trip home.'],
      ['Keys', 'UP and DOWN (or W and S) steer. LEFT and RIGHT (or A and D) tilt or walk. SPACE is the main action: burn, thrust, tap. Every screen also has on-screen buttons for touch and mouse.'],
      ['Sound and menu', 'SOUND turns the sound off. MENU returns to the mission select. HELP opens this tutorial from any mission. You can leave and come back at any time.'],
    ],
    fact: 'Real astronaut crews train like this too: first the ideas on paper, then simulators, then the real thing. NASA trainers call a practice run a "sim".',
  },
  {
    id: 'm1', title: 'Mission 1: Launch prep', demo: null,
    intro: 'Before a rocket can leave, the pad crew must check everything. You choose the launch day, fix faults as they appear, and keep the rocket stable and fuelled until the countdown ends.',
    blocks: [
      ['Choose a launch day', 'The launch window shows real weather from NASA POWER for Kennedy Space Center. GO days are safe. NO-GO days have storms or strong wind. You can skip a day to wait for better weather, but every day waited costs fuel and wears the systems.'],
      ['The checklist', 'Each stage has a checklist and a countdown. Do the jobs before the timer ends. Stability and fuel are carried from stage to stage, so a careless stage hurts the next one.'],
      ['Faults and repairs', 'Faults pop up during the countdown. Pick the right supply for the fault. Then do the little repair game that opens: tap and turn the pieces until the picture is fixed. Each supply can be used a limited number of times.'],
      ['Stars', 'More time left, higher stability and more fuel give more stars. Launching in NO-GO weather is allowed, but you need luck.'],
    ],
    fact: 'Real launch directors really do call GO or NO-GO. NASA checks the weather for lightning, wind and clouds before every launch, which is why launches get delayed.',
  },
  {
    id: 'm2', title: 'Mission 2: To the Moon', demo: 'flight',
    intro: 'Plan the trip, launch from Earth, burn the engine at the right moment, cruise for three days (sped up), then land. The picture above shows the cruise: the autopilot fixes the course and patches a leak.',
    blocks: [
      ['Planning', 'Pick a landing site: each has a real name, a difficulty and a fact. Then pack the lander. Essentials (oxygen, water, food, habitat) are required. Every kilogram costs fuel, and you must keep enough fuel to land. The bar shows what is left.'],
      ['Launch from Earth', 'Steer UP and DOWN to follow the green pitch needle: the rocket starts pointing up and slowly leans over. Press SPACE to drop each used stage. Too wobbly costs fuel; flying off the line can abort the launch.'],
      ['The burn at the right place', 'In Earth orbit, wait for the green window on the ring. When the ship is inside it, HOLD SPACE. The engine stops by itself when the speed is right. Good timing sends the ship toward the Moon, bad timing means a bigger course correction later.'],
      ['The flight', 'Events happen on the way. Course correction: hold SPACE until the ship is back on the dotted line. Micrometeoroid: tap SPACE to patch the leak. Solar storm: shelter before it hits. Fuel, hull and crew health are on the dashboard.'],
      ['The landing', 'The lidar scans the ground. Put the marker on a green pad and touch down slower than 2 metres per second. UP or SPACE is the engine, LEFT and RIGHT tilt the lander. When the alarm rings, press G for GO. Land gently and with fuel left for 3 stars.'],
    ],
    fact: 'The Moon is about 384,400 km away. The Moon terrain in the landing is built from real LRO LOLA laser-altimeter data, which maps the Moon height. The solar storm is modelled on real flares from NASA DONKI.',
  },
  {
    id: 'steer', title: 'Steering and pitch', demo: 'ascent',
    intro: 'Rockets do not go straight up. They climb, then lean over to gain sideways speed. Sideways speed is what keeps you in orbit. Watch the autopilot follow the green needle.',
    blocks: [
      ['The pitch gauge', 'The white needle is where the nose points. The green needle is where it should point right now. Keep them together with UP (nose up) and DOWN (nose down).'],
      ['Too steep, too shallow', 'Too steep and you waste fuel going up instead of sideways. Too flat and you fall back too early. Small, gentle taps are better than holding a key.'],
      ['Aborts', 'If the lean is badly wrong, the computer shuts the engine down. On the Moon it sets the lander back down gently and you try again. It costs time, not stars.'],
    ],
    fact: 'The real Saturn V and the SLS rocket both tip over after lift-off. This "gravity turn" is how every orbital rocket works.',
  },
  {
    id: 'burn', title: 'The burn window', demo: 'burn',
    intro: 'To leave Earth for the Moon the ship must speed up at exactly the right point in its orbit. The engine fires, the orbit stretches out into a long loop, and the Moon catches the ship.',
    blocks: [
      ['The green window', 'Wait while the ship circles. A green mark appears on the ring. Hold SPACE while the ship is inside it.'],
      ['Cutoff', 'The computer ends the burn when the path reaches the Moon distance. If you miss the window, wait for the next lap: only your patience is used.'],
      ['The preview line', 'The dotted line shows where you will end up. Green: the path reaches the target. Yellow: still short, keep burning.'],
    ],
    fact: 'The real trans-lunar injection burn adds about 3 kilometres per second and lasts around 6 minutes. A real Moon trip takes about 3 days.',
  },
  {
    id: 'm3', title: 'Mission 3: Moonwalks', demo: 'walk',
    intro: 'After landing you explore on foot: three moonwalks, each with its own jobs. Walk to a target, press E, and win a tiny game. The autopilot above does the first one.',
    blocks: [
      ['Walking', 'LEFT and RIGHT walk. SPACE hops (the Moon has one sixth of Earth gravity). The rover, if you packed it, is much faster.'],
      ['Jobs and minigames', 'Timing: press E when the marker is in the green zone. Level: keep the bubble in the middle with LEFT and RIGHT. Drill: hold E but let it cool when it turns red. Hold: keep E pressed until it finishes.'],
      ['Oxygen', 'The suit oxygen bar is your clock. Walk back to the base airlock before it runs out. Nothing bad happens if you are late: the EVA just ends early.'],
      ['Storms and leaks', 'A solar storm warning means: go home now! A suit leak drains oxygen faster. Press R or the PATCH button to fix it. The repair kit patches in 4 presses, tape takes 8.'],
      ['Fuel for home', 'The mission ends with science points and the fuel left in the lander. You need enough fuel for the trip back to Earth. Landing with fuel left, or next to ice, helps.'],
    ],
    fact: 'The shadowed craters near the Moon poles may hold water ice: it is the reason many Artemis sites are at the south pole. The Apollo 11 landing site is Tranquility Base.',
  },
  {
    id: 'm4', title: 'Mission 4: Back to Earth', demo: null,
    intro: 'Mission 4 has five parts: lift off from the Moon, dock with Orion, burn for Earth, cruise home, and come down through the air. This chapter covers the first two; the next chapters cover the rest.',
    blocks: [
      ['Lift-off from the Moon', 'Only the top half of the lander goes up. The gold bottom half stays on the Moon as a launch pad. Steer with UP and DOWN to follow the green needle until you reach lunar orbit.'],
      ['Docking with Orion', 'Orion waits in lunar orbit. Hold SPACE to close in; release to slow down. Line up the green cross with UP and DOWN. Touch the port gently: below 1 metre per second. If you are too fast, you bounce back and try again for a little fuel.'],
      ['Then you fly Orion', 'The crew moves into Orion and lets the lander top go. From now on the ship you see is Orion, with its solar wings and the engine at the back.'],
      ['Burn for Earth', 'The same window idea as before, but around the Moon. Hold SPACE inside the green window. A dry tank means the Lunar Gateway rescue: you still get home, but with fewer stars.'],
    ],
    fact: 'Real Artemis crews land in a lander but live in Orion. Orion stays in orbit around the Moon and takes them home. The Orion crew capsule rides on top of a European Service Module that gives it power and an engine.',
  },
  {
    id: 'dock', title: 'Docking', demo: 'dock',
    intro: 'Docking means joining two spacecraft in space. It is slow and careful, never fast. Watch the autopilot creep in.',
    blocks: [
      ['Thrust and slowing', 'Hold SPACE: you speed up toward Orion. Let go: the thrusters slow you to a crawl. Release early; you drift with no brakes.'],
      ['Line up', 'The offset readout turns green when you are within 1 metre of the cross. UP and DOWN move you sideways. Do it before the last 15 metres.'],
      ['Contact', 'Speed under 1 metre per second and lined up: the ports click and you are docked. Otherwise you bounce, lose a half percent of fuel, and try again. You cannot lose.'],
    ],
    fact: 'Real docking ports have a soft-capture ring that grabs the other ship, then hooks that pull the ships tight. Astronauts then open a hatch and float across.',
  },
  {
    id: 'reentry', title: 'Re-entry and splashdown', demo: 'reentry',
    intro: 'Coming home is the hottest part. The capsule hits the air at 11 kilometres per second. The heat shield leads the way. Keep the angle right, then keep the capsule upright under the parachutes.',
    blocks: [
      ['Service module', 'First Orion drops its service module (the part with the solar wings and the engine). Only the crew capsule comes down. It happens by itself.'],
      ['The corridor', 'The bar at the top shows your angle. Stay in the green corridor with UP and DOWN. Too steep: the shield overheats and loses health. Too shallow: the capsule skips off the air like a stone on water and has to come back for another pass.'],
      ['Radio blackout', 'For a while the glowing air blocks radio. Flight Control cannot hear you, and you cannot hear them. That is normal.'],
      ['Parachutes', 'They open by themselves: two small drogue chutes high up, then three big main chutes lower down. The wind swings the capsule. Press UP or DOWN to push it back to the middle of the tilt gauge.'],
      ['Splashdown', 'Upright and calm is a soft splash. If you let it swing too far, the capsule lands tilted and the orange uprighting bags flip it back: still safe, one star less.'],
      ['Stars', 'Start at 3. Lose one for a damaged shield, one for skipping, one for a tilted splash. The Lunar Gateway rescue and a wobbly Moon lift-off can cost one more.'],
    ],
    fact: 'Orion heat shield temperatures reach around 2,700 degrees Celsius. Orion has 11 parachutes in total and splashes down in the Pacific Ocean at about 8 metres per second.',
  },
  {
    id: 'faq', title: 'Tips and questions', demo: null,
    intro: 'Quick answers.',
    blocks: [
      ['I keep missing the window', 'Wait for the next lap. There is no penalty for waiting in orbit.'],
      ['My fuel ran out', 'Nothing is lost for good. The Gateway rescue gets you home. Next time: pack less cargo, fly gently, and skip fewer days in Mission 1.'],
      ['The picture looks old', 'Hold CTRL and press SHIFT and R to reload the page without the old saved files.'],
      ['Can I start again?', 'Yes. The mission menu starts any mission any time. The last screen of Mission 4 can reset the whole trip.'],
    ],
    fact: 'Real astronauts also repeat the same drill many times. Try the practice drills below as often as you like.',
  },
];

if (typeof module !== 'undefined') module.exports = TUTORIAL;
