#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "CGPlayerPawn.generated.h"

class ACGWorld;
class UStaticMeshComponent;
class UMaterialInterface;

struct FCGBar
{
	FString Label;
	float Value = 0.f;
	bool bWarn = false;
};

/** Shared base for everything the player controls: HUD data and model-building helpers. */
UCLASS(Abstract)
class COGANDGALE_API ACGPlayerPawn : public APawn
{
	GENERATED_BODY()

public:
	// what the HUD shows
	FString Objective;
	FString Prompt;
	FString BigText;
	TArray<FString> Lines;
	TArray<FCGBar> Bars;
	bool bShowWind = false;
	/** Apparent wind: angle off the bow in radians (+ = from starboard) and speed in m/s. */
	float WindAngle = 0.f;
	float WindSpeed = 0.f;
	/** Boom angle off the centreline in radians, signed like WindAngle's lee side. */
	float BoomAngle = 0.f;
	bool bFinished = false;

protected:
	UStaticMeshComponent* AddPart(USceneComponent* Parent, int32 Shape, UMaterialInterface* Material);
	UStaticMeshComponent* AddTube(USceneComponent* Parent, const FVector& A, const FVector& B, float Diameter, UMaterialInterface* Material);
	static void SetTube(UStaticMeshComponent* Part, const FVector& A, const FVector& B, float Diameter);
	bool KeyDown(const FKey& Key) const;
	bool KeyHit(const FKey& Key) const;
	static FLinearColor Hex(uint32 RGB);

	UPROPERTY()
	TObjectPtr<ACGWorld> World;
	UPROPERTY()
	TArray<TObjectPtr<UStaticMeshComponent>> Parts;
};
