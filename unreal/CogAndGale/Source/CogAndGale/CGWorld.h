#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "CGWorld.generated.h"

class UProceduralMeshComponent;
class UInstancedStaticMeshComponent;
class UMaterialInterface;
class UMaterialInstanceDynamic;
class UStaticMesh;
class ADirectionalLight;
class ASkyLight;
class AExponentialHeightFog;
class APostProcessVolume;

/** Builds and animates the whole world: islands, sea, sky, weather and scenery. */
UCLASS()
class COGANDGALE_API ACGWorld : public AActor
{
	GENERATED_BODY()

public:
	ACGWorld();

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	static ACGWorld* Get(const UObject* WorldContext);

	/** 0 calm .. 1 full storm. Set by the game mode as the journey advances. */
	UPROPERTY(BlueprintReadWrite, Category = "Weather")
	float Storm = 0.1f;

	/** Simulation clock in seconds. */
	UPROPERTY(BlueprintReadOnly, Category = "Weather")
	float SimTime = 0.f;

	/** 0..1 surface wetness, lags behind the storm. */
	UPROPERTY(BlueprintReadOnly, Category = "Weather")
	float Wet = 0.f;

	float SeaLevelAt(float X, float Z) const;
	FVector2f Wind(float X, float Z) const;

	/** A coloured material instance for props and vehicles. */
	UMaterialInstanceDynamic* MakeSolid(FLinearColor Color, float Roughness = 0.7f, float Metallic = 0.f, FLinearColor Emissive = FLinearColor::Black);

	UStaticMesh* Shape(int32 Kind);

private:
	void LoadAssets();
	void BuildSky();
	void BuildTerrain(int32 Index);
	void BuildOcean();
	void UpdateOcean();
	void BuildScenery();
	void UpdateWeather(float DeltaSeconds);
	UInstancedStaticMeshComponent* MakeInstances(UStaticMesh* Mesh, UMaterialInterface* Material, bool bShadow = true);

	UPROPERTY()
	TObjectPtr<USceneComponent> Root;
	UPROPERTY()
	TObjectPtr<UProceduralMeshComponent> TerrainMesh[2];
	UPROPERTY()
	TObjectPtr<UProceduralMeshComponent> OceanMesh;
	UPROPERTY()
	TObjectPtr<UMaterialInterface> TerrainMaterial;
	UPROPERTY()
	TObjectPtr<UMaterialInterface> OceanMaterial;
	UPROPERTY()
	TObjectPtr<UMaterialInterface> SolidMaterial;
	UPROPERTY()
	TObjectPtr<UMaterialInstanceDynamic> LampGlow;
	UPROPERTY()
	TObjectPtr<ADirectionalLight> Sun;
	UPROPERTY()
	TObjectPtr<ASkyLight> SkyLight;
	UPROPERTY()
	TObjectPtr<AExponentialHeightFog> Fog;
	UPROPERTY()
	TObjectPtr<APostProcessVolume> Post;
	UPROPERTY()
	TArray<TObjectPtr<UInstancedStaticMeshComponent>> Instances;
	UPROPERTY()
	TObjectPtr<UStaticMesh> Cube;
	UPROPERTY()
	TObjectPtr<UStaticMesh> Sphere;
	UPROPERTY()
	TObjectPtr<UStaticMesh> Cylinder;
	UPROPERTY()
	TObjectPtr<UStaticMesh> Cone;

	// ocean scratch buffers
	TArray<FVector2f> OceanGrid;
	TArray<FVector> OceanVerts;
	TArray<FVector> OceanNormals;
	TArray<FLinearColor> OceanColors;
	int32 OceanN = 161;
};
