# =====================================================================
# TO - constructor parametrico | Fase 1 rev.B
# Medidas derivadas de las 3 vistas de referencia (frontal, lateral, trasera)
# 240 u del spec = 1.00 m de ancho de carcasa | TO mira a -Y | origen en el suelo
# =====================================================================
import bpy, math
from mathutils import Vector, Quaternion

P = {
    # Carcasa: casi cubica (la vista lateral corrige el error de profundidad)
    "case_w": 1.00, "case_h": 0.91, "case_d": 0.82,
    "front_d": 0.34, "case_r": 0.135, "shell_inset": 0.05, "shell_r": 0.105,
    # Pantalla: apaisada, bisel mas grueso arriba/abajo que a los lados
    "screen_w_f": 0.79, "screen_h_f": 0.70,
    "screen_r": 0.085, "screen_recess": -0.006, "screen_d": 0.025,
    # Menton: cupula, no pastilla
    "chin_w": 0.42, "chin_d": 0.40, "chin_h": 0.24,
    "emitter_r": 0.115, "emitter_h": 0.02, "emitter_lift": 0.045,
    "float_gap": 0.13,
    # Antena conica con collar
    "ant_socket_r": 0.05, "ant_socket_h": 0.06,
    "ant_r_base": 0.026, "ant_r_tip": 0.014, "ant_shaft_h": 0.33,
    "ant_bulb_r": 0.052,
    # Brazos: hombro esferico en el costado + tubo + muneca esferica
    "shoulder_r": 0.078, "arm_r": 0.026, "wrist_r": 0.072,
    "shoulder": (0.475, 0.06, 0.50),
    "hand": (0.700, -0.04, 0.175),
}
P.update(globals().get("P_OVERRIDE", {}))

Z_CASE_BOT = P["float_gap"] + P["chin_h"]
Z_CASE_TOP = Z_CASE_BOT + P["case_h"]
Y_FRONT = -P["case_d"] / 2.0

def srgb(h):
    h = h.lstrip("#"); o = []
    for i in (0, 2, 4):
        c = int(h[i:i+2], 16) / 255.0
        o.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (o[0], o[1], o[2], 1.0)

def mat(name, base, rough=0.6, metal=0.0, emit=None, strength=1.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = srgb(base)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = srgb(emit)
        b.inputs["Emission Strength"].default_value = strength
    return m

def act(ob):
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True); bpy.context.view_layer.objects.active = ob

def apply_scale(ob):
    act(ob); bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

def set_origin(ob, loc):
    act(ob)
    prev = tuple(bpy.context.scene.cursor.location)
    bpy.context.scene.cursor.location = loc
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    bpy.context.scene.cursor.location = prev

def bevel(ob, width, seg=3):
    m = ob.modifiers.new("Bevel", "BEVEL")
    m.width = width; m.segments = seg
    m.limit_method = "ANGLE"; m.angle_limit = math.radians(40)
    m.miter_outer = "MITER_ARC"

def smooth_all(ob):
    for p in ob.data.polygons:
        p.use_smooth = True

def smooth_sides(ob):
    for p in ob.data.polygons:
        p.use_smooth = len(p.vertices) == 4

def move_to(ob, coll):
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    coll.objects.link(ob)

def finish(ob, name, material, coll):
    ob.name = name
    ob.data.materials.append(material)
    move_to(ob, coll)
    return ob

def rbox(name, w, d, h, loc, radius, coll, material):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob = bpy.context.object
    ob.scale = (w, d, h); apply_scale(ob)
    bevel(ob, radius); smooth_all(ob)
    return finish(ob, name, material, coll)

def cyl(name, r, h, loc, coll, material, verts=32):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, vertices=verts, location=loc)
    ob = bpy.context.object; smooth_sides(ob)
    return finish(ob, name, material, coll)

def cone(name, r1, r2, h, loc, coll, material, verts=20):
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=h, vertices=verts, location=loc)
    ob = bpy.context.object; smooth_sides(ob)
    return finish(ob, name, material, coll)

def sph(name, r, loc, coll, material, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=32, ring_count=16, location=loc)
    ob = bpy.context.object
    if scale != (1, 1, 1):
        ob.scale = scale; apply_scale(ob)
    smooth_all(ob)
    return finish(ob, name, material, coll)

def empty(name, loc, coll, size=0.12):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = "PLAIN_AXES"; e.empty_display_size = size
    e.location = loc; coll.objects.link(e)
    return e

def reparent(child, parent):
    bpy.context.view_layer.update()
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()

# --------------------------------------------------------------- reset
if bpy.context.object and bpy.context.object.mode != "OBJECT":
    bpy.ops.object.mode_set(mode="OBJECT")
old = bpy.data.collections.get("TO")
if old:
    for ob in list(old.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.collections.remove(old)
if "Cube" in bpy.data.objects:
    bpy.data.objects.remove(bpy.data.objects["Cube"], do_unlink=True)
TO = bpy.data.collections.new("TO")
bpy.context.scene.collection.children.link(TO)

# ---------------------------------------------------------- materiales
# Colores como parametros. Los hex de referencia salen de un render y ya
# llevan luz dentro: el albedo debe ser MAS CLARO para igualarlos en pantalla.
M_FRONT  = mat("TO_M_CaseFront", P.get("col_front", "#33383B"),
               rough=P.get("rough_front", 0.62))
M_SHELL  = mat("TO_M_CaseShell", P.get("col_shell", "#8C8878"),
               rough=P.get("rough_shell", 0.55))
M_METAL  = mat("TO_M_Metal", P.get("col_metal", "#4A4A46"),
               rough=P.get("rough_metal", 0.50), metal=P.get("metal_amt", 0.10))
M_SCREEN = mat("TO_M_Screen", P.get("col_glass", "#0B1409"), rough=0.18,
               emit=P.get("col_phosphor_bg", "#4E9C3A"),
               strength=P.get("phosphor_strength", 1.6))
M_EMIT   = mat("TO_M_Emitter", P.get("col_acid", "#C6FF3D"), rough=0.4,
               emit=P.get("col_acid", "#C6FF3D"), strength=4.0)

# ----------------------------------------------------------- jerarquia
root = empty("TO_Root", (0, 0, 0), TO, 0.25)
# El cuerpo bascula sobre el centro de la bola, como un rodillo,
# no sobre el fondo de la carcasa.
Z_BALL = Z_CASE_BOT - P["chin_h"] * P.get("ball_drop", 0.0)
body = empty("TO_Body", (0, 0, Z_BALL), TO, 0.18)
body.parent = root

# ------------------------------------------------------------- cuerpo
import bmesh

# Perfil de rectangulo redondeado: 4*n puntos, sin duplicados en las juntas
def rrect_pts(w, h, r, n=10):
    pts = []
    cx, cy = w / 2.0 - r, h / 2.0 - r
    for ox, oy, a0 in ((cx, cy, 0), (-cx, cy, 90), (-cx, -cy, 180), (cx, -cy, 270)):
        for i in range(n):
            a = math.radians(a0 + 90.0 * i / n)
            pts.append((ox + r * math.cos(a), oy + r * math.sin(a)))
    return pts

# Marco: dos perfiles concentricos unidos por quads, luego solidify.
# Sin booleanos -> topologia limpia y el bisel no explota.
def super_pts(w, h, n_exp, count=72):
    """Superelipse |x/a|^n + |y/b|^n = 1. n=2 elipse, n->inf rectangulo.
    Entre 3 y 5 da el abombado de tubo de rayos catodicos."""
    a, b = w / 2.0, h / 2.0
    e = 2.0 / n_exp
    pts = []
    for k in range(count):
        th = 2.0 * math.pi * k / count
        ct, st = math.cos(th), math.sin(th)
        x = a * math.copysign(abs(ct) ** e, ct)
        y = b * math.copysign(abs(st) ** e, st)
        pts.append((x, y))
    return pts

def super_prism(name, w, h, n_exp, y0, y1, zc, coll, material,
                bev=0.13, seg=3, cnt=80):
    """Extrusion del MISMO perfil de superelipse que usa el marco.
    Si la carcasa fuera un rbox y el marco una superelipse, los dos
    contornos se cruzarian y dejarian una linea irregular."""
    pts = super_pts(w, h, n_exp, cnt)
    m = len(pts)
    verts = [(x, y0, zc + z) for x, z in pts] + [(x, y1, zc + z) for x, z in pts]
    faces = [(i, (i + 1) % m, m + (i + 1) % m, m + i) for i in range(m)]
    faces.append(tuple(range(m)))
    faces.append(tuple(range(m, 2 * m)))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    bevel(ob, bev, seg)          # solo redondea los cantos frontal y trasero
    smooth_all(ob)
    ob.data.materials.append(material)
    return ob

def bezel_ring(name, ow, oh, orad, iw, ih, irad, depth, y, zc, coll, material, n=10):
    cnt = P.get("crt_segments", 72)
    outer = super_pts(ow, oh, P.get("crt_n_outer", 5.0), cnt)
    inner = super_pts(iw, ih, P.get("crt_n_inner", 3.2), cnt)
    bm = bmesh.new()
    vo = [bm.verts.new((x, y, z + zc)) for x, z in outer]
    vi = [bm.verts.new((x, y, z + zc)) for x, z in inner]
    m = len(vo)
    for i in range(m):
        j = (i + 1) % m
        bm.faces.new((vo[i], vo[j], vi[j], vi[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    sol = ob.modifiers.new("Solidify", "SOLIDIFY")
    sol.thickness = depth; sol.offset = -1.0
    bevel(ob, P.get("bezel_round", 0.045), seg=P.get("bezel_round_seg", 4))
    smooth_all(ob)
    ob.data.materials.append(material)
    return ob

def tube(name, pts, radii, thickness, coll, material, res_u=6, bev_res=3,
         profile=None):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.resolution_u = res_u
    cu.use_fill_caps = True
    if profile is not None:
        cu.bevel_mode = "OBJECT"      # seccion rectangular en vez de circular
        cu.bevel_object = profile
    else:
        cu.bevel_depth = thickness
        cu.bevel_resolution = bev_res
    sp = cu.splines.new("NURBS")
    sp.points.add(len(pts) - 1)
    for k, (p, r) in enumerate(zip(pts, radii)):
        sp.points[k].co = (p.x, p.y, p.z, 1.0)
        sp.points[k].radius = r
    sp.order_u = min(4, len(pts))
    sp.use_endpoint_u = True
    ob = bpy.data.objects.new(name, cu)
    coll.objects.link(ob)
    act(ob)
    bpy.ops.object.convert(target="MESH")
    ob = bpy.context.object
    smooth_all(ob)
    return finish(ob, name, material, coll)

# Arco de pinza: circunferencia cuyo centro esta desplazado lateralmente,
# de modo que el dedo sale segun el eje del brazo y se curva hacia dentro.
zc = Z_CASE_BOT + P["case_h"] / 2.0

# El cuerpo es UN volumen a tamano completo. Antes la concha era menor que el
# marco y por eso el frontal sobresalia como un collar.
# La concha NO llega al frente: termina justo detras del plano de pantalla.
# Si llega, su cara frontal tapa la pantalla y por la ventana se ve la concha.
_sf = Y_FRONT + P["screen_recess"] + 0.02
_yb = P.get("seam_y", 0.14)              # plano donde parte la carcasa
_in = P.get("rear_inset", 0.020)         # cuanto se mete el modulo trasero
# OJO: partir la carcasa en dos rbox redondea TAMBIEN las caras del corte,
# asi que las mitades no casan a ras y la trasera parece pegada. Solo activar
# case_split cuando el bisel se limite por peso de arista, no por angulo.
if P.get("case_split", False):
    _d1 = _yb - _sf
    shell = rbox("TO_Case_Shell", P["case_w"], _d1, P["case_h"],
                 (0, _sf + _d1 / 2.0, zc), P["shell_r"], TO, M_SHELL)
    _d2 = (P["case_d"] / 2.0) - _yb
    rear = rbox("TO_Case_Rear", P["case_w"] - _in, _d2, P["case_h"] - _in,
                (0, _yb + _d2 / 2.0, zc), P["shell_r"], TO, M_SHELL)
else:
    shell = super_prism("TO_Case_Shell", P["case_w"], P["case_h"],
                        P.get("crt_n_outer", 5.0), _sf, P["case_d"] / 2.0, zc,
                        TO, M_SHELL, bev=P["shell_r"],
                        cnt=P.get("crt_segments", 80))
    rear = None

op_w = P["case_w"] * P["screen_w_f"]
op_h = P["case_h"] * P["screen_h_f"]

front = bezel_ring("TO_Case_Front",
                   P["case_w"] + P["bezel_lip"], P["case_h"] + P["bezel_lip"], P["case_r"],
                   op_w, op_h, P["screen_r"],
                   P["front_d"], Y_FRONT - P["bezel_lip"] / 2.0, zc, TO, M_FRONT)

# Pantalla hundida detras de la ventana, algo mas ancha que el hueco
# La pantalla es un PLANO, no una caja: es la unica cara que se ve y asi
# su UV es un cuadrado exacto 0..1 sin interpolacion del bisel.
# Orden de vertices visto desde -Y (el espectador): abajo-izq, abajo-der,
# arriba-der, arriba-izq  ->  normal hacia -Y, u crece con +X, v con +Z.
def screen_lens(name, w, h, y, zc, coll, material, bulge, n=20):
    """Rejilla abombada hacia el espectador (-Y). Calota, no plano.
    La UV se escribe por vertice, asi que sigue siendo un 0..1 exacto."""
    verts, uvs, faces = [], [], []
    for jj in range(n + 1):
        for ii in range(n + 1):
            u, v = ii / n, jj / n
            du, dv = (u - 0.5) * 2.0, (v - 0.5) * 2.0
            r2 = min(1.0, (du * du + dv * dv) * 0.5)
            verts.append(((u - 0.5) * w, y - bulge * (1.0 - r2), zc + (v - 0.5) * h))
            uvs.append((u, v))
    for jj in range(n):
        for ii in range(n):
            a0 = jj * (n + 1) + ii
            faces.append((a0, a0 + 1, a0 + n + 2, a0 + n + 1))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    uvl = me.uv_layers.new(name="UVMap")
    for lp in me.loops:
        uvl.data[lp.index].uv = uvs[lp.vertex_index]
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    smooth_all(ob)
    ob.data.materials.append(material)
    return ob

glass = None if not P.get("glass_ring", False) else bezel_ring("TO_Screen_Glass",
                   op_w + 0.05, op_h + 0.05, P["screen_r"] * 1.05,
                   op_w - P.get("glass_lip", 0.045),
                   op_h - P.get("glass_lip", 0.045), P["screen_r"] * 0.85,
                   P.get("glass_d", 0.05), Y_FRONT + P.get("glass_y", 0.022),
                   zc, TO, M_FRONT)

screen = screen_lens("TO_Screen", op_w + 0.03, op_h + 0.03,
                     Y_FRONT + P["screen_recess"], zc, TO, M_SCREEN,
                     P.get("screen_bulge", 0.035))

# Menton: cupula. La mitad superior queda oculta dentro de la carcasa.
# Propulsor: elipsoide achatado (de revolucion en planta, sin aristas).
# La mitad superior queda oculta dentro de la carcasa; la inferior es el
# alojamiento que sujeta la bola, como en un desodorante de bola.
chin = sph("TO_Chin", 0.5, (0, 0, Z_CASE_BOT), TO, M_FRONT,
           scale=(P["chin_w"], P["chin_d"], P["chin_h"] * 2.0))
# La bola asoma por debajo: ball_drop la baja respecto al centro del elipsoide
emitter = sph("TO_Chin_Ball", P["ball_r"],
              (0, 0, Z_CASE_BOT - P["chin_h"] * P.get("ball_drop", 0.71)),
              TO, M_EMIT)

# ------------------------------------------------------------- antena
socket = sph("TO_Antenna_Socket", 0.5, (0, P.get("ant_y", 0.04), Z_CASE_TOP), TO, M_METAL,
             scale=(P["ant_socket_r"] * 2.0, P["ant_socket_r"] * 2.0,
                    P["ant_socket_h"] * 2.0))
z_shaft = Z_CASE_TOP + P["ant_socket_h"] / 2.0
# Vastago barrido con radio variable: base acampanada que se funde con la
# cupula, luego afina. Un cono recto no da esa transicion.
_ay = P.get("ant_y", 0.04)
_h = P["ant_shaft_h"]
_pts = [Vector((0, _ay, z_shaft + _h * k)) for k in (0.0, 0.07, 0.22, 0.55, 1.0)]
_rad = [P.get("ant_flare", 2.05), 1.45, 1.05, 0.88, P["ant_r_tip"] / P["ant_r_base"]]
shaft = tube("TO_Antenna_Shaft", _pts, _rad, P["ant_r_base"], TO, M_METAL,
             res_u=4, bev_res=4)
set_origin(shaft, (0, _ay, z_shaft))
bulb = sph("TO_Antenna_Bulb", P["ant_bulb_r"],
           (0, _ay, z_shaft + P["ant_shaft_h"] + P["ant_bulb_r"] * 0.3), TO, M_METAL)
reparent(bulb, shaft)

# ------------------------------------------------------------- brazos
# Tubo barrido sobre una curva. El radio por punto permite conicidad real
# sin objeto taper: radio_final = bevel_depth * point.radius
def claw_arc(hd, axis, w, sgn, wrist_r, n=9):
    """Garra definida por intencion, no por geometria de circunferencia:
       - nace en la superficie de la bola (base_along / base_side)
       - apunta segun el eje del brazo inclinado hacia fuera (pitch)
       - mide claw_len y se curva claw_span grados hacia dentro
    """
    ws = w * sgn
    n_bend = ws.cross(axis).normalized()          # girar +theta curva hacia dentro
    B = hd + axis * (wrist_r * P.get("claw_base_along", 0.45)) \
           + ws * (wrist_r * P.get("claw_base_side", 0.45))
    pitch = math.radians(P.get("claw_pitch", 28.0))
    d0 = (Quaternion(n_bend, -pitch) @ axis).normalized()
    L = P.get("claw_len", 0.12)
    span = math.radians(P.get("claw_span", 30.0))
    if span < 1e-4:
        return [B + d0 * (L * k / (n - 1)) for k in range(n)]
    R = L / span
    u = (Quaternion(n_bend, math.radians(90.0)) @ d0).normalized()
    C = B + u * R
    return [C + (Quaternion(n_bend, span * k / (n - 1)) @ (B - C)) for k in range(n)]

def rect_profile(name, w, h, r, coll, n=4):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "2D"
    sp = cu.splines.new("POLY")
    pp = rrect_pts(w, h, r, n)
    sp.points.add(len(pp) - 1)
    for k, (x, y) in enumerate(pp):
        sp.points[k].co = (x, y, 0.0, 1.0)
    sp.use_cyclic_u = True
    ob = bpy.data.objects.new(name, cu)
    coll.objects.link(ob)
    ob.hide_viewport = True
    ob.hide_render = True
    return ob

# Collarin: perfil (radio, altura) revolucionado 360 grados con Screw.
# Va montado al CUERPO, no al brazo: es la placa de anclaje, no la rotula.
def collar(name, prof, loc, nx, coll, material, steps=36):
    me = bpy.data.meshes.new(name)
    me.from_pydata([(r, 0.0, z) for r, z in prof],
                   [(i, i + 1) for i in range(len(prof) - 1)], [])
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    m = ob.modifiers.new("Screw", "SCREW")
    m.axis = "Z"; m.angle = math.radians(360.0)
    m.steps = steps; m.render_steps = steps
    m.use_merge_vertices = True; m.use_smooth_shade = True
    ob.rotation_euler = Vector(nx).to_track_quat("Z", "Y").to_euler()
    ob.location = loc
    ob.data.materials.append(material)
    return ob

# Con bevel_object el tamano REAL del perfil manda: bevel_depth se ignora.
claw_prof = rect_profile("TO_ClawProfile", P.get("claw_sec_w", 0.048),
                         P.get("claw_sec_h", 0.030),
                         P.get("claw_sec_r", 0.008), TO)

arm_roots = []
for side, sx in (("L", -1), ("R", 1)):
    # El brazo nace en el eje del collarin y sale PERPENDICULAR al costado;
    # solo despues se curva hacia abajo. Asi tapa la boca del embudo.
    nx = Vector((float(sx), 0.0, 0.0))
    sh = Vector((sx * (P["case_w"] / 2.0 - 0.03), P["shoulder"][1], P["shoulder"][2]))
    hd = Vector((P["hand"][0] * sx, P["hand"][1], P["hand"][2]))
    # tramo recto de salida: si es corto, el brazo se curva dentro del
    # embudo y deja media luna sin tapar
    p1 = sh + nx * P.get("arm_exit", 0.12)
    d = hd - p1
    axis = d.normalized()

    # Perfil (radio, altura) normalizado. Denso cerca del borde para que
    # muera tangente a la pared en vez de acabar en arista de platillo.
    prof = [(P["collar_r"] * u, P["collar_h"] * v) for u, v in
            # sube hasta la cresta en u~0.53 y luego BAJA hacia el cuello:
            # el centro se hunde en embudo, no se levanta en anillo
            ((1.000, -0.16), (0.995, 0.05), (0.960, 0.24), (0.900, 0.46),
             (0.820, 0.66), (0.720, 0.83), (0.620, 0.95), (0.530, 1.00),
             (0.468, 0.97), (0.422, 0.90), (0.392, 0.80))]
    ball = collar("TO_Shoulder_" + side, prof,
                  (sx * (P["case_w"] / 2.0 - 0.005), P["shoulder"][1], P["shoulder"][2]),
                  (sx, 0.0, 0.0), TO, M_METAL)

    # Brazo curvo: 3 puntos de control, el intermedio desplazado hacia fuera
    bow = Vector((P["arm_bow"][0] * sx, P["arm_bow"][1], P["arm_bow"][2]))
    mid = sh + d * 0.5 + bow
    arm = tube("TO_Arm_" + side,
               [sh, p1, p1 + d * 0.42 + bow, p1 + d * 0.78 + bow * 0.55, hd],
               [1.20, 1.08, 1.0, 0.95, 1.0], P["arm_r"], TO, M_METAL)
    set_origin(arm, sh)
    reparent(ball, body)

    wrist = sph("TO_Wrist_" + side, P["wrist_r"], hd, TO, M_METAL)
    set_origin(wrist, hd)
    reparent(wrist, arm)

    # Pinza de cangrejo: dos arcos opuestos, bisagra en el centro de la muneca
    w = axis.cross(Vector((0.0, 1.0, 0.0)))
    if w.length < 1e-4:
        w = axis.cross(Vector((1.0, 0.0, 0.0)))
    w.normalize()
    for k, sgn in (("A", 1), ("B", -1)):
        pts = claw_arc(hd, axis, w, sgn, P["wrist_r"])
        radii = [1.0 - (1.0 - P["claw_taper"]) * (m / (len(pts) - 1)) for m in range(len(pts))]
        fing = tube("TO_Claw_" + side + "_" + k, pts, radii,
                    P.get("claw_r_base", 0.024), TO, M_METAL, res_u=4, bev_res=2,
                    profile=claw_prof)
        set_origin(fing, hd)
        reparent(fing, wrist)

    arm_roots.append(arm)

bpy.data.objects.remove(claw_prof, do_unlink=True)

_parts = [shell, rear, front, glass, screen, chin, emitter, socket, shaft]
for ob in [o for o in _parts if o is not None] + arm_roots:
    reparent(ob, body)

# --------------------------------------------------------- validacion
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
tris = 0; names = []
for ob in TO.objects:
    if ob.type != "MESH":
        continue
    names.append(ob.name)
    ev = ob.evaluated_get(dg); me = ev.to_mesh()
    tris += sum(len(p.vertices) - 2 for p in me.polygons)
    ev.to_mesh_clear()

BUILD_RESULT = {
    "objetos": len(names),
    "nombres_sucios": [n for n in names if "." in n],
    "triangulos": tris,
    "altura_total_m": round(Z_CASE_TOP + P["ant_socket_h"] / 2.0
                            + P["ant_shaft_h"] + P["ant_bulb_r"] * 1.3, 3),
    "profundidad_m": P["case_d"],
    "ratio_prof_ancho": round(P["case_d"] / P["case_w"], 2),
}
