#include "CGHud.h"
#include "CGPlayerPawn.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"

void ACGHud::DrawHUD()
{
	Super::DrawHUD();
	const ACGPlayerPawn* P = Cast<ACGPlayerPawn>(GetOwningPawn());
	if (!P || !Canvas)
	{
		return;
	}
	const float W = Canvas->ClipX;
	const float H = Canvas->ClipY;
	const float S = FMath::Max(1.f, H / 720.f);
	UFont* Font = GEngine->GetMediumFont();
	const FLinearColor Ink(0.95f, 0.93f, 0.88f);
	const FLinearColor Dim(0.95f, 0.93f, 0.88f, 0.7f);

	DrawText(P->Objective, Ink, 28 * S, 24 * S, Font, 1.3f * S);

	float Y = H - (86 + 24 * P->Lines.Num() + 22 * P->Bars.Num()) * S;
	DrawText(P->BigText, Ink, 28 * S, Y, Font, 2.2f * S);
	Y += 46 * S;
	for (const FString& Line : P->Lines)
	{
		DrawText(Line, Dim, 28 * S, Y, Font, 1.1f * S);
		Y += 24 * S;
	}
	for (const FCGBar& Bar : P->Bars)
	{
		const float BarW = 180 * S, BarH = 8 * S;
		const float V = FMath::Clamp(Bar.Value, 0.f, 1.f);
		DrawRect(FLinearColor(0, 0, 0, 0.45f), 28 * S, Y + 6 * S, BarW, BarH);
		const FLinearColor Good(0.75f, 0.85f, 0.6f), Bad(0.95f, 0.25f, 0.15f);
		DrawRect(Bar.bWarn ? FMath::Lerp(Good, Bad, V) : FMath::Lerp(Bad, Good, V), 28 * S, Y + 6 * S, BarW * V, BarH);
		DrawText(Bar.Label, Dim, 28 * S + BarW + 12 * S, Y, Font, 1.0f * S);
		Y += 22 * S;
	}

	if (P->bShowWind)
	{
		// wind dial: boat points up; the arrow shows where the apparent wind comes from
		const FVector2D C(W - 110 * S, H - 110 * S);
		const float R = 70 * S;
		const int32 Seg = 48;
		for (int32 i = 0; i < Seg; i++)
		{
			const float A0 = 2 * PI * i / Seg, A1 = 2 * PI * (i + 1) / Seg;
			// the no-go wedge either side of the bow is drawn red
			const bool bNoGo = FMath::Abs(FMath::FindDeltaAngleRadians(0.f, A0)) < 0.62f;
			DrawLine(C.X + R * FMath::Sin(A0), C.Y - R * FMath::Cos(A0), C.X + R * FMath::Sin(A1), C.Y - R * FMath::Cos(A1),
				bNoGo ? FLinearColor(0.95f, 0.3f, 0.2f, 0.9f) : Dim, 2.f * S);
		}
		DrawLine(C.X, C.Y + 22 * S, C.X, C.Y - 26 * S, Ink, 3.f * S); // hull
		const float WA = P->WindAngle;
		const FVector2D From(C.X + R * FMath::Sin(WA), C.Y - R * FMath::Cos(WA));
		const FVector2D To(C.X + R * 0.35f * FMath::Sin(WA), C.Y - R * 0.35f * FMath::Cos(WA));
		DrawLine(From.X, From.Y, To.X, To.Y, FLinearColor(0.5f, 0.85f, 1.f), 3.f * S);
		// boom
		const float BA = PI - P->BoomAngle;
		DrawLine(C.X, C.Y - 6 * S, C.X + 30 * S * FMath::Sin(BA), C.Y - 6 * S - 30 * S * FMath::Cos(BA), FLinearColor(1.f, 0.85f, 0.5f), 2.f * S);
		DrawText(FString::Printf(TEXT("wind %2.0f kn"), P->WindSpeed * 1.944f), Dim, C.X - 44 * S, C.Y + R + 8 * S, Font, 1.0f * S);
	}

	if (!P->Prompt.IsEmpty())
	{
		float TW = 0, TH = 0;
		GetTextSize(P->Prompt, TW, TH, Font, 1.25f * S);
		DrawText(P->Prompt, Ink, (W - TW) * 0.5f, H * 0.82f, Font, 1.25f * S);
	}
}
