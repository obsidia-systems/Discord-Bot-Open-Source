# =====================================================================
# TO - modulo de poses | Fase 2: verificacion de pivotes
# No crea geometria. Solo mueve nodos, igual que hara R3F.
# =====================================================================
import bpy, math
from mathutils import Vector, Quaternion

D = bpy.data.objects

def reset_pose():
    for ob in D:
        if not ob.name.startswith("TO_"):
            continue
        ob.rotation_mode = "QUATERNION"
        ob.rotation_quaternion = Quaternion((1, 0, 0, 0))
        if ob.name == "TO_Antenna_Shaft":
            ob.location.z = ob.get("rest_z", ob.location.z)
        ob["rest_z"] = ob.get("rest_z", ob.location.z)
    bpy.context.view_layer.update()

def arm_frame(side):
    """Reconstruye los ejes del brazo desde los origenes reales de los objetos."""
    sh = D["TO_Arm_" + side].matrix_world.translation.copy()
    hd = D["TO_Wrist_" + side].matrix_world.translation.copy()
    axis = (hd - sh).normalized()
    w = axis.cross(Vector((0.0, 1.0, 0.0)))
    if w.length < 1e-4:
        w = axis.cross(Vector((1.0, 0.0, 0.0)))
    w.normalize()
    return sh, hd, axis, w

def close_claws(side, deg):
    """Cerrar = girar cada dedo hacia dentro. Eje = (w*sgn) x eje_brazo,
    el mismo que usa el constructor para curvar la garra."""
    _, _, axis, w = arm_frame(side)
    for key, sgn in (("A", 1.0), ("B", -1.0)):
        n = (w * sgn).cross(axis).normalized()
        ob = D["TO_Claw_%s_%s" % (side, key)]
        ob.rotation_mode = "QUATERNION"
        ob.rotation_quaternion = Quaternion(n, math.radians(deg))

def swing_arm(side, deg_fwd=0.0, deg_out=0.0):
    ob = D["TO_Arm_" + side]
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = (Quaternion(Vector((1, 0, 0)), math.radians(deg_fwd))
                              @ Quaternion(Vector((0, 1, 0)), math.radians(deg_out)))

def retract_antenna(t):
    """t=0 desplegada, t=1 retraida. Traslacion en Z local, nunca escalado."""
    sh = D["TO_Antenna_Shaft"]
    rest = sh.get("rest_z", sh.location.z)
    sh["rest_z"] = rest
    sh.location.z = rest - antenna_travel() * t

def antenna_travel():
    """Recorrido necesario para que el bulbo baje del plano superior."""
    top_case = world_bounds("TO_Case_Shell")[1].z
    top_bulb = world_bounds("TO_Antenna_Bulb")[1].z
    return (top_bulb - top_case) + 0.02

def tilt_body(deg_x=0.0, deg_z=0.0):
    ob = D["TO_Body"]
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = (Quaternion(Vector((0, 0, 1)), math.radians(deg_z))
                              @ Quaternion(Vector((1, 0, 0)), math.radians(deg_x)))

def world_bounds(name):
    ob = D[name]
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    pts = [ob.matrix_world @ v.co for v in me.vertices]
    ev.to_mesh_clear()
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi

def world_verts(name):
    ob = D[name]
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    pts = [ob.matrix_world @ v.co for v in me.vertices]
    ev.to_mesh_clear()
    return pts
