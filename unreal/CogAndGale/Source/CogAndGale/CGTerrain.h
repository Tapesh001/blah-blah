#pragma once

#include "CoreMinimal.h"

/**
 * World maths shared by everything: island heights, the road, waves and wind.
 * Game units here are METRES with x east, z south, h up. Convert with ToUE().
 */
namespace CG
{
	struct FIsle
	{
		float X, Z, R, Peak, Seed;
	};

	struct FRoadSample
	{
		float X, Z, H, Heading, S;
	};

	struct FRoadHit
	{
		float Dist, Progress, X, Z, Heading;
	};

	struct FGrid
	{
		FIsle Isle;
		int32 N = 0;
		float Size = 0, OX = 0, OZ = 0;
		TArray<float> H;
		TArray<float> Road;
	};

	struct FPlaces
	{
		FVector2f BikeStart;
		float BikeHeading;
		FVector2f Harbour;
		FVector2f BoatStart;
		float BoatHeading;
		FVector2f Cove;
	};

	/** Build the cached grids once. Safe to call many times. */
	void EnsureInit();

	float Fbm(float X, float Z, int32 Octaves = 5);
	/** Ground height in metres (below 0 is seabed). */
	float HeightAt(float X, float Z);
	FRoadHit RoadNearest(float X, float Z);
	FRoadSample RoadPoint(float Progress, int32 RoadIndex = 0);
	const FGrid& Grid(int32 Index);
	const TArray<FRoadSample>& Road(int32 Index);
	const FPlaces& Places();

	/** Sea state 0.35 (calm) .. 2 (storm) from storm 0..1. */
	float SeaAmplitude(float Storm);
	/** Sea surface height; also returns the crest factor used for foam and the surface normal. */
	float OceanHeight(float X, float Z, float Time, float Sea, float* OutCrest = nullptr, FVector3f* OutNormal = nullptr);
	/** Wind velocity in m/s (x east, y = south component). */
	FVector2f WindAt(float X, float Z, float Time, float Storm);

	/** Heading h (0 = north, clockwise) to a forward vector in metres (x east, z south). */
	inline FVector2f Forward(float Heading)
	{
		return FVector2f(FMath::Sin(Heading), -FMath::Cos(Heading));
	}
	/** Metres (x east, h up, z south) to Unreal centimetres. */
	inline FVector ToUE(float X, float H, float Z)
	{
		return FVector(X * 100.0, Z * 100.0, H * 100.0);
	}
	/** Heading in radians to Unreal yaw in degrees. */
	inline float YawDeg(float Heading)
	{
		return FMath::RadiansToDegrees(Heading) - 90.f;
	}
}
