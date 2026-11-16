#include "CGBenchPawn.h"
#include "CGWorld.h"
#include "Camera/CameraComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "GameFramework/PlayerController.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "ProceduralMeshComponent.h"

namespace
{
	const float MeshTolerance = 0.35f; // centimetres
	const float BoardCentreZ = 40.f;

	/** Turn a gear about the board's normal by a mathematical angle in the board plane. */
	FQuat Spin(float Angle)
	{
		static const float Sense = FQuat(FVector::XAxisVector, 0.5f).RotateVector(FVector::YAxisVector).Z > 0 ? 1.f : -1.f;
		return FQuat(FVector::XAxisVector, Sense * Angle);
	}
}

ACGBenchPawn::ACGBenchPawn()
{
	PrimaryActorTick.bCanEverTick = true;
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);
	// the board leans back; its +X points at the viewer, +Y right, +Z up the board
	Board = CreateDefaultSubobject<USceneComponent>(TEXT("Board"));
	Board->SetupAttachment(Root);
	Board->SetRelativeLocation(FVector(0, 0, 92));
	Board->SetRelativeRotation(FRotator(22, 0, 0));
	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
	Camera->SetupAttachment(Root);
	Camera->SetRelativeLocation(FVector(128, 0, 158));
	Camera->SetRelativeRotation((FVector(0, 0, 126) - FVector(128, 0, 158)).Rotation());
	Camera->SetFieldOfView(52.f);
	Lamp = CreateDefaultSubobject<UPointLightComponent>(TEXT("Lamp"));
	Lamp->SetupAttachment(Root);
	Lamp->SetRelativeLocation(FVector(70, -60, 190));
	Lamp->SetIntensity(14000.f);
	Lamp->SetAttenuationRadius(450.f);
	Lamp->SetLightColor(FLinearColor(1.f, 0.82f, 0.6f));
	Lamp->SetCastShadows(true);
}

void ACGBenchPawn::Setup(bool bEngine)
{
	bEngineKind = bEngine;
}

void ACGBenchPawn::BeginPlay()
{
	Super::BeginPlay();
	World = ACGWorld::Get(this);
}

void ACGBenchPawn::EndPlay(const EEndPlayReason::Type Reason)
{
	if (APlayerController* PC = GetWorld()->GetFirstPlayerController())
	{
		PC->bShowMouseCursor = false;
		PC->SetInputMode(FInputModeGameOnly());
	}
	Super::EndPlay(Reason);
}

void ACGBenchPawn::AddGear(int32 Teeth, int32 Axle, bool bFixed, const FVector2f& TrayPos, UMaterialInterface* Material)
{
	FGear G;
	G.Teeth = Teeth;
	G.Axle = Axle;
	G.bFixed = bFixed;
	G.Tray = TrayPos;
	G.Pos = Axle >= 0 ? Axles[Axle].Pos : TrayPos;
	G.Mesh = MakeGear(Teeth, Material);
	Gears.Add(G);
}

void ACGBenchPawn::BuildBench()
{
	if (!World)
	{
		return;
	}
	bBuilt = true;
	UMaterialInterface* Oak = World->MakeSolid(Hex(0x4a3524), 0.75f);
	UMaterialInterface* DarkOak = World->MakeSolid(Hex(0x2c2018), 0.8f);
	UMaterialInterface* Steel = World->MakeSolid(Hex(0xc4c8ce), 0.38f, 0.35f);
	UMaterialInterface* Brass = World->MakeSolid(Hex(0xd9aa45), 0.36f, 0.4f);
	UMaterialInterface* Bronze = World->MakeSolid(Hex(0xc06e2a), 0.36f, 0.4f, Hex(0xff8a30) * 0.5f);
	UMaterialInterface* Iron = World->MakeSolid(Hex(0x23262b), 0.5f, 0.9f);

	// the bench: top, legs, the leaning board and a tray shelf
	UStaticMeshComponent* Top = AddPart(Root, 0, Oak);
	Top->SetRelativeLocation(FVector(0, 0, 86));
	Top->SetRelativeScale3D(FVector(0.9, 1.5, 0.07));
	for (int32 i = 0; i < 4; i++)
	{
		AddTube(Root, FVector((i & 1) ? 38 : -38, (i & 2) ? 66 : -66, 0), FVector((i & 1) ? 38 : -38, (i & 2) ? 66 : -66, 84), 7, DarkOak);
	}
	UStaticMeshComponent* Panel = AddPart(Board, 0, DarkOak);
	Panel->SetRelativeLocation(FVector(-2.2, 0, BoardCentreZ));
	Panel->SetRelativeScale3D(FVector(0.03, 1.24, 0.84));
	UStaticMeshComponent* Shelf = AddPart(Board, 0, Oak);
	Shelf->SetRelativeLocation(FVector(4, 0, -4));
	Shelf->SetRelativeScale3D(FVector(0.14, 1.24, 0.02));

	if (!bEngineKind)
	{
		// crank (30T) -> one idler -> rear cog (12T): 2.5x, same sense as the crank
		Axles = { { FVector2f(-14.f, 40.f), 1 }, { FVector2f(3.77f, 44.76f), 0 }, { FVector2f(14.29f, 40.93f), 2 } };
		GoalRatio = 2.5f;
		AddGear(30, 0, true, FVector2f::ZeroVector, Steel);
		AddGear(12, 2, true, FVector2f::ZeroVector, Steel);
		const int32 Loose[4] = { 20, 12, 24, 16 };
		for (int32 i = 0; i < 4; i++)
		{
			AddGear(Loose[i], -1, false, FVector2f(-42.f + i * 24.f, 6.5f + Radius(Loose[i])), Brass);
		}
	}
	else
	{
		// spring (20T) -> two idlers -> the Keystone (40T): half speed, opposite sense
		Axles = { { FVector2f(-22.f, 40.f), 1 }, { FVector2f(-5.46f, 46.02f), 0 }, { FVector2f(8.4f, 38.02f), 0 }, { FVector2f(30.46f, 41.91f), 2 } };
		GoalRatio = -0.5f;
		AddGear(20, 0, true, FVector2f::ZeroVector, Steel);
		AddGear(40, 3, true, FVector2f::ZeroVector, Bronze);
		const int32 Loose[5] = { 16, 28, 12, 24, 20 };
		for (int32 i = 0; i < 5; i++)
		{
			AddGear(Loose[i], -1, false, FVector2f(-50.f + i * 25.f, -14.f + Radius(Loose[i])), Brass);
		}
	}
	for (const FAxle& A : Axles)
	{
		AddTube(Board, FVector(-1, A.Pos.X, A.Pos.Y), FVector(4.2, A.Pos.X, A.Pos.Y), 1.8, Iron);
	}
	Objective = bEngineKind ? TEXT("SEAT THE KEYSTONE") : TEXT("REBUILD THE DRIVETRAIN");
	Evaluate();
	PoseGears();
}

UProceduralMeshComponent* ACGBenchPawn::MakeGear(int32 Teeth, UMaterialInterface* Material)
{
	const float R = Radius(Teeth), Out = R + 0.42f, In = R - 0.42f, Half = 0.8f;
	const float Pitch = 2.f * PI / Teeth;
	TArray<FVector2f> Rim;
	for (int32 k = 0; k < Teeth; k++)
	{
		const float C = Pitch * k;
		auto P = [](float A, float Rad) { return FVector2f(FMath::Cos(A) * Rad, FMath::Sin(A) * Rad); };
		Rim.Add(P(C - Pitch * 0.27f, In));
		Rim.Add(P(C - Pitch * 0.15f, Out));
		Rim.Add(P(C + Pitch * 0.15f, Out));
		Rim.Add(P(C + Pitch * 0.27f, In));
	}
	TArray<FVector> Verts;
	TArray<FVector> Normals;
	TArray<int32> Tris;
	// front face: a fan with six spoke holes implied by the hub disc added below
	Verts.Add(FVector(Half, 0, 0));
	Normals.Add(FVector(1, 0, 0));
	for (const FVector2f& P : Rim)
	{
		Verts.Add(FVector(Half, P.X, P.Y));
		Normals.Add(FVector(1, 0, 0));
	}
	for (int32 i = 0; i < Rim.Num(); i++)
	{
		Tris.Append({ 0, 1 + i, 1 + (i + 1) % Rim.Num() });
	}
	// the toothed edge
	for (int32 i = 0; i < Rim.Num(); i++)
	{
		const FVector2f A = Rim[i], B = Rim[(i + 1) % Rim.Num()];
		const FVector2f Edge = B - A;
		const FVector N = FVector(0, Edge.Y, -Edge.X).GetSafeNormal();
		const int32 K = Verts.Num();
		Verts.Append({ FVector(Half, A.X, A.Y), FVector(Half, B.X, B.Y), FVector(-Half, A.X, A.Y), FVector(-Half, B.X, B.Y) });
		Normals.Append({ N, N, N, N });
		Tris.Append({ K, K + 2, K + 1, K + 1, K + 2, K + 3 });
	}
	// draw every face both ways round so the one-sided material always shows the lit side
	const int32 Single = Tris.Num();
	for (int32 i = 0; i < Single; i += 3)
	{
		Tris.Append({ Tris[i], Tris[i + 2], Tris[i + 1] });
	}
	TArray<FVector2D> UVs;
	TArray<FLinearColor> Colors;
	TArray<FProcMeshTangent> Tangents;
	UVs.SetNumZeroed(Verts.Num());
	Colors.Init(FLinearColor::White, Verts.Num());
	Tangents.Init(FProcMeshTangent(0.f, 1.f, 0.f), Verts.Num());
	UProceduralMeshComponent* Mesh = NewObject<UProceduralMeshComponent>(this);
	Mesh->AttachToComponent(Board, FAttachmentTransformRules::KeepRelativeTransform);
	Mesh->RegisterComponent();
	Mesh->CreateMeshSection_LinearColor(0, Verts, Tris, Normals, UVs, Colors, Tangents, false, false);
	Mesh->SetMaterial(0, Material);
	GearMeshes.Add(Mesh);
	return Mesh;
}

bool ACGBenchPawn::CursorOnBoard(FVector2f& Out) const
{
	const APlayerController* PC = Cast<APlayerController>(GetController());
	FVector Origin, Dir;
	if (!PC || !PC->DeprojectMousePositionToWorld(Origin, Dir))
	{
		return false;
	}
	const FTransform T = Board->GetComponentTransform();
	const FVector N = T.GetUnitAxis(EAxis::X);
	const double Denom = FVector::DotProduct(Dir, N);
	if (FMath::Abs(Denom) < 1e-4)
	{
		return false;
	}
	const double Dist = FVector::DotProduct(T.GetLocation() + N * 1.5 - Origin, N) / Denom;
	const FVector Local = T.InverseTransformPosition(Origin + Dir * Dist);
	Out = FVector2f(Local.Y, Local.Z);
	return Dist > 0;
}

bool ACGBenchPawn::CanSeat(int32 GearIndex, int32 AxleIndex) const
{
	const float R = Radius(Gears[GearIndex].Teeth);
	for (int32 i = 0; i < Gears.Num(); i++)
	{
		if (i == GearIndex || Gears[i].Axle < 0)
		{
			continue;
		}
		if (Gears[i].Axle == AxleIndex)
		{
			return false; // taken
		}
		const float D = (Axles[Gears[i].Axle].Pos - Axles[AxleIndex].Pos).Size();
		if (D < R + Radius(Gears[i].Teeth) - MeshTolerance)
		{
			return false; // teeth would clash
		}
	}
	return true;
}

void ACGBenchPawn::Evaluate()
{
	for (FGear& G : Gears)
	{
		G.Omega = 0.f;
	}
	int32 Driver = INDEX_NONE, Output = INDEX_NONE;
	for (int32 i = 0; i < Gears.Num(); i++)
	{
		if (Gears[i].Axle >= 0 && Axles[Gears[i].Axle].Role == 1) { Driver = i; }
		if (Gears[i].Axle >= 0 && Axles[Gears[i].Axle].Role == 2) { Output = i; }
	}
	OutputRatio = 0.f;
	if (Driver == INDEX_NONE)
	{
		return;
	}
	// spread rotation outwards from the driver through every meshing pair
	TArray<int32> Queue;
	Gears[Driver].Omega = 1.f;
	Gears[Driver].Angle = DriverAngle;
	Queue.Add(Driver);
	for (int32 q = 0; q < Queue.Num(); q++)
	{
		const FGear& P = Gears[Queue[q]];
		for (int32 i = 0; i < Gears.Num(); i++)
		{
			FGear& C = Gears[i];
			if (C.Axle < 0 || C.Omega != 0.f)
			{
				continue;
			}
			const FVector2f Delta = Axles[C.Axle].Pos - Axles[P.Axle].Pos;
			if (FMath::Abs(Delta.Size() - (Radius(P.Teeth) + Radius(C.Teeth))) > MeshTolerance)
			{
				continue;
			}
			C.Omega = -P.Omega * P.Teeth / C.Teeth;
			// phase so a tooth of one sits in a gap of the other on the line between centres
			const float Phi = FMath::Atan2(Delta.Y, Delta.X);
			C.Angle = Phi + PI + (PI - (P.Angle - Phi) * P.Teeth) / C.Teeth;
			Queue.Add(i);
		}
	}
	if (Output != INDEX_NONE)
	{
		OutputRatio = Gears[Output].Omega;
	}
}

void ACGBenchPawn::PoseGears()
{
	for (int32 i = 0; i < Gears.Num(); i++)
	{
		FGear& G = Gears[i];
		const bool bSeated = G.Axle >= 0;
		const float Lift = i == Held ? 6.f : 1.6f;
		G.Mesh->SetRelativeLocation(FVector(Lift, G.Pos.X, G.Pos.Y));
		G.Mesh->SetRelativeRotation(Spin(bSeated ? G.Angle : 0.f));
	}
}

void ACGBenchPawn::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	APlayerController* PC = Cast<APlayerController>(GetController());
	if (!PC)
	{
		return;
	}
	if (!bBuilt)
	{
		BuildBench();
		PC->bShowMouseCursor = true;
		FInputModeGameAndUI Mode;
		Mode.SetHideCursorDuringCapture(false);
		PC->SetInputMode(Mode);
	}
	NoticeTime -= DeltaSeconds;

	FVector2f Cursor;
	const bool bCursor = CursorOnBoard(Cursor);
	if (Stage == 0 && bCursor)
	{
		if (PC->WasInputKeyJustPressed(EKeys::LeftMouseButton))
		{
			// pick up the loose gear under the cursor
			for (int32 i = 0; i < Gears.Num(); i++)
			{
				if (!Gears[i].bFixed && (Gears[i].Pos - Cursor).Size() < Radius(Gears[i].Teeth) + 1.f)
				{
					Held = i;
					Gears[i].Axle = -1;
				}
			}
		}
		if (Held >= 0)
		{
			Gears[Held].Pos = Cursor;
			if (!PC->IsInputKeyDown(EKeys::LeftMouseButton))
			{
				// drop: seat on the nearest free axle if it fits, otherwise back to the tray
				int32 Best = INDEX_NONE;
				float BestD = 6.f;
				for (int32 a = 0; a < Axles.Num(); a++)
				{
					const float D = (Axles[a].Pos - Cursor).Size();
					if (Axles[a].Role == 0 && D < BestD)
					{
						BestD = D;
						Best = a;
					}
				}
				FGear& G = Gears[Held];
				if (Best != INDEX_NONE && CanSeat(Held, Best))
				{
					G.Axle = Best;
					G.Pos = Axles[Best].Pos;
				}
				else
				{
					if (Best != INDEX_NONE)
					{
						Notice = TEXT("That gear does not fit there: the teeth clash");
						NoticeTime = 2.5f;
					}
					G.Pos = G.Tray;
				}
				Held = -1;
			}
		}
	}

	const bool bSpin = PC->IsInputKeyDown(EKeys::SpaceBar);
	if (bSpin)
	{
		DriverAngle += 2.2f * DeltaSeconds;
	}
	Evaluate();
	const bool bRight = OutputRatio != 0.f && FMath::Abs(OutputRatio - GoalRatio) < 0.02f;

	if (Stage == 0 && bRight && bSpin)
	{
		SpinTime += DeltaSeconds;
		if (SpinTime > 1.2f)
		{
			Stage = bEngineKind ? 2 : 1;
			SpinTime = 0.f;
		}
	}
	else if (Stage == 1)
	{
		const float Turn = (PC->IsInputKeyDown(EKeys::D) ? 1.f : 0.f) - (PC->IsInputKeyDown(EKeys::A) ? 1.f : 0.f);
		Tension = FMath::Clamp(Tension + Turn * 0.3f * DeltaSeconds, 0.f, 1.f);
		const bool bGood = Tension > 0.55f && Tension < 0.7f;
		if (bSpin && bGood)
		{
			SpinTime += DeltaSeconds;
			if (SpinTime > 1.0f)
			{
				Stage = 2;
			}
		}
		else
		{
			if (bSpin && NoticeTime <= 0.f)
			{
				Notice = Tension <= 0.55f ? TEXT("The chain is slack and skips") : TEXT("The chain is too tight and binds");
				NoticeTime = 1.5f;
			}
			SpinTime = 0.f;
		}
	}
	else if (Stage == 2)
	{
		DriverAngle += 2.2f * DeltaSeconds;
		SolvedTime += DeltaSeconds;
		if (SolvedTime > 1.6f)
		{
			bFinished = true;
		}
	}
	PoseGears();

	// HUD
	auto Describe = [](float Ratio)
	{
		return Ratio == 0.f ? FString(TEXT("not turning")) : FString::Printf(TEXT("%.2fx %s"), FMath::Abs(Ratio), Ratio > 0 ? TEXT("same way") : TEXT("opposite way"));
	};
	BigText = Stage == 2 ? TEXT("It runs") : TEXT("");
	Lines.Reset();
	Lines.Add(FString::Printf(TEXT("goal    %s"), *Describe(GoalRatio)));
	Lines.Add(FString::Printf(TEXT("output  %s"), *Describe(OutputRatio)));
	Bars.Reset();
	if (Stage == 1)
	{
		Bars.Add({ TEXT("chain tension (aim for the middle third)"), Tension, false });
	}
	if (NoticeTime > 0.f) { Prompt = Notice; }
	else if (Stage == 0 && !bRight) { Prompt = TEXT("Drag a gear from the shelf onto the empty axle. Hold Space to turn the crank"); }
	else if (Stage == 0) { Prompt = TEXT("That ratio is right. Hold Space to run it in"); }
	else if (Stage == 1) { Prompt = TEXT("A/D to tension the chain, then hold Space to test"); }
	else { Prompt = TEXT("Repaired"); }
}
