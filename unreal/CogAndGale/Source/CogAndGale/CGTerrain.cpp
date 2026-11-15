#include "CGTerrain.h"

namespace CG
{
	namespace
	{
		const float Seabed = -22.f;
		const FIsle IsleA{ 0.f, 0.f, 430.f, 120.f, 11.f };
		const FIsle IsleB{ 1500.f, -220.f, 300.f, 100.f, 47.f };

		FGrid Grids[2];
		TArray<FRoadSample> Roads[2];
		TMap<int64, TArray<int32>> RoadCells;
		FPlaces ThePlaces;
		bool bReady = false;
		const float Cell = 24.f;

		float Hash(int32 IX, int32 IZ)
		{
			uint32 H = (uint32)IX * 374761393u + (uint32)IZ * 668265263u;
			H = (H ^ (H >> 13)) * 1274126177u;
			H ^= H >> 16;
			return (float)(H & 0xFFFFFF) / 16777216.f;
		}

		float VNoise(float X, float Z)
		{
			const int32 IX = FMath::FloorToInt(X);
			const int32 IZ = FMath::FloorToInt(Z);
			const float FX = X - IX;
			const float FZ = Z - IZ;
			const float U = FX * FX * (3 - 2 * FX);
			const float V = FZ * FZ * (3 - 2 * FZ);
			const float A = Hash(IX, IZ);
			const float B = Hash(IX + 1, IZ);
			const float C = Hash(IX, IZ + 1);
			const float D = Hash(IX + 1, IZ + 1);
			return A + (B - A) * U + (C - A) * V + (A - B - C + D) * U * V;
		}

		float IsleBase(float X, float Z, const FIsle& I)
		{
			const float DX = X - I.X;
			const float DZ = Z - I.Z;
			const float D = FMath::Sqrt(DX * DX + DZ * DZ) / I.R;
			if (D > 1.3f)
			{
				return Seabed;
			}
			const float N = Fbm(X / 170 + I.Seed, Z / 170 - I.Seed, 5);
			const float Ridge = 1 - FMath::Abs(Fbm(X / 90 - I.Seed, Z / 90 + I.Seed, 4) * 2 - 1);
			const float Shape = FMath::Pow(FMath::Max(0.f, 1 - D * D), 1.5f);
			float H = I.Peak * Shape * (0.55f + 0.75f * N) + 14 * Ridge * Shape + 3 * Fbm(X / 22, Z / 22, 3) * Shape;
			H += (0.92f - D) * 9;
			if (D > 0.9f)
			{
				H -= (D - 0.9f) * 70;
			}
			return FMath::Max(Seabed, H);
		}

		float BaseHeight(float X, float Z)
		{
			return FMath::Max(IsleBase(X, Z, IsleA), IsleBase(X, Z, IsleB));
		}

		TArray<FVector2f> Catmull(const TArray<FVector2f>& P, float Step)
		{
			TArray<FVector2f> Out;
			for (int32 i = 0; i < P.Num() - 1; i++)
			{
				const FVector2f P0 = P[FMath::Max(0, i - 1)];
				const FVector2f P1 = P[i];
				const FVector2f P2 = P[i + 1];
				const FVector2f P3 = P[FMath::Min(P.Num() - 1, i + 2)];
				const int32 N = FMath::Max(2, FMath::RoundToInt((P2 - P1).Size() / Step));
				for (int32 k = 0; k < N; k++)
				{
					const float T = (float)k / N;
					const float T2 = T * T;
					const float T3 = T2 * T;
					Out.Add(0.5f * ((2 * P1) + (-P0 + P2) * T + (2 * P0 - 5 * P1 + 4 * P2 - P3) * T2 + (-P0 + 3 * P1 - 3 * P2 + P3) * T3));
				}
			}
			Out.Add(P.Last());
			return Out;
		}

		void BuildRoad(int32 Index, const TArray<FVector2f>& Ctrl)
		{
			const TArray<FVector2f> Pts = Catmull(Ctrl, 3.f);
			TArray<float> Raw;
			Raw.Reserve(Pts.Num());
			for (const FVector2f& P : Pts)
			{
				Raw.Add(FMath::Max(1.6f, BaseHeight(P.X, P.Y)));
			}
			const int32 W = 14;
			float S = 0;
			TArray<FRoadSample>& Out = Roads[Index];
			for (int32 i = 0; i < Pts.Num(); i++)
			{
				float Sum = 0;
				int32 C = 0;
				for (int32 k = -W; k <= W; k++)
				{
					Sum += Raw[FMath::Clamp(i + k, 0, Pts.Num() - 1)];
					C++;
				}
				const FVector2f A = Pts[FMath::Max(0, i - 1)];
				const FVector2f B = Pts[FMath::Min(Pts.Num() - 1, i + 1)];
				if (i > 0)
				{
					S += (Pts[i] - Pts[i - 1]).Size();
				}
				Out.Add({ Pts[i].X, Pts[i].Y, Sum / C, FMath::Atan2(B.X - A.X, -(B.Y - A.Y)), S });
			}
			for (int32 i = 0; i < Out.Num(); i++)
			{
				const int64 Key = (int64)FMath::FloorToInt(Out[i].X / Cell) * 65536 + FMath::FloorToInt(Out[i].Z / Cell);
				RoadCells.FindOrAdd(Key).Add(Index * 100000 + i);
			}
		}

		/** Nearest road sample within the neighbouring cells; Dist < 0 when none. */
		float NearestSample(float X, float Z, const FRoadSample*& OutSample)
		{
			const int32 CX = FMath::FloorToInt(X / Cell);
			const int32 CZ = FMath::FloorToInt(Z / Cell);
			float Best = 1e18f;
			OutSample = nullptr;
			for (int32 AX = -1; AX <= 1; AX++)
			{
				for (int32 AZ = -1; AZ <= 1; AZ++)
				{
					const TArray<int32>* Ids = RoadCells.Find((int64)(CX + AX) * 65536 + (CZ + AZ));
					if (!Ids)
					{
						continue;
					}
					for (const int32 Id : *Ids)
					{
						const FRoadSample& P = Roads[Id / 100000][Id % 100000];
						const float D = (P.X - X) * (P.X - X) + (P.Z - Z) * (P.Z - Z);
						if (D < Best)
						{
							Best = D;
							OutSample = &P;
						}
					}
				}
			}
			return OutSample ? FMath::Sqrt(Best) : -1.f;
		}

		void BuildGrid(int32 Index, const FIsle& I, int32 N)
		{
			FGrid& G = Grids[Index];
			G.Isle = I;
			G.N = N;
			G.Size = I.R * 2.7f;
			G.OX = I.X - G.Size / 2;
			G.OZ = I.Z - G.Size / 2;
			G.H.SetNumUninitialized(N * N);
			G.Road.SetNumUninitialized(N * N);
			for (int32 j = 0; j < N; j++)
			{
				for (int32 i = 0; i < N; i++)
				{
					const float X = G.OX + ((float)i / (N - 1)) * G.Size;
					const float Z = G.OZ + ((float)j / (N - 1)) * G.Size;
					const float B = BaseHeight(X, Z);
					const FRoadSample* S = nullptr;
					const float D = NearestSample(X, Z, S);
					float H = B;
					if (S)
					{
						const float W = 1 - FMath::SmoothStep(4.5f, 16.f, D);
						H = B + (S->H - B) * W;
					}
					G.H[j * N + i] = H;
					G.Road[j * N + i] = S ? D : 99.f;
				}
			}
		}

		float SampleGrid(const FGrid& G, float X, float Z)
		{
			const float U = ((X - G.OX) / G.Size) * (G.N - 1);
			const float V = ((Z - G.OZ) / G.Size) * (G.N - 1);
			if (U < 0 || V < 0 || U >= G.N - 1 || V >= G.N - 1)
			{
				return Seabed;
			}
			const int32 I = FMath::FloorToInt(U);
			const int32 J = FMath::FloorToInt(V);
			const float FU = U - I;
			const float FV = V - J;
			const int32 K = J * G.N + I;
			const float A = G.H[K];
			const float B = G.H[K + 1];
			const float C = G.H[K + G.N];
			const float D = G.H[K + G.N + 1];
			return A + (B - A) * FU + (C - A) * FV + (A - B - C + D) * FU * FV;
		}

		struct FWave
		{
			float DX, DZ, A, L;
		};
		const FWave Waves[6] = {
			{ 0.8f, 0.6f, 0.55f, 46.f },
			{ 0.954f, -0.301f, 0.34f, 27.f },
			{ 0.503f, 0.864f, 0.22f, 15.f },
			{ 0.995f, 0.0995f, 0.8f, 90.f },
			{ 0.301f, 0.954f, 0.12f, 8.5f },
			{ 0.707f, -0.707f, 0.09f, 5.2f },
		};
	}

	float Fbm(float X, float Z, int32 Octaves)
	{
		float S = 0, A = 0.5f, F = 1;
		for (int32 i = 0; i < Octaves; i++)
		{
			S += A * VNoise(X * F, Z * F);
			F *= 2.03f;
			A *= 0.5f;
		}
		return S;
	}

	void EnsureInit()
	{
		if (bReady)
		{
			return;
		}
		BuildRoad(0, {
			{ -25, -15 }, { 45, -65 }, { 115, -35 }, { 95, 35 }, { 20, 75 }, { -65, 110 }, { -150, 85 }, { -200, 5 }, { -170, -95 },
			{ -80, -170 }, { 40, -200 }, { 160, -170 }, { 250, -90 }, { 285, 10 }, { 255, 110 }, { 310, 165 }, { 372, 120 }, { 408, 62 }, { 452, 55 } });
		BuildRoad(1, { { 1218, -205 }, { 1262, -172 }, { 1322, -192 }, { 1372, -250 }, { 1432, -268 }, { 1470, -232 }, { 1492, -222 } });
		BuildGrid(0, IsleA, 420);
		BuildGrid(1, IsleB, 300);
		const TArray<FRoadSample>& RA = Roads[0];
		ThePlaces.BikeStart = FVector2f(RA[4].X, RA[4].Z);
		ThePlaces.BikeHeading = RA[4].Heading;
		ThePlaces.Harbour = FVector2f(RA[RA.Num() - 4].X, RA[RA.Num() - 4].Z);
		ThePlaces.BoatStart = FVector2f(478, 62);
		ThePlaces.BoatHeading = 1.2f;
		ThePlaces.Cove = FVector2f(1205, -208);
		bReady = true;
	}

	float HeightAt(float X, float Z)
	{
		return FMath::Max(SampleGrid(Grids[0], X, Z), SampleGrid(Grids[1], X, Z));
	}

	FRoadHit RoadNearest(float X, float Z)
	{
		const TArray<FRoadSample>& R = Roads[0];
		float Best = 1e18f;
		int32 BI = 0;
		for (int32 i = 0; i < R.Num(); i += 2)
		{
			const float D = (R[i].X - X) * (R[i].X - X) + (R[i].Z - Z) * (R[i].Z - Z);
			if (D < Best)
			{
				Best = D;
				BI = i;
			}
		}
		return { FMath::Sqrt(Best), (float)BI / (R.Num() - 1), R[BI].X, R[BI].Z, R[BI].Heading };
	}

	FRoadSample RoadPoint(float Progress, int32 RoadIndex)
	{
		const TArray<FRoadSample>& R = Roads[RoadIndex];
		return R[FMath::Clamp(FMath::RoundToInt(Progress * (R.Num() - 1)), 0, R.Num() - 1)];
	}

	const FGrid& Grid(int32 Index)
	{
		return Grids[Index];
	}

	const TArray<FRoadSample>& Road(int32 Index)
	{
		return Roads[Index];
	}

	const FPlaces& Places()
	{
		return ThePlaces;
	}

	float SeaAmplitude(float Storm)
	{
		return 0.35f + 1.7f * Storm * Storm;
	}

	float OceanHeight(float X, float Z, float Time, float Sea, float* OutCrest, FVector3f* OutNormal)
	{
		float Y = 0, Crest = 0, NX = 0, NZ = 0;
		for (const FWave& W : Waves)
		{
			const float K = 6.2831853f / W.L;
			const float A = W.A * Sea;
			const float Th = K * (W.DX * X + W.DZ * Z) - FMath::Sqrt(9.81f * K) * Time;
			float S, C;
			FMath::SinCos(&S, &C, Th);
			Y += A * S;
			Crest += A * K * S;
			NX -= W.DX * K * A * C;
			NZ -= W.DZ * K * A * C;
		}
		if (OutCrest)
		{
			*OutCrest = Crest;
		}
		if (OutNormal)
		{
			*OutNormal = FVector3f(NX, NZ, 1.f).GetSafeNormal();
		}
		return Y;
	}

	FVector2f WindAt(float X, float Z, float Time, float Storm)
	{
		const FVector2f Base(-0.77f, 0.64f); // from the north-east
		const float Speed = 5 + 12 * Storm;
		const float Gust = 0.75f + 0.5f * Fbm((X - Base.X * Time * Speed) / 120, (Z - Base.Y * Time * Speed) / 120, 2)
			+ 0.35f * Storm * FMath::Sin(Time * 0.6f + X * 0.01f);
		const float Veer = X > 950 ? -0.45f * FMath::SmoothStep(950.f, 1150.f, X) : 0.f;
		const float CX = FMath::Cos(Veer);
		const float SX = FMath::Sin(Veer);
		return FVector2f((Base.X * CX - Base.Y * SX), (Base.X * SX + Base.Y * CX)) * (Speed * Gust);
	}
}
