using UnrealBuildTool;

public class CogAndGale : ModuleRules
{
	public CogAndGale(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new string[] {
			"Core", "CoreUObject", "Engine", "InputCore", "ProceduralMeshComponent", "CableComponent"
		});
	}
}
