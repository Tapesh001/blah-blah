#include "CGBikePawn.h"
#include "CGTerrain.h"
#include "CGWorld.h"
#include "Camera/CameraComponent.h"
#include "Components/StaticMeshComponent.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/SpringArmComponent.h"
#include "Materials/MaterialInstanceDynamic.h"

namespace
{
	const int32 Cogs[8] = { 32, 28, 24, 21, 18, 15, 13, 11 };
	const float Chainring = 38.f;
	const float WheelRadius = 0.34f;
	const float Mass = 85.f;

	// key points of the bike in body space, centimetres (+X forward, +Y right, +Z up)
	const FVector RearAxle(-52, 0, 34), FrontAxle(56, 0, 34), Bracket(-5, 0, 30), SeatTop(-22, 0, 88), HeadTop(38, 0, 94), HeadLow(43, 0, 70);

}

ACGBikePawn::ACGBikePawn()
{
	PrimaryActorTick.bCanEverTick = true;
	AutoPossessPlayer = EAutoReceiveInput::Player0;

	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);
	Body = CreateDefaultSubobject<USceneComponent>(TEXT("Body"));
	Body->SetupAttachment(Root);

	Arm = CreateDefaultSubobject<USpringArmComponent>(TEXT("Arm"));
	Arm->SetupAttachment(Root);
	Arm->SetRelativeLocation(FVector(0, 0, 150));
	Arm->SetRelativeRotation(FRotator(-12, 0, 0));
	Arm->TargetArmLength = 620.f;
	Arm->bDoCollisionTest = false;
	Arm->bEnableCameraLag = true;
	Arm->CameraLagSpeed = 7.f;
	Arm->bEnableCameraRotationLag = true;
	Arm->CameraRotationLagSpeed = 6.f;
	Arm->bInheritRoll = false;
	Arm->bInheritPitch = false;

	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
	Camera->SetupAttachment(Arm, USpringArmComponent::SocketName);
	Camera->SetFieldOfView(70.f);
}

void ACGBikePawn::BeginPlay()
{
	Super::BeginPlay();
	CG::EnsureInit();
	World = ACGWorld::Get(this);
	const CG::FPlaces& P = CG::Places();
	X = P.BikeStart.X;
	Z = P.BikeStart.Y;
	Heading = P.BikeHeading;
	Y = CG::HeightAt(X, Z);
	BuildModel();
	PoseModel();
	Prompt = TEXT("W pedal   S brake   A/D lean   Space hop   Z/X shift   V view");
}

void ACGBikePawn::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	const float Dt = FMath::Min(DeltaSeconds, 1.f / 30.f);
	Simulate(Dt);
	PoseModel();

	// camera: third person behind the rider, or the rider's eyes
	const float TargetLen = bFirstPerson ? 0.f : 620.f + Speed * 14.f;
	Arm->TargetArmLength = FMath::FInterpTo(Arm->TargetArmLength, TargetLen, DeltaSeconds, 5.f);
	const FVector TargetPos = bFirstPerson ? FVector(20, 0, 158) : FVector(0, 0, 150);
	Arm->SetRelativeLocation(FMath::VInterpTo(Arm->GetRelativeLocation(), TargetPos, DeltaSeconds, 5.f));
	Arm->SetRelativeRotation(FRotator(bFirstPerson ? -6.f : -12.f, 0, 0));
	Camera->SetFieldOfView(FMath::FInterpTo(Camera->FieldOfView, 70.f + FMath::Min(Speed, 18.f) * 1.1f, DeltaSeconds, 3.f));

	if (World)
	{
		World->Storm = 0.1f + 0.35f * Progress;
	}
	Objective = bFinished ? TEXT("HARBOUR REACHED") : TEXT("RIDE TO THE HARBOUR");
	BigText = FString::Printf(TEXT("%2.0f km/h"), Speed * 3.6f);
	Lines.Reset();
	Lines.Add(FString::Printf(TEXT("gear %d    cadence %3.0f"), Gear + 1, Cadence));
	Bars.Reset();
	Bars.Add({ bChainBroken ? TEXT("chain BROKEN") : TEXT("chain wear"), ChainWear, true });
}

void ACGBikePawn::Respawn()
{
	const CG::FRoadHit Hit = CG::RoadNearest(X, Z);
	X = Hit.X;
	Z = Hit.Z;
	Heading = Hit.Heading;
	Speed = 0.f;
	Lean = 0.f;
	VY = 0.f;
	bAir = false;
	Y = CG::HeightAt(X, Z);
	CrashTimer = 1.0f;
}

void ACGBikePawn::Simulate(float Dt)
{
	auto Down = [this](const FKey& Key) { return KeyDown(Key); };
	auto Hit = [this](const FKey& Key) { return KeyHit(Key); };

	if (Hit(EKeys::V))
	{
		bFirstPerson = !bFirstPerson;
	}
	if (CrashTimer > 0.f)
	{
		CrashTimer -= Dt;
		return;
	}
	if (bFinished)
	{
		Speed = FMath::Max(0.f, Speed - 6.f * Dt);
	}

	const float Throttle = bFinished ? 0.f : (Down(EKeys::W) || Down(EKeys::Up) ? 1.f : 0.f) - (Down(EKeys::S) || Down(EKeys::Down) ? 1.f : 0.f);
	const float SteerIn = bFinished ? 0.f : (Down(EKeys::D) || Down(EKeys::Right) ? 1.f : 0.f) - (Down(EKeys::A) || Down(EKeys::Left) ? 1.f : 0.f);
	Steer = FMath::FInterpTo(Steer, SteerIn, Dt, 8.f);

	const CG::FRoadHit RoadHit = CG::RoadNearest(X, Z);
	Progress = RoadHit.Progress;
	const bool bOffRoad = RoadHit.Dist > 4.5f;
	const float Wet = World ? World->Wet : 0.f;
	const float Ground = CG::HeightAt(X, Z);

	// lean and turn: a coordinated turn, yaw rate = g tan(lean) / v
	const float MaxLean = 0.62f * FMath::Clamp(Speed / 4.f, 0.25f, 1.f);
	Lean += (Steer * MaxLean - Lean) * FMath::Min(1.f, Dt * 5.f);
	const float YawRate = Speed > 0.5f ? 9.81f * FMath::Tan(Lean) / FMath::Max(Speed, 3.f) : Steer * 0.9f;
	Heading += YawRate * Dt;
	const FVector2f Fwd = CG::Forward(Heading);
	Grade = (CG::HeightAt(X + Fwd.X, Z + Fwd.Y) - CG::HeightAt(X - Fwd.X, Z - Fwd.Y)) / 2.f;

	// drivetrain
	ShiftCooldown -= Dt;
	const float Ratio = Chainring / Cogs[Gear];
	const float WheelRpm = Speed / (2.f * PI * WheelRadius) * 60.f;
	Cadence = WheelRpm / Ratio;
	if (ShiftCooldown <= 0.f)
	{
		int32 Wanted = Gear;
		if (Hit(EKeys::X)) { Wanted++; }
		else if (Hit(EKeys::Z)) { Wanted--; }
		else if (Cadence > 96.f) { Wanted++; }
		else if (Cadence < 52.f && Speed > 0.5f) { Wanted--; }
		Wanted = FMath::Clamp(Wanted, 0, 7);
		if (Wanted != Gear)
		{
			if (Throttle > 0.5f && Cadence > 40.f)
			{
				ChainWear += 0.004f; // shifting under load
			}
			Gear = Wanted;
			ShiftCooldown = 0.55f;
		}
	}
	const bool bSprint = Down(EKeys::LeftShift);
	float Efficiency = 1.f;
	if (Cadence < 50.f) { Efficiency = FMath::Lerp(0.6f, 1.f, Cadence / 50.f); }
	else if (Cadence > 105.f) { Efficiency = FMath::Max(0.3f, 1.f - (Cadence - 105.f) / 60.f); }
	const float Power = (bSprint ? 850.f : 460.f) * FMath::Max(0.f, Throttle) * Efficiency;
	float Drive = bChainBroken ? 0.f : FMath::Min(Power / FMath::Max(Speed, 1.5f), 380.f);
	if (ShiftCooldown > 0.3f) { Drive *= 0.4f; }

	// the chain: wears with effort, and is doomed to fail once on the ridge
	if (Throttle > 0.f && !bChainBroken)
	{
		ChainWear += Dt * (0.0025f + 0.006f * (Drive / 320.f));
		if (!bBrokenOnce && Progress > 0.45f)
		{
			ChainWear = FMath::Max(ChainWear, 0.93f);
		}
		if (ChainWear >= 1.f || (!bBrokenOnce && Progress > 0.45f && Speed > 3.f))
		{
			bChainBroken = true;
			bBrokenOnce = true;
			ChainWear = 1.f;
		}
	}
	if (bChainBroken)
	{
		Prompt = TEXT("Chain snapped. Stop and hold E to repair");
		if (Down(EKeys::E) && Speed < 1.f)
		{
			RepairHold += Dt;
			if (RepairHold > 2.f)
			{
				bChainBroken = false;
				ChainWear = 0.f;
				RepairHold = 0.f;
				Prompt = TEXT("Chain repaired. Ride on to the harbour");
			}
		}
		else
		{
			RepairHold = 0.f;
		}
	}

	// forces along the direction of travel
	const FVector2f Wind = World ? World->Wind(X, Z) : FVector2f::ZeroVector;
	const float RelAir = Speed - FVector2f::DotProduct(Wind, Fwd);
	const float Aero = 0.5f * 1.225f * (bSprint ? 0.5f : 0.42f) * RelAir * FMath::Abs(RelAir);
	const float Rolling = Speed > 0.05f ? (bOffRoad ? 0.03f : 0.006f) * Mass * 9.81f : 0.f;
	const float Gravity = -Mass * 9.81f * Grade;
	const float Brake = Throttle < 0.f ? Mass * 7.f * -Throttle : 0.f;
	if (Throttle > 0.f)
	{
		bStarted = true;
	}
	if (!bAir && bStarted)
	{
		Speed += (Drive - Aero - Rolling + Gravity - Brake) / Mass * Dt;
	}
	Speed = FMath::Clamp(Speed, 0.f, 30.f);
	X += Fwd.X * Speed * Dt;
	Z += Fwd.Y * Speed * Dt;

	// hop and fall
	const float NewGround = CG::HeightAt(X, Z);
	if (!bAir)
	{
		if (Hit(EKeys::SpaceBar))
		{
			VY = 3.6f;
			bAir = true;
		}
		else if (NewGround < Y - 0.25f)
		{
			VY = Speed * Grade; // left the ground over a drop
			bAir = true;
		}
		else
		{
			Y = NewGround;
		}
	}
	if (bAir)
	{
		VY -= 9.81f * Dt;
		Y += VY * Dt;
		if (Y <= NewGround)
		{
			if (VY < -9.f)
			{
				ChainWear = FMath::Min(1.f, ChainWear + 0.08f);
			}
			Y = NewGround;
			VY = 0.f;
			bAir = false;
		}
	}

	// grip: too fast for the corner or the surface and the bike goes down
	const float Lateral = FMath::Abs(Speed * YawRate);
	const float Grip = (bOffRoad ? 0.55f : FMath::Lerp(0.95f, 0.62f, Wet)) * 9.81f;
	if ((Lateral > Grip * 1.2f && Speed > 6.f) || NewGround < 0.3f)
	{
		Respawn();
		return;
	}

	Crank += (bChainBroken || Throttle <= 0.f ? 0.f : Cadence / 60.f * 2.f * PI) * Dt;
	WheelSpin += Speed / WheelRadius * Dt;

	if (!bFinished && (FVector2f(X, Z) - CG::Places().Harbour).Size() < 12.f)
	{
		bFinished = true;
		Prompt = TEXT("Harbour reached. The boat is next");
	}
	else if (!bChainBroken && !bFinished && Progress > 0.05f && Prompt.StartsWith(TEXT("W pedal")))
	{
		Prompt.Reset();
	}
}

void ACGBikePawn::BuildModel()
{
	if (!World)
	{
		return;
	}
	enum { CubeShape, SphereShape, CylinderShape };
	UMaterialInterface* Paint = World->MakeSolid(Hex(0xb3261e), 0.35f, 0.6f);
	UMaterialInterface* Steel = World->MakeSolid(Hex(0xb8bcc2), 0.3f, 1.f);
	UMaterialInterface* Rubber = World->MakeSolid(Hex(0x101010), 0.9f);
	UMaterialInterface* Jacket = World->MakeSolid(Hex(0xd9772b), 0.8f);
	UMaterialInterface* Trousers = World->MakeSolid(Hex(0x2b3440), 0.85f);
	UMaterialInterface* Skin = World->MakeSolid(Hex(0xc99a7a), 0.7f);
	UMaterialInterface* Helmet = World->MakeSolid(Hex(0x1f6f78), 0.4f);

	auto Tube = [&](const FVector& A, const FVector& B, float D, UMaterialInterface* M)
	{
		return AddTube(Body, A, B, D, M);
	};
	// wheels: tyre, rim disc and a spoke bar that shows the spin
	const FVector Axle[2] = { RearAxle, FrontAxle };
	for (int32 i = 0; i < 2; i++)
	{
		Wheel[i] = Tube(Axle[i] - FVector(0, 2.2, 0), Axle[i] + FVector(0, 2.2, 0), 68, Rubber);
		Tube(Axle[i] - FVector(0, 2.6, 0), Axle[i] + FVector(0, 2.6, 0), 58, Steel);
		Spoke[i] = AddPart(Body, CubeShape, Rubber);
	}
	// frame
	Tube(Bracket, SeatTop, 3.4, Paint);
	Tube(SeatTop, HeadTop, 3.2, Paint);
	Tube(Bracket, HeadLow, 3.8, Paint);
	Tube(SeatTop, RearAxle, 2.2, Paint);
	Tube(Bracket, RearAxle, 2.4, Paint);
	Tube(HeadTop, HeadLow, 4.2, Paint);
	Fork = Tube(HeadLow, FrontAxle, 3.0, Steel);
	Handlebar = Tube(HeadTop + FVector(0, -24, 4), HeadTop + FVector(0, 24, 4), 2.6, Steel);
	Tube(HeadTop, HeadTop + FVector(0, 0, 5), 3.0, Steel);
	// saddle, chainring, cassette, chain
	UStaticMeshComponent* Saddle = AddPart(Body, CubeShape, Rubber);
	Saddle->SetRelativeLocation(SeatTop + FVector(-2, 0, 4));
	Saddle->SetRelativeScale3D(FVector(0.26, 0.13, 0.04));
	Tube(Bracket + FVector(0, 4, 0), Bracket + FVector(0, 5, 0), 20, Steel);
	Tube(RearAxle + FVector(0, 4, 0), RearAxle + FVector(0, 6.5, 0), 11, Steel);
	Tube(Bracket + FVector(0, 4.5, 9.5), RearAxle + FVector(0, 4.5, 5), 1.0, Steel);
	Tube(Bracket + FVector(0, 4.5, -9.5), RearAxle + FVector(0, 4.5, -5), 1.0, Steel);
	for (int32 i = 0; i < 2; i++)
	{
		CrankArm[i] = AddPart(Body, CylinderShape, Steel);
		Thigh[i] = AddPart(Body, CylinderShape, Trousers);
		Shin[i] = AddPart(Body, CylinderShape, Trousers);
	}
	// rider: torso, head, helmet, arms
	Tube(FVector(-20, 0, 96), FVector(16, 0, 136), 27, Jacket);
	UStaticMeshComponent* Head = AddPart(Body, SphereShape, Skin);
	Head->SetRelativeLocation(FVector(25, 0, 151));
	Head->SetRelativeScale3D(FVector(0.21));
	UStaticMeshComponent* Lid = AddPart(Body, SphereShape, Helmet);
	Lid->SetRelativeLocation(FVector(24, 0, 156));
	Lid->SetRelativeScale3D(FVector(0.27, 0.24, 0.19));
	for (int32 Side = -1; Side <= 1; Side += 2)
	{
		Tube(FVector(14, 15.0 * Side, 132), FVector(30, 21.0 * Side, 112), 8, Jacket);
		Tube(FVector(30, 21.0 * Side, 112), HeadTop + FVector(0, 21.0 * Side, 5), 6.5, Jacket);
	}
}

void ACGBikePawn::PoseModel()
{
	SetActorLocationAndRotation(CG::ToUE(X, Y, Z), FRotator(0, CG::YawDeg(Heading), 0));
	Body->SetRelativeRotation(FRotator(FMath::RadiansToDegrees(FMath::Atan(Grade)), 0, FMath::RadiansToDegrees(Lean)));
	if (Parts.Num() == 0)
	{
		return;
	}
	// spoke bars turn with the wheels
	const FVector Axle[2] = { RearAxle, FrontAxle };
	for (int32 i = 0; i < 2; i++)
	{
		Spoke[i]->SetRelativeLocation(Axle[i]);
		Spoke[i]->SetRelativeRotation(FRotator(FMath::RadiansToDegrees(-WheelSpin), 0, 0));
		Spoke[i]->SetRelativeScale3D(FVector(0.56, 0.045, 0.03));
	}
	// legs: two-bone reach from hip to pedal
	const float ThighLen = 44.f, ShinLen = 46.f;
	for (int32 i = 0; i < 2; i++)
	{
		const float Side = i == 0 ? -1.f : 1.f;
		const float A = Crank + (i == 0 ? 0.f : PI);
		const FVector Pedal = Bracket + FVector(17.0 * FMath::Cos(A), 9.0 * Side, 17.0 * FMath::Sin(A));
		const FVector Hip(-18, 8.0 * Side, 97);
		SetTube(CrankArm[i], Bracket + FVector(0, 6.0 * Side, 0), Pedal - FVector(0, 2.0 * Side, 0), 2.2);
		const FVector ToPedal = Pedal - Hip;
		const float D = FMath::Min((float)ToPedal.Size(), ThighLen + ShinLen - 0.5f);
		const float Along = (ThighLen * ThighLen - ShinLen * ShinLen + D * D) / (2.f * D);
		const float Out = FMath::Sqrt(FMath::Max(0.f, ThighLen * ThighLen - Along * Along));
		const FVector Dir = ToPedal.GetSafeNormal();
		// the knee bends forward and up, in the plane of the leg
		const FVector Bend = FVector::CrossProduct(FVector(0, 1, 0), Dir).GetSafeNormal() * -1.0;
		const FVector Knee = Hip + Dir * Along + Bend * Out;
		SetTube(Thigh[i], Hip, Knee, 13);
		SetTube(Shin[i], Knee, Pedal, 10);
	}
}
