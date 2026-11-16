#pragma once

#include "CoreMinimal.h"
#include "CGPlayerPawn.h"
#include "CGBoatPawn.generated.h"

class UCameraComponent;
class UProceduralMeshComponent;
class UCableComponent;

/**
 * The sailing boat: hull physics on the shared sea, a lift/drag sail model, a simulated cloth sail,
 * a rope sheet, and a two-speed winch worked in first person.
 */
UCLASS()
class COGANDGALE_API ACGBoatPawn : public ACGPlayerPawn
{
	GENERATED_BODY()

public:
	ACGBoatPawn();

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

private:
	struct FSailForce
	{
		float Drive = 0.f, Side = 0.f, Load = 0.f, Lift = 0.f, Boom = 0.f, Alpha = 0.f;
	};

	void Simulate(float Dt);
	FSailForce SailForce(float SheetValue, const FVector2f& Apparent) const;
	void BuildModel();
	void BuildHull(UMaterialInterface* Material);
	void BuildSail(UMaterialInterface* Material);
	void StepSail(float Dt);
	void PoseModel(float Dt);
	void UpdateCamera(float Dt);
	FVector SailRest(float U, float V, float Boom) const;

	UPROPERTY()
	TObjectPtr<USceneComponent> Root;
	UPROPERTY()
	TObjectPtr<USceneComponent> Body;
	UPROPERTY()
	TObjectPtr<UCameraComponent> Camera;
	UPROPERTY()
	TObjectPtr<UProceduralMeshComponent> Hull;
	UPROPERTY()
	TObjectPtr<UProceduralMeshComponent> Sail;
	UPROPERTY()
	TObjectPtr<USceneComponent> BoomPivot;
	UPROPERTY()
	TObjectPtr<USceneComponent> TillerPivot;
	UPROPERTY()
	TObjectPtr<USceneComponent> HandlePivot;
	UPROPERTY()
	TObjectPtr<USceneComponent> GearPivot[2];
	UPROPERTY()
	TObjectPtr<UStaticMeshComponent> Drum;
	UPROPERTY()
	TObjectPtr<UCableComponent> Sheet;

	// simulation state, metres and radians
	float X = 0.f, Z = 0.f, Heading = 0.f;
	float Forward = 0.f, Slip = 0.f, Heel = 0.f, Rudder = 0.f;
	float SheetOut = 0.45f;
	int32 Reef = 0;
	float Boom = 0.2f, BoomSide = 1.f;
	float Load = 0.f, Trim = 0.f, Fill = 0.f, Luff = 0.f;
	float HandleAngle = 0.f;
	float Float = 0.f, Pitch = 0.f, Roll = 0.f;
	float SimClock = 0.f;

	// camera
	bool bFirstPerson = false;
	float ViewBlend = 0.f;
	float LookYaw = 18.f, LookPitch = -16.f;
	FVector ChasePos = FVector::ZeroVector;
	bool bChaseValid = false;

	// cloth
	static const int32 NU = 11;
	static const int32 NV = 15;
	TArray<FVector> Cloth;
	TArray<FVector> ClothPrev;
	TArray<FVector> ClothNormals;
	TArray<float> RestU;
	TArray<float> RestV;
	TArray<FLinearColor> ClothColors;
	TArray<FVector2D> ClothUV;
};
