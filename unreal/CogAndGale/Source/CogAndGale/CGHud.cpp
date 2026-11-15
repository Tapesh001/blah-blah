#include "CGHud.h"
#include "CGBikePawn.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"

void ACGHud::DrawHUD()
{
	Super::DrawHUD();
	const ACGBikePawn* Bike = Cast<ACGBikePawn>(GetOwningPawn());
	if (!Bike || !Canvas)
	{
		return;
	}
	const float W = Canvas->ClipX;
	const float H = Canvas->ClipY;
	const float S = FMath::Max(1.f, H / 720.f);
	UFont* Font = GEngine->GetMediumFont();
	const FLinearColor Ink(0.95f, 0.93f, 0.88f);
	const FLinearColor Dim(0.95f, 0.93f, 0.88f, 0.7f);

	DrawText(Bike->bFinished ? TEXT("HARBOUR REACHED") : TEXT("RIDE TO THE HARBOUR"), Ink, 28 * S, 24 * S, Font, 1.3f * S);

	const float Y0 = H - 118 * S;
	DrawText(FString::Printf(TEXT("%2.0f km/h"), Bike->Speed * 3.6f), Ink, 28 * S, Y0, Font, 2.2f * S);
	DrawText(FString::Printf(TEXT("gear %d    cadence %3.0f"), Bike->Gear + 1, Bike->Cadence), Dim, 28 * S, Y0 + 44 * S, Font, 1.1f * S);

	// chain wear bar
	const float BarW = 180 * S, BarH = 8 * S, BarY = Y0 + 74 * S;
	DrawRect(FLinearColor(0, 0, 0, 0.45f), 28 * S, BarY, BarW, BarH);
	const float Wear = FMath::Clamp(Bike->ChainWear, 0.f, 1.f);
	DrawRect(FMath::Lerp(FLinearColor(0.75f, 0.85f, 0.6f), FLinearColor(0.95f, 0.25f, 0.15f), Wear), 28 * S, BarY, BarW * Wear, BarH);
	DrawText(Bike->bChainBroken ? TEXT("chain BROKEN") : TEXT("chain wear"), Dim, 28 * S + BarW + 12 * S, BarY - 5 * S, Font, 1.0f * S);

	if (!Bike->Prompt.IsEmpty())
	{
		float TW = 0, TH = 0;
		GetTextSize(Bike->Prompt, TW, TH, Font, 1.25f * S);
		DrawText(Bike->Prompt, Ink, (W - TW) * 0.5f, H * 0.82f, Font, 1.25f * S);
	}
}
