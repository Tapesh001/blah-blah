#pragma once

#include "CoreMinimal.h"
#include "CGPlayerPawn.h"
#include "CGBenchPawn.generated.h"

class UCameraComponent;
class UProceduralMeshComponent;
class UPointLightComponent;

/**
 * The mechanism bench: place gears on axles so the output turns at the right speed and sense.
 * Used to rebuild the bike's drivetrain (and later the engine).
 */
UCLASS()
class COGANDGALE_API ACGBenchPawn : public ACGPlayerPawn
{
	GENERATED_BODY()

public:
	ACGBenchPawn();

	/** Call right after spawning. bEngine picks the harder two-idler puzzle. */
	void Setup(bool bEngine);

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;

private:
	struct FGear
	{
		int32 Teeth = 12;
		int32 Axle = -1;      // -1 = in the tray
		bool bFixed = false;
		FVector2f Tray = FVector2f::ZeroVector;
		FVector2f Pos = FVector2f::ZeroVector;
		float Angle = 0.f;
		float Omega = 0.f;    // relative to the driver; 0 = not driven
		UProceduralMeshComponent* Mesh = nullptr;
	};
	struct FAxle
	{
		FVector2f Pos;
		int32 Role = 0; // 0 free, 1 driver, 2 output
	};

	void BuildBench();
	UProceduralMeshComponent* MakeGear(int32 Teeth, UMaterialInterface* Material);
	void AddGear(int32 Teeth, int32 Axle, bool bFixed, const FVector2f& TrayPos, UMaterialInterface* Material);
	static float Radius(int32 Teeth) { return Teeth * 0.4f; }
	bool CursorOnBoard(FVector2f& Out) const;
	bool CanSeat(int32 GearIndex, int32 AxleIndex) const;
	void Evaluate();
	void PoseGears();

	UPROPERTY()
	TObjectPtr<USceneComponent> Root;
	UPROPERTY()
	TObjectPtr<USceneComponent> Board;
	UPROPERTY()
	TObjectPtr<UCameraComponent> Camera;
	UPROPERTY()
	TObjectPtr<UPointLightComponent> Lamp;
	UPROPERTY()
	TArray<TObjectPtr<UProceduralMeshComponent>> GearMeshes;

	TArray<FGear> Gears;
	TArray<FAxle> Axles;
	bool bEngineKind = false;
	bool bBuilt = false;
	int32 Held = -1;
	int32 Stage = 0;          // 0 place gears, 1 tension the chain, 2 solved
	float DriverAngle = 0.f;
	float OutputRatio = 0.f;  // signed; 0 = output not driven
	float GoalRatio = 2.5f;   // signed
	float Tension = 0.2f;
	float SolvedTime = 0.f;
	float SpinTime = 0.f;
	FString Notice;
	float NoticeTime = 0.f;
};
