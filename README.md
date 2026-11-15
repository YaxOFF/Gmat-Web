Mission Architect · GMAT Web

An interactive space-mission game powered by NASA's real flight-dynamics engine. Built by NasaGang for the NASA hackathon at UDLAP (November 2026).

Mission Architect runs on top of GMAT Web, our web using NASA's General Mission Analysis Tool (GMAT R2026a). The backend is FastAPI on top of gmatpy (GMAT's real engine), and the frontend is React + Vite + TypeScript.

Table of contents
About the project
The challenge
How it works
Benefits and intended impact
What makes it creative
Factors we considered
Tech stack
Repository structure
Getting started
Playing the game
Tests
Configuration
Real data and 3D models
Documentation
Team
AI-assisted development
License
About the project

Mission Architect is a browser game that lets students run a complete space mission, from concept to operations. It is built on Gmat-Web, our web port of NASA's General Mission Analysis Tool (GMAT). Players pick a mission: water-ice prospecting at the lunar south pole (based on LCROSS and VIPER), or a rock and mineral hunt on Mars (based on Curiosity and Perseverance). From there they launch on an Atlas V and follow a transfer trajectory that GMAT computes live. They choose a landing site on a 3D globe built from real elevation data and make decisions during descent. Then they drive a rover with real instruments, all while managing battery, solar power, communication delays, dust storms, instrument time and only three sample tubes.

Every choice has consequences that the player can see, so the trade-offs mission engineers face stop being abstract. Because a real flight-dynamics tool and real NASA data sit underneath, students learn how actual missions work, not a simplified cartoon. Mission design is usually locked behind expert software. Mission Architect turns it into something students can play, experiment with and learn from.

The challenge

Designing a space mission requires careful consideration of competing demands, including mission objectives, spacecraft design, scientific instruments, launch vehicles, budgets, power, mass, communications, and orbital constraints. For students who rarely get to experiment with an entire mission from concept to operation, these trade-offs often remain abstract. Your challenge is to create an interactive game that allows participants to design, manage, and simulate a complete space mission while making engineering decisions, managing limited resources, and evaluating how each choice shapes the success of their mission.

Challenge demand	Where it appears in Mission Architect
Mission objectives	Moon or Mars campaign, each with its own science goal (water ice or habitability rocks), plus secret goals
Launch vehicle	Atlas V 541 launch sequence
Orbital constraints	Transfer trajectory computed live by the GMAT engine
Scientific instruments	ChemCam-style laser, drill, navigation cameras; VIPER-style vertical drill, neutron and mass spectrometers on the Moon
Power	Battery, solar charging, dust on the panels, lit and shadowed regions, headlights that drain energy
Communications	Event cards for solar conjunction, signal loss and late commands
Limited resources	3 sample tubes, limited instrument hours in the Earth lab, limited time and battery
Evaluating each choice	Landing decisions, sample analysis, a press announcement and an epilogue that reflect how the mission went
How it works

Mission Architect takes the player through every phase of a real mission:

Mission choice. The player picks the Moon or Mars, and each has its own story, objectives and science goal. On the Moon the goal is to find water ice in permanently shadowed regions. On Mars it is to find and analyze rocks and minerals that could preserve signs of past habitability.
Launch and transfer. A 3D Atlas V launch cinematic climbs through the layers of the atmosphere. Then the spacecraft follows the curved transfer trajectory that GMAT computes live, which shows that spacecraft do not fly in a straight line. If the engine is not available, the game uses a precomputed GMAT trajectory instead.
Site selection and mapping. The player chooses from real landing sites (for example Jezero, Gale, Gusev, Elysium and Hellas on Mars) on an interactive 3D globe. Each site's terrain comes from real elevation data (LOLA on the Moon, HRSC+MOLA on Mars).
Entry, descent and landing. The player makes step-by-step landing decisions. On Mars, a roughly 60-second cinematic recreates MSL's real sequence: entry plasma, parachute, heat shield and backshell separation, powered descent, sky crane, touchdown and flyaway.
Surface operations. The player drives a Curiosity-based rover with procedural rocker-bogie suspension over the real terrain.
Mars: a ChemCam-style laser identifies rock types. The drill (5 cm, the depth Curiosity actually used) works by holding a key while a progress bar fills, with its own close-up camera and an x-ray view. Navigation cameras show a hazard grid and suggest a safe path.
Moon: a VIPER-style vertical drill tower works in stages with intermediate readings, tracks bit temperature and shows a live gas spectrum. A clue map guides the search for ice.
Resource and risk management. Battery and solar charging are limited, dust builds up on the panels, and the rover moves between day and night, light and shadow. Mars has sandstorms that you shelter from behind hills, plus cold. A stress-based event-card deck brings in real mission problems.
Results. Sealed samples are analyzed in an Earth lab with limited instrument hours. The mission ends with a press announcement and an epilogue.

GMAT Web is also a full mission-design tool in its own right. Users can create spacecraft, propagators, maneuvers and mission sequences, run them with the real GMAT engine and see the results (3D, ground track, plots, reports and solver convergence). Its results match desktop GMAT.

Benefits and intended impact
The trade-offs become concrete. Students feel the tension between science return, power, time, risk and communications instead of just reading about it.
It is scientifically grounded. The trajectories come from GMAT. The terrain, planet sizes (NASA mean radii), landing sites, rock cases (for example Cheyava Falls and John Klein), instruments and drill depths all come from real missions.
It covers the whole mission lifecycle. Launch, transfer, landing site, EDL, operations, sample analysis and results are all in one experience.
Students can try again. Two different campaigns and changing events mean they can replay, compare strategies and learn from failures.
It is accessible. It runs in a web browser with no installation for players, and it is dockerized so schools and events can host it easily.
It is designed for collaboration. A 4-player cooperative mode is designed in which satellite operator, rover driver and scientist roles have to communicate.

Intended impact: we want students who rarely get to touch real mission design to understand how a mission is designed and why engineers make the choices they do. Putting a real NASA tool and real data behind a game can spark interest in aerospace engineering and planetary science, especially among students without access to professional software or labs. In the long term, Mission Architect could become a classroom and outreach tool where new missions are added as GMAT scripts.

What makes it creative
It turns a professional NASA trajectory tool into the engine of a game, so the physics are real, not scripted.
It mixes flight simulation with tabletop game design, taking ideas from D&D, Baldur's Gate and Nemesis: a stress-based event deck, engineering rolls, timers and secret objectives.
Each world plays the way its real mission did. The Moon is about prospecting for ice in darkness. Mars is about rock science under dust storms.
It reuses one rover model in two roles: the Curiosity rig becomes a VIPER-style lunar prospector, with the arm turned into a vertical drill tower.
It adds cinematic touches: drill close-ups with an x-ray view of the rock, scanning close-ups, camera shake and dust on the lens during storms, a full MSL sky-crane landing, and a real-scale title screen with Earth, the Moon and Mars.
It has its own visual identity inspired by real mission documents, avoiding generic sci-fi interfaces.
Factors we considered
Scientific accuracy: real missions (LCROSS, VIPER, Curiosity, Perseverance), real datasets, real drill depths, instruments and planet sizes. Each mission's mechanics follow what really happened (water on the Moon, rocks on Mars).
The challenge's trade-offs: mission objectives, instruments, launch vehicle, power, communications and orbital constraints, all expressed as decisions with consequences.
Playability: clear objectives, readable UI, step-by-step decision panels, hints (clue maps, safe-path suggestions), a skippable landing cinematic and a rover reset so players don't get stuck.
Performance: a low-poly rover, compressed textures (WebP, up to 1024 px), a shared model and texture cache, pre-warmed viewers and anti-tiling techniques so the game runs smoothly in a browser.
Security: scripts that run on the server are sanitized. System calls, Python and MATLAB calls are rejected, and every output path is rewritten to a temporary folder for that run.
Teamwork and maintainability: a feature branch for each mechanic, careful merges, documentation, a separate QA agent between phases, and logged prompts for transparency about how AI was used.
Tech stack
Layer	Technologies
Simulation engine	NASA GMAT R2026a via gmatpy (official Python API), isolated in worker processes
Backend	Python 3.12–3.14, FastAPI, REST + WebSocket (live logs and solver progress), multiprocessing (spawn)
Frontend	React, Vite, TypeScript, Zustand, Monaco (script editor), uPlot (plots), oxlint
3D	Three.js (game scenes, rover, EDL), CesiumJS without Cesium ion (mission-design 3D view)
3D assets	Blender (with the Blender MCP), glTF/GLB, gltf-transform (resize + WebP)
Deploy	Docker Compose: api (Python + GMAT for Ubuntu) and web (nginx serving the Vite build, proxying /api and /ws)
Testing	pytest (unit, slow and desktop-comparison tests), mission batch runner, Claude in Chrome for browser QA
Repository structure

Main folders (see docs/MAP.md for the full map):

backend/
  app/engine/        worker pool, runner, sanitize, schema, results, solver log
  app/script/        GMAT script parser and serializer
  tests/             pytest suites, own missions (m1–m8) and tools
frontend/
  src/mission/       mission sequence editor
  src/resources/     resource tree and forms
  src/results/       3D (Cesium), plots, reports, solver panel
  src/game/          Trip to the Moon game mode
  src/mission-architect/
    three/           Three.js scenes: Rover3D, Launch3D, Edl3D, Descent3D, curiosity.ts, dem.ts, edl.ts…
    ui/              game screens (MarsTest, portraits, patches…)
  src/i18n/          UI strings
  public/models/     curiosity_rover.glb, skycrane.glb, aeroshell.glb…
shared/              mission.schema.json (JSON mission model)
tools/
  moon/ mars/ msl/   how each terrain and 3D model file is built
docs/                project documentation
Getting started
Requirements
GMAT R2026a installed (Windows or Linux) and the GMAT_HOME variable pointing to its root folder (the one that contains bin/gmatpy).
Python 3.12–3.14 (it must match a version included in bin/gmatpy/_pyXY) and uv.
Node.js 20+ and npm.

With Docker you only need Docker. GMAT is downloaded during the build.

Running locally

Windows (PowerShell):

powershell
$env:GMAT_HOME = 'C:\path\to\gmat-win-R2026a'
./dev.ps1

Linux / macOS:

sh
GMAT_HOME=/opt/gmat ./dev.sh

The first run creates backend/.venv and installs the dependencies.

Backend: http://127.0.0.1:8000
Frontend: http://localhost:5173 (it proxies /api to :8000)

If GMAT_HOME/bin/api_startup_file.txt does not exist, the backend generates an equivalent one in backend/.cache/.

With Docker
sh
cp .env.example .env   # optional
docker compose up -d --build

Open http://localhost:8080. GMAT does not need to be installed: the build downloads the Ubuntu version (400 MB) and checks its sha256. Details in docs/DEPLOY.md.

Playing the game

The game opens as the landing page. The GMAT mission editor can be reached from it, and the game has back buttons to return to earlier screens.

Main controls (rover)
Key	Action
Space (hold)	Drill. The progress bar fills, and drilling stops by itself when finished
F	Scan (ChemCam laser on Mars, infrared on the Moon)
G	Navigation-camera view: hazard grid, target rocks and safe path
L	Headlights (they use battery)
P	Clean the solar panels (Mars)
T	Reset the rover if it gets stuck
Developer screens

These are useful while working on a single scene:

URL	Opens
?screen=mars	Mars test: globe, site picker and "Land and drive"
?screen=edl (&site=<id>)	Mars EDL sequence on a loop; &static=1 opens the stacked-model view
?screen=launch	Launch scene
?rover=cabeus	Lunar rover at Cabeus
Tests
sh
# Backend (requires GMAT_HOME)
cd backend
.venv/Scripts/python -m pytest          # Windows
.venv/bin/python -m pytest              # Linux / macOS
python -m pytest -m slow                # slow tests: comparison against desktop GMAT
python -m app.batch --jobs 4            # runs the GMAT samples and rewrites docs/COMPATIBILITY.md

# Frontend
cd frontend
npm run lint && npm run build

Current status: 118 of the 162 GMAT sample scripts run (77 of the 88 at the root). The rest need plugins, were rejected by the sanitizer, or use relative paths. The team's own missions (backend/tests/missions/) match desktop GMAT to a relative tolerance of 1e-8.

Configuration (environment variables)
Variable	Default	Use
GMAT_HOME	—	GMAT folder (required)
GMAT_WEB_WORKERS	2	Worker processes with gmatpy for short tasks
GMAT_WEB_TASK_TIMEOUT	60	Timeout per short task (s): schemas, validate, convert
GMAT_WEB_CACHE	backend/.cache	Generated files: the API startup file and the schema cache
GMAT_WEB_MAX_RUNS	2	Simultaneous runs; the next one gets 429
GMAT_WEB_RUN_TIMEOUT	300	Maximum time per run (s); past it, the run is stopped
GMAT_WEB_MAX_SCRIPT_BYTES	524288	Maximum script size (bytes, UTF-8)
GMAT_WEB_RUNS	<temp>/gmat-web-runs	Runs folder (sanitized script, log and outputs)
GMAT_WEB_RUN_KEEP	3600	Seconds a finished run and its folder are kept; then they are deleted (at startup and on each new run)
Real data and 3D models

The game uses real NASA data wherever it can. Full credits are in NOTICE, and how each file is built is in tools/*/README.md.

What	Source	Details
Orbital physics (orbits, transfers, maneuvers)	NASA GMAT R2026a engine (gmatpy), never reimplemented in the frontend	docs/SYSTEM.md
Moon globe and rover terrain	LROC color and LOLA relief (NASA SVS CGI Moon Kit; polar LOLA LDEM from NASA PGDA). Crater windows keep the real slopes; crater positions from the USGS/IAU Gazetteer	tools/moon/README.md
Mars globe and rover terrain	Viking MDIM2.1 color mosaic (USGS, via NASA Mars Trek) and the HRSC+MOLA blended DEM at 200 m (USGS). Sites at their real coordinates (USGS/IAU Gazetteer)	tools/mars/README.md
Rover, sky crane, aeroshell, MSL cruise stage, Atlas V 541	Based on NASA's public 3D models (NASA 3D Resources), simplified by the team (fewer polygons, parts split for animation, compressed textures)	tools/msl/README.md
Star sky and Earth	Tycho-2 star map and Natural Earth II imagery bundled with CesiumJS	NOTICE
Ground and rock textures	Poly Haven CC0 materials and one texture chosen by the team (not scanned data)	NOTICE
Planet sizes	NASA mean radii: Earth 6371 km, Mars 3389.5 km, Moon 1737.4 km	—
Documentation
File	Contents
docs/MAP.md	Where everything lives in the code
docs/SYSTEM.md	System architecture and how the engine is used
docs/GUIDE.md	How to use the simulator and add new missions
docs/DEPLOY.md	Docker and VPS deployment
docs/QA.md	QA procedures already in use
docs/GOTCHAS.md	Known pitfalls of GMAT and the engine
docs/COMPATIBILITY.md	Status of every GMAT sample script
docs/ROUNDTRIP_EXCEPTIONS.md	Script ↔ model round-trip exceptions
PLAN.md	Web port plan (phases 0–12)
PLAN-JUEGO.md	"Trip to the Moon" game-mode plan
EDL plan	Mars entry, descent and landing sequence (phases E0–E7, done)
UI redesign plan	Minimalist, light UI redesign for Mission Architect

The original C++ source of GMAT R2026a is the reference to check when the engine behaves unexpectedly.

Team
Member	Main contributions
Ney Yax Alexander Cruz Garcia	GMAT → web port, agent and QA workflow, documentation, game concept, Mars EDL plan, UI redesign, trailer
David Carcamo Bonifacio	Repository setup, Docker, Curiosity 3D model (Blender), procedural suspension, drill, laser, navigation cameras, VIPER-style lunar mechanics
José Mario Pérez Méndez	Moon-or-Mars campaign and Mars story, 3D site picker, sample tubes and Earth lab, Mars event cards, title screen, visual identity
David Cervantes Rojas	Real Moon and Mars terrain and textures, sandstorms, 4-player co-op design, branch merges, EDL cinematic integration
García Rivera Jorge Aldairth	3D launch-to-Moon cinematic following the GMAT-computed trajectory
AI-assisted development

The team built this project with Claude Code. Work was organized in phased plans with a separate QA agent that validated each phase (tests, comparison against GMAT, and visual checks in the browser with Claude in Chrome). Every prompt used is logged in PROMPTS.md for transparency.

License

MIT (see LICENSE). Uses GMAT, Apache 2.0 (see NOTICE). This is an unofficial project: it uses no NASA logos or branding.