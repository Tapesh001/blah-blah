#include "CGWorld.h"
#include "CGTerrain.h"
#include "ProceduralMeshComponent.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/SkyAtmosphereComponent.h"
#include "Components/VolumetricCloudComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Engine/DirectionalLight.h"
#include "Engine/SkyLight.h"
#include "Engine/ExponentialHeightFog.h"
#include "Engine/PostProcessVolume.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/PlayerController.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Materials/MaterialInterface.h"

namespace
{
	FLinearColor Hex(uint32 RGB)
	{
		return FLinearColor::FromSRGBColor(FColor((RGB >> 16) & 255, (RGB >> 8) & 255, RGB & 255));
	}

	FLinearColor Mix(const FLinearColor& A, const FLinearColor& B, float T)
	{
		return A + (B - A) * FMath::Clamp(T, 0.f, 1.f);
	}

	/** Small deterministic generator for scenery placement. */
	struct FRand
	{
		uint32 S = 1234567u;
		float Next()
		{
			S = S * 1664525u + 1013904223u;
			return (float)(S >> 8) / 16777216.f;
		}
	};

	bool FarFromRoads(float X, float Z, float Clear)
	{
		for (int32 r = 0; r < 2; r++)
		{
			const TArray<CG::FRoadSample>& R = CG::Road(r);
			for (int32 i = 0; i < R.Num(); i += 3)
			{
				if (FMath::Square(R[i].X - X) + FMath::Square(R[i].Z - Z) < Clear * Clear)
				{
					return false;
				}
			}
		}
		return true;
	}
}

ACGWorld::ACGWorld()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.TickGroup = TG_PostUpdateWork;

	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);
	for (int32 i = 0; i < 2; i++)
	{
		TerrainMesh[i] = CreateDefaultSubobject<UProceduralMeshComponent>(i == 0 ? TEXT("TerrainA") : TEXT("TerrainB"));
		TerrainMesh[i]->SetupAttachment(Root);
		TerrainMesh[i]->bUseAsyncCooking = true;
	}
	OceanMesh = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("Ocean"));
	OceanMesh->SetupAttachment(Root);
	OceanMesh->SetCastShadow(false);
}

ACGWorld* ACGWorld::Get(const UObject* WorldContext)
{
	if (const UWorld* World = WorldContext ? WorldContext->GetWorld() : nullptr)
	{
		for (TActorIterator<ACGWorld> It(World); It; ++It)
		{
			return *It;
		}
	}
	return nullptr;
}

float ACGWorld::SeaLevelAt(float X, float Z) const
{
	return CG::OceanHeight(X, Z, SimTime, CG::SeaAmplitude(Storm));
}

FVector2f ACGWorld::Wind(float X, float Z) const
{
	return CG::WindAt(X, Z, SimTime, Storm);
}

UMaterialInstanceDynamic* ACGWorld::MakeSolid(FLinearColor Color, float Roughness, float Metallic, FLinearColor Emissive, bool bTwoSided)
{
	LoadAssets();
	UMaterialInstanceDynamic* M = UMaterialInstanceDynamic::Create(bTwoSided ? DoubleMaterial : SolidMaterial, this);
	M->SetVectorParameterValue(TEXT("Color"), Color);
	M->SetScalarParameterValue(TEXT("Roughness"), Roughness);
	M->SetScalarParameterValue(TEXT("Metallic"), Metallic);
	M->SetVectorParameterValue(TEXT("Emissive"), Emissive);
	return M;
}

UStaticMesh* ACGWorld::Shape(int32 Kind)
{
	LoadAssets();
	return Kind == 0 ? Cube : Kind == 1 ? Sphere : Kind == 2 ? Cylinder : Cone;
}

void ACGWorld::LoadAssets()
{
	if (SolidMaterial)
	{
		return;
	}
	UMaterialInterface* Fallback = LoadObject<UMaterialInterface>(nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
	TerrainMaterial = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/CG/M_Terrain.M_Terrain"));
	OceanMaterial = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/CG/M_Ocean.M_Ocean"));
	SolidMaterial = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/CG/M_Solid.M_Solid"));
	if (!TerrainMaterial) { TerrainMaterial = Fallback; }
	if (!OceanMaterial) { OceanMaterial = Fallback; }
	if (!SolidMaterial) { SolidMaterial = Fallback; }
	DoubleMaterial = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/CG/M_Double.M_Double"));
	if (!DoubleMaterial) { DoubleMaterial = SolidMaterial; }
	Cube = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube"));
	Sphere = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Sphere.Sphere"));
	Cylinder = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
	Cone = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cone.Cone"));
}

void ACGWorld::BeginPlay()
{
	Super::BeginPlay();
	CG::EnsureInit();

	LoadAssets();

	BuildSky();
	BuildTerrain(0);
	BuildTerrain(1);
	BuildRoads();
	BuildOcean();
	BuildScenery();
	UpdateWeather(0.f);
}

void ACGWorld::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	SimTime += DeltaSeconds;
	Wet += ((Storm > 0.5f ? 1.f : 0.f) - Wet) * FMath::Min(1.f, DeltaSeconds * 0.05f);
	UpdateWeather(DeltaSeconds);
	UpdateOcean();
}

/* ---------------------------------------------------------------- sky */

void ACGWorld::BuildSky()
{
	UWorld* W = GetWorld();
	Sun = W->SpawnActor<ADirectionalLight>();
	if (UDirectionalLightComponent* L = Cast<UDirectionalLightComponent>(Sun->GetLightComponent()))
	{
		L->SetMobility(EComponentMobility::Movable);
		L->SetAtmosphereSunLight(true);
		L->SetCastShadows(true);
	}
	SkyLight = W->SpawnActor<ASkyLight>();
	if (USkyLightComponent* S = SkyLight->GetLightComponent())
	{
		S->SetMobility(EComponentMobility::Movable);
		S->bRealTimeCapture = true;
		S->SetIntensity(1.f);
		S->MarkRenderStateDirty();
	}
	W->SpawnActor<ASkyAtmosphere>();
	W->SpawnActor<AVolumetricCloud>();
	Fog = W->SpawnActor<AExponentialHeightFog>();
	if (UExponentialHeightFogComponent* F = Fog->GetComponent())
	{
		F->SetFogHeightFalloff(0.08f);
		F->SetVolumetricFog(true);
	}
	Post = W->SpawnActor<APostProcessVolume>();
	Post->bUnbound = true;
	FPostProcessSettings& P = Post->Settings;
	P.bOverride_BloomIntensity = true;
	P.BloomIntensity = 0.7f;
	P.bOverride_VignetteIntensity = true;
	P.VignetteIntensity = 0.45f;
	P.bOverride_AutoExposureMinBrightness = true;
	P.AutoExposureMinBrightness = 0.03f;
	P.bOverride_AutoExposureMaxBrightness = true;
	P.AutoExposureMaxBrightness = 3.f;
	P.bOverride_AutoExposureBias = true;
	P.AutoExposureBias = 0.6f;
}

void ACGWorld::UpdateWeather(float DeltaSeconds)
{
	const float S = FMath::Clamp(Storm, 0.f, 1.f);
	// The sun starts low and golden and sinks as the storm builds.
	const float El = FMath::DegreesToRadians(FMath::Lerp(26.f, 2.f, FMath::SmoothStep(0.05f, 0.95f, S)));
	const float Az = FMath::DegreesToRadians(250.f);
	const FVector ToSun(FMath::Sin(Az) * FMath::Cos(El), -FMath::Cos(Az) * FMath::Cos(El), FMath::Sin(El));
	if (Sun)
	{
		Sun->SetActorRotation((-ToSun).Rotation());
		if (ULightComponent* L = Sun->GetLightComponent())
		{
			L->SetIntensity(FMath::Lerp(9.f, 2.5f, S));
			L->SetLightColor(Mix(Hex(0xfff0d8), Hex(0xffb070), 1.f - FMath::Clamp(ToSun.Z * 4.f, 0.f, 1.f)));
		}
	}
	if (Fog)
	{
		if (UExponentialHeightFogComponent* F = Fog->GetComponent())
		{
			F->SetFogDensity(FMath::Lerp(0.012f, 0.06f, S));
		}
	}
	if (LampGlow)
	{
		LampGlow->SetVectorParameterValue(TEXT("Emissive"), Hex(0xffb45a) * FMath::Lerp(4.f, 60.f, S));
	}
}

/* ------------------------------------------------------------ terrain */

void ACGWorld::BuildTerrain(int32 Index)
{
	const CG::FGrid& G = CG::Grid(Index);
	const int32 N = G.N;
	TArray<FVector> Verts;
	TArray<FVector> Normals;
	TArray<FVector2D> UVs;
	TArray<FLinearColor> Colors;
	TArray<int32> Tris;
	TArray<FProcMeshTangent> Tangents;
	Verts.SetNumUninitialized(N * N);
	Normals.SetNumUninitialized(N * N);
	UVs.SetNumUninitialized(N * N);
	Colors.SetNumUninitialized(N * N);
	Tangents.Init(FProcMeshTangent(1.f, 0.f, 0.f), N * N);

	const float Step = G.Size / (N - 1);
	const FLinearColor GrassA = Hex(0x4f7a2c), GrassB = Hex(0x7c8f3a), Heath = Hex(0x6b5a4a), RockA = Hex(0x6e6a66), RockB = Hex(0x45413f);
	const FLinearColor Sand = Hex(0xc9b98a), RoadC = Hex(0x2e3034), Gravel = Hex(0x8a8378), Bed = Hex(0x2b4a4a);

	for (int32 j = 0; j < N; j++)
	{
		for (int32 i = 0; i < N; i++)
		{
			const int32 K = j * N + i;
			const float X = G.OX + i * Step;
			const float Z = G.OZ + j * Step;
			const float H = G.H[K];
			const float HX = G.H[j * N + FMath::Min(N - 1, i + 1)] - G.H[j * N + FMath::Max(0, i - 1)];
			const float HZ = G.H[FMath::Min(N - 1, j + 1) * N + i] - G.H[FMath::Max(0, j - 1) * N + i];
			const FVector Nrm = FVector(-HX / (2 * Step), -HZ / (2 * Step), 1.0).GetSafeNormal();
			Verts[K] = CG::ToUE(X, H, Z);
			Normals[K] = Nrm;
			UVs[K] = FVector2D(X / 8.0, Z / 8.0);

			const float Nz = CG::Fbm(X / 14, Z / 14, 3);
			const float Rd = G.Road[K];
			FLinearColor C;
			if (H < 0.2f)
			{
				C = Mix(Bed, Sand, FMath::SmoothStep(-3.f, 0.2f, H));
			}
			else
			{
				C = Mix(GrassA, GrassB, Nz);
				C = Mix(C, Heath, FMath::SmoothStep(70.f, 115.f, H) * 0.3f);
				C = Mix(C, Sand, 1 - FMath::SmoothStep(1.2f, 3.5f, H));
				C = Mix(C, Nz > 0.5f ? RockA : RockB, 1 - FMath::SmoothStep(0.72f, 0.86f, (float)Nrm.Z));
			}
			if (Rd < 9.f)
			{
				C = Mix(C, Gravel, 1 - FMath::SmoothStep(4.2f, 9.f, Rd));
				C = Mix(C, RoadC, 1 - FMath::SmoothStep(3.0f, 4.2f, Rd));
			}
			C *= 0.9f + 0.35f * CG::Fbm(X / 3.1f, Z / 3.1f, 2);
			// alpha carries "how much road" so the material can make tarmac smoother
			C.A = 1 - FMath::SmoothStep(3.0f, 4.5f, Rd);
			Colors[K] = C;
		}
	}
	Tris.Reserve((N - 1) * (N - 1) * 6);
	for (int32 j = 0; j < N - 1; j++)
	{
		for (int32 i = 0; i < N - 1; i++)
		{
			const int32 K = j * N + i;
			Tris.Append({ K, K + N, K + 1, K + 1, K + N, K + N + 1 });
		}
	}
	TerrainMesh[Index]->CreateMeshSection_LinearColor(0, Verts, Tris, Normals, UVs, Colors, Tangents, false, false);
	TerrainMesh[Index]->SetMaterial(0, TerrainMaterial);
}

/* -------------------------------------------------------------- roads */

void ACGWorld::BuildRoads()
{
	// a crisp ribbon laid on the flattened ground: tarmac with a dashed centre line
	const float Offsets[4] = { -3.5f, -0.13f, 0.13f, 3.5f };
	const FLinearColor Tarmac = Hex(0x2a2c30), Line = Hex(0xd8d2b0), PathC = Hex(0x7d766a);
	for (int32 r = 0; r < 2; r++)
	{
		const TArray<CG::FRoadSample>& R = CG::Road(r);
		TArray<FVector> Verts;
		TArray<FVector> Normals;
		TArray<FVector2D> UVs;
		TArray<FLinearColor> Colors;
		TArray<int32> Tris;
		TArray<FProcMeshTangent> Tangents;
		for (int32 i = 0; i < R.Num(); i++)
		{
			const FVector2f Side(FMath::Cos(R[i].Heading), FMath::Sin(R[i].Heading));
			const bool bDash = r == 0 && ((i / 2) & 1) == 0;
			for (int32 c = 0; c < 4; c++)
			{
				const float X = R[i].X + Side.X * Offsets[c];
				const float Z = R[i].Z + Side.Y * Offsets[c];
				Verts.Add(CG::ToUE(X, FMath::Max(R[i].H, CG::HeightAt(X, Z)) + 0.07f, Z));
				Normals.Add(FVector::UpVector);
				UVs.Add(FVector2D(c / 3.0, R[i].S / 7.0));
				FLinearColor C = r == 0 ? Tarmac : PathC;
				if (bDash && (c == 1 || c == 2))
				{
					C = Line;
				}
				C *= 0.85f + 0.3f * CG::Fbm(X / 1.7f, Z / 1.7f, 2);
				C.A = r == 0 ? 1.f : 0.f;
				Colors.Add(C);
				Tangents.Add(FProcMeshTangent(1.f, 0.f, 0.f));
			}
			if (i > 0)
			{
				const int32 K = (i - 1) * 4;
				for (int32 c = 0; c < 3; c++)
				{
					Tris.Append({ K + c, K + c + 4, K + c + 1, K + c + 1, K + c + 4, K + c + 5 });
				}
			}
		}
		UProceduralMeshComponent* Mesh = NewObject<UProceduralMeshComponent>(this);
		Mesh->AttachToComponent(Root, FAttachmentTransformRules::KeepRelativeTransform);
		Mesh->RegisterComponent();
		Mesh->CreateMeshSection_LinearColor(0, Verts, Tris, Normals, UVs, Colors, Tangents, false, false);
		Mesh->SetMaterial(0, TerrainMaterial);
		Mesh->SetCastShadow(false);
		RoadMeshes.Add(Mesh);
	}
}

/* -------------------------------------------------------------- ocean */

void ACGWorld::BuildOcean()
{
	const int32 N = OceanN;
	OceanGrid.SetNumUninitialized(N * N);
	OceanVerts.SetNumZeroed(N * N);
	OceanNormals.Init(FVector::UpVector, N * N);
	OceanColors.Init(FLinearColor(0, 0, 0, 0), N * N);
	TArray<int32> Tris;
	TArray<FVector2D> UVs;
	TArray<FProcMeshTangent> Tangents;
	UVs.SetNumZeroed(N * N);
	Tangents.Init(FProcMeshTangent(1.f, 0.f, 0.f), N * N);
	for (int32 j = 0; j < N; j++)
	{
		for (int32 i = 0; i < N; i++)
		{
			const float GX = (float)i / (N - 1) * 2 - 1;
			const float GZ = (float)j / (N - 1) * 2 - 1;
			// dense near the camera, stretching to the horizon
			auto Warp = [](float G) { const float A = FMath::Abs(G); return FMath::Sign(G) * (A * 70.f + FMath::Pow(A, 4.f) * 5200.f); };
			OceanGrid[j * N + i] = FVector2f(Warp(GX), Warp(GZ));
			OceanVerts[j * N + i] = FVector(OceanGrid[j * N + i].X * 100.0, OceanGrid[j * N + i].Y * 100.0, 0.0);
		}
	}
	for (int32 j = 0; j < N - 1; j++)
	{
		for (int32 i = 0; i < N - 1; i++)
		{
			const int32 K = j * N + i;
			Tris.Append({ K, K + N, K + 1, K + 1, K + N, K + N + 1 });
		}
	}
	OceanMesh->CreateMeshSection_LinearColor(0, OceanVerts, Tris, OceanNormals, UVs, OceanColors, Tangents, false, false);
	OceanMesh->SetMaterial(0, OceanMaterial);
}

void ACGWorld::UpdateOcean()
{
	FVector Cam = FVector::ZeroVector;
	if (const APlayerController* PC = GetWorld()->GetFirstPlayerController())
	{
		if (PC->PlayerCameraManager)
		{
			Cam = PC->PlayerCameraManager->GetCameraLocation();
		}
	}
	const float CX = FMath::FloorToFloat(Cam.X / 400.0) * 4.f;
	const float CZ = FMath::FloorToFloat(Cam.Y / 400.0) * 4.f;
	const float Sea = CG::SeaAmplitude(Storm);
	const float Foam = 0.04f + 0.8f * Storm * Storm;
	const int32 Count = OceanGrid.Num();
	for (int32 K = 0; K < Count; K++)
	{
		const float X = CX + OceanGrid[K].X;
		const float Z = CZ + OceanGrid[K].Y;
		float Crest;
		FVector3f Nrm;
		const float Y = CG::OceanHeight(X, Z, SimTime, Sea, &Crest, &Nrm);
		OceanVerts[K] = CG::ToUE(X, Y, Z);
		OceanNormals[K] = FVector(Nrm);
		OceanColors[K].A = FMath::SmoothStep(0.55f - Foam * 0.45f, 1.0f, Crest);
	}
	TArray<FVector2D> NoUV;
	TArray<FProcMeshTangent> NoTangents;
	OceanMesh->UpdateMeshSection_LinearColor(0, OceanVerts, OceanNormals, NoUV, OceanColors, NoTangents, false);
}

/* ------------------------------------------------------------ scenery */

UInstancedStaticMeshComponent* ACGWorld::MakeInstances(UStaticMesh* Mesh, UMaterialInterface* Material, bool bShadow)
{
	UInstancedStaticMeshComponent* C = NewObject<UInstancedStaticMeshComponent>(this);
	C->SetStaticMesh(Mesh);
	C->SetMaterial(0, Material);
	C->SetCastShadow(bShadow);
	C->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	C->AttachToComponent(Root, FAttachmentTransformRules::KeepRelativeTransform);
	C->RegisterComponent();
	Instances.Add(C);
	return C;
}

void ACGWorld::BuildScenery()
{
	FRand Rnd;
	// pines: a trunk and three cone tiers
	UInstancedStaticMeshComponent* Trunks = MakeInstances(Cylinder, MakeSolid(Hex(0x4a3524), 0.9f));
	UInstancedStaticMeshComponent* Tier[3] = {
		MakeInstances(Cone, MakeSolid(Hex(0x1f4a2a), 0.85f)),
		MakeInstances(Cone, MakeSolid(Hex(0x275a31), 0.85f)),
		MakeInstances(Cone, MakeSolid(Hex(0x2f6a38), 0.85f)) };
	UInstancedStaticMeshComponent* Rocks = MakeInstances(Sphere, MakeSolid(Hex(0x77726c), 0.95f));

	auto Scatter = [&](int32 IsleIndex, int32 Count, bool bPine)
	{
		const CG::FIsle& I = CG::Grid(IsleIndex).Isle;
		int32 Placed = 0;
		for (int32 Try = 0; Try < Count * 30 && Placed < Count; Try++)
		{
			const float X = I.X + (Rnd.Next() * 2 - 1) * I.R;
			const float Z = I.Z + (Rnd.Next() * 2 - 1) * I.R;
			const float H = CG::HeightAt(X, Z);
			if (bPine)
			{
				if (H < 6 || H > 88 || CG::Fbm(X / 70, Z / 70, 3) < 0.52f || !FarFromRoads(X, Z, 9))
				{
					continue;
				}
				const float S = 0.8f + Rnd.Next() * 0.9f;
				const FRotator Rot(0, Rnd.Next() * 360, 0);
				Trunks->AddInstance(FTransform(Rot, CG::ToUE(X, H + 1.0f * S, Z), FVector(0.45, 0.45, 2.4) * S));
				Tier[0]->AddInstance(FTransform(Rot, CG::ToUE(X, H + 3.4f * S, Z), FVector(4.0, 4.0, 3.4) * S));
				Tier[1]->AddInstance(FTransform(Rot, CG::ToUE(X, H + 5.2f * S, Z), FVector(3.0, 3.0, 3.0) * S));
				Tier[2]->AddInstance(FTransform(Rot, CG::ToUE(X, H + 6.9f * S, Z), FVector(1.9, 1.9, 2.6) * S));
			}
			else
			{
				if (H < 0.5f || !FarFromRoads(X, Z, 7))
				{
					continue;
				}
				const float S = 0.6f + Rnd.Next() * 2.4f;
				Rocks->AddInstance(FTransform(FRotator(Rnd.Next() * 30, Rnd.Next() * 360, Rnd.Next() * 30), CG::ToUE(X, H, Z),
					FVector(S * (1.2 + Rnd.Next()), S * (1.0 + Rnd.Next()), S * (0.6 + 0.5 * Rnd.Next()))));
			}
			Placed++;
		}
	};
	Scatter(0, 1100, true);
	Scatter(1, 160, true);
	Scatter(0, 500, false);
	Scatter(1, 300, false);

	// lamps along both roads
	LampGlow = MakeSolid(Hex(0x221a10), 0.4f, 0.f, Hex(0xffb45a) * 8.f);
	UInstancedStaticMeshComponent* Posts = MakeInstances(Cylinder, MakeSolid(Hex(0x23262b), 0.5f, 0.8f));
	UInstancedStaticMeshComponent* Bulbs = MakeInstances(Sphere, LampGlow, false);
	for (int32 r = 0; r < 2; r++)
	{
		const TArray<CG::FRoadSample>& R = CG::Road(r);
		for (int32 i = 10; i < R.Num(); i += 22)
		{
			const float Side = ((i / 22) & 1) ? 1.f : -1.f;
			const float X = R[i].X + FMath::Cos(R[i].Heading) * 4.6f * Side;
			const float Z = R[i].Z + FMath::Sin(R[i].Heading) * 4.6f * Side;
			const float H = CG::HeightAt(X, Z);
			Posts->AddInstance(FTransform(FRotator::ZeroRotator, CG::ToUE(X, H + 1.8f, Z), FVector(0.12, 0.12, 3.6)));
			Bulbs->AddInstance(FTransform(FRotator::ZeroRotator, CG::ToUE(X, H + 3.75f, Z), FVector(0.42)));
		}
	}

	// the village above the harbour, the foundry at the summit, the pier
	UInstancedStaticMeshComponent* Walls = MakeInstances(Cube, MakeSolid(Hex(0xd9d2c4), 0.9f));
	UInstancedStaticMeshComponent* Roofs = MakeInstances(Cone, MakeSolid(Hex(0x7a3b2c), 0.8f));
	UInstancedStaticMeshComponent* Windows = MakeInstances(Cube, LampGlow, false);
	UInstancedStaticMeshComponent* Wood = MakeInstances(Cube, MakeSolid(Hex(0x5b4330), 0.85f));
	const TArray<CG::FRoadSample>& RA = CG::Road(0);
	auto House = [&](float X, float Z, float Heading, float W, float D, float HH)
	{
		const float H = CG::HeightAt(X, Z) - 0.3f;
		const FRotator Rot(0, CG::YawDeg(Heading), 0);
		Walls->AddInstance(FTransform(Rot, CG::ToUE(X, H + HH / 2, Z), FVector(D, W, HH)));
		Roofs->AddInstance(FTransform(Rot, CG::ToUE(X, H + HH + 1.1f, Z), FVector(D * 1.5, W * 1.5, 2.2)));
		Windows->AddInstance(FTransform(Rot, CG::ToUE(X, H + HH * 0.55f, Z), FVector(D + 0.08, W * 0.5, 0.9)));
	};
	for (int32 i = 0; i < 16; i++)
	{
		const CG::FRoadSample& P = RA[FMath::FloorToInt(RA.Num() * (0.78f + 0.011f * i))];
		const float Side = (i & 1) ? 1.f : -1.f;
		const float Off = 11 + (i % 3) * 5;
		House(P.X + FMath::Cos(P.Heading) * Off * Side, P.Z + FMath::Sin(P.Heading) * Off * Side, P.Heading, 6 + (i % 3), 5 + (i % 2) * 2, 3.4f + (i % 3) * 0.8f);
	}
	House(RA[0].X - 16, RA[0].Z - 6, 0.6f, 14, 10, 7);
	{
		const CG::FRoadSample& A = RA[RA.Num() - 16];
		const CG::FRoadSample& B = RA.Last();
		const float Len = FMath::Sqrt(FMath::Square(B.X - A.X) + FMath::Square(B.Z - A.Z));
		Wood->AddInstance(FTransform(FRotator(0, CG::YawDeg(A.Heading), 0), CG::ToUE((A.X + B.X) / 2, 1.85f, (A.Z + B.Z) / 2), FVector(Len, 7, 0.35)));
	}
	// the engine tower on the far island
	{
		const CG::FRoadSample& E = CG::Road(1).Last();
		const float H = CG::HeightAt(E.X + 12, E.Z);
		MakeInstances(Cylinder, MakeSolid(Hex(0x8b8478), 0.85f))->AddInstance(FTransform(FRotator::ZeroRotator, CG::ToUE(E.X + 12, H + 14, E.Z), FVector(10, 10, 30)));
		MakeInstances(Sphere, MakeSolid(Hex(0x111111), 0.3f, 0.f, Hex(0x8fd8ff) * 40.f), false)->AddInstance(FTransform(FRotator::ZeroRotator, CG::ToUE(E.X + 12, H + 31, E.Z), FVector(4.8)));
	}
}
