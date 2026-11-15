#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "CGHud.generated.h"

/** Minimal instrument-style HUD drawn on the canvas. */
UCLASS()
class COGANDGALE_API ACGHud : public AHUD
{
	GENERATED_BODY()

public:
	virtual void DrawHUD() override;
};
