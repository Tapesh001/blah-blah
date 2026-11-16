"""Creates M_Grass: upright quads cut into blades by a procedural mask, lit like the ground, bent by the wind.
Run after build_assets.py with the same command line.
"""
import unreal

PATH = '/Game/CG'
tools = unreal.AssetToolsHelpers.get_asset_tools()
mel = unreal.MaterialEditingLibrary
eal = unreal.EditorAssetLibrary
MP = unreal.MaterialProperty
F1 = unreal.CustomMaterialOutputType.CMOT_FLOAT1
F3 = unreal.CustomMaterialOutputType.CMOT_FLOAT3


def node(mat, cls, x, y, **props):
    e = mel.create_material_expression(mat, cls, x, y)
    for k, v in props.items():
        e.set_editor_property(k, v)
    return e


def custom(mat, code, out_type, names, x, y):
    c = node(mat, unreal.MaterialExpressionCustom, x, y)
    c.set_editor_property('code', code)
    c.set_editor_property('output_type', out_type)
    inputs = []
    for n in names:
        ci = unreal.CustomInput()
        ci.set_editor_property('input_name', n)
        inputs.append(ci)
    c.set_editor_property('inputs', inputs)
    return c


MASK = "\n".join([
    "float v = L.x / 100.0 + 0.5;",
    "float u = L.y / 100.0 + 0.5;",
    "float n = 5.0;",
    "float cell = floor(u * n);",
    "float x = frac(u * n) - 0.5;",
    "float h = 0.5 + 0.5 * frac(sin(cell * 12.9898 + 3.1) * 43758.5453);",
    "float lean = (frac(sin(cell * 78.233) * 43758.5453) - 0.5) * 0.5 * v;",
    "float w = 0.46 * (1.0 - v / h);",
    "return (v < h && abs(x - lean) < w) ? 1.0 : 0.0;",
])
SWAY = "\n".join([
    "float v = saturate(L.x / 100.0 + 0.5);",
    "float s = sin(T * 2.2 + dot(WP.xy, W.xy) * 0.006) * 0.6 + sin(T * 5.1 + WP.x * 0.02) * 0.15;",
    "return float3(W.x, W.y, -0.25) * ((0.45 + s) * v * v * S);",
])

full = PATH + '/M_Grass'
if eal.does_asset_exist(full):
    eal.delete_asset(full)
m = tools.create_asset('M_Grass', PATH, unreal.Material, unreal.MaterialFactoryNew())
m.set_editor_property('two_sided', True)
m.set_editor_property('blend_mode', unreal.BlendMode.BLEND_MASKED)
m.set_editor_property('tangent_space_normal', False)
m.set_editor_property('used_with_instanced_static_meshes', True)

vs_local = node(m, unreal.MaterialExpressionPreSkinnedPosition, -1300, 0)
# the mesh-space position only exists in the vertex stage; carry it to the pixel stage
local = node(m, unreal.MaterialExpressionVertexInterpolator, -1100, 0)
ok = mel.connect_material_expressions(vs_local, '', local, 'VS') or mel.connect_material_expressions(vs_local, '', local, '')
unreal.log('interpolator connected: ' + str(ok))
mask = custom(m, MASK, F1, ['L'], -700, 200)
mel.connect_material_expressions(local, '', mask, 'L')
height = custom(m, 'return saturate(L.x / 100.0 + 0.5);', F1, ['L'], -700, 0)
mel.connect_material_expressions(local, '', height, 'L')
root = node(m, unreal.MaterialExpressionConstant3Vector, -700, -300, constant=unreal.LinearColor(0.05, 0.12, 0.025, 1))
tip = node(m, unreal.MaterialExpressionConstant3Vector, -700, -200, constant=unreal.LinearColor(0.42, 0.55, 0.14, 1))
blade = node(m, unreal.MaterialExpressionLinearInterpolate, -400, -250)
mel.connect_material_expressions(root, '', blade, 'A')
mel.connect_material_expressions(tip, '', blade, 'B')
mel.connect_material_expressions(height, '', blade, 'Alpha')
rnd = node(m, unreal.MaterialExpressionPerInstanceRandom, -700, -80)
vary = custom(m, 'return C * (0.75 + 0.5 * R);', F3, ['C', 'R'], -200, -200)
mel.connect_material_expressions(blade, '', vary, 'C')
mel.connect_material_expressions(rnd, '', vary, 'R')
up = node(m, unreal.MaterialExpressionConstant3Vector, -400, 100, constant=unreal.LinearColor(0, 0, 1, 1))
wind = node(m, unreal.MaterialExpressionVectorParameter, -1100, 400, parameter_name='Wind',
            default_value=unreal.LinearColor(-0.77, 0.64, 0, 0))
strength = node(m, unreal.MaterialExpressionScalarParameter, -1100, 550, parameter_name='Strength', default_value=12.0)
wp = node(m, unreal.MaterialExpressionWorldPosition, -1100, 650)
tm = node(m, unreal.MaterialExpressionTime, -1100, 750)
sway = custom(m, SWAY, F3, ['L', 'W', 'S', 'WP', 'T'], -700, 500)
mel.connect_material_expressions(vs_local, '', sway, 'L')
mel.connect_material_expressions(wind, '', sway, 'W')
mel.connect_material_expressions(strength, '', sway, 'S')
mel.connect_material_expressions(wp, '', sway, 'WP')
mel.connect_material_expressions(tm, '', sway, 'T')
rough = node(m, unreal.MaterialExpressionConstant, -400, 250, r=0.85)
mel.connect_material_property(vary, '', MP.MP_BASE_COLOR)
mel.connect_material_property(mask, '', MP.MP_OPACITY_MASK)
mel.connect_material_property(up, '', MP.MP_NORMAL)
mel.connect_material_property(rough, '', MP.MP_ROUGHNESS)
mel.connect_material_property(sway, '', MP.MP_WORLD_POSITION_OFFSET)
mel.recompile_material(m)
eal.save_loaded_asset(m)
unreal.log('built ' + m.get_path_name())
