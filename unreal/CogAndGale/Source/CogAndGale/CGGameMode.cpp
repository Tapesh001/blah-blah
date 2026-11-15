#include "CGGameMode.h"
#include "CGBikePawn.h"
#include "CGHud.h"
#include "CGTerrain.h"
#include "CGWorld.h"
#include "Engine/World.h"

ACGGameMode::ACGGameMode()
{
	DefaultPawnClass = ACGBikePawn::StaticClass();
	HUDClass = ACGHud::StaticClass();
}

void ACGGameMode::InitGame(const FString& MapName, const FString& Options, FString& ErrorMessage)
{
	Super::InitGame(MapName, Options, ErrorMessage);
	CG::EnsureInit();
	GetWorld()->SpawnActor<ACGWorld>();
}
