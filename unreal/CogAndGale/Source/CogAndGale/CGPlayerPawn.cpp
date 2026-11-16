#include "CGPlayerPawn.h"
#include "CGWorld.h"
#include "Components/StaticMeshComponent.h"
#include "GameFramework/PlayerController.h"

UStaticMeshComponent* ACGPlayerPawn::AddPart(USceneComponent* Parent, int32 Shape, UMaterialInterface* Material)
{
	UStaticMeshComponent* C = NewObject<UStaticMeshComponent>(this);
	C->SetStaticMesh(World ? World->Shape(Shape) : nullptr);
	C->SetMaterial(0, Material);
	C->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	C->SetMobility(EComponentMobility::Movable);
	C->AttachToComponent(Parent, FAttachmentTransformRules::KeepRelativeTransform);
	C->RegisterComponent();
	Parts.Add(C);
	return C;
}

UStaticMeshComponent* ACGPlayerPawn::AddTube(USceneComponent* Parent, const FVector& A, const FVector& B, float Diameter, UMaterialInterface* Material)
{
	UStaticMeshComponent* C = AddPart(Parent, 2, Material);
	SetTube(C, A, B, Diameter);
	return C;
}

void ACGPlayerPawn::SetTube(UStaticMeshComponent* Part, const FVector& A, const FVector& B, float Diameter)
{
	const FVector D = B - A;
	Part->SetRelativeLocation((A + B) * 0.5);
	Part->SetRelativeRotation(FRotationMatrix::MakeFromZ(D).Rotator());
	Part->SetRelativeScale3D(FVector(Diameter / 100.0, Diameter / 100.0, D.Size() / 100.0));
}

bool ACGPlayerPawn::KeyDown(const FKey& Key) const
{
	const APlayerController* PC = Cast<APlayerController>(GetController());
	return PC && PC->IsInputKeyDown(Key);
}

bool ACGPlayerPawn::KeyHit(const FKey& Key) const
{
	const APlayerController* PC = Cast<APlayerController>(GetController());
	return PC && PC->WasInputKeyJustPressed(Key);
}

FLinearColor ACGPlayerPawn::Hex(uint32 RGB)
{
	return FLinearColor::FromSRGBColor(FColor((RGB >> 16) & 255, (RGB >> 8) & 255, RGB & 255));
}
