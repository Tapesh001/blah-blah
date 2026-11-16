# Cog & Gale — Unreal Engine 5.8

A courier, one gear and a storm: ride a bike down an island, rebuild the drivetrain on a bench when
the chain snaps, then sail across a rising sea trimming a cloth sail by hand at a two-speed winch.

## Run

Double-click `Play.bat`, or open `CogAndGale/CogAndGale.uproject` in Unreal 5.8 and press Play.

`Play.bat -boat` starts at sea. `Play.bat -bench` opens the repair bench.

First build from source:

```
"C:\Program Files\Epic Games\UE_5.8\Engine\Build\BatchFiles\Build.bat" CogAndGaleEditor Win64 Development -project="<path>\CogAndGale.uproject"
```

Materials are generated assets. Rebuild them with
`UnrealEditor-Cmd.exe CogAndGale.uproject -run=pythonscript -script=Scripts/build_assets.py` (then `build_grass.py`).

## Controls

| | Bike | Bench | Boat |
| --- | --- | --- | --- |
| W / S | pedal / brake | | more / less sail |
| A / D | lean | chain tension | rudder |
| Space | hop | turn the crank | |
| Z / X | shift | | |
| E | open the bench when the chain snaps | | haul rope, fast gear (cockpit) |
| Q / R | | | haul low gear / ease rope (cockpit) |
| V | third / first person | | third person / cockpit |
| Mouse | | drag gears onto axles | look around (cockpit) |
| N | skip to the boat | | |

## How it is made

Everything is built in code: `Source/CogAndGale`.

- `CGTerrain` — island heights, the road, waves and wind. One source of truth for physics and drawing.
- `CGWorld` — terrain and road meshes, the wave mesh, sky, volumetric clouds, fog, Lumen lighting, scenery, grass, weather.
- `CGBikePawn` — drivetrain, lean and grip model, chain wear, bike and rider model, cameras.
- `CGBenchPawn` — toothed gears, meshing and clash rules, ratio solver, chain tension.
- `CGBoatPawn` — hull on the waves, lift/drag sail model, simulated cloth sail, rope, two-speed winch, cameras.
- `CGGameMode`, `CGHud`, `CGPlayerPawn` — chapter flow, HUD, shared helpers.
