"""Creates the game's material assets. Run with:
UnrealEditor-Cmd.exe CogAndGale.uproject -run=pythonscript -script=Scripts/build_assets.py
"""
import unreal

PATH = '/Game/CG'
tools = unreal.AssetToolsHelpers.get_asset_tools()
mel = unreal.MaterialEditingLibrary
eal = unreal.EditorAssetLibrary
MP = unreal.MaterialProperty


def new_material(name):
    full = f'{PATH}/{name}'
    if eal.does_asset_exist(full):
        eal.delete_asset(full)
    return tools.create_asset(name, PATH, unreal.Material, unreal.MaterialFactoryNew())


def node(mat, cls, x, y, **props):
    e = mel.create_material_expression(mat, cls, x, y)
    for k, v in props.items():
        e.set_editor_property(k, v)
    return e


def const(mat, value, x, y):
    return node(mat, unreal.MaterialExpressionConstant, x, y, r=value)


def finish(mat):
    mel.recompile_material(mat)
    eal.save_loaded_asset(mat)
    unreal.log(f'built {mat.get_path_name()}')


# --- M_Solid: one parameterised surface for props and vehicles
m = new_material('M_Solid')
color = node(m, unreal.MaterialExpressionVectorParameter, -500, -100, parameter_name='Color',
             default_value=unreal.LinearColor(0.5, 0.5, 0.5, 1))
rough = node(m, unreal.MaterialExpressionScalarParameter, -500, 100, parameter_name='Roughness', default_value=0.7)
metal = node(m, unreal.MaterialExpressionScalarParameter, -500, 200, parameter_name='Metallic', default_value=0.0)
emis = node(m, unreal.MaterialExpressionVectorParameter, -500, 300, parameter_name='Emissive',
            default_value=unreal.LinearColor(0, 0, 0, 1))
mel.connect_material_property(color, '', MP.MP_BASE_COLOR)
mel.connect_material_property(rough, '', MP.MP_ROUGHNESS)
mel.connect_material_property(metal, '', MP.MP_METALLIC)
mel.connect_material_property(emis, '', MP.MP_EMISSIVE_COLOR)
finish(m)

# --- M_Terrain: vertex colour ground; alpha marks tarmac, which is smoother
m = new_material('M_Terrain')
m.set_editor_property('two_sided', True)
vc = node(m, unreal.MaterialExpressionVertexColor, -700, 0)
r_ground = const(m, 0.92, -700, 250)
r_road = const(m, 0.55, -700, 330)
lerp = node(m, unreal.MaterialExpressionLinearInterpolate, -400, 250)
mel.connect_material_expressions(r_ground, '', lerp, 'A')
mel.connect_material_expressions(r_road, '', lerp, 'B')
mel.connect_material_expressions(vc, 'A', lerp, 'Alpha')
mel.connect_material_property(vc, '', MP.MP_BASE_COLOR)
mel.connect_material_property(lerp, '', MP.MP_ROUGHNESS)
finish(m)

# --- M_Ocean: deep water with foam where the vertex alpha says the crest breaks
m = new_material('M_Ocean')
m.set_editor_property('two_sided', True)
vc = node(m, unreal.MaterialExpressionVertexColor, -900, 0)
deep = node(m, unreal.MaterialExpressionConstant3Vector, -900, -250, constant=unreal.LinearColor(0.004, 0.03, 0.045, 1))
foam = node(m, unreal.MaterialExpressionConstant3Vector, -900, -150, constant=unreal.LinearColor(0.8, 0.86, 0.88, 1))
base = node(m, unreal.MaterialExpressionLinearInterpolate, -500, -200)
mel.connect_material_expressions(deep, '', base, 'A')
mel.connect_material_expressions(foam, '', base, 'B')
mel.connect_material_expressions(vc, 'A', base, 'Alpha')
r_water = const(m, 0.06, -900, 200)
r_foam = const(m, 0.7, -900, 280)
rl = node(m, unreal.MaterialExpressionLinearInterpolate, -500, 220)
mel.connect_material_expressions(r_water, '', rl, 'A')
mel.connect_material_expressions(r_foam, '', rl, 'B')
mel.connect_material_expressions(vc, 'A', rl, 'Alpha')
spec = const(m, 0.5, -500, 100)
mel.connect_material_property(base, '', MP.MP_BASE_COLOR)
mel.connect_material_property(rl, '', MP.MP_ROUGHNESS)
mel.connect_material_property(spec, '', MP.MP_SPECULAR)
finish(m)
