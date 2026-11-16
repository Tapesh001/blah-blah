@echo off
rem Runs Cog & Gale as a standalone game window. Add -boat to start at sea, -bench to open the repair bench.
start "" "C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64\UnrealEditor.exe" "%~dp0CogAndGale\CogAndGale.uproject" -game -windowed -ResX=1600 -ResY=900 %*
