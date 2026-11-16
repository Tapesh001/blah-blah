#include "CGBoatPawn.h"
#include "CGTerrain.h"
#include "CGWorld.h"
#include "CableComponent.h"
#include "Camera/CameraComponent.h"
#include "Components/StaticMeshComponent.h"
#include "GameFramework/PlayerController.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "ProceduralMeshComponent.h"

namespace
{
	const float BoatMass = 500.f;
	const float SailArea[3] = { 9.5f, 6.6f, 4.3f };
	// body space, centimetres (+X bow, +Y starboard, +Z up)
	const FVector MastFoot(70, 0, 125);
	const float BoomLength = 300.f;
	const float LuffHeight = 480.f;
	const FVector WinchPos(-135, 52, 44);
	const FVector SeatPos(-195, -12, 108);

	float LiftCoefficient(float AlphaDeg)
	{
		if (AlphaDeg < 4.f) { return 0.f; }
		if (AlphaDeg < 24.f) { return 1.3f * (AlphaDeg - 4.f) / 20.f; }
		if (AlphaDeg < 32.f) { return 1.3f; }
		if (AlphaDeg < 60.f) { return FMath::Lerp(1.3f, 0.6f, (AlphaDeg - 32.f) / 28.f); }
		return FMath::Lerp(0.6f, 0.1f, FMath::Min(1.f, (AlphaDeg - 60.f) / 30.f));
	}
}

ACGBoatPawn::ACGBoatPawn()
{
	PrimaryActorTick.bCanEverTick = true;

	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);
	Body = CreateDefaultSubobject<USceneComponent>(TEXT("Body"));
	Body->SetupAttachment(Root);
	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
	Camera->SetupAttachment(Root);
	Camera->SetUsingAbsoluteLocation(true);
	Camera->SetUsingAbsoluteRotation(true);
	Camera->SetFieldOfView(72.f);
	Hull = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("Hull"));
	Hull->SetupAttachment(Body);
	Sail = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("Sail"));
	Sail->SetupAttachment(Body);
	BoomPivot = CreateDefaultSubobject<USceneComponent>(TEXT("BoomPivot"));
	BoomPivot->SetupAttachment(Body);
	BoomPivot->SetRelativeLocation(MastFoot - FVector(0, 0, 8));
	TillerPivot = CreateDefaultSubobject<USceneComponent>(TEXT("TillerPivot"));
	TillerPivot->SetupAttachment(Body);
	TillerPivot->SetRelativeLocation(FVector(-268, 0, 52));
	HandlePivot = CreateDefaultSubobject<USceneComponent>(TEXT("HandlePivot"));
	HandlePivot->SetupAttachment(Body);
	HandlePivot->SetRelativeLocation(WinchPos + FVector(0, 0, 22));
	for (int32 i = 0; i < 2; i++)
	{
		GearPivot[i] = CreateDefaultSubobject<USceneComponent>(i == 0 ? TEXT("GearA") : TEXT("GearB"));
		GearPivot[i]->SetupAttachment(Body);
	}
	GearPivot[0]->SetRelativeLocation(WinchPos + FVector(15, 0, 3));
	GearPivot[1]->SetRelativeLocation(WinchPos + FVector(24, 6, 3));
	Sheet = CreateDefaultSubobject<UCableComponent>(TEXT("Sheet"));
	Sheet->SetupAttachment(BoomPivot);
	Sheet->SetRelativeLocation(FVector(-BoomLength + 15, 0, -6));
	Sheet->NumSegments = 18;
	Sheet->CableWidth = 2.4f;
	Sheet->SolverIterations = 6;
	Sheet->EndLocation = FVector(0, 0, 10);
}

void ACGBoatPawn::BeginPlay()
{
	Super::BeginPlay();
	CG::EnsureInit();
	World = ACGWorld::Get(this);
	const CG::FPlaces& P = CG::Places();
	X = P.BoatStart.X;
	Z = P.BoatStart.Y;
	Heading = P.BoatHeading;
	BuildModel();
	PoseModel(0.f);
	Objective = TEXT("SAIL TO THE FAR ISLAND");
	Prompt = TEXT("A/D rudder   W/S sail size   V cockpit and winch");
	bShowWind = true;
}

void ACGBoatPawn::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	const float Dt = FMath::Min(DeltaSeconds, 1.f / 30.f);
	SimClock += Dt;
	Simulate(Dt);
	StepSail(Dt);
	PoseModel(Dt);
	UpdateCamera(DeltaSeconds);

	if (World)
	{
		World->Storm = FMath::Clamp(0.45f + 0.5f * (X - 478.f) / 727.f, 0.45f, 0.95f);
	}
	BigText = FString::Printf(TEXT("%3.1f kn"), Forward * 1.944f);
	Lines.Reset();
	Lines.Add(FString::Printf(TEXT("sail %d%%    heel %2.0f deg    rope load %4.0f N"), FMath::RoundToInt(SailArea[Reef] / SailArea[0] * 100), FMath::RadiansToDegrees(FMath::Abs(Heel)), Load));
	Bars.Reset();
	Bars.Add({ TEXT("trim"), Trim, false });
	Bars.Add({ TEXT("rope out"), SheetOut, false });
}

/** Sail force for a given sheet setting, in the boat's frame. Apparent = air velocity relative to the boat (x fwd, y right). */
ACGBoatPawn::FSailForce ACGBoatPawn::SailForce(float SheetValue, const FVector2f& Apparent) const
{
	FSailForce Out;
	const float Speed = Apparent.Size();
	if (Speed < 0.1f)
	{
		return Out;
	}
	// angle the wind comes FROM, off the bow (+ = starboard)
	const float Awa = FMath::Atan2(-Apparent.Y, -Apparent.X);
	const float MaxBoom = FMath::DegreesToRadians(5.f + SheetValue * 80.f);
	const float BoomAbs = FMath::Min(FMath::Abs(Awa), MaxBoom);
	Out.Boom = BoomAbs;
	Out.Alpha = FMath::Abs(Awa) - BoomAbs;
	const float AlphaDeg = FMath::RadiansToDegrees(Out.Alpha);
	const float CL = LiftCoefficient(AlphaDeg);
	const float CD = 0.05f + 1.1f * FMath::Square(FMath::Sin(Out.Alpha));
	const float Q = 0.5f * 1.225f * Speed * Speed * SailArea[Reef] * FMath::Cos(Heel);
	const FVector2f Flow = Apparent / Speed;
	// lift is square to the flow, on the side that points ahead
	FVector2f Perp(-Flow.Y, Flow.X);
	if (Perp.X < 0.f)
	{
		Perp = -Perp;
	}
	const FVector2f F = (Perp * CL + Flow * CD) * Q;
	Out.Drive = F.X;
	Out.Side = F.Y;
	Out.Load = F.Size() * 0.6f;
	Out.Lift = CL;
	return Out;
}

void ACGBoatPawn::Simulate(float Dt)
{
	if (KeyHit(EKeys::V))
	{
		bFirstPerson = !bFirstPerson;
	}
	if (KeyHit(EKeys::W) || KeyHit(EKeys::Up)) { Reef = FMath::Max(0, Reef - 1); }
	if (KeyHit(EKeys::S) || KeyHit(EKeys::Down)) { Reef = FMath::Min(2, Reef + 1); }
	const float SteerIn = bFinished ? 0.f : (KeyDown(EKeys::D) || KeyDown(EKeys::Right) ? 1.f : 0.f) - (KeyDown(EKeys::A) || KeyDown(EKeys::Left) ? 1.f : 0.f);
	Rudder = FMath::FInterpTo(Rudder, SteerIn, Dt, 4.f);

	const FVector2f Fwd = CG::Forward(Heading);
	const FVector2f Right(FMath::Cos(Heading), FMath::Sin(Heading));
	const FVector2f Wind = World ? World->Wind(X, Z) : FVector2f(-4, 3);
	const FVector2f Velocity = Fwd * Forward + Right * Slip;
	const FVector2f AirWorld = Wind - Velocity;
	const FVector2f Apparent(FVector2f::DotProduct(AirWorld, Fwd), FVector2f::DotProduct(AirWorld, Right));
	WindAngle = FMath::Atan2(-Apparent.Y, -Apparent.X);
	WindSpeed = Apparent.Size();

	const FSailForce F = SailForce(SheetOut, Apparent);
	Load = F.Load;
	Fill = FMath::Clamp(F.Lift / 1.3f, 0.f, 1.f);
	Luff = F.Alpha < FMath::DegreesToRadians(6.f) ? 1.f : 0.f;
	// the boom lies to leeward
	if (FMath::Abs(WindAngle) > 0.05f)
	{
		BoomSide = WindAngle > 0.f ? -1.f : 1.f;
	}
	Boom = FMath::FInterpTo(Boom, F.Boom * BoomSide, Dt, 3.f);
	BoomAngle = Boom;

	// best drive available at this heading, for the trim gauge
	float Best = 1.f;
	for (int32 i = 0; i <= 12; i++)
	{
		Best = FMath::Max(Best, SailForce(i / 12.f, Apparent).Drive);
	}
	Trim = FMath::FInterpTo(Trim, FMath::Clamp(F.Drive / Best, 0.f, 1.f), Dt, 3.f);

	// hull: drive against drag, keel against slip, heel from the side force
	const float Area = FMath::Cos(Heel);
	Forward += (F.Drive * Area - (30.f * Forward * FMath::Abs(Forward) + 45.f * Forward)) / BoatMass * Dt;
	Slip += (F.Side - (900.f * Slip * FMath::Abs(Slip) + 400.f * Slip)) / BoatMass * Dt;
	Heel = FMath::FInterpTo(Heel, FMath::Clamp(F.Side * 0.00042f, -0.9f, 0.9f), Dt, 2.f);
	Heading += Rudder * 0.11f * FMath::Clamp(Forward, -2.f, 6.f) * Dt;
	X += (Fwd.X * Forward + Right.X * Slip) * Dt;
	Z += (Fwd.Y * Forward + Right.Y * Slip) * Dt;

	// the winch: only from the cockpit
	const bool bFast = KeyDown(EKeys::E), bSlow = KeyDown(EKeys::Q), bEase = KeyDown(EKeys::R);
	float HandleRate = 0.f;
	if (bFirstPerson && !bFinished)
	{
		if (bEase)
		{
			SheetOut += 0.6f * Dt;
		}
		else if (bFast)
		{
			const float Rate = 0.35f * FMath::Max(0.f, 1.f - Load / 700.f);
			SheetOut -= Rate * Dt;
			HandleRate = Rate * 22.f;
		}
		else if (bSlow)
		{
			const float Rate = 0.09f * FMath::Max(0.f, 1.f - Load / 2500.f);
			SheetOut -= Rate * Dt;
			HandleRate = -Rate * 70.f; // low gear turns the handle the other way
		}
	}
	SheetOut = FMath::Clamp(SheetOut, 0.f, 1.f);
	HandleAngle += HandleRate * Dt;

	// run aground
	const FVector2f Bow = FVector2f(X, Z) + Fwd * 2.6f;
	if (CG::HeightAt(Bow.X, Bow.Y) > -0.4f && Forward > 0.f)
	{
		X -= Fwd.X * 0.4f;
		Z -= Fwd.Y * 0.4f;
		Forward = -0.3f;
	}

	if (!bFinished && (FVector2f(X, Z) - CG::Places().Cove).Size() < 30.f)
	{
		bFinished = true;
		Objective = TEXT("LANDFALL");
	}

	// teach by prompt
	const float AwaDeg = FMath::RadiansToDegrees(FMath::Abs(WindAngle));
	if (bFinished) { Prompt = TEXT("You made the crossing"); }
	else if (AwaDeg < 34.f) { Prompt = TEXT("Too close to the wind. Bear away (A/D)"); }
	else if (!bFirstPerson && Trim < 0.6f) { Prompt = TEXT("V: go to the winch and trim the sail"); }
	else if (bFirstPerson && bFast && Load > 650.f) { Prompt = TEXT("Rope too loaded for fast gear. Hold Q for low gear"); }
	else if (bFirstPerson && Luff > 0.5f) { Prompt = TEXT("Sail is flapping. Hold E to haul the rope in"); }
	else if (bFirstPerson && Trim < 0.75f && F.Alpha > FMath::DegreesToRadians(34.f)) { Prompt = TEXT("Sail is stalled. Hold R to ease the rope"); }
	else if (FMath::Abs(Heel) > 0.6f) { Prompt = TEXT("Heeling hard. Ease the rope (R) or reef (S)"); }
	else if (bFirstPerson) { Prompt = TEXT("E haul fast   Q haul low gear   R ease   V back"); }
	else { Prompt.Reset(); }
}

/* ---------------------------------------------------------------- model */

void ACGBoatPawn::BuildModel()
{
	if (!World)
	{
		return;
	}
	UMaterialInterface* Wood = World->MakeSolid(Hex(0x6b4a2f), 0.6f, 0.f, FLinearColor::Black, true);
	UMaterialInterface* DarkWood = World->MakeSolid(Hex(0x3d2a1c), 0.7f);
	UMaterialInterface* Spar = World->MakeSolid(Hex(0x9a7a52), 0.5f);
	UMaterialInterface* Bronze = World->MakeSolid(Hex(0xa87a3c), 0.3f, 1.f);
	UMaterialInterface* Steel = World->MakeSolid(Hex(0xb8bcc2), 0.3f, 1.f);
	UMaterialInterface* Canvas = World->MakeSolid(Hex(0xe9e1cd), 0.9f, 0.f, FLinearColor::Black, true);
	UMaterialInterface* RopeMat = World->MakeSolid(Hex(0xcdb891), 0.9f);
	UMaterialInterface* Glow = World->MakeSolid(Hex(0x221a10), 0.4f, 0.f, Hex(0xffc070) * 40.f);

	BuildHull(Wood);
	BuildSail(Canvas);

	// thwarts, floor, rudder
	for (const float TX : { -150.f, -20.f, 110.f })
	{
		UStaticMeshComponent* T = AddPart(Body, 0, DarkWood);
		T->SetRelativeLocation(FVector(TX, 0, 22));
		T->SetRelativeScale3D(FVector(0.24, TX > 100 ? 1.0 : 1.5, 0.045));
	}
	UStaticMeshComponent* Floor = AddPart(Body, 0, DarkWood);
	Floor->SetRelativeLocation(FVector(-40, 0, -28));
	Floor->SetRelativeScale3D(FVector(3.6, 0.9, 0.03));
	UStaticMeshComponent* Blade = AddPart(TillerPivot, 0, DarkWood);
	Blade->SetRelativeLocation(FVector(-14, 0, -70));
	Blade->SetRelativeScale3D(FVector(0.3, 0.035, 0.95));
	AddTube(TillerPivot, FVector(-6, 0, 0), FVector(105, 0, 8), 3.6, Spar);
	// mast, boom, lantern
	AddTube(Body, FVector(70, 0, -45), FVector(70, 0, 625), 9, Spar);
	AddTube(BoomPivot, FVector(0, 0, 0), FVector(-BoomLength, 0, 0), 6.5, Spar);
	UStaticMeshComponent* Lantern = AddPart(Body, 1, Glow);
	Lantern->SetRelativeLocation(FVector(70, 0, 636));
	Lantern->SetRelativeScale3D(FVector(0.2));
	// winch: pedestal, drum, top cap, handle, two visible gears
	UStaticMeshComponent* Pedestal = AddPart(Body, 0, DarkWood);
	Pedestal->SetRelativeLocation(WinchPos - FVector(0, 0, 8));
	Pedestal->SetRelativeScale3D(FVector(0.5, 0.3, 0.16));
	Drum = AddTube(Body, WinchPos, WinchPos + FVector(0, 0, 18), 13, Bronze);
	AddTube(Body, WinchPos + FVector(0, 0, 18), WinchPos + FVector(0, 0, 21), 16, Bronze);
	AddTube(HandlePivot, FVector(0, 0, 0), FVector(24, 0, 0), 2.6, Steel);
	AddTube(HandlePivot, FVector(24, 0, 0), FVector(24, 0, 11), 3.4, DarkWood);
	AddTube(GearPivot[0], FVector(0, 0, 0), FVector(0, 0, 3), 15, Steel);
	AddTube(GearPivot[0], FVector(5, 0, 3), FVector(5, 0, 4.5), 2, DarkWood);
	AddTube(GearPivot[1], FVector(0, 0, 0), FVector(0, 0, 3), 6, Bronze);
	AddTube(GearPivot[1], FVector(2, 0, 3), FVector(2, 0, 4.5), 1.2, DarkWood);

	Sheet->SetMaterial(0, RopeMat);
	Sheet->SetAttachEndToComponent(Drum);
}

void ACGBoatPawn::BuildHull(UMaterialInterface* Material)
{
	const int32 Stations = 22, Ring = 13;
	TArray<FVector> Verts;
	TArray<int32> Tris;
	TArray<FVector> Normals;
	TArray<FVector2D> UVs;
	TArray<FLinearColor> Colors;
	TArray<FProcMeshTangent> Tangents;
	for (int32 s = 0; s < Stations; s++)
	{
		const float T = (float)s / (Stations - 1);
		const float PX = -280.f + 560.f * T;
		float Beam;
		if (T < 0.55f) { Beam = 95.f * (0.62f + 0.38f * FMath::Sin(HALF_PI * T / 0.55f)); }
		else { Beam = 95.f * FMath::Pow(FMath::Max(0.f, FMath::Cos(HALF_PI * (T - 0.55f) / 0.45f)), 0.7f); }
		const float Depth = 55.f * (0.8f + 0.2f * FMath::Sin(PI * T)) * (T > 0.9f ? FMath::Lerp(1.f, 0.35f, (T - 0.9f) / 0.1f) : 1.f);
		const float Sheer = 45.f + 26.f * T * T;
		for (int32 k = 0; k < Ring; k++)
		{
			const float A = -HALF_PI + PI * k / (Ring - 1);
			const float SA = FMath::Sin(A);
			const float PY = Beam * FMath::Sign(SA) * FMath::Pow(FMath::Abs(SA), 0.75f);
			const float PZ = Sheer - (Sheer + Depth) * FMath::Pow(FMath::Max(0.f, FMath::Cos(A)), 0.75f);
			Verts.Add(FVector(PX, PY, PZ));
			UVs.Add(FVector2D(T * 6.0, (double)k / (Ring - 1)));
		}
	}
	for (int32 s = 0; s < Stations - 1; s++)
	{
		for (int32 k = 0; k < Ring - 1; k++)
		{
			const int32 K = s * Ring + k;
			Tris.Append({ K, K + Ring, K + 1, K + 1, K + Ring, K + Ring + 1 });
		}
	}
	// close the transom
	const int32 Centre = Verts.Num();
	Verts.Add(FVector(-280, 0, 10));
	UVs.Add(FVector2D(0, 0.5));
	for (int32 k = 0; k < Ring - 1; k++)
	{
		Tris.Append({ Centre, k, k + 1 });
	}
	// smooth normals from the faces
	Normals.Init(FVector::ZeroVector, Verts.Num());
	for (int32 i = 0; i < Tris.Num(); i += 3)
	{
		const FVector N = FVector::CrossProduct(Verts[Tris[i + 2]] - Verts[Tris[i]], Verts[Tris[i + 1]] - Verts[Tris[i]]);
		Normals[Tris[i]] += N;
		Normals[Tris[i + 1]] += N;
		Normals[Tris[i + 2]] += N;
	}
	for (FVector& N : Normals)
	{
		N = N.GetSafeNormal();
		// make the skin's normal point outwards (away from the centreline and down)
	}
	for (int32 i = 0; i < Verts.Num(); i++)
	{
		const FVector Outward(0, Verts[i].Y, Verts[i].Z - 30.0);
		if (FVector::DotProduct(Normals[i], Outward) < 0)
		{
			Normals[i] = -Normals[i];
		}
	}
	Colors.Init(FLinearColor::White, Verts.Num());
	Tangents.Init(FProcMeshTangent(1.f, 0.f, 0.f), Verts.Num());
	Hull->CreateMeshSection_LinearColor(0, Verts, Tris, Normals, UVs, Colors, Tangents, false, false);
	Hull->SetMaterial(0, Material);
}

FVector ACGBoatPawn::SailRest(float U, float V, float BoomValue) const
{
	const FVector BoomDir(-FMath::Cos(BoomValue), FMath::Sin(BoomValue), 0);
	return MastFoot + BoomDir * (BoomLength * 0.96f * U * (1.f - V)) + FVector(0, 0, LuffHeight * V);
}

void ACGBoatPawn::BuildSail(UMaterialInterface* Material)
{
	const int32 Count = NU * NV;
	Cloth.SetNum(Count);
	ClothPrev.SetNum(Count);
	ClothNormals.Init(FVector(0, 1, 0), Count);
	ClothColors.Init(FLinearColor::White, Count);
	ClothUV.SetNum(Count);
	RestU.SetNum(Count);
	RestV.SetNum(Count);
	TArray<int32> Tris;
	TArray<FProcMeshTangent> Tangents;
	Tangents.Init(FProcMeshTangent(1.f, 0.f, 0.f), Count);
	for (int32 j = 0; j < NV; j++)
	{
		for (int32 i = 0; i < NU; i++)
		{
			const int32 K = j * NU + i;
			const float U = (float)i / (NU - 1), V = (float)j / (NV - 1);
			Cloth[K] = ClothPrev[K] = SailRest(U, V, Boom);
			ClothUV[K] = FVector2D(U, V);
			// rest lengths to the next node along the boom and up the mast, with a little slack so it can belly
			RestU[K] = i < NU - 1 ? (SailRest((float)(i + 1) / (NU - 1), V, 0) - SailRest(U, V, 0)).Size() * 1.05f : 0.f;
			RestV[K] = j < NV - 1 ? (SailRest(U, (float)(j + 1) / (NV - 1), 0) - SailRest(U, V, 0)).Size() * 1.02f : 0.f;
		}
	}
	for (int32 j = 0; j < NV - 1; j++)
	{
		for (int32 i = 0; i < NU - 1; i++)
		{
			const int32 K = j * NU + i;
			Tris.Append({ K, K + NU, K + 1, K + 1, K + NU, K + NU + 1 });
		}
	}
	Sail->CreateMeshSection_LinearColor(0, Cloth, Tris, ClothNormals, ClothUV, ClothColors, Tangents, false, false);
	Sail->SetMaterial(0, Material);
}

void ACGBoatPawn::StepSail(float Dt)
{
	if (Cloth.Num() == 0 || Dt <= 0.f)
	{
		return;
	}
	const int32 Sub = 2;
	const float H = Dt / Sub;
	// the leeward normal of the sail
	const FVector Lee = FVector(FMath::Sin(Boom), FMath::Cos(Boom), 0) * (Boom >= 0.f ? 1.f : -1.f);
	const float Pressure = FMath::Min(WindSpeed, 22.f) * 70.f;
	for (int32 Step = 0; Step < Sub; Step++)
	{
		for (int32 j = 0; j < NV; j++)
		{
			for (int32 i = 0; i < NU; i++)
			{
				const int32 K = j * NU + i;
				const float U = (float)i / (NU - 1), V = (float)j / (NV - 1);
				if (i == 0 || j == 0)
				{
					Cloth[K] = ClothPrev[K] = SailRest(U, V, Boom);
					continue;
				}
				// full sail: steady pressure to leeward. luffing: a travelling flap
				const float Flap = FMath::Sin(SimClock * 15.f - U * 7.f + V * 3.f) * Luff;
				const FVector Accel = Lee * (Pressure * (Fill * 1.2f + 0.15f) + Pressure * 1.6f * Flap) + FVector(0, 0, -260);
				const FVector Vel = (Cloth[K] - ClothPrev[K]) * 0.965;
				ClothPrev[K] = Cloth[K];
				Cloth[K] += Vel + Accel * (H * H);
			}
		}
		for (int32 Iter = 0; Iter < 5; Iter++)
		{
			for (int32 j = 0; j < NV; j++)
			{
				for (int32 i = 0; i < NU; i++)
				{
					const int32 K = j * NU + i;
					auto Solve = [&](int32 A, int32 B, float Rest, bool bPinA, bool bPinB)
					{
						if (Rest <= 0.01f) { return; }
						const FVector D = Cloth[B] - Cloth[A];
						const double Len = D.Size();
						if (Len < KINDA_SMALL_NUMBER || Len <= Rest) { return; } // cloth resists stretch only
						const FVector Corr = D * ((Len - Rest) / Len);
						if (bPinA && bPinB) { return; }
						if (bPinA) { Cloth[B] -= Corr; }
						else if (bPinB) { Cloth[A] += Corr; }
						else { Cloth[A] += Corr * 0.5; Cloth[B] -= Corr * 0.5; }
					};
					const bool bPin = (i == 0 || j == 0);
					if (i < NU - 1) { Solve(K, K + 1, RestU[K], bPin, j == 0); }
					if (j < NV - 1) { Solve(K, K + NU, RestV[K], bPin, i == 0); }
				}
			}
		}
	}
	// normals from neighbours
	for (int32 j = 0; j < NV; j++)
	{
		for (int32 i = 0; i < NU; i++)
		{
			const FVector DU = Cloth[j * NU + FMath::Min(NU - 1, i + 1)] - Cloth[j * NU + FMath::Max(0, i - 1)];
			const FVector DV = Cloth[FMath::Min(NV - 1, j + 1) * NU + i] - Cloth[FMath::Max(0, j - 1) * NU + i];
			const FVector N = FVector::CrossProduct(DU, DV).GetSafeNormal();
			ClothNormals[j * NU + i] = N.IsNearlyZero() ? Lee : N;
		}
	}
	TArray<FProcMeshTangent> NoTangents;
	Sail->UpdateMeshSection_LinearColor(0, Cloth, ClothNormals, ClothUV, ClothColors, NoTangents, false);
}

void ACGBoatPawn::PoseModel(float Dt)
{
	// float on the same waves that are drawn
	const FVector2f Fwd = CG::Forward(Heading);
	const FVector2f Right(FMath::Cos(Heading), FMath::Sin(Heading));
	auto Sea = [this](const FVector2f& P) { return World ? World->SeaLevelAt(P.X, P.Y) : 0.f; };
	const FVector2f C(X, Z);
	const float Bow = Sea(C + Fwd * 2.4f), Stern = Sea(C - Fwd * 2.4f), Port = Sea(C - Right * 0.8f), Starboard = Sea(C + Right * 0.8f);
	const float Level = (Bow + Stern + Port + Starboard) * 0.25f;
	const float Blend = Dt > 0.f ? FMath::Min(1.f, Dt * 6.f) : 1.f;
	Float += (Level - Float) * Blend;
	Pitch += (FMath::Atan2(Bow - Stern, 4.8f) - Pitch) * Blend;
	Roll += (FMath::Atan2(Port - Starboard, 1.6f) * 0.6f - Roll) * Blend;

	SetActorLocationAndRotation(CG::ToUE(X, Float + 0.12f, Z), FRotator(0, CG::YawDeg(Heading), 0));
	Body->SetRelativeRotation(FRotator(FMath::RadiansToDegrees(Pitch), 0, FMath::RadiansToDegrees(Heel + Roll)));
	BoomPivot->SetRelativeRotation(FRotator(0, -FMath::RadiansToDegrees(Boom), 0));
	TillerPivot->SetRelativeRotation(FRotator(0, -Rudder * 28.f, 0));
	HandlePivot->SetRelativeRotation(FRotator(0, FMath::RadiansToDegrees(HandleAngle), 0));
	GearPivot[0]->SetRelativeRotation(FRotator(0, FMath::RadiansToDegrees(HandleAngle), 0));
	GearPivot[1]->SetRelativeRotation(FRotator(0, -FMath::RadiansToDegrees(HandleAngle) * 2.5f, 0));

	// rope: just long enough when loaded, slack when eased or luffing
	if (Drum)
	{
		const float Span = (Sheet->GetComponentLocation() - Drum->GetComponentLocation()).Size();
		const float Slack = 1.02f + 0.25f * Luff + 0.1f * (1.f - FMath::Clamp(Load / 400.f, 0.f, 1.f));
		Sheet->CableLength = Span * Slack;
	}
}

void ACGBoatPawn::UpdateCamera(float Dt)
{
	ViewBlend = FMath::FInterpTo(ViewBlend, bFirstPerson ? 1.f : 0.f, Dt, 3.5f);
	if (const APlayerController* PC = Cast<APlayerController>(GetController()))
	{
		float DX = 0, DY = 0;
		PC->GetInputMouseDelta(DX, DY);
		if (bFirstPerson)
		{
			LookYaw = FMath::Clamp(LookYaw + DX * 2.2f, -150.f, 150.f);
			LookPitch = FMath::Clamp(LookPitch + DY * 2.2f, -55.f, 70.f);
		}
	}
	// third person: behind and above, level horizon
	const FVector BoatPos = GetActorLocation();
	const FRotator Yaw(0, CG::YawDeg(Heading), 0);
	const FVector WantChase = BoatPos + Yaw.RotateVector(FVector(-1050, 0, 430));
	ChasePos = bChaseValid ? FMath::VInterpTo(ChasePos, WantChase, Dt, 2.5f) : WantChase;
	bChaseValid = true;
	const FQuat ChaseRot = (BoatPos + FVector(0, 0, 230) - ChasePos).Rotation().Quaternion();
	// first person: seated at the helm, free look
	const FTransform BodyT = Body->GetComponentTransform();
	const FVector SeatWorld = BodyT.TransformPosition(SeatPos);
	const FQuat SeatRot = BodyT.GetRotation() * FRotator(LookPitch, LookYaw, 0).Quaternion();

	const float A = FMath::SmoothStep(0.f, 1.f, ViewBlend);
	Camera->SetWorldLocationAndRotation(FMath::Lerp(ChasePos, SeatWorld, A), FQuat::Slerp(ChaseRot, SeatRot, A));
	Camera->SetFieldOfView(FMath::Lerp(72.f, 88.f, A));
}
