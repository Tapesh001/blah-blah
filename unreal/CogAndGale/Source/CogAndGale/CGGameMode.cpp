#include "CGGameMode.h"
#include "CGBikePawn.h"
#include "CGBoatPawn.h"
#include "GameFramework/PlayerController.h"
#include "CGHud.h"
#include "CGTerrain.h"
#include "CGWorld.h"
#include "Engine/World.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"

ACGGameMode::ACGGameMode()
{
	PrimaryActorTick.bCanEverTick = true;
	DefaultPawnClass = ACGBikePawn::StaticClass();
	HUDClass = ACGHud::StaticClass();
}

void ACGGameMode::InitGame(const FString& MapName, const FString& Options, FString& ErrorMessage)
{
	Super::InitGame(MapName, Options, ErrorMessage);
	CG::EnsureInit();
	GetWorld()->SpawnActor<ACGWorld>();
}

void ACGGameMode::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	APlayerController* PC = GetWorld()->GetFirstPlayerController();
	ACGPlayerPawn* Pawn = PC ? Cast<ACGPlayerPawn>(PC->GetPawn()) : nullptr;
	if (!Pawn)
	{
		return;
	}
	DoneTime = Pawn->bFinished ? DoneTime + DeltaSeconds : 0.f;
	// N skips ahead; finishing a chapter moves on after a short pause. -chapter=boat starts at sea.
	const bool bStartAtSea = FParse::Param(FCommandLine::Get(), TEXT("boat"));
	if (Chapter == 0 && (bStartAtSea || PC->WasInputKeyJustPressed(EKeys::N) || DoneTime > 2.5f))
	{
		StartChapter(1);
	}
}

void ACGGameMode::StartChapter(int32 Index)
{
	APlayerController* PC = GetWorld()->GetFirstPlayerController();
	if (!PC)
	{
		return;
	}
	APawn* Old = PC->GetPawn();
	APawn* Next = nullptr;
	if (Index == 1)
	{
		Next = GetWorld()->SpawnActor<ACGBoatPawn>(FVector::ZeroVector, FRotator::ZeroRotator);
	}
	if (Next)
	{
		PC->Possess(Next);
		if (Old)
		{
			Old->Destroy();
		}
		Chapter = Index;
		DoneTime = 0.f;
	}
}
