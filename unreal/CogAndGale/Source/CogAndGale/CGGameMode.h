#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "CGGameMode.generated.h"

/** Spawns the world and puts the player on the bike. */
UCLASS()
class COGANDGALE_API ACGGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	ACGGameMode();
	virtual void InitGame(const FString& MapName, const FString& Options, FString& ErrorMessage) override;
	virtual void Tick(float DeltaSeconds) override;

private:
	void StartChapter(int32 Index);

	int32 Chapter = 0;
	float DoneTime = 0.f;
};
