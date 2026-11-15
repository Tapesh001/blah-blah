#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "CGBikePawn.generated.h"

class USpringArmComponent;
class UCameraComponent;
class UStaticMeshComponent;
class UMaterialInterface;
class ACGWorld;

/** The courier's bicycle: its own physics model, a built-in-code bike and rider, and both cameras. */
UCLASS()
class COGANDGALE_API ACGBikePawn : public APawn
{
	GENERATED_BODY()

public:
	ACGBikePawn();

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	// read by the HUD
	float Speed = 0.f;
	int32 Gear = 2;
	float Cadence = 0.f;
	float ChainWear = 0.f;
	float Progress = 0.f;
	bool bChainBroken = false;
	bool bFinished = false;
	FString Prompt;

private:
	void Simulate(float Dt);
	void Respawn();
	void BuildModel();
	void PoseModel();
	UStaticMeshComponent* AddPart(int32 Shape, UMaterialInterface* Material);
	static void SetTube(UStaticMeshComponent* Part, const FVector& A, const FVector& B, float Diameter);

	UPROPERTY()
	TObjectPtr<USceneComponent> Root;
	UPROPERTY()
	TObjectPtr<USceneComponent> Body;
	UPROPERTY()
	TObjectPtr<USpringArmComponent> Arm;
	UPROPERTY()
	TObjectPtr<UCameraComponent> Camera;
	UPROPERTY()
	TObjectPtr<ACGWorld> World;
	UPROPERTY()
	TArray<TObjectPtr<UStaticMeshComponent>> Parts;
	UPROPERTY()
	TObjectPtr<UStaticMeshComponent> Wheel[2];
	UPROPERTY()
	TObjectPtr<UStaticMeshComponent> Spoke[2];
	UPROPERTY()
	TObjectPtr<UStaticMeshComponent> Fork;
	UPROPERTY()
	TObjectPtr<UStaticMeshComponent> Bars;
	UPROPERTY()
	TObjectPtr<UStaticMeshComponent> Thigh[2];
	UPROPERTY()
	TObjectPtr<UStaticMeshComponent> Shin[2];
	UPROPERTY()
	TObjectPtr<UStaticMeshComponent> CrankArm[2];

	// simulation state, metres and radians
	float X = 0.f, Z = 0.f, Y = 0.f, VY = 0.f;
	float Heading = 0.f, Lean = 0.f, Grade = 0.f, Steer = 0.f;
	float Crank = 0.f, WheelSpin = 0.f;
	float ShiftCooldown = 0.f, CrashTimer = 0.f, RepairHold = 0.f;
	bool bAir = false, bFirstPerson = false, bBrokenOnce = false;
};
